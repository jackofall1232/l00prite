// Configuration loader. Sources (later wins): built-in defaults -> $LOOPRITE_HOME/config.json -> env.
// No insecure defaults: validate() refuses dangerous combinations at startup.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

// Silence only node:sqlite's ExperimentalWarning; re-emit everything else.
const _origEmit = process.emitWarning;
process.emitWarning = (warning, ...rest) => {
  const name = rest[0]?.type || rest[0];
  const msg = typeof warning === 'string' ? warning : warning?.message || '';
  if (name === 'ExperimentalWarning' && /SQLite/i.test(msg)) return;
  return _origEmit.call(process, warning, ...rest);
};

const DEFAULTS = {
  host: '127.0.0.1',
  port: 8787,
  tls: null, // { certPath, keyPath }
  defaultDailyCapUsd: 10,
  retry: { maxAttempts: 3, baseMs: 250, maxMs: 4000 },
  memory: { latencyMs: 150, contextTokens: 8000 },
  requestTimeoutMs: 120000,
};

function homeDir() {
  return process.env.LOOPRITE_HOME || path.join(os.homedir(), '.l00prite-cli-os');
}

function readFileJSON(p) {
  try { return JSON.parse(fs.readFileSync(p, 'utf8')); } catch { return {}; }
}

export function loadConfig() {
  const home = homeDir();
  const fileCfg = readFileJSON(path.join(home, 'config.json'));
  const cfg = {
    ...DEFAULTS,
    ...fileCfg,
    home,
    dbPath: path.join(home, 'cli-os.db'),
    masterKeyPath: path.join(home, 'master.key'),
    ledgerPath: path.join(home, 'ledger.jsonl'),
    host: process.env.LOOPRITE_HOST || fileCfg.host || DEFAULTS.host,
    port: Number(process.env.LOOPRITE_PORT || fileCfg.port || DEFAULTS.port),
    defaultDailyCapUsd: Number(
      process.env.LOOPRITE_DEFAULT_DAILY_CAP || fileCfg.defaultDailyCapUsd || DEFAULTS.defaultDailyCapUsd,
    ),
  };
  if (process.env.LOOPRITE_TLS_CERT && process.env.LOOPRITE_TLS_KEY) {
    cfg.tls = { certPath: process.env.LOOPRITE_TLS_CERT, keyPath: process.env.LOOPRITE_TLS_KEY };
  }
  return cfg;
}

const LOOPBACK = new Set(['127.0.0.1', '::1', 'localhost']);

// Refuse insecure startup. Returns [] if safe, else array of human-readable problems.
export function validateForServe(cfg) {
  const problems = [];
  const isLoopback = LOOPBACK.has(cfg.host);
  const allowInsecure = process.env.LOOPRITE_ALLOW_INSECURE_BIND === '1';
  if (!isLoopback && !cfg.tls && !allowInsecure) {
    problems.push(
      `Refusing to bind non-loopback host "${cfg.host}" without TLS. Either set ` +
      `LOOPRITE_TLS_CERT + LOOPRITE_TLS_KEY, bind to 127.0.0.1, or (only behind a trusted ` +
      `reverse proxy / private network) set LOOPRITE_ALLOW_INSECURE_BIND=1.`,
    );
  }
  if (cfg.tls) {
    for (const [k, p] of [['certificate', cfg.tls.certPath], ['key', cfg.tls.keyPath]]) {
      if (!fs.existsSync(p)) problems.push(`TLS ${k} not found at ${p}`);
    }
  }
  if (!fs.existsSync(cfg.masterKeyPath)) {
    problems.push(`Master key missing (${cfg.masterKeyPath}). Run "l00prite init" first.`);
  }
  return problems;
}

export function ensureHome(cfg) {
  fs.mkdirSync(cfg.home, { recursive: true, mode: 0o700 });
}
