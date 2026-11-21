// USSD simulation page. The phone and the network are simulated; the session logic (src/core/ussd.js) is
// shared with the tests and uses the same Commons.findByCode / Commons.withdraw as the consent chat.
import { loadCommons, save, RKEY } from './store.js';
import { el, $ } from './ui.js';
import { UssdSession, USSD_CODE } from '/src/core/ussd.js';
import { DEMO_SAMPLE_CODE } from '/src/core/seed.js';
import { tu, LOCALES } from '/src/i18n/index.js';
import { getLang, onLang } from './lang.js';

let lang = getLang();
const u = (k, v) => tu(lang, k, v);
const screen = $('#screen'), reply = $('#reply');
let session = null, screenLang = null, busy = false, lastScreen = null;

function lastCode() { try { return JSON.parse(sessionStorage.getItem(RKEY) || 'null')?.withdrawal_code ?? null; } catch { return null; } }

function setStatic() {
  document.documentElement.lang = lang;
  for (const [id, k] of [['u-title', 'us_title'], ['u-intro', 'us_intro'], ['u-how', 'us_how'], ['u-steps', 'us_steps'], ['u-sample-label', 'us_sample'], ['u-last-label', 'us_last'], ['u-letters', 'us_letters'], ['reply-label', 'us_reply'], ['send', 'us_send'], ['call', 'us_call'], ['end', 'us_end']]) $('#' + id).textContent = u(k);
  $('#del').setAttribute('aria-label', u('us_clear'));
  $('#screen-wrap').setAttribute('aria-label', u('us_screen'));
  $('#sample-code').textContent = DEMO_SAMPLE_CODE;
  $('#use-sample').textContent = u('us_fill');
  const code = lastCode();
  $('#last-row').replaceChildren(...(code ? [el('span', { class: 'code-box' }, code), el('button', { class: 'btn btn-sm', type: 'button', onclick: () => fill(code) }, u('us_fill'))] : [el('span', { class: 'small' }, u('us_none_last'))]));
  if (!session) idle();
}

function show(text, mode) {
  screen.textContent = text;
  // digits for menus, letters allowed for the withdrawal code, * and # for dialling
  reply.inputMode = mode === 'code' ? 'text' : mode === 'dial' ? 'tel' : 'numeric';
  reply.placeholder = mode === 'dial' ? USSD_CODE : '';
}
function idle() { session = null; lastScreen = null; show(u('us_dial'), 'dial'); reply.value = ''; }
function fill(code) { reply.value = code; reply.focus({ preventScroll: true }); }

async function submit() {
  if (busy) return;
  const v = reply.value.trim();
  reply.value = '';
  busy = true;
  try {
    if (!session || lastScreen?.end) {
      session = new UssdSession({ load: () => loadCommons({ fresh: true }), persist: (c) => save(c), lang });
      lastScreen = session.dial(v || '');
    } else {
      lastScreen = await session.reply(v);
    }
    screenLang = lastScreen.lang;
    screen.lang = screenLang;
    show(lastScreen.text, lastScreen.input);
    if (lastScreen.end) session = null;
    if (lastScreen.withdrawn) afterWithdraw(lastScreen.withdrawn);
  } finally { busy = false; }
}

function afterWithdraw({ entry, notices }) {
  const box = $('#after');
  box.hidden = false;
  box.replaceChildren(
    el('div', { class: 'callout callout-good small' }, `✓ CONSENT_WITHDRAWN · #${entry.seq}${notices.length ? ` · WITHDRAWAL_NOTICE_ISSUED × ${notices.length}` : ''}`),
    el('div', { class: 'row', style: 'margin-top:.6rem' },
      el('a', { class: 'btn btn-sm', href: '/ledger.html?from=ussd' }, u('us_open_ledger')),
      notices.length ? el('a', { class: 'btn btn-sm', href: `/summary.html?release=${encodeURIComponent(notices[0].data.release_id)}&from=ussd` }, u('us_open_releases')) : null));
}

const KEYS = [['1', ''], ['2', 'ABC'], ['3', 'DEF'], ['4', 'GHI'], ['5', 'JKL'], ['6', 'MNO'], ['7', 'PQRS'], ['8', 'TUV'], ['9', 'WXYZ'], ['*', ''], ['0', ''], ['#', '']];
$('#keys').replaceChildren(...KEYS.map(([k, sub]) => el('button', { type: 'button', class: 'fkey', 'aria-label': k, onclick: () => { reply.value += k; } }, el('b', {}, k), el('span', { 'aria-hidden': 'true' }, sub || ' '))));
$('#del').addEventListener('click', () => { reply.value = reply.value.slice(0, -1); });
$('#reply-form').addEventListener('submit', (e) => { e.preventDefault(); submit(); });
$('#call').addEventListener('click', submit);
$('#end').addEventListener('click', idle);
$('#use-sample').addEventListener('click', () => fill(DEMO_SAMPLE_CODE));
onLang((l) => { lang = l; setStatic(); });
await loadCommons(); // make sure this browser has its demo commons before the first dial
setStatic();
