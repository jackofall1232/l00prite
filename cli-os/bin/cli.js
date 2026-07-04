#!/usr/bin/env node
// Thin launcher. Re-execs node once with --no-warnings=ExperimentalWarning BEFORE any module
// that imports node:sqlite is loaded, so the (cosmetic) SQLite experimental warning never
// reaches operators. Then dynamically imports the real CLI. The re-exec is skipped when the
// flag is already active (npm scripts, or nested invocations).
import { spawnSync } from 'node:child_process';

const hasFlag = (process.execArgv || []).some((a) => a.includes('no-warnings'))
  || String(process.env.NODE_OPTIONS || '').includes('no-warnings');

if (!hasFlag && !process.env._L00P_REEXEC) {
  const r = spawnSync(process.execPath, ['--no-warnings=ExperimentalWarning', ...process.argv.slice(1)], {
    stdio: 'inherit',
    env: { ...process.env, _L00P_REEXEC: '1' },
  });
  process.exit(r.status ?? 0);
} else {
  await import('../src/cli-main.js');
}
