// Ledger explorer: verify integrity + rules, a tamper lab, receipt checking, export/import.
import { loadCommons, resetDemo, onExternalChange, RKEY } from './store.js';
import { el, $, short, fmtTime, download, pill, toast } from './ui.js';
import { audit, verifyReceipt } from '/src/core/commons.js';
import { Ledger, verifyChain, hashEntry } from '/src/core/ledger.js';
import { digestOf } from '/src/core/hash.js';
import { t as ts, tu, tmsg } from '/src/i18n/index.js';
import { getLang, onLang } from './lang.js';
import { ruleText, errText } from './explain.js';

// Page text comes from the locale files. Entry type codes (CONSENT_GRANTED, ...), IDs, hashes and the raw
// JSON stay as recorded: they are what an auditor compares against the file.
const T = (k, v) => tu(getLang(), k, v);
const chainWhy = (c) => T('chain_' + (c.code ?? 'hash'));
const violation = (v) => ruleText(v.rule, v.message);

let commons, filter = '';
const TONE = { GENESIS: 'neutral', CONSENT_GRANTED: 'good', CONSENT_WITHDRAWN: 'bad', ACCESS_REQUESTED: 'info', REVIEW_VOTE: 'neutral', ACCESS_DECIDED: 'warn', DATA_RELEASED: 'good', WITHDRAWAL_NOTICE_ISSUED: 'bad', BENEFIT_DELIVERED: 'good' };

// Who wrote each entry, in the same colour, shape and words as the rest of the app.
const actorRole = (a = '') => (a.startsWith('person:') ? 'community' : a.startsWith('requester:') ? 'researcher' : a.startsWith('reviewer:') || a === 'panel' ? 'panel' : 'audit');
const actorTag = (a) => { const r = actorRole(a); return el('span', { class: `tag role-${r}` }, el('span', { class: 'shape', 'aria-hidden': 'true' }), T(r === 'audit' ? 'role_steward' : 'role_' + r)); };

function summary(e) {
  const d = e.data;
  switch (e.type) {
    case 'GENESIS': return T('ent_genesis', { name: d.commons.name, k: d.policy.k_minimum, q: d.policy.approvals_required, p: d.policy.panel.length, key: d.signing_key ? T('ent_genesis_key', { key: d.signing_key.key_id }) : '' });
    case 'CONSENT_GRANTED': return T('ent_consent', { ref: d.terms.subject_ref, lang: T('lang_' + d.terms.language), assisted: d.terms.collected_via === 'assisted_offline_demo' ? T('ent_assisted') : '', np: d.terms.purposes.allowed.length, nd: d.terms.data_categories.length, date: d.terms.expires_at.slice(0, 10) });
    case 'CONSENT_WITHDRAWN': return T('ent_withdrawn', { ref: d.subject_ref, terms: d.terms_id });
    case 'ACCESS_REQUESTED': return d.checks.passed ? T('ent_req_pass', { id: d.request.request_id, v: d.request.version, org: d.request.requester.organisation, n: d.checks.eligible_count })
      : T('ent_req_block', { id: d.request.request_id, v: d.request.version, org: d.request.requester.organisation, codes: d.checks.blocks.map((b) => b.code).join(', ') });
    case 'REVIEW_VOTE': return T(d.vote === 'approve' ? 'ent_vote_approve' : 'ent_vote_reject', { who: d.reviewer_id, id: d.request_id, d: short(d.request_digest, 8) });
    case 'ACCESS_DECIDED': return T('ent_decided', { id: d.request_id, outcome: T('st_' + d.outcome).toUpperCase(), a: d.tally.approvals, r: d.tally.rejections });
    case 'DATA_RELEASED': return T('ent_released', { id: d.manifest.release_id, n: d.manifest.record_count, org: d.manifest.recipient.organisation });
    case 'WITHDRAWAL_NOTICE_ISSUED': return T('ent_notice', { org: d.recipient, rec: d.record_id, date: d.delete_by.slice(0, 10) });
    case 'BENEFIT_DELIVERED': return T('ent_benefit', { id: d.release_id, benefit: ts(getLang(), 'ben_' + d.code) });
    default: return '';
  }
}

let shown = null; // { entries, label } of an uploaded file, so a language change redraws the same result
async function renderVerify(entries = commons.entries, label = null) {
  shown = label ? { entries, label } : null;
  const r = await audit(entries);
  $('#verify-card').replaceChildren(
    el('div', { class: 'row' }, el('h2', { style: 'margin:0' }, r.ok ? T('lg_ok_h') : T('lg_bad_h')), pill(label ?? T('lg_this'), 'neutral'), el('span', { class: 'spacer' }), el('button', { class: 'btn btn-primary', type: 'button', onclick: () => renderVerify() }, T('lg_verify_again'))),
    el('p', { class: 'small muted', style: 'margin:.3rem 0 .6rem' }, T('lg_two')),
    el('div', { class: 'grid', style: 'grid-template-columns: repeat(auto-fit,minmax(min(260px,100%),1fr))' },
      el('div', { class: `callout ${r.chain.ok ? 'callout-good' : 'callout-bad'}` }, el('b', {}, r.chain.ok ? T('lg_chain_ok') : T('lg_chain_bad', { seq: r.chain.brokenAt })), el('div', { class: 'small' }, r.chain.ok ? T('lg_entries_head', { n: r.entries }) + ' ' : chainWhy(r.chain), r.chain.ok ? el('span', { class: 'digest' }, short(r.head, 24)) : null)),
      el('div', { class: `callout ${r.violations.length ? 'callout-bad' : 'callout-good'}` }, el('b', {}, r.violations.length ? T('lg_viol', { n: r.violations.length }) : T('lg_rules_ok')),
        r.violations.length ? el('ul', { class: 'small' }, r.violations.slice(0, 5).map((v) => el('li', {}, `#${v.seq} ${v.type}: `, el('code', {}, v.rule), ' ', violation(v)))) : el('div', { class: 'small' }, T('lg_replayed')))),
    el('p', { class: 'small muted', style: 'margin:.6rem 0 0' }, T('lg_publish')));
}

function renderEntries() {
  const entries = commons.entries;
  const types = [...new Set(entries.map((e) => e.type))];
  const f = $('#filter');
  f.replaceChildren(el('option', { value: '' }, T('lg_all', { n: entries.length })), ...types.map((t) => el('option', { value: t, selected: t === filter }, `${t} (${entries.filter((e) => e.type === t).length})`)));
  f.onchange = () => { filter = f.value; renderEntries(); };
  const rows = entries.filter((e) => !filter || e.type === filter).reverse();
  $('#entries').replaceChildren(el('thead', {}, el('tr', {}, el('th', {}, '#'), el('th', {}, T('lg_th_time')), el('th', {}, T('lg_th_type')), el('th', {}, T('lg_th_what')), el('th', {}, 'Hash'), el('th', {}, 'Prev'))),
    el('tbody', {}, rows.map((e) => {
      const tr = el('tr', { class: 'clickable', tabindex: '0' }, el('td', {}, e.seq), el('td', { class: 'small' }, fmtTime(e.ts)), el('td', {}, pill(e.type, TONE[e.type])), el('td', {}, summary(e), el('div', { class: 'row small muted', style: 'margin-top:.2rem;gap:.4rem' }, actorTag(e.actor), e.actor)), el('td', { class: 'mono small' }, short(e.hash, 10)), el('td', { class: 'mono small' }, short(e.prev, 10)));
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
    // Display only: the same three defences as before, with a plain verdict on top.
    const caught = !chain.ok || r.violations.length > 0 || !rc.ok;
    out.replaceChildren(el('div', { class: 'callout callout-warn' }, el('b', {}, label), el('div', {}, note)),
      el('div', { class: `callout ${caught ? 'callout-good' : 'callout-bad'}`, style: 'margin-top:.5rem' }, el('b', {}, caught ? T('lg_t_verdict_caught') : T('lg_t_verdict_missed'))),
      el('div', { class: 'section-title' }, T('lg_t_result_h')),
      el('ul', {},
        el('li', {}, chain.ok ? el('span', { class: 'check-bad' }, T('lg_t_chain_miss')) : el('span', { class: 'check-ok' }, T('lg_t_chain_hit', { seq: chain.brokenAt, why: chainWhy(chain) }))),
        el('li', {}, r.violations.length ? el('span', { class: 'check-ok' }, T('lg_t_rules_hit', { n: r.violations.length, why: violation(r.violations[0]) })) : el('span', { class: 'check-bad' }, T('lg_t_rules_miss'))),
        el('li', {}, rc.ok ? el('span', { class: 'check-bad' }, T('lg_t_rc_miss')) : el('span', { class: 'check-ok' }, T('lg_t_rc_hit', { why: tmsg(getLang(), rc.checks.find((c) => !c.ok).msg) })))),
      el('p', { class: 'muted' }, T('lg_t_copy')));
  };
  $('#tamper-card').replaceChildren(el('h2', {}, T('lg_tamper_h')),
    el('p', { class: 'callout callout-info small' }, T('lg_tamper_p')),
    el('div', { class: 'tamper-btns' },
      el('button', { class: 'btn btn-sm', type: 'button', onclick: () => run(T('lg_t_edit_label'), (c) => { const i = firstConsent(); c[i].data.terms.purposes.allowed.push('ai_training_commercial'); return T('lg_t_edit_note', { i }); }) }, T('lg_t_edit_btn')),
      el('button', { class: 'btn btn-sm', type: 'button', onclick: () => run(T('lg_t_del_label'), (c) => { const i = c.findIndex((e) => e.type === 'CONSENT_WITHDRAWN'); c.splice(i, 1); return T('lg_t_del_note', { i }); }) }, T('lg_t_del_btn')),
      el('button', { class: 'btn btn-sm', type: 'button', onclick: () => run(T('lg_t_rw_label'), async (c) => {
        const i = firstConsent();
        // A careful attacker: a change that still looks valid (data may now leave Nigeria), fingerprint updated too.
        c[i].data.terms.cross_border_transfer = true;
        c[i].data.terms_digest = await digestOf(c[i].data.terms);
        // Recompute every hash after the edit, so the chain links again. Only outside copies can catch this.
        for (let k = 0; k < c.length; k++) { c[k].prev = k ? c[k - 1].hash : '0'.repeat(64); c[k].hash = await hashEntry(c[k]); }
        return T('lg_t_rw_note', { i });
      }) }, T('lg_t_rw_btn'))),
    out);
}

function renderReceipt() {
  const out = el('div', { class: 'small' });
  const check = async (text) => {
    try {
      const r = await verifyReceipt(JSON.parse(text), commons.entries);
      out.replaceChildren(el('div', { class: `callout ${r.ok ? 'callout-good' : 'callout-bad'}` }, el('b', {}, r.ok ? T('lg_rc_ok') : T('lg_rc_bad')), r.status ? el('div', {}, T('lg_rc_status', { s: T('cs_' + r.status) })) : null),
        el('ul', {}, r.checks.map((c) => el('li', {}, el('span', { class: c.ok ? 'check-ok' : 'check-bad' }, c.ok ? '✓ ' : '✗ '), el('b', {}, T('rc_' + c.id) + ': '), c.msg ? tmsg(getLang(), c.msg) : c.detail))));
    } catch (e) { out.replaceChildren(el('div', { class: 'callout callout-bad' }, T('lg_rc_invalid', { e: e.message }))); }
  };
  const ta = el('textarea', { placeholder: T('lg_rc_ph') });
  const last = sessionStorage.getItem(RKEY);
  const file = el('input', { type: 'file', accept: '.json', hidden: true });
  file.addEventListener('change', async () => { const f = file.files[0]; if (f) { ta.value = await f.text(); check(ta.value); } });
  $('#receipt-card').replaceChildren(el('span', { id: 'verify-receipt' }), el('h2', {}, T('lg_rc_h')),
    el('p', { class: 'small muted' }, T('lg_rc_p')),
    ta, el('div', { class: 'row', style: 'margin:.5rem 0' },
      el('button', { class: 'btn btn-primary btn-sm', type: 'button', onclick: () => check(ta.value) }, T('lg_rc_check')),
      last ? el('button', { class: 'btn btn-sm', type: 'button', onclick: () => { ta.value = last; check(last); } }, T('lg_rc_last')) : null,
      el('label', { class: 'btn btn-sm' }, T('lg_rc_file'), file),
      el('button', { class: 'btn btn-sm', type: 'button', onclick: async () => { const r = await commons.reissueReceipt(commons.entries.findIndex((e) => e.type === 'CONSENT_GRANTED')); ta.value = JSON.stringify(r, null, 2); check(ta.value); } }, T('lg_rc_sample'))),
    out);
}

$('#export').addEventListener('click', () => download('consent-commons-ledger.jsonl', commons.ledger.toJSONL()));
$('#import').addEventListener('change', async (ev) => {
  const f = ev.target.files[0]; if (!f) return;
  try { await renderVerify(Ledger.parseJSONL(await f.text()), T('lg_file', { name: f.name })); toast(T('lg_audited')); }
  catch (e) { toast(errText(e), 'bad'); }
});
$('#reset').addEventListener('click', async () => { if (confirm(T('lg_reset_confirm'))) { commons = await resetDemo(); renderAll(); toast(T('lg_reset_done')); } });

async function renderAll() { await renderVerify(); renderEntries(); renderTamper(); renderReceipt(); }
commons = await loadCommons();
onExternalChange(async (c) => { commons = c; renderAll(); });
// On a language change, keep an uploaded file's result on screen only if one is showing; otherwise redraw everything.
onLang(() => { renderVerify(shown?.entries, shown?.label); renderEntries(); renderTamper(); renderReceipt(); });
await renderAll();
if (location.hash === '#verify-receipt') $('#receipt-card').scrollIntoView();
