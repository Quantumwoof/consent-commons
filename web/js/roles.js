// Who is using the app. Each role has a colour, a shape and a text label (colour is never the only cue),
// a home screen (hub) and the tab bar shown on phones. Pure data + string templates: used by
// scripts/build.js to write the app shell into every page, and by review.js to switch roles in place.
export const ROLES = {
  community: { hub: '/community.html', tabs: [['home', '/community.html', 'tab_home'], ['chat', '/chat.html', 'tab_consent'], ['ussd', '/ussd.html', 'tab_ussd'], ['summary', '/summary.html', 'tab_shared']] },
  researcher: { hub: '/researcher.html', tabs: [['home', '/researcher.html', 'tab_myreq'], ['new', '/review.html?as=researcher#new', 'tab_newreq'], ['rules', '/review.html?as=researcher#rules', 'tab_rules_short']] },
  panel: { hub: '/panel.html', tabs: [['home', '/panel.html', 'tab_home'], ['requests', '/review.html#requests', 'tab_requests_short'], ['releases', '/review.html#releases', 'tab_releases_short'], ['rules', '/review.html#rules', 'tab_rules_short']] },
  audit: { hub: '/', tabs: [] },
};

/** Page → role, back target, active tab. Pages with no role (launch, about) show no role strip. */
export const PAGES = {
  home: { role: null, back: null },
  about: { role: null, back: '/', backLabel: 'app_start' },
  community: { role: 'community', back: '/', backLabel: 'app_start', tab: 'home' },
  researcher: { role: 'researcher', back: '/', backLabel: 'app_start', tab: 'home', from: ['researcher'] },
  panel: { role: 'panel', back: '/', backLabel: 'app_start', tab: 'home' },
  chat: { role: 'community', back: '/community.html', backLabel: 'role_community', tab: 'chat', noLang: true, from: ['about'] },
  ussd: { role: 'community', back: '/community.html', backLabel: 'role_community', tab: 'ussd', from: ['chat', 'about'] },
  summary: { role: 'community', back: '/community.html', backLabel: 'role_community', tab: 'summary', from: ['ussd', 'releases', 'about'] },
  review: { role: 'panel', back: '/panel.html', backLabel: 'role_panel', tab: 'requests' },
  ledger: { role: 'audit', back: '/', backLabel: 'app_start', tab: null, from: ['community', 'panel', 'chat', 'ussd', 'about'] },
};

/**
 * Where a link came from (?from=...). Only these values are honoured, so the back button can never be
 * pointed at another site. `role` is the role of that place; `tab` the tab to mark in that role's tab bar.
 */
export const FROM = {
  community: { href: '/community.html', label: 'role_community', role: 'community', tab: null },
  researcher: { href: '/researcher.html', label: 'role_researcher', role: 'researcher', tab: 'home' },
  panel: { href: '/panel.html', label: 'role_panel', role: 'panel', tab: null },
  chat: { href: '/chat.html', label: 'nav_chat', role: 'community', tab: 'chat' },
  ussd: { href: '/ussd.html', label: 'tab_ussd', role: 'community', tab: 'ussd' },
  releases: { href: '/review.html#releases', label: 'tab_releases_short', role: 'panel', tab: 'releases' },
  about: { href: '/about.html', label: 'launch_about', role: null, tab: null },
};

/**
 * One logical step back. Without a known ?from=, each page goes up to its role's home screen (hubs go to
 * the start screen). With one, back returns to where the person came from. The release summary takes on
 * the role of whoever opened it (a panel member from Releases sees the panel strip); the ledger always says
 * "Anyone can audit" (it is the same public record for everyone) but shows the tab bar of the role the
 * person came from, so they can carry on in that role.
 */
export function backFor(page, from) {
  const p = PAGES[page];
  if (!p || !p.back) return null;
  const base = { href: p.back, label: p.backLabel, role: p.role, tabRole: p.role, tab: p.tab };
  const f = (p.from ?? []).includes(from) ? FROM[from] : null;
  if (!f) return base;
  if (page === 'summary' && f.role && f.role !== p.role) return { href: f.href, label: f.label, role: f.role, tabRole: f.role, tab: f.tab };
  if (page === 'ledger' && f.role) return { href: f.href, label: f.label, role: 'audit', tabRole: f.role, tab: null };
  return { ...base, href: f.href, label: f.label };
}

export const roleBar = (role) => `<div class="rolebar role-${role}" id="rolebar" role="note"><span class="shape" aria-hidden="true"></span><span class="rb-l" data-i18n="role_viewing">You are viewing as:</span> <b class="rb-r" data-i18n="role_${role}">${role}</b></div>`;

export const tabBar = (role, active) => (ROLES[role]?.tabs.length
  ? `<nav class="tabbar role-${role}" id="tabbar" aria-label="${role}" data-i18n-attr="aria-label:role_${role}">${ROLES[role].tabs
    .map(([k, href, key]) => `<a href="${href}" data-tab-key="${k}"${k === active ? ' aria-current="page"' : ''}><span class="shape" aria-hidden="true"></span><span data-i18n="${key}">${key}</span></a>`).join('')}</nav>`
  : '');

/**
 * Chrome the URL should show: role strip, tab bar, back target, and (on the researcher
 * request screen) the page title. Null only when the page has no back button (the start
 * screen). Used by shell.js and, as a copy, by the classic boot-role.js script so the
 * right role is in the DOM before first paint — module scripts run too late for that.
 */
export function chromeFor(page, search = '', hash = '') {
  const q = search instanceof URLSearchParams ? search : new URLSearchParams(String(search).replace(/^\?/, ''));
  const h = String(hash || '').replace(/^#/, '');
  if (page === 'review' && q.get('as') === 'researcher') {
    return {
      role: 'researcher', tabRole: 'researcher', tab: h === 'rules' ? 'rules' : 'new',
      href: ROLES.researcher.hub, label: 'role_researcher',
      titleKey: 'rv_res_title', noteKey: 'rv_res_note', docTitleKey: 'title_researcher',
      tabs: ['new', 'rules'],
    };
  }
  const b = backFor(page, q.get('from'));
  if (!b) return null;
  let tab = b.tab;
  if (page === 'review' && ['requests', 'new', 'releases', 'pool', 'rules'].includes(h)) tab = h;
  return { role: b.role, tabRole: b.tabRole, tab, href: b.href, label: b.label };
}
