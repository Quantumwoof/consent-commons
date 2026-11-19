// Static build: copies the web app, the shared core, i18n and schemas into dist/. No bundler, no framework.
import pagesEn from '../src/i18n/pages/en.js';
import { cpSync, rmSync, mkdirSync, readFileSync, writeFileSync, readdirSync } from 'node:fs';

const CHROME = (active) => `<div class="synthetic-banner" role="note" data-i18n-html="banner_html"><strong>SYNTHETIC DEMO</strong> · no real people or health data · independent prototype, not an SRHIN or Mozilla product</div>
<header class="topnav"><div class="inner">
  <a class="brand" href="/"><span class="logo" aria-hidden="true">✓</span>Consent Commons</a>
  <nav aria-label="Main" data-i18n-attr="aria-label:nav_label">${[['home', '/', 'Overview'], ['chat', '/chat.html', 'Consent chat'], ['review', '/review.html', 'Access review'], ['ledger', '/ledger.html', 'Ledger'], ['ussd', '/ussd.html', 'USSD (no data)']]
    .map(([k, href, label]) => `<a href="${href}"${k === active ? ' aria-current="page"' : ''} data-i18n="nav_${k}">${label}</a>`).join('')}<a href="https://github.com/Quantumwoof/consent-commons">GitHub</a></nav>
  <select class="cc-lang nav-lang" aria-label="Language" data-i18n-attr="aria-label:nav_lang"><option value="en">English</option><option value="pcm">Pidgin</option><option value="yo">Yorùbá</option></select>
</div></header>
<script type="module" src="/js/lang.js"></script>`;

rmSync('dist', { recursive: true, force: true });
mkdirSync('dist', { recursive: true });
cpSync('web', 'dist', { recursive: true });
cpSync('src', 'dist/src', { recursive: true });
cpSync('schema', 'dist/schema', { recursive: true });
for (const f of readdirSync('dist').filter((f) => f.endsWith('.html'))) {
  const p = `dist/${f}`;
  const esc = (t) => t.replace(/&/g, '&amp;').replace(/</g, '&lt;');
  const html = readFileSync(p, 'utf8').replace(/<!--CHROME:(\w+)-->/, (_, a) => CHROME(a))
    // English first paint for [data-i18n] / [data-i18n-html]; web/js/lang.js swaps in the chosen language.
    .replace(/(<(\w+)\b[^>]*\sdata-i18n(-html)?="(\w+)"[^>]*>)([\s\S]*?)(<\/\2>)/g, (m, open, tag, isHtml, key, _inner, close) =>
      (pagesEn[key] == null ? m : open + (isHtml ? pagesEn[key] : esc(pagesEn[key])) + close));
  writeFileSync(p, html);
}
console.log('built dist/');
