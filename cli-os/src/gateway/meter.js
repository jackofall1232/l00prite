// Cost meter. Golden rule (prior-art lesson): trust provider-reported usage over any local
// estimate. Prices are per-model with SEPARATE input/output/cache-read/cache-write rates.
// Unknown/unconfirmed prices produce cost 0 with estimated=true rather than a fabricated number.
import { priceFor } from './adapters/registry.js';
import { estimateTokensFromChars } from '../util.js';

const UNKNOWN_PRICE_CEILING_USD = 0.25; // conservative reservation ceiling when price is unknown

export function costOf(providerName, model, usage) {
  const p = priceFor(providerName, model);
  if (!p || p.input == null || p.output == null) {
    return { usd: 0, estimated: true, priced: false };
  }
  const usd =
    ((usage.prompt_tokens || 0) * p.input +
      (usage.completion_tokens || 0) * p.output +
      (usage.cache_read_tokens || 0) * (p.cache_read || 0) +
      (usage.cache_write_tokens || 0) * (p.cache_write || 0)) / 1e6;
  return { usd, estimated: !p.confident, priced: true };
}

// Pre-flight reservation ceiling in USD (NOT the billed amount). Uses a rough token estimate of
// the prompt plus the requested max output at the model's output rate.
export function reservationCeiling(providerName, model, openaiReq) {
  const p = priceFor(providerName, model);
  const promptTokens = estimateTokensFromChars(JSON.stringify(openaiReq.messages || []).length);
  const maxOut = openaiReq.max_tokens || openaiReq.max_completion_tokens || 1024;
  if (!p || p.input == null || p.output == null) return UNKNOWN_PRICE_CEILING_USD;
  const usd = (promptTokens * p.input + maxOut * p.output) / 1e6;
  return Math.max(usd, 0.0005);
}
