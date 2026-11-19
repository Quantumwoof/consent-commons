// Plain-words release summary for community meetings. Everything shown comes from the signed release
// manifest (who, what, why, rules, tally) or from the ledger (benefit status, withdrawal notices), and the
// badge at the top re-checks the manifest against the ledger with `verifyManifest`; it claims nothing more.
import { loadCommons, onExternalChange } from './store.js';
import { el, $, short, pill } from './ui.js';
import { verifyManifest } from '/src/core/commons.js';
import { digestOf } from '/src/core/hash.js';
import { t as ts, tu, tmsg, LOCALES } from '/src/i18n/index.js';
import { getLang, onLang, dateLocale } from './lang.js';

let lang = getLang();
let commons, tampered = false;
const releaseId = new URLSearchParams(location.search).get('release');
const u = (k, v) => tu(lang, k, v);
const s = (k, v) => ts(lang, k, v);
const fmt = (iso) => new Date(iso).toLocaleDateString(dateLocale(), { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'Africa/Lagos' });
const country = (cc) => (cc ? (LOCALES[lang].u[`country_${cc}`] ?? LOCALES.en.u[`country_${cc}`] ?? cc) : '—');
const list = (codes, prefix) => codes.map((c) => s(prefix + c)).join('; ');

function section(title, ...body) { return el('section', { class: 'card sum-sec' }, el('h2', {}, title), ...body); }

function setStatic() {
  document.documentElement.lang = lang;
  $('#s-title').textContent = u('sum_page_title');
  $('#print').textContent = u('sum_print');
  $('#back').textContent = `← ${u('sum_back')}`;
  document.title = `${u('sum_page_title')} · Consent Commons`;
}

function badge(v) {
  const tone = !v ? 'info' : !v.ok ? 'bad' : v.complete ? 'good' : 'warn';
  const head = !v ? u('ver_running') : !v.ok ? u('ver_fail') : v.complete ? u('ver_ok') : u('ver_partial');
  const icon = !v ? '…' : !v.ok ? '✗' : v.complete ? '✓' : '!';
  const label = { pass: [u('chk_pass'), 'good'], fail: [u('chk_fail'), 'bad'], skip: [u('chk_skip'), 'warn'] };
  return el('section', { class: `card sum-verify sum-verify-${tone}`, 'aria-label': u('ver_title') },
    el('div', { class: 'sum-verify-head', role: 'status' }, el('span', { class: 'sum-icon', 'aria-hidden': 'true' }, icon), el('strong', {}, head)),
    v ? el('ul', { class: 'sum-checks' }, v.checks.map((c) => el('li', {},
      el('span', {}, u(`chk_${c.id}`)), pill(label[c.status][0], label[c.status][1]),
      el('div', { class: 'small muted' }, c.msg ? tmsg(lang, c.msg) : c.detail)))) : null,
    el('p', { class: 'small muted', style: 'margin:.5rem 0 0' }, u('ver_scope')),
    el('div', { class: 'row no-print', style: 'margin-top:.6rem' },
      el('button', { class: `btn btn-sm ${tampered ? 'btn-primary' : ''}`, type: 'button', onclick: () => { tampered = !tampered; render(); } }, tampered ? u('ver_reset') : u('ver_tamper')),
      el('span', { class: 'small muted' }, u('ver_tamper_note'))));
}

async function render() {
  const S = await commons.state();
  const rels = [...S.releases.values()].sort((a, b) => b.seq - a.seq);
  const rel = releaseId ? S.releases.get(releaseId) : rels[0];
  setStatic();
  if (!rel) { $('#summary').replaceChildren(el('div', { class: 'callout callout-bad' }, u('sum_not_found'))); return; }
  // The tamper demo edits a COPY: it inflates the community approvals by one. The stored ledger is untouched.
  const m = structuredClone(rel.manifest);
  if (tampered) m.approval.tally.community_approvals += 1;
  const tl = m.approval.tally;
  const days = m.terms.consent_scope?.withdrawal?.recipient_deletion_days ?? S.policy.recipient_deletion_days;
  const now = Date.now();
  const slot = el('div', {}, badge(null));
  $('#summary').replaceChildren(...[
    tampered ? el('div', { class: 'callout callout-bad sum-tamper', role: 'alert' }, el('b', {}, u('tampered_label'))) : null,
    el('div', { class: 'callout callout-warn small', lang }, u('sum_intro')),
    slot,
    section(u('sum_who'),
      el('p', { class: 'sum-big' }, u('sum_who_line', { name: m.recipient.name, org: m.recipient.organisation, country: country(m.recipient.country) })),
      el('p', { class: 'muted' }, u('sum_released_on', { date: fmt(m.released_at) }))),
    section(u('sum_what'),
      el('ul', { class: 'sum-list' },
        el('li', {}, u('sum_purpose', { x: s('pur_' + m.terms.purpose) })),
        el('li', {}, u('sum_data', { x: list(m.terms.data_categories, 'cat_') })),
        el('li', {}, u('sum_form', { x: s('deid_' + m.terms.deidentification) })),
        el('li', {}, u('sum_people', { n: m.record_count }))),
      el('p', { class: 'small muted' }, u('sum_their_words', { x: m.terms.purpose_description }))),
    section(u('sum_vote'),
      el('p', { class: 'sum-big' }, u('sum_tally', { a: tl.approvals, seats: tl.seats, c: tl.community_approvals, cs: tl.community_seats, r: tl.rejections }))),
    section(u('sum_rules'),
      el('ul', { class: 'sum-list' },
        el('li', {}, u('rule_uses', { x: s('pur_' + m.terms.purpose) })),
        m.terms.onward_sharing === false ? el('li', {}, u('rule_no_share')) : null,
        m.terms.reidentification_attempts === 'forbidden' ? el('li', {}, u('rule_no_reid')) : null,
        el('li', {}, u('rule_ends', { date: fmt(m.terms.access_ends_at) })),
        el('li', {}, u(m.terms.cross_border_transfer ? 'rule_where_abroad' : 'rule_where_ng')),
        el('li', {}, u('rule_withdraw', { n: days })))),
    section(u('sum_benefits'),
      el('ul', { class: 'sum-list sum-ben' }, m.obligations.map((o) => {
        const done = rel.delivered[o.code];
        const st = done ? pill(u('st_delivered'), 'good') : Date.parse(o.due) < now ? pill(u('st_overdue'), 'bad') : pill(u('st_open'), 'warn');
        return el('li', {}, el('span', {}, s('ben_' + o.code)), st, el('div', { class: 'small muted' }, u('due', { date: fmt(o.due) })));
      }))),
    section(u('sum_notices'),
      rel.notices.length ? el('ul', { class: 'sum-list' }, rel.notices.map((n) => el('li', {}, u('notice_line', { id: n.record_id, date: fmt(n.delete_by) }))))
        : el('p', { class: 'muted' }, u('no_notices')),
      el('p', { class: 'small muted' }, u('from_ledger'))),
    el('p', { class: 'small muted mono sum-foot' }, `${m.release_id} · manifest ${short(await digestOf(m), 16)} · ${m.signature ? `${u('sum_key')} ${m.signature.key_id}` : u('sum_unsigned')}`)].filter(Boolean));
  const v = await verifyManifest(m, commons.entries);
  slot.replaceChildren(badge(v));
}

onLang((l) => { lang = l; render(); });
$('#print').addEventListener('click', () => window.print());
commons = await loadCommons();
onExternalChange(async (c) => { commons = c; render(); });
await render();
