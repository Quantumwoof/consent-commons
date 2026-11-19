// Ed25519 signatures for receipts and release manifests (Web Crypto; Node >= 20, current browsers).
// The hash chain proves the record was not edited; the signature proves WHO issued a receipt, so a person
// can show their receipt to anyone and it cannot be forged or quietly denied by the commons later.
// DEMO KEY MANAGEMENT ONLY: the demo keeps the steward key in the browser. A real deployment would hold it
// on stewards' own devices or a hardware key, with a published public key and a rotation plan.
import { canonicalize } from './canonical.js';
import { digestOf } from './hash.js';

const subtle = () => globalThis.crypto.subtle;
const ALG = { name: 'Ed25519' };
const b64u = (buf) => {
  const s = typeof Buffer !== 'undefined' ? Buffer.from(buf).toString('base64') : btoa(String.fromCharCode(...new Uint8Array(buf)));
  return s.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
};
const unb64u = (s) => {
  const b = s.replace(/-/g, '+').replace(/_/g, '/');
  if (typeof Buffer !== 'undefined') return new Uint8Array(Buffer.from(b, 'base64'));
  return Uint8Array.from(atob(b), (c) => c.charCodeAt(0));
};

export async function signingSupported() {
  try { await subtle().generateKey(ALG, false, ['sign', 'verify']); return true; } catch { return false; }
}

export async function createSigner(saved) {
  let privateJwk, publicJwk;
  if (saved?.privateJwk && saved?.publicJwk) ({ privateJwk, publicJwk } = saved);
  else {
    const kp = await subtle().generateKey(ALG, true, ['sign', 'verify']);
    privateJwk = await subtle().exportKey('jwk', kp.privateKey);
    publicJwk = await subtle().exportKey('jwk', kp.publicKey);
  }
  const key = await subtle().importKey('jwk', privateJwk, ALG, false, ['sign']);
  const pub = { kty: publicJwk.kty, crv: publicJwk.crv, x: publicJwk.x };
  const keyId = (await digestOf(pub)).slice(0, 16);
  return {
    keyId, publicJwk: pub,
    export: () => ({ privateJwk, publicJwk }),
    /** Sign the canonical form of a JSON value. */
    async sign(value) {
      const sig = await subtle().sign(ALG, key, new TextEncoder().encode(canonicalize(value)));
      return { alg: 'Ed25519', key_id: keyId, public_key: pub, value: b64u(sig) };
    },
  };
}

/** Verify a signature block over a value. Optionally insist on a specific trusted public key. */
export async function verifySignature(value, signature, { trustedKeyId } = {}) {
  try {
    if (!signature || signature.alg !== 'Ed25519') return { ok: false, code: 'sig_missing', reason: 'missing or unsupported signature' };
    const keyId = (await digestOf(signature.public_key)).slice(0, 16);
    if (keyId !== signature.key_id) return { ok: false, code: 'sig_keyid', reason: 'key id does not match the public key' };
    if (trustedKeyId && keyId !== trustedKeyId) return { ok: false, code: 'sig_untrusted', reason: 'signed by a key this commons does not use' };
    const key = await subtle().importKey('jwk', { ...signature.public_key, ext: true }, ALG, false, ['verify']);
    const ok = await subtle().verify(ALG, key, unb64u(signature.value), new TextEncoder().encode(canonicalize(value)));
    return ok ? { ok: true, keyId } : { ok: false, code: 'sig_changed', reason: 'signature does not match the content (it was changed)' };
  } catch (e) { return { ok: false, code: 'sig_error', reason: `could not verify: ${e.message}` }; }
}
