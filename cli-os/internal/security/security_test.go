package security

import (
	"os"
	"strings"
	"testing"

	"github.com/jackofall1232/l00prite/cli-os/internal/config"
	"github.com/jackofall1232/l00prite/cli-os/internal/state"
)

func setupHome(t *testing.T) config.Config {
	t.Helper()
	t.Setenv("LOOPRITE_HOME", t.TempDir())
	t.Setenv("LOOPRITE_MASTER_KEY", "") // treated as unset
	cfg := config.Load()
	if err := config.EnsureHome(cfg); err != nil {
		t.Fatalf("ensure home: %v", err)
	}
	return cfg
}

func TestVaultRoundtripHidesPlaintext(t *testing.T) {
	cfg := setupHome(t)
	if err := EnsureMasterKey(cfg.MasterKeyPath); err != nil {
		t.Fatalf("master key: %v", err)
	}
	secret := "sk-super-secret-123"
	blob, err := EncryptSecret(cfg.MasterKeyPath, secret)
	if err != nil {
		t.Fatalf("encrypt: %v", err)
	}
	if strings.Contains(blob, secret) {
		t.Fatalf("ciphertext must not contain plaintext: %s", blob)
	}
	got, err := DecryptSecret(cfg.MasterKeyPath, blob)
	if err != nil || got != secret {
		t.Fatalf("decrypt roundtrip failed: got %q err %v", got, err)
	}
	info, err := os.Stat(cfg.MasterKeyPath)
	if err != nil {
		t.Fatalf("stat: %v", err)
	}
	if info.Mode().Perm() != 0o600 {
		t.Fatalf("master key must be 0600, got %o", info.Mode().Perm())
	}
}

func TestTokensMintVerifyRevoke(t *testing.T) {
	cfg := setupHome(t)
	db, err := state.Open(cfg.DBPath)
	if err != nil {
		t.Fatalf("open db: %v", err)
	}
	defer db.Close()
	repo := "r1"
	id, token, err := MintToken(db, "demo", &repo, nil)
	if err != nil {
		t.Fatalf("mint: %v", err)
	}
	p := VerifyToken(db, token)
	if p == nil || p.Project != "demo" || p.Repo != "r1" {
		t.Fatalf("verify: %+v", p)
	}
	if VerifyToken(db, "l00p_"+id+"_wrongsecret") != nil {
		t.Fatalf("wrong secret must fail")
	}
	if VerifyToken(db, "garbage") != nil {
		t.Fatalf("garbage must fail")
	}
	RevokeToken(db, id)
	if VerifyToken(db, token) != nil {
		t.Fatalf("revoked token must fail")
	}
}
