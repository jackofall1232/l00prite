package config

import (
	"os"
	"path/filepath"
	"testing"
)

func TestMalformedDefaultCapFallsBackSafe(t *testing.T) {
	t.Setenv("LOOPRITE_HOME", t.TempDir())
	t.Setenv("LOOPRITE_DEFAULT_DAILY_CAP", "not-a-number")
	cfg := Load()
	if cfg.DefaultDailyCapUsd != 10 {
		t.Fatalf("malformed cap must fall back to 10, got %v", cfg.DefaultDailyCapUsd)
	}
}

func writeConfig(t *testing.T, json string) {
	t.Helper()
	dir := t.TempDir()
	t.Setenv("LOOPRITE_HOME", dir)
	if err := os.WriteFile(filepath.Join(dir, "config.json"), []byte(json), 0o644); err != nil {
		t.Fatal(err)
	}
}

func TestBridgeConfigDeepMerge(t *testing.T) {
	// A minimal bridge override must not wipe the default maxHops (the common "just enable it" config).
	writeConfig(t, `{"routing":{"bridge":{"enabled":true}}}`)
	cfg := Load()
	if !cfg.Routing.Bridge.Enabled {
		t.Fatalf("bridge should be enabled")
	}
	if cfg.Routing.Bridge.MaxHops != 3 {
		t.Fatalf("maxHops must keep the default 3, got %d", cfg.Routing.Bridge.MaxHops)
	}
}

func TestStringTypedNumericConfig(t *testing.T) {
	// Numeric settings written as JSON strings ("20") must parse, like JS Number("20").
	writeConfig(t, `{"defaultDailyCapUsd":"20","defaultMaxTokens":"8000"}`)
	cfg := Load()
	if cfg.DefaultDailyCapUsd != 20 {
		t.Fatalf("string cap want 20 got %v", cfg.DefaultDailyCapUsd)
	}
	if cfg.DefaultMaxTokens != 8000 {
		t.Fatalf("string maxTokens want 8000 got %d", cfg.DefaultMaxTokens)
	}
}

func TestRuntimeOverridesHonored(t *testing.T) {
	// retry / memory / requestTimeoutMs from config.json must apply (were previously dropped).
	writeConfig(t, `{"requestTimeoutMs":300000,"retry":{"maxAttempts":5},"memory":{"contextTokens":16000}}`)
	cfg := Load()
	if cfg.RequestTimeoutMs != 300000 {
		t.Fatalf("requestTimeoutMs want 300000 got %d", cfg.RequestTimeoutMs)
	}
	if cfg.Retry.MaxAttempts != 5 {
		t.Fatalf("retry.maxAttempts want 5 got %d", cfg.Retry.MaxAttempts)
	}
	if cfg.Retry.BaseMs != 250 {
		t.Fatalf("retry.baseMs must keep default 250 (deep-merge), got %d", cfg.Retry.BaseMs)
	}
	if cfg.Memory.ContextTokens != 16000 {
		t.Fatalf("memory.contextTokens want 16000 got %d", cfg.Memory.ContextTokens)
	}
}

func TestFalsyPortHostFallBack(t *testing.T) {
	writeConfig(t, `{"host":"","port":0}`)
	cfg := Load()
	if cfg.Host != "127.0.0.1" || cfg.Port != 8787 {
		t.Fatalf("falsy host/port must fall back to defaults, got %s:%d", cfg.Host, cfg.Port)
	}
}
