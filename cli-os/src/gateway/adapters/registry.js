// Adapter + manifest registry. Manifests (_manifests/*.json) are the "data" half of the
// adapter design: base URL, model ids, capabilities, and per-model pricing (input/output/
// cache rates). The adapter modules are the "code" half.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import * as anthropic from './anthropic.js';
import * as openaiCompat from './openaiCompat.js';
import * as mock from './mock.js';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const MANIFEST_DIR = path.join(HERE, '_manifests');

const ALIASES = { glm: 'zhipu', 'z.ai': 'zhipu', ollama: 'local', 'local-models': 'local' };

let _manifests = null;
function manifests() {
  if (_manifests) return _manifests;
  _manifests = {};
  try {
    for (const f of fs.readdirSync(MANIFEST_DIR)) {
      if (!f.endsWith('.json')) continue;
      try {
        const m = JSON.parse(fs.readFileSync(path.join(MANIFEST_DIR, f), 'utf8'));
        if (m.provider) _manifests[m.provider] = m;
      } catch { /* skip malformed manifest */ }
    }
  } catch { /* dir may not exist in some deployments */ }
  return _manifests;
}

export function adapterFor(kind) {
  switch (kind) {
    case 'native-messages': return anthropic;
    case 'openai-native':
    case 'openai-compat': return openaiCompat;
    case 'mock': return mock;
    default: return openaiCompat; // safe default: assume OpenAI-shaped
  }
}

export function manifestFor(providerName) {
  const key = ALIASES[providerName] || providerName;
  return manifests()[key] || null;
}

export function defaultBaseUrl(providerName) {
  return manifestFor(providerName)?.base_url || null;
}

export function defaultAdapterKind(providerName) {
  const m = manifestFor(providerName);
  if (m?.adapter) return m.adapter === 'openai-native' ? 'openai-compat' : m.adapter;
  return providerName === 'anthropic' ? 'native-messages' : 'openai-compat';
}

// Per-model price map { input, output, cache_read, cache_write } in USD per 1M tokens, or null.
export function priceFor(providerName, model) {
  const m = manifestFor(providerName);
  if (!m) return null;
  const row = (m.models || []).find((x) => x.id === model);
  const p = row?.price_per_mtok;
  if (!p) return null;
  const confident = row.price_confidence === 'high';
  return {
    input: p.input, output: p.output,
    cache_read: p.cache_read ?? 0, cache_write: p.cache_write_5m ?? p.cache_write ?? 0,
    confident,
  };
}

export function modelsFor(providerName) {
  const m = manifestFor(providerName);
  return (m?.models || []).map((x) => x.id).filter((id) => !String(id).startsWith('PENDING'));
}

function modelRow(providerName, model) {
  const m = manifestFor(providerName);
  return (m?.models || []).find((x) => x.id === model) || null;
}

// Declared per-model capabilities from the manifest ({ tools, vision, streaming_usage, ... }).
// Missing manifest / model returns {} — the capability filter reads absent booleans as false
// (fail-closed), so an undeclared capability is never assumed present.
export function capabilitiesFor(providerName, model) {
  return modelRow(providerName, model)?.capabilities || {};
}

// Declared context window in tokens, or null when the manifest hasn't verified it. `null` means
// "unverified", NOT "zero" — the auto-router must not ban a provider whose context is simply
// undeclared; it passes the min-context filter with a logged caveat instead.
export function contextFor(providerName, model) {
  const c = modelRow(providerName, model)?.context;
  return typeof c === 'number' ? c : null;
}

// Price confidence tier for ranking. 0 = priced and first-party-confident, 1 = priced but the
// number is third-party/unconfirmed, 2 = unpriced. The cost preference must sort tier-2 last so a
// $0 "unknown price" can never masquerade as the cheapest option (meter.js keeps the same honesty
// posture: unknown price => cost 0, estimated=true).
export function priceTierFor(providerName, model) {
  const p = priceFor(providerName, model);
  if (!p || p.input == null || p.output == null) return 2;
  return p.confident ? 0 : 1;
}

// Enumerate every routable (provider, model) pair across the given enabled provider names, with
// the facts the auto-router needs. `providerNames` is the set the caller has (enabled) registered.
export function catalog(providerNames) {
  const out = [];
  for (const name of providerNames) {
    for (const model of modelsFor(name)) {
      out.push({
        provider: name,
        model,
        capabilities: capabilitiesFor(name, model),
        context: contextFor(name, model),
        price: priceFor(name, model),
        priceTier: priceTierFor(name, model),
      });
    }
  }
  return out;
}
