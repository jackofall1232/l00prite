// OpenAI-compatible passthrough adapter. Covers OpenAI itself and every provider that exposes
// an OpenAI-shaped /chat/completions (GLM/Zhipu, DeepSeek, Gemini's compat layer, Groq,
// Mistral, OpenRouter, local Ollama/vLLM). The request is already the canonical schema, so the
// work is: force streaming usage on, forward, and normalize usage out. Provider chunks are
// forwarded verbatim.
export const kind = 'openai-compat';

export function buildRequest({ model, openaiReq, stream }) {
  const body = { ...openaiReq, model };
  delete body.l00prite; // strip any gateway-only hints
  if (stream) {
    body.stream = true;
    body.stream_options = { ...(body.stream_options || {}), include_usage: true };
  } else {
    delete body.stream;
  }
  return body;
}

export const url = (baseUrl) => `${baseUrl.replace(/\/$/, '')}/chat/completions`;
export const headers = (apiKey) => ({ 'content-type': 'application/json', authorization: `Bearer ${apiKey}` });

function normUsage(u = {}) {
  return {
    prompt_tokens: u.prompt_tokens ?? 0,
    completion_tokens: u.completion_tokens ?? 0,
    cache_read_tokens: u.prompt_tokens_details?.cached_tokens ?? 0,
    cache_write_tokens: 0,
  };
}

export function parseFull(json, model) {
  // Already OpenAI-shaped; pass through (ensure model label present) and lift usage.
  if (!json.model) json.model = model;
  return { openaiResponse: json, usage: normUsage(json.usage) };
}

export function newStreamState(model) { return { model, usage: null }; }

export function onEvent(st, ev) {
  if (ev.data === '[DONE]') return { deltas: [], done: true, usage: st.usage || undefined };
  let chunk;
  try { chunk = JSON.parse(ev.data); } catch { return { deltas: [] }; }
  if (chunk.usage) st.usage = normUsage(chunk.usage);
  // A usage-only final chunk (choices=[]) carries no delta to forward downstream.
  const hasChoice = Array.isArray(chunk.choices) && chunk.choices.length;
  return { deltas: hasChoice ? [chunk] : [], usage: chunk.usage ? normUsage(chunk.usage) : undefined };
}
