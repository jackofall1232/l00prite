// Transactional state store on the built-in node:sqlite (WAL). Zero external deps.
// This is the atomic store the Policy Enforcement Point (PEP) reserves budget against.
// Node runs single-threaded; a synchronous BEGIN..COMMIT here cannot be interleaved by
// another request on this process, and WAL gives durability + cross-process locking.
import { DatabaseSync } from 'node:sqlite';

const SCHEMA = `
CREATE TABLE IF NOT EXISTS meta (key TEXT PRIMARY KEY, value TEXT);

CREATE TABLE IF NOT EXISTS providers (
  name TEXT PRIMARY KEY,
  adapter TEXT NOT NULL,
  base_url TEXT,
  enc_key TEXT,                 -- AES-256-GCM ciphertext of the API key (never plaintext)
  enabled INTEGER NOT NULL DEFAULT 1,
  is_default INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS tokens (
  id TEXT PRIMARY KEY,          -- public id embedded in the token string
  hash TEXT NOT NULL,           -- sha-256 of the secret half
  project TEXT NOT NULL,
  repo TEXT,                    -- optional default repo scope
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
  window TEXT NOT NULL,         -- 'daily'
  limit_usd REAL NOT NULL,
  PRIMARY KEY (project, window)
);

CREATE TABLE IF NOT EXISTS spend (
  project TEXT NOT NULL,
  day TEXT NOT NULL,            -- YYYY-MM-DD (UTC)
  reserved_usd REAL NOT NULL DEFAULT 0,
  committed_usd REAL NOT NULL DEFAULT 0,
  PRIMARY KEY (project, day)
);

CREATE TABLE IF NOT EXISTS reservations (
  id TEXT PRIMARY KEY,
  project TEXT NOT NULL,
  day TEXT NOT NULL,
  amount_usd REAL NOT NULL,
  state TEXT NOT NULL,          -- reserved | committed | refunded
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS leases (
  id TEXT PRIMARY KEY,
  project TEXT NOT NULL,
  kind TEXT NOT NULL,          -- 'session' | 'repo-write:<repoId>'
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
  decision TEXT,               -- JSON RoutingDecision
  prompt_tokens INTEGER,
  completion_tokens INTEGER,
  cache_read_tokens INTEGER,
  cache_write_tokens INTEGER,
  cost_usd REAL,
  cost_estimated INTEGER,
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
`;

export function openDb(dbPath) {
  const db = new DatabaseSync(dbPath);
  db.exec('PRAGMA journal_mode = WAL;');
  db.exec('PRAGMA foreign_keys = ON;');
  db.exec('PRAGMA busy_timeout = 5000;');
  db.exec(SCHEMA);
  db.exec(`INSERT OR IGNORE INTO meta(key,value) VALUES('schema_version','1');`);
  return db;
}

// Run fn inside an IMMEDIATE transaction; commit on success, rollback on throw.
export function tx(db, fn) {
  db.exec('BEGIN IMMEDIATE;');
  try {
    const r = fn();
    db.exec('COMMIT;');
    return r;
  } catch (e) {
    try { db.exec('ROLLBACK;'); } catch { /* ignore */ }
    throw e;
  }
}
