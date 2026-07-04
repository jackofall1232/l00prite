// Anthropic native adapter. Anthropic has no production OpenAI-compatible endpoint, so this is
// a real bidirectional translator: OpenAI Chat Completions <-> /v1/messages, including the
// system-as-field difference, input_schema tools, tool_use/tool_result blocks, and the typed
// SSE event stream rebuilt into OpenAI chunk deltas.
import { cmplId, openaiChunk, openaiResponse, zeroUsage } from './base.js';

export const kind = 'native-messages';

const STOP_MAP = {
  end_turn: 'stop', max_tokens: 'length', stop_sequence: 'stop',
  tool_use: 'tool_calls', refusal: 'content_filter', pause_turn: 'stop',
};

function imageBlock(url) {
  const m = /^data:([^;]+);base64,(.*)$/.exec(url || '');
  if (m) return { type: 'image', source: { type: 'base64', media_type: m[1], data: m[2] } };
  return { type: 'image', source: { type: 'url', url } };
}

function toAnthropicContent(msg) {
  // OpenAI message content -> Anthropic content blocks.
  if (Array.isArray(msg.content)) {
    return msg.content.map((p) =>
      p.type === 'text' ? { type: 'text', text: p.text } :
      p.type === 'image_url' ? imageBlock(p.image_url?.url) :
      { type: 'text', text: typeof p === 'string' ? p : JSON.stringify(p) });
  }
  return [{ type: 'text', text: msg.content ?? '' }];
}

export function buildRequest({ model, openaiReq, stream }) {
  const systemParts = [];
  const messages = [];
  for (const m of openaiReq.messages || []) {
    if (m.role === 'system') {
      // System content is text-only in Anthropic; ignore any non-text blocks rather than
      // emitting "undefined" into the joined string.
      systemParts.push(typeof m.content === 'string'
        ? m.content
        : toAnthropicContent(m).filter((b) => b.type === 'text').map((b) => b.text).join('\n'));
      continue;
    }
    if (m.role === 'tool') {
      messages.push({ role: 'user', content: [{ type: 'tool_result', tool_use_id: m.tool_call_id, content: String(m.content ?? '') }] });
      continue;
    }
    if (m.role === 'assistant' && Array.isArray(m.tool_calls) && m.tool_calls.length) {
      const blocks = [];
      if (m.content) blocks.push({ type: 'text', text: String(m.content) });
      for (const tc of m.tool_calls) {
        let input = {};
        try { input = JSON.parse(tc.function?.arguments || '{}'); } catch { input = {}; }
        blocks.push({ type: 'tool_use', id: tc.id, name: tc.function?.name, input });
      }
      messages.push({ role: 'assistant', content: blocks });
      continue;
    }
    messages.push({ role: m.role === 'assistant' ? 'assistant' : 'user', content: toAnthropicContent(m) });
  }

  const body = {
    model,
    max_tokens: openaiReq.max_tokens || openaiReq.max_completion_tokens || 1024, // REQUIRED by Anthropic
    messages,
    ...(systemParts.length ? { system: systemParts.join('\n\n') } : {}),
    ...(stream ? { stream: true } : {}),
  };
  if (openaiReq.temperature != null) body.temperature = openaiReq.temperature;
  if (openaiReq.stop) body.stop_sequences = Array.isArray(openaiReq.stop) ? openaiReq.stop : [openaiReq.stop];
  if (Array.isArray(openaiReq.tools) && openaiReq.tools.length) {
    body.tools = openaiReq.tools
      .filter((t) => t.type === 'function' && t.function)
      .map((t) => ({ name: t.function.name, description: t.function.description || '', input_schema: t.function.parameters || { type: 'object', properties: {} } }));
    if (openaiReq.tool_choice) {
      const tc = openaiReq.tool_choice;
      body.tool_choice = tc === 'auto' ? { type: 'auto' }
        : tc === 'none' ? { type: 'none' }
        : tc === 'required' ? { type: 'any' }
        : (tc.type === 'function' ? { type: 'tool', name: tc.function?.name } : { type: 'auto' });
    }
  }
  return body;
}

export const url = (baseUrl) => `${baseUrl.replace(/\/$/, '')}/v1/messages`;
export const headers = (apiKey) => ({
  'content-type': 'application/json',
  'x-api-key': apiKey,
  'anthropic-version': '2023-06-01',
});

function usageFrom(u = {}) {
  return {
    prompt_tokens: u.input_tokens ?? 0,
    completion_tokens: u.output_tokens ?? 0,
    cache_read_tokens: u.cache_read_input_tokens ?? 0,
    cache_write_tokens: u.cache_creation_input_tokens ?? 0,
  };
}

export function parseFull(json, model) {
  const text = (json.content || []).filter((b) => b.type === 'text').map((b) => b.text).join('');
  const toolUses = (json.content || []).filter((b) => b.type === 'tool_use');
  const message = { role: 'assistant', content: text || null };
  if (toolUses.length) {
    message.tool_calls = toolUses.map((b) => ({
      id: b.id, type: 'function',
      function: { name: b.name, arguments: JSON.stringify(b.input ?? {}) },
    }));
  }
  return {
    openaiResponse: openaiResponse({
      id: cmplId(), model, message,
      finishReason: STOP_MAP[json.stop_reason] || 'stop',
      usage: usageFrom(json.usage),
    }),
    usage: usageFrom(json.usage),
  };
}

// Streaming: fold Anthropic SSE events into OpenAI chunk deltas.
export function newStreamState(model, _opts = {}) {
  return { id: cmplId(), model, usage: zeroUsage(), finish: null, toolIndex: -1, blockType: null };
}

export function onEvent(st, ev) {
  const out = [];
  let data;
  try { data = JSON.parse(ev.data); } catch { return { deltas: out }; }
  const t = data.type;
  if (t === 'message_start') {
    if (data.message?.usage) Object.assign(st.usage, usageFrom(data.message.usage));
    out.push(openaiChunk({ id: st.id, model: st.model, delta: { role: 'assistant', content: '' } }));
  } else if (t === 'content_block_start') {
    st.blockType = data.content_block?.type;
    if (st.blockType === 'tool_use') {
      st.toolIndex += 1;
      out.push(openaiChunk({ id: st.id, model: st.model, delta: { tool_calls: [{
        index: st.toolIndex, id: data.content_block.id, type: 'function',
        function: { name: data.content_block.name, arguments: '' },
      }] } }));
    }
  } else if (t === 'content_block_delta') {
    const d = data.delta || {};
    if (d.type === 'text_delta') {
      out.push(openaiChunk({ id: st.id, model: st.model, delta: { content: d.text } }));
    } else if (d.type === 'input_json_delta') {
      out.push(openaiChunk({ id: st.id, model: st.model, delta: { tool_calls: [{
        index: st.toolIndex, function: { arguments: d.partial_json || '' },
      }] } }));
    }
  } else if (t === 'message_delta') {
    if (data.usage) st.usage.completion_tokens = data.usage.output_tokens ?? st.usage.completion_tokens;
    if (data.delta?.stop_reason) st.finish = STOP_MAP[data.delta.stop_reason] || 'stop';
  } else if (t === 'message_stop') {
    out.push(openaiChunk({ id: st.id, model: st.model, delta: {}, finishReason: st.finish || 'stop' }));
    return { deltas: out, usage: st.usage, done: true };
  }
  return { deltas: out };
}
