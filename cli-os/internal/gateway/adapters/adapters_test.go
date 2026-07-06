package adapters

import (
	"strings"
	"testing"

	"github.com/jackofall1232/l00prite/cli-os/internal/oai"
)

func TestAnthropicRequestTranslation(t *testing.T) {
	a := anthropicAdapter{}
	req := map[string]any{
		"model": "x", "max_tokens": float64(256),
		"messages": []any{
			map[string]any{"role": "system", "content": "be terse"},
			map[string]any{"role": "user", "content": "hi"},
		},
		"tools": []any{map[string]any{"type": "function", "function": map[string]any{
			"name": "get_weather", "description": "w",
			"parameters": map[string]any{"type": "object", "properties": map[string]any{"q": map[string]any{"type": "string"}}},
		}}},
		"tool_choice": "auto",
	}
	body := a.BuildRequest("claude-x", req, false)
	if body["system"] != "be terse" {
		t.Fatalf("system must be a top-level field, got %v", body["system"])
	}
	if numToInt(body["max_tokens"]) != 256 {
		t.Fatalf("max_tokens want 256 got %v", body["max_tokens"])
	}
	if len(asArr(body["messages"])) != 1 {
		t.Fatalf("system message must not remain in messages, got %d", len(asArr(body["messages"])))
	}
	tool0 := asMap(asArr(body["tools"])[0])
	if tool0["name"] != "get_weather" {
		t.Fatalf("tool name want get_weather got %v", tool0["name"])
	}
	if tool0["input_schema"] == nil {
		t.Fatalf("tools must use input_schema, not function wrapper")
	}
	tc := asMap(body["tool_choice"])
	if tc["type"] != "auto" {
		t.Fatalf("tool_choice want {type:auto} got %v", tc)
	}
}

func TestAnthropicSSEFold(t *testing.T) {
	a := anthropicAdapter{}
	st := a.NewStream("claude-x", false)
	events := []SSEEvent{
		{Data: `{"type":"message_start","message":{"usage":{"input_tokens":10,"output_tokens":0}}}`},
		{Data: `{"type":"content_block_start","index":0,"content_block":{"type":"text"}}`},
		{Data: `{"type":"content_block_delta","index":0,"delta":{"type":"text_delta","text":"Hello"}}`},
		{Data: `{"type":"content_block_delta","index":0,"delta":{"type":"text_delta","text":" world"}}`},
		{Data: `{"type":"message_delta","delta":{"stop_reason":"end_turn"},"usage":{"output_tokens":2}}`},
		{Data: `{"type":"message_stop"}`},
	}
	var text strings.Builder
	done := false
	var usage *oai.Usage
	for _, ev := range events {
		out := st.OnEvent(ev)
		for _, ch := range out.Deltas {
			d := asMap(asMap(asArr(ch["choices"])[0])["delta"])
			if c, ok := d["content"].(string); ok {
				text.WriteString(c)
			}
		}
		if out.Usage != nil {
			usage = out.Usage
		}
		if out.Done {
			done = true
		}
	}
	if text.String() != "Hello world" {
		t.Fatalf("text want %q got %q", "Hello world", text.String())
	}
	if !done {
		t.Fatalf("stream must finish")
	}
	if usage == nil || usage.PromptTokens != 10 || usage.CompletionTokens != 2 {
		t.Fatalf("usage want in=10 out=2 got %+v", usage)
	}
}

// bigSystem is comfortably above every model's minimum cacheable prefix under the
// ceil(chars/3.5) estimator (~22KB ≈ 6.3K estimated tokens vs the 4096 Opus-tier minimum).
var bigSystem = strings.Repeat("l00prite protocol scaffold line. ", 700)

func TestAnthropicPromptCacheInjection(t *testing.T) {
	a := anthropicAdapter{}
	req := map[string]any{
		"messages": []any{
			map[string]any{"role": "system", "content": bigSystem},
			map[string]any{"role": "user", "content": "hi"},
			map[string]any{"role": "assistant", "content": "hello"},
			map[string]any{"role": "user", "content": "again"},
		},
	}
	body := a.BuildRequest("claude-opus-4-8", req, false)

	sys := asArr(body["system"])
	if len(sys) != 1 {
		t.Fatalf("cache-capable model must get system as a block array, got %T", body["system"])
	}
	sysBlock := asMap(sys[0])
	if asStr(sysBlock["text"]) != bigSystem {
		t.Fatalf("system text must be unchanged, got %d chars", len(asStr(sysBlock["text"])))
	}
	if cc := asMap(sysBlock["cache_control"]); asStr(cc["type"]) != "ephemeral" {
		t.Fatalf("system block must carry an ephemeral cache_control, got %v", sysBlock["cache_control"])
	}

	msgs := asArr(body["messages"])
	lastBlocks := asArr(asMap(msgs[len(msgs)-1])["content"])
	lastBlock := asMap(lastBlocks[len(lastBlocks)-1])
	if cc := asMap(lastBlock["cache_control"]); asStr(cc["type"]) != "ephemeral" {
		t.Fatalf("last content block must carry an ephemeral cache_control, got %v", lastBlock)
	}
	firstBlock := asMap(asArr(asMap(msgs[0])["content"])[0])
	if firstBlock["cache_control"] != nil {
		t.Fatalf("only the last block gets the auto marker, first block got %v", firstBlock)
	}
}

func TestAnthropicUnknownModelGetsNoCacheMarkers(t *testing.T) {
	a := anthropicAdapter{}
	req := map[string]any{
		"messages": []any{
			map[string]any{"role": "system", "content": "be terse"},
			map[string]any{"role": "user", "content": "hi"},
		},
	}
	body := a.BuildRequest("claude-x", req, false)
	if body["system"] != "be terse" {
		t.Fatalf("unknown model must keep the flat-string system, got %v", body["system"])
	}
	msgs := asArr(body["messages"])
	lastBlock := asMap(asArr(asMap(msgs[len(msgs)-1])["content"])[0])
	if lastBlock["cache_control"] != nil {
		t.Fatalf("unknown model must get no cache markers, got %v", lastBlock)
	}
}

func TestAnthropicExplicitCacheControlWins(t *testing.T) {
	a := anthropicAdapter{}
	req := map[string]any{
		"messages": []any{
			map[string]any{"role": "system", "content": "be terse"},
			map[string]any{"role": "user", "content": []any{
				map[string]any{"type": "text", "text": "big context", "cache_control": map[string]any{"type": "ephemeral", "ttl": "1h"}},
				map[string]any{"type": "text", "text": "question"},
			}},
		},
	}
	body := a.BuildRequest("claude-opus-4-8", req, false)
	msgs := asArr(body["messages"])
	blocks := asArr(asMap(msgs[0])["content"])
	if cc := asMap(asMap(blocks[0])["cache_control"]); asStr(cc["ttl"]) != "1h" {
		t.Fatalf("explicit cache_control must pass through verbatim, got %v", blocks[0])
	}
	if asMap(blocks[1])["cache_control"] != nil {
		t.Fatalf("auto-injection must be skipped when the client placed its own markers, got %v", blocks[1])
	}
	if body["system"] != "be terse" {
		t.Fatalf("auto system breakpoint must be skipped when the client placed markers, got %v", body["system"])
	}
}

func TestAnthropicSystemSplitsStableAndVolatile(t *testing.T) {
	a := anthropicAdapter{}
	digest := "repository context digest for turn 42"
	req := map[string]any{
		"l00prite": map[string]any{"volatile_system": digest},
		"messages": []any{
			map[string]any{"role": "system", "content": digest}, // InjectMemory prepends the digest
			map[string]any{"role": "system", "content": bigSystem},
			map[string]any{"role": "user", "content": "plan the next unit"},
		},
	}
	body := a.BuildRequest("claude-opus-4-8", req, false)

	sys := asArr(body["system"])
	if len(sys) != 2 {
		t.Fatalf("system must split into [stable, volatile], got %v", body["system"])
	}
	stable, volatile := asMap(sys[0]), asMap(sys[1])
	if asStr(stable["text"]) != bigSystem {
		t.Fatalf("block 0 must be the stable content, got %d chars", len(asStr(stable["text"])))
	}
	if cc := asMap(stable["cache_control"]); asStr(cc["type"]) != "ephemeral" {
		t.Fatalf("stable block must carry the breakpoint, got %v", stable["cache_control"])
	}
	if asStr(volatile["text"]) != digest {
		t.Fatalf("last block must be the volatile digest, got %v", volatile["text"])
	}
	if volatile["cache_control"] != nil {
		t.Fatalf("volatile block must never carry a marker (write premium with no reads), got %v", volatile)
	}
	if _, leaked := body["l00prite"]; leaked {
		t.Fatalf("the gateway hint must not reach the wire body")
	}
}

func TestAnthropicStablePrefixIdenticalAcrossDigests(t *testing.T) {
	a := anthropicAdapter{}
	build := func(digest string) map[string]any {
		return a.BuildRequest("claude-opus-4-8", map[string]any{
			"l00prite": map[string]any{"volatile_system": digest},
			"messages": []any{
				map[string]any{"role": "system", "content": digest},
				map[string]any{"role": "system", "content": bigSystem},
				map[string]any{"role": "user", "content": "go"},
			},
		}, false)
	}
	a1, a2 := build("digest turn 1: ledger tail A"), build("digest turn 2: ledger tail B")
	s1, s2 := asArr(a1["system"]), asArr(a2["system"])
	// The marked stable block must serialize byte-identically across calls — that byte equality
	// is exactly what Anthropic's prefix match hashes, so identical bytes = a cache hit.
	if jsonStringify(s1[0]) != jsonStringify(s2[0]) {
		t.Fatalf("stable breakpoint block must be byte-identical across digests:\n%s\nvs\n%s",
			jsonStringify(s1[0]), jsonStringify(s2[0]))
	}
	if asStr(asMap(s1[1])["text"]) == asStr(asMap(s2[1])["text"]) {
		t.Fatalf("volatile blocks should differ between the two calls")
	}
}

func TestAnthropicExplicitSystemCacheControlWins(t *testing.T) {
	a := anthropicAdapter{}
	req := map[string]any{
		"l00prite": map[string]any{"volatile_system": "digest"},
		"messages": []any{
			map[string]any{"role": "system", "content": []any{
				map[string]any{"type": "text", "text": "pinned context", "cache_control": map[string]any{"type": "ephemeral", "ttl": "1h"}},
			}},
			map[string]any{"role": "system", "content": "digest"},
			map[string]any{"role": "user", "content": "hi"},
		},
	}
	body := a.BuildRequest("claude-opus-4-8", req, false)

	sys := asArr(body["system"])
	if len(sys) != 2 {
		t.Fatalf("explicit markers must forward the system blocks verbatim, got %v", body["system"])
	}
	if cc := asMap(asMap(sys[0])["cache_control"]); asStr(cc["ttl"]) != "1h" {
		t.Fatalf("client marker must pass through verbatim, got %v", sys[0])
	}
	if asMap(sys[1])["cache_control"] != nil {
		t.Fatalf("no auto marker may be added next to explicit client markers, got %v", sys[1])
	}
	// Auto-injection is disabled entirely: the conversation marker must be absent too.
	msgs := asArr(body["messages"])
	lastBlock := asMap(asArr(asMap(msgs[len(msgs)-1])["content"])[0])
	if lastBlock["cache_control"] != nil {
		t.Fatalf("explicit system markers must disable the auto conversation breakpoint, got %v", lastBlock)
	}
}

func TestAnthropicStableBelowMinimumEmitsNoSystemMarker(t *testing.T) {
	a := anthropicAdapter{}
	req := map[string]any{
		"l00prite": map[string]any{"volatile_system": "digest"},
		"messages": []any{
			map[string]any{"role": "system", "content": "digest"},
			map[string]any{"role": "system", "content": "be terse"}, // far below the 4096-token Opus minimum
			map[string]any{"role": "user", "content": "hi"},
		},
	}
	body := a.BuildRequest("claude-opus-4-8", req, false)

	sys := asArr(body["system"])
	if len(sys) != 2 {
		t.Fatalf("split shape is kept below the minimum, got %v", body["system"])
	}
	for i, b := range sys {
		if asMap(b)["cache_control"] != nil {
			t.Fatalf("no system marker may be emitted below the model's cacheable minimum, block %d: %v", i, b)
		}
	}
	// The conversation breakpoint is not minimum-gated: the growing prompt crosses the minimum
	// quickly in tool loops, and below it the API treats the marker as a free no-op.
	msgs := asArr(body["messages"])
	lastBlock := asMap(asArr(asMap(msgs[len(msgs)-1])["content"])[0])
	if cc := asMap(lastBlock["cache_control"]); asStr(cc["type"]) != "ephemeral" {
		t.Fatalf("conversation breakpoint must stay, got %v", lastBlock)
	}
}

func TestOpenAICompatCachedTokensDisjoint(t *testing.T) {
	u := normUsage(map[string]any{
		"prompt_tokens": float64(1000), "completion_tokens": float64(10),
		"prompt_tokens_details": map[string]any{"cached_tokens": float64(900)},
	})
	if u.PromptTokens != 100 || u.CacheReadTokens != 900 {
		t.Fatalf("prompt_tokens must exclude the cached portion (disjoint accounting), got %+v", u)
	}
	// A provider reporting cached > prompt is malformed; clamp instead of going negative.
	u = normUsage(map[string]any{
		"prompt_tokens": float64(50),
		"prompt_tokens_details": map[string]any{"cached_tokens": float64(80)},
	})
	if u.PromptTokens != 0 || u.CacheReadTokens != 50 {
		t.Fatalf("cached tokens must clamp to prompt_tokens, got %+v", u)
	}
}

func TestOpenAICompatDropsStreamOptions(t *testing.T) {
	oc := openaiCompatAdapter{}
	body := oc.BuildRequest("gpt-x", map[string]any{
		"messages": []any{}, "stream": true, "stream_options": map[string]any{"include_usage": true},
	}, false)
	if _, ok := body["stream"]; ok {
		t.Fatalf("stream must be dropped on a non-stream call")
	}
	if _, ok := body["stream_options"]; ok {
		t.Fatalf("stream_options must not accompany a non-stream request")
	}
}
