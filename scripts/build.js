// Static build: copies the web app, the shared core, i18n and schemas into dist/. No bundler, no framework.
import pagesEn from '../src/i18n/pages/en.js';
import { PAGES, ROLES, roleBar, tabBar } from '../web/js/roles.js';
import { cpSync, rmSync, mkdirSync, readFileSync, writeFileSync, readdirSync } from 'node:fs';

// App shell written into every page: a one-line demo notice, a header (back, app name, language), the
// role strip saying whose view this is, and the phone tab bar for that role (see web/js/roles.js).
const LANG_SELECT = `<select class="cc-lang nav-lang" aria-label="Language" data-i18n-attr="aria-label:nav_lang"><option value="en">English</option><option value="pcm">Pidgin</option><option value="yo">Yorùbá</option></select>`;
const CHROME = (page) => {
  const p = PAGES[page] ?? PAGES.home;
  return `<div class="synthetic-banner" role="note" data-i18n-html="banner_short_html"><strong>DEMO</strong> · made-up data only · not an SRHIN or Mozilla product</div>
<header class="apphdr"><div class="inner">
  ${p.back ? `<a class="back" id="app-back" href="${p.back}" aria-label="Back" data-i18n-attr="aria-label:app_back"><span aria-hidden="true">‹</span></a>` : ''}
  <a class="brand" href="/"><span class="logo" aria-hidden="true">✓</span><span>Consent Commons</span></a>
  ${p.noLang ? '' : LANG_SELECT}
</div>${p.role ? roleBar(p.role) : ''}</header>
${p.role ? tabBar(p.role, p.tab) : ''}
<script type="module" src="/js/lang.js"></script>`;
};

rmSync('dist', { recursive: true, force: true });
mkdirSync('dist', { recursive: true });
cpSync('web', 'dist', { recursive: true });
cpSync('src', 'dist/src', { recursive: true });
cpSync('schema', 'dist/schema', { recursive: true });
for (const f of readdirSync('dist').filter((f) => f.endsWith('.html'))) {
  const p = `dist/${f}`;
  const esc = (t) => t.replace(/&/g, '&amp;').replace(/</g, '&lt;');
  const raw = readFileSync(p, 'utf8');
  const html = raw.replace(/<!--CHROME:(\w+)-->/, (_, a) => CHROME(a))
    .replace('<body>', () => { const k = /<!--CHROME:(\w+)-->/.exec(raw)?.[1]; const r = PAGES[k]?.role; return `<body class="page-${k ?? 'plain'}${r ? ' role-page as-' + r : ''}${r && ROLES[r].tabs.length ? ' has-tabbar' : ''}">`; })
    // English first paint for [data-i18n] / [data-i18n-html]; web/js/lang.js swaps in the chosen language.
    .replace(/(<(\w+)\b[^>]*\sdata-i18n(-html)?="(\w+)"[^>]*>)([\s\S]*?)(<\/\2>)/g, (m, open, tag, isHtml, key, _inner, close) =>
      (pagesEn[key] == null ? m : open + (isHtml ? pagesEn[key] : esc(pagesEn[key])) + close));
  writeFileSync(p, html);
}
console.log('built dist/');
