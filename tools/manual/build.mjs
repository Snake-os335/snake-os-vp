// Snake OS · Manual: genera los PDF (ES y EN) a partir de content-*.mjs + capturas reales, con Chrome (print-to-PDF).
// Uso: node tools/manual/build.mjs --shots /tmp/manual-shots --out /tmp/manual-pdf [--lang es,en] [--no-data]
//  - Dos pasadas: la 1.ª mide en qué página empieza cada capítulo (pdftotext, de poppler-utils) y la 2.ª escribe el índice.
//  - Escribe assets/snake-manual-<lang>.pdf.js (PDF en base64) salvo con --no-data: la lista blanca de /static no sirve .pdf.
import { chromium } from 'playwright-core';
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath, pathToFileURL } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO = path.resolve(HERE, '..', '..');
const arg = (k, d) => { const i = process.argv.indexOf('--' + k); return i > 0 ? process.argv[i + 1] : d; };
const SHOTS = path.resolve(arg('shots', '/tmp/manual-shots'));
const OUT = path.resolve(arg('out', '/tmp/manual-pdf'));
const LANGS = arg('lang', 'es,en').split(',');
const CHROME = arg('chrome', process.env.CHROME || '/usr/bin/google-chrome');
const WRITE_DATA = !process.argv.includes('--no-data');
fs.mkdirSync(OUT, { recursive: true });

const indexHtml = fs.readFileSync(path.join(REPO, 'index.html'), 'utf8');
const VERSION = (indexHtml.match(/SNAKE_OS_VERSION='([^']+)'/) || [])[1] || '';
const A = (f) => pathToFileURL(path.join(REPO, 'assets', f)).href;

const esc = (s) => String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const md = (s) => esc(s).replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>').replace(/`([^`]+)`/g, '<kbd>$1</kbd>');
function emojiImg(e, cls) {
  const cps = [...e].map((c) => c.codePointAt(0).toString(16));
  for (const name of [cps.join('-'), cps.filter((c) => c !== 'fe0f').join('-')]) {
    const f = path.join(REPO, 'assets', 'snk-emoji-' + name + '.svg');
    if (fs.existsSync(f)) return `<img class="${cls}" src="${pathToFileURL(f).href}" alt="">`;
  }
  return `<span class="${cls} emo">${e}</span>`;
}
const QUALITY = Number(arg('quality', '0.74'));
const optimized = new Map(); // ruta original -> ruta optimizada (la rellena optimizeShots)
function shotUrl(lang, name) {
  let f = path.join(SHOTS, lang, name + '.jpg');
  if (optimized.has(f)) f = optimized.get(f);
  else if (fs.existsSync(f)) console.warn(`[${lang}] sin optimizar: ${name}`);
  if (!fs.existsSync(f)) { console.warn(`[${lang}] falta la captura ${name}`); return null; }
  return pathToFileURL(f).href;
}
function fig(lang, name, cap, cls = '') {
  const u = shotUrl(lang, name); if (!u) return '';
  return `<figure class="${cls}"><img src="${u}" alt=""><figcaption>${md(cap || '')}</figcaption></figure>`;
}

function render(C, pages) {
  const lang = C.lang;
  let toc = '', body = '';
  C.chapters.forEach((ch, i) => {
    const n = i + 1;
    toc += `<li><span class="tn">${n}</span>${emojiImg(ch.ico, 'ti')}<span class="tt">${esc(ch.title)}</span><span class="dots"></span><span class="tp">${pages ? pages[ch.id] || '' : '00'}</span></li>`;
    let h = `<section class="chapter" id="ch-${ch.id}"><span class="mk">@@CH-${ch.id}@@</span>` +
      `<header class="ch-head"><div class="ch-num">${n < 10 ? '0' + n : n}</div><div class="ch-ico">${emojiImg(ch.ico, 'ci')}</div><div><h1>${esc(ch.title)}</h1>${ch.intro ? `<p class="lead">${md(ch.intro)}</p>` : ''}</div></header>`;
    for (const s of ch.s) {
      let b = '';
      if (s.h) b += `<h2>${md(s.h)}</h2>`;
      const media = [];
      if (s.img) media.push(fig(lang, s.img, s.cap, s.phone ? 'phone' : s.small ? 'small' : ''));
      let text = '';
      (s.p || []).forEach((p) => { text += `<p>${md(p)}</p>`; });
      if (s.ul) text += '<ul>' + s.ul.map((x) => `<li>${md(x)}</li>`).join('') + '</ul>';
      if ((s.small || s.phone) && media.length) b += `<div class="split${s.phone ? ' ph' : ''}"><div class="txt">${text}</div>${media.join('')}</div>`;
      else b += text + media.join('');
      if (s.imgs) b += `<div class="grid2">` + s.imgs.map((m, k) => fig(lang, m, (s.caps || [])[k])).join('') + `</div>`;
      if (s.cursors) b += `<div class="cursors">` + s.cursors.map(([id, lab]) => `<div class="cur"><div class="cbox"><img src="${A('snk-cur-' + id + '.svg')}" alt=""></div><span>${esc(lab)}</span></div>`).join('') + `</div>`;
      if (s.table) b += `<table class="keys">` + s.table.map(([k, v]) => `<tr><td>${md(k)}</td><td>${md(v)}</td></tr>`).join('') + `</table>`;
      if (s.faq) b += s.faq.map(([q, a]) => `<div class="qa"><div class="q">${emojiImg('❓', 'qi')}${md(q)}</div><div class="a">${md(a)}</div></div>`).join('');
      if (s.tip) b += `<div class="tip">${emojiImg('💡', 'bi')}<div>${md(s.tip)}</div></div>`;
      if (s.warn) b += `<div class="warn">${emojiImg('⚠️', 'bi')}<div>${md(s.warn)}</div></div>`;
      h += `<div class="sec">${b}</div>`;
    }
    body += h + '</section>';
  });
  const coverShot = shotUrl(lang, 'desktop');
  const gen = new Date().toISOString().slice(0, 10);
  return `<!doctype html><html lang="${lang}"><head><meta charset="utf-8"><title>${esc(C.docTitle)}</title><style>
@font-face{font-family:Inter;src:url(${A('fonts/inter-latin-wght-normal.woff2')}) format('woff2');font-weight:100 900}
@font-face{font-family:Inter;src:url(${A('fonts/inter-latin-ext-wght-normal.woff2')}) format('woff2');font-weight:100 900;unicode-range:U+0100-024F,U+1E00-1EFF}
@font-face{font-family:Outfit;src:url(${A('fonts/outfit-latin-wght-normal.woff2')}) format('woff2');font-weight:100 900}
@page{size:A4;margin:16mm 15mm 18mm 15mm;
  @bottom-left{content:"${esc(C.footer)}";font:500 8pt Inter,sans-serif;color:#5b7a68}
  @bottom-right{content:"${esc(C.page)} " counter(page);font:700 8pt Inter,sans-serif;color:#1f9e57}}
@page :first{margin:0;@bottom-left{content:none}@bottom-right{content:none}}
*{box-sizing:border-box}
html{-webkit-print-color-adjust:exact;print-color-adjust:exact}
body{margin:0;font:10pt/1.5 Inter,'Noto Color Emoji',sans-serif;color:#17281f}
.mk{position:absolute;font-size:1pt;color:rgba(255,255,255,0.01)}
.cover{width:210mm;height:297mm;position:relative;overflow:hidden;color:#effff4;page-break-after:always;
  background:radial-gradient(900px 600px at 15% 0%,rgba(52,209,122,.55),transparent 60%),radial-gradient(700px 600px at 100% 100%,rgba(20,120,70,.6),transparent 60%),linear-gradient(160deg,#0d2e1d,#06140c)}
.cover .grid{position:absolute;inset:0;background-image:linear-gradient(rgba(124,252,154,.06) 1px,transparent 1px),linear-gradient(90deg,rgba(124,252,154,.06) 1px,transparent 1px);background-size:9mm 9mm}
.cover .inner{position:absolute;left:18mm;right:18mm;top:24mm}
.cover .logo{width:44mm;height:44mm;border-radius:11mm;background:rgba(0,0,0,.28);border:1px solid rgba(255,255,255,.14);display:grid;place-items:center;box-shadow:0 10mm 25mm rgba(0,0,0,.35)}
.cover .logo img{width:33mm;height:33mm}
.cover .kicker{margin-top:14mm;font:800 13pt Outfit,Inter;letter-spacing:.22em;text-transform:uppercase;color:#7cfc9a}
.cover h1{margin:2mm 0 0;font:900 58pt/1 Outfit,Inter;letter-spacing:-.02em;color:#f3fff6}.cover h1 b{color:#7cfc9a}
.cover .sub{margin-top:6mm;max-width:140mm;font:500 14pt/1.45 Inter;color:rgba(225,250,233,.9)}
.cover .pills{margin-top:8mm;display:flex;gap:3mm}
.cover .pill{padding:2mm 5mm;border-radius:99px;background:rgba(52,209,122,.22);border:1px solid rgba(124,252,154,.4);font:700 10pt Inter;color:#dfffe9}
.cover .shot{position:absolute;left:18mm;right:18mm;bottom:22mm;border-radius:5mm;overflow:hidden;border:1px solid rgba(255,255,255,.2);box-shadow:0 14mm 30mm rgba(0,0,0,.5)}
.cover .shot img{display:block;width:100%}
.cover .foot{position:absolute;left:18mm;right:18mm;bottom:9mm;font:600 9pt Inter;color:rgba(200,240,215,.75);display:flex;justify-content:space-between}
.toc h1{font:900 26pt Outfit,Inter;color:#0d2e1d;margin:0 0 4mm;border-bottom:3px solid #34d17a;padding-bottom:3mm}
.toc ol{list-style:none;margin:0;padding:0}
.toc li{display:flex;align-items:center;gap:3mm;padding:1.5mm 0;border-bottom:1px solid #e3efe7;font-size:11.5pt}
.toc .tn{width:9mm;height:9mm;border-radius:2.5mm;background:#e8f8ee;color:#1f9e57;font:800 10pt Outfit;display:grid;place-items:center}
.toc .ti{width:6mm;height:6mm}
.toc .tt{font-weight:700}
.toc .dots{flex:1;border-bottom:1.5px dotted #b9d6c4;margin:0 2mm;transform:translateY(-1mm)}
.toc .tp{font:800 11pt Outfit;color:#1f9e57;min-width:8mm;text-align:right}
.toc .note{margin-top:8mm;padding:4mm 5mm;border-radius:4mm;background:#f2fbf5;border:1px solid #cdeedb;font-size:9.5pt;color:#355946}
.chapter{break-before:page}
.ch-head{display:flex;gap:5mm;align-items:flex-start;padding:6mm;margin:0 0 5mm;border-radius:6mm;color:#effff4;background:linear-gradient(135deg,#1a5a37,#0a1f13);border-left:2.5mm solid #34d17a}
.ch-num{font:900 30pt/1 Outfit;color:#7cfc9a;opacity:.9}
.ch-ico .ci{width:13mm;height:13mm;display:block}
.ch-ico .emo{font-size:30pt}
.ch-head h1{margin:0;font:900 22pt/1.1 Outfit,Inter;color:#fff}
.ch-head .lead{margin:2mm 0 0;font-size:10.5pt;color:rgba(225,250,233,.9)}
h2{font:800 14pt/1.25 Outfit,Inter;color:#0f5c34;margin:5mm 0 2mm;break-after:avoid}
h2::before{content:"";display:inline-block;width:2.2mm;height:5mm;border-radius:1mm;background:#34d17a;margin-right:2.5mm;vertical-align:-0.6mm}
p{margin:0 0 2.5mm}
ul{margin:0 0 3mm;padding-left:5mm}
li{margin:0 0 1.4mm}
li::marker{color:#1f9e57}
strong{color:#0d3d24}
kbd{font:700 8.5pt ui-monospace,Menlo,monospace;padding:.3mm 1.6mm;border-radius:1.4mm;background:#eef6f1;border:1px solid #c9dfd1;border-bottom-width:2px;color:#17402a;white-space:nowrap}
figure{margin:3mm 0 4mm;break-inside:avoid}
figure img{display:block;max-width:100%;max-height:120mm;margin:0 auto;border-radius:3mm;border:1px solid #c3dccc;outline:1.2mm solid #f0f7f3}
figcaption{margin-top:1.8mm;text-align:center;font-size:8.5pt;color:#5b7a68;font-style:italic}
.split{display:flex;gap:6mm;align-items:flex-start;break-inside:avoid}
.split .txt{flex:1;min-width:0}
.split figure{flex:0 0 72mm;margin-top:0}
.split.ph figure{flex:0 0 42mm}
.split figure img{max-height:110mm}
.grid2{display:grid;grid-template-columns:1fr 1fr;gap:4mm;margin:2mm 0 3mm}
.grid2 figure{margin:0}
.grid2 figure img{max-height:62mm}
.sec{break-inside:auto}
.tip,.warn{display:flex;gap:3mm;align-items:flex-start;padding:3.5mm 4mm;border-radius:4mm;margin:3mm 0;break-inside:avoid}
.tip{background:#eafaf0;border:1px solid #b7e8c9}
.warn{background:#fff6e5;border:1px solid #f3d9a4}
.bi{width:6mm;height:6mm;flex:0 0 6mm}
.cursors{display:grid;grid-template-columns:repeat(6,1fr);gap:3mm;margin:3mm 0 4mm;break-inside:avoid}
.cur{text-align:center;font-size:8pt;color:#355946}
.cbox{height:17mm;border-radius:3mm;background:linear-gradient(135deg,#f3faf6,#e2f2e8);border:1px solid #d3e6da;display:grid;place-items:center;margin-bottom:1.2mm}
.cbox img{width:10mm;height:10mm}
table.keys{width:100%;border-collapse:separate;border-spacing:0;margin:2mm 0 5mm;border:1px solid #d3e6da;border-radius:3mm;overflow:hidden}
table.keys td{padding:2.4mm 3.5mm;border-bottom:1px solid #e3efe7;vertical-align:top}
table.keys tr:nth-child(odd) td{background:#f5fbf7}
table.keys td:first-child{width:62mm;font-weight:700}
.qa{padding:3.2mm 4mm;margin:0 0 3mm;border-radius:4mm;background:#f6fbf8;border:1px solid #dcece2;break-inside:avoid}
.qa .q{font-weight:800;color:#0f5c34;display:flex;gap:2mm;align-items:center;margin-bottom:1mm}
.qa .qi{width:5mm;height:5mm}
.colophon{margin-top:8mm;padding-top:4mm;border-top:1px solid #d3e6da;font-size:8.5pt;color:#5b7a68;display:flex;gap:4mm;align-items:center}
.colophon img{width:12mm;height:12mm}
</style></head><body>
<div class="cover"><div class="grid"></div><div class="inner">
<div class="logo"><img src="${A('snake-os-logo-v2.svg')}" alt=""></div>
<div class="kicker">${esc(C.cover.kicker)}</div><h1>${esc(C.cover.title).replace(/!$/, '<b>!</b>')}</h1><div class="sub">${esc(C.cover.sub)}</div>
<div class="pills"><span class="pill">${esc(C.cover.ver)} ${esc(VERSION)}</span><span class="pill">${lang === 'en' ? 'English' : 'Español'}</span></div></div>
${coverShot ? `<div class="shot"><img src="${coverShot}" alt=""></div>` : ''}
<div class="foot"><span>${esc(C.cover.powered)}</span><span>snake-os-vp.softportweb.com</span></div></div>
<section class="toc"><h1>${esc(C.tocTitle)}</h1><ol>${toc}</ol>
<div class="note">${md(C.chapters[0].s[1].tip || '')}</div></section>
${body}
<div class="colophon"><img src="${A('snake-os-logo-v2.svg')}" alt=""><div>Snake OS! ${esc(VERSION)} · ${esc(C.cover.powered)} · ${lang === 'en' ? 'Screenshots taken from a real Snake OS with a test account.' : 'Capturas reales de Snake OS hechas con una cuenta de prueba.'} · ${gen}</div></div>
</body></html>`;
}

function chapterPages(pdf, ids) {
  const n = Number((execFileSync('pdfinfo', [pdf]).toString().match(/Pages:\s+(\d+)/) || [])[1] || 0);
  const out = {};
  for (let p = 1; p <= n; p++) {
    const t = execFileSync('pdftotext', ['-f', String(p), '-l', String(p), pdf, '-']).toString();
    for (const id of ids) if (!out[id] && t.includes('@@CH-' + id + '@@')) out[id] = p;
  }
  return { pages: out, count: n };
}

const browser = await chromium.launch({ executablePath: CHROME, headless: true });
const page = await browser.newPage();
const summary = [];
async function optimizeShots(lang) {
  const src = path.join(SHOTS, lang), dst = path.join(OUT, 'img-' + lang);
  fs.mkdirSync(dst, { recursive: true });
  for (const f of fs.readdirSync(src).filter((x) => x.endsWith('.jpg'))) {
    const b64 = fs.readFileSync(path.join(src, f)).toString('base64');
    const out = await page.evaluate(async ([b, q]) => {
      const im = new Image(); im.src = 'data:image/jpeg;base64,' + b; await im.decode();
      const w = Math.min(im.naturalWidth, 1366), h = Math.round(im.naturalHeight * w / im.naturalWidth);
      const c = document.createElement('canvas'); c.width = w; c.height = h; c.getContext('2d').drawImage(im, 0, 0, w, h);
      return c.toDataURL('image/jpeg', q).split(',')[1];
    }, [b64, QUALITY]);
    const buf = Buffer.from(out, 'base64');
    const target = path.join(dst, f), orig = path.join(src, f);
    fs.writeFileSync(target, buf.length < fs.statSync(orig).size ? buf : fs.readFileSync(orig));
    optimized.set(orig, target);
  }
}
for (const lang of LANGS) {
  const C = (await import(pathToFileURL(path.join(HERE, `content-${lang}.mjs`)).href)).default;
  const pdf = path.join(OUT, lang === 'en' ? 'Snake-OS-User-Manual.pdf' : 'Manual-de-instrucciones-Snake-OS.pdf');
  const htmlFile = path.join(OUT, `manual-${lang}.html`);
  await page.goto('about:blank'); await optimizeShots(lang);
  let pages = null;
  for (let pass = 1; pass <= 2; pass++) {
    fs.writeFileSync(htmlFile, render(C, pages));
    await page.goto(pathToFileURL(htmlFile).href, { waitUntil: 'load' });
    await page.evaluate(() => document.fonts.ready);
    await page.waitForTimeout(400);
    await page.pdf({ path: pdf, format: 'A4', printBackground: true, preferCSSPageSize: true, tagged: true, outline: true });
    if (pass === 1) pages = chapterPages(pdf, C.chapters.map((c) => c.id)).pages;
  }
  const info = chapterPages(pdf, []);
  const size = fs.statSync(pdf).size;
  summary.push({ lang, pdf, pages: info.count, size });
  if (WRITE_DATA) {
    const b64 = fs.readFileSync(pdf).toString('base64');
    const js = `/* Snake OS · Manual de instrucciones (${lang.toUpperCase()}, Snake OS ${VERSION}) en PDF, base64. Generado por tools/manual/build.mjs; lo descarga snake-manual.js. */\nwindow.__snkManualPdf=window.__snkManualPdf||{};window.__snkManualPdf.${lang}="${b64}";\n`;
    fs.writeFileSync(path.join(REPO, 'assets', `snake-manual-${lang}.pdf.js`), js);
  }
  console.log(`[${lang}] ${pdf} · ${info.count} páginas · ${(size / 1048576).toFixed(2)} MB · capítulos`, JSON.stringify(pages));
}
await browser.close();
fs.writeFileSync(path.join(OUT, 'summary.json'), JSON.stringify(summary, null, 1));
