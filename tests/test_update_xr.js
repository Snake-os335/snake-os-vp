#!/usr/bin/env node
/* Test de la pantalla de actualización (snake-update-screen.js) con el visor puesto.
 *
 *   node tests/test_update_xr.js        (desde la raíz del repo)
 *
 * Comprueba, sin gafas:
 *   1. la nueva versión se detecta con /api/status (version = commit + firma)
 *   2. con una sesión de VR/realidad mixta en marcha (window.__snkXrBusy) NO se
 *      recarga la página en mitad de la partida
 *   3. en cuanto el jugador sale del visor (__snkXrBusy se apaga), se instala
 *   4. sin visor se recarga como siempre
 *   5. el aviso dice que la versión se instalará al salir del visor
 */
'use strict';

const fs = require('fs');
const path = require('path');
const vm = require('vm');

let fails = 0;
function ok(cond, msg) {
  if (cond) { console.log('  ok  ' + msg); return; }
  fails++;
  console.error('  FAIL ' + msg);
}

const file = path.join(__dirname, '..', 'snake-update-screen.js');
if (!fs.existsSync(file)) {
  console.error('no encuentro snake-update-screen.js');
  process.exit(1);
}
const code = fs.readFileSync(file, 'utf8');

/* ---- DOM mínimo: lo que usa la pantalla de actualización --------------- */
function el(tag) {
  return {
    tagName: String(tag || 'div').toUpperCase(),
    style: {}, id: '', className: '', textContent: '', children: [],
    _html: '', _q: null, parentNode: null,
    set innerHTML(v) { this._html = String(v); },
    get innerHTML() { return this._html; },
    setAttribute() {}, getAttribute() { return null; },
    attachShadow() { this._shadow = el('div'); return this._shadow; },
    appendChild(c) { this.children.push(c); if (c) c.parentNode = this; return c; },
    removeChild(c) { return c; },
    remove() {
      const p = this.parentNode;
      if (!p) return;
      const i = p.children.indexOf(this);
      if (i !== -1) p.children.splice(i, 1);
    },
    contains(o) { return this.children.indexOf(o) !== -1; },
    querySelector(sel) {
      if (!this._q) this._q = {};
      if (!this._q[sel]) this._q[sel] = el('div');
      return this._q[sel];
    },
    querySelectorAll() { return []; },
    addEventListener() {},
    classList: { add() {}, remove() {}, toggle() {}, contains() { return false; } },
    getContext() { return null; }
  };
}

/* ---- temporizadores de mentira: se disparan cuando el test quiere ----- */
const timeouts = [];
const intervals = [];
let tId = 0;
function runTimeouts() {
  while (timeouts.length) {
    const t = timeouts.shift();
    try { t.fn(); } catch (e) { console.error('  FAIL temporizador: ' + e.message); fails++; }
  }
}

const store = {};
let reloads = 0;
let served = 'abcdef0-11112222';
const sandbox = {
  console: console,
  Math: Math,
  Promise: Promise,
  Date: Date,
  JSON: JSON,
  setTimeout(fn, ms) { timeouts.push({ fn, ms, id: ++tId }); return tId; },
  clearTimeout(id) { const i = timeouts.findIndex((t) => t.id === id); if (i !== -1) timeouts.splice(i, 1); },
  setInterval(fn, ms) { intervals.push({ fn, ms, id: ++tId }); return tId; },
  clearInterval(id) { const i = intervals.findIndex((t) => t.id === id); if (i !== -1) intervals.splice(i, 1); },
  localStorage: {
    getItem(k) { return Object.prototype.hasOwnProperty.call(store, k) ? store[k] : null; },
    setItem(k, v) { store[k] = String(v); }
  },
  location: { reload() { reloads++; }, href: '/' },
  addEventListener() {},
  removeEventListener() {},
  fetch: () => Promise.resolve({ ok: true, json: () => Promise.resolve({ updating: false, version: served }) }),
  document: {
    readyState: 'complete',
    hidden: false,
    body: el('body'),
    createElement(tag) { return el(tag); },
    getElementById() { return null; },
    addEventListener() {}
  }
};
sandbox.window = sandbox;
sandbox.globalThis = sandbox;

try {
  vm.createContext(sandbox);
  vm.runInContext(code, sandbox, { filename: 'snake-update-screen.js', timeout: 5000 });
} catch (e) {
  console.error('  FAIL el módulo no evalúa: ' + e.message);
  process.exit(1);
}

const tick = () => new Promise((r) => setImmediate(r));

console.log('1) carga y detección de versión');
const api = sandbox.window.snakeUpdate;
ok(!!api && typeof api.check === 'function' && typeof api.apply === 'function', 'window.snakeUpdate disponible');
ok(typeof sandbox.window.__snkXrBusy === 'undefined', 'sin visor al arrancar (__snkXrBusy sin definir)');

(async function () {
  await tick();
  ok(api.version() === served, 'anota la versión con la que se cargó la página: ' + api.version());

  console.log('\n2) versión nueva con el visor puesto: no se recarga a mitad de la partida');
  sandbox.__snkXrBusy = 1;                       // snake-vr.js lo pone en cada fotograma XR
  served = 'abcdef1-33334444';
  await api.check();
  await tick();
  runTimeouts();
  ok(reloads === 0, 'con el visor puesto NO se recarga: reload=' + reloads);
  ok(api.pending() === served, 'la versión queda pendiente: ' + api.pending());
  ok(api.version() !== served, 'la pestaña sigue en la versión vieja hasta salir del visor');

  console.log('\n3) al salir del visor se instala sola');
  sandbox.__snkXrBusy = 0;
  await api.check();                             // el sondeo la reintenta
  await tick();
  const screenEl = sandbox.document.body.children[0];
  const msgEl = screenEl && screenEl._q && screenEl._q['.su-msg'];
  ok(!!msgEl && /Instalando la versión nueva/.test(msgEl.textContent),
    'fuera del visor avisa de que instala: ' + (msgEl && msgEl.textContent));
  runTimeouts();
  ok(reloads === 1, 'sin visor se instala la versión nueva: reload=' + reloads);

  console.log('\n4) aplicar dos veces no recarga dos veces');
  api.apply();
  runTimeouts();
  ok(reloads === 1, 'una vez aplicada, apply() no relanza la recarga: reload=' + reloads);

  console.log('');
  if (fails) {
    console.error(fails + ' comprobación(es) fallida(s)');
    process.exit(1);
  }
  console.log('todo correcto ✔');
})();
