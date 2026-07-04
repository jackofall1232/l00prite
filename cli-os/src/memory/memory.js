// Repo Memory (Track 2). Answers a MemoryQuery with a MemoryContext of ranked blocks selected
// from a repo's .l00prite/ files, within a token budget, with mtime-based freshness and graceful
// degradation. It returns BLOCKS, never a finished prompt — the gateway owns injection and the
// untrusted-content envelope. File access is confined to the repo root (containment check).
import fs from 'node:fs';
import path from 'node:path';
import { nowISO } from '../util.js';

const SOURCES = [
  { file: 'constraints.md', kind: 'constraint', base: 0.9 },
  { file: 'blueprint.md', kind: 'architecture', base: 0.85 },
  { file: 'memory.md', kind: 'architecture', base: 0.8 },
  { file: 'failures.md', kind: 'open_issue', base: 0.6 },
  { file: 'todos.md', kind: 'open_issue', base: 0.55 },
];

const approxTokens = (s) => Math.ceil(s.length / 4);

function within(root, p) {
  const r = path.resolve(root);
  const c = path.resolve(p);
  return c === r || c.startsWith(r + path.sep);
}

function keywordsFrom(digest) {
  const words = String(digest?.user_intent || '').toLowerCase().match(/[a-z0-9_./-]{4,}/g) || [];
  return new Set(words.slice(0, 40));
}

// query({ repoRoot, requestDigest, budgets: { contextTokens }, options: { allowStale } })
export function query({ repoRoot, requestDigest = {}, budgets = {}, options = {} }) {
  const trace_id = `mem_${Date.now().toString(36)}`;
  try {
    if (!repoRoot) return empty('no_repo', trace_id);
    const dir = path.join(repoRoot, '.l00prite');
    if (!within(repoRoot, dir) || !fs.existsSync(dir)) return empty('no_memory_dir', trace_id);

    const kws = keywordsFrom(requestDigest);
    const refPaths = (requestDigest.referenced_paths || []).map((p) => p.toLowerCase());
    const candidates = [];
    for (const s of SOURCES) {
      const fp = path.join(dir, s.file);
      if (!within(repoRoot, fp) || !fs.existsSync(fp)) continue;
      let text, mtime;
      try { text = fs.readFileSync(fp, 'utf8').trim(); mtime = fs.statSync(fp).mtime; } catch { continue; }
      if (!text) continue;
      const lower = text.toLowerCase();
      let score = s.base;
      for (const k of kws) if (lower.includes(k)) { score += 0.02; }
      for (const rp of refPaths) if (lower.includes(rp)) { score += 0.08; }
      const ageDays = (Date.now() - mtime.getTime()) / 864e5;
      const stale = ageDays > 30;
      if (stale) score -= 0.15;
      candidates.push({ kind: s.kind, text, source_path: `.l00prite/${s.file}`,
        freshness: { as_of: mtime.toISOString(), stale }, rank_score: Number(score.toFixed(3)) });
    }
    if (!candidates.length) return empty('no_content', trace_id);

    candidates.sort((a, b) => b.rank_score - a.rank_score);
    const budget = budgets.contextTokens || 8000;
    const blocks = [];
    let tokens = 0, truncated = false;
    for (const c of candidates) {
      let text = c.text;
      const t = approxTokens(text);
      if (tokens + t > budget) {
        const room = Math.max(0, budget - tokens);
        if (room < 120) { truncated = true; break; }
        text = text.slice(0, room * 4) + '\n… [truncated by context budget]';
        truncated = true;
      }
      blocks.push({ ...c, text });
      tokens += approxTokens(text);
      if (tokens >= budget) { truncated = true; break; }
    }
    const anyStale = blocks.some((b) => b.freshness.stale);
    let status = 'ok', reason = null;
    if (anyStale && !options.allowStale) { status = 'degraded'; reason = 'stale_blocks_present'; }
    if (truncated) { status = 'degraded'; reason = reason || 'context_budget_truncated'; }
    return { schema_version: 1, status, reason, blocks, tokens, trace_id, generated_at: nowISO() };
  } catch (e) {
    return { schema_version: 1, status: 'error', reason: String(e.message || e), blocks: [], tokens: 0, trace_id };
  }
}

function empty(reason, trace_id) {
  return { schema_version: 1, status: 'empty', reason, blocks: [], tokens: 0, trace_id };
}
