// SHA-256 helpers built on Web Crypto, so the exact same code runs in Node (>=20) and in the browser.
import { canonicalize } from './canonical.js';

const enc = new TextEncoder();
const subtle = () => {
  const s = globalThis.crypto?.subtle;
  if (!s) throw new Error('Web Crypto is not available (the browser needs HTTPS or localhost).');
  return s;
};
export const toHex = (buf) => Array.from(new Uint8Array(buf), (b) => b.toString(16).padStart(2, '0')).join('');

export async function sha256Hex(text) {
  return toHex(await subtle().digest('SHA-256', enc.encode(text)));
}
/** Digest of a JSON value = SHA-256 of its canonical form. */
export const digestOf = (value) => sha256Hex(canonicalize(value));

// Crockford base32: no I, L, O or U, so codes are easy to read aloud or copy from a phone screen.
const B32 = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';
export function randomBytes(n) {
  const b = new Uint8Array(n); globalThis.crypto.getRandomValues(b); return b;
}
export function base32(bytes) {
  let bits = 0, val = 0, out = '';
  for (const byte of bytes) {
    val = (val << 8) | byte; bits += 8;
    while (bits >= 5) { out += B32[(val >>> (bits - 5)) & 31]; bits -= 5; }
  }
  if (bits > 0) out += B32[(val << (5 - bits)) & 31];
  return out;
}
/** A private code a person keeps (e.g. "7KQ2-M9XA-T4PB-W3HC"): 80 random bits, grouped in fours. */
export function newPersonalCode() {
  return base32(randomBytes(10)).match(/.{1,4}/g).join('-');
}
/** Normalise what a person types: case, spaces, look-alike letters (O→0, I/L→1). */
export function normaliseCode(input) {
  return String(input ?? '').toUpperCase().replace(/[\s_]/g, '').replace(/O/g, '0').replace(/[IL]/g, '1')
    .replace(/-/g, '').match(/.{1,4}/g)?.join('-') ?? '';
}
export const newId = (prefix, bytes = 8) => `${prefix}_${toHex(randomBytes(bytes))}`;
