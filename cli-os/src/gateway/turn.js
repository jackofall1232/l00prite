// runTurn — the single internal "one completion" primitive: route → (memory) → reserve → call →
// meter → commit → ledger, with NO HTTP concerns. Both the ingress non-streaming path and the
// bridge loop call this, so a delegated hop reuses the exact same money/ledger machinery as a
// top-level request. It is the one place the reserve/commit/refund state machine lives, which is
// why the riskiest part of bridging (per Fable) is localized and testable here rather than smeared
// across the loop.
//
// Contract:
//   { ok: true,  openaiResponse, usage, cost, route, memStatus }   — success (already committed)
//   { ok: false, denial: { status:402, reason, code, cap, spent } } — reservation denied (logged)
//   throws httpError                                                — routing/upstream error (refunded, logged)
import { decryptSecret } from '../security/vault.js';
import * as pep from '../policy/pep.js';
import * as router from './router.js';
import * as meter from './meter.js';
import * as memory from '../memory/memory.js';
import { injectMemory } from './inject.js';
import { adapterFor } from './adapters/registry.js';
import * as ledger from '../ledger/ledger.js';
import { callNonStream } from './upstream.js';

export function listProviders(db) {
  return db.prepare(`SELECT name, adapter, base_url, enc_key, enabled, is_default FROM providers ORDER BY is_default DESC, name`).all();
}

// Minimal, safe projection of the request for the Memory layer (never the raw prompt). The user
// intent is TEXT ONLY, capped — image parts become an "[image]" placeholder so a base64 data URI
// never bloats memory keywording or pulls raw attachment bytes into the memory layer.
const INTENT_CAP = 2000;
function userIntent(content) {
  if (typeof content === 'string') return content.slice(0, INTENT_CAP);
  if (Array.isArray(content)) {
    return content
      .map((p) => (p?.type === 'text' ? (p.text || '') : p?.type === 'image_url' ? '[image]' : ''))
      .filter(Boolean).join(' ').slice(0, INTENT_CAP);
  }
  return '';
}

export function digestFrom(openaiReq, paths = []) {
  const messages = openaiReq.messages || [];
  const lastUser = [...messages].reverse().find((m) => m && m.role === 'user');
  const toolNames = messages.flatMap((m) => (m?.tool_calls || []).map((t) => t.function?.name)).filter(Boolean);
  return {
    user_intent: userIntent(lastUser?.content),
    referenced_paths: paths, recent_tool_calls: toolNames,
  };
}

export async function runTurn(ctx, opts) {
  const { db, cfg } = ctx;
  const aliases = ctx.aliases || cfg.aliases || {};
  const {
    project, repoId = null, repoRoot = null, openaiReq, routeHeader,
    clientSignal, requestId, paths = [], depth = 0, injectMemory: doMemory = false, meta = {},
  } = opts;

  // Route (may throw a typed error — the caller decides how to surface + log it).
  const route = router.pick({ providers: listProviders(db), aliases, openaiReq, routeHeader, cfg });
  const provRow = db.prepare(`SELECT * FROM providers WHERE name = ?`).get(route.provider);
  if (!provRow) throw router.httpError(500, `Routed provider "${route.provider}" is not registered`, 'configuration_error');
  const adapter = adapterFor(provRow.adapter);

  let apiKey = null;
  if (!adapter.direct) {
    if (!provRow.base_url) throw router.httpError(500, `Provider "${route.provider}" has no base URL configured`, 'configuration_error');
    if (!provRow.enc_key) throw router.httpError(500, `Provider "${route.provider}" has no API key configured`, 'configuration_error');
    try { apiKey = decryptSecret(cfg, provRow.enc_key); } catch { throw router.httpError(500, 'Failed to decrypt provider key', 'configuration_error'); }
  }

  // Memory injection is a top-level (depth 0) concern only; delegated sub-calls run without repo
  // memory (per Fable: it doubles cost and widens the injection surface for a self-contained task).
  const mem = (doMemory && repoRoot)
    ? memory.query({ repoRoot, requestDigest: digestFrom(openaiReq, paths), budgets: { contextTokens: cfg.memory.contextTokens, maxFileBytes: cfg.memory.maxFileBytes }, options: {} })
    : { status: doMemory ? 'empty' : 'skipped', blocks: [] };
  const maxOut = openaiReq.max_tokens || openaiReq.max_completion_tokens || cfg.defaultMaxTokens;
  // runTurn is the NON-streaming primitive; never forward client transport flags. A bridge buffers
  // a client's `stream:true`+`stream_options` request through here, and those fields on a
  // non-stream upstream call are a 400 on strict providers.
  const { stream: _s, stream_options: _so, ...cleanReq } = openaiReq;
  const finalReq = { ...injectMemory(cleanReq, mem), max_tokens: maxOut };

  // Reserve THIS hop's ceiling (recomputed from this hop's actual request — never reuse an earlier
  // hop's ceiling). The reservation is the spend ceiling for exactly one upstream call.
  const ceiling = meter.reservationCeiling(route.provider, route.model, finalReq);
  const resv = pep.reserve(db, { project, amountUsd: ceiling, defaultCap: cfg.defaultDailyCapUsd });
  const decision = { ...route.decision, depth, ...meta };
  if (!resv.ok) {
    ledger.append(db, cfg, { request_id: requestId, project, repo: repoId, provider: route.provider, model: route.model, rule_id: route.decision.rule_id, decision, memory_status: mem.status, outcome: `denied_${resv.reason}` });
    return { ok: false, denial: { status: 402, reason: resv.reason, code: resv.reason, cap: resv.cap, spent: resv.spent } };
  }

  try {
    const { openaiResponse, usage } = await callNonStream(adapter, { provider: provRow, model: route.model, openaiReq: finalReq, apiKey, cfg, clientSignal });
    const cost = meter.costOf(route.provider, route.model, usage);
    pep.commit(db, resv.reservationId, cost.usd);
    router.markSuccess(route.provider);
    ledger.append(db, cfg, { request_id: requestId, project, repo: repoId, provider: route.provider, model: route.model, rule_id: route.decision.rule_id, decision, usage, cost_usd: cost.usd, cost_estimated: cost.estimated, memory_status: mem.status, outcome: 'ok' });
    return { ok: true, openaiResponse, usage, cost, route, memStatus: mem.status };
  } catch (e) {
    router.markFailure(route.provider);
    pep.refund(db, resv.reservationId); // pre-headers always here (buffered); committed hops elsewhere are never touched
    ledger.append(db, cfg, { request_id: requestId, project, repo: repoId, provider: route.provider, model: route.model, rule_id: route.decision.rule_id, decision, memory_status: mem.status, outcome: 'error' });
    throw e;
  }
}
