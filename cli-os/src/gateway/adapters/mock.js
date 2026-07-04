// Mock upstream adapter. Requires no key and no network, so a fresh install can demo the full
// request path (auth -> routing -> memory -> cost -> ledger) immediately, and the test suite can
// exercise the pipeline offline. It reports realistic usage so the cost meter has real numbers.
//
// Bridge-aware test hooks (only fire when the bridge tool is actually present, so normal mock
// behavior is unchanged): a last user message of
//   "/bridge <target> :: <task>"      -> emit ONE bridge tool_call, then finalize on the next turn
//   "/bridgeloop <target> :: <task>"  -> emit a bridge tool_call on EVERY turn (drives the hop cap)
// lets the offline suite drive the bounded delegation loop deterministically.
import { cmplId, openaiChunk, openaiResponse } from './base.js';

export const kind = 'mock';
export const direct = true; // ingress calls directFull/directStream instead of fetching

const BRIDGE_TOOL_NAME = 'l00prite_bridge';

function lastUserText(openaiReq) {
  const lastUser = [...(openaiReq.messages || [])].reverse().find((m) => m.role === 'user');
  return typeof lastUser?.content === 'string' ? lastUser.content : '';
}
function hasBridgeTool(openaiReq) {
  return (openaiReq.tools || []).some((t) => t.function?.name === BRIDGE_TOOL_NAME);
}
function hasToolResult(openaiReq) {
  return (openaiReq.messages || []).some((m) => m.role === 'tool');
}
function bridgeDirective(openaiReq) {
  const m = /^\/(bridge|bridgeloop)\s+(\S+)\s*::\s*([\s\S]+)$/.exec(lastUserText(openaiReq).trim());
  return m ? { loop: m[1] === 'bridgeloop', target: m[2], task: m[3].trim() } : null;
}

function reply(openaiReq) {
  const q = lastUserText(openaiReq) || 'your request';
  return `Mock provider response. I received "${String(q).slice(0, 120)}". ` +
    `This is the l00prite CLI-OS demo upstream — configure a real provider key to route to Anthropic, OpenAI, GLM, and others.`;
}

function usage(promptChars, text) {
  return { prompt_tokens: Math.max(1, Math.ceil(promptChars / 4)), completion_tokens: Math.ceil(text.length / 4), cache_read_tokens: 0, cache_write_tokens: 0 };
}

function bridgeToolCallMessage(directive) {
  const id = 'call_' + cmplId().slice(-10);
  const args = JSON.stringify({ target: directive.target, task: directive.task });
  return { message: { role: 'assistant', content: null, tool_calls: [{ id, type: 'function', function: { name: BRIDGE_TOOL_NAME, arguments: args } }] }, argChars: args.length };
}

export function directFull(openaiReq, model) {
  const promptChars = JSON.stringify(openaiReq.messages || []).length;
  const directive = hasBridgeTool(openaiReq) ? bridgeDirective(openaiReq) : null;

  // Emit a bridge tool_call: always for /bridgeloop; for /bridge only until a delegate answer has
  // been folded in (so it delegates once, then finalizes).
  if (directive && (directive.loop || !hasToolResult(openaiReq))) {
    const { message, argChars } = bridgeToolCallMessage(directive);
    const u = usage(promptChars, 'x'.repeat(argChars));
    return { openaiResponse: openaiResponse({ id: cmplId(), model, message, finishReason: 'tool_calls', usage: u }), usage: u };
  }

  // Finalization turn: incorporate whatever delegate result(s) came back.
  if (hasToolResult(openaiReq)) {
    const toolMsg = [...(openaiReq.messages || [])].reverse().find((m) => m.role === 'tool');
    const excerpt = String(toolMsg?.content || '').replace(/\s+/g, ' ').slice(0, 120);
    const text = `Mock final answer, composed after delegating. Delegate said: ${excerpt}`;
    const u = usage(promptChars, text);
    return { openaiResponse: openaiResponse({ id: cmplId(), model, message: { role: 'assistant', content: text }, finishReason: 'stop', usage: u }), usage: u };
  }

  const text = reply(openaiReq);
  const u = usage(promptChars, text);
  return { openaiResponse: openaiResponse({ id: cmplId(), model, message: { role: 'assistant', content: text }, finishReason: 'stop', usage: u }), usage: u };
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
