import crypto from 'node:crypto';

export const cmplId = () => `chatcmpl-${crypto.randomBytes(12).toString('hex')}`;
export const created = () => Math.floor(Date.now() / 1000);

export function openaiResponse({ id, model, message, finishReason, usage }) {
  return {
    id, object: 'chat.completion', created: created(), model,
    choices: [{ index: 0, message, finish_reason: finishReason, logprobs: null }],
    usage: {
      prompt_tokens: usage.prompt_tokens ?? 0,
      completion_tokens: usage.completion_tokens ?? 0,
      total_tokens: (usage.prompt_tokens ?? 0) + (usage.completion_tokens ?? 0),
      ...(usage.cache_read_tokens ? { prompt_tokens_details: { cached_tokens: usage.cache_read_tokens } } : {}),
    },
  };
}

export function openaiChunk({ id, model, delta, finishReason = null }) {
  return {
    id, object: 'chat.completion.chunk', created: created(), model,
    choices: [{ index: 0, delta, finish_reason: finishReason, logprobs: null }],
  };
}

// Normalize usage into our internal shape { prompt_tokens, completion_tokens, cache_read_tokens, cache_write_tokens }.
export function zeroUsage() {
  return { prompt_tokens: 0, completion_tokens: 0, cache_read_tokens: 0, cache_write_tokens: 0 };
}
