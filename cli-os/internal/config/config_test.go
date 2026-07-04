package config

import "testing"

func TestMalformedDefaultCapFallsBackSafe(t *testing.T) {
	t.Setenv("LOOPRITE_HOME", t.TempDir())
	t.Setenv("LOOPRITE_DEFAULT_DAILY_CAP", "not-a-number")
	cfg := Load()
	if cfg.DefaultDailyCapUsd != 10 {
		t.Fatalf("malformed cap must fall back to 10, got %v", cfg.DefaultDailyCapUsd)
	}
}
