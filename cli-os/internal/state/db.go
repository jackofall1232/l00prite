// Package state is the transactional store (SQLite WAL) that the Policy Enforcement Point reserves
// budget against — ported from db.js. The driver is modernc.org/sqlite: a PURE-Go SQLite
// (no cgo), so the binary stays a single static executable with real ACID + WAL. See
// docs/node-to-go-port-notes.md for why this driver over a cgo one.
//
// The pool is capped at ONE open connection (SetMaxOpenConns(1)) to preserve node:sqlite's
// single-connection, non-interleaving semantics that the PEP's reserve/commit atomicity assumes;
// WAL still provides durability and cross-process locking. Transactions use BEGIN IMMEDIATE on a
// pinned *sql.Conn so a reservation grabs the write lock up front (no deferred-lock deadlock).
package state

import (
	"context"
	"database/sql"

	_ "modernc.org/sqlite"
)

const schema = `
CREATE TABLE IF NOT EXISTS meta (key TEXT PRIMARY KEY, value TEXT);

CREATE TABLE IF NOT EXISTS providers (
  name TEXT PRIMARY KEY,
  adapter TEXT NOT NULL,
  base_url TEXT,
  enc_key TEXT,
  enabled INTEGER NOT NULL DEFAULT 1,
  is_default INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS tokens (
  id TEXT PRIMARY KEY,
  hash TEXT NOT NULL,
  project TEXT NOT NULL,
  repo TEXT,
  revoked INTEGER NOT NULL DEFAULT 0,
  expires_at TEXT,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS repos (
  id TEXT PRIMARY KEY,
  root TEXT NOT NULL,
  project TEXT NOT NULL,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS caps (
  project TEXT NOT NULL,
  window TEXT NOT NULL,
  limit_usd REAL NOT NULL,
  PRIMARY KEY (project, window)
);

CREATE TABLE IF NOT EXISTS spend (
  project TEXT NOT NULL,
  day TEXT NOT NULL,
  reserved_usd REAL NOT NULL DEFAULT 0,
  committed_usd REAL NOT NULL DEFAULT 0,
  PRIMARY KEY (project, day)
);

CREATE TABLE IF NOT EXISTS reservations (
  id TEXT PRIMARY KEY,
  project TEXT NOT NULL,
  day TEXT NOT NULL,
  amount_usd REAL NOT NULL,
  state TEXT NOT NULL,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS leases (
  id TEXT PRIMARY KEY,
  project TEXT NOT NULL,
  kind TEXT NOT NULL,
  created_at TEXT NOT NULL,
  expires_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS ledger (
  id TEXT PRIMARY KEY,
  ts TEXT NOT NULL,
  request_id TEXT,
  project TEXT,
  repo TEXT,
  provider TEXT,
  model TEXT,
  rule_id TEXT,
  decision TEXT,
  prompt_tokens INTEGER,
  completion_tokens INTEGER,
  cache_read_tokens INTEGER,
  cache_write_tokens INTEGER,
  cost_usd REAL,
  cost_estimated INTEGER,
  cost_unconfirmed INTEGER,
  memory_status TEXT,
  outcome TEXT
);

CREATE TABLE IF NOT EXISTS audit (
  id TEXT PRIMARY KEY,
  ts TEXT NOT NULL,
  actor TEXT,
  action TEXT NOT NULL,
  detail TEXT
);
`

// Querier is satisfied by *sql.DB, *sql.Conn, and *sql.Tx — so a function can run either directly
// on the pool or inside a pinned transaction. Uses the Context method set (the common denominator).
type Querier interface {
	ExecContext(ctx context.Context, query string, args ...any) (sql.Result, error)
	QueryContext(ctx context.Context, query string, args ...any) (*sql.Rows, error)
	QueryRowContext(ctx context.Context, query string, args ...any) *sql.Row
}

// Open opens (creating if needed) the SQLite database at dbPath, applies WAL + schema, and pins a
// single connection.
func Open(dbPath string) (*sql.DB, error) {
	db, err := sql.Open("sqlite", dbPath)
	if err != nil {
		return nil, err
	}
	db.SetMaxOpenConns(1) // single-writer parity with node:sqlite; avoids intra-process SQLITE_BUSY
	for _, pragma := range []string{
		"PRAGMA journal_mode = WAL;",
		"PRAGMA foreign_keys = ON;",
		"PRAGMA busy_timeout = 5000;",
	} {
		if _, err := db.Exec(pragma); err != nil {
			db.Close()
			return nil, err
		}
	}
	if _, err := db.Exec(schema); err != nil {
		db.Close()
		return nil, err
	}
	if _, err := db.Exec(`INSERT OR IGNORE INTO meta(key,value) VALUES('schema_version','2');`); err != nil {
		db.Close()
		return nil, err
	}
	return db, nil
}

// Tx runs fn inside a BEGIN IMMEDIATE transaction on a pinned connection, committing on success and
// rolling back if fn returns an error. The result of fn is returned on commit. Ported from tx().
func Tx[T any](db *sql.DB, fn func(q Querier) (T, error)) (T, error) {
	var zero T
	ctx := context.Background()
	conn, err := db.Conn(ctx)
	if err != nil {
		return zero, err
	}
	defer conn.Close()
	if _, err := conn.ExecContext(ctx, "BEGIN IMMEDIATE;"); err != nil {
		return zero, err
	}
	res, err := fn(conn)
	if err != nil {
		_, _ = conn.ExecContext(ctx, "ROLLBACK;")
		return zero, err
	}
	if _, cerr := conn.ExecContext(ctx, "COMMIT;"); cerr != nil {
		_, _ = conn.ExecContext(ctx, "ROLLBACK;")
		return zero, cerr
	}
	return res, nil
}

// Ctx is a convenience background context for one-off queries.
func Ctx() context.Context { return context.Background() }
