// Run ledger. Every request appends a row (to SQLite for query + JSONL for portability) capturing
// the routing decision, real token/dollar cost, memory-degradation status, and outcome.
import fs from 'node:fs';
import { nowISO, rid } from '../util.js';

export function append(db, cfg, row) {
  const id = rid('run');
  const r = {
    id, ts: nowISO(), request_id: row.request_id || null, project: row.project || null,
    repo: row.repo || null, provider: row.provider || null, model: row.model || null,
    rule_id: row.rule_id || null, decision: row.decision ? JSON.stringify(row.decision) : null,
    prompt_tokens: row.usage?.prompt_tokens ?? null, completion_tokens: row.usage?.completion_tokens ?? null,
    cache_read_tokens: row.usage?.cache_read_tokens ?? null, cache_write_tokens: row.usage?.cache_write_tokens ?? null,
    cost_usd: row.cost_usd ?? null, cost_estimated: row.cost_estimated ? 1 : 0,
    memory_status: row.memory_status || null, outcome: row.outcome || null,
  };
  db.prepare(`INSERT INTO ledger(id,ts,request_id,project,repo,provider,model,rule_id,decision,prompt_tokens,completion_tokens,cache_read_tokens,cache_write_tokens,cost_usd,cost_estimated,memory_status,outcome)
    VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`).run(
    r.id, r.ts, r.request_id, r.project, r.repo, r.provider, r.model, r.rule_id, r.decision,
    r.prompt_tokens, r.completion_tokens, r.cache_read_tokens, r.cache_write_tokens,
    r.cost_usd, r.cost_estimated, r.memory_status, r.outcome,
  );
  try { fs.appendFileSync(cfg.ledgerPath, JSON.stringify(r) + '\n'); } catch { /* JSONL mirror is best-effort */ }
  return id;
}

export function explain(db, requestId) {
  return db.prepare(`SELECT * FROM ledger WHERE request_id = ? OR id = ? ORDER BY ts DESC`).all(requestId, requestId);
}

export function recent(db, limit = 20) {
  return db.prepare(`SELECT * FROM ledger ORDER BY ts DESC LIMIT ?`).all(limit);
}
