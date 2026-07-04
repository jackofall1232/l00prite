// HTTP(S) server. Routes the OpenAI-compatible surface, serves the dashboard, and enforces
// safe-by-default startup (no non-loopback bind without TLS; master key must exist).
import http from 'node:http';
import https from 'node:https';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadConfig, validateForServe } from './config.js';
import { openDb } from './state/db.js';
import { reapStaleReservations } from './policy/pep.js';
import { handleChatCompletion, handleModels, handleHealth } from './gateway/ingress.js';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const DASHBOARD = path.join(HERE, '..', 'public', 'dashboard.html');

function notFound(res) {
  res.writeHead(404, { 'content-type': 'application/json' });
  res.end(JSON.stringify({ error: { message: 'Not found', type: 'invalid_request_error' } }));
}

function serveDashboard(res) {
  fs.readFile(DASHBOARD, (err, buf) => {
    if (err) { res.writeHead(200, { 'content-type': 'text/plain' }); res.end('l00prite CLI-OS is running. Dashboard asset not found.'); return; }
    res.writeHead(200, { 'content-type': 'text/html; charset=utf-8', 'content-length': buf.length });
    res.end(buf);
  });
}

export function buildServer(ctx) {
  const handler = async (req, res) => {
    try {
      const url = new URL(req.url, 'http://localhost');
      const p = url.pathname;
      if (req.method === 'GET' && (p === '/' || p === '/dashboard')) return serveDashboard(res);
      if (req.method === 'GET' && p === '/healthz') return handleHealth(ctx, req, res);
      if (req.method === 'GET' && p === '/v1/models') return handleModels(ctx, req, res);
      if (req.method === 'POST' && p === '/v1/chat/completions') return await handleChatCompletion(ctx, req, res);
      return notFound(res);
    } catch (e) {
      if (!res.headersSent) { res.writeHead(500, { 'content-type': 'application/json' }); res.end(JSON.stringify({ error: { message: 'Internal error', type: 'api_error' } })); }
      else try { res.end(); } catch { /* closed */ }
    }
  };
  if (ctx.cfg.tls) {
    return https.createServer({ cert: fs.readFileSync(ctx.cfg.tls.certPath), key: fs.readFileSync(ctx.cfg.tls.keyPath) }, handler);
  }
  return http.createServer(handler);
}

export function startServer(overrides = {}) {
  const cfg = { ...loadConfig(), ...overrides };
  const problems = validateForServe(cfg);
  if (problems.length) {
    console.error('Refusing to start — fix these first:');
    for (const p of problems) console.error('  • ' + p);
    process.exit(1);
  }
  const db = openDb(cfg.dbPath);
  // Recover any reservations stranded by a crash (a bridge request fans into several, multiplying
  // the exposure). Refund anything left `reserved` far longer than a legitimate call could run.
  const staleAfterMs = Math.max(10 * 60_000, cfg.retry.maxAttempts * cfg.requestTimeoutMs + 60_000);
  try { const n = reapStaleReservations(db, staleAfterMs); if (n) console.log(`  • reaped ${n} stale reservation(s)`); } catch { /* non-fatal */ }
  // ...and periodically, so a long-running server recovers reservations stranded by crashes/
  // timeouts/aborts (bridging multiplies the exposure) without waiting for a restart. unref() so
  // the timer never keeps the process alive on its own.
  setInterval(() => { try { reapStaleReservations(db, staleAfterMs); } catch { /* non-fatal */ } }, 5 * 60_000).unref();
  const ctx = { db, cfg, aliases: cfg.aliases || {} };
  const server = buildServer(ctx);
  server.listen(cfg.port, cfg.host, () => {
    const scheme = cfg.tls ? 'https' : 'http';
    console.log(`l00prite CLI-OS listening on ${scheme}://${cfg.host}:${cfg.port}`);
    console.log(`  • OpenAI endpoint : ${scheme}://${cfg.host}:${cfg.port}/v1/chat/completions`);
    console.log(`  • Dashboard       : ${scheme}://${cfg.host}:${cfg.port}/`);
  });
  return { server, db, ctx };
}
