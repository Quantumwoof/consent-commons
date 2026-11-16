#!/usr/bin/env node
// Consent Commons command-line tool. Anyone with a copy of a ledger can audit it; no account, no server.
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { Ledger, verifyChain } from '../src/core/ledger.js';
import { audit, replay, verifyReceipt } from '../src/core/commons.js';
import { runChecks } from '../src/core/policy.js';
import { createSigner } from '../src/core/signer.js';
import { seedCommons } from '../src/core/seed.js';

const [cmd, ...args] = process.argv.slice(2);
const flag = (name, dflt) => { const i = args.indexOf(`--${name}`); return i >= 0 ? args[i + 1] : dflt; };
const pos = args.filter((a, i) => !a.startsWith('--') && !args[i - 1]?.startsWith('--'));
const readJSON = (f) => JSON.parse(readFileSync(f, 'utf8'));
const readLedger = (f) => Ledger.parseJSONL(readFileSync(f, 'utf8'));
const ok = (b) => (b ? '\x1b[32m✓\x1b[0m' : '\x1b[31m✗\x1b[0m');
const out = (f, text) => { mkdirSync(dirname(resolve(f)), { recursive: true }); writeFileSync(f, text); };

const HELP = `consent-commons: audit a consent ledger from the command line (synthetic demo data only)

  commons seed [--out examples/demo-ledger.jsonl]     build the synthetic demo ledger (+ example documents)
  commons verify <ledger.jsonl>                       check the hash chain AND replay every governance rule
  commons verify-receipt <receipt.json> <ledger.jsonl> check a person's receipt against a ledger
  commons check <request.json> <ledger.jsonl>         run the automatic checks on a draft access request
  commons tamper-demo <ledger.jsonl> [--seq N]        edit one entry in memory and show the audit catch it
  commons validate <doc.json> --schema <name>         validate against schema/<name>.v1.json
                                                      (consent-terms, access-request, release-manifest, consent-receipt, ledger-entry)`;

async function main() {
  switch (cmd) {
    case 'seed': {
      const file = flag('out', 'examples/demo-ledger.jsonl');
      const { commons, people, releaseId } = await seedCommons({ signer: await createSigner() });
      out(file, commons.ledger.toJSONL());
      const s = await commons.state();
      const dir = dirname(file);
      const firstConsent = commons.entries.find((e) => e.type === 'CONSENT_GRANTED');
      out(`${dir}/consent-terms.example.json`, JSON.stringify(firstConsent.data.terms, null, 2) + '\n');
      out(`${dir}/access-request.example.json`, JSON.stringify(s.requests.get('ar_demo_ibadan_mood').request, null, 2) + '\n');
      out(`${dir}/release-manifest.example.json`, JSON.stringify(s.releases.get(releaseId).manifest, null, 2) + '\n');
      // A receipt for the last person (re-issued here for the example; the chat issues them live).
      const last = people.at(-1);
      const c = s.consents.get(last.subject_ref);
      const e = commons.entries[c.granted_seq];
      console.log(`wrote ${file} (${commons.entries.length} entries) and example documents in ${dir}/`);
      console.log(`example withdrawal code (synthetic person ${last.subject_ref}): ${last.code}`);
      out(`${dir}/consent-receipt.example.json`, JSON.stringify({ note: 'Example only. Real receipts are issued and signed by the chat at the moment of consent.', terms_digest: c.terms_digest, ledger_entry: { seq: e.seq, hash: e.hash } }, null, 2) + '\n');
      return 0;
    }
    case 'verify': {
      const entries = readLedger(pos[0]);
      const r = await audit(entries);
      console.log(`${ok(r.chain.ok)} hash chain: ${r.chain.ok ? `${r.entries} entries, head ${r.head}` : `BROKEN at entry #${r.chain.brokenAt}: ${r.chain.reason}`}`);
      console.log(`${ok(!r.violations.length)} governance rules replayed: ${r.violations.length ? r.violations.length + ' violation(s)' : 'every entry followed the rules'}`);
      for (const v of r.violations) console.log(`   #${v.seq} ${v.type} [${v.rule}] ${v.message}`);
      return r.ok ? 0 : 1;
    }
    case 'verify-receipt': {
      const r = await verifyReceipt(readJSON(pos[0]), readLedger(pos[1]));
      for (const c of r.checks) console.log(`${ok(c.ok)} ${c.name}: ${c.detail}`);
      if (r.status) console.log(`  consent status now: ${r.status}`);
      return r.ok ? 0 : 1;
    }
    case 'check': {
      const s = await replay(readLedger(pos[1]));
      const req = readJSON(pos[0]);
      const c = runChecks(req, s.consents, s.policy, new Date(), s.releases);
      console.log(`${ok(c.passed)} ${c.passed ? 'passes automatic checks' : 'BLOCKED'}: ${c.eligible_count} of ${c.active_consents} active consents cover this request`);
      for (const b of c.blocks) console.log(`   block ${b.code}: ${b.message}`);
      for (const w of c.warnings) console.log(`   warn  ${w.code}: ${w.message}`);
      for (const [k, n] of Object.entries(c.excluded)) console.log(`   excluded (${k}): ${n}`);
      return c.passed ? 0 : 1;
    }
    case 'tamper-demo': {
      const entries = readLedger(pos[0]);
      const seq = Number(flag('seq', entries.findIndex((e) => e.type === 'CONSENT_GRANTED')));
      const before = await verifyChain(entries);
      console.log(`${ok(before.ok)} original ledger verifies (${entries.length} entries)`);
      const t = structuredClone(entries);
      if (t[seq].type === 'CONSENT_GRANTED') t[seq].data.terms.purposes.allowed.push('ai_training_commercial');
      else t[seq].data.tampered = true;
      console.log(`  ...silently editing entry #${seq} (${t[seq].type}) in memory`);
      const after = await verifyChain(t);
      console.log(`${ok(!after.ok)} tampering detected: broken at entry #${after.brokenAt}: ${after.reason}`);
      const drop = structuredClone(entries); drop.splice(seq, 1);
      const d = await verifyChain(drop);
      console.log(`${ok(!d.ok)} deleting entry #${seq} detected: broken at entry #${d.brokenAt}: ${d.reason}`);
      return after.ok || d.ok ? 1 : 0;
    }
    case 'validate': {
      const { default: Ajv } = await import('ajv/dist/2020.js');
      const { default: addFormats } = await import('ajv-formats');
      const ajv = new Ajv({ allErrors: true, strict: false }); addFormats(ajv);
      for (const n of ['consent-terms', 'access-request', 'release-manifest', 'ledger-entry', 'consent-receipt']) ajv.addSchema(readJSON(new URL(`../schema/${n}.v1.json`, import.meta.url)), `${n}.v1.json`);
      const name = flag('schema', 'consent-terms');
      const v = ajv.getSchema(`${name}.v1.json`);
      const valid = v(readJSON(pos[0]));
      console.log(`${ok(valid)} ${pos[0]} ${valid ? 'is valid' : 'is NOT valid'} against ${name}.v1.json`);
      for (const e of v.errors ?? []) console.log(`   ${e.instancePath || '/'} ${e.message}`);
      return valid ? 0 : 1;
    }
    default:
      console.log(HELP);
      return cmd ? 1 : 0;
  }
}
main().then((code) => process.exit(code), (e) => { console.error('error:', e.message); process.exit(2); });
