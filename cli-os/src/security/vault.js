// Provider-key vault. Keys are AES-256-GCM encrypted at rest under a master key that lives
// only on the server (keyfile, 0600). Plaintext keys are never logged, never returned by any
// endpoint, and only decrypted at call time inside the adapter.
import crypto from 'node:crypto';
import fs from 'node:fs';

export function ensureMasterKey(masterKeyPath) {
  if (fs.existsSync(masterKeyPath)) return;
  const key = crypto.randomBytes(32);
  fs.writeFileSync(masterKeyPath, key.toString('base64'), { mode: 0o600 });
  fs.chmodSync(masterKeyPath, 0o600);
}

function loadMasterKey(cfg) {
  if (process.env.LOOPRITE_MASTER_KEY) {
    const k = Buffer.from(process.env.LOOPRITE_MASTER_KEY, 'base64');
    if (k.length !== 32) throw new Error('LOOPRITE_MASTER_KEY must be base64 of 32 bytes');
    return k;
  }
  const raw = fs.readFileSync(cfg.masterKeyPath, 'utf8').trim();
  const k = Buffer.from(raw, 'base64');
  if (k.length !== 32) throw new Error('master.key is corrupt (expected 32 bytes)');
  return k;
}

// Returns "v1.<iv b64>.<tag b64>.<ct b64>"
export function encryptSecret(cfg, plaintext) {
  const key = loadMasterKey(cfg);
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
  const ct = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return ['v1', iv.toString('base64'), tag.toString('base64'), ct.toString('base64')].join('.');
}

export function decryptSecret(cfg, blob) {
  const key = loadMasterKey(cfg);
  const [ver, ivb, tagb, ctb] = String(blob).split('.');
  if (ver !== 'v1') throw new Error('unknown ciphertext version');
  const decipher = crypto.createDecipheriv('aes-256-gcm', key, Buffer.from(ivb, 'base64'));
  decipher.setAuthTag(Buffer.from(tagb, 'base64'));
  return Buffer.concat([decipher.update(Buffer.from(ctb, 'base64')), decipher.final()]).toString('utf8');
}
