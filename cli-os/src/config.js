// Configuration loader. Sources (later wins): built-in defaults -> $LOOPRITE_HOME/config.json -> env.
// No insecure defaults: validate() refuses dangerous combinations at startup.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

// Silence only node:sqlite's ExperimentalWarning; re-emit everything else.
const _origEmit = process.emitWarning;
process.emitWarning = (warning, ...rest) => {
  // Node may pass the warning name via rest[0] (string or {type}) OR as warning.name on an Error.
  const name = rest[0]?.type || rest[0] || (warning && typeof warning === 'object' ? warning.name : undefined);
  const msg = typeof warning === 'string' ? warning : warning?.message || '';
  if (name === 'ExperimentalWarning' && /SQLite/i.test(msg)) return;
  return _origEmit.call(process, warning, ...rest);
};

const DEFAULTS = {
  host: '127.0.0.1',
  port: 8787,
  tls: null, // { certPath, keyPath }
  defaultDailyCapUsd: 10,
  defaultMaxTokens: 4096, // bounds output when a client omits max_tokens, so reservations hold
  retry: { maxAttempts: 3, baseMs: 250, maxMs: 4000 },
  memory: { latencyMs: 150, contextTokens: 8000, maxFileBytes: 262144 },
  requestTimeoutMs: 120000,
  // Routing OPINIONS (facts — capabilities, prices, context — live in the provider manifests).
  // All fields here are operator-editable via config.json's `routing` block; these are only
  // sensible defaults so the auto-router works zero-config. See docs/routing-auto-mode.md.
  routing: {
    autoDefaultProfile: 'balanced', // profile used for a bare `auto` with no `:profile` suffix
    // Built-in task/preference profiles. `preference` is one of cost | quality | balanced.
    // `require` (optional) forces capabilities regardless of what the request implies. Operators
    // add their own profiles here (e.g. { vision: { require: ['vision'], preference: 'quality' } }).
    profiles: {
      cheap: { preference: 'cost' }, // "most efficient" mode: cheapest sufficient model
      quality: { preference: 'quality' }, // best model for the task by operator rank
      balanced: { preference: 'balanced' }, // blend of cost and quality
    },
    // Operator-assigned static quality rank per `provider/model` (0-100, higher = better). This is
    // the explainable "quality" signal — NO inference/ML (see routing-rules-v1.md Q2). Ships with
    // defaults; override per install. Unranked models get a neutral default at scoring time.
    qualityRanks: {
      'anthropic/claude-opus-4-8': 96,
      'anthropic/claude-fable-5': 93,
      'anthropic/claude-sonnet-5': 88,
      'anthropic/claude-haiku-4-5': 74,
      'zhipu/glm-5.2': 82,
      'zhipu/glm-5.1': 78,
      'zhipu/glm-5v-turbo': 70,
    },
    // Cross-provider bridging is OFF by default (safe-by-default: no silent cross-provider spend).
    // maxHops is the hard cap on delegated sub-calls per request; a request header may only LOWER
    // it, never raise it (self-modification guard, mirroring Execution Mode).
    bridge: { enabled: false, maxHops: 3 },
  },
};

// Facts vs opinions: deep-merge the `routing` block so a config.json override tweaks individual
// profiles / ranks instead of wholesale-replacing the defaults (a shallow spread would drop every
// built-in the moment an operator sets one field).
function mergeRouting(base, override = {}) {
  return {
    autoDefaultProfile: override.autoDefaultProfile || base.autoDefaultProfile,
    profiles: { ...base.profiles, ...(override.profiles || {}) },
    qualityRanks: { ...base.qualityRanks, ...(override.qualityRanks || {}) },
    bridge: { ...base.bridge, ...(override.bridge || {}) },
  };
}

function finiteOr(v, fallback) {
  const n = Number(v);
  return Number.isFinite(n) && n >= 0 ? n : fallback;
}

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
    port: Number(process.env.LOOPRITE_PORT || fileCfg.port || DEFAULTS.port) || DEFAULTS.port,
    // A malformed cap must fail SAFE (fall back to the default), never become NaN — a NaN cap
    // would make every reserve() comparison false and silently disable the budget.
    defaultDailyCapUsd: finiteOr(
      process.env.LOOPRITE_DEFAULT_DAILY_CAP ?? fileCfg.defaultDailyCapUsd, DEFAULTS.defaultDailyCapUsd,
    ),
    defaultMaxTokens: finiteOr(
      process.env.LOOPRITE_DEFAULT_MAX_TOKENS ?? fileCfg.defaultMaxTokens, DEFAULTS.defaultMaxTokens,
    ) || DEFAULTS.defaultMaxTokens,
  };
  if (process.env.LOOPRITE_TLS_CERT && process.env.LOOPRITE_TLS_KEY) {
    cfg.tls = { certPath: process.env.LOOPRITE_TLS_CERT, keyPath: process.env.LOOPRITE_TLS_KEY };
  }
  // Deep-merge routing opinions, then apply env overrides for the operational bridge switches.
  cfg.routing = mergeRouting(DEFAULTS.routing, fileCfg.routing);
  if (process.env.LOOPRITE_BRIDGE_ENABLED != null) {
    cfg.routing.bridge.enabled = process.env.LOOPRITE_BRIDGE_ENABLED === '1';
  }
  const envHops = Number(process.env.LOOPRITE_BRIDGE_MAX_HOPS);
  if (Number.isFinite(envHops) && envHops >= 0) cfg.routing.bridge.maxHops = Math.floor(envHops);
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
  const envKeyOk = (() => {
    const k = process.env.LOOPRITE_MASTER_KEY;
    if (!k) return false;
    try { return Buffer.from(k, 'base64').length === 32; } catch { return false; }
  })();
  if (!envKeyOk && !fs.existsSync(cfg.masterKeyPath)) {
    problems.push(`Master key missing. Set LOOPRITE_MASTER_KEY (base64 of 32 bytes) or run "l00prite init" first.`);
  }
  return problems;
}

export function ensureHome(cfg) {
  fs.mkdirSync(cfg.home, { recursive: true, mode: 0o700 });
}
