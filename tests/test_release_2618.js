/* Snake OS 2026.18: Doganiero_Network por perfil y fuera la pantalla «server i9 no está conectada».
 *
 * Qué se comprueba (sin DOM real, el módulo cargado en un sandbox de vm):
 *  - El interruptor se guarda por perfil: localStorage['dogaNetOn:u:<email>'].
 *  - Desconectarte en un perfil NO afecta a otro perfil del mismo navegador.
 *  - Sin sesión se usa 'dogaNetOn:guest'; el formato global antiguo se migra una vez y se borra.
 *  - index.html ya no tiene la vista i9OffView ni el texto del error, ni llama a /api/server-i9/connected.
 *  - main.py ya no devuelve 503 «server i9 no está conectada» en la API.
 *  - Versión 2026.18 en index.html y en snake-network.js.
 */
'use strict';
var fs = require('fs');
var path = require('path');
var vm = require('vm');
var assert = require('assert');
var root = path.join(__dirname, '..');

function fail(msg) { console.error('FAIL', msg); process.exitCode = 1; }
function ok(msg) { console.log('ok', msg); }

/* Contexto mínimo con localStorage de verdad, para ver qué claves se escriben. */
function makeSandbox(store) {
  function El(tag) { this.tagName = tag; this.style = {}; this.children = []; }
  El.prototype.appendChild = function (c) { this.children.push(c); return c; };
  El.prototype.addEventListener = function () {};
  El.prototype.setAttribute = function () {};
  El.prototype.classList = { add: function () {}, remove: function () {}, contains: function () { return false; }, toggle: function () {} };
  var doc = {
    readyState: 'loading',
    hidden: false,
    visibilityState: 'visible',
    addEventListener: function () {},
    removeEventListener: function () {},
    createElement: function (tag) { return new El(tag); },
    getElementById: function () { return null; },
    querySelector: function () { return null; },
    head: new El('head')
  };
  var ctx = {
    console: console, URL: URL, Promise: Promise, Date: Date, Math: Math, JSON: JSON,
    setTimeout: setTimeout, clearTimeout: clearTimeout, setInterval: setInterval, clearInterval: clearInterval,
    AbortController: typeof AbortController === 'function' ? AbortController : undefined,
    localStorage: {
      getItem: function (k) { return Object.prototype.hasOwnProperty.call(store, k) ? store[k] : null; },
      setItem: function (k, v) { store[k] = String(v); },
      removeItem: function (k) { delete store[k]; }
    },
    navigator: {},
    location: { href: 'https://os.example/', origin: 'https://os.example', pathname: '/' },
    document: doc,
    Event: function ClientEvent(t) { this.type = t; },
    CustomEvent: function ClientCustomEvent(t, o) { this.type = t; this.detail = o && o.detail; },
    XMLHttpRequest: function Xhr() { this.readyState = 0; this.status = 0; },
    WebSocket: function NativeWS(url) { this.__native = true; this.url = url; },
    currentUser: null
  };
  ctx.fetch = function (input) {
    var url = typeof input === 'string' ? input : (input && input.url) || '';
    return Promise.resolve({ ok: true, status: 200, url: url });
  };
  ctx.window = ctx;
  ctx.globalThis = ctx;
  ctx.self = ctx;
  return ctx;
}

function loadModule(ctx) {
  var src = fs.readFileSync(path.join(root, 'snake-network.js'), 'utf8');
  vm.createContext(ctx);
  vm.runInContext(src, ctx, { filename: 'snake-network.js' });
  return ctx.DogaNet;
}

async function main() {
  // 1) Migración del interruptor global antiguo + perfil invitado
  var store = { dogaNetOn: '0' };
  var ctx = makeSandbox(store);
  var D = loadModule(ctx);
  assert.ok(D, 'window.DogaNet existe');
  assert.strictEqual(D.version, '2026.18');
  assert.strictEqual(D.profile(), 'guest', 'sin sesión el perfil es invitado');
  assert.strictEqual(D.isOn(), false, 'hereda el interruptor global antiguo (apagado)');
  assert.strictEqual(store['dogaNetOn:guest'], '0', 'se migra a la clave del perfil invitado');
  assert.strictEqual(store.dogaNetOn, undefined, 'el formato global antiguo se borra al migrar');
  ok('migración del interruptor global al perfil invitado (una sola vez)');

  // 2) Perfil A: clave propia; el global ya no existe → encendida por defecto
  ctx.currentUser = { email: 'Ana@Ejemplo.com' };
  assert.strictEqual(D.syncProfile(), true, 'syncProfile detecta el cambio de cuenta');
  assert.strictEqual(D.profile(), 'u:ana@ejemplo.com', 'clave de perfil normalizada');
  assert.strictEqual(D.isOn(), true, 'perfil nuevo: red encendida por defecto');
  assert.strictEqual(store['dogaNetOn:u:ana@ejemplo.com'], undefined, 'aún no ha escrito nada');

  // 3) Al encender se guarda en la clave de SU perfil
  var on = await D.set(true);
  assert.strictEqual(on, true);
  assert.strictEqual(store['dogaNetOn:u:ana@ejemplo.com'], '1', 'se guarda por perfil');
  ok('perfil A enciende y guarda dogaNetOn:u:ana@ejemplo.com=1');

  // 4) Perfil B: no ve el estado de A (su clave no existe → encendida por defecto)
  ctx.currentUser = { email: 'beto@otro.com' };
  assert.strictEqual(D.syncProfile(), true);
  assert.strictEqual(D.profile(), 'u:beto@otro.com');
  assert.strictEqual(D.isOn(), true, 'B arranca con su propio estado');
  assert.strictEqual(store['dogaNetOn:u:ana@ejemplo.com'], '1', 'la clave de A queda intacta');
  ok('perfil B no hereda ni toca el estado de A');

  // 5) Desconectar A solo cambia la clave de A; B sigue encendida
  ctx.currentUser = { email: 'ana@ejemplo.com' };
  assert.strictEqual(D.syncProfile(), true, 'volvemos a A');
  assert.strictEqual(D.isOn(), true, 'A recuerda que estaba encendida');
  await D.set(false);
  assert.strictEqual(store['dogaNetOn:u:ana@ejemplo.com'], '0', 'apagada solo en el perfil A');
  assert.strictEqual(store['dogaNetOn:u:beto@otro.com'], undefined, 'B sigue sin clave (encendida por defecto)');
  assert.deepStrictEqual(Object.keys(store).sort(), ['dogaNetOn:guest', 'dogaNetOn:u:ana@ejemplo.com'].sort(), 'no se escribe en claves de otros perfiles');
  ctx.currentUser = { email: 'beto@otro.com' };
  assert.strictEqual(D.syncProfile(), true);
  assert.strictEqual(D.isOn(), true, 'desconectar en A no apaga a B');
  ok('desconectar en un perfil solo afecta a ese perfil');

  // 6) Logout vuelve al perfil invitado, que conserva su propio estado (apagado)
  ctx.currentUser = null;
  assert.strictEqual(D.syncProfile(), true);
  assert.strictEqual(D.profile(), 'guest');
  assert.strictEqual(D.isOn(), false, 'el invitado conserva su interruptor');
  ok('logout: vuelve al estado del perfil invitado');

  // 7) index.html: fuera la pantalla «server i9 no está conectada»
  var html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
  assert.strictEqual(html.indexOf('i9OffView'), -1, 'no queda la vista i9OffView');
  assert.strictEqual(html.indexOf('showI9Disconnected'), -1, 'no queda showI9Disconnected');
  assert.strictEqual(html.indexOf('serverI9Live'), -1, 'no queda el sondeo serverI9Live');
  assert.strictEqual(html.indexOf('i9-offline'), -1, 'no quedan clases i9-offline');
  assert.strictEqual(html.indexOf('/api/server-i9/connected'), -1, 'el frontend ya no consulta el server i9');
  assert.ok(html.indexOf('function gateServerI9(){ continueAfterOsGate(); }') >= 0, 'el arranque sigue tras el gate');
  assert.ok(html.indexOf("window.SNAKE_OS_VERSION='2026.21'") >= 0, 'versión 2026.21');
  assert.ok(html.indexOf("{v:'2026.21'") >= 0, 'entrada de novedades 2026.21');
  ok('index.html sin pantalla ni sondeos del server i9');

  // 8) main.py: la API ya no se bloquea con 503 «server i9 no está conectada»
  var py = fs.readFileSync(path.join(root, 'main.py'), 'utf8');
  assert.strictEqual(py.indexOf('"detail": "server i9 no está conectada"'), -1, 'fuera el 503 del middleware');
  var gate = py.indexOf('async def server_i9_api_gate');
  assert.ok(gate >= 0, 'el hook del middleware sigue existiendo (sin bloquear)');
  assert.ok(py.slice(gate, gate + 400).indexOf('status_code=503') === -1, 'el hook ya no devuelve 503');
  ok('main.py: la API funciona aunque el server i9 no esté conectado');

  // 9) snake-network.js: versión y API pública nueva
  var src = fs.readFileSync(path.join(root, 'snake-network.js'), 'utf8');
  assert.ok(src.indexOf("version: '2026.18'") >= 0);
  assert.ok(src.indexOf('profile: profileTag') >= 0);
  assert.ok(src.indexOf('syncProfile: syncProfile') >= 0);
  ok('snake-network.js: versión 2026.18 y API de perfiles');

  if (process.exitCode) process.exit(process.exitCode);
  console.log('todo bien');
}

main().catch(function (e) {
  console.error('FAIL', e && e.stack || e);
  process.exit(1);
});
