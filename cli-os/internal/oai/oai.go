// Package oai holds the OpenAI wire shapes shared by the adapters and the gateway: the internal
// Usage struct and the chat.completion / chat.completion.chunk builders (ported from base.js).
// Bodies are modelled as map[string]any so unknown fields pass through verbatim, exactly as the
// dynamic JS objects did — critical for the openai-compat passthrough adapter.
package oai

import (
	"crypto/rand"
	"encoding/hex"
	"time"
)

// Usage is the gateway's normalized token accounting, separate input/output/cache-read/cache-write.
type Usage struct {
	PromptTokens     int `json:"prompt_tokens"`
	CompletionTokens int `json:"completion_tokens"`
	CacheReadTokens  int `json:"cache_read_tokens"`
	CacheWriteTokens int `json:"cache_write_tokens"`
}

// ZeroUsage returns an all-zero Usage.
func ZeroUsage() Usage { return Usage{} }

// Created returns the current unix seconds (OpenAI "created" field).
func Created() int64 { return time.Now().Unix() }

// CmplID mints a "chatcmpl-<24 hex>" id.
func CmplID() string {
	b := make([]byte, 12)
	if _, err := rand.Read(b); err != nil {
		return "chatcmpl-" + hex.EncodeToString([]byte(time.Now().Format("150405.000000000")))
	}
	return "chatcmpl-" + hex.EncodeToString(b)
}

// UsageMap renders Usage in the OpenAI response shape. prompt_tokens carries the FULL input size
// (uncached + cache reads + cache writes) per OpenAI semantics, where cached_tokens is a subset of
// prompt_tokens; cache writes have no OpenAI field of their own, so they fold into the total
// (they are still real input tokens the provider processed).
func UsageMap(u Usage) map[string]any {
	prompt := u.PromptTokens + u.CacheReadTokens + u.CacheWriteTokens
	usage := map[string]any{
		"prompt_tokens":     prompt,
		"completion_tokens": u.CompletionTokens,
		"total_tokens":      prompt + u.CompletionTokens,
	}
	if u.CacheReadTokens != 0 {
		usage["prompt_tokens_details"] = map[string]any{"cached_tokens": u.CacheReadTokens}
	}
	return usage
}

// Response builds an OpenAI chat.completion object. Usage is rendered via UsageMap, so cached
// tokens stay inside prompt_tokens instead of making the total collapse when a cache hits.
func Response(id, model string, message map[string]any, finishReason string, u Usage) map[string]any {
	usage := UsageMap(u)
	return map[string]any{
		"id":      id,
		"object":  "chat.completion",
		"created": Created(),
		"model":   model,
		"choices": []any{map[string]any{"index": 0, "message": message, "finish_reason": finishReason, "logprobs": nil}},
		"usage":   usage,
	}
}

// Chunk builds an OpenAI chat.completion.chunk. finishReason is nil for intermediate chunks and a
// string for the terminal chunk.
func Chunk(id, model string, delta map[string]any, finishReason any) map[string]any {
	return map[string]any{
		"id":      id,
		"object":  "chat.completion.chunk",
		"created": Created(),
		"model":   model,
		"choices": []any{map[string]any{"index": 0, "delta": delta, "finish_reason": finishReason, "logprobs": nil}},
	}
}
