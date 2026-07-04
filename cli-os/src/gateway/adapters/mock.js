// Mock upstream adapter. Requires no key and no network, so a fresh install can demo the full
// request path (auth -> routing -> memory -> cost -> ledger) immediately, and the test suite can
// exercise the pipeline offline. It reports realistic usage so the cost meter has real numbers.
import { cmplId, openaiChunk, openaiResponse } from './base.js';

export const kind = 'mock';
export const direct = true; // ingress calls directFull/directStream instead of fetching

function reply(openaiReq) {
  const lastUser = [...(openaiReq.messages || [])].reverse().find((m) => m.role === 'user');
  const q = typeof lastUser?.content === 'string' ? lastUser.content : 'your request';
  return `Mock provider response. I received "${String(q).slice(0, 120)}". ` +
    `This is the l00prite CLI-OS demo upstream — configure a real provider key to route to Anthropic, OpenAI, GLM, and others.`;
}

function usage(promptChars, text) {
  return { prompt_tokens: Math.max(1, Math.ceil(promptChars / 4)), completion_tokens: Math.ceil(text.length / 4), cache_read_tokens: 0, cache_write_tokens: 0 };
}

export function directFull(openaiReq, model) {
  const text = reply(openaiReq);
  const promptChars = JSON.stringify(openaiReq.messages || []).length;
  const u = usage(promptChars, text);
  return {
    openaiResponse: openaiResponse({ id: cmplId(), model, message: { role: 'assistant', content: text }, finishReason: 'stop', usage: u }),
    usage: u,
  };
}

export async function* directStream(openaiReq, model) {
  const id = cmplId();
  const text = reply(openaiReq);
  const promptChars = JSON.stringify(openaiReq.messages || []).length;
  yield { chunk: openaiChunk({ id, model, delta: { role: 'assistant', content: '' } }) };
  const words = text.match(/\S+\s*/g) || [text];
  for (const w of words) {
    yield { chunk: openaiChunk({ id, model, delta: { content: w } }) };
  }
  yield { chunk: openaiChunk({ id, model, delta: {}, finishReason: 'stop' }), usage: usage(promptChars, text), done: true };
}
