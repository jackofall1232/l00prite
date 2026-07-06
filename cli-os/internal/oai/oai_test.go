package oai

import "testing"

func TestUsageMapIncludesCacheTokensInTotals(t *testing.T) {
	u := UsageMap(Usage{PromptTokens: 100, CompletionTokens: 20, CacheReadTokens: 900, CacheWriteTokens: 50})
	if u["prompt_tokens"] != 1050 {
		t.Fatalf("prompt_tokens must carry the full input size (uncached+read+write), got %v", u["prompt_tokens"])
	}
	if u["total_tokens"] != 1070 {
		t.Fatalf("total_tokens want 1070 got %v", u["total_tokens"])
	}
	details := u["prompt_tokens_details"].(map[string]any)
	if details["cached_tokens"] != 900 {
		t.Fatalf("cached_tokens want 900 got %v", details["cached_tokens"])
	}
}

func TestUsageMapOmitsDetailsWithoutCacheReads(t *testing.T) {
	u := UsageMap(Usage{PromptTokens: 10, CompletionTokens: 5})
	if u["prompt_tokens"] != 10 || u["total_tokens"] != 15 {
		t.Fatalf("plain usage must be unchanged, got %v", u)
	}
	if _, ok := u["prompt_tokens_details"]; ok {
		t.Fatalf("prompt_tokens_details must be omitted when nothing was cached")
	}
}
