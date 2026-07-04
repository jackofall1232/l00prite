// Policy Enforcement Point. The enforcement lives here, over the transactional store, NOT in
// the request handler that would benefit from ignoring it. A handler RESERVES budget before a
// provider call (the reservation is the ceiling) and COMMITS the real cost after. A crashed or
// misbehaving handler cannot spend past the cap because the reservation was already committed
// atomically. Budgets are enforced in DOLLARS, per project, per UTC day.
import { tx } from '../state/db.js';
import { nowISO, rid, utcDay } from '../util.js';

function capFor(db, project, defaultCap) {
  const row = db.prepare(`SELECT limit_usd FROM caps WHERE project = ? AND window = 'daily'`).get(project);
  return row ? row.limit_usd : defaultCap;
}

function spendRow(db, project, day) {
  db.prepare(`INSERT OR IGNORE INTO spend(project,day,reserved_usd,committed_usd) VALUES(?,?,0,0)`)
    .run(project, day);
  return db.prepare(`SELECT reserved_usd, committed_usd FROM spend WHERE project = ? AND day = ?`)
    .get(project, day);
}

// Atomically reserve `amountUsd`. Denies if it would breach the daily cap.
export function reserve(db, { project, amountUsd, defaultCap }) {
  // Fail closed on non-finite/negative amounts — they would corrupt spend totals or let a
  // negative "reservation" bypass the cap.
  if (!Number.isFinite(amountUsd) || amountUsd < 0) {
    return { ok: false, reason: 'invalid_amount', requested: amountUsd };
  }
  const day = utcDay();
  return tx(db, () => {
    const cap = capFor(db, project, defaultCap);
    const s = spendRow(db, project, day);
    const inUse = s.reserved_usd + s.committed_usd;
    if (inUse + amountUsd > cap + 1e-9) {
      return { ok: false, reason: 'cost_cap', cap, spent: inUse, requested: amountUsd };
    }
    const id = rid('rsv');
    db.prepare(`INSERT INTO reservations(id,project,day,amount_usd,state,created_at) VALUES(?,?,?,?,'reserved',?)`)
      .run(id, project, day, amountUsd, nowISO());
    db.prepare(`UPDATE spend SET reserved_usd = reserved_usd + ? WHERE project = ? AND day = ?`)
      .run(amountUsd, project, day);
    return { ok: true, reservationId: id, cap, spent: inUse };
  });
}

// Reconcile a reservation with the real cost.
export function commit(db, reservationId, actualUsd) {
  return tx(db, () => {
    const r = db.prepare(`SELECT * FROM reservations WHERE id = ?`).get(reservationId);
    if (!r || r.state !== 'reserved') return false;
    db.prepare(`UPDATE spend SET reserved_usd = reserved_usd - ?, committed_usd = committed_usd + ? WHERE project = ? AND day = ?`)
      .run(r.amount_usd, actualUsd, r.project, r.day);
    db.prepare(`UPDATE reservations SET state = 'committed', amount_usd = ? WHERE id = ?`)
      .run(actualUsd, reservationId);
    return true;
  });
}

export function refund(db, reservationId) {
  return tx(db, () => {
    const r = db.prepare(`SELECT * FROM reservations WHERE id = ?`).get(reservationId);
    if (!r || r.state !== 'reserved') return false;
    db.prepare(`UPDATE spend SET reserved_usd = reserved_usd - ? WHERE project = ? AND day = ?`)
      .run(r.amount_usd, r.project, r.day);
    db.prepare(`UPDATE reservations SET state = 'refunded' WHERE id = ?`).run(reservationId);
    return true;
  });
}

// Reap orphaned reservations. A handler that crashes between reserve() and commit()/refund()
// strands a `reserved` row, which counts against the daily cap until the UTC-day rollover. A
// multi-hop bridge request multiplies that exposure (N reservations per request), so recovery must
// not wait for restart alone. Refund any reservation still `reserved` after maxAgeMs — far longer
// than a legitimate call (retry.maxAttempts * requestTimeoutMs) so an in-flight request is never
// reaped out from under itself. Returns the count reclaimed.
export function reapStaleReservations(db, maxAgeMs) {
  const cutoff = new Date(Date.now() - maxAgeMs).toISOString();
  return tx(db, () => {
    const stale = db.prepare(`SELECT * FROM reservations WHERE state = 'reserved' AND created_at < ?`).all(cutoff);
    for (const r of stale) {
      db.prepare(`UPDATE spend SET reserved_usd = MAX(0, reserved_usd - ?) WHERE project = ? AND day = ?`)
        .run(r.amount_usd, r.project, r.day);
      db.prepare(`UPDATE reservations SET state = 'refunded' WHERE id = ?`).run(r.id);
    }
    return stale.length;
  });
}

export function getSpend(db, project, defaultCap) {
  const day = utcDay();
  const s = spendRow(db, project, day);
  return { day, cap: capFor(db, project, defaultCap), reserved: s.reserved_usd, committed: s.committed_usd };
}

// Concurrency leases (session pool, per-repo memory write). Returns lease id or null if full.
export function acquireLease(db, { project, kind, ttlSec = 300, max = 1 }) {
  return tx(db, () => {
    const now = Date.now();
    // reap expired
    db.prepare(`DELETE FROM leases WHERE expires_at < ?`).run(new Date(now).toISOString());
    const active = db.prepare(`SELECT COUNT(*) c FROM leases WHERE project = ? AND kind = ?`)
      .get(project, kind).c;
    if (active >= max) return null;
    const id = rid('lease');
    db.prepare(`INSERT INTO leases(id,project,kind,created_at,expires_at) VALUES(?,?,?,?,?)`)
      .run(id, project, kind, new Date(now).toISOString(), new Date(now + ttlSec * 1000).toISOString());
    return id;
  });
}

export function releaseLease(db, id) {
  db.prepare(`DELETE FROM leases WHERE id = ?`).run(id);
}

// Destructive-action gate. The chat request path never performs push/merge/deploy/credential
// changes; anything that would must pass an explicit per-action grant (never a blanket start-of-
// run grant). v1 denies by default — there is no destructive surface in the gateway yet.
export function requirePermission(action, grant) {
  if (!grant || grant.action !== action || Date.parse(grant.expires_at || 0) < Date.now()) {
    return { ok: false, reason: 'permission_required', action };
  }
  return { ok: true };
}
