// Explainable routing (no ML). First-match-wins rules; every decision is logged and
// inspectable via `l00prite route explain <request-id>`. Includes a simple circuit breaker so a
// flapping provider stops poisoning requests.
import { modelsFor } from './adapters/registry.js';

const breaker = new Map(); // provider -> { fails, until }

export function markFailure(provider) {
  const b = breaker.get(provider) || { fails: 0, until: 0 };
  b.fails += 1;
  if (b.fails >= 3) b.until = Date.now() + 30_000; // 30s cooldown after 3 fails
  breaker.set(provider, b);
}
export function markSuccess(provider) { breaker.set(provider, { fails: 0, until: 0 }); }
export function isTripped(provider) {
  const b = breaker.get(provider);
  return !!(b && b.until > Date.now());
}

function splitTarget(s) {
  const m = /^([a-z0-9_-]+)[:/](.+)$/i.exec(String(s || ''));
  return m ? { provider: m[1], model: m[2] } : null;
}

// providers: [{ name, enabled, is_default }]; aliases: { name -> "provider/model" }.
export function pick({ providers, aliases = {}, openaiReq, routeHeader }) {
  const enabled = new Set(providers.filter((p) => p.enabled).map((p) => p.name));
  const isDefault = providers.find((p) => p.enabled && p.is_default);
  const wanted = openaiReq.model;
  const alternatives = [];

  const use = (provider, model, rule_id, reason) => {
    if (!enabled.has(provider)) return null;
    return { provider, model, decision: { rule_id, chosen: `${provider}/${model}`, alternatives, reason } };
  };

  // Rule 1: explicit pin (header or provider-qualified model).
  const pinned = splitTarget(routeHeader) || splitTarget(wanted);
  if (pinned) {
    const r = use(pinned.provider, pinned.model, 'explicit_pin', `pinned target ${pinned.provider}/${pinned.model}`);
    if (r) return r;
    throw httpError(400, `Provider "${pinned.provider}" is not registered or enabled`, 'invalid_request_error');
  }

  // Rule 2: alias map.
  if (wanted && aliases[wanted]) {
    const t = splitTarget(aliases[wanted]);
    if (t) { const r = use(t.provider, t.model, 'alias_map', `alias "${wanted}" -> ${t.provider}/${t.model}`); if (r) return r; }
  }

  // Rule 3: bare model id owned by a registered provider's manifest.
  if (wanted) {
    for (const p of providers) {
      if (!enabled.has(p.name) || isTripped(p.name)) { if (isTripped(p.name)) alternatives.push(`${p.name} (circuit open)`); continue; }
      if (modelsFor(p.name).includes(wanted)) {
        return use(p.name, wanted, 'model_owner', `model "${wanted}" served by ${p.name}`);
      }
    }
  }

  // Rule 4: default provider (+ requested model or its own default model).
  if (isDefault) {
    const model = wanted || modelsFor(isDefault.name)[0] || 'default';
    return use(isDefault.name, model, 'default_provider', `no explicit target; default provider ${isDefault.name}`);
  }

  // Rule 5 fallback: first enabled, non-tripped provider.
  const first = providers.find((p) => enabled.has(p.name) && !isTripped(p.name));
  if (first) {
    const model = wanted || modelsFor(first.name)[0] || 'default';
    return use(first.name, model, 'fallback_first', `fell back to first available provider ${first.name}`);
  }

  throw httpError(503, 'No enabled providers available to route this request', 'service_unavailable');
}

export function httpError(status, message, type = 'invalid_request_error') {
  const e = new Error(message);
  e.status = status; e.type = type;
  return e;
}
