// Ledger explorer: verify integrity + rules, a tamper lab, receipt checking, export/import.
import { loadCommons, resetDemo, onExternalChange, RKEY } from './store.js';
import { el, $, short, fmtTime, download, pill, toast } from './ui.js';
import { audit, verifyReceipt } from '/src/core/commons.js';
import { Ledger, verifyChain, hashEntry } from '/src/core/ledger.js';
import { digestOf } from '/src/core/hash.js';

let commons, filter = '';
const TONE = { GENESIS: 'neutral', CONSENT_GRANTED: 'good', CONSENT_WITHDRAWN: 'bad', ACCESS_REQUESTED: 'info', REVIEW_VOTE: 'neutral', ACCESS_DECIDED: 'warn', DATA_RELEASED: 'good', WITHDRAWAL_NOTICE_ISSUED: 'bad', BENEFIT_DELIVERED: 'good' };

function summary(e) {
  const d = e.data;
  switch (e.type) {
    case 'GENESIS': return `${d.commons.name}: rules set (k ≥ ${d.policy.k_minimum}, quorum ${d.policy.approvals_required}/${d.policy.panel.length})${d.signing_key ? `, signing key ${d.signing_key.key_id}` : ''}`;
    case 'CONSENT_GRANTED': return `${d.terms.subject_ref} consented in ${d.terms.language} (${d.terms.purposes.allowed.length} purposes, ${d.terms.data_categories.length} data types, until ${d.terms.expires_at.slice(0, 10)})`;
    case 'CONSENT_WITHDRAWN': return `${d.subject_ref} withdrew consent ${d.terms_id}`;
    case 'ACCESS_REQUESTED': return `${d.request.request_id} v${d.request.version} from ${d.request.requester.organisation}: ${d.checks.passed ? `passed checks (${d.checks.eligible_count} people)` : 'BLOCKED: ' + d.checks.blocks.map((b) => b.code).join(', ')}`;
    case 'REVIEW_VOTE': return `${d.reviewer_id} ${d.vote}s ${d.request_id} (digest ${short(d.request_digest, 8)})`;
    case 'ACCESS_DECIDED': return `${d.request_id} ${d.outcome.toUpperCase()} (${d.tally.approvals} approve / ${d.tally.rejections} reject)`;
    case 'DATA_RELEASED': return `${d.manifest.release_id}: ${d.manifest.record_count} synthetic records to ${d.manifest.recipient.organisation}`;
    case 'WITHDRAWAL_NOTICE_ISSUED': return `${d.recipient} must delete ${d.record_id} by ${d.delete_by.slice(0, 10)}`;
    case 'BENEFIT_DELIVERED': return `${d.release_id}: ${d.code} delivered`;
    default: return '';
  }
}

async function renderVerify(entries = commons.entries, label = 'This demo ledger') {
  const r = await audit(entries);
  $('#verify-card').replaceChildren(
    el('div', { class: 'row' }, el('h2', { style: 'margin:0' }, r.ok ? '✓ Ledger verified' : '✗ Ledger FAILED verification'), pill(label, 'neutral'), el('span', { class: 'spacer' }), el('button', { class: 'btn btn-primary', type: 'button', onclick: () => renderVerify() }, 'Verify again')),
    el('p', { class: 'small muted', style: 'margin:.3rem 0 .6rem' }, 'Two separate checks. The hash chain proves no entry was edited, removed or reordered. The rule replay re-runs every governance rule from the start, so it also proves nobody broke the rules (for example, released data from someone who had withdrawn).'),
    el('div', { class: 'grid', style: 'grid-template-columns: repeat(auto-fit,minmax(260px,1fr))' },
      el('div', { class: `callout ${r.chain.ok ? 'callout-good' : 'callout-bad'}` }, el('b', {}, r.chain.ok ? '✓ Hash chain intact' : `✗ Chain broken at entry #${r.chain.brokenAt}`), el('div', { class: 'small' }, r.chain.ok ? `${r.entries} entries. Head: ` : r.chain.reason, r.chain.ok ? el('span', { class: 'digest' }, short(r.head, 24)) : null)),
      el('div', { class: `callout ${r.violations.length ? 'callout-bad' : 'callout-good'}` }, el('b', {}, r.violations.length ? `✗ ${r.violations.length} rule violation(s)` : '✓ Every rule was followed'),
        r.violations.length ? el('ul', { class: 'small' }, r.violations.slice(0, 5).map((v) => el('li', {}, `#${v.seq} ${v.type}: ${v.message}`))) : el('div', { class: 'small' }, 'Replayed every entry against the rulebook.'))),
    el('p', { class: 'small muted', style: 'margin:.6rem 0 0' }, 'A real deployment would publish the head hash regularly (e.g. on a public page or in community meetings) so anyone can tell if history is rewritten later.'));
}

function renderEntries() {
  const entries = commons.entries;
  const types = [...new Set(entries.map((e) => e.type))];
  const f = $('#filter');
  f.replaceChildren(el('option', { value: '' }, `All types (${entries.length})`), ...types.map((t) => el('option', { value: t, selected: t === filter }, `${t} (${entries.filter((e) => e.type === t).length})`)));
  f.onchange = () => { filter = f.value; renderEntries(); };
  const rows = entries.filter((e) => !filter || e.type === filter).reverse();
  $('#entries').replaceChildren(el('thead', {}, el('tr', {}, el('th', {}, '#'), el('th', {}, 'Time'), el('th', {}, 'Type'), el('th', {}, 'What happened'), el('th', {}, 'Hash'), el('th', {}, 'Prev'))),
    el('tbody', {}, rows.map((e) => {
      const tr = el('tr', { class: 'clickable', tabindex: '0' }, el('td', {}, e.seq), el('td', { class: 'small' }, fmtTime(e.ts)), el('td', {}, pill(e.type, TONE[e.type])), el('td', {}, summary(e), el('div', { class: 'small muted' }, e.actor)), el('td', { class: 'mono small' }, short(e.hash, 10)), el('td', { class: 'mono small' }, short(e.prev, 10)));
      const toggle = () => { if (tr.nextSibling?.dataset?.detail) tr.nextSibling.remove(); else tr.after(el('tr', { 'data-detail': '1' }, el('td', { colspan: '6' }, el('pre', { class: 'json' }, JSON.stringify(e, null, 2))))); };
      tr.addEventListener('click', toggle); tr.addEventListener('keydown', (ev) => { if (ev.key === 'Enter') toggle(); });
      return tr;
    })));
}

function renderTamper() {
  const out = el('div', { class: 'small' });
  const firstConsent = () => commons.entries.findIndex((e) => e.type === 'CONSENT_GRANTED');
  const run = async (label, mutate) => {
    const copy = structuredClone(commons.entries);
    const note = await mutate(copy);
    const chain = await verifyChain(copy);
    const r = await audit(copy);
    const receipt = await commons.reissueReceipt(firstConsent());
    const rc = await verifyReceipt(receipt, copy);
    out.replaceChildren(el('div', { class: 'callout callout-info' }, el('b', {}, label), el('div', {}, note)),
      el('ul', {},
        el('li', {}, chain.ok ? el('span', { class: 'check-bad' }, '✗ The hash chain alone does NOT catch this: it still links') : el('span', { class: 'check-ok' }, `✓ Hash chain catches it at entry #${chain.brokenAt}: ${chain.reason}`)),
        el('li', {}, r.violations.length ? el('span', { class: 'check-ok' }, `✓ Rule replay: ${r.violations.length} violation(s), first: ${r.violations[0].message}`) : el('span', { class: 'check-bad' }, '✗ Rule replay: no rule broken')),
        el('li', {}, rc.ok ? el('span', { class: 'check-bad' }, '✗ A person\'s kept receipt still matches') : el('span', { class: 'check-ok' }, `✓ The person's kept receipt catches it: ${rc.checks.find((c) => !c.ok).detail}`))),
      el('p', { class: 'muted' }, 'This ran on a copy in memory. The real ledger is untouched. Note: an operator who also holds the signing key could rebuild every manifest so the rule replay passes too. That is why receipts and published head hashes, held outside the ledger, are the last line of defence.'));
  };
  $('#tamper-card').replaceChildren(el('h2', {}, 'Tamper lab'),
    el('p', { class: 'small muted' }, 'Try what a dishonest operator might do. Each attack runs on a copy.'),
    el('div', { class: 'row' },
      el('button', { class: 'btn btn-sm', type: 'button', onclick: () => run('Edit a past consent', (c) => { const i = firstConsent(); c[i].data.terms.purposes.allowed.push('ai_training_commercial'); return `Quietly added "commercial AI training" to entry #${i}.`; }) }, 'Edit a consent'),
      el('button', { class: 'btn btn-sm', type: 'button', onclick: () => run('Delete a withdrawal', (c) => { const i = c.findIndex((e) => e.type === 'CONSENT_WITHDRAWN'); c.splice(i, 1); return `Removed entry #${i}, a withdrawal, so that person's data could be used again.`; }) }, 'Delete a withdrawal'),
      el('button', { class: 'btn btn-sm', type: 'button', onclick: () => run('Rewrite history and re-hash everything', async (c) => {
        const i = firstConsent();
        // A careful attacker: a change that still looks valid (data may now leave Nigeria), fingerprint updated too.
        c[i].data.terms.cross_border_transfer = true;
        c[i].data.terms_digest = await digestOf(c[i].data.terms);
        // Recompute every hash after the edit, so the chain links again. Only outside copies can catch this.
        for (let k = 0; k < c.length; k++) { c[k].prev = k ? c[k - 1].hash : '0'.repeat(64); c[k].hash = await hashEntry(c[k]); }
        return `Changed entry #${i} so this person's data may leave Nigeria, updated its fingerprint, and recomputed every hash after it. The chain links perfectly. Only something held OUTSIDE the ledger can catch this: the receipt the person kept, or a published head hash.`;
      }) }, 'Rewrite + re-hash')),
    out);
}

function renderReceipt() {
  const out = el('div', { class: 'small' });
  const check = async (text) => {
    try {
      const r = await verifyReceipt(JSON.parse(text), commons.entries);
      out.replaceChildren(el('div', { class: `callout ${r.ok ? 'callout-good' : 'callout-bad'}` }, el('b', {}, r.ok ? '✓ Receipt is genuine and matches the ledger' : '✗ Receipt check failed'), r.status ? el('div', {}, `Consent status now: ${r.status}`) : null),
        el('ul', {}, r.checks.map((c) => el('li', {}, el('span', { class: c.ok ? 'check-ok' : 'check-bad' }, c.ok ? '✓ ' : '✗ '), el('b', {}, c.name + ': '), c.detail))));
    } catch (e) { out.replaceChildren(el('div', { class: 'callout callout-bad' }, 'Not a valid receipt JSON: ' + e.message)); }
  };
  const ta = el('textarea', { placeholder: 'Paste a receipt JSON here, or load your last one / a file.' });
  const last = sessionStorage.getItem(RKEY);
  const file = el('input', { type: 'file', accept: '.json', hidden: true });
  file.addEventListener('change', async () => { const f = file.files[0]; if (f) { ta.value = await f.text(); check(ta.value); } });
  $('#receipt-card').replaceChildren(el('span', { id: 'verify-receipt' }), el('h2', {}, 'Check a receipt'),
    el('p', { class: 'small muted' }, 'A receipt is the person\'s own proof of what they agreed to. It is signed by the commons and names the exact ledger entry, so it also catches a ledger that was rewritten from scratch.'),
    ta, el('div', { class: 'row', style: 'margin:.5rem 0' },
      el('button', { class: 'btn btn-primary btn-sm', type: 'button', onclick: () => check(ta.value) }, 'Check'),
      last ? el('button', { class: 'btn btn-sm', type: 'button', onclick: () => { ta.value = last; check(last); } }, 'Use my last receipt from the chat') : null,
      el('label', { class: 'btn btn-sm' }, 'Load file', file),
      el('button', { class: 'btn btn-sm', type: 'button', onclick: async () => { const r = await commons.reissueReceipt(commons.entries.findIndex((e) => e.type === 'CONSENT_GRANTED')); ta.value = JSON.stringify(r, null, 2); check(ta.value); } }, 'Try a sample receipt')),
    out);
}

$('#export').addEventListener('click', () => download('consent-commons-ledger.jsonl', commons.ledger.toJSONL()));
$('#import').addEventListener('change', async (ev) => {
  const f = ev.target.files[0]; if (!f) return;
  try { await renderVerify(Ledger.parseJSONL(await f.text()), `File: ${f.name}`); toast('Audited the uploaded file (the demo ledger was not changed)'); }
  catch (e) { toast(e.message, 'bad'); }
});
$('#reset').addEventListener('click', async () => { if (confirm('Start the demo over? Your chat consents and votes in this browser will be cleared.')) { commons = await resetDemo(); renderAll(); toast('Demo reset'); } });

async function renderAll() { await renderVerify(); renderEntries(); renderTamper(); renderReceipt(); }
commons = await loadCommons();
onExternalChange(async (c) => { commons = c; renderAll(); });
await renderAll();
if (location.hash === '#verify-receipt') $('#receipt-card').scrollIntoView();
