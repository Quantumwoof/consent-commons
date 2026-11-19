// One language setting for every page (localStorage 'cc.lang'). Applies translations to static markup
// ([data-i18n] = text, [data-i18n-html] = trusted markup from our own locale files, [data-i18n-attr] =
// "attr:key;attr:key") and tells the page scripts when the language changes.
import { tu, LOCALES } from '/src/i18n/index.js';

const KEY = 'cc.lang';
export const getLang = () => (LOCALES[localStorage.getItem(KEY)] ? localStorage.getItem(KEY) : 'en');
export const T = (k, v) => tu(getLang(), k, v);
const yoOk = Intl.DateTimeFormat.supportedLocalesOf(['yo-NG']).length > 0;
/** Date locale: Pidgin uses English month names; Yoruba uses yo-NG where the browser has it. */
export const dateLocale = () => (getLang() === 'yo' && yoOk ? 'yo-NG' : 'en-GB');

export function applyStatic(root = document) {
  const l = getLang();
  document.documentElement.lang = l;
  for (const n of root.querySelectorAll('[data-i18n]')) n.textContent = T(n.dataset.i18n);
  for (const n of root.querySelectorAll('[data-i18n-html]')) n.innerHTML = T(n.dataset.i18nHtml);
  for (const n of root.querySelectorAll('[data-i18n-attr]')) for (const pair of n.dataset.i18nAttr.split(';')) { const [a, k] = pair.split(':'); n.setAttribute(a, T(k)); }
  const t = document.querySelector('meta[name="cc-title"]')?.content;
  if (t) document.title = T(t);
  for (const s of document.querySelectorAll('select.cc-lang')) s.value = l;
}
export function setLang(l) {
  if (!LOCALES[l] || l === getLang() && localStorage.getItem(KEY)) { applyStatic(); return; }
  localStorage.setItem(KEY, l);
  applyStatic();
  window.dispatchEvent(new CustomEvent('cc:lang', { detail: l }));
}
export function onLang(fn) { window.addEventListener('cc:lang', (e) => fn(e.detail)); }

for (const s of document.querySelectorAll('select.cc-lang')) s.addEventListener('change', () => setLang(s.value));
// Another tab changed the language: follow it.
window.addEventListener('storage', (e) => { if (e.key === KEY) { applyStatic(); window.dispatchEvent(new CustomEvent('cc:lang', { detail: getLang() })); } });
applyStatic();
