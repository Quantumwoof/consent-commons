// The app shell: every page says whose view it is (community member, researcher, review panel, or public
// audit) with a colour, a shape AND a text label, and every new role string exists in all three languages.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { LOCALES, tu } from '../src/i18n/index.js';
import { ROLES, PAGES, FROM, roleBar, tabBar, backFor, chromeFor } from '../web/js/roles.js';

const root = new URL('../', import.meta.url);
const read = (p) => readFileSync(new URL(p, root), 'utf8');
const LANGS = Object.keys(LOCALES);
const has = (k) => LANGS.every((l) => typeof LOCALES[l].u[k] === 'string' && LOCALES[l].u[k].trim());

test('every role, tab and role-strip string exists in English, Pidgin and Yoruba', () => {
  for (const r of Object.keys(ROLES)) assert.ok(has('role_' + r), `role_${r}`);
  for (const k of ['role_viewing', 'role_steward', 'app_back', 'banner_short_html', 'rv_from_researcher', 'rv_seat_community', 'rv_seat_other', 'rv_res_note', 'rv_res_title', 'rv_pan_amend_note']) assert.ok(has(k), k);
  for (const { tabs } of Object.values(ROLES)) for (const [, , key] of tabs) assert.ok(has(key), key);
  // Pidgin and Yoruba are drafts, but they must not just repeat the English role names on the launch screen.
  for (const l of ['pcm', 'yo']) assert.notEqual(LOCALES[l].u.launch_who, LOCALES.en.u.launch_who, l);
  assert.notEqual(LOCALES.yo.u.role_community, LOCALES.en.u.role_community);
});

test('every page in web/ has an app shell entry, and role pages map to the right role', () => {
  const pages = readdirSync(new URL('web/', root)).filter((f) => f.endsWith('.html'));
  for (const f of pages) {
    const m = read('web/' + f).match(/<!--CHROME:(\w+)-->/);
    assert.ok(m, `${f} has no CHROME marker`);
    assert.ok(PAGES[m[1]], `${f}: unknown page ${m[1]}`);
  }
  const roleOf = (f) => PAGES[read('web/' + f).match(/<!--CHROME:(\w+)-->/)[1]].role;
  assert.deepEqual(['chat.html', 'ussd.html', 'summary.html', 'community.html'].map(roleOf), ['community', 'community', 'community', 'community']);
  assert.equal(roleOf('review.html'), 'panel');
  assert.equal(roleOf('researcher.html'), 'researcher');
  assert.equal(roleOf('panel.html'), 'panel');
  assert.equal(roleOf('ledger.html'), 'audit');
  assert.equal(roleOf('index.html'), null);
});

test('the role strip and tab bar always carry a text label, not colour alone', () => {
  for (const r of Object.keys(ROLES)) {
    const bar = roleBar(r);
    assert.match(bar, /data-i18n="role_viewing"/);
    assert.match(bar, new RegExp(`data-i18n="role_${r}"`));
    for (const [, href, key] of ROLES[r].tabs) assert.match(tabBar(r), new RegExp(`href="${href.replace(/[?#]/g, '\\$&')}"[^>]*>.*?data-i18n="${key}"`));
  }
  assert.equal(tabBar('audit'), '');
});

test('the launch screen offers the three roles, the ledger and the about page', () => {
  const home = read('web/index.html');
  for (const h of ['/community.html', '/researcher.html', '/panel.html', '/ledger.html', '/about.html']) assert.ok(home.includes(`href="${h}"`), h);
  for (const k of ['role_community', 'role_researcher', 'role_panel', 'launch_who']) assert.ok(home.includes(`data-i18n="${k}"`), k);
  // The long explanation moved to about.html, unchanged.
  const about = read('web/about.html');
  for (const k of ['home_h1', 'home_why_h', 'home_how_h', 'home_is_h', 'home_open_h']) assert.ok(about.includes(`data-i18n="${k}"`), k);
});

test('the build writes the shell into every page with the role strip in English first paint', () => {
  execFileSync(process.execPath, ['scripts/build.js'], { cwd: new URL('.', root) });
  const review = read('dist/review.html');
  assert.match(review, /class="rolebar role-panel"/);
  assert.match(review, /You are viewing as:<\/span> <b class="rb-r" data-i18n="role_panel">Review panel<\/b>/);
  assert.match(read('dist/chat.html'), /data-i18n="role_community">Community member</);
  assert.match(read('dist/ledger.html'), /data-i18n="role_audit">Anyone can audit</);
  assert.match(read('dist/chat.html'), /class="page-chat role-page as-community has-tabbar"/);
  assert.doesNotMatch(read('dist/index.html'), /class="rolebar/);
  assert.ok(existsSync(new URL('dist/js/roles.js', root)));
});

test('English uses one name per role: no leftover "community panel", "Access review" or "Requester"', () => {
  const all = { ...LOCALES.en.u, ...LOCALES.en.s };
  for (const [k, v] of Object.entries(all)) assert.doesNotMatch(v, /community panel|access review|\brequester\b/i, `${k}: ${v}`);
  // Pidgin and Yoruba use the same panel name as the role strip wherever the panel is named on its own.
  for (const k of ['rv_title', 'home_c2_h']) for (const l of ['pcm', 'yo']) assert.equal(LOCALES[l].u[k], LOCALES[l].u.role_panel, `${l}.${k}`);
});

test('back goes one logical step: hubs to start, role pages to their hub, ?from= to where you came from', () => {
  const href = (page, from) => backFor(page, from)?.href ?? null;
  assert.equal(href('home'), null);
  for (const hub of ['community', 'researcher', 'panel', 'about']) assert.equal(href(hub), '/');
  for (const pg of ['chat', 'ussd', 'summary']) assert.equal(href(pg), '/community.html');
  assert.equal(href('review'), '/panel.html');
  assert.equal(href('ledger'), '/');
  // Joshua's two cases: Community member > Check my receipt, Review panel > Audit the ledger
  assert.equal(href('ledger', 'community'), '/community.html');
  assert.equal(href('ledger', 'panel'), '/panel.html');
  assert.equal(href('ledger', 'chat'), '/chat.html');
  assert.equal(href('ledger', 'ussd'), '/ussd.html');
  assert.equal(href('ussd', 'chat'), '/chat.html');
  assert.equal(href('summary', 'releases'), '/review.html#releases');
  assert.equal(href('summary', 'ussd'), '/ussd.html');
  assert.equal(href('researcher', 'researcher'), '/researcher.html');
  for (const pg of ['chat', 'ledger', 'ussd', 'summary']) assert.equal(href(pg, 'about'), '/about.html');
  // unknown or not-allowed ?from= values fall back; nothing can point the button elsewhere
  assert.equal(href('ledger', 'https://evil.example'), '/');
  assert.equal(href('chat', 'panel'), '/community.html');
  for (const f of Object.values(FROM)) assert.match(f.href, /^\/[\w./#-]*$/);
});

test('role context: ledger stays "Anyone can audit" with the tab bar of where you came from; summary takes the opener role', () => {
  assert.deepEqual([backFor('ledger', 'panel').role, backFor('ledger', 'panel').tabRole], ['audit', 'panel']);
  assert.deepEqual([backFor('ledger', 'community').role, backFor('ledger', 'community').tabRole], ['audit', 'community']);
  assert.equal(backFor('ledger').tabRole, 'audit');
  assert.deepEqual([backFor('summary', 'releases').role, backFor('summary', 'releases').tab], ['panel', 'releases']);
  assert.equal(backFor('summary').role, 'community');
});

test('every link into a shared page carries ?from= so back returns there', () => {
  const read2 = (p) => readFileSync(new URL(p, root), 'utf8');
  assert.match(read2('web/community.html'), /href="\/ledger\.html\?from=community#verify-receipt"/);
  assert.match(read2('web/panel.html'), /href="\/ledger\.html\?from=panel"/);
  assert.match(read2('web/js/chat.js'), /\/ledger\.html\?from=chat#verify-receipt/);
  assert.doesNotMatch(read2('web/js/chat.js'), /'\/ussd\.html'/);
  assert.match(read2('web/js/ussd.js'), /\/ledger\.html\?from=ussd/);
  assert.match(read2('web/js/ussd.js'), /&from=ussd/);
  assert.match(read2('web/js/review.js'), /summary\.html\?release=.*&from=releases/);
  for (const pg of ['chat', 'ledger', 'ussd', 'summary']) assert.match(read2('web/about.html'), new RegExp(`href="/${pg}\\.html\\?from=about"`));
  // every value used in a link is one backFor honours for that page
  for (const f of ['web/community.html', 'web/panel.html', 'web/about.html', 'web/chat.html', 'web/js/chat.js', 'web/js/ussd.js', 'web/js/review.js', 'web/js/hub.js']) {
    for (const m of read2(f).matchAll(/\/(\w+)\.html\?(?:[^"'`]*?&)?from=(\w+)/g)) assert.ok(PAGES[m[1]]?.from?.includes(m[2]), `${f}: ${m[1]} from=${m[2]}`);
  }
});

test('tamper lab says it is a simulation and names the check that caught it, in every language', () => {
  for (const l of LANGS) {
    const u = LOCALES[l].u;
    for (const k of ['lg_t_verdict_caught', 'lg_t_verdict_missed', 'lg_t_result_h', 'app_back_to', 'app_start']) assert.ok(u[k], `${l}.${k}`);
    for (const k of ['lg_t_edit_btn', 'lg_t_del_btn', 'lg_t_rw_btn']) assert.match(u[k], /^(Simulate|Make-believe|Àfarawé):/, `${l}.${k}`);
  }
  assert.match(LOCALES.en.u.lg_tamper_p, /dishonest operator/);
  assert.match(LOCALES.en.u.lg_tamper_p, /never touched/);
});

test('chromeFor: review?as=researcher is the researcher view from the first paint; other URL overrides match backFor', () => {
  const r = chromeFor('review', 'as=researcher', '#new');
  assert.equal(r.role, 'researcher');
  assert.equal(r.tabRole, 'researcher');
  assert.equal(r.href, '/researcher.html');
  assert.equal(r.tab, 'new');
  assert.equal(r.titleKey, 'rv_res_title');
  assert.deepEqual(r.tabs, ['new', 'rules']);
  assert.equal(chromeFor('review', 'as=researcher', '#rules').tab, 'rules');
  assert.equal(chromeFor('review', 'as=researcher').tab, 'new');
  assert.equal(chromeFor('review', '', '#releases').role, 'panel');
  assert.equal(chromeFor('review', '', '#releases').tab, 'releases');
  assert.equal(chromeFor('review').href, '/panel.html');
  assert.equal(chromeFor('summary', 'from=releases').role, 'panel');
  assert.equal(chromeFor('summary', 'from=releases').href, '/review.html#releases');
  assert.equal(chromeFor('summary').role, 'community');
  assert.deepEqual([chromeFor('ledger', 'from=community').role, chromeFor('ledger', 'from=community').tabRole], ['audit', 'community']);
  assert.equal(chromeFor('ledger', 'from=community').href, '/community.html');
  assert.equal(chromeFor('home'), null);
  assert.equal(chromeFor('about').href, '/');
});

test('the build puts a classic boot script in <head> so the researcher view does not paint the panel role', () => {
  execFileSync(process.execPath, ['scripts/build.js'], { cwd: new URL('.', root) });
  const review = read('dist/review.html');
  const head = review.slice(0, review.indexOf('</head>'));
  assert.match(head, /<script src="\/js\/boot-role\.js"><\/script>/);
  assert.match(review, /<script src="\/js\/boot-role\.js"><\/script>\s*<script type="module" src="\/js\/lang\.js">/);
  const boot = read('web/js/boot-role.js');
  assert.doesNotMatch(boot, /\bexport\b/);
  assert.match(boot, /as === 'researcher'|get\('as'\) === 'researcher'/);
  assert.match(boot, /data-cc-boot/);
  const css = read('web/css/app.css');
  assert.match(css, /html\[data-cc-boot="researcher"\]/);
  assert.match(css, /\.rolebar\.role-panel/);
  assert.ok(existsSync(new URL('dist/js/boot-role.js', root)));
});

test('back button targets stay the same in English, Pidgin and Yoruba (including at phone width)', () => {
  // The href is not language- or viewport-dependent; the visible label is. At 390px the phone
  // tab bar is shown, but the header back button is the same control and the same target.
  const cases = [
    ['review', 'as=researcher', '/researcher.html', 'role_researcher'],
    ['review', '', '/panel.html', 'role_panel'],
    ['summary', 'from=releases', '/review.html#releases', 'tab_releases_short'],
    ['ledger', 'from=community', '/community.html', 'role_community'],
    ['ledger', 'from=panel', '/panel.html', 'role_panel'],
    ['ussd', 'from=chat', '/chat.html', 'nav_chat'],
    ['community', '', '/', 'app_start'],
  ];
  for (const [page, search, href, label] of cases) {
    const c = chromeFor(page, search);
    assert.equal(c.href, href, page + ' ' + search);
    assert.equal(c.label, label);
    for (const l of LANGS) {
      const text = tu(l, 'app_back_to', { place: LOCALES[l].u[label] });
      assert.ok(text && !text.includes('{place}'), l + ' ' + label + ': ' + text);
      assert.notEqual(LOCALES[l].u[label].trim(), '', l + '.' + label);
    }
    assert.notEqual(tu('pcm', 'app_back_to', { place: LOCALES.pcm.u[label] }), tu('en', 'app_back_to', { place: LOCALES.en.u[label] }));
    assert.notEqual(tu('yo', 'app_back_to', { place: LOCALES.yo.u[label] }), tu('en', 'app_back_to', { place: LOCALES.en.u[label] }));
  }
});
