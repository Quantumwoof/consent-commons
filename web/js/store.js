// Browser storage for the demo. Each visitor gets their OWN synthetic commons in localStorage:
// nothing is sent to any server, and "Reset demo" starts over.
import { Commons } from '/src/core/commons.js';
import { Ledger } from '/src/core/ledger.js';
import { createSigner, signingSupported } from '/src/core/signer.js';
import { seedCommons } from '/src/core/seed.js';

const KEY = 'cc.ledger.v1';
const SKEY = 'cc.signer.v1';
export const RKEY = 'cc.lastReceipt.v1';

async function getSigner() {
  if (!(await signingSupported())) return null;
  let saved = null;
  try { saved = JSON.parse(localStorage.getItem(SKEY) || 'null'); } catch { /* ignore */ }
  const s = await createSigner(saved);
  localStorage.setItem(SKEY, JSON.stringify(s.export()));
  return s;
}

let cached = null;
export async function loadCommons({ fresh = false } = {}) {
  if (cached && !fresh) return cached;
  const signer = await getSigner();
  const raw = localStorage.getItem(KEY);
  if (raw) {
    try {
      const entries = Ledger.parseJSONL(raw);
      const key = entries[0]?.data?.signing_key?.key_id ?? null;
      if (key === (signer?.keyId ?? null)) { cached = await Commons.load(entries, { signer }); return cached; }
    } catch { /* fall through to a fresh seed */ }
  }
  const { commons } = await seedCommons({ signer });
  save(commons);
  cached = commons;
  return cached;
}
export function save(c) { localStorage.setItem(KEY, c.ledger.toJSONL()); }
export async function resetDemo() {
  localStorage.removeItem(KEY); localStorage.removeItem(SKEY); sessionStorage.removeItem(RKEY);
  cached = null; return loadCommons();
}
/** Re-load when another tab (e.g. the chat) changes the ledger. */
export function onExternalChange(fn) {
  window.addEventListener('storage', async (e) => { if (e.key === KEY) { cached = null; fn(await loadCommons()); } });
}
