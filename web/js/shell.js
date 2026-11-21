// Back button and role context for the page, from web/js/roles.js backFor(): one logical step back,
// following ?from= when a link passed one. Runs on every page (loaded by the app shell).
import { backFor, roleBar, tabBar, ROLES } from './roles.js';
import { T, applyStatic } from './lang.js';

const page = /\bpage-(\w+)/.exec(document.body.className)?.[1];
const q = new URLSearchParams(location.search);
const from = q.get('from');
// review.html?as=researcher is the researcher's "New request" screen: review.js swaps its role strip and tabs.
const b = page === 'review' && q.get('as') === 'researcher'
  ? { href: ROLES.researcher.hub, label: 'role_researcher', role: null, tabRole: null }
  : backFor(page, from);
const btn = document.getElementById('app-back');
const swap = (id, html) => { const n = Object.assign(document.createElement('div'), { innerHTML: html }).firstChild; const old = document.getElementById(id); if (old) old.replaceWith(n); return n; };

if (b && btn) {
  btn.href = b.href;
  btn.removeAttribute('data-i18n-attr'); // labelled here, so it can name the place
  const label = () => btn.setAttribute('aria-label', T('app_back_to', { place: T(b.label) }));
  label(); window.addEventListener('cc:lang', label);
  const cur = document.getElementById('rolebar');
  if (b.role && cur && !cur.classList.contains('role-' + b.role)) {
    swap('rolebar', roleBar(b.role));
    document.body.className = document.body.className.replace(/\bas-\w+/, 'as-' + b.role);
  }
  const bar = document.getElementById('tabbar');
  const want = b.tabRole && ROLES[b.tabRole]?.tabs.length ? tabBar(b.tabRole, b.tab) : '';
  if (want && (!bar || !bar.classList.contains('role-' + b.tabRole) || b.tab !== PAGE_TAB())) {
    if (bar) swap('tabbar', want); else document.querySelector('header.apphdr').insertAdjacentHTML('afterend', want);
    document.body.classList.add('has-tabbar');
  }
  applyStatic();
}
function PAGE_TAB() { return document.querySelector('#tabbar a[aria-current]')?.dataset.tabKey ?? null; }
