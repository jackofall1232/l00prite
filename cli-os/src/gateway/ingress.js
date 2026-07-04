// OpenAI-compatible ingress. Dispatches a request to one of four paths, all sharing the same
// route/reserve/meter/commit/ledger machinery via runTurn (turn.js) and upstream.js:
//   - dry-run   (x-l00prite-dry-run): return the routing decision only, no spend, no upstream call
//   - bridge    (armed): buffered bounded delegation loop (bridge.js), then respond
//   - streaming (non-bridge): incremental SSE straight from the provider
//   - default   (non-bridge, non-stream): one runTurn
// Streaming and non-streaming retries are idempotency-aware (never retried after the first byte is
// flushed); upstream calls abort on client disconnect and on timeout.
import { verifyToken } from '../security/tokens.js';
import { decryptSecret } from '../security/vault.js';
import * as pep from '../policy/pep.js';
import * as router from './router.js';
import * as meter from './meter.js';
import * as memory from '../memory/memory.js';
import { injectMemory } from './inject.js';
import { adapterFor, modelsFor } from './adapters/registry.js';
import { cmplId, openaiChunk } from './adapters/base.js';
import * as ledger from '../ledger/ledger.js';
import { rid } from '../util.js';
import { providerFetch, parseSSE, sleep, isRetryable } from './upstream.js';
import { runTurn, listProviders, digestFrom } from './turn.js';
import { isBridgeArmed, bridgeMaxHops, runBridge } from './bridge.js';

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
const truthyHeader = (v) => ['1', 'on', 'true', 'yes'].includes(String(v ?? '').trim().toLowerCase());

// A routing throw (unknown provider, or an auto request no model can satisfy) is a real routing
// decision and must reach the ledger — otherwise "every decision is logged" breaks the moment
// auto-mode denials become common (the pre-existing gap Fable flagged).
function logRouteError(ctx, { requestId, project, repoId, e }) {
  const decision = e.decision || { rule_id: 'route_error', reason: e.message };
  try {
    ledger.append(ctx.db, ctx.cfg, { request_id: requestId, project, repo: repoId, rule_id: decision.rule_id, decision, outcome: 'denied_route' });
  } catch { /* ledger is best-effort here */ }
}

// -------- streaming (non-bridge) --------
async function streamResponse(res, adapter, { provider, model, openaiReq, apiKey, cfg, clientSignal, forwardUsage }) {
  let usage = null, firstByte = false;
  const writeHead = () => res.writeHead(200, { 'content-type': 'text/event-stream; charset=utf-8', 'cache-control': 'no-cache, no-transform', connection: 'keep-alive' });
  const write = (chunk) => { res.write(`data: ${JSON.stringify(chunk)}\n\n`); firstByte = true; };

  if (adapter.direct) {
    writeHead();
    for await (const ev of adapter.directStream(openaiReq, model)) { if (ev.chunk) write(ev.chunk); if (ev.usage) usage = ev.usage; }
    res.write('data: [DONE]\n\n'); res.end();
    return { usage: usage || { prompt_tokens: 0, completion_tokens: 0, cache_read_tokens: 0, cache_write_tokens: 0 }, firstByte };
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

// Synthesize a client-facing SSE stream from an already-complete (buffered) response. Used by the
// bridge path when the client asked for streaming: intermediate delegation turns are NEVER leaked;
// only the final answer is streamed.
function synthesizeStream(res, finalResponse) {
  res.writeHead(200, { 'content-type': 'text/event-stream; charset=utf-8', 'cache-control': 'no-cache, no-transform', connection: 'keep-alive' });
  const choice = finalResponse.choices?.[0] || {};
  const msg = choice.message || {};
  const id = finalResponse.id || cmplId();
  const model = finalResponse.model;
  const write = (chunk) => res.write(`data: ${JSON.stringify(chunk)}\n\n`);
  write(openaiChunk({ id, model, delta: { role: 'assistant', content: '' } }));
  if (typeof msg.content === 'string' && msg.content.length) write(openaiChunk({ id, model, delta: { content: msg.content } }));
  if (Array.isArray(msg.tool_calls) && msg.tool_calls.length) {
    msg.tool_calls.forEach((tc, i) => write(openaiChunk({ id, model, delta: { tool_calls: [{ index: i, id: tc.id, type: 'function', function: { name: tc.function?.name, arguments: tc.function?.arguments || '' } }] } })));
  }
  write(openaiChunk({ id, model, delta: {}, finishReason: choice.finish_reason || 'stop' }));
  res.write('data: [DONE]\n\n'); res.end();
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

  const project = principal.project;
  const routeHeader = req.headers['x-l00prite-route'];
  const paths = String(req.headers['x-l00prite-paths'] || '').split(',').map((s) => s.trim()).filter(Boolean);
  const dryRun = truthyHeader(req.headers['x-l00prite-dry-run']);
  const armed = !dryRun && isBridgeArmed(req.headers, cfg);
  const stream = openaiReq.stream === true;

  // ---- Path 1: dry-run route plan (no spend, no upstream). Great for `route plan` / debugging. ----
  if (dryRun) {
    let route;
    try { route = router.pick({ providers: listProviders(db), aliases, openaiReq, routeHeader, cfg }); }
    catch (e) { logRouteError(ctx, { requestId, project, repoId, e }); return oaiError(res, e.status || 400, e.message, e.type, e.code); }
    return sendJson(res, 200, {
      object: 'l00prite.route_plan', request_id: requestId,
      would_route: { provider: route.provider, model: route.model },
      decision: route.decision,
      bridge: { armed: isBridgeArmed(req.headers, cfg), max_hops: bridgeMaxHops(req.headers, cfg) },
    });
  }

  // ---- Path 2: bridge (buffered bounded delegation loop) ----
  if (armed) {
    const maxHops = bridgeMaxHops(req.headers, cfg);
    let result;
    try {
      result = await runBridge(ctx, { requestId, project, repoId, repoRoot, openaiReq, routeHeader, clientSignal, maxHops });
    } catch (e) {
      logRouteError(ctx, { requestId, project, repoId, e });
      return oaiError(res, e.status || 502, e.message || 'Bridge error', e.type || 'upstream_error', e.code);
    }
    if (result.denied) {
      if (result.denied.reason === 'cost_cap') res.setHeader('x-l00prite-cap-usd', String(result.denied.cap));
      const msg = result.denied.reason === 'cost_cap'
        ? `Daily cost cap reached mid-bridge after ${result.subCalls} delegation(s) and $${result.totalCostUsd.toFixed(4)} committed. Raise it with "l00prite cap set" or wait for the UTC-day reset.`
        : 'Request denied by policy';
      return oaiError(res, 402, msg, 'insufficient_quota', result.denied.code || result.denied.reason);
    }
    res.setHeader('x-l00prite-bridge-hops', String(result.subCalls));
    res.setHeader('x-l00prite-cost-usd', result.totalCostUsd.toFixed(6));
    const primary = result.hops.find((h) => h.kind === 'primary');
    if (primary) res.setHeader('x-l00prite-provider', primary.provider);
    if (stream) return synthesizeStream(res, result.response);
    return sendJson(res, 200, result.response);
  }

  // ---- Path 3: streaming (non-bridge) ----
  if (stream) {
    let route;
    try { route = router.pick({ providers: listProviders(db), aliases, openaiReq, routeHeader, cfg }); }
    catch (e) { logRouteError(ctx, { requestId, project, repoId, e }); return oaiError(res, e.status || 400, e.message, e.type, e.code); }
    const provRow = db.prepare(`SELECT * FROM providers WHERE name = ?`).get(route.provider);
    const adapter = adapterFor(provRow.adapter);
    let apiKey = null;
    if (!adapter.direct) {
      if (!provRow.base_url) return oaiError(res, 500, `Provider "${route.provider}" has no base URL configured`, 'configuration_error');
      if (!provRow.enc_key) return oaiError(res, 500, `Provider "${route.provider}" has no API key configured`, 'configuration_error');
      try { apiKey = decryptSecret(cfg, provRow.enc_key); } catch { return oaiError(res, 500, 'Failed to decrypt provider key', 'configuration_error'); }
    }

    const mem = repoRoot
      ? memory.query({ repoRoot, requestDigest: digestFrom(openaiReq, paths), budgets: { contextTokens: cfg.memory.contextTokens, maxFileBytes: cfg.memory.maxFileBytes }, options: {} })
      : { status: 'empty', blocks: [] };
    const maxOut = openaiReq.max_tokens || openaiReq.max_completion_tokens || cfg.defaultMaxTokens;
    const finalReq = { ...injectMemory(openaiReq, mem), max_tokens: maxOut };
    const forwardUsage = !!openaiReq.stream_options?.include_usage;

    const ceiling = meter.reservationCeiling(route.provider, route.model, finalReq);
    const resv = pep.reserve(db, { project, amountUsd: ceiling, defaultCap: cfg.defaultDailyCapUsd });
    if (!resv.ok) {
      if (resv.reason === 'cost_cap') res.setHeader('x-l00prite-cap-usd', String(resv.cap));
      ledger.append(db, cfg, { request_id: requestId, project, repo: repoId, provider: route.provider, model: route.model, rule_id: route.decision.rule_id, decision: route.decision, outcome: `denied_${resv.reason}` });
      const msg = resv.reason === 'cost_cap'
        ? `Daily cost cap reached ($${resv.spent.toFixed(4)} of $${resv.cap.toFixed(2)}). Raise it with "l00prite cap set" or wait for the UTC-day reset.`
        : 'Request denied by policy';
      return oaiError(res, 402, msg, 'insufficient_quota', resv.reason);
    }
    try {
      const { usage } = await streamResponse(res, adapter, { provider: provRow, model: route.model, openaiReq: finalReq, apiKey, cfg, clientSignal, forwardUsage });
      const cost = meter.costOf(route.provider, route.model, usage);
      pep.commit(db, resv.reservationId, cost.usd);
      router.markSuccess(route.provider);
      ledger.append(db, cfg, { request_id: requestId, project, repo: repoId, provider: route.provider, model: route.model, rule_id: route.decision.rule_id, decision: route.decision, usage, cost_usd: cost.usd, cost_estimated: cost.estimated, memory_status: mem.status, outcome: 'ok' });
    } catch (e) {
      router.markFailure(route.provider);
      if (res.headersSent) {
        pep.commit(db, resv.reservationId, 0); // stream already started; nothing more to bill
        ledger.append(db, cfg, { request_id: requestId, project, repo: repoId, provider: route.provider, model: route.model, rule_id: route.decision.rule_id, decision: route.decision, memory_status: mem.status, outcome: 'error_midstream' });
        try { res.end(); } catch { /* already closed */ }
      } else {
        pep.refund(db, resv.reservationId);
        ledger.append(db, cfg, { request_id: requestId, project, repo: repoId, provider: route.provider, model: route.model, rule_id: route.decision.rule_id, decision: route.decision, memory_status: mem.status, outcome: 'error' });
        oaiError(res, e.status || 502, e.message || 'Upstream error', e.type || 'upstream_error');
      }
    }
    return;
  }

  // ---- Path 4: default (non-bridge, non-streaming) via the shared runTurn primitive ----
  let turn;
  try {
    turn = await runTurn(ctx, { project, repoId, repoRoot, openaiReq, routeHeader, clientSignal, requestId, paths, depth: 0, injectMemory: true });
  } catch (e) {
    logRouteError(ctx, { requestId, project, repoId, e });
    return oaiError(res, e.status || 502, e.message || 'Upstream error', e.type || 'upstream_error', e.code);
  }
  if (!turn.ok) {
    if (turn.denial.reason === 'cost_cap') res.setHeader('x-l00prite-cap-usd', String(turn.denial.cap));
    const msg = turn.denial.reason === 'cost_cap'
      ? `Daily cost cap reached ($${turn.denial.spent.toFixed(4)} of $${turn.denial.cap.toFixed(2)}). Raise it with "l00prite cap set" or wait for the UTC-day reset.`
      : 'Request denied by policy';
    return oaiError(res, 402, msg, 'insufficient_quota', turn.denial.code || turn.denial.reason);
  }
  res.setHeader('x-l00prite-provider', turn.route.provider);
  res.setHeader('x-l00prite-cost-usd', turn.cost.usd.toFixed(6));
  sendJson(res, 200, turn.openaiResponse);
}

export function handleModels(ctx, req, res) {
  const providers = listProviders(ctx.db).filter((p) => p.enabled);
  const data = [];
  for (const p of providers) {
    for (const id of modelsFor(p.name)) { data.push({ id, object: 'model', owned_by: p.name }); data.push({ id: `${p.name}/${id}`, object: 'model', owned_by: p.name }); }
  }
  // Advertise the auto profiles as selectable pseudo-models so tools can surface them.
  for (const name of Object.keys(ctx.cfg?.routing?.profiles || {})) data.push({ id: `auto:${name}`, object: 'model', owned_by: 'l00prite-auto' });
  data.push({ id: 'auto', object: 'model', owned_by: 'l00prite-auto' });
  sendJson(res, 200, { object: 'list', data });
}

export function handleHealth(ctx, req, res) {
  const providers = listProviders(ctx.db).map((p) => ({ name: p.name, enabled: !!p.enabled, default: !!p.is_default, circuit_open: router.isTripped(p.name), has_key: !!p.enc_key || p.adapter === 'mock' }));
  sendJson(res, 200, {
    status: 'ok', version: '1.0.0', providers,
    bridge: { enabled: !!ctx.cfg?.routing?.bridge?.enabled, max_hops: ctx.cfg?.routing?.bridge?.maxHops ?? 3 },
    auto_profiles: Object.keys(ctx.cfg?.routing?.profiles || {}),
  });
}
