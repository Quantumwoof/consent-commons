// Classic script (not a module): runs in <head> and again after the app shell is in the DOM,
// so the right role is painted first. Module scripts (shell.js, review.js) are deferred and
// used to flash the wrong role — that is why this file must not use type="module".
// Keep the URL cases here in step with chromeFor() in web/js/roles.js.
(function () {
  var EN = {
    role_viewing: 'You are viewing as:',
    role_community: 'Community member',
    role_researcher: 'Researcher',
    role_panel: 'Review panel',
    role_audit: 'Anyone can audit',
    tab_home: 'Home',
    tab_consent: 'Consent',
    tab_ussd: 'USSD',
    tab_shared: 'Shared',
    tab_myreq: 'My request',
    tab_newreq: 'New request',
    tab_rules_short: 'Rules',
    tab_requests_short: 'Requests',
    tab_releases_short: 'Releases',
    rv_res_title: 'Request data access',
    rv_res_note: 'You are the researcher here. Only the review panel can vote on a request.',
    title_researcher: 'Researcher · Consent Commons (demo)',
  };
  var ROLES = {
    community: { hub: '/community.html', tabs: [['home', '/community.html', 'tab_home'], ['chat', '/chat.html', 'tab_consent'], ['ussd', '/ussd.html', 'tab_ussd'], ['summary', '/summary.html', 'tab_shared']] },
    researcher: { hub: '/researcher.html', tabs: [['home', '/researcher.html', 'tab_myreq'], ['new', '/review.html?as=researcher#new', 'tab_newreq'], ['rules', '/review.html?as=researcher#rules', 'tab_rules_short']] },
    panel: { hub: '/panel.html', tabs: [['home', '/panel.html', 'tab_home'], ['requests', '/review.html#requests', 'tab_requests_short'], ['releases', '/review.html#releases', 'tab_releases_short'], ['rules', '/review.html#rules', 'tab_rules_short']] },
    audit: { hub: '/', tabs: [] },
  };
  var FROM = {
    community: { href: '/community.html', label: 'role_community', role: 'community', tab: null },
    researcher: { href: '/researcher.html', label: 'role_researcher', role: 'researcher', tab: 'home' },
    panel: { href: '/panel.html', label: 'role_panel', role: 'panel', tab: null },
    chat: { href: '/chat.html', label: 'nav_chat', role: 'community', tab: 'chat' },
    ussd: { href: '/ussd.html', label: 'tab_ussd', role: 'community', tab: 'ussd' },
    releases: { href: '/review.html#releases', label: 'tab_releases_short', role: 'panel', tab: 'releases' },
    about: { href: '/about.html', label: 'launch_about', role: null, tab: null },
  };
  var PAGES = {
    home: { role: null, back: null },
    about: { role: null, back: '/', backLabel: 'app_start' },
    community: { role: 'community', back: '/', backLabel: 'app_start', tab: 'home' },
    researcher: { role: 'researcher', back: '/', backLabel: 'app_start', tab: 'home', from: ['researcher'] },
    panel: { role: 'panel', back: '/', backLabel: 'app_start', tab: 'home' },
    chat: { role: 'community', back: '/community.html', backLabel: 'role_community', tab: 'chat', from: ['about'] },
    ussd: { role: 'community', back: '/community.html', backLabel: 'role_community', tab: 'ussd', from: ['chat', 'about'] },
    summary: { role: 'community', back: '/community.html', backLabel: 'role_community', tab: 'summary', from: ['ussd', 'releases', 'about'] },
    review: { role: 'panel', back: '/panel.html', backLabel: 'role_panel', tab: 'requests' },
    ledger: { role: 'audit', back: '/', backLabel: 'app_start', tab: null, from: ['community', 'panel', 'chat', 'ussd', 'about'] },
  };

  function pageName() {
    if (document.body) {
      var m = /\bpage-(\w+)/.exec(document.body.className);
      if (m) return m[1];
    }
    var p = location.pathname;
    if (p === '/' || p === '') return 'home';
    var m2 = /\/(\w+)(?:\.html)?\/?$/.exec(p);
    return m2 ? m2[1] : '';
  }

  function backFor(page, from) {
    var p = PAGES[page];
    if (!p || !p.back) return null;
    var base = { href: p.back, label: p.backLabel, role: p.role, tabRole: p.role, tab: p.tab };
    var allowed = p.from || [];
    var f = allowed.indexOf(from) >= 0 ? FROM[from] : null;
    if (!f) return base;
    if (page === 'summary' && f.role && f.role !== p.role) return { href: f.href, label: f.label, role: f.role, tabRole: f.role, tab: f.tab };
    if (page === 'ledger' && f.role) return { href: f.href, label: f.label, role: 'audit', tabRole: f.role, tab: null };
    return { href: f.href, label: f.label, role: base.role, tabRole: base.tabRole, tab: base.tab };
  }

  function chromeFor(page, search, hash) {
    var q = new URLSearchParams(String(search || '').replace(/^\?/, ''));
    var h = String(hash || '').replace(/^#/, '');
    if (page === 'review' && q.get('as') === 'researcher') {
      return {
        role: 'researcher', tabRole: 'researcher', tab: h === 'rules' ? 'rules' : 'new',
        href: ROLES.researcher.hub, label: 'role_researcher',
        titleKey: 'rv_res_title', noteKey: 'rv_res_note', docTitleKey: 'title_researcher',
        tabs: ['new', 'rules'],
      };
    }
    var b = backFor(page, q.get('from'));
    if (!b) return null;
    var tab = b.tab;
    if (page === 'review' && ['requests', 'new', 'releases', 'pool', 'rules'].indexOf(h) >= 0) tab = h;
    return { role: b.role, tabRole: b.tabRole, tab: tab, href: b.href, label: b.label };
  }

  function roleBar(role) {
    var name = EN['role_' + role] || role;
    return '<div class="rolebar role-' + role + '" id="rolebar" role="note"><span class="shape" aria-hidden="true"></span><span class="rb-l" data-i18n="role_viewing">' + EN.role_viewing + '</span> <b class="rb-r" data-i18n="role_' + role + '">' + name + '</b></div>';
  }

  function tabBar(role, active) {
    var tabs = ROLES[role] && ROLES[role].tabs;
    if (!tabs || !tabs.length) return '';
    var html = '<nav class="tabbar role-' + role + '" id="tabbar" aria-label="' + role + '" data-i18n-attr="aria-label:role_' + role + '">';
    for (var i = 0; i < tabs.length; i++) {
      var k = tabs[i][0], href = tabs[i][1], key = tabs[i][2];
      html += '<a href="' + href + '" data-tab-key="' + k + '"' + (k === active ? ' aria-current="page"' : '') + '><span class="shape" aria-hidden="true"></span><span data-i18n="' + key + '">' + (EN[key] || key) + '</span></a>';
    }
    return html + '</nav>';
  }

  function chrome() {
    return chromeFor(pageName(), location.search, location.hash);
  }

  function markBoot(c) {
    var page = pageName();
    var baked = PAGES[page] && PAGES[page].role;
    if (c && c.role && c.role !== baked) document.documentElement.setAttribute('data-cc-boot', c.role);
  }

  function apply() {
    var c = chrome();
    if (!c) return;
    markBoot(c);
    var body = document.body;
    if (!body) return;
    if (c.role) {
      if (/\bas-\w+/.test(body.className)) body.className = body.className.replace(/\bas-\w+/, 'as-' + c.role);
      else body.classList.add('as-' + c.role);
    }
    var rb = document.getElementById('rolebar');
    if (rb && c.role && !rb.classList.contains('role-' + c.role)) rb.outerHTML = roleBar(c.role);
    var want = c.tabRole && ROLES[c.tabRole] && ROLES[c.tabRole].tabs.length ? tabBar(c.tabRole, c.tab) : '';
    var bar = document.getElementById('tabbar');
    var curTab = bar && bar.querySelector('a[aria-current]') && bar.querySelector('a[aria-current]').getAttribute('data-tab-key');
    if (want && (!bar || !bar.classList.contains('role-' + c.tabRole) || curTab !== c.tab)) {
      if (bar) bar.outerHTML = want;
      else {
        var hdr = document.querySelector('header.apphdr');
        if (hdr) hdr.insertAdjacentHTML('afterend', want);
      }
      body.classList.add('has-tabbar');
    }
    var back = document.getElementById('app-back');
    if (back && c.href) back.setAttribute('href', c.href);
    if (c.titleKey) {
      var h = document.querySelector('[data-i18n="rv_title"], [data-i18n="rv_res_title"]');
      if (h) { h.setAttribute('data-i18n', c.titleKey); h.textContent = EN[c.titleKey] || c.titleKey; }
    }
    if (c.noteKey) {
      var n = document.getElementById('acting-note');
      if (n) { n.setAttribute('data-i18n', c.noteKey); n.textContent = EN[c.noteKey] || c.noteKey; }
    }
    if (c.docTitleKey) {
      var meta = document.querySelector('meta[name="cc-title"]');
      if (meta) meta.setAttribute('content', c.docTitleKey);
      document.title = EN[c.docTitleKey] || document.title;
    }
    if (c.tabs) {
      var tabs = document.querySelectorAll('[role=tab]');
      for (var i = 0; i < tabs.length; i++) tabs[i].hidden = c.tabs.indexOf(tabs[i].getAttribute('data-tab')) < 0;
    }
  }

  var c0 = chrome();
  markBoot(c0);
  apply();
  if (c0 && c0.titleKey && !document.getElementById('acting-note')) {
    var obs = new MutationObserver(function () {
      apply();
      if (document.getElementById('acting-note')) obs.disconnect();
    });
    obs.observe(document.documentElement, { childList: true, subtree: true });
  }
})();
