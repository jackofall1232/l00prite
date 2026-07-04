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

func TestMasterKeyPresence(t *testing.T) {
	dir := t.TempDir()
	t.Setenv("LOOPRITE_HOME", dir)
	t.Setenv("LOOPRITE_MASTER_KEY", "")
	cfg := Load()
	// No env key, no key file -> absent (first run). ValidateForServe must flag it, but this is NOT a
	// bind problem, so the server may still boot into setup mode.
	if MasterKeyPresent(cfg) {
		t.Fatalf("master key must be absent on a fresh dir")
	}
	if len(BindProblems(cfg)) != 0 {
		t.Fatalf("a loopback bind without a key must have no BIND problems (setup mode is allowed): %v", BindProblems(cfg))
	}
	if len(ValidateForServe(cfg)) == 0 {
		t.Fatalf("ValidateForServe must still flag the missing master key")
	}
	// Env key of 32 bytes -> present.
	t.Setenv("LOOPRITE_MASTER_KEY", "AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=")
	if !MasterKeyPresent(cfg) {
		t.Fatalf("a valid 32-byte env key must count as present")
	}
	// A key file also counts as present.
	t.Setenv("LOOPRITE_MASTER_KEY", "")
	if err := os.WriteFile(cfg.MasterKeyPath, []byte("AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA="), 0o600); err != nil {
		t.Fatal(err)
	}
	if !MasterKeyPresent(cfg) {
		t.Fatalf("a key file must count as present")
	}
}

func TestBindSafetyStaysFatal(t *testing.T) {
	t.Setenv("LOOPRITE_HOME", t.TempDir())
	t.Setenv("LOOPRITE_ALLOW_INSECURE_BIND", "")
	// Non-loopback host without TLS is a fatal bind problem — setup mode does NOT relax this.
	cfg := Load()
	cfg.Host = "0.0.0.0"
	if len(BindProblems(cfg)) == 0 {
		t.Fatalf("binding 0.0.0.0 without TLS must be a bind problem")
	}
	// Opting in clears it.
	t.Setenv("LOOPRITE_ALLOW_INSECURE_BIND", "1")
	if len(BindProblems(cfg)) != 0 {
		t.Fatalf("LOOPRITE_ALLOW_INSECURE_BIND=1 must clear the non-loopback bind problem")
	}
}
