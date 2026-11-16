import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { seedCommons } from '../src/core/seed.js';
import { audit } from '../src/core/commons.js';

test('demo seed tells the intended story and audits clean', async () => {
  const { commons } = await seedCommons();
  const s = await commons.state();
  const st = Object.fromEntries([...s.requests.values()].map((r) => [r.request.request_id, r.status]));
  assert.deepEqual(st, { ar_demo_ibadan_mood: 'released', ar_demo_startup_chat: 'blocked', ar_demo_ngo_usage: 'in_review', ar_demo_followup: 'blocked', ar_demo_gov_targeting: 'rejected' });
  assert.ok(s.requests.get('ar_demo_followup').checks.blocks.some((b) => b.code === 'COHORT_TOUCHES_WITHDRAWN'));
  assert.ok(s.requests.get('ar_demo_startup_chat').checks.blocks.some((b) => b.code === 'BELOW_K_MINIMUM'));
  assert.equal(s.requests.get('ar_demo_ngo_usage').history.length, 1);
  assert.equal(s.notices.length, 1);
  assert.equal((await audit(commons.entries)).ok, true);
  for (const c of s.consents.values()) assert.equal(c.terms.synthetic, true);
});

test('CLI: seed, verify, tamper-demo, check, validate', () => {
  const dir = mkdtempSync(join(tmpdir(), 'cc-'));
  const ledger = join(dir, 'ledger.jsonl');
  const run = (...a) => spawnSync(process.execPath, ['bin/commons.js', ...a], { encoding: 'utf8' });
  execFileSync(process.execPath, ['bin/commons.js', 'seed', '--out', ledger]);
  assert.equal(run('verify', ledger).status, 0);
  assert.equal(run('tamper-demo', ledger).status, 0);
  const lines = readFileSync(ledger, 'utf8').trim().split('\n');
  const e = JSON.parse(lines[5]); e.data.terms.cross_border_transfer = true; lines[5] = JSON.stringify(e);
  writeFileSync(join(dir, 'bad.jsonl'), lines.join('\n'));
  const bad = run('verify', join(dir, 'bad.jsonl'));
  assert.equal(bad.status, 1); assert.match(bad.stdout, /BROKEN at entry #5/);
  assert.equal(run('check', join(dir, 'access-request.example.json'), ledger).status, 0);
  assert.equal(run('validate', join(dir, 'release-manifest.example.json'), '--schema', 'release-manifest').status, 0);
});
