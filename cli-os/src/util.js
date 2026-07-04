import crypto from 'node:crypto';

export const nowISO = () => new Date().toISOString();
export const utcDay = (d = new Date()) => d.toISOString().slice(0, 10); // YYYY-MM-DD (UTC)
export const rid = (prefix = 'id') => `${prefix}_${crypto.randomBytes(9).toString('hex')}`;

export function timingSafeEqual(a, b) {
  const ab = Buffer.from(String(a));
  const bb = Buffer.from(String(b));
  if (ab.length !== bb.length) return false;
  return crypto.timingSafeEqual(ab, bb);
}

export const sha256hex = (s) => crypto.createHash('sha256').update(s).digest('hex');

export function estimateTokensFromChars(chars) {
  // Rough pre-flight estimate ONLY (reservation ceiling). Real usage comes from the provider.
  return Math.ceil(chars / 3.5);
}
