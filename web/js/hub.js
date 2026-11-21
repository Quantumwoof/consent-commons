// Role home screens (community.html, researcher.html, panel.html). Everything shown comes from this
// browser's demo commons: the synthetic ledger plus anything done here in the chat, USSD or review pages.
import { loadCommons, onExternalChange, RKEY } from './store.js';
import { el, $, fmtDate, statusLabel } from './ui.js';
import { tally } from '/src/core/policy.js';
import { consentStatus } from '/src/core/terms.js';
import { t as ts, tu } from '/src/i18n/index.js';
import { getLang, onLang } from './lang.js';
import { blockText } from './explain.js';

const T = (k, v) => tu(getLang(), k, v);
const V = (prefix, code) => ts(getLang(), prefix + code);
const hub = document.querySelector('main[data-hub]').dataset.hub;
export const MYREQ = 'cc.myRequest.v1';
const TAG = { in_review: 'warn', blocked: 'bad', approved: 'good', released: 'good', rejected: 'bad', active: 'good', withdrawn: 'bad', expired: 'neutral' };
const statusTag = (st, text = statusLabel(st)) => el('span', { class: `pill pill-${TAG[st] ?? 'neutral'}` }, text);
let commons, S;

// ---------- community member ----------
function myConsent() {
  let kept = null;
  try { kept = JSON.parse(sessionStorage.getItem(RKEY) || 'null'); } catch { /* ignore */ }
  const ref = kept?.terms?.subject_ref;
  const c = ref ? S.consents.get(ref) : kept?.terms_id ? [...S.consents.values()].find((x) => x.terms.terms_id === kept.terms_id) : null;
  const box = $('#my-consent');
  if (!c) {
    box.replaceChildren(el('div', { class: 'row' }, el('b', {}, T('hub_com_mine_h')), el('span', { class: 'spacer' }), statusTag('none', T('hub_com_none_tag'))),
      el('p', { class: 'small muted', style: 'margin:.3rem 0 0' }, T('hub_com_none')));
    return;
  }
  const st = consentStatus(c);
  box.replaceChildren(el('div', { class: 'row' }, el('b', {}, T('hub_com_mine_h')), el('span', { class: 'spacer' }), statusTag(st, T('cs_' + st))),
    el('p', { class: 'small', style: 'margin:.35rem 0 0' }, el('span', { class: 'muted' }, T('hub_com_allowed') + ' '), c.terms.purposes.allowed.map((p) => V('pur_', p)).join('; ') || '—'),
    el('p', { class: 'small muted', style: 'margin:.2rem 0 0' }, T('hub_com_ends', { date: fmtDate(c.terms.expires_at), id: c.terms.terms_id })));
}

// ---------- researcher ----------
function pickRequest() {
  const reqs = [...S.requests.values()];
  const want = new URLSearchParams(location.search).get('req') || localStorage.getItem(MYREQ);
  if (want && S.requests.has(want)) return { r: S.requests.get(want), mine: want === localStorage.getItem(MYREQ) };
  // Nothing sent from this browser yet: follow the newest demo request still waiting for the panel.
  const r = reqs.filter((x) => x.status === 'in_review').sort((a, b) => b.updated_seq - a.updated_seq)[0] ?? reqs.sort((a, b) => b.updated_seq - a.updated_seq)[0];
  return { r, mine: false };
}

function requestCard(r, mine) {
  const q = r.request, p = S.policy;
  const t = tally(r.votes, r.digest, p);
  const seatOf = Object.fromEntries(p.panel.map((m) => [m.id, m]));
  const appr = r.votes.filter((v) => v.vote === 'approve' && v.request_digest === r.digest);
  const com = appr.filter((v) => seatOf[v.reviewer_id]?.community).length;
  const oth = appr.length - com;
  const pct = (n) => `${(100 * n) / p.panel.length}%`;
  const checksOk = r.checks.passed;
  const voteOpen = r.status === 'in_review';
  const doneVote = ['approved', 'released', 'rejected'].includes(r.status);
  $('#my-req-id').textContent = `${q.request_id} · v${q.version}`;
  return el('div', { class: 'card' },
    el('div', { class: 'row' }, el('span', { class: 'tag role-researcher' }, el('span', { class: 'shape', 'aria-hidden': 'true' }), T('rv_from_researcher')), el('span', { class: 'spacer' }),
      statusTag(r.status, r.status === 'in_review' ? T('hub_res_waiting') : statusLabel(r.status))),
    el('h2', { style: 'margin:.55rem 0 .15rem;font-size:1.1rem' }, q.requester.organisation),
    el('p', { class: 'small muted', style: 'margin:0' }, `${V('pur_', q.purpose.code)} · ${T('rv_days', { n: q.duration_days })}`),
    mine ? null : el('p', { class: 'small', style: 'margin:.45rem 0 0' }, el('span', { class: 'pill pill-neutral' }, T('hub_res_demo')), ' ', T('hub_res_acting', { org: q.requester.organisation })),
    checksOk ? el('div', {},
      el('div', { class: 'row small', style: 'margin:.75rem 0 .3rem' }, el('b', {}, T('hub_res_votes', { n: t.voted, seats: p.panel.length })), el('span', { class: 'spacer' }), el('span', { class: 'muted' }, T('hub_res_need', { a: p.approvals_required, c: p.community_approvals_required }))),
      el('div', { class: 'prog', role: 'img', 'aria-label': T('hub_res_split', { c: com, o: oth }) },
        com ? el('i', { style: `width:${pct(com)};background:var(--com)` }) : null, oth ? el('i', { style: `width:${pct(oth)};background:var(--pan)` }) : null),
      el('p', { class: 'small muted', style: 'margin:.35rem 0 0' }, T('hub_res_split', { c: com, o: oth }) + (t.rejections ? ' ' + T('hub_res_rejections', { n: t.rejections }) : ''))) : null,
    el('ul', { class: 'steps' },
      el('li', {}, el('span', { class: 'dot', style: `background:${checksOk ? 'var(--good)' : 'var(--bad)'}`, 'aria-hidden': 'true' }, checksOk ? '✓' : '✗'),
        el('span', {}, checksOk ? T('hub_res_step_ok', { n: r.checks.eligible_count }) : el('span', {}, el('b', {}, T('hub_res_step_bad')), el('br'), r.checks.blocks.map((b) => blockText(b)).join(' ')))),
      el('li', {}, el('span', { class: 'dot', style: `background:${doneVote ? 'var(--good)' : voteOpen ? 'var(--warn)' : '#9aa7a0'}`, 'aria-hidden': 'true' }, doneVote ? '✓' : '2'),
        el('span', { class: voteOpen ? '' : doneVote ? '' : 'muted' }, voteOpen ? el('b', {}, T('hub_res_step_vote')) : doneVote ? T('hub_res_step_voted', { s: statusLabel(r.status === 'released' ? 'approved' : r.status) }) : T('hub_res_step_vote'))),
      el('li', {}, el('span', { class: 'dot', style: `background:${r.status === 'released' ? 'var(--good)' : '#9aa7a0'}`, 'aria-hidden': 'true' }, r.status === 'released' ? '✓' : '3'),
        el('span', { class: r.status === 'released' ? '' : 'muted' }, r.status === 'released' ? T('hub_res_step_released') : T('hub_res_step_release')))),
    ['in_review', 'blocked'].includes(r.status) ? el('p', { class: 'small', style: 'margin:.6rem 0 0' }, el('a', { href: `/review.html?as=researcher&amend=${encodeURIComponent(q.request_id)}#new` }, T('hub_res_amend'))) : null);
}

function researcher() {
  const { r, mine } = pickRequest();
  $('#my-request').replaceChildren(r ? requestCard(r, mine) : el('div', { class: 'card' }, T('rv_no_requests')));
  const others = [...S.requests.values()].filter((x) => x !== r).sort((a, b) => b.updated_seq - a.updated_seq);
  $('#other-requests').hidden = !others.length;
  $('#other-requests').replaceChildren(el('h2', { style: 'font-size:1rem;margin:0 0 .3rem' }, T('hub_res_others')),
    ...others.map((x) => el('a', { class: 'req-row', href: `/researcher.html?req=${encodeURIComponent(x.request.request_id)}`, style: 'color:inherit;text-decoration:none' },
      el('span', { class: 'org' }, x.request.requester.organisation), statusTag(x.status), el('span', { class: 'muted', 'aria-hidden': 'true' }, '›'))));
}

// ---------- review panel ----------
function panel() {
  const p = S.policy;
  const waiting = [...S.requests.values()].filter((x) => x.status === 'in_review').length;
  const w = $('#wait-count');
  w.hidden = false; w.textContent = T('hub_pan_waiting', { n: waiting });
  $('#rules-line').textContent = T('hub_pan_rules_p', { a: p.approvals_required, seats: p.panel.length, c: p.community_approvals_required });
}

async function render() {
  S = await commons.state();
  if (hub === 'community') myConsent();
  if (hub === 'researcher') researcher();
  if (hub === 'panel') panel();
}
commons = await loadCommons();
onExternalChange(async (c) => { commons = c; await render(); });
onLang(() => render());
await render();
