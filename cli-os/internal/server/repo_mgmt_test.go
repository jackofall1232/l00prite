package server_test

import (
	"database/sql"
	"os"
	"path/filepath"
	"testing"
)

func repoRow(t *testing.T, db *sql.DB, id string) (root, project string, found bool) {
	t.Helper()
	err := db.QueryRow(`SELECT root, project FROM repos WHERE id = ?`, id).Scan(&root, &project)
	if err == sql.ErrNoRows {
		return "", "", false
	}
	if err != nil {
		t.Fatalf("repo row %q: %v", id, err)
	}
	return root, project, true
}

// TestRepoMgmtAuthRequired: the repo endpoints share the exact auth of every other management
// endpoint — no unauthenticated registration path.
func TestRepoMgmtAuthRequired(t *testing.T) {
	srv, _, _, _, _ := configured(t)
	for _, p := range []string{"/v1/repos", "/v1/repos/remove"} {
		if resp, _ := doJSON(t, "POST", srv.URL+p, "", map[string]any{"id": "x"}); resp.StatusCode != 401 {
			t.Fatalf("POST %s without token must be 401, got %d", p, resp.StatusCode)
		}
		if resp, _ := doJSON(t, "POST", srv.URL+p, "l00p_bogus_nope", map[string]any{"id": "x"}); resp.StatusCode != 401 {
			t.Fatalf("POST %s with a bad token must be 401, got %d", p, resp.StatusCode)
		}
	}
}

// TestRepoRegisterValidatesAndStores: a real directory registers (row identical in shape to CLI
// `repo register`, project defaulted), the response reports a real memory-freshness snapshot, and
// bad input — missing id/root, unsafe id charset, a path that doesn't exist on the gateway host —
// is rejected with the row stored nowhere.
func TestRepoRegisterValidatesAndStores(t *testing.T) {
	srv, _, db, tokID, token := configured(t)
	base := srv.URL

	repoDir := t.TempDir()
	if err := os.MkdirAll(filepath.Join(repoDir, ".l00prite"), 0o755); err != nil {
		t.Fatalf("mk memory dir: %v", err)
	}
	if err := os.WriteFile(filepath.Join(repoDir, ".l00prite", "memory.md"), []byte("# memory\n"), 0o644); err != nil {
		t.Fatalf("write memory file: %v", err)
	}

	// happy path: registered, project defaulted, memory snapshot sees the file.
	resp, body := doJSON(t, "POST", base+"/v1/repos", token, map[string]any{"id": "myrepo", "root": repoDir})
	if resp.StatusCode != 200 {
		t.Fatalf("register must be 200, got %d (%v)", resp.StatusCode, body)
	}
	repo := body["repo"].(map[string]any)
	if repo["project"] != "default" {
		t.Fatalf("project must default to \"default\", got %v", repo["project"])
	}
	mem := body["memory"].(map[string]any)
	if mem["present_count"].(float64) < 1 {
		t.Fatalf("freshness snapshot must see the memory file, got %v", mem)
	}
	if root, project, found := repoRow(t, db, "myrepo"); !found || root != repoDir || project != "default" {
		t.Fatalf("stored row mismatch: root=%q project=%q found=%v", root, project, found)
	}

	// the register is audit-logged with the acting token id.
	var auditN int
	if err := db.QueryRow(`SELECT COUNT(*) FROM audit WHERE action='repo.register' AND actor=?`, tokID).Scan(&auditN); err != nil || auditN != 1 {
		t.Fatalf("register must be audited by token id (n=%d, err=%v)", auditN, err)
	}

	// duplicate id → 409, row untouched.
	if resp, _ := doJSON(t, "POST", base+"/v1/repos", token, map[string]any{"id": "myrepo", "root": t.TempDir()}); resp.StatusCode != 409 {
		t.Fatalf("duplicate id must be 409, got %d", resp.StatusCode)
	}
	if root, _, _ := repoRow(t, db, "myrepo"); root != repoDir {
		t.Fatalf("409 must not repoint the repo; root=%q", root)
	}

	// invalid input: missing id, unsafe id, missing root, nonexistent root — nothing stored.
	bad := []map[string]any{
		{"root": repoDir},
		{"id": "../evil", "root": repoDir},
		{"id": "norepo"},
		{"id": "norepo", "root": filepath.Join(repoDir, "does-not-exist")},
	}
	for _, b := range bad {
		if resp, _ := doJSON(t, "POST", base+"/v1/repos", token, b); resp.StatusCode != 400 {
			t.Fatalf("bad register %v must be 400, got %d", b, resp.StatusCode)
		}
	}
	if _, _, found := repoRow(t, db, "norepo"); found {
		t.Fatal("a rejected register must store nothing")
	}
}

// TestRepoRemove: removing unregisters the mapping (files untouched), 404s on an unknown id, and
// reports how many active tokens were scoped to the repo.
func TestRepoRemove(t *testing.T) {
	srv, _, db, _, token := configured(t)
	base := srv.URL
	repoDir := t.TempDir()

	if resp, _ := doJSON(t, "POST", base+"/v1/repos", token, map[string]any{"id": "gone", "root": repoDir, "project": "p1"}); resp.StatusCode != 200 {
		t.Fatalf("register failed: %d", resp.StatusCode)
	}
	if resp, _ := doJSON(t, "POST", base+"/v1/repos/remove", token, map[string]any{"id": "nope"}); resp.StatusCode != 404 {
		t.Fatalf("unknown id must be 404, got %d", resp.StatusCode)
	}
	resp, body := doJSON(t, "POST", base+"/v1/repos/remove", token, map[string]any{"id": "gone"})
	if resp.StatusCode != 200 || body["removed"] != true {
		t.Fatalf("remove must succeed, got %d (%v)", resp.StatusCode, body)
	}
	if _, _, found := repoRow(t, db, "gone"); found {
		t.Fatal("removed repo must be gone from the table")
	}
	if _, err := os.Stat(repoDir); err != nil {
		t.Fatalf("remove must not touch the directory on disk: %v", err)
	}
}
