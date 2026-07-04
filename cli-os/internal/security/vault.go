// Package security holds the provider-key vault and the opaque gateway tokens.
//
// vault: AES-256-GCM at rest under a server-only master key (keyfile, 0600, or the
// LOOPRITE_MASTER_KEY env). The on-disk ciphertext format is byte-compatible with the Node
// vault.js — "v1.<iv b64>.<tag b64>.<ct b64>" (standard base64, 12-byte IV, 16-byte GCM tag) — so
// vault files written by the Node version decrypt unchanged, and vice versa.
package security

import (
	"crypto/aes"
	"crypto/cipher"
	"crypto/rand"
	"encoding/base64"
	"errors"
	"os"
	"strings"
)

// EnsureMasterKey creates a fresh 32-byte master key at path (mode 0600) if none exists.
func EnsureMasterKey(path string) error {
	if _, err := os.Stat(path); err == nil {
		return nil
	}
	key := make([]byte, 32)
	if _, err := rand.Read(key); err != nil {
		return err
	}
	if err := os.WriteFile(path, []byte(base64.StdEncoding.EncodeToString(key)), 0o600); err != nil {
		return err
	}
	return os.Chmod(path, 0o600)
}

func loadMasterKey(masterKeyPath string) ([]byte, error) {
	if env := os.Getenv("LOOPRITE_MASTER_KEY"); env != "" {
		k, err := base64.StdEncoding.DecodeString(env)
		if err != nil || len(k) != 32 {
			return nil, errors.New("LOOPRITE_MASTER_KEY must be base64 of 32 bytes")
		}
		return k, nil
	}
	raw, err := os.ReadFile(masterKeyPath)
	if err != nil {
		return nil, err
	}
	k, err := base64.StdEncoding.DecodeString(strings.TrimSpace(string(raw)))
	if err != nil || len(k) != 32 {
		return nil, errors.New("master.key is corrupt (expected 32 bytes)")
	}
	return k, nil
}

// EncryptSecret returns "v1.<iv>.<tag>.<ct>" (base64 parts).
func EncryptSecret(masterKeyPath, plaintext string) (string, error) {
	key, err := loadMasterKey(masterKeyPath)
	if err != nil {
		return "", err
	}
	block, err := aes.NewCipher(key)
	if err != nil {
		return "", err
	}
	gcm, err := cipher.NewGCM(block) // 12-byte nonce, 16-byte tag — matches node crypto default
	if err != nil {
		return "", err
	}
	iv := make([]byte, gcm.NonceSize())
	if _, err := rand.Read(iv); err != nil {
		return "", err
	}
	sealed := gcm.Seal(nil, iv, []byte(plaintext), nil) // ciphertext || tag
	ct := sealed[:len(sealed)-16]
	tag := sealed[len(sealed)-16:]
	return strings.Join([]string{
		"v1",
		base64.StdEncoding.EncodeToString(iv),
		base64.StdEncoding.EncodeToString(tag),
		base64.StdEncoding.EncodeToString(ct),
	}, "."), nil
}

// DecryptSecret reverses EncryptSecret (and any Node-written v1 blob).
func DecryptSecret(masterKeyPath, blob string) (string, error) {
	key, err := loadMasterKey(masterKeyPath)
	if err != nil {
		return "", err
	}
	parts := strings.Split(blob, ".")
	if len(parts) != 4 || parts[0] != "v1" {
		return "", errors.New("unknown ciphertext version")
	}
	iv, err := base64.StdEncoding.DecodeString(parts[1])
	if err != nil {
		return "", err
	}
	tag, err := base64.StdEncoding.DecodeString(parts[2])
	if err != nil {
		return "", err
	}
	ct, err := base64.StdEncoding.DecodeString(parts[3])
	if err != nil {
		return "", err
	}
	block, err := aes.NewCipher(key)
	if err != nil {
		return "", err
	}
	gcm, err := cipher.NewGCM(block)
	if err != nil {
		return "", err
	}
	pt, err := gcm.Open(nil, iv, append(ct, tag...), nil)
	if err != nil {
		return "", err
	}
	return string(pt), nil
}
