#!/usr/bin/env node
// Build localized index + solo pages from the English base + i18n/<locale>.json.
// Emits public/<locale>/index.html and public/<locale>/solo.html, injects
// per-page hreflang + a language switcher + runtime dict, rewrites cross-page
// links to stay in-locale, and regenerates a hreflang sitemap.
// Deterministic string replacement only — never rewrites markup/IDs/scripts.
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const en = JSON.parse(readFileSync(join(ROOT, 'i18n/en.json'), 'utf8'));
const ORIGIN = en._meta.origin;
const LOCALES = en._meta.locales;
const HREFLANG = { en: 'en', 'pt-br': 'pt-BR', es: 'es', fr: 'fr', de: 'de', vi: 'vi', th: 'th' };
const SWITCH_LABEL = { en: 'EN', es: 'ES', 'pt-br': 'PT', fr: 'FR', de: 'DE', vi: 'VI', th: 'TH' };
const PAGES = ['index', 'solo'];

// page URL (absolute) and local href, per locale
const pageUrl = (page, l) =>
  page === 'index' ? (l === 'en' ? `${ORIGIN}/` : `${ORIGIN}/${l}/`)
                   : (l === 'en' ? `${ORIGIN}/solo` : `${ORIGIN}/${l}/solo.html`);
const pageHref = (page, l) =>
  page === 'index' ? (l === 'en' ? '/' : `/${l}/`)
                   : (l === 'en' ? '/solo' : `/${l}/solo.html`);

let warnings = 0;
const litReplace = (s, from, to, ctx) => {
  if (!s.includes(from)) { console.warn(`  ⚠ [${ctx}] anchor not found: ${JSON.stringify(from).slice(0, 70)}`); warnings++; return s; }
  return s.split(from).join(to);
};
const esc = (t) => String(t).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const cleanBlocks = (h) => h
  .replace(/\s*<!-- i18n:hreflang:start -->[\s\S]*?<!-- i18n:hreflang:end -->/g, '')
  .replace(/\s*<!-- i18n:switcher:start -->[\s\S]*?<!-- i18n:switcher:end -->/g, '')
  .replace(/\s*<!-- i18n:runtime:start -->[\s\S]*?<!-- i18n:runtime:end -->/g, '');

const hreflangBlock = (page) => {
  const links = LOCALES.map((l) => `  <link rel="alternate" hreflang="${HREFLANG[l]}" href="${pageUrl(page, l)}" />`);
  links.push(`  <link rel="alternate" hreflang="x-default" href="${pageUrl(page, 'en')}" />`);
  return `\n  <!-- i18n:hreflang:start -->\n${links.join('\n')}\n  <!-- i18n:hreflang:end -->`;
};
const switcher = (page, cur) => {
  const items = LOCALES.map((l) => {
    const active = l === cur;
    const style = active ? 'color:#fff;font-weight:700;text-decoration:none;' : 'color:#b8a0ac;text-decoration:none;';
    return `<a href="${pageHref(page, l)}" hreflang="${HREFLANG[l]}"${active ? ' aria-current="true"' : ''} style="${style}">${SWITCH_LABEL[l]}</a>`;
  });
  return `\n<!-- i18n:switcher:start -->\n<nav aria-label="Language" style="position:fixed;top:8px;right:10px;z-index:300;font-size:12px;font-family:system-ui,-apple-system,sans-serif;background:rgba(20,10,20,.9);border:1px solid rgba(244,114,182,.4);border-radius:999px;padding:5px 12px;display:flex;gap:9px;box-shadow:0 2px 10px rgba(0,0,0,.4);">\n  ${items.join('\n  ')}\n</nav>\n<!-- i18n:switcher:end -->`;
};
const runtimeBlock = (runtime, cur) =>
  `<!-- i18n:runtime:start -->\n<script>\ntry{localStorage.setItem('hk_lang',${JSON.stringify(cur)})}catch(e){}\nwindow.__I18N__ = ${JSON.stringify(runtime)};\nwindow.t = function(k, p){ var d = window.__I18N__ || {}; var s = String(k).split('.').reduce(function(o,i){return (o==null)?undefined:o[i];}, d); if (s == null) s = k; if (p) for (var n in p) s = s.split('{'+n+'}').join(p[n]); return s; };\n</script>\n<!-- i18n:runtime:end -->\n`;

const injectCommon = (html, page, cur, runtime, scriptRegex) =>
  html.replace('</head>', `${hreflangBlock(page)}\n</head>`)
      .replace(/(<body[^>]*>)/, `$1${switcher(page, cur)}`)
      .replace(scriptRegex, (m) => `${runtimeBlock(runtime, cur)}    ${m}`);

// ---------- game room (game.html): one file, localized per-player at runtime ----------
// The multiplayer room is reached via /<gameId> (no locale in the URL), so it reads
// the player's stored locale (hk_lang, set by the localized landing) and localizes
// itself from an embedded all-locale dictionary. Two players in different languages
// each see their own language.
function buildRoom(base) {
  const ROOM_ALL = {};
  for (const l of LOCALES) {
    const t = l === 'en' ? en : JSON.parse(readFileSync(join(ROOT, `i18n/${l}.json`), 'utf8'));
    ROOM_ALL[l] = Object.assign({}, t.room.runtime, t.room.static);
  }
  const boot = `<!-- i18n:room:start -->
<script>
(function(){
  var ALL = ${JSON.stringify(ROOM_ALL)};
  var loc = 'en';
  try { var s = localStorage.getItem('hk_lang'); if (s && ALL[s]) loc = s; } catch(e){}
  if (loc === 'en') { var n = (navigator.language||'').toLowerCase(); if (n.indexOf('pt')===0) { if (ALL['pt-br']) loc='pt-br'; } else { var b=n.slice(0,2); if (ALL[b]) loc=b; } }
  window.__I18N__ = ALL[loc] || ALL.en;
  window.t = function(k, p){ var v = (window.__I18N__ && window.__I18N__[k]); if (v == null) v = k; if (p) for (var m in p) v = v.split('{'+m+'}').join(p[m]); return v; };
  document.documentElement.lang = loc;
  document.addEventListener('DOMContentLoaded', function(){
    if (window.__I18N__.title) document.title = window.__I18N__.title;
    document.querySelectorAll('[data-i18n]').forEach(function(el){ el.textContent = window.t(el.getAttribute('data-i18n')); });
  });
})();
</script>
<!-- i18n:room:end -->
`;
  const cleaned = base.replace(/\s*<!-- i18n:room:start -->[\s\S]*?<!-- i18n:room:end -->/g, '');
  return cleaned.replace(/(<script src="\/?name\.js"><\/script>)/, `${boot}    $1`);
}

const faqJsonLd = (faqs) => {
  const obj = { '@context': 'https://schema.org', '@type': 'FAQPage', mainEntity: faqs.map((f) => ({ '@type': 'Question', name: f.q, acceptedAnswer: { '@type': 'Answer', text: f.a } })) };
  return `<script type="application/ld+json">\n    ${JSON.stringify(obj, null, 2)}\n    </script>`;
};
const seoSection = (s) => {
  const li = (a) => a.map((x) => `          <li>${esc(x)}</li>`).join('\n');
  const faqs = s.faqs.map((f) => `          <h4>${esc(f.q)}</h4>\n          <p>${esc(f.a)}</p>`).join('\n');
  return `<section class="seo-content">
      <div class="seo-inner">
        <h2>${esc(s.h2)}</h2>
        <p>${esc(s.intro)}</p>
        <h3 class="seo-h">${esc(s.howToTitle)}</h3>
        <ol class="seo-list">
${li(s.howToSteps)}
        </ol>
        <h3 class="seo-h">${esc(s.featuresTitle)}</h3>
        <ul class="seo-list">
${li(s.features)}
        </ul>
        <h3 class="seo-h">${esc(s.faqTitle)}</h3>
        <div class="seo-faq">
${faqs}
        </div>
      </div>
    </section>`;
};

// ---------- per-page transforms ----------
function buildIndex(base, loc, t) {
  const src = en.index, tr = t.index, sh = t.shared, esrc = en.shared;
  let h = base;
  if (loc !== 'en') {
    h = h.replace(/<html lang="en">/, `<html lang="${loc}">`);
    h = litReplace(h, `<title>${src.title}</title>`, `<title>${tr.title}</title>`, 'index.title');
    h = litReplace(h, src.description, tr.description, 'index.description');
    h = litReplace(h, src.ogTitle, tr.ogTitle, 'index.ogTitle');
    h = litReplace(h, `href="${ORIGIN}/"`, `href="${pageUrl('index', loc)}"`, 'index.canonical');
    h = h.replace(/<script type="application\/ld\+json">\s*\{\s*"@context":\s*"https:\/\/schema\.org",\s*"@type":\s*"FAQPage"[\s\S]*?<\/script>/, faqJsonLd(tr.seo.faqs));
    h = litReplace(h, `<h1>${src.h1}</h1>`, `<h1>${tr.h1}</h1>`, 'index.h1');
    h = litReplace(h, `>${src.tagline}<`, `>${tr.tagline}<`, 'index.tagline');
    h = litReplace(h, `>${src.ui.playVsFriend}<`, `>${tr.ui.playVsFriend}<`, 'index.playVsFriend');
    h = litReplace(h, `>${src.ui.playVsAi}<`, `>${tr.ui.playVsAi}<`, 'index.playVsAi');
    h = litReplace(h, `Playing as <`, `${tr.ui.playingAs} <`, 'index.playingAs');
    h = litReplace(h, `>${src.ui.change}<`, `>${tr.ui.change}<`, 'index.change');
    h = litReplace(h, `>${src.ui.leaderboard}<`, `>${tr.ui.leaderboard}<`, 'index.leaderboard');
    h = litReplace(h, `>${src.ui.loading}<`, `>${tr.ui.loading}<`, 'index.loading');
    h = litReplace(h, `>${esrc.links.allGames}<`, `>${sh.links.allGames}<`, 'links.allGames');
    h = litReplace(h, `>${esrc.links.sourceCode}<`, `>${sh.links.sourceCode}<`, 'links.sourceCode');
    h = litReplace(h, `${esrc.footer.builtBy} <`, `${sh.footer.builtBy} <`, 'footer.builtBy');
    h = litReplace(h, esrc.footer.coffee, sh.footer.coffee, 'footer.coffee');
    h = h.replace(/<section class="seo-content">[\s\S]*?<\/section>/, seoSection(tr.seo));
    // cross-page: Play vs AI -> localized solo
    h = litReplace(h, `window.location.href='/solo'`, `window.location.href='${pageHref('solo', loc)}'`, 'index->solo link');
    // absolute asset paths for subdir
    h = h.replace(/href="style\.css"/g, 'href="/style.css"').replace(/src="name\.js"/g, 'src="/name.js"');
  }
  return injectCommon(h, 'index', loc, t.index.runtime, /<script src="\/?name\.js"><\/script>/);
}

function buildSolo(base, loc, t) {
  const src = en.solo, tr = t.solo, sh = t.shared, esrc = en.shared;
  let h = base;
  if (loc !== 'en') {
    h = h.replace(/<html lang="en">/, `<html lang="${loc}">`);
    h = litReplace(h, `<title>${src.title}</title>`, `<title>${tr.title}</title>`, 'solo.title');
    h = litReplace(h, src.description, tr.description, 'solo.description');
    h = litReplace(h, src.ogTitle, tr.ogTitle, 'solo.ogTitle');
    h = litReplace(h, `href="${ORIGIN}/solo"`, `href="${pageUrl('solo', loc)}"`, 'solo.canonical');
    h = litReplace(h, `<h1>${src.h1}</h1>`, `<h1>${tr.h1}</h1>`, 'solo.h1');
    h = litReplace(h, `>${src.ui.easy}<`, `>${tr.ui.easy}<`, 'solo.easy');
    h = litReplace(h, `>${src.ui.medium}<`, `>${tr.ui.medium}<`, 'solo.medium');
    h = litReplace(h, `>${src.ui.hard}<`, `>${tr.ui.hard}<`, 'solo.hard');
    h = litReplace(h, `>${src.ui.youX} <span`, `>${tr.ui.youX} <span`, 'solo.youX');
    h = litReplace(h, `>${src.ui.aiO} <span`, `>${tr.ui.aiO} <span`, 'solo.aiO');
    h = litReplace(h, `>${en.solo.runtime.yourTurn}</p>`, `>${tr.runtime.yourTurn}</p>`, 'solo.yourTurn(static)');
    h = litReplace(h, `>${src.ui.playAgain}<`, `>${tr.ui.playAgain}<`, 'solo.playAgain');
    h = litReplace(h, `>${esrc.links.vsFriend}<`, `>${sh.links.vsFriend}<`, 'links.vsFriend');
    h = litReplace(h, `>${esrc.links.allGames}<`, `>${sh.links.allGames}<`, 'links.allGames');
    h = litReplace(h, `>${esrc.links.sourceCode}<`, `>${sh.links.sourceCode}<`, 'links.sourceCode');
    h = litReplace(h, `${esrc.footer.builtBy} <`, `${sh.footer.builtBy} <`, 'footer.builtBy');
    h = litReplace(h, esrc.footer.coffee, sh.footer.coffee, 'footer.coffee');
    // cross-page: "vs Friend" href -> localized index
    h = litReplace(h, `<a href="/">`, `<a href="${pageHref('index', loc)}">`, 'solo->index link');
    h = h.replace(/href="style\.css"/g, 'href="/style.css"').replace(/src="solo\.js"/g, 'src="/solo.js"');
  }
  return injectCommon(h, 'solo', loc, t.solo.runtime, /<script src="\/?solo\.js"><\/script>/);
}

// ---------- run ----------
const bases = {
  index: cleanBlocks(readFileSync(join(ROOT, 'public/index.html'), 'utf8')),
  solo: cleanBlocks(readFileSync(join(ROOT, 'public/solo.html'), 'utf8')),
};
const builders = { index: buildIndex, solo: buildSolo };

for (const loc of LOCALES) {
  const t = loc === 'en' ? en : JSON.parse(readFileSync(join(ROOT, `i18n/${loc}.json`), 'utf8'));
  for (const page of PAGES) {
    const out = builders[page](bases[page], loc, t);
    if (loc === 'en') {
      writeFileSync(join(ROOT, `public/${page}.html`), out);
    } else {
      mkdirSync(join(ROOT, `public/${loc}`), { recursive: true });
      writeFileSync(join(ROOT, `public/${loc}/${page}.html`), out);
    }
  }
  console.log(`${loc.padEnd(5)} -> index + solo`);
}

// game room: single game.html, localized per-player at runtime from stored locale
writeFileSync(join(ROOT, 'public/game.html'), buildRoom(readFileSync(join(ROOT, 'public/game.html'), 'utf8')));
console.log('room  -> public/game.html');

// sitemap: index + solo per locale, each with its own hreflang alternates
const today = new Date().toISOString().slice(0, 10);
const altBlock = (page) =>
  LOCALES.map((l) => `    <xhtml:link rel="alternate" hreflang="${HREFLANG[l]}" href="${pageUrl(page, l)}"/>`).join('\n')
  + `\n    <xhtml:link rel="alternate" hreflang="x-default" href="${pageUrl(page, 'en')}"/>`;
const urls = PAGES.flatMap((page) => LOCALES.map((l) => `  <url>
    <loc>${pageUrl(page, l)}</loc>
    <lastmod>${today}</lastmod>
${altBlock(page)}
  </url>`)).join('\n');
writeFileSync(join(ROOT, 'public/sitemap.xml'),
  `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:xhtml="http://www.w3.org/1999/xhtml">\n${urls}\n</urlset>\n`);
console.log('sitemap -> public/sitemap.xml');
console.log(warnings ? `\nDone with ${warnings} anchor warning(s).` : '\nDone. All anchors matched.');
