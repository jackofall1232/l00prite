// l00prite CLI-OS — admin control surface. Manages provider keys, gateway tokens, repos, cost
// caps, and starts the server. This is the CLI half of "CLI for the control plane, SDK/tool for
// the data plane". Invoked via bin/cli.js (which applies the ExperimentalWarning suppression).
import path from 'node:path';
import { loadConfig, ensureHome } from './config.js';
import { openDb } from './state/db.js';
import { ensureMasterKey, encryptSecret } from './security/vault.js';
import { mintToken, listTokens, revokeToken } from './security/tokens.js';
import { defaultAdapterKind, defaultBaseUrl } from './gateway/adapters/registry.js';
import { explain, recent } from './ledger/ledger.js';
import { getSpend } from './policy/pep.js';
import { startServer } from './server.js';
import { nowISO, rid } from './util.js';

function parse(argv) {
  const pos = []; const flags = {};
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a.startsWith('--')) { const k = a.slice(2); const v = (argv[i + 1] && !argv[i + 1].startsWith('--')) ? argv[++i] : true; flags[k] = v; }
    else pos.push(a);
  }
  return { pos, flags };
}
const audit = (db, action, detail) => db.prepare(`INSERT INTO audit(id,ts,actor,action,detail) VALUES(?,?,?,?,?)`).run(rid('aud'), nowISO(), 'cli', action, detail || null);
const withDb = (cfg) => { ensureHome(cfg); return openDb(cfg.dbPath); };

const HELP = `l00prite CLI-OS — control plane

  l00prite init                                 Initialize data dir, database, master key
  l00prite serve [--host H] [--port N]          Start the gateway + dashboard
  l00prite health                               Print provider + spend status

  l00prite provider add <name> [--key K] [--adapter native-messages|openai-compat|mock]
                              [--base URL] [--default]
  l00prite provider list
  l00prite provider default <name>
  l00prite provider enable|disable|remove <name>

  l00prite token mint --project P [--repo ID] [--expires DAYS]
  l00prite token list
  l00prite token revoke <id>

  l00prite repo register <id> --root PATH [--project P]
  l00prite repo list

  l00prite cap set --project P --daily USD
  l00prite cap list

  l00prite route explain <request-id>
  l00prite ledger [--limit N]
`;

function main() {
  const cfg = loadConfig();
  const { pos, flags } = parse(process.argv.slice(2));
  const [cmd, sub, arg] = pos;

  if (!cmd || cmd === 'help' || flags.help) { console.log(HELP); return; }

  if (cmd === 'init') {
    ensureHome(cfg);
    ensureMasterKey(cfg.masterKeyPath);
    const db = withDb(cfg);
    audit(db, 'init', cfg.home);
    console.log(`Initialized l00prite CLI-OS at ${cfg.home}`);
    console.log('Next:');
    console.log('  l00prite provider add mock --adapter mock --default   # zero-key demo upstream');
    console.log('  l00prite token mint --project demo');
    console.log('  l00prite serve');
    return;
  }

  if (cmd === 'serve') { startServer({ ...(flags.host ? { host: flags.host } : {}), ...(flags.port ? { port: Number(flags.port) } : {}) }); return; }

  const db = withDb(cfg);

  if (cmd === 'health') {
    const provs = db.prepare(`SELECT name,adapter,enabled,is_default FROM providers ORDER BY is_default DESC`).all();
    console.log('Providers:'); provs.forEach((p) => console.log(`  ${p.is_default ? '★' : ' '} ${p.name.padEnd(14)} ${p.adapter.padEnd(16)} ${p.enabled ? 'enabled' : 'disabled'}`));
    return;
  }

  if (cmd === 'provider') {
    if (sub === 'add') {
      const name = arg; if (!name) return console.error('usage: provider add <name> [--key K] ...');
      const existing = db.prepare(`SELECT enc_key, is_default FROM providers WHERE name = ?`).get(name);
      const adapter = flags.adapter || defaultAdapterKind(name);
      const base = flags.base || defaultBaseUrl(name) || null;
      // Preserve the stored key when re-running `provider add` without --key (e.g. to change
      // --base or --default) so an existing provider isn't silently left keyless.
      const enc = (flags.key && adapter !== 'mock') ? encryptSecret(cfg, String(flags.key)) : (existing?.enc_key ?? null);
      if (adapter !== 'mock' && !enc) console.warn(`  ! no --key given; provider "${name}" will fail real calls until a key is added.`);
      const isDef = flags.default ? 1 : (existing?.is_default ?? 0);
      db.prepare(`INSERT OR REPLACE INTO providers(name,adapter,base_url,enc_key,enabled,is_default,created_at) VALUES(?,?,?,?,1,?,?)`)
        .run(name, adapter, base, enc, isDef, nowISO());
      if (flags.default) db.prepare(`UPDATE providers SET is_default = CASE WHEN name = ? THEN 1 ELSE 0 END`).run(name);
      audit(db, 'provider.add', name);
      console.log(`Added provider "${name}" (adapter=${adapter}${base ? `, base=${base}` : ''})${flags.default ? ' [default]' : ''}`);
      return;
    }
    if (sub === 'list') { db.prepare(`SELECT name,adapter,base_url,enabled,is_default,enc_key FROM providers`).all().forEach((p) => console.log(`${p.is_default ? '★' : ' '} ${p.name.padEnd(14)} ${p.adapter.padEnd(16)} key:${p.enc_key ? 'yes' : 'no '} ${p.enabled ? 'enabled' : 'disabled'} ${p.base_url || ''}`)); return; }
    if (sub === 'default') { db.prepare(`UPDATE providers SET is_default = CASE WHEN name = ? THEN 1 ELSE 0 END`).run(arg); console.log(`Default provider: ${arg}`); return; }
    if (sub === 'enable' || sub === 'disable') { db.prepare(`UPDATE providers SET enabled = ? WHERE name = ?`).run(sub === 'enable' ? 1 : 0, arg); console.log(`${arg}: ${sub}d`); return; }
    if (sub === 'remove') { db.prepare(`DELETE FROM providers WHERE name = ?`).run(arg); console.log(`Removed ${arg}`); return; }
    return console.error('unknown provider subcommand');
  }

  if (cmd === 'token') {
    if (sub === 'mint') {
      if (!flags.project) return console.error('usage: token mint --project P [--repo ID] [--expires DAYS]');
      const { id, token } = mintToken(db, { project: String(flags.project), repo: flags.repo ? String(flags.repo) : null, expiresDays: flags.expires ? Number(flags.expires) : null });
      audit(db, 'token.mint', id);
      console.log('Token minted (shown once — store it now):\n');
      console.log('  ' + token + '\n');
      console.log(`  id=${id} project=${flags.project}${flags.repo ? ` repo=${flags.repo}` : ''}`);
      return;
    }
    if (sub === 'list') { listTokens(db).forEach((t) => console.log(`${t.id}  project=${t.project}  repo=${t.repo || '-'}  ${t.revoked ? 'REVOKED' : 'active'}${t.expires_at ? `  exp=${t.expires_at}` : ''}`)); return; }
    if (sub === 'revoke') { console.log(revokeToken(db, arg) ? `Revoked ${arg}` : `No such token ${arg}`); audit(db, 'token.revoke', arg); return; }
    return console.error('unknown token subcommand');
  }

  if (cmd === 'repo') {
    if (sub === 'register') {
      const id = arg; if (!id || !flags.root) return console.error('usage: repo register <id> --root PATH [--project P]');
      const root = path.resolve(String(flags.root));
      db.prepare(`INSERT OR REPLACE INTO repos(id,root,project,created_at) VALUES(?,?,?,?)`).run(id, root, String(flags.project || 'default'), nowISO());
      audit(db, 'repo.register', id);
      console.log(`Registered repo "${id}" -> ${root} (project=${flags.project || 'default'})`);
      return;
    }
    if (sub === 'list') { db.prepare(`SELECT * FROM repos`).all().forEach((r) => console.log(`${r.id.padEnd(20)} project=${r.project.padEnd(12)} ${r.root}`)); return; }
    return console.error('unknown repo subcommand');
  }

  if (cmd === 'cap') {
    if (sub === 'set') { if (!flags.project || flags.daily == null) return console.error('usage: cap set --project P --daily USD'); db.prepare(`INSERT OR REPLACE INTO caps(project,window,limit_usd) VALUES(?,'daily',?)`).run(String(flags.project), Number(flags.daily)); audit(db, 'cap.set', `${flags.project}=${flags.daily}`); console.log(`Daily cap for "${flags.project}" set to $${Number(flags.daily).toFixed(2)}`); return; }
    if (sub === 'list') { db.prepare(`SELECT * FROM caps`).all().forEach((c) => { const s = getSpend(db, c.project, cfg.defaultDailyCapUsd); console.log(`${c.project.padEnd(16)} daily $${c.limit_usd.toFixed(2)}  spent today $${(s.reserved + s.committed).toFixed(4)}`); }); return; }
    return console.error('unknown cap subcommand');
  }

  if (cmd === 'route' && sub === 'explain') {
    const rows = explain(db, arg);
    if (!rows.length) return console.log(`No ledger rows for "${arg}"`);
    rows.forEach((r) => { console.log(`\nrequest ${r.request_id} @ ${r.ts}`); console.log(`  route   ${r.provider}/${r.model}  (rule: ${r.rule_id})`); if (r.decision) console.log(`  reason  ${JSON.parse(r.decision).reason}`); console.log(`  tokens  in=${r.prompt_tokens} out=${r.completion_tokens} cache_read=${r.cache_read_tokens}`); console.log(`  cost    $${(r.cost_usd ?? 0).toFixed(6)}${r.cost_estimated ? ' (estimated/unconfirmed price)' : ''}`); console.log(`  memory  ${r.memory_status}   outcome ${r.outcome}`); });
    return;
  }

  if (cmd === 'ledger') { recent(db, Number(flags.limit || 20)).forEach((r) => console.log(`${r.ts}  ${(r.provider || '?')+'/'+(r.model||'?')}  $${(r.cost_usd ?? 0).toFixed(5)}  ${r.outcome}`)); return; }

  console.error(`unknown command "${cmd}"\n`); console.log(HELP);
}

main();
