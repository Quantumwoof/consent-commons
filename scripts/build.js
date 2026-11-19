// Static build: copies the web app, the shared core, i18n and schemas into dist/. No bundler, no framework.
import { cpSync, rmSync, mkdirSync, readFileSync, writeFileSync, readdirSync } from 'node:fs';

const CHROME = (active) => `<div class="synthetic-banner" role="note"><strong>SYNTHETIC DEMO</strong> · no real people or health data · independent prototype, not an SRHIN or Mozilla product</div>
<header class="topnav"><div class="inner">
  <a class="brand" href="/"><span class="logo" aria-hidden="true">✓</span>Consent Commons</a>
  <nav aria-label="Main">${[['home', '/', 'Overview'], ['chat', '/chat.html', 'Consent chat'], ['review', '/review.html', 'Access review'], ['ledger', '/ledger.html', 'Ledger'], ['ussd', '/ussd.html', 'USSD'], ['gh', 'https://github.com/Quantumwoof/consent-commons', 'GitHub']]
    .map(([k, href, label]) => `<a href="${href}"${k === active ? ' aria-current="page"' : ''}>${label}</a>`).join('')}</nav>
</div></header>`;

rmSync('dist', { recursive: true, force: true });
mkdirSync('dist', { recursive: true });
cpSync('web', 'dist', { recursive: true });
cpSync('src', 'dist/src', { recursive: true });
cpSync('schema', 'dist/schema', { recursive: true });
for (const f of readdirSync('dist').filter((f) => f.endsWith('.html'))) {
  const p = `dist/${f}`;
  writeFileSync(p, readFileSync(p, 'utf8').replace(/<!--CHROME:(\w+)-->/, (_, a) => CHROME(a)));
}
console.log('built dist/');
