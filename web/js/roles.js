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
  about: { role: null, back: '/' },
  community: { role: 'community', back: '/', tab: 'home' },
  researcher: { role: 'researcher', back: '/', tab: 'home' },
  panel: { role: 'panel', back: '/', tab: 'home' },
  chat: { role: 'community', back: '/community.html', tab: 'chat', noLang: true },
  ussd: { role: 'community', back: '/community.html', tab: 'ussd' },
  summary: { role: 'community', back: '/community.html', tab: 'summary' },
  review: { role: 'panel', back: '/panel.html', tab: 'requests' },
  ledger: { role: 'audit', back: '/', tab: null },
};

export const roleBar = (role) => `<div class="rolebar role-${role}" id="rolebar" role="note"><span class="shape" aria-hidden="true"></span><span class="rb-l" data-i18n="role_viewing">You are viewing as:</span> <b class="rb-r" data-i18n="role_${role}">${role}</b></div>`;

export const tabBar = (role, active) => (ROLES[role]?.tabs.length
  ? `<nav class="tabbar role-${role}" id="tabbar" aria-label="${role}" data-i18n-attr="aria-label:role_${role}">${ROLES[role].tabs
    .map(([k, href, key]) => `<a href="${href}" data-tab-key="${k}"${k === active ? ' aria-current="page"' : ''}><span class="shape" aria-hidden="true"></span><span data-i18n="${key}">${key}</span></a>`).join('')}</nav>`
  : '');
