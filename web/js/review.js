// Access-review dashboard: requests, automatic checks, the community panel, releases and benefit tracking.
import { loadCommons, save, onExternalChange } from './store.js';
import { el, $, short, fmtDate, fmtTime, download, pill, STATUS_TONE, STATUS_LABEL, toast } from './ui.js';
import { runChecks, tally, CONFLICT_LABELS } from '/src/core/policy.js';
import { consentStatus } from '/src/core/terms.js';
import { PURPOSES, DATA_CATEGORIES, PERMITTED_USERS, BENEFITS, DEIDENTIFICATION, LANGUAGES } from '/src/core/vocab.js';
import { syntheticDataset } from '/src/core/synthetic-records.js';

let commons, S, selected = null, tab = 'requests';
const ORDER = { in_review: 0, approved: 1, blocked: 2, released: 3, rejected: 4 };

async function refresh() { S = await commons.state(); render(); }
function persist() { save(commons); }

document.querySelectorAll('[role=tab]').forEach((b) => b.addEventListener('click', () => { tab = b.dataset.tab; render(); }));

function render() {
  document.querySelectorAll('[role=tab]').forEach((b) => b.setAttribute('aria-selected', String(b.dataset.tab === tab)));
  for (const id of ['requests', 'new', 'releases', 'pool', 'rules']) $(`#tab-${id}`).hidden = id !== tab;
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
  $('#req-list').replaceChildren(...reqs.map((r) => el('button', { class: 'req-item', type: 'button', 'aria-current': String(r.request.request_id === selected), onclick: () => { selected = r.request.request_id; renderRequests(); } },
    el('div', { class: 'row' }, el('span', { class: 'org' }, r.request.requester.organisation), el('span', { class: 'spacer' }), pill(STATUS_LABEL[r.status], STATUS_TONE[r.status])),
    el('div', { class: 'purpose' }, PURPOSES[r.request.purpose.code]),
    el('div', { class: 'small muted' }, `v${r.request.version} · ${r.checks.passed ? `${r.checks.eligible_count} people covered` : r.checks.blocks[0]?.code.toLowerCase().replace(/_/g, ' ')} · ${fmtDate(r.submitted_at)}`))));
  const r = S.requests.get(selected);
  $('#req-detail').replaceChildren(r ? detail(r) : el('div', { class: 'card' }, 'No requests yet.'));
}

function kvList(pairs) { return el('dl', { class: 'kv' }, pairs.flatMap(([k, v]) => [el('dt', {}, k), el('dd', {}, v)])); }
const labelList = (codes, vocab) => codes.map((c) => vocab[c]?.label ?? vocab[c] ?? c).join('; ');

function checksView(checks, title = 'Automatic checks (recorded at submission)') {
  const total = checks.active_consents ?? null;
  const reasons = Object.entries(checks.excluded ?? {}).sort((a, b) => b[1] - a[1]);
  return el('div', {},
    el('div', { class: 'section-title' }, title),
    checks.passed
      ? el('div', { class: 'callout callout-good' }, `✓ Passed. ${checks.eligible_count}${total != null ? ` of ${total} active` : ''} consents cover this request exactly as written.`)
      : el('div', { class: 'callout callout-bad' }, el('b', {}, '✗ Blocked before review. '), 'The panel never sees a request that breaks consent terms.',
        el('ul', {}, checks.blocks.map((b) => el('li', {}, el('code', {}, b.code), ' ', b.message)))),
    checks.warnings?.length ? el('div', { class: 'callout callout-warn', style: 'margin-top:.5rem' }, el('ul', { style: 'margin:0;padding-left:1.1rem' }, checks.warnings.map((w) => el('li', {}, w.message)))) : null,
    reasons.length ? el('details', { style: 'margin-top:.5rem' }, el('summary', { class: 'small' }, 'Why other people\'s data is excluded (a person can have several reasons)'),
      el('div', {}, reasons.map(([k, n]) => el('div', { class: 'barrow' }, el('span', {}, `People who ${CONFLICT_LABELS[k] ?? k}`), el('div', { class: 'bar' }, el('i', { style: `width:${Math.min(100, (100 * n) / Math.max(1, total ?? n))}%;background:#9aa7a0` })), el('span', { class: 'small' }, n))))) : null);
}

function detail(r) {
  const q = r.request;
  const t = tally(r.votes, r.digest, S.policy);
  const live = runChecks(q, S.consents, S.policy, new Date(), S.releases);
  const changed = r.status !== 'released' && r.status !== 'rejected' && (live.passed !== r.checks.passed || live.eligible_count !== r.checks.eligible_count);
  const card = el('div', { class: 'card' },
    el('div', { class: 'row' }, el('h2', { style: 'margin:0' }, q.requester.organisation), pill(STATUS_LABEL[r.status], STATUS_TONE[r.status]), el('span', { class: 'spacer' }),
      el('span', { class: 'small muted' }, 'Request digest '), el('span', { class: 'digest', title: r.digest }, short(r.digest, 16))),
    el('p', { class: 'muted small', style: 'margin:.2rem 0 .8rem' }, `${q.requester.name} · ${PERMITTED_USERS[q.requester.type]} · ${q.requester.country ?? ''} · version ${q.version} · submitted ${fmtTime(q.submitted_at)}`),
    el('div', { class: 'section-title' }, 'What they want'),
    el('p', { style: 'margin:.2rem 0 .6rem' }, el('b', {}, PURPOSES[q.purpose.code] + '. '), q.purpose.description),
    kvList([
      ['Data', labelList(q.data_categories, DATA_CATEGORIES)],
      ['Form', DEIDENTIFICATION[q.deidentification].label],
      ['For how long', `${q.duration_days} days`],
      ['Leaves Nigeria?', q.cross_border_transfer ? 'Yes' : 'No'],
      ['Benefit promised', labelList(q.benefit_commitments, BENEFITS)],
      ['How', q.benefit_description],
      ...(q.cohort ? [['Cohort', `${q.cohort.record_ids.length} named records from ${q.cohort.release_id}`]] : []),
    ]),
    checksView({ ...r.checks }),
    changed ? el('div', { class: 'callout callout-info', style: 'margin-top:.5rem' }, `Re-run now: ${live.passed ? 'passes' : 'would be blocked'}, ${live.eligible_count} people covered (consents have changed since submission, e.g. withdrawals or expiry). Release always re-checks at release time.`) : null,
    panelView(r, t),
    r.history.length ? el('div', {}, el('div', { class: 'section-title' }, 'Earlier versions'),
      el('ul', { class: 'small' }, r.history.map((h) => el('li', {}, `v${h.version} `, el('span', { class: 'digest' }, short(h.digest, 12)), ` · ${h.votes} vote(s) cast on it no longer count`)))) : null,
    actions(r, live));
  return card;
}

function panelView(r, t) {
  const seats = S.policy.panel.map((m) => {
    const v = r.votes.find((x) => x.reviewer_id === m.id);
    return el('div', { class: `seat ${v ? 'voted-' + v.vote : ''}` },
      el('div', { class: 'row' }, el('span', { class: 'who' }, m.label), m.community ? pill('community', 'info') : null),
      v ? el('div', {}, el('b', {}, v.vote === 'approve' ? '✓ Approve' : '✗ Reject'), el('div', { class: 'reason' }, `“${v.reason}”`), el('div', { class: 'small muted' }, `bound to ${short(v.request_digest, 10)}`))
        : el('div', { class: 'muted' }, r.status === 'in_review' ? 'Not voted yet' : '—'));
  });
  return el('div', {},
    el('div', { class: 'section-title' }, 'Community panel'),
    el('p', { class: 'small muted', style: 'margin:0 0 .5rem' }, `Rule: ${S.policy.approvals_required} of ${S.policy.panel.length} approvals, including at least ${S.policy.community_approvals_required} of the ${t.community_seats} community seats. Now: ${t.approvals} approval(s), ${t.community_approvals} from community seats, ${t.rejections} rejection(s).`),
    el('div', { class: 'seats' }, seats));
}

function actions(r, live) {
  const box = el('div', {});
  if (r.status === 'in_review') {
    const voted = new Set(r.votes.map((v) => v.reviewer_id));
    const seat = el('select', { id: 'vote-seat' }, S.policy.panel.filter((m) => !voted.has(m.id)).map((m) => el('option', { value: m.id }, m.label)));
    const reason = el('textarea', { id: 'vote-reason', placeholder: `Your reason (at least ${S.policy.min_reason_chars} characters). Approvals need reasons too.` });
    const cast = async (vote) => {
      try {
        // The digest of the version on screen goes with the vote. If the request changed since, it is refused.
        const res = await commons.vote(r.request.request_id, seat.value, vote, reason.value, { digest: r.digest });
        persist(); toast(res.decision ? `Quorum reached: ${res.decision.data.outcome}` : 'Vote recorded'); await refresh();
      } catch (e) { toast(e.message, 'bad'); }
    };
    box.append(el('div', { class: 'section-title' }, 'Cast a vote'),
      el('div', { class: 'grid', style: 'grid-template-columns: 1fr; gap:.5rem' },
        el('label', { class: 'field' }, 'Acting as (demo)', seat), el('label', { class: 'field' }, 'Reason', reason),
        el('div', { class: 'row' }, el('button', { class: 'btn btn-good', type: 'button', onclick: () => cast('approve') }, 'Approve this version'),
          el('button', { class: 'btn btn-danger', type: 'button', onclick: () => cast('reject') }, 'Reject'),
          el('span', { class: 'small muted' }, 'Vote is bound to digest ', el('span', { class: 'digest' }, short(r.digest, 12))))));
  }
  if (r.status === 'approved') {
    box.append(el('div', { class: 'section-title' }, 'Release'),
      el('p', { class: 'small' }, 'Releasing re-runs every check at this moment. Anyone who withdrew after the vote is left out automatically; if that drops the group below the minimum, the release is blocked.'),
      el('button', { class: 'btn btn-primary', type: 'button', disabled: !live.passed, onclick: async () => {
        try { const { manifest, dataset } = await commons.release(r.request.request_id); persist(); toast(`Released ${manifest.record_count} synthetic records`); lastRelease = { manifest, dataset }; tab = 'releases'; await refresh(); } catch (e) { toast(e.message, 'bad'); }
      } }, live.passed ? `Release to ${r.request.requester.organisation}` : 'Release blocked: checks fail now'));
  }
  if (['in_review', 'blocked'].includes(r.status)) {
    box.append(el('div', { class: 'section-title' }, 'Requester'),
      el('button', { class: 'btn', type: 'button', onclick: () => { draft = structuredClone(r.request); amending = r.request.request_id; tab = 'new'; render(); } }, 'Amend this request (resets all votes)'));
  }
  if (r.status === 'released') box.append(el('p', {}, el('a', { href: '#', onclick: (e) => { e.preventDefault(); tab = 'releases'; render(); } }, `See release ${r.release_id} →`)));
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
    preview.replaceChildren(checksView({ ...runChecks(req, S.consents, S.policy, new Date(), S.releases) }, 'Live preview of the automatic checks (nothing recorded yet)'));
  };
  const text = (get, set, attrs = {}) => { const i = el(attrs.multiline ? 'textarea' : 'input', { type: 'text', ...attrs, multiline: null }); i.value = get(); i.addEventListener('input', () => { set(i.value); upd(); }); return i; };
  const select = (vocab, get, set) => { const s = el('select', {}, Object.entries(vocab).map(([k, v]) => el('option', { value: k, selected: get() === k }, v.label ?? v))); s.addEventListener('change', () => { set(s.value); upd(); }); return s; };
  const checks = (vocab, arr) => el('div', { class: 'checks' }, Object.entries(vocab).map(([k, v]) => { const c = el('input', { type: 'checkbox', checked: arr.includes(k) }); c.addEventListener('change', () => { if (c.checked) arr.push(k); else arr.splice(arr.indexOf(k), 1); upd(); }); return el('label', {}, c, v); }));
  const cb = el('input', { type: 'checkbox', checked: d.cross_border_transfer }); cb.addEventListener('change', () => { d.cross_border_transfer = cb.checked; upd(); });
  const form = el('div', { class: 'card grid' },
    el('div', { class: 'row' }, el('h2', { style: 'margin:0' }, amending ? `Amend ${amending}` : 'Request access to the commons'), el('span', { class: 'spacer' }),
      el('button', { class: 'btn btn-sm', type: 'button', onclick: () => { draft = blank(); amending = null; renderNew(); } }, 'Clear')),
    amending ? el('div', { class: 'callout callout-info' }, 'Amending creates a new version with a new digest. Every vote cast on the old version stops counting, because reviewers approved different terms.') : null,
    el('div', { class: 'grid', style: 'grid-template-columns: repeat(auto-fit,minmax(220px,1fr))' },
      el('label', { class: 'field' }, 'Your name', text(() => d.requester.name, (v) => { d.requester.name = v; })),
      el('label', { class: 'field' }, 'Organisation', text(() => d.requester.organisation, (v) => { d.requester.organisation = v; })),
      el('label', { class: 'field' }, 'Organisation type', select(PERMITTED_USERS, () => d.requester.type, (v) => { d.requester.type = v; })),
      el('label', { class: 'field' }, 'Country (2 letters)', text(() => d.requester.country ?? '', (v) => { d.requester.country = v.toUpperCase().slice(0, 2); }))),
    el('label', { class: 'field' }, 'Purpose', select(PURPOSES, () => d.purpose.code, (v) => { d.purpose.code = v; })),
    el('label', { class: 'field' }, el('span', {}, 'Describe the purpose in plain words ', el('span', { class: 'hint' }, '(at least 40 characters; the community panel reads this)')), text(() => d.purpose.description, (v) => { d.purpose.description = v; }, { multiline: true })),
    el('fieldset', {}, el('legend', {}, 'Data needed (ask for as little as possible)'), checks(DATA_CATEGORIES, d.data_categories)),
    el('div', { class: 'grid', style: 'grid-template-columns: repeat(auto-fit,minmax(220px,1fr))' },
      el('label', { class: 'field' }, 'Form', select(DEIDENTIFICATION, () => d.deidentification, (v) => { d.deidentification = v; })),
      el('label', { class: 'field' }, el('span', {}, 'Access for (days) ', el('span', { class: 'hint' }, `max ${S.policy.max_duration_days}`)), text(() => String(d.duration_days), (v) => { d.duration_days = Number(v) || 0; }, { type: 'number', min: 1 })),
      el('label', { class: 'field', style: 'align-self:end' }, el('span', { class: 'row' }, cb, 'Data will leave Nigeria'))),
    el('fieldset', {}, el('legend', {}, 'What the community gets back'), checks(BENEFITS, d.benefit_commitments)),
    el('label', { class: 'field' }, el('span', {}, 'How exactly? ', el('span', { class: 'hint' }, '(at least 30 characters)')), text(() => d.benefit_description, (v) => { d.benefit_description = v; }, { multiline: true })),
    preview,
    el('div', { class: 'row' }, el('button', { class: 'btn btn-primary', type: 'button', onclick: async () => {
      try {
        const req = { ...structuredClone(d), duration_days: Number(d.duration_days) };
        if (!req.requester.country) delete req.requester.country;
        for (const k of ['request_id', 'version', 'submitted_at']) delete req[k];
        const res = amending ? await commons.amendRequest(amending, req) : await commons.submitRequest(req);
        persist(); toast(res.checks.passed ? 'Submitted: sent to the panel' : 'Recorded, but blocked by the automatic checks', res.checks.passed ? 'good' : 'bad');
        selected = res.request.request_id; draft = null; amending = null; tab = 'requests'; await refresh();
      } catch (e) { toast(e.message, 'bad'); }
    } }, amending ? 'Submit amended version' : 'Submit request'), el('span', { class: 'small muted' }, 'Submitting records the request and its check results in the ledger, even if blocked.')));
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
      el('div', { class: 'row' }, el('h2', { style: 'margin:0' }, m.recipient.organisation), pill(`${m.record_count} records`, 'info'), m.signature ? pill('signed manifest', 'good') : pill('unsigned', 'warn'), el('span', { class: 'spacer' }), el('span', { class: 'mono small' }, m.release_id)),
      el('p', { class: 'small muted' }, `Released ${fmtTime(m.released_at)} · access ends ${fmtDate(m.terms.access_ends_at)} · ${DEIDENTIFICATION[m.terms.deidentification].label}`),
      el('div', { class: 'section-title' }, 'Binding terms that travel with the data'),
      kvList([['Purpose', PURPOSES[m.terms.purpose]], ['Data', labelList(m.terms.data_categories, DATA_CATEGORIES)], ['Onward sharing', 'Forbidden'], ['Re-identification', 'Forbidden'], ['On expiry', m.terms.on_expiry], ['On withdrawal', m.terms.on_withdrawal_notice]]),
      el('div', { class: 'section-title' }, 'Benefit-sharing obligations'),
      el('table', { class: 't' }, el('thead', {}, el('tr', {}, el('th', {}, 'Obligation'), el('th', {}, 'Due'), el('th', {}, 'Status'), el('th', {}, ''))),
        el('tbody', {}, m.obligations.map((o) => {
          const done = rel.delivered[o.code];
          const st = done ? pill('Delivered', 'good') : Date.parse(o.due) < now ? pill('Overdue', 'bad') : pill('Open', 'warn');
          return el('tr', {}, el('td', {}, o.description, done ? el('div', { class: 'small muted' }, `“${done.evidence}”`) : null), el('td', {}, fmtDate(o.due)), el('td', {}, st),
            el('td', {}, done ? '' : benefitForm(m.release_id, o.code)));
        }))),
      el('div', { class: 'section-title' }, `Withdrawal notices (${rel.notices.length})`),
      rel.notices.length ? el('table', { class: 't' }, el('thead', {}, el('tr', {}, el('th', {}, 'Record'), el('th', {}, 'Issued'), el('th', {}, 'Delete by'))),
        el('tbody', {}, rel.notices.map((n) => el('tr', {}, el('td', { class: 'mono' }, n.record_id), el('td', {}, fmtTime(n.ts)), el('td', {}, fmtDate(n.delete_by))))))
        : el('p', { class: 'small muted' }, 'Nobody in this release has withdrawn yet. Withdraw in the chat to see a notice appear here.'),
      el('div', { class: 'row', style: 'margin-top:.8rem' },
        el('button', { class: 'btn btn-sm', type: 'button', onclick: () => download(`${m.release_id}-manifest.json`, m) }, 'Download manifest'),
        el('button', { class: 'btn btn-sm', type: 'button', onclick: async () => download(`${m.release_id}-SYNTHETIC-dataset.json`, await datasetFor(rel)) }, 'Download synthetic dataset')));
  }) : [el('div', { class: 'card' }, 'No releases yet.')];
  $('#tab-releases').replaceChildren(...body);
}
function benefitForm(releaseId, code) {
  const box = el('div', {});
  const open = el('button', { class: 'btn btn-sm', type: 'button', onclick: () => {
    const ta = el('textarea', { placeholder: 'What was delivered, when, and to whom? (at least 20 characters; this goes in the ledger)', 'aria-label': 'Evidence of delivery' });
    box.replaceChildren(ta, el('div', { class: 'row', style: 'margin-top:.3rem' },
      el('button', { class: 'btn btn-sm btn-primary', type: 'button', onclick: async () => {
        try { await commons.recordBenefit(releaseId, code, ta.value); persist(); toast('Benefit recorded'); await refresh(); } catch (e) { toast(e.message, 'bad'); }
      } }, 'Record'), el('button', { class: 'btn btn-sm', type: 'button', onclick: () => box.replaceChildren(open) }, 'Cancel')));
    ta.focus();
  } }, 'Report delivered');
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
  const bars = (title, vocab, get) => el('div', { class: 'card' }, el('h3', {}, title),
    Object.entries(vocab).map(([k, v]) => { const n = active.filter((c) => get(c.terms).includes(k)).length; return el('div', { class: 'barrow' }, el('span', {}, v.label ?? v), el('div', { class: 'bar' }, el('i', { style: `width:${pct(n)}%` })), el('span', { class: 'small' }, `${pct(n)}%`)); }));
  const st = (n, l) => el('div', { class: 'card stat' }, el('b', {}, n), el('span', {}, l));
  $('#tab-pool').replaceChildren(
    el('div', { class: 'callout callout-info', style: 'margin-bottom:1rem' }, 'The panel sees totals, never individual people. All figures are from SYNTHETIC consents generated for this demo, plus any you add in the chat.'),
    el('div', { class: 'stats', style: 'margin-bottom:1rem' }, st(all.length, 'consent records'), st(active.length, 'active'), st(all.filter((c) => c.status === 'withdrawn').length, 'withdrawn'), st(all.filter((c) => consentStatus(c, now) === 'expired').length, 'expired'),
      ...Object.entries(LANGUAGES).map(([k, v]) => st(all.filter((c) => c.terms.language === k).length, `consented in ${v}`))),
    el('div', { class: 'grid', style: 'grid-template-columns: repeat(auto-fit,minmax(340px,1fr))' },
      bars('Purposes allowed (share of active)', PURPOSES, (t) => t.purposes.allowed),
      bars('Who may use it', PERMITTED_USERS, (t) => t.permitted_users),
      bars('Data shared', DATA_CATEGORIES, (t) => t.data_categories),
      bars('Benefits people insist on', BENEFITS, (t) => t.benefit_sharing.required),
      bars('Protection level', DEIDENTIFICATION, (t) => [t.deidentification]),
      bars('Other', { cross: 'Allow data to leave Nigeria', first: 'Passed comprehension check first time' }, (t) => [t.cross_border_transfer ? 'cross' : null, t.comprehension.attempts === 1 ? 'first' : null])));
}

function renderRules() {
  const p = S.policy;
  $('#tab-rules').replaceChildren(el('div', { class: 'card' },
    el('h2', {}, 'Governance rules'),
    el('p', { class: 'muted' }, 'These rules are written into the first (GENESIS) entry of the ledger, so the rules themselves are on the record. The same code enforces them before anything is written and re-checks them when anyone audits the ledger.'),
    kvList([
      ['Minimum group size', `${p.k_minimum} people. Smaller groups are easier to re-identify, so they are never released.`],
      ['Longest access', `${p.max_duration_days} days`],
      ['Quorum', `${p.approvals_required} of ${p.panel.length} approvals, at least ${p.community_approvals_required} from community seats. If 2 of the 3 community seats reject, the request is rejected: community members effectively hold a veto.`],
      ['Every vote', `needs a written reason (≥ ${p.min_reason_chars} characters), approvals too, and is bound to the request digest.`],
      ['Withdrawal', `stops all future releases at once; recipients holding a record get a notice to delete it within ${p.recipient_deletion_days} days.`],
      ['Panel seats', p.panel.map((m) => `${m.label}${m.community ? ' (community)' : ''}`).join(' · ')],
    ])));
}

commons = await loadCommons();
onExternalChange(async (c) => { commons = c; await refresh(); });
await refresh();
