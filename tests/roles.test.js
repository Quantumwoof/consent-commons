// The app shell: every page says whose view it is (community member, researcher, review panel, or public
// audit) with a colour, a shape AND a text label, and every new role string exists in all three languages.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { LOCALES } from '../src/i18n/index.js';
import { ROLES, PAGES, roleBar, tabBar } from '../web/js/roles.js';

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
