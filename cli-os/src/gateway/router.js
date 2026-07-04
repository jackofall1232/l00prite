// Explainable routing (no ML). First-match-wins rules; every decision is logged and
// inspectable via `l00prite route explain <request-id>`. Includes a simple circuit breaker so a
// flapping provider stops poisoning requests.
import { modelsFor } from './adapters/registry.js';
import { parseAutoSignal, selectAuto } from './router-auto.js';

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

// providers: [{ name, enabled, is_default }]; aliases: { name -> "provider/model" };
// cfg carries routing config (profiles, quality ranks) for the opt-in auto tier.
export function pick({ providers, aliases = {}, openaiReq, routeHeader, cfg = {} }) {
  const enabled = new Set(providers.filter((p) => p.enabled).map((p) => p.name));
  const isDefault = providers.find((p) => p.enabled && p.is_default);
  const wanted = openaiReq.model;
  const alternatives = [];
  const routing = cfg.routing || null;

  // Rule 0: auto tier (opt-in). A `model`/header of `auto` or `auto:<profile>` selects the
  // best/most-efficient provider for this task via capability filter + preference scoring. The
  // header expresses operator intent, so an auto signal there wins; a bare model auto only fires
  // when no header pin is present. This is checked FIRST so `auto:cheap` is never misread as a
  // provider named "auto" by the pin rules below. Disabled when no routing config is supplied.
  const headerAuto = routing ? parseAutoSignal(routeHeader) : null;
  const modelAuto = routing && !routeHeader ? parseAutoSignal(wanted) : null;
  const autoSig = headerAuto || modelAuto;
  if (autoSig) {
    return selectAuto({ providers, routing, openaiReq, signal: autoSig, defaultMaxTokens: cfg.defaultMaxTokens });
  }

  const use = (provider, model, rule_id, reason) => {
    if (!enabled.has(provider)) return null;
    return { provider, model, decision: { rule_id, chosen: `${provider}/${model}`, alternatives, reason } };
  };

  // Rule 1a: explicit route header — operator intent, so an unknown provider is an error.
  const headerPin = splitTarget(routeHeader);
  if (headerPin) {
    const r = use(headerPin.provider, headerPin.model, 'explicit_pin', `header pin ${headerPin.provider}/${headerPin.model}`);
    if (r) return r;
    throw httpError(400, `Provider "${headerPin.provider}" is not registered or enabled`, 'invalid_request_error');
  }
  // Rule 1b: provider-qualified model — only a pin when the provider segment is actually a
  // registered provider. Otherwise it's a model id that merely contains '/' (e.g. OpenRouter
  // "vendor/model"), which must fall through to the default provider unchanged.
  const modelPin = splitTarget(wanted);
  if (modelPin && enabled.has(modelPin.provider)) {
    const r = use(modelPin.provider, modelPin.model, 'explicit_pin', `model pin ${modelPin.provider}/${modelPin.model}`);
    if (r) return r;
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

  // Rule 4: default provider (+ requested model or its own default model) — but honor the
  // circuit breaker so a flapping default falls through to Rule 5 instead of poisoning traffic.
  if (isDefault && !isTripped(isDefault.name)) {
    const model = wanted || modelsFor(isDefault.name)[0] || 'default';
    return use(isDefault.name, model, 'default_provider', `no explicit target; default provider ${isDefault.name}`);
  }
  if (isDefault && isTripped(isDefault.name)) alternatives.push(`${isDefault.name} (circuit open)`);

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
