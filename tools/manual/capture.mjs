// Snake OS · Manual: capturas reales con Chrome sin ventana (headless) y una cuenta de PRUEBA nueva.
// Uso: node tools/manual/capture.mjs --base http://127.0.0.1:8899 --lang es --out /tmp/manual-shots/es
// Arranca Snake OS en local con una carpeta data/ vacía (nunca contra datos reales). Ver README.md.
import { chromium } from 'playwright-core';
import fs from 'node:fs';
import path from 'node:path';

const arg = (k, d) => { const i = process.argv.indexOf('--' + k); return i > 0 ? process.argv[i + 1] : d; };
const BASE = arg('base', 'http://127.0.0.1:8899');
const LANG = arg('lang', 'es') === 'en' ? 'en' : 'es';
const OUT = arg('out', `/tmp/manual-shots/${LANG}`);
const CHROME = arg('chrome', process.env.CHROME || '/usr/bin/google-chrome');
const ONLY = (arg('only', '') || '').split(',').filter(Boolean);
fs.mkdirSync(OUT, { recursive: true });
const stamp = Date.now().toString(36);
const EMAIL = arg('email', `manual.prueba.${LANG}.${stamp}@dogaemail.com`);
const PASS = 'PruebaManual-' + stamp;
const NAME = LANG === 'en' ? 'Alex Test' : 'Alex Prueba';
const W = 1366, H = 800;

const browser = await chromium.launch({ executablePath: CHROME, headless: true, args: ['--mute-audio', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const ctx = await browser.newContext({ viewport: { width: W, height: H }, deviceScaleFactor: 1, locale: LANG === 'en' ? 'en-US' : 'es-ES', timezoneId: 'Europe/Madrid', acceptDownloads: true });
await ctx.addInitScript((l) => { try { localStorage.setItem('snkLangManual', l); } catch (e) {} }, LANG);
const pg = await ctx.newPage();
pg.on('pageerror', (e) => console.log('[pageerror]', String(e).slice(0, 160)));
const wait = (ms) => pg.waitForTimeout(ms);
const js = (fn, a) => pg.evaluate(fn, a);
const want = (n) => !ONLY.length || ONLY.includes(n);
const saved = [];
async function shot(name, opts = {}) {
  if (!want(name)) return;
  const file = path.join(OUT, name + '.jpg');
  const o = { path: file, type: 'jpeg', quality: opts.quality || 82 };
  if (opts.clip) o.clip = opts.clip;
  await pg.screenshot(o);
  saved.push(name);
  console.log('shot', name);
}
async function clipOf(sel, pad = 14) {
  const r = await js((s) => { const e = typeof s === 'string' ? [...document.querySelectorAll(s)].filter((x) => x.offsetParent || getComputedStyle(x).position === 'fixed').pop() : null; if (!e) return null; const b = e.getBoundingClientRect(); return { x: b.left, y: b.top, w: b.width, h: b.height }; }, sel);
  if (!r) return undefined;
  const x = Math.max(0, Math.floor(r.x - pad)), y = Math.max(0, Math.floor(r.y - pad));
  return { x, y, width: Math.min(W - x, Math.ceil(r.w + pad * 2)), height: Math.min(H - y, Math.ceil(r.h + pad * 2)) };
}
async function closeAll() { await js(() => { try { closeAllApps(); } catch (e) {} document.querySelectorAll('#snkCtxMenu.open').forEach((m) => m.classList.remove('open')); }); await wait(500); }
async function openApp(id, ms = 3200) { await closeAll(); await js((i) => openApp(i), id); await wait(ms); }
async function winShot(name, pad = 16) { await shot(name, { clip: await clipOf('#windows > .app-window', pad) }); }
async function maximize() { await js(() => { const w = [...document.querySelectorAll('#windows > .app-window')].pop(); const b = w && w.querySelector('.win-max, [data-act="max"], .win-btn.max, button[title*="axim"]'); if (b) b.click(); else if (w) w.querySelector('.win-titlebar').dispatchEvent(new MouseEvent('dblclick', { bubbles: true })); }); await wait(900); }

// 1. Inicio de sesión y cuenta nueva
await pg.goto(BASE + '/', { waitUntil: 'networkidle' });
await wait(2500);
await shot('login');
await js(() => document.getElementById('goToSignup').click());
await wait(600);
await pg.fill('#signup_name', NAME);
await pg.fill('#signup_email', EMAIL);
await js(() => { const a = document.querySelectorAll('#avatarGrid > *'); if (a[6]) a[6].click(); });
await pg.fill('#signup_password', PASS);
await pg.fill('#signup_password2', PASS);
await shot('signup');
await js(() => document.querySelector('#signupForm button[type=submit]').click());
await pg.waitForSelector('#osWelcome:not(.hidden)', { timeout: 30000 });
await wait(1500);
await shot('welcome');
await js(() => document.getElementById('osWelcomeStart').click());
await wait(1500);
await js(() => document.getElementById('osTutorialNext') && document.getElementById('osTutorialNext').click());
await wait(1500);
await shot('tutorial');
await js(() => document.getElementById('osTutorialSkip') && document.getElementById('osTutorialSkip').click());
await wait(1500);
await shot('finish-install');
await js(() => document.querySelector('.os-finish-install').click());
await pg.waitForSelector('.osx-modal [data-no]', { timeout: 30000 });
await wait(1200);
await shot('kids-ask');
await js(() => document.querySelector('.osx-modal [data-no]').click());
await pg.waitForSelector('#snkManualAsk', { timeout: 30000 });
await wait(900);
await shot('manual-ask');
await js(() => document.querySelector('#snkManualAsk [data-no]').click());
await wait(800);

// 2. Fondo tranquilo para las capturas y tema claro automático
await js(() => { const b = document.querySelector('#wpWallpapers [data-wp="snake-minimal"], #wpWallpapers [title="Minimal"]'); document.getElementById('tbWpBtn').click(); setTimeout(() => { const x = [...document.querySelectorAll('#wpWallpapers > *')].find((e) => /Minimal/.test(e.title || e.textContent)); if (x) x.click(); }, 300); });
await wait(1200);
await shot('wallpaper', { clip: await clipOf('#wpPanel', 12) });
await js(() => document.getElementById('tbWpBtn').click());
await pg.keyboard.press('Escape');
await wait(900);
await closeAll();
await shot('desktop');

// 3. Inicio, ajustes rápidos, menú contextual, notificaciones
await js(() => document.getElementById('startBtn').click());
await wait(900);
await shot('start');
await js(() => { const b = document.querySelector('#sm11 [data-more]'); if (b) b.click(); });
await wait(900);
await shot('start-classic');
await pg.keyboard.press('Escape'); await js(() => document.getElementById('startMenu').classList.remove('open'));
await wait(400);
await js(() => document.getElementById('tbQsBtn').click());
await wait(900);
await shot('quick', { clip: await clipOf('#qsPanel', 12) });
await js(() => document.getElementById('tbQsBtn').click());
await pg.keyboard.press('Escape');
await wait(500);
await pg.mouse.click(700, 420, { button: 'right' });
await wait(700);
await shot('context', { clip: await clipOf('#snkCtxMenu', 60) });
await pg.keyboard.press('Escape'); await closeAll();
await js(() => { const b = document.querySelector('.notif-btn'); if (b) b.click(); });
await wait(900);
await shot('notifications', { clip: await clipOf('.notif-panel', 12) });
await js(() => { const b = document.querySelector('.notif-btn'); if (b) b.click(); });
await wait(500);

// 4. Ventanas: dos apps abiertas
await closeAll();
await js(() => { openApp('notes'); });
await wait(1200);
await js(() => { openApp('calc'); });
await wait(1500);
await js(() => { const n = document.getElementById('win-notes'), c = document.getElementById('win-calc'); if (n) { n.style.left = '120px'; n.style.top = '150px'; } if (c) { c.style.left = '620px'; c.style.top = '120px'; } });
await wait(600);
await shot('windows');
await closeAll();

// 5. Ajustes, sección por sección
await openApp('ajustes', 2500);
await maximize();
for (const sec of ['apariencia', 'pantalla', 'salvapantallas', 'trabajo', 'kids', 'sonido', 'notificaciones', 'rendimiento', 'escritorio', 'accesibilidad', 'ia', 'cuenta', 'almacenamiento', 'atajos', 'acerca']) {
  if (!want('settings-' + sec)) continue;
  await js((s) => { const b = document.querySelector('.snk4a-set-nav button[data-sec="' + s + '"]'); if (b) b.click(); }, sec);
  await wait(1400);
  await shot('settings-' + sec);
}
await closeAll();

// 6. Modo trabajo, salvapantallas, Snakemoji (tecla S)
await js(() => window.snkOsx && window.snkOsx.setWork(true));
await wait(2500);
await shot('workmode');
await js(() => window.snkOsx && window.snkOsx.setWork(false));
await wait(1500);
await js(() => window.snkScreensaver && window.snkScreensaver.show(true));
await wait(2500);
await shot('screensaver');
await js(() => window.snkScreensaver && window.snkScreensaver.hide());
await wait(1200);
await closeAll();
await pg.mouse.click(700, 420);
await pg.keyboard.press('s');
await wait(2500);
await winShot('snakemoji');

// 7. Todas las apps
const APPS = ['ai', 'notes', 'games', 'snake', 'calc', 'code', 'explorer', 'trash', 'browser', 'profile', 'cloud', 'chat', 'desk', 'doganiero-tv', 'terminal', 'prism', 'maps', 'phone', 'bluetooth', 'calendario', 'capturas', 'about', 'dbots'];
for (const id of APPS) {
  if (!want('app-' + id)) continue;
  await openApp(id, id === 'maps' || id === 'browser' ? 5000 : 3000);
  await winShot('app-' + id);
}
for (const id of ['store', 'metaverse', 'snake-racing', 'los-snakes', 'maquinas-virtuales']) {
  if (!want('app-' + id)) continue;
  await openApp(id, id === 'metaverse' ? 9000 : 3500);
  await maximize();
  await wait(id === 'metaverse' ? 4000 : 1500);
  await shot('app-' + id);
}
// Los Snakes: crear la familia de ejemplo y ver la casa
if (want('app-los-snakes-house')) {
  await openApp('los-snakes', 3000);
  await maximize();
  await js(() => { const b = [...document.querySelectorAll('.app-window button')].find((x) => /Empezar|Crear familia|Start|Create family|¡A vivir!|Jugar/i.test(x.textContent)); if (b) b.click(); });
  await wait(7000);
  await shot('app-los-snakes-house');
}
// Máquinas virtuales: configurar y arrancar el escritorio estilo Ubuntu 26.10 en el perfil de prueba
if (want('app-vm-pro')) {
  await openApp('maquinas-virtuales', 3000);
  await maximize();
  await js(() => { const b = document.querySelector('.app-window .snkvm-card') || [...document.querySelectorAll('.app-window button')].find((x) => /Abrir|Arrancar|Start|Open/i.test(x.textContent)); if (b) b.click(); });
  await pg.waitForSelector('.app-window .ubx-init .go', { timeout: 90000 }).catch(() => null);
  await js(() => { const g = document.querySelector('.app-window .ubx-init .go'); if (g) g.click(); });
  await wait(20000);
  await shot('app-vm-pro');
}
// Modo teléfono (390 px)
if (want('phone-mode')) {
  await closeAll();
  await pg.setViewportSize({ width: 390, height: 844 });
  await wait(2500);
  await shot('phone-mode');
  await pg.setViewportSize({ width: W, height: H });
  await wait(1500);
}
// Pantalla de bloqueo/apagado
if (want('poweroff')) {
  await closeAll();
  await js(() => { const p = document.querySelector('#startMenu .start-item.poweroff'); if (p) p.click(); });
  await wait(6000);
  await shot('poweroff');
}
fs.writeFileSync(path.join(OUT, 'account.json'), JSON.stringify({ email: EMAIL, lang: LANG, shots: saved }, null, 1));
await browser.close();
console.log('OK', saved.length, 'capturas en', OUT);
