// Access-review dashboard: requests, automatic checks, the community panel, releases and benefit tracking.
import { loadCommons, save, onExternalChange } from './store.js';
import { el, $, short, fmtDate, fmtTime, download, pill, STATUS_TONE, statusLabel, toast } from './ui.js';
import { runChecks, tally } from '/src/core/policy.js';
import { consentStatus } from '/src/core/terms.js';
import { PURPOSES, DATA_CATEGORIES, PERMITTED_USERS, BENEFITS, DEIDENTIFICATION, LANGUAGES } from '/src/core/vocab.js';
import { syntheticDataset } from '/src/core/synthetic-records.js';
import { t as ts, tu } from '/src/i18n/index.js';
import { getLang, onLang } from './lang.js';
import { blockText, warnText, conflictText, errText } from './explain.js';
import { ROLES, roleBar, tabBar } from './roles.js';
import { applyStatic } from './lang.js';

// Two people use this page. The review panel (default) votes and releases; a researcher (?as=researcher)
// writes or changes a request and reads the rules, and cannot vote. The role strip, tab bar and back button
// follow, so it is always clear whose view this is. The rules and the core logic are the same for both.
const params = new URLSearchParams(location.search);
const AS = params.get('as') === 'researcher' ? 'researcher' : 'panel';
const TABS = AS === 'researcher' ? ['new', 'rules'] : ['requests', 'releases', 'pool', 'rules'];
const MYREQ = 'cc.myRequest.v1';
if (AS === 'researcher') {
  document.getElementById('rolebar')?.replaceWith(Object.assign(document.createElement('div'), { innerHTML: roleBar('researcher') }).firstChild);
  document.getElementById('tabbar')?.replaceWith(Object.assign(document.createElement('div'), { innerHTML: tabBar('researcher', 'new') }).firstChild);
  document.body.classList.replace('as-panel', 'as-researcher');
  const back = document.getElementById('app-back'); if (back) back.href = ROLES.researcher.hub;
  $('#acting-note').dataset.i18n = 'rv_res_note';
  $('[data-i18n="rv_title"]').dataset.i18n = 'rv_res_title';
  applyStatic();
}
document.querySelectorAll('[role=tab]').forEach((b) => { b.hidden = !TABS.includes(b.dataset.tab); });

// All page text comes from the locale files (T = page text, V = vocabulary wording people consented to).
// Free text typed by requesters and reviewers, organisation names and machine codes are shown as written.
const T = (k, v) => tu(getLang(), k, v);
const V = (prefix, code) => ts(getLang(), prefix + code);
const seatLabel = (m) => T('seat_' + m.seat);

let commons, S, selected = params.get('req'), tab = TABS.includes(location.hash.slice(1)) ? location.hash.slice(1) : TABS[0];
const ORDER = { in_review: 0, approved: 1, blocked: 2, released: 3, rejected: 4 };

async function refresh() { S = await commons.state(); render(); }
function persist() { save(commons); }

document.querySelectorAll('[role=tab]').forEach((b) => b.addEventListener('click', () => { tab = b.dataset.tab; history.replaceState(null, '', '#' + tab); render(); }));
// The phone tab bar links to #requests, #releases, ... on this same page.
window.addEventListener('hashchange', () => { const h = location.hash.slice(1); if (TABS.includes(h) && h !== tab) { tab = h; render(); window.scrollTo(0, 0); } });

function render() {
  document.querySelectorAll('[role=tab]').forEach((b) => b.setAttribute('aria-selected', String(b.dataset.tab === tab)));
  for (const id of ['requests', 'new', 'releases', 'pool', 'rules']) $(`#tab-${id}`).hidden = id !== tab;
  document.querySelectorAll('#tabbar a').forEach((a) => { if (a.dataset.tabKey === tab) a.setAttribute('aria-current', 'page'); else a.removeAttribute('aria-current'); });
  if (tab === 'requests') renderRequests();
  if (tab === 'new') renderNew();
  if (tab === 'releases') renderReleases();
  if (tab === 'pool') renderPool();
  if (tab === 'rules') renderRules();
}

// ---------------- requests ----------------
function renderRequests() {
  const reqs = [...S.requests.values()].sort((a, b) => ORDER[a.status] - ORDER[b.status] || b.updated_seq - a.updated_seq);
  if (!selected || !S.requests.has(selected)) selected = reqs[0]?.request.request_id;
  $('#req-list').replaceChildren(...reqs.map((r) => el('button', { class: 'req-item', type: 'button', 'aria-current': String(r.request.request_id === selected), onclick: () => { selected = r.request.request_id; renderRequests(); if (matchMedia('(max-width: 899px)').matches) $('#req-detail').scrollIntoView({ block: 'start' }); } },
    el('div', { class: 'row' }, el('span', { class: 'org' }, r.request.requester.organisation), el('span', { class: 'spacer' }), pill(statusLabel(r.status), STATUS_TONE[r.status])),
    el('div', {}, el('span', { class: 'tag role-researcher' }, el('span', { class: 'shape', 'aria-hidden': 'true' }), T('rv_from_researcher'))),
    el('div', { class: 'purpose' }, V('pur_', r.request.purpose.code)),
    el('div', { class: 'small muted' }, `v${r.request.version} · ${r.checks.passed ? T('rv_people_covered', { n: r.checks.eligible_count }) : r.checks.blocks[0]?.code} · ${fmtDate(r.submitted_at)}`))));
  const r = S.requests.get(selected);
  $('#req-detail').replaceChildren(r ? detail(r) : el('div', { class: 'card' }, T('rv_no_requests')));
}

function kvList(pairs) { return el('dl', { class: 'kv' }, pairs.flatMap(([k, v]) => [el('dt', {}, k), el('dd', {}, v)])); }
const labelList = (codes, prefix) => codes.map((c) => V(prefix, c)).join('; ');

function checksView(checks, title = T('rv_checks_title')) {
  const total = checks.active_consents ?? null;
  const reasons = Object.entries(checks.excluded ?? {}).sort((a, b) => b[1] - a[1]);
  return el('div', {},
    el('div', { class: 'section-title' }, title),
    checks.passed
      ? el('div', { class: 'callout callout-good' }, T('rv_passed', { n: checks.eligible_count, total: total ?? checks.eligible_count }))
      : el('div', { class: 'callout callout-bad' }, el('b', {}, T('rv_blocked_b') + ' '), T('rv_blocked_t'),
        el('ul', {}, checks.blocks.map((b) => el('li', {}, el('code', {}, b.code), ' ', blockText(b))))),
    checks.warnings?.length ? el('div', { class: 'callout callout-warn', style: 'margin-top:.5rem' }, el('ul', { style: 'margin:0;padding-left:1.1rem' }, checks.warnings.map((w) => el('li', {}, el('code', {}, w.code), ' ', warnText(w))))) : null,
    reasons.length ? el('details', { style: 'margin-top:.5rem' }, el('summary', { class: 'small' }, T('rv_why_excluded')),
      el('div', {}, reasons.map(([k, n]) => el('div', { class: 'barrow' }, el('span', {}, conflictText(k)), el('div', { class: 'bar' }, el('i', { style: `width:${Math.min(100, (100 * n) / Math.max(1, total ?? n))}%;background:#9aa7a0` })), el('span', { class: 'small' }, n))))) : null);
}

function detail(r) {
  const q = r.request;
  const t = tally(r.votes, r.digest, S.policy);
  const live = runChecks(q, S.consents, S.policy, new Date(), S.releases);
  const changed = r.status !== 'released' && r.status !== 'rejected' && (live.passed !== r.checks.passed || live.eligible_count !== r.checks.eligible_count);
  const card = el('div', { class: 'card' },
    el('div', { class: 'row', style: 'margin-bottom:.4rem' }, el('span', { class: 'tag role-researcher' }, el('span', { class: 'shape', 'aria-hidden': 'true' }), T('rv_from_researcher'))),
    el('div', { class: 'row' }, el('h2', { style: 'margin:0' }, q.requester.organisation), pill(statusLabel(r.status), STATUS_TONE[r.status]), el('span', { class: 'spacer' }),
      el('span', { class: 'small muted' }, T('rv_digest') + ' '), el('span', { class: 'digest', title: r.digest }, short(r.digest, 16))),
    el('p', { class: 'muted small', style: 'margin:.2rem 0 .8rem' }, T('rv_meta', { name: q.requester.name, type: V('usr_', q.requester.type), country: q.requester.country ?? '', v: q.version, time: fmtTime(q.submitted_at) })),
    el('div', { class: 'section-title' }, T('rv_what')),
    el('p', { style: 'margin:.2rem 0 .6rem' }, el('b', {}, V('pur_', q.purpose.code) + '. '), q.purpose.description),
    kvList([
      [T('rv_k_data'), labelList(q.data_categories, 'cat_')],
      [T('rv_k_form'), V('deid_', q.deidentification)],
      [T('rv_k_duration'), T('rv_days', { n: q.duration_days })],
      [T('rv_k_border'), q.cross_border_transfer ? T('rv_yes') : T('rv_no')],
      [T('rv_k_benefit'), labelList(q.benefit_commitments, 'ben_')],
      [T('rv_k_how'), q.benefit_description],
      ...(q.cohort ? [[T('rv_k_cohort'), T('rv_cohort_val', { n: q.cohort.record_ids.length, rel: q.cohort.release_id })]] : []),
    ]),
    checksView({ ...r.checks }),
    changed ? el('div', { class: 'callout callout-info', style: 'margin-top:.5rem' }, T('rv_rerun', { result: live.passed ? T('rv_rerun_pass') : T('rv_rerun_block'), n: live.eligible_count })) : null,
    panelView(r, t),
    r.history.length ? el('div', {}, el('div', { class: 'section-title' }, T('rv_earlier')),
      el('ul', { class: 'small' }, r.history.map((h) => el('li', {}, `v${h.version} `, el('span', { class: 'digest' }, short(h.digest, 12)), ` · ${T('rv_hist_line', { n: h.votes })}`)))) : null,
    actions(r, live));
  return card;
}

function panelView(r, t) {
  const seats = S.policy.panel.map((m) => {
    const v = r.votes.find((x) => x.reviewer_id === m.id);
    return el('div', { class: `seat ${m.community ? 'role-community' : 'role-panel'} ${v ? 'voted-' + v.vote : ''}` },
      el('span', { class: `tag ${m.community ? 'role-community' : 'role-panel'}` }, el('span', { class: 'shape', 'aria-hidden': 'true' }), T(m.community ? 'rv_seat_community' : 'rv_seat_other')),
      el('span', { class: 'who' }, seatLabel(m)),
      v ? el('div', {}, el('b', {}, v.vote === 'approve' ? T('rv_approve_v') : T('rv_reject_v')), el('div', { class: 'reason' }, `“${v.reason}”`), el('div', { class: 'small muted' }, T('rv_bound', { d: short(v.request_digest, 10) })))
        : el('div', { class: 'muted' }, r.status === 'in_review' ? T('rv_not_voted') : '—'));
  });
  return el('div', {},
    el('div', { class: 'section-title' }, T('rv_panel')),
    el('p', { class: 'small muted', style: 'margin:0 0 .5rem' }, T('rv_rule_line', { a: S.policy.approvals_required, seats: S.policy.panel.length, c: S.policy.community_approvals_required, cs: t.community_seats, na: t.approvals, nc: t.community_approvals, nr: t.rejections })),
    el('div', { class: 'seats' }, seats));
}

function actions(r, live) {
  const box = el('div', {});
  if (AS === 'researcher') {
    box.append(el('p', { class: 'small muted', style: 'margin-top:1rem' }, T('rv_res_note')));
    if (['in_review', 'blocked'].includes(r.status)) box.append(el('button', { class: 'btn', type: 'button', onclick: () => { draft = structuredClone(r.request); amending = r.request.request_id; tab = 'new'; render(); } }, T('rv_amend_btn')));
    return box;
  }
  if (r.status === 'in_review') {
    const voted = new Set(r.votes.map((v) => v.reviewer_id));
    const seat = el('select', { id: 'vote-seat' }, S.policy.panel.filter((m) => !voted.has(m.id)).map((m) => el('option', { value: m.id }, seatLabel(m))));
    const reason = el('textarea', { id: 'vote-reason', placeholder: T('rv_reason_ph', { n: S.policy.min_reason_chars }) });
    const cast = async (vote) => {
      try {
        // The digest of the version on screen goes with the vote. If the request changed since, it is refused.
        const res = await commons.vote(r.request.request_id, seat.value, vote, reason.value, { digest: r.digest });
        persist(); toast(res.decision ? T('rv_t_quorum', { o: statusLabel(res.decision.data.outcome) }) : T('rv_t_vote')); await refresh();
      } catch (e) { toast(errText(e), 'bad'); }
    };
    box.append(el('div', { class: 'section-title' }, T('rv_cast')),
      el('div', { class: 'grid', style: 'grid-template-columns: 1fr; gap:.5rem' },
        el('label', { class: 'field' }, T('rv_acting_as'), seat), el('label', { class: 'field' }, T('rv_reason'), reason),
        el('div', { class: 'row' }, el('button', { class: 'btn btn-good', type: 'button', onclick: () => cast('approve') }, T('rv_approve_btn')),
          el('button', { class: 'btn btn-danger', type: 'button', onclick: () => cast('reject') }, T('rv_reject_btn')),
          el('span', { class: 'small muted' }, T('rv_vote_bound') + ' ', el('span', { class: 'digest' }, short(r.digest, 12))))));
  }
  if (r.status === 'approved') {
    box.append(el('div', { class: 'section-title' }, T('rv_release')),
      el('p', { class: 'small' }, T('rv_release_p')),
      el('button', { class: 'btn btn-primary', type: 'button', disabled: !live.passed, onclick: async () => {
        try { const { manifest, dataset } = await commons.release(r.request.request_id); persist(); toast(T('rv_t_released', { n: manifest.record_count })); lastRelease = { manifest, dataset }; tab = 'releases'; await refresh(); } catch (e) { toast(errText(e), 'bad'); }
      } }, live.passed ? T('rv_release_btn', { org: r.request.requester.organisation }) : T('rv_release_blocked')));
  }
  if (['in_review', 'blocked'].includes(r.status)) {
    box.append(el('div', { class: 'section-title' }, T('rv_requester')), el('p', { class: 'small muted', style: 'margin:0' }, T('rv_pan_amend_note')));
  }
  if (r.status === 'released') box.append(el('p', {}, el('a', { href: '#', onclick: (e) => { e.preventDefault(); tab = 'releases'; render(); } }, T('rv_see_release', { id: r.release_id }))));
  return box;
}

// ---------------- new / amend request ----------------
let draft = null, amending = null, lastRelease = null;
const blank = () => ({ requester: { name: '', organisation: '', type: 'nigerian_public_researchers', country: 'NG' }, purpose: { code: 'public_health_research', description: '' }, data_categories: ['screening_scores'], deidentification: 'aggregated_only', duration_days: 180, cross_border_transfer: false, benefit_commitments: ['results_back', 'open_access'], benefit_description: '' });

function renderNew() {
  draft ??= blank();
  const d = draft;
  const preview = el('div', {});
  const upd = () => {
    const req = { ...d, duration_days: Number(d.duration_days) };
    preview.replaceChildren(checksView({ ...runChecks(req, S.consents, S.policy, new Date(), S.releases) }, T('rv_preview')));
  };
  const text = (get, set, attrs = {}) => { const i = el(attrs.multiline ? 'textarea' : 'input', { type: 'text', ...attrs, multiline: null }); i.value = get(); i.addEventListener('input', () => { set(i.value); upd(); }); return i; };
  const select = (vocab, prefix, get, set) => { const s = el('select', {}, Object.keys(vocab).map((k) => el('option', { value: k, selected: get() === k }, V(prefix, k)))); s.addEventListener('change', () => { set(s.value); upd(); }); return s; };
  const checks = (vocab, prefix, arr) => el('div', { class: 'checks' }, Object.keys(vocab).map((k) => { const c = el('input', { type: 'checkbox', checked: arr.includes(k) }); c.addEventListener('change', () => { if (c.checked) arr.push(k); else arr.splice(arr.indexOf(k), 1); upd(); }); return el('label', {}, c, V(prefix, k)); }));
  const cb = el('input', { type: 'checkbox', checked: d.cross_border_transfer }); cb.addEventListener('change', () => { d.cross_border_transfer = cb.checked; upd(); });
  const form = el('div', { class: 'card grid' },
    el('div', { class: 'row' }, el('h2', { style: 'margin:0' }, amending ? T('rv_amend_h', { id: amending }) : T('rv_new_h')), el('span', { class: 'spacer' }),
      el('button', { class: 'btn btn-sm', type: 'button', onclick: () => { draft = blank(); amending = null; renderNew(); } }, T('rv_clear'))),
    amending ? el('div', { class: 'callout callout-info' }, T('rv_amend_note')) : null,
    el('div', { class: 'grid', style: 'grid-template-columns: repeat(auto-fit,minmax(min(220px,100%),1fr))' },
      el('label', { class: 'field' }, T('rv_f_name'), text(() => d.requester.name, (v) => { d.requester.name = v; })),
      el('label', { class: 'field' }, T('rv_f_org'), text(() => d.requester.organisation, (v) => { d.requester.organisation = v; })),
      el('label', { class: 'field' }, T('rv_f_type'), select(PERMITTED_USERS, 'usr_', () => d.requester.type, (v) => { d.requester.type = v; })),
      el('label', { class: 'field' }, T('rv_f_country'), text(() => d.requester.country ?? '', (v) => { d.requester.country = v.toUpperCase().slice(0, 2); }))),
    el('label', { class: 'field' }, T('rv_f_purpose'), select(PURPOSES, 'pur_', () => d.purpose.code, (v) => { d.purpose.code = v; })),
    el('label', { class: 'field' }, el('span', {}, T('rv_f_desc') + ' ', el('span', { class: 'hint' }, T('rv_f_desc_hint'))), text(() => d.purpose.description, (v) => { d.purpose.description = v; }, { multiline: true })),
    el('fieldset', {}, el('legend', {}, T('rv_f_data')), checks(DATA_CATEGORIES, 'cat_', d.data_categories)),
    el('div', { class: 'grid', style: 'grid-template-columns: repeat(auto-fit,minmax(min(220px,100%),1fr))' },
      el('label', { class: 'field' }, T('rv_f_form'), select(DEIDENTIFICATION, 'deid_', () => d.deidentification, (v) => { d.deidentification = v; })),
      el('label', { class: 'field' }, el('span', {}, T('rv_f_days') + ' ', el('span', { class: 'hint' }, T('rv_f_days_hint', { n: S.policy.max_duration_days }))), text(() => String(d.duration_days), (v) => { d.duration_days = Number(v) || 0; }, { type: 'number', min: 1 })),
      el('label', { class: 'field', style: 'align-self:end' }, el('span', { class: 'row' }, cb, T('rv_f_border')))),
    el('fieldset', {}, el('legend', {}, T('rv_f_benefits')), checks(BENEFITS, 'ben_', d.benefit_commitments)),
    el('label', { class: 'field' }, el('span', {}, T('rv_f_how') + ' ', el('span', { class: 'hint' }, T('rv_f_how_hint'))), text(() => d.benefit_description, (v) => { d.benefit_description = v; }, { multiline: true })),
    preview,
    el('div', { class: 'row' }, el('button', { class: 'btn btn-primary', type: 'button', onclick: async () => {
      try {
        const req = { ...structuredClone(d), duration_days: Number(d.duration_days) };
        if (!req.requester.country) delete req.requester.country;
        for (const k of ['request_id', 'version', 'submitted_at']) delete req[k];
        const res = amending ? await commons.amendRequest(amending, req) : await commons.submitRequest(req);
        persist(); toast(res.checks.passed ? T('rv_t_submitted') : T('rv_t_blocked'), res.checks.passed ? 'good' : 'bad');
        if (AS === 'researcher') { localStorage.setItem(MYREQ, res.request.request_id); setTimeout(() => { location.href = `/researcher.html?req=${encodeURIComponent(res.request.request_id)}`; }, 900); return; }
        selected = res.request.request_id; draft = null; amending = null; tab = 'requests'; await refresh();
      } catch (e) { toast(errText(e), 'bad'); }
    } }, amending ? T('rv_submit_amend') : T('rv_submit')), el('span', { class: 'small muted' }, T('rv_submit_note'))));
  $('#tab-new').replaceChildren(form);
  upd();
}

// ---------------- releases & benefits ----------------
function renderReleases() {
  const rels = [...S.releases.values()].sort((a, b) => b.seq - a.seq);
  const body = rels.length ? rels.map((rel) => {
    const m = rel.manifest;
    const now = Date.now();
    return el('div', { class: 'card', style: 'margin-bottom:1rem' },
      el('div', { class: 'row' }, el('h2', { style: 'margin:0' }, m.recipient.organisation), pill(T('rv_records', { n: m.record_count }), 'info'), m.signature ? pill(T('rv_signed'), 'good') : pill(T('rv_unsigned'), 'warn'), el('span', { class: 'spacer' }), el('span', { class: 'mono small' }, m.release_id)),
      el('p', { class: 'small muted' }, T('rv_rel_meta', { time: fmtTime(m.released_at), date: fmtDate(m.terms.access_ends_at), form: V('deid_', m.terms.deidentification) })),
      el('div', { class: 'section-title' }, T('rv_binding')),
      // on_expiry / on_withdrawal_notice are fixed wording written by the commons at release, so they are translated here.
      kvList([[T('rv_k_purpose'), V('pur_', m.terms.purpose)], [T('rv_k_data'), labelList(m.terms.data_categories, 'cat_')], [T('rv_k_onward'), T('rv_forbidden')], [T('rv_k_reid'), T('rv_forbidden')], [T('rv_k_expiry'), T('rv_expiry_v')], [T('rv_k_onw'), T('rv_onw_v', { n: Number(String(m.terms.on_withdrawal_notice).match(/\d+/)?.[0] ?? S.policy.recipient_deletion_days) })]]),
      el('div', { class: 'section-title' }, T('rv_obligations')),
      el('table', { class: 't' }, el('thead', {}, el('tr', {}, el('th', {}, T('rv_th_obl')), el('th', {}, T('rv_th_due')), el('th', {}, T('rv_th_status')), el('th', {}, ''))),
        el('tbody', {}, m.obligations.map((o) => {
          const done = rel.delivered[o.code];
          const st = done ? pill(T('st_delivered'), 'good') : Date.parse(o.due) < now ? pill(T('st_overdue'), 'bad') : pill(T('st_open'), 'warn');
          return el('tr', {}, el('td', {}, V('ben_', o.code), done ? el('div', { class: 'small muted' }, `“${done.evidence}”`) : null), el('td', {}, fmtDate(o.due)), el('td', {}, st),
            el('td', {}, done ? '' : benefitForm(m.release_id, o.code)));
        }))),
      el('div', { class: 'section-title' }, T('rv_notices', { n: rel.notices.length })),
      rel.notices.length ? el('table', { class: 't' }, el('thead', {}, el('tr', {}, el('th', {}, T('rv_th_record')), el('th', {}, T('rv_th_issued')), el('th', {}, T('rv_th_deleteby')))),
        el('tbody', {}, rel.notices.map((n) => el('tr', {}, el('td', { class: 'mono' }, n.record_id), el('td', {}, fmtTime(n.ts)), el('td', {}, fmtDate(n.delete_by))))))
        : el('p', { class: 'small muted' }, T('rv_no_notices')),
      el('div', { class: 'row', style: 'margin-top:.8rem' },
        el('a', { class: 'btn btn-sm btn-primary', href: `/summary.html?release=${encodeURIComponent(m.release_id)}` }, T('rv_view_summary')),
        el('button', { class: 'btn btn-sm', type: 'button', onclick: () => download(`${m.release_id}-manifest.json`, m) }, T('rv_dl_manifest')),
        el('button', { class: 'btn btn-sm', type: 'button', onclick: async () => download(`${m.release_id}-SYNTHETIC-dataset.json`, await datasetFor(rel)) }, T('rv_dl_dataset'))));
  }) : [el('div', { class: 'card' }, T('rv_no_releases'))];
  $('#tab-releases').replaceChildren(...body);
}
function benefitForm(releaseId, code) {
  const box = el('div', {});
  const open = el('button', { class: 'btn btn-sm', type: 'button', onclick: () => {
    const ta = el('textarea', { placeholder: T('rv_evidence_ph'), 'aria-label': T('rv_evidence_aria') });
    box.replaceChildren(ta, el('div', { class: 'row', style: 'margin-top:.3rem' },
      el('button', { class: 'btn btn-sm btn-primary', type: 'button', onclick: async () => {
        try { await commons.recordBenefit(releaseId, code, ta.value); persist(); toast(T('rv_t_benefit')); await refresh(); } catch (e) { toast(errText(e), 'bad'); }
      } }, T('rv_record_btn')), el('button', { class: 'btn btn-sm', type: 'button', onclick: () => box.replaceChildren(open) }, T('rv_cancel'))));
    ta.focus();
  } }, T('rv_report'));
  box.append(open);
  return box;
}
async function datasetFor(rel) {
  if (lastRelease?.manifest.release_id === rel.manifest.release_id) return lastRelease.dataset;
  const req = S.requests.get(rel.manifest.request.request_id).request;
  return syntheticDataset(rel.manifest.release_id, [...rel.subjects.values()], req, S.consents);
}

// ---------------- consent pool (aggregates only) ----------------
function renderPool() {
  const all = [...S.consents.values()];
  const now = new Date();
  const active = all.filter((c) => consentStatus(c, now) === 'active');
  const pct = (n) => (active.length ? Math.round((100 * n) / active.length) : 0);
  const bars = (title, vocab, get, label) => el('div', { class: 'card' }, el('h3', {}, title),
    Object.keys(vocab).map((k) => { const n = active.filter((c) => get(c.terms).includes(k)).length; return el('div', { class: 'barrow' }, el('span', {}, label(k)), el('div', { class: 'bar' }, el('i', { style: `width:${pct(n)}%` })), el('span', { class: 'small' }, `${pct(n)}%`)); }));
  const st = (n, l) => el('div', { class: 'card stat' }, el('b', {}, n), el('span', {}, l));
  $('#tab-pool').replaceChildren(
    el('div', { class: 'callout callout-info', style: 'margin-bottom:1rem' }, T('rv_pool_note')),
    el('div', { class: 'stats', style: 'margin-bottom:1rem' }, st(all.length, T('rv_s_records')), st(active.length, T('cs_active')), st(all.filter((c) => c.status === 'withdrawn').length, T('cs_withdrawn')), st(all.filter((c) => consentStatus(c, now) === 'expired').length, T('cs_expired')),
      ...Object.keys(LANGUAGES).map((k) => st(all.filter((c) => c.terms.language === k).length, T('rv_s_lang', { lang: T('lang_' + k) })))),
    el('div', { class: 'grid', style: 'grid-template-columns: repeat(auto-fit,minmax(min(340px,100%),1fr))' },
      bars(T('rv_b_purposes'), PURPOSES, (t) => t.purposes.allowed, (k) => V('pur_', k)),
      bars(T('rv_b_users'), PERMITTED_USERS, (t) => t.permitted_users, (k) => V('usr_', k)),
      bars(T('rv_b_data'), DATA_CATEGORIES, (t) => t.data_categories, (k) => V('cat_', k)),
      bars(T('rv_b_benefits'), BENEFITS, (t) => t.benefit_sharing.required, (k) => V('ben_', k)),
      bars(T('rv_b_protect'), DEIDENTIFICATION, (t) => [t.deidentification], (k) => V('deid_', k)),
      bars(T('rv_b_other'), { cross: 1, first: 1 }, (t) => [t.cross_border_transfer ? 'cross' : null, t.comprehension.attempts === 1 ? 'first' : null], (k) => T('rv_b_' + k))));
}

function renderRules() {
  const p = S.policy;
  $('#tab-rules').replaceChildren(el('div', { class: 'card' },
    el('h2', {}, T('rv_rules_h')),
    el('p', { class: 'muted' }, T('rv_rules_p')),
    kvList([
      [T('rv_r_k'), T('rv_r_k_v', { k: p.k_minimum })],
      [T('rv_r_dur'), T('rv_days', { n: p.max_duration_days })],
      [T('rv_r_quorum'), T('rv_r_quorum_v', { a: p.approvals_required, seats: p.panel.length, c: p.community_approvals_required })],
      [T('rv_r_vote'), T('rv_r_vote_v', { n: p.min_reason_chars })],
      [T('rv_r_withdraw'), T('rv_r_withdraw_v', { n: p.recipient_deletion_days })],
      [T('rv_r_seats'), p.panel.map((m) => `${seatLabel(m)}${m.community ? ' ' + T('rv_community_tag') : ''}`).join(' · ')],
    ])));
}

commons = await loadCommons();
{ // ?amend=<id>: a researcher came from their home screen to change their request.
  const id = params.get('amend'); const st = await commons.state();
  if (AS === 'researcher' && id && st.requests.has(id)) { draft = structuredClone(st.requests.get(id).request); amending = id; tab = 'new'; }
}
onExternalChange(async (c) => { commons = c; await refresh(); });
onLang(() => render());
await refresh();
