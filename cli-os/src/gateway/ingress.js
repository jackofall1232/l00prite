// OpenAI-compatible ingress. Wires the full request path:
//   auth -> route -> repo/memory -> reserve (post-injection, bounded) -> adapter call -> meter -> commit -> ledger
// Streaming and non-streaming; retries are idempotency-aware (never retried after the first byte
// has been flushed to the client); upstream calls abort on client disconnect and on timeout that
// also covers body/stream reads.
import { verifyToken } from '../security/tokens.js';
import { decryptSecret } from '../security/vault.js';
import * as pep from '../policy/pep.js';
import * as router from './router.js';
import * as meter from './meter.js';
import * as memory from '../memory/memory.js';
import { injectMemory } from './inject.js';
import { adapterFor, modelsFor } from './adapters/registry.js';
import * as ledger from '../ledger/ledger.js';
import { rid } from '../util.js';

const ZERO = { prompt_tokens: 0, completion_tokens: 0, cache_read_tokens: 0, cache_write_tokens: 0 };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const isRetryable = (status) => status === 429 || status === 408 || status >= 500;

function sendJson(res, status, obj) {
  const b = Buffer.from(JSON.stringify(obj));
  res.writeHead(status, { 'content-type': 'application/json', 'content-length': b.length });
  res.end(b);
}
function oaiError(res, status, message, type = 'invalid_request_error', code = null) {
  if (res.headersSent) { try { res.end(); } catch { /* closed */ } return; }
  sendJson(res, status, { error: { message, type, code, param: null } });
}

function readBody(req, limit = 8 * 1024 * 1024) {
  return new Promise((resolve, reject) => {
    let size = 0, tooBig = false; const chunks = [];
    req.on('data', (c) => {
      if (tooBig) return;
      size += c.length;
      if (size > limit) {
        tooBig = true;
        const e = new Error('payload_too_large'); e.code = 'payload_too_large';
        reject(e);
        req.resume(); // drain (don't destroy) so the 413 response can still be delivered
        return;
      }
      chunks.push(c);
    });
    req.on('end', () => { if (!tooBig) resolve(Buffer.concat(chunks).toString('utf8')); });
    req.on('error', reject);
  });
}

function principalFrom(db, req) {
  const m = /^Bearer\s+(.+)$/i.exec(req.headers['authorization'] || '');
  return m ? verifyToken(db, m[1]) : null;
}
function listProviders(db) {
  return db.prepare(`SELECT name, adapter, base_url, enc_key, enabled, is_default FROM providers ORDER BY is_default DESC, name`).all();
}

function digestFrom(openaiReq, req) {
  const lastUser = [...(openaiReq.messages || [])].reverse().find((m) => m.role === 'user');
  const paths = String(req.headers['x-l00prite-paths'] || '').split(',').map((s) => s.trim()).filter(Boolean);
  const toolNames = (openaiReq.messages || []).flatMap((m) => (m.tool_calls || []).map((t) => t.function?.name)).filter(Boolean);
  return {
    user_intent: typeof lastUser?.content === 'string' ? lastUser.content : JSON.stringify(lastUser?.content || ''),
    referenced_paths: paths, recent_tool_calls: toolNames,
  };
}

// Returns { promise, cleanup }. cleanup() clears the timeout — call it only AFTER the response
// body/stream has been fully consumed, so a stalled body still aborts on timeout. Aborts on
// client disconnect too.
function providerFetch(url, headers, body, { timeoutMs, clientSignal }) {
  const ac = new AbortController();
  const timer = setTimeout(() => ac.abort(new Error('provider_timeout')), timeoutMs);
  const onClientAbort = () => ac.abort(new Error('client_disconnected'));
  if (clientSignal) {
    if (clientSignal.aborted) ac.abort();
    else clientSignal.addEventListener('abort', onClientAbort, { once: true });
  }
  const cleanup = () => { clearTimeout(timer); clientSignal?.removeEventListener?.('abort', onClientAbort); };
  const promise = fetch(url, { method: 'POST', headers, body: JSON.stringify(body), signal: ac.signal });
  return { promise, cleanup };
}

// -------- non-streaming --------
async function callNonStream(adapter, { provider, model, openaiReq, apiKey, cfg, clientSignal }) {
  if (adapter.direct) return adapter.directFull(openaiReq, model); // mock: no network
  const body = adapter.buildRequest({ model, openaiReq, stream: false });
  const url = adapter.url(provider.base_url);
  const headers = adapter.headers(apiKey);
  let lastErr;
  for (let attempt = 0; attempt < cfg.retry.maxAttempts; attempt++) {
    const { promise, cleanup } = providerFetch(url, headers, body, { timeoutMs: cfg.requestTimeoutMs, clientSignal });
    try {
      const r = await promise;
      if (r.ok) return adapter.parseFull(await r.json(), model);
      const errText = await r.text().catch(() => '');
      if (!isRetryable(r.status)) throw router.httpError(r.status, `upstream ${provider.name} ${r.status}: ${errText.slice(0, 300)}`, 'upstream_error');
      lastErr = router.httpError(502, `upstream ${provider.name} ${r.status}`, 'upstream_error');
    } catch (e) {
      if (clientSignal?.aborted) throw router.httpError(499, 'client closed request', 'client_closed');
      if (e.status && !isRetryable(e.status)) throw e;
      lastErr = e;
    } finally { cleanup(); }
    await sleep(Math.min(cfg.retry.baseMs * 2 ** attempt, cfg.retry.maxMs));
  }
  throw lastErr || router.httpError(502, 'upstream failed', 'upstream_error');
}

// -------- SSE parsing (buffer is already CRLF-normalized to \n) --------
function* parseSSE(buffer) {
  const parts = buffer.split('\n\n');
  for (let i = 0; i < parts.length - 1; i++) {
    let event = null; const dataLines = [];
    for (const line of parts[i].split('\n')) {
      if (line.startsWith('event:')) event = line.slice(6).trim();
      else if (line.startsWith('data:')) dataLines.push(line.slice(5).trim());
    }
    if (dataLines.length) yield { event, data: dataLines.join('\n') };
  }
}

async function streamResponse(res, adapter, { provider, model, openaiReq, apiKey, cfg, clientSignal, forwardUsage }) {
  let usage = null, firstByte = false;
  const writeHead = () => res.writeHead(200, { 'content-type': 'text/event-stream; charset=utf-8', 'cache-control': 'no-cache, no-transform', connection: 'keep-alive' });
  const write = (chunk) => { res.write(`data: ${JSON.stringify(chunk)}\n\n`); firstByte = true; };

  if (adapter.direct) {
    writeHead();
    for await (const ev of adapter.directStream(openaiReq, model)) { if (ev.chunk) write(ev.chunk); if (ev.usage) usage = ev.usage; }
    res.write('data: [DONE]\n\n'); res.end();
    return { usage: usage || ZERO, firstByte };
  }

  const body = adapter.buildRequest({ model, openaiReq, stream: true });
  const url = adapter.url(provider.base_url);
  const headers = adapter.headers(apiKey);

  // Connect (with retry) BEFORE writing the 200 — a pre-first-byte failure must surface as a
  // proper error + refund, not a silent empty 200 stream.
  let connected = null, connCleanup = () => {};
  for (let attempt = 0; attempt < cfg.retry.maxAttempts; attempt++) {
    const { promise, cleanup } = providerFetch(url, headers, body, { timeoutMs: cfg.requestTimeoutMs, clientSignal });
    try {
      const r = await promise;
      if (r.ok) { connected = r; connCleanup = cleanup; break; }
      const t = await r.text().catch(() => ''); cleanup();
      if (!isRetryable(r.status)) throw router.httpError(r.status, `upstream ${provider.name} ${r.status}: ${t.slice(0, 200)}`, 'upstream_error');
    } catch (e) {
      cleanup();
      if (clientSignal?.aborted) throw router.httpError(499, 'client closed request', 'client_closed');
      if (e.status && !isRetryable(e.status)) throw e;
    }
    await sleep(Math.min(cfg.retry.baseMs * 2 ** attempt, cfg.retry.maxMs));
  }
  if (!connected) throw router.httpError(502, `upstream ${provider.name} failed to connect`, 'upstream_error');

  writeHead();
  const st = adapter.newStreamState(model, { forwardUsage });
  const reader = connected.body.getReader();
  const decoder = new TextDecoder();
  let buf = '';
  try {
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      buf += decoder.decode(value, { stream: true });
      buf = buf.replace(/\r\n/g, '\n'); // normalize CRLF (handles boundary splits) before framing
      const lastBreak = buf.lastIndexOf('\n\n');
      if (lastBreak === -1) continue;
      const ready = buf.slice(0, lastBreak + 2); buf = buf.slice(lastBreak + 2);
      for (const ev of parseSSE(ready)) {
        const out = adapter.onEvent(st, ev);
        if (out.usage) usage = out.usage;
        for (const chunk of out.deltas || []) write(chunk);
        if (out.done) { res.write('data: [DONE]\n\n'); res.end(); return { usage: usage || st.usage, firstByte }; }
      }
    }
    res.write('data: [DONE]\n\n'); res.end();
    return { usage: usage || st.usage, firstByte };
  } finally { connCleanup(); }
}

// -------- main handler --------
export async function handleChatCompletion(ctx, req, res) {
  const { db, cfg, aliases } = ctx;
  const requestId = rid('req');
  res.setHeader('x-l00prite-request-id', requestId);

  // Abort upstream work if the client disconnects (don't keep burning provider tokens).
  const clientAbort = new AbortController();
  res.on('close', () => { if (!res.writableFinished) clientAbort.abort(); });
  const clientSignal = clientAbort.signal;

  const principal = principalFrom(db, req);
  if (!principal) return oaiError(res, 401, 'Missing or invalid l00prite token', 'authentication_error');

  let openaiReq;
  try { openaiReq = JSON.parse(await readBody(req)); }
  catch (e) {
    if (e.code === 'payload_too_large') return oaiError(res, 413, 'Request payload too large', 'invalid_request_error');
    return oaiError(res, 400, 'Invalid JSON body');
  }
  if (!Array.isArray(openaiReq.messages)) return oaiError(res, 400, '"messages" is required');

  // Repo scope: a repo-scoped token cannot be widened by the header; an unregistered repo is 404.
  const headerRepo = req.headers['x-l00prite-repo'];
  let repoId = principal.repo || null;
  if (headerRepo) {
    if (principal.repo && headerRepo !== principal.repo) return oaiError(res, 403, `Token is scoped to repo "${principal.repo}"; it cannot request "${headerRepo}"`, 'permission_error');
    repoId = headerRepo;
  }
  let repoRoot = null;
  if (repoId) {
    const repo = db.prepare(`SELECT * FROM repos WHERE id = ?`).get(repoId);
    if (!repo) return oaiError(res, 404, `Repository "${repoId}" is not registered`, 'invalid_request_error');
    if (repo.project !== principal.project) return oaiError(res, 403, `Token not scoped to repo "${repoId}"`, 'permission_error');
    repoRoot = repo.root;
  }

  // Route.
  let route;
  try { route = router.pick({ providers: listProviders(db), aliases, openaiReq, routeHeader: req.headers['x-l00prite-route'] }); }
  catch (e) { return oaiError(res, e.status || 400, e.message, e.type); }
  const provRow = db.prepare(`SELECT * FROM providers WHERE name = ?`).get(route.provider);
  const adapter = adapterFor(provRow.adapter);

  // Provider config checks BEFORE reserving budget.
  let apiKey = null;
  if (!adapter.direct) {
    if (!provRow.base_url) return oaiError(res, 500, `Provider "${route.provider}" has no base URL configured`, 'configuration_error');
    if (!provRow.enc_key) return oaiError(res, 500, `Provider "${route.provider}" has no API key configured`, 'configuration_error');
    try { apiKey = decryptSecret(cfg, provRow.enc_key); } catch { return oaiError(res, 500, 'Failed to decrypt provider key', 'configuration_error'); }
  }

  // Memory injection, THEN reservation — the reservation ceiling must reflect the real prompt
  // (post-injection) and a bounded output, so a low cap cannot be silently exceeded.
  const mem = repoRoot
    ? memory.query({ repoRoot, requestDigest: digestFrom(openaiReq, req), budgets: { contextTokens: cfg.memory.contextTokens, maxFileBytes: cfg.memory.maxFileBytes }, options: {} })
    : { status: 'empty', blocks: [] };
  const maxOut = openaiReq.max_tokens || openaiReq.max_completion_tokens || cfg.defaultMaxTokens;
  const finalReq = { ...injectMemory(openaiReq, mem), max_tokens: maxOut };
  const forwardUsage = !!openaiReq.stream_options?.include_usage;

  const ceiling = meter.reservationCeiling(route.provider, route.model, finalReq);
  const resv = pep.reserve(db, { project: principal.project, amountUsd: ceiling, defaultCap: cfg.defaultDailyCapUsd });
  if (!resv.ok) {
    if (resv.reason === 'cost_cap') res.setHeader('x-l00prite-cap-usd', String(resv.cap));
    ledger.append(db, cfg, { request_id: requestId, project: principal.project, repo: repoId, provider: route.provider, model: route.model, rule_id: route.decision.rule_id, decision: route.decision, outcome: `denied_${resv.reason}` });
    const msg = resv.reason === 'cost_cap'
      ? `Daily cost cap reached ($${resv.spent.toFixed(4)} of $${resv.cap.toFixed(2)}). Raise it with "l00prite cap set" or wait for the UTC-day reset.`
      : 'Request denied by policy';
    return oaiError(res, 402, msg, 'insufficient_quota', resv.reason);
  }

  const stream = openaiReq.stream === true;
  try {
    if (stream) {
      const { usage } = await streamResponse(res, adapter, { provider: provRow, model: route.model, openaiReq: finalReq, apiKey, cfg, clientSignal, forwardUsage });
      const cost = meter.costOf(route.provider, route.model, usage);
      pep.commit(db, resv.reservationId, cost.usd);
      router.markSuccess(route.provider);
      ledger.append(db, cfg, { request_id: requestId, project: principal.project, repo: repoId, provider: route.provider, model: route.model, rule_id: route.decision.rule_id, decision: route.decision, usage, cost_usd: cost.usd, cost_estimated: cost.estimated, memory_status: mem.status, outcome: 'ok' });
    } else {
      const { openaiResponse, usage } = await callNonStream(adapter, { provider: provRow, model: route.model, openaiReq: finalReq, apiKey, cfg, clientSignal });
      const cost = meter.costOf(route.provider, route.model, usage);
      pep.commit(db, resv.reservationId, cost.usd);
      router.markSuccess(route.provider);
      ledger.append(db, cfg, { request_id: requestId, project: principal.project, repo: repoId, provider: route.provider, model: route.model, rule_id: route.decision.rule_id, decision: route.decision, usage, cost_usd: cost.usd, cost_estimated: cost.estimated, memory_status: mem.status, outcome: 'ok' });
      res.setHeader('x-l00prite-provider', route.provider);
      res.setHeader('x-l00prite-cost-usd', cost.usd.toFixed(6));
      sendJson(res, 200, openaiResponse);
    }
  } catch (e) {
    router.markFailure(route.provider);
    if (res.headersSent) {
      pep.commit(db, resv.reservationId, 0); // stream already started; nothing more to bill
      ledger.append(db, cfg, { request_id: requestId, project: principal.project, repo: repoId, provider: route.provider, model: route.model, rule_id: route.decision.rule_id, decision: route.decision, memory_status: mem.status, outcome: 'error_midstream' });
      try { res.end(); } catch { /* already closed */ }
    } else {
      pep.refund(db, resv.reservationId);
      ledger.append(db, cfg, { request_id: requestId, project: principal.project, repo: repoId, provider: route.provider, model: route.model, rule_id: route.decision.rule_id, decision: route.decision, memory_status: mem.status, outcome: 'error' });
      oaiError(res, e.status || 502, e.message || 'Upstream error', e.type || 'upstream_error');
    }
  }
}

export function handleModels(ctx, req, res) {
  const providers = listProviders(ctx.db).filter((p) => p.enabled);
  const data = [];
  for (const p of providers) {
    for (const id of modelsFor(p.name)) { data.push({ id, object: 'model', owned_by: p.name }); data.push({ id: `${p.name}/${id}`, object: 'model', owned_by: p.name }); }
  }
  sendJson(res, 200, { object: 'list', data });
}

export function handleHealth(ctx, req, res) {
  const providers = listProviders(ctx.db).map((p) => ({ name: p.name, enabled: !!p.enabled, default: !!p.is_default, circuit_open: router.isTripped(p.name), has_key: !!p.enc_key || p.adapter === 'mock' }));
  sendJson(res, 200, { status: 'ok', version: '1.0.0', providers });
}
