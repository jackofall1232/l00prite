// Auto-routing: "pick the best provider for THIS task" and "pick the most efficient one".
//
// This realizes routing-rules-v1.md Rule 3 (capability filter) and Rule 4 (preference tiebreak),
// which were designed but not yet implemented. It is deterministic and explainable — NO ML, no
// learned scores (Q2). A request opts in with model/header `auto` or `auto:<profile>`; explicit
// provider/model pins always win first (operator intent), handled in router.js before this runs.
//
// Pipeline:
//   deriveRequirements(request)         -> hard needs (tools / vision / context / streaming usage)
//   capability filter (Rule 3)          -> candidates that CAN serve it (fail-closed on absent caps)
//   preference scoring (Rule 4)         -> order survivors by cost | quality | balanced
//   circuit health                      -> drop tripped providers AFTER capability, for correct errors
// Every step is logged into the RoutingDecision so `route explain` shows why.
import { catalog } from './adapters/registry.js';
import { isTripped, httpError } from './router.js';
import { estimateTokensFromChars } from '../util.js';

const NEUTRAL_QUALITY = 50; // rank for a model the operator hasn't ranked
const key = (c) => `${c.provider}/${c.model}`;

// ---- requirements (deterministic projection of the request) ----
export function deriveRequirements(openaiReq, defaultMaxTokens = 1024) {
  const messages = openaiReq.messages || [];
  const needs_tools = Array.isArray(openaiReq.tools) && openaiReq.tools.length > 0;
  const needs_vision = messages.some((m) => Array.isArray(m.content)
    && m.content.some((part) => part && part.type === 'image_url'));
  const needs_streaming_usage = openaiReq.stream === true && !!openaiReq.stream_options?.include_usage;
  const maxOut = openaiReq.max_tokens || openaiReq.max_completion_tokens || defaultMaxTokens;
  const promptTokens = estimateTokensFromChars(JSON.stringify(messages).length);
  const min_context_tokens = promptTokens + maxOut;
  return { needs_tools, needs_vision, needs_streaming_usage, min_context_tokens, promptTokens, maxOut };
}

// ---- profile resolution ----
// Parse `auto` / `auto:cheap` (from a model field or route header) into a profile name, '' = bare.
export function parseAutoSignal(s) {
  const m = /^auto(?::(.+))?$/i.exec(String(s || '').trim());
  return m ? { profile: (m[1] || '').trim() } : null;
}

export function resolveProfile(profileName, routing) {
  const name = profileName || routing.autoDefaultProfile || 'balanced';
  const p = routing.profiles?.[name];
  if (!p) {
    const known = Object.keys(routing.profiles || {}).join(', ');
    throw httpError(400, `Unknown auto profile "${name}". Known profiles: ${known || '(none configured)'}.`, 'invalid_request_error');
  }
  const preference = p.preference || 'balanced';
  if (!['cost', 'quality', 'balanced'].includes(preference)) {
    throw httpError(400, `Profile "${name}" has invalid preference "${preference}" (cost|quality|balanced).`, 'invalid_request_error');
  }
  return { name, preference, require: Array.isArray(p.require) ? p.require : [] };
}

// ---- capability filter (Rule 3) ----
// Returns { capable:[...], rejected:[{target, reasons}] }. Absent booleans read as false
// (fail-closed). A null/undeclared context window PASSES with a caveat, never bans a provider.
function filterByCapability(cand, req, profile) {
  const capable = [];
  const rejected = [];
  for (const c of cand) {
    const reasons = [];
    const caps = c.capabilities || {};
    if (req.needs_tools && caps.tools !== true) reasons.push('needs tools; model lacks tool support');
    if (req.needs_vision && caps.vision !== true) reasons.push('needs vision; model is not multimodal');
    if (req.needs_streaming_usage && !caps.streaming_usage) reasons.push('needs streaming usage; model does not report it');
    for (const r of profile.require) {
      if (caps[r] !== true) reasons.push(`profile requires "${r}"; model lacks it`);
    }
    let context_unverified = false;
    if (typeof c.context === 'number') {
      if (c.context < req.min_context_tokens) {
        reasons.push(`needs ~${req.min_context_tokens} ctx tokens; model window is ${c.context}`);
      }
    } else {
      context_unverified = true; // undeclared context: pass, but flag it
    }
    if (reasons.length) rejected.push({ target: key(c), reasons });
    else capable.push({ ...c, context_unverified });
  }
  return { capable, rejected };
}

// ---- preference scoring (Rule 4) ----
function blendedCost(c, promptTokens, maxOut) {
  const p = c.price;
  if (!p || p.input == null || p.output == null) return Infinity; // unpriced => never "cheapest"
  return (promptTokens * p.input + maxOut * p.output) / 1e6;
}

// Sort key intentionally leads with priceTier so a tier-2 (unpriced) or tier-1 (unconfirmed) model
// can never beat a tier-0 (confirmed) one on a fabricated $0 — Fable's "unknown-cheapest" trap.
const byCost = (a, b) =>
  a.priceTier - b.priceTier || a.blendedUsd - b.blendedUsd || key(a).localeCompare(key(b));
const byQuality = (a, b) =>
  b.quality - a.quality || a.priceTier - b.priceTier || key(a).localeCompare(key(b));

function scoreCandidates(capable, { preference, req, qualityRanks }) {
  const withMetrics = capable.map((c) => ({
    ...c,
    quality: qualityRanks?.[key(c)] ?? NEUTRAL_QUALITY,
    quality_ranked: qualityRanks?.[key(c)] != null,
    blendedUsd: blendedCost(c, req.promptTokens, req.maxOut),
  }));
  if (preference === 'cost') {
    withMetrics.sort(byCost);
  } else if (preference === 'quality') {
    withMetrics.sort(byQuality);
  } else {
    // balanced: Borda blend of the cost ordering and the quality ordering (lower total = better).
    const costOrder = [...withMetrics].sort(byCost);
    const qualOrder = [...withMetrics].sort(byQuality);
    const cr = new Map(costOrder.map((c, i) => [key(c), i]));
    const qr = new Map(qualOrder.map((c, i) => [key(c), i]));
    for (const c of withMetrics) { c.costOrdinal = cr.get(key(c)); c.qualOrdinal = qr.get(key(c)); c.blendedOrdinal = c.costOrdinal + c.qualOrdinal; }
    withMetrics.sort((a, b) => a.blendedOrdinal - b.blendedOrdinal || a.priceTier - b.priceTier || key(a).localeCompare(key(b)));
  }
  return withMetrics;
}

function reasonFor(winner, preference) {
  const tierNote = winner.priceTier === 0 ? '' : winner.priceTier === 1 ? ' (among unconfirmed-price candidates)' : ' (unpriced)';
  const usd = Number.isFinite(winner.blendedUsd) ? `$${winner.blendedUsd.toFixed(6)}` : 'unpriced';
  if (preference === 'cost') return `cheapest sufficient model${tierNote}; est ${usd}/call`;
  if (preference === 'quality') return `highest operator quality rank (${winner.quality}${winner.quality_ranked ? '' : ', default'})${tierNote}`;
  return `best blended cost+quality (quality ${winner.quality}, est ${usd}/call)${tierNote}`;
}

// Public entry. `providers` are the DB rows; only enabled ones are candidates. Returns
// { provider, model, decision } or throws a typed httpError (400 no_capable_model / 503 tripped /
// 400 unknown_profile).
export function selectAuto({ providers, routing, openaiReq, signal, defaultMaxTokens }) {
  const profile = resolveProfile(signal.profile, routing);
  const req = deriveRequirements(openaiReq, defaultMaxTokens);
  const enabledNames = providers.filter((p) => p.enabled).map((p) => p.name);
  const cand = catalog(enabledNames);

  if (!cand.length) {
    throw httpError(400, 'Auto routing found no routable models. Enable a provider that publishes a known model catalog (e.g. anthropic, zhipu), then retry.', 'invalid_request_error');
  }

  const { capable, rejected } = filterByCapability(cand, req, profile);
  if (!capable.length) {
    const detail = rejected.map((r) => `${r.target}: ${r.reasons.join('; ')}`).join(' | ');
    const e = httpError(400, `No enabled model can satisfy this request (${describeReq(req, profile)}). Rejections — ${detail}`, 'invalid_request_error');
    e.code = 'no_capable_model';
    e.decision = { rule_id: 'auto_no_capable', profile: profile.name, requirements: req, rejected };
    throw e;
  }

  const healthy = capable.filter((c) => !isTripped(c.provider));
  if (!healthy.length) {
    const e = httpError(503, `All models capable of this request are currently circuit-tripped (${capable.map(key).join(', ')}). Retry shortly.`, 'service_unavailable');
    e.code = 'providers_unavailable';
    e.decision = { rule_id: 'auto_all_tripped', profile: profile.name, requirements: req, tripped: capable.map(key) };
    throw e;
  }

  const scored = scoreCandidates(healthy, { preference: profile.preference, req, qualityRanks: routing.qualityRanks });
  const winner = scored[0];
  const decision = {
    rule_id: 'auto_select',
    chosen: key(winner),
    profile: profile.name,
    preference: profile.preference,
    requirements: req,
    reason: `auto:${profile.name} — ${reasonFor(winner, profile.preference)}`,
    candidates: scored.map((c) => ({
      target: key(c), price_tier: c.priceTier, quality: c.quality,
      est_usd: Number.isFinite(c.blendedUsd) ? Number(c.blendedUsd.toFixed(6)) : null,
      ...(c.context_unverified ? { context_unverified: true } : {}),
    })),
    alternatives: scored.slice(1).map(key),
    rejected,
  };
  return { provider: winner.provider, model: winner.model, decision };
}

function describeReq(req, profile) {
  const parts = [];
  if (req.needs_tools) parts.push('tools');
  if (req.needs_vision) parts.push('vision');
  if (req.needs_streaming_usage) parts.push('streaming usage');
  if (profile.require.length) parts.push(`profile requires ${profile.require.join('+')}`);
  parts.push(`~${req.min_context_tokens} context tokens`);
  return parts.join(', ');
}
