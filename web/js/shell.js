// Back button and role context for the page, from web/js/roles.js chromeFor(): one logical step back,
// following ?from= when a link passed one. Runs on every page (loaded by the app shell).
// The visible role on first paint is applied earlier by the classic script web/js/boot-role.js.
import { chromeFor, roleBar, tabBar, ROLES } from './roles.js';
import { T, applyStatic } from './lang.js';

const page = /\bpage-(\w+)/.exec(document.body.className)?.[1];
const c = chromeFor(page, location.search, location.hash);
const btn = document.getElementById('app-back');
const swap = (id, html) => { const n = Object.assign(document.createElement('div'), { innerHTML: html }).firstChild; const old = document.getElementById(id); if (old) old.replaceWith(n); return n; };

if (c && btn) {
  btn.href = c.href;
  btn.removeAttribute('data-i18n-attr'); // labelled here, so it can name the place
  const label = () => btn.setAttribute('aria-label', T('app_back_to', { place: T(c.label) }));
  label(); window.addEventListener('cc:lang', label);
  const cur = document.getElementById('rolebar');
  if (c.role && cur && !cur.classList.contains('role-' + c.role)) {
    swap('rolebar', roleBar(c.role));
    document.body.className = document.body.className.replace(/\bas-\w+/, 'as-' + c.role);
  }
  const bar = document.getElementById('tabbar');
  const want = c.tabRole && ROLES[c.tabRole]?.tabs.length ? tabBar(c.tabRole, c.tab) : '';
  if (want && (!bar || !bar.classList.contains('role-' + c.tabRole) || c.tab !== PAGE_TAB())) {
    if (bar) swap('tabbar', want); else document.querySelector('header.apphdr').insertAdjacentHTML('afterend', want);
    document.body.classList.add('has-tabbar');
  }
  applyStatic();
}
function PAGE_TAB() { return document.querySelector('#tabbar a[aria-current]')?.dataset.tabKey ?? null; }
