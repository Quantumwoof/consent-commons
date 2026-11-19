import { tu } from '/src/i18n/index.js';
import { getLang, dateLocale } from './lang.js';
// Small DOM helpers shared by the pages.
export function el(tag, attrs = {}, ...children) {
  const n = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs ?? {})) {
    if (v == null || v === false) continue;
    if (k === 'class') n.className = v;
    else if (k.startsWith('on') && typeof v === 'function') n.addEventListener(k.slice(2), v);
    else n.setAttribute(k, v === true ? '' : v);
  }
  for (const c of children.flat(Infinity)) if (c != null && c !== false) n.append(c.nodeType ? c : document.createTextNode(String(c)));
  return n;
}
export const $ = (s, r = document) => r.querySelector(s);
export const short = (h, n = 10) => (h ? `${h.slice(0, n)}…` : '');
export const fmtDate = (iso, locale = dateLocale()) => new Date(iso).toLocaleDateString(locale, { day: 'numeric', month: 'short', year: 'numeric' });
export const fmtTime = (iso) => new Date(iso).toLocaleString(dateLocale(), { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit', timeZone: 'Africa/Lagos' }) + ' WAT';
export function download(name, data) {
  const blob = new Blob([typeof data === 'string' ? data : JSON.stringify(data, null, 2) + '\n'], { type: 'application/json' });
  const a = el('a', { href: URL.createObjectURL(blob), download: name });
  document.body.append(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}
export function pill(text, tone = 'neutral') { return el('span', { class: `pill pill-${tone}` }, text); }
export const STATUS_TONE = { in_review: 'info', blocked: 'bad', approved: 'good', released: 'good', rejected: 'bad', active: 'good', withdrawn: 'bad', expired: 'neutral' };
/** Request status in the chosen language (st_<status> in the page locale files). */
export const statusLabel = (st) => tu(getLang(), 'st_' + st);
export function toast(msg, tone = 'good') {
  const t = el('div', { class: `toast toast-${tone}`, role: 'status' }, msg);
  document.body.append(t); setTimeout(() => t.classList.add('show'), 10);
  setTimeout(() => { t.classList.remove('show'); setTimeout(() => t.remove(), 300); }, 3500);
}
