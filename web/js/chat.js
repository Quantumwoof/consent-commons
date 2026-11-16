// The consent conversation. A small state machine: each step asks one thing in plain words, in the
// person's language. Nothing is recorded until the comprehension check is passed AND they say yes.
import { LOCALES, t as tr, noticeFor, comprehensionQuestions } from '/src/i18n/index.js';
import { buildTerms } from '/src/core/terms.js';
import { newPersonalCode } from '/src/core/hash.js';
import { PURPOSES, DATA_CATEGORIES, PERMITTED_USERS, BENEFITS, DEIDENTIFICATION, DURATIONS_DAYS } from '/src/core/vocab.js';
import { loadCommons, save, RKEY } from './store.js';
import { el, $, download } from './ui.js';

const log = $('#log');
const input = $('#input');
const langSel = $('#lang');
let lang = localStorage.getItem('cc.lang') || null;
const t = (k, v) => tr(lang ?? 'en', k, v);
const yoOk = Intl.DateTimeFormat.supportedLocalesOf(['yo-NG']).length > 0;
const LOCALE_FMT = { en: 'en-GB', pcm: 'en-GB', yo: yoOk ? 'yo-NG' : 'en-GB' };
const fmt = (iso) => new Date(iso).toLocaleDateString(LOCALE_FMT[lang] ?? 'en-GB', { day: 'numeric', month: 'long', year: 'numeric' });
const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
const now = () => new Date().toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });

class Abort extends Error {}
let pending = null; // { kind, resolve, reject, options }
let runId = 0;

function scroll() { log.scrollTop = log.scrollHeight; }
function bubble(cls, text) {
  const m = el('div', { class: `msg ${cls}`, lang: cls === 'me' ? null : (lang === 'pcm' ? 'pcm' : lang) }, text, el('span', { class: 'meta' }, now()));
  log.append(m); scroll(); return m;
}
async function say(key, vars) {
  const id = runId;
  const dots = el('div', { class: 'typing', 'aria-hidden': 'true' }, el('i'), el('i'), el('i'));
  log.append(dots); scroll();
  await new Promise((r) => setTimeout(r, reduced ? 0 : Math.min(900, 250 + t(key, vars).length * 6)));
  dots.remove();
  if (id !== runId) throw new Abort();
  return bubble('bot', t(key, vars));
}
function system(text) { const m = el('div', { class: 'msg system' }, text); log.append(m); scroll(); }

function cancelPending() { if (pending) { pending.box?.setAttribute('aria-disabled', 'true'); pending.reject(new Abort()); pending = null; } }

/** Single choice. Resolves with the option value. Accepts a click, the option number, or its text. */
function choose(options) {
  return new Promise((resolve, reject) => {
    const box = el('div', { class: 'choices', role: 'group' });
    options.forEach((o, i) => box.append(el('button', { type: 'button', onclick: () => pick(o) }, el('span', { class: 'n' }, i + 1), o.label)));
    function pick(o) { box.setAttribute('aria-disabled', 'true'); pending = null; bubble('me', o.label); resolve(o.value); }
    log.append(box); scroll();
    pending = { kind: 'choice', options, pick, resolve, reject, box };
    box.querySelector('button')?.focus({ preventScroll: true });
  });
}
/** Multiple choice with a Done button. */
function chooseMany(options) {
  return new Promise((resolve, reject) => {
    const picked = new Set();
    const box = el('div', { class: 'choices', role: 'group' });
    const buttons = options.map((o, i) => el('button', { type: 'button', 'aria-pressed': 'false', onclick: () => toggle(i) }, el('span', { class: 'n' }, i + 1), o.label));
    function toggle(i) { const v = options[i].value; picked.has(v) ? picked.delete(v) : picked.add(v); buttons[i].setAttribute('aria-pressed', String(picked.has(v))); }
    function finish() {
      box.setAttribute('aria-disabled', 'true'); pending = null;
      const chosen = options.filter((o) => picked.has(o.value));
      bubble('me', chosen.length ? chosen.map((o) => '• ' + o.label).join('\n') : '—');
      resolve(chosen.map((o) => o.value));
    }
    box.append(...buttons, el('button', { type: 'button', class: 'done', onclick: finish }, t('done') + ' ✓'));
    log.append(box); scroll();
    pending = { kind: 'many', options, toggle, finish, resolve, reject, box };
  });
}
function askText() {
  return new Promise((resolve, reject) => { pending = { kind: 'text', resolve: (v) => { pending = null; resolve(v); }, reject }; input.focus(); });
}

$('#composer').addEventListener('submit', (ev) => {
  ev.preventDefault();
  const text = input.value.trim(); if (!text) return; input.value = '';
  const up = text.toUpperCase();
  if (['MENU', 'MENÚ', 'ÀKÓJỌ', 'AKOJO'].includes(up)) { bubble('me', text); return restart(menu); }
  if (['START', 'BẸ̀RẸ̀', 'BERE'].includes(up)) { bubble('me', text); return restart(consentFlow); }
  if (['WITHDRAW', 'COMOT', 'YỌWỌ́', 'YOWO', 'STOP'].includes(up)) { bubble('me', text); return restart(withdrawFlow); }
  if (!pending) { bubble('me', text); return; }
  if (pending.kind === 'text') { bubble('me', text); return pending.resolve(text); }
  const n = Number(text);
  const idx = Number.isInteger(n) ? n - 1 : pending.options.findIndex((o) => o.label.toLowerCase() === text.toLowerCase());
  if (pending.kind === 'choice' && pending.options[idx]) return pending.pick(pending.options[idx]);
  if (pending.kind === 'many') {
    if (['DONE', 'Ó TI TÁN', 'O TI TAN'].includes(up) || text === '0') return pending.finish();
    for (const part of text.split(/[ ,]+/)) { const k = Number(part) - 1; if (pending.options[k]) pending.toggle(k); }
    return;
  }
  bubble('me', text);
});

function restart(flow) {
  cancelPending(); runId++;
  const id = runId;
  flow().catch((e) => { if (!(e instanceof Abort)) { console.error(e); system('Error: ' + e.message); } }).finally(() => { if (id === runId && !pending) menu().catch(() => {}); });
}

const opts = (vocab, prefix) => Object.keys(vocab).map((k) => ({ value: k, label: t(prefix + k) }));
const yesNo = () => [{ value: 'yes', label: t('yes') }, { value: 'no', label: t('no') }];

function setLang(l) {
  lang = l; localStorage.setItem('cc.lang', l); langSel.value = l;
  document.documentElement.lang = l === 'pcm' ? 'pcm' : l;
  $('#h-title').textContent = t('title'); $('#h-sub').textContent = t('subtitle');
  input.placeholder = t('placeholder'); $('#menu-btn').textContent = t('menu_btn');
}
langSel.addEventListener('change', () => { setLang(langSel.value); system(`${LOCALES[lang].meta.name} · ${lang === 'en' ? 'source text' : 'DRAFT translation, not reviewed by native speakers'}`); restart(menu); });
$('#menu-btn').addEventListener('click', () => restart(menu));

async function chooseLanguage() {
  system('Choose a language · Choose language · Yan èdè');
  const l = await choose([{ value: 'en', label: 'English' }, { value: 'pcm', label: 'Pidgin (Naijá)' }, { value: 'yo', label: 'Yorùbá' }]);
  setLang(l);
  if (l !== 'en') system('DRAFT translation: not yet reviewed by native speakers.');
}

function summaryCard(c) {
  const list = (vals, prefix) => vals.length ? vals.map((v) => t(prefix + v)).join('; ') : t('nothing_extra');
  const until = new Date(Date.now() + c.duration_days * 86400000).toISOString();
  const card = el('div', { class: 'rcard', lang },
    el('h4', {}, t('summary_title')),
    el('ul', {},
      el('li', {}, t('sum_categories', { x: list(c.data_categories, 'cat_') })),
      el('li', {}, t('sum_purposes', { x: list(c.purposes, 'pur_') })),
      el('li', {}, t('sum_users', { x: list(c.permitted_users, 'usr_') })),
      el('li', {}, t('sum_deid', { x: t('deid_' + c.deidentification) })),
      el('li', {}, t('sum_border', { x: c.cross_border_transfer ? t('border_yes') : t('border_no') })),
      el('li', {}, t('sum_benefits', { x: list(c.benefits, 'ben_') })),
      el('li', {}, t('sum_duration', { x: t('dur_' + c.duration_days), date: fmt(until) }))));
  log.append(card); scroll();
}

async function consentFlow() {
  if (!lang) await chooseLanguage();
  await say('welcome'); await say('intro_1'); await say('intro_2'); await say('intro_3');
  if ((await choose([{ value: 'go', label: t('continue') }, { value: 'no', label: t('no_thanks') }])) === 'no') { await say('declined'); return; }
  let c;
  for (;;) {
    c = { language: lang };
    await say('q_categories'); c.data_categories = await chooseMany(opts(DATA_CATEGORIES, 'cat_'));
    if (!c.data_categories.length) { await say('none_selected'); return; }
    await say('q_purposes'); c.purposes = await chooseMany(opts(PURPOSES, 'pur_'));
    if (!c.purposes.length) { await say('none_selected'); return; }
    await say('q_users'); c.permitted_users = await chooseMany(opts(PERMITTED_USERS, 'usr_'));
    if (!c.permitted_users.length) { await say('none_selected'); return; }
    // Commercial AI training needs a company to do it. If companies were not allowed, it cannot happen.
    if (c.purposes.includes('ai_training_commercial') && !c.permitted_users.includes('commercial')) c.purposes = c.purposes.filter((p) => p !== 'ai_training_commercial');
    await say('q_deid'); c.deidentification = await choose(Object.keys(DEIDENTIFICATION).map((k) => ({ value: k, label: t('deid_' + k) })).reverse());
    await say('q_border'); c.cross_border_transfer = (await choose([{ value: false, label: t('border_no') }, { value: true, label: t('border_yes') }]));
    await say('q_benefits'); c.benefits = await chooseMany(opts(BENEFITS, 'ben_'));
    await say('q_duration'); c.duration_days = await choose(Object.keys(DURATIONS_DAYS).map((d) => ({ value: Number(d), label: t('dur_' + d) })));
    summaryCard(c);
    if ((await choose([{ value: 'ok', label: t('looks_right') }, { value: 'change', label: t('change') }])) === 'ok') break;
  }

  // Comprehension check: generated from THEIR choices. Two misses on the same question = stop, nothing recorded.
  await say('check_intro');
  let firstTry = 0, attempts = 1;
  for (const q of comprehensionQuestions(c)) {
    let ok = false;
    for (let attempt = 0; attempt < 2 && !ok; attempt++) {
      if (attempt) { attempts = 2; await say('retry'); }
      await say(q.q);
      ok = (await choose(yesNo())) === q.answer;
      if (ok && attempt === 0) firstTry++;
      await say(ok ? 'right' : 'wrong'); await say(q.explain);
    }
    if (!ok) { await say('check_failed'); return; }
  }

  await say('confirm_q');
  if ((await choose([{ value: 'yes', label: t('yes_record') }, { value: 'no', label: t('no_record') }])) === 'no') { await say('declined'); return; }

  const commons = await loadCommons({ fresh: true });
  const { commons: info } = await commons.state();
  const terms = buildTerms(c, { commons: info, notice: await noticeFor(lang), comprehension: { questions: 4, correct_first_try: firstTry, attempts, passed: true } });
  const code = newPersonalCode();
  const { receipt } = await commons.grantConsent(terms, { withdrawalCode: code });
  save(commons);
  const kept = { ...receipt, withdrawal_code: code };
  sessionStorage.setItem(RKEY, JSON.stringify(kept));
  await say('recorded');
  log.append(el('div', { class: 'rcard', lang },
    el('h4', {}, `🧾 ${t('receipt')} · ${terms.terms_id}`),
    el('div', { class: 'small' }, t('code_label')),
    el('div', { class: 'code-box', 'aria-label': t('code_label') }, code),
    el('div', { class: 'small' }, '⚠️ ' + t('code_warning')),
    el('div', { class: 'small muted', style: 'margin-top:.35rem' }, `Ledger entry #${receipt.ledger_entry.seq} · ${receipt.ledger_entry.hash.slice(0, 16)}… ${receipt.signature ? '· signed' : ''}`),
    el('div', { class: 'row', style: 'margin-top:.5rem' },
      el('button', { class: 'btn btn-primary btn-sm', type: 'button', onclick: () => download(`consent-receipt-${terms.terms_id}.json`, kept) }, t('download')),
      el('a', { class: 'btn btn-sm', href: '/ledger.html#verify-receipt' }, t('verify')))));
  scroll();
}

async function findFlow() {
  await say('ask_code');
  const code = await askText();
  const commons = await loadCommons({ fresh: true });
  const c = await commons.findByCode(code);
  if (!c) { await say('code_not_found'); return { commons, c: null, code }; }
  return { commons, c, code };
}

async function checkFlow() {
  const { c } = await findFlow(); if (!c) return;
  if (c.status === 'withdrawn') await say('status_withdrawn', { date: fmt(c.withdrawn_at) });
  else if (c.status === 'expired') await say('status_expired', { date: fmt(c.terms.expires_at) });
  else await say('status_active', { date: fmt(c.terms.expires_at) });
  summaryCard({ ...c.terms, purposes: c.terms.purposes.allowed, benefits: c.terms.benefit_sharing.required, duration_days: Math.round((Date.parse(c.terms.expires_at) - Date.parse(c.terms.granted_at)) / 86400000) });
}

async function withdrawFlow() {
  const { commons, c, code } = await findFlow(); if (!c) return;
  if (c.status === 'withdrawn') { await say('status_withdrawn', { date: fmt(c.withdrawn_at) }); return; }
  await say('withdraw_confirm');
  if ((await choose([{ value: 'yes', label: t('yes_withdraw') }, { value: 'no', label: t('keep') }])) === 'no') return;
  const { receipt, notices } = await commons.withdraw(code);
  save(commons);
  await say('withdrawn_done', { n: notices.length });
  log.append(el('div', { class: 'rcard' }, el('h4', {}, `🧾 ${t('receipt')}`),
    el('div', { class: 'small muted' }, `Ledger entry #${receipt.ledger_entry.seq} · ${receipt.ledger_entry.hash.slice(0, 16)}…`),
    el('button', { class: 'btn btn-primary btn-sm', type: 'button', style: 'margin-top:.4rem', onclick: () => download(`withdrawal-receipt-${c.terms.terms_id}.json`, receipt) }, t('download'))));
  scroll();
}

async function menu() {
  if (!lang) await chooseLanguage();
  await say('menu');
  const v = await choose([{ value: 'start', label: t('m_start') }, { value: 'check', label: t('m_check') }, { value: 'withdraw', label: t('m_withdraw') }, { value: 'language', label: t('m_language') }]);
  const flows = { start: consentFlow, check: checkFlow, withdraw: withdrawFlow, language: async () => { lang = null; await chooseLanguage(); } };
  restart(flows[v]);
}

if (lang) setLang(lang);
system('SYNTHETIC DEMO · nothing you type leaves this browser');
const params = new URLSearchParams(location.search);
restart(params.get('start') === 'withdraw' ? withdrawFlow : consentFlow);
