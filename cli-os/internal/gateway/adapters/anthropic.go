// Anthropic native adapter. Anthropic has no production OpenAI-compatible endpoint, so this is a
// real bidirectional translator: OpenAI Chat Completions <-> /v1/messages, including the
// system-as-field difference, input_schema tools, tool_use/tool_result blocks, and the typed SSE
// event stream rebuilt into OpenAI chunk deltas. Ported from anthropic.js.
package adapters

import (
	"encoding/json"
	"regexp"
	"strings"

	"github.com/jackofall1232/l00prite/cli-os/internal/oai"
	"github.com/jackofall1232/l00prite/cli-os/internal/util"
)

type anthropicAdapter struct{}

func (anthropicAdapter) Kind() string { return "native-messages" }
func (anthropicAdapter) Direct() bool { return false }

var stopMap = map[string]string{
	"end_turn": "stop", "max_tokens": "length", "stop_sequence": "stop",
	"tool_use": "tool_calls", "refusal": "content_filter", "pause_turn": "stop",
}

var dataURIRE = regexp.MustCompile(`^data:([^;]+);base64,(.*)$`)

func imageBlock(url string) map[string]any {
	if m := dataURIRE.FindStringSubmatch(url); m != nil {
		return map[string]any{"type": "image", "source": map[string]any{"type": "base64", "media_type": m[1], "data": m[2]}}
	}
	return map[string]any{"type": "image", "source": map[string]any{"type": "url", "url": url}}
}

// toAnthropicContent converts an OpenAI message content into Anthropic content blocks. Explicit
// cache_control markers on inbound parts (the OpenRouter convention for OpenAI-shaped requests)
// are carried through so clients keep control of their own breakpoint placement.
func toAnthropicContent(content any) []any {
	if arr := asArr(content); arr != nil {
		out := make([]any, 0, len(arr))
		for _, p := range arr {
			pm := asMap(p)
			switch {
			case pm != nil && asStr(pm["type"]) == "text":
				block := map[string]any{"type": "text", "text": pm["text"]}
				if cc := asMap(pm["cache_control"]); cc != nil {
					block["cache_control"] = cc
				}
				out = append(out, block)
			case pm != nil && asStr(pm["type"]) == "image_url":
				block := imageBlock(asStr(asMap(pm["image_url"])["url"]))
				if cc := asMap(pm["cache_control"]); cc != nil {
					block["cache_control"] = cc
				}
				out = append(out, block)
			default:
				if s, ok := p.(string); ok {
					out = append(out, map[string]any{"type": "text", "text": s})
				} else {
					out = append(out, map[string]any{"type": "text", "text": jsonStringify(p)})
				}
			}
		}
		return out
	}
	// non-array content: single text block (nil -> "")
	text := ""
	if content != nil {
		text = asStr(content)
	}
	return []any{map[string]any{"type": "text", "text": text}}
}

func (anthropicAdapter) BuildRequest(model string, req map[string]any, stream bool) map[string]any {
	// Per-request-volatile system text (the gateway's memory digest), tagged by InjectMemory via
	// the top-level "l00prite" hint channel. The hint never reaches the wire: this adapter
	// rebuilds the body field-by-field, and the openai-compat adapter strips the key.
	volatileSystem := asStr(asMap(req["l00prite"])["volatile_system"])

	var sysBlocks []map[string]any
	var messages []any
	for _, mm := range asArr(req["messages"]) {
		m := asMap(mm)
		if m == nil {
			continue
		}
		role := asStr(m["role"])
		switch {
		case role == "system":
			if s, ok := m["content"].(string); ok {
				sysBlocks = append(sysBlocks, map[string]any{"type": "text", "text": s})
			} else {
				// One block per system message ("\n"-joined parts, matching the old flat form);
				// an explicit client cache_control on any part stays on the block.
				var texts []string
				var cc map[string]any
				for _, b := range toAnthropicContent(m["content"]) {
					bm := asMap(b)
					if asStr(bm["type"]) == "text" {
						texts = append(texts, asStr(bm["text"]))
						if c := asMap(bm["cache_control"]); c != nil {
							cc = c
						}
					}
				}
				blk := map[string]any{"type": "text", "text": strings.Join(texts, "\n")}
				if cc != nil {
					blk["cache_control"] = cc
				}
				sysBlocks = append(sysBlocks, blk)
			}
		case role == "tool":
			messages = append(messages, map[string]any{
				"role": "user",
				"content": []any{map[string]any{
					"type": "tool_result", "tool_use_id": m["tool_call_id"], "content": asStrOrEmpty(m["content"]),
				}},
			})
		case role == "assistant" && len(asArr(m["tool_calls"])) > 0:
			var blocks []any
			if m["content"] != nil && asStr(m["content"]) != "" {
				blocks = append(blocks, map[string]any{"type": "text", "text": asStr(m["content"])})
			}
			for _, tcRaw := range asArr(m["tool_calls"]) {
				tc := asMap(tcRaw)
				fn := asMap(tc["function"])
				var input any = map[string]any{}
				args := asStr(fn["arguments"])
				if args == "" {
					args = "{}"
				}
				var parsed any
				if err := json.Unmarshal([]byte(args), &parsed); err == nil {
					input = parsed
				}
				blocks = append(blocks, map[string]any{"type": "tool_use", "id": tc["id"], "name": fn["name"], "input": input})
			}
			messages = append(messages, map[string]any{"role": "assistant", "content": blocks})
		default:
			r := "user"
			if role == "assistant" {
				r = "assistant"
			}
			messages = append(messages, map[string]any{"role": r, "content": toAnthropicContent(m["content"])})
		}
	}

	maxTokens := numToInt(req["max_tokens"])
	if maxTokens == 0 {
		maxTokens = numToInt(req["max_completion_tokens"])
	}
	if maxTokens == 0 {
		maxTokens = 1024
	}

	body := map[string]any{
		"model":      model,
		"max_tokens": maxTokens, // REQUIRED by Anthropic
		"messages":   messages,
	}
	if stream {
		body["stream"] = true
	}
	if req["temperature"] != nil {
		body["temperature"] = req["temperature"]
	}
	if stop := req["stop"]; jsTruthy(stop) {
		if arr := asArr(stop); arr != nil {
			body["stop_sequences"] = arr
		} else {
			body["stop_sequences"] = []any{stop}
		}
	}
	toolsJSONLen := 0
	if tools := asArr(req["tools"]); len(tools) > 0 {
		outTools := []any{} // matches Node: a client `tools` present but all-non-function yields []
		for _, tRaw := range tools {
			t := asMap(tRaw)
			if asStr(t["type"]) != "function" || asMap(t["function"]) == nil {
				continue
			}
			fn := asMap(t["function"])
			desc := asStr(fn["description"])
			var schema any = fn["parameters"]
			if schema == nil {
				schema = map[string]any{"type": "object", "properties": map[string]any{}}
			}
			outTools = append(outTools, map[string]any{"name": fn["name"], "description": desc, "input_schema": schema})
		}
		body["tools"] = outTools
		toolsJSONLen = len(jsonStringify(outTools))
		if tcRaw := req["tool_choice"]; jsTruthy(tcRaw) {
			body["tool_choice"] = translateToolChoice(tcRaw)
		}
	}

	// Prompt-cache breakpoints: only for models whose manifest row declares prompt_cache, and only
	// when the client placed no explicit cache_control of its own (client placement wins — the API
	// caps a request at 4 breakpoints, so stacking auto markers on top could 400).
	explicitSystem := false
	for _, b := range sysBlocks {
		if b["cache_control"] != nil {
			explicitSystem = true
		}
	}
	autoCache := promptCacheable(model) && !explicitSystem && !hasCacheControl(messages)
	switch {
	case len(sysBlocks) == 0:
		// no system content
	case explicitSystem:
		// Client manages its own breakpoints: forward the system blocks verbatim.
		arr := make([]any, 0, len(sysBlocks))
		for _, b := range sysBlocks {
			arr = append(arr, b)
		}
		body["system"] = arr
	case autoCache:
		// Split stable protocol content from per-request-volatile content (the memory digest).
		// cache_control is a prefix match: a volatile part sitting ahead of (or merged into) the
		// stable text invalidates the cache on every call. Stable goes first and carries the
		// breakpoint (caching tools+system, since tools render first; reads ~0.1x input, 5m
		// writes 1.25x — see manifest cache pricing); volatile goes last and is never marked —
		// a marker there would pay the write premium with no read ever hitting it.
		var stableParts, volatileParts []string
		for _, b := range sysBlocks {
			if t := asStr(b["text"]); volatileSystem != "" && t == volatileSystem {
				volatileParts = append(volatileParts, t)
			} else {
				stableParts = append(stableParts, t)
			}
		}
		stable := strings.Join(stableParts, "\n\n")
		volatile := strings.Join(volatileParts, "\n\n")
		// The cacheable prefix is tools+system. Below the model's minimum the API silently
		// ignores markers, so don't emit dead ones. The estimator rounds up (ceil(chars/3.5)),
		// which errs toward emitting — a harmless no-op — over suppressing a live marker.
		markStable := stable != "" &&
			util.EstimateTokensFromChars(len(stable)+toolsJSONLen) >= promptCacheMinTokens(model)
		stableBlock := map[string]any{"type": "text", "text": stable}
		if markStable {
			stableBlock["cache_control"] = map[string]any{"type": "ephemeral"}
		}
		switch {
		case volatile == "" && markStable:
			body["system"] = []any{stableBlock}
		case volatile == "":
			body["system"] = stable // no marker to carry — keep the plain-string form
		case stable == "":
			body["system"] = volatile // all volatile: nothing cacheable
		default:
			body["system"] = []any{stableBlock, map[string]any{"type": "text", "text": volatile}}
		}
	default:
		// Not cache-capable: flat string join in inbound order — the pre-caching wire shape.
		var texts []string
		for _, b := range sysBlocks {
			texts = append(texts, asStr(b["text"]))
		}
		body["system"] = strings.Join(texts, "\n\n")
	}
	if autoCache && len(messages) > 0 {
		// Second breakpoint on the last content block: multi-turn/tool-loop requests re-send the
		// whole conversation, so each call reads the previous call's prefix and writes only the
		// new tail. Prefixes below the model's cacheable minimum silently no-op at no premium.
		if blocks := asArr(asMap(messages[len(messages)-1])["content"]); len(blocks) > 0 {
			if bm := asMap(blocks[len(blocks)-1]); bm != nil {
				bm["cache_control"] = map[string]any{"type": "ephemeral"}
			}
		}
	}
	return body
}

// promptCacheable reports whether the model's manifest row (anthropic manifest — the only
// native-messages provider) declares prompt_cache support. Unknown models fail closed: a
// Claude-compatible endpoint serving non-Claude ids never gets speculative cache markers.
func promptCacheable(model string) bool {
	return CapabilitiesFor("anthropic", model)["prompt_cache"] == true
}

// promptCacheMinTokens returns the model's minimum cacheable prefix size (manifest capability
// prompt_cache_min_tokens); 0 — never suppress — when the manifest doesn't declare one, since
// a marker below the real minimum is a free no-op while a suppressed live marker costs money.
func promptCacheMinTokens(model string) int {
	return numToInt(CapabilitiesFor("anthropic", model)["prompt_cache_min_tokens"])
}

// hasCacheControl reports whether any built content block carries an explicit cache_control
// marker (i.e. the client is managing its own breakpoints).
func hasCacheControl(messages []any) bool {
	for _, mm := range messages {
		for _, b := range asArr(asMap(mm)["content"]) {
			if bm := asMap(b); bm != nil && bm["cache_control"] != nil {
				return true
			}
		}
	}
	return false
}

func translateToolChoice(tc any) map[string]any {
	if s, ok := tc.(string); ok {
		switch s {
		case "auto":
			return map[string]any{"type": "auto"}
		case "none":
			return map[string]any{"type": "none"}
		case "required":
			return map[string]any{"type": "any"}
		default:
			return map[string]any{"type": "auto"}
		}
	}
	if m := asMap(tc); m != nil && asStr(m["type"]) == "function" {
		return map[string]any{"type": "tool", "name": asMap(m["function"])["name"]}
	}
	return map[string]any{"type": "auto"}
}

func (anthropicAdapter) URL(baseURL string) string {
	return strings.TrimSuffix(baseURL, "/") + "/v1/messages"
}

func (anthropicAdapter) Headers(apiKey string) map[string]string {
	return map[string]string{
		"content-type":      "application/json",
		"x-api-key":         apiKey,
		"anthropic-version": "2023-06-01",
	}
}

func usageFrom(u map[string]any) oai.Usage {
	return oai.Usage{
		PromptTokens:     numToInt(u["input_tokens"]),
		CompletionTokens: numToInt(u["output_tokens"]),
		CacheReadTokens:  numToInt(u["cache_read_input_tokens"]),
		CacheWriteTokens: numToInt(u["cache_creation_input_tokens"]),
	}
}

func (anthropicAdapter) ParseFull(resp map[string]any, model string) FullResult {
	content := asArr(resp["content"])
	var textParts []string
	var toolUses []map[string]any
	for _, b := range content {
		bm := asMap(b)
		switch asStr(bm["type"]) {
		case "text":
			textParts = append(textParts, asStr(bm["text"]))
		case "tool_use":
			toolUses = append(toolUses, bm)
		}
	}
	text := strings.Join(textParts, "")
	message := map[string]any{"role": "assistant"}
	if text != "" {
		message["content"] = text
	} else {
		message["content"] = nil
	}
	if len(toolUses) > 0 {
		var calls []any
		for _, b := range toolUses {
			input := b["input"]
			if input == nil {
				input = map[string]any{}
			}
			calls = append(calls, map[string]any{
				"id": b["id"], "type": "function",
				"function": map[string]any{"name": b["name"], "arguments": jsonStringify(input)},
			})
		}
		message["tool_calls"] = calls
	}
	u := usageFrom(asMap(resp["usage"]))
	finish := stopMap[asStr(resp["stop_reason"])]
	if finish == "" {
		finish = "stop"
	}
	return FullResult{
		Response: oai.Response(oai.CmplID(), model, message, finish, u),
		Usage:    u,
	}
}

func (anthropicAdapter) NewStream(model string, _ bool) StreamTranslator {
	return &anthropicStream{id: oai.CmplID(), model: model, usage: oai.ZeroUsage(), toolIndex: -1}
}

type anthropicStream struct {
	id        string
	model     string
	usage     oai.Usage
	finish    string
	toolIndex int
	blockType string
}

func (s *anthropicStream) OnEvent(ev SSEEvent) StreamOut {
	var data map[string]any
	if err := json.Unmarshal([]byte(ev.Data), &data); err != nil {
		return StreamOut{}
	}
	var out []map[string]any
	switch asStr(data["type"]) {
	case "message_start":
		if msg := asMap(data["message"]); msg != nil {
			if u := asMap(msg["usage"]); u != nil {
				s.usage = usageFrom(u)
			}
		}
		out = append(out, oai.Chunk(s.id, s.model, map[string]any{"role": "assistant", "content": ""}, nil))
	case "content_block_start":
		cb := asMap(data["content_block"])
		s.blockType = asStr(cb["type"])
		if s.blockType == "tool_use" {
			s.toolIndex++
			out = append(out, oai.Chunk(s.id, s.model, map[string]any{"tool_calls": []any{map[string]any{
				"index": s.toolIndex, "id": cb["id"], "type": "function",
				"function": map[string]any{"name": cb["name"], "arguments": ""},
			}}}, nil))
		}
	case "content_block_delta":
		d := asMap(data["delta"])
		switch asStr(d["type"]) {
		case "text_delta":
			out = append(out, oai.Chunk(s.id, s.model, map[string]any{"content": d["text"]}, nil))
		case "input_json_delta":
			pj := asStr(d["partial_json"])
			out = append(out, oai.Chunk(s.id, s.model, map[string]any{"tool_calls": []any{map[string]any{
				"index": s.toolIndex, "function": map[string]any{"arguments": pj},
			}}}, nil))
		}
	case "message_delta":
		if u := asMap(data["usage"]); u != nil {
			// Mirror `output_tokens ?? st.usage.completion_tokens`: a null/absent value keeps the prior
			// count (set at message_start) rather than resetting it to 0.
			if v := u["output_tokens"]; v != nil {
				s.usage.CompletionTokens = numToInt(v)
			}
		}
		if d := asMap(data["delta"]); d != nil {
			if sr := asStr(d["stop_reason"]); sr != "" {
				if mapped, ok := stopMap[sr]; ok {
					s.finish = mapped
				} else {
					s.finish = "stop"
				}
			}
		}
	case "message_stop":
		fin := s.finish
		if fin == "" {
			fin = "stop"
		}
		out = append(out, oai.Chunk(s.id, s.model, map[string]any{}, fin))
		u := s.usage
		return StreamOut{Deltas: out, Usage: &u, Done: true}
	}
	return StreamOut{Deltas: out}
}

// Usage returns the token counts accumulated so far (fallback when a stream ends before message_stop).
func (s *anthropicStream) Usage() oai.Usage { return s.usage }

// asStrOrEmpty mirrors String(content ?? ”) — null/undefined becomes "".
func asStrOrEmpty(v any) string {
	if v == nil {
		return ""
	}
	if s, ok := v.(string); ok {
		return s
	}
	return jsonStringify(v)
}
