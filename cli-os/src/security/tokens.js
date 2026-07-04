// Opaque gateway tokens. Format: l00p_<id>_<secret>. We store the id (public) and a sha-256
// of the secret half (never the secret). Lookup is by id; the secret is compared in constant
// time. A leaked token is revocable without touching provider keys.
import crypto from 'node:crypto';
import { nowISO, rid, sha256hex, timingSafeEqual } from '../util.js';

export function mintToken(db, { project, repo = null, expiresDays = null }) {
  const id = rid('tok').replace('tok_', '');
  const secret = crypto.randomBytes(24).toString('base64url');
  const hash = sha256hex(secret);
  const expires_at = expiresDays ? new Date(Date.now() + expiresDays * 864e5).toISOString() : null;
  db.prepare(
    `INSERT INTO tokens(id,hash,project,repo,revoked,expires_at,created_at) VALUES(?,?,?,?,0,?,?)`,
  ).run(id, hash, project, repo, expires_at, nowISO());
  return { id, token: `l00p_${id}_${secret}` };
}

// Returns the principal { tokenId, project, repo } or null.
export function verifyToken(db, raw) {
  if (typeof raw !== 'string') return null;
  const m = /^l00p_([A-Za-z0-9]+)_(.+)$/.exec(raw.trim());
  if (!m) return null;
  const [, id, secret] = m;
  const row = db.prepare(`SELECT * FROM tokens WHERE id = ?`).get(id);
  if (!row) return null;
  if (row.revoked) return null;
  if (row.expires_at && Date.parse(row.expires_at) < Date.now()) return null;
  if (!timingSafeEqual(sha256hex(secret), row.hash)) return null;
  return { tokenId: row.id, project: row.project, repo: row.repo };
}

export function revokeToken(db, id) {
  const r = db.prepare(`UPDATE tokens SET revoked = 1 WHERE id = ?`).run(id);
  return r.changes > 0;
}

export function listTokens(db) {
  return db.prepare(`SELECT id,project,repo,revoked,expires_at,created_at FROM tokens ORDER BY created_at DESC`).all();
}
