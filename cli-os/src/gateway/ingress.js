// OpenAI-compatible ingress. Wires the full request path:
//   auth -> PEP reserve -> route -> memory inject -> adapter call -> cost meter -> PEP commit -> ledger
// Streaming and non-streaming; retries are idempotency-aware (never retried after the first byte
// has been flushed to the client).
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

function sendJson(res, status, obj) {
  const b = Buffer.from(JSON.stringify(obj));
  res.writeHead(status, { 'content-type': 'application/json', 'content-length': b.length });
  res.end(b);
}
function oaiError(res, status, message, type = 'invalid_request_error', code = null) {
  sendJson(res, status, { error: { message, type, code, param: null } });
}

function readBody(req, limit = 8 * 1024 * 1024) {
  return new Promise((resolve, reject) => {
    let size = 0; const chunks = [];
    req.on('data', (c) => { size += c.length; if (size > limit) { reject(new Error('payload too large')); req.destroy(); } else chunks.push(c); });
    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
    req.on('error', reject);
  });
}

function principalFrom(db, req) {
  const auth = req.headers['authorization'] || '';
  const m = /^Bearer\s+(.+)$/i.exec(auth);
  if (!m) return null;
  return verifyToken(db, m[1]);
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
    referenced_paths: paths,
    recent_tool_calls: toolNames,
  };
}

async function providerFetch(url, headers, body, { stream, timeoutMs }) {
  const ac = new AbortController();
  const to = setTimeout(() => ac.abort(), timeoutMs);
  try {
    const r = await fetch(url, { method: 'POST', headers, body: JSON.stringify(body), signal: ac.signal });
    return r;
  } finally { clearTimeout(to); }
}

const isRetryable = (status) => status === 429 || status === 408 || status >= 500;

// -------- non-streaming --------
async function callNonStream(adapter, { provider, model, openaiReq, apiKey, cfg }) {
  if (adapter.direct) return adapter.directFull(openaiReq, model); // mock: no network
  const body = adapter.buildRequest({ model, openaiReq, stream: false });
  const url = adapter.url(provider.base_url);
  const headers = adapter.headers(apiKey);
  let lastErr;
  for (let attempt = 0; attempt < cfg.retry.maxAttempts; attempt++) {
    try {
      const r = await providerFetch(url, headers, body, { stream: false, timeoutMs: cfg.requestTimeoutMs });
      if (r.ok) { const json = await r.json(); return adapter.parseFull(json, model); }
      const errText = await r.text().catch(() => '');
      if (!isRetryable(r.status)) throw router.httpError(r.status, `upstream ${provider.name} ${r.status}: ${errText.slice(0, 300)}`, 'upstream_error');
      lastErr = router.httpError(502, `upstream ${provider.name} ${r.status}`, 'upstream_error');
    } catch (e) {
      if (e.status && !isRetryable(e.status)) throw e; // non-retryable pre-boundary
      lastErr = e;
    }
    await new Promise((res) => setTimeout(res, Math.min(cfg.retry.baseMs * 2 ** attempt, cfg.retry.maxMs)));
  }
  throw lastErr || router.httpError(502, 'upstream failed', 'upstream_error');
}

// -------- SSE parsing for provider streams --------
function* parseSSE(buffer) {
  const parts = buffer.split('\n\n');
  for (let i = 0; i < parts.length - 1; i++) {
    const block = parts[i];
    let event = null; const dataLines = [];
    for (const line of block.split('\n')) {
      if (line.startsWith('event:')) event = line.slice(6).trim();
      else if (line.startsWith('data:')) dataLines.push(line.slice(5).trim());
    }
    if (dataLines.length) yield { event, data: dataLines.join('\n') };
  }
}

async function streamResponse(res, adapter, { provider, model, openaiReq, apiKey, cfg }) {
  res.writeHead(200, { 'content-type': 'text/event-stream; charset=utf-8', 'cache-control': 'no-cache, no-transform', connection: 'keep-alive' });
  let usage = null, firstByte = false;
  const write = (chunk) => { res.write(`data: ${JSON.stringify(chunk)}\n\n`); firstByte = true; };

  if (adapter.direct) {
    for await (const ev of adapter.directStream(openaiReq, model)) {
      if (ev.chunk) write(ev.chunk);
      if (ev.usage) usage = ev.usage;
    }
    res.write('data: [DONE]\n\n'); res.end();
    return { usage: usage || { prompt_tokens: 0, completion_tokens: 0, cache_read_tokens: 0, cache_write_tokens: 0 }, firstByte };
  }

  const body = adapter.buildRequest({ model, openaiReq, stream: true });
  const url = adapter.url(provider.base_url);
  const headers = adapter.headers(apiKey);

  // Retry connection ONLY before the first byte is flushed (idempotency boundary).
  let attempt = 0, connected = null;
  while (attempt < cfg.retry.maxAttempts && !firstByte) {
    try {
      const r = await providerFetch(url, headers, body, { stream: true, timeoutMs: cfg.requestTimeoutMs });
      if (r.ok) { connected = r; break; }
      const t = await r.text().catch(() => '');
      if (!isRetryable(r.status)) throw router.httpError(r.status, `upstream ${provider.name} ${r.status}: ${t.slice(0, 200)}`, 'upstream_error');
    } catch (e) {
      if (e.status && !isRetryable(e.status)) throw e;
    }
    attempt++;
    await new Promise((res2) => setTimeout(res2, Math.min(cfg.retry.baseMs * 2 ** attempt, cfg.retry.maxMs)));
  }
  if (!connected) throw router.httpError(502, `upstream ${provider.name} failed to connect`, 'upstream_error');

  const st = adapter.newStreamState(model);
  const reader = connected.body.getReader();
  const decoder = new TextDecoder();
  let buf = '';
  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    buf += decoder.decode(value, { stream: true });
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
}

// -------- main handler --------
export async function handleChatCompletion(ctx, req, res) {
  const { db, cfg, aliases } = ctx;
  const requestId = rid('req');
  res.setHeader('x-l00prite-request-id', requestId);

  const principal = principalFrom(db, req);
  if (!principal) return oaiError(res, 401, 'Missing or invalid l00prite token', 'authentication_error');

  let openaiReq;
  try { openaiReq = JSON.parse(await readBody(req)); } catch { return oaiError(res, 400, 'Invalid JSON body'); }
  if (!Array.isArray(openaiReq.messages)) return oaiError(res, 400, '"messages" is required');

  // repo scope + memory
  const repoId = req.headers['x-l00prite-repo'] || principal.repo || null;
  let repoRoot = null;
  if (repoId) {
    const repo = db.prepare(`SELECT * FROM repos WHERE id = ?`).get(repoId);
    if (repo) {
      if (repo.project !== principal.project) return oaiError(res, 403, `Token not scoped to repo "${repoId}"`, 'permission_error');
      repoRoot = repo.root;
    }
  }

  // route
  let route;
  try {
    route = router.pick({ providers: listProviders(db), aliases, openaiReq, routeHeader: req.headers['x-l00prite-route'] });
  } catch (e) { return oaiError(res, e.status || 400, e.message, e.type); }
  const provRow = db.prepare(`SELECT * FROM providers WHERE name = ?`).get(route.provider);
  const adapter = adapterFor(provRow.adapter);

  // PEP reservation (before any spend)
  const ceiling = meter.reservationCeiling(route.provider, route.model, openaiReq);
  const resv = pep.reserve(db, { project: principal.project, amountUsd: ceiling, defaultCap: cfg.defaultDailyCapUsd });
  if (!resv.ok) {
    res.setHeader('x-l00prite-cap-usd', String(resv.cap));
    ledger.append(db, cfg, { request_id: requestId, project: principal.project, repo: repoId, provider: route.provider, model: route.model, rule_id: route.decision.rule_id, decision: route.decision, outcome: 'denied_cost_cap' });
    return oaiError(res, 402, `Daily cost cap reached ($${resv.spent.toFixed(4)} of $${resv.cap.toFixed(2)}). Raise the cap with "l00prite cap set" or wait for the UTC-day reset.`, 'insufficient_quota', 'cost_cap');
  }

  const mem = repoRoot ? memory.query({ repoRoot, requestDigest: digestFrom(openaiReq, req), budgets: { contextTokens: cfg.memory.contextTokens }, options: {} }) : { status: 'empty', blocks: [] };
  const finalReq = injectMemory(openaiReq, mem);

  // key
  let apiKey = null;
  if (!adapter.direct) {
    if (!provRow.enc_key) { pep.refund(db, resv.reservationId); return oaiError(res, 500, `Provider "${route.provider}" has no API key configured`, 'configuration_error'); }
    try { apiKey = decryptSecret(cfg, provRow.enc_key); } catch { pep.refund(db, resv.reservationId); return oaiError(res, 500, 'Failed to decrypt provider key', 'configuration_error'); }
  }

  const stream = openaiReq.stream === true;
  try {
    if (stream) {
      const { usage } = await streamResponse(res, adapter, { provider: provRow, model: route.model, openaiReq: finalReq, apiKey, cfg });
      const cost = meter.costOf(route.provider, route.model, usage);
      pep.commit(db, resv.reservationId, cost.usd);
      router.markSuccess(route.provider);
      ledger.append(db, cfg, { request_id: requestId, project: principal.project, repo: repoId, provider: route.provider, model: route.model, rule_id: route.decision.rule_id, decision: route.decision, usage, cost_usd: cost.usd, cost_estimated: cost.estimated, memory_status: mem.status, outcome: 'ok' });
    } else {
      const { openaiResponse, usage } = await callNonStream(adapter, { provider: provRow, model: route.model, openaiReq: finalReq, apiKey, cfg });
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
      // stream already started: cannot retry or reshape; close and record.
      pep.commit(db, resv.reservationId, 0);
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
  const { db } = ctx;
  const providers = listProviders(db).filter((p) => p.enabled);
  const data = [];
  for (const p of providers) {
    for (const id of modelsFor(p.name)) data.push({ id, object: 'model', owned_by: p.name });
    for (const id of modelsFor(p.name)) data.push({ id: `${p.name}/${id}`, object: 'model', owned_by: p.name });
  }
  sendJson(res, 200, { object: 'list', data });
}

export function handleHealth(ctx, req, res) {
  const { db } = ctx;
  const providers = listProviders(db).map((p) => ({ name: p.name, enabled: !!p.enabled, default: !!p.is_default, circuit_open: router.isTripped(p.name), has_key: !!p.enc_key || p.adapter === 'mock' }));
  sendJson(res, 200, { status: 'ok', version: '1.0.0', providers });
}
