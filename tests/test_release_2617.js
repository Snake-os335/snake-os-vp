/* Snake OS 2026.17: pruebas de Doganiero_Network (red wifi, snake-network.js).
 *
 * Qué se comprueba:
 *  - /api/* (salvo excepciones de arranque y sesión) y otros dominios = necesitan internet;
 *    estáticos y páginas del propio servidor = locales.
 *  - Con la red apagada no se puede usar ninguna función online, pero /api/status sigue pasando.
 *  - fetch rechaza con un TypeError «de red» (dogaNet), XHR termina en error, WebSocket cierra 1006.
 *  - Con la red encendida y ping correcto las funciones online vuelven a pasar.
 *  - La versión y el <script> del módulo están en index.html.
 */
'use strict';
var fs = require('fs');
var path = require('path');
var vm = require('vm');
var assert = require('assert');
var root = path.join(__dirname, '..');

function fail(msg) { console.error('FAIL', msg); process.exitCode = 1; }
function ok(msg) { console.log('ok', msg); }
function wait(ms) { return new Promise(function (res) { setTimeout(res, ms); }); }

/* Contexto mínimo: sin DOM real, solo lo que toca al cargar (inyectar el CSS). */
function makeSandbox() {
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
  function Xhr() { this.readyState = 0; this.status = 0; this.responseText = ''; }
  Xhr.prototype.open = function (m, u) { this.__url = u; this.__method = m; };
  Xhr.prototype.send = function () { this.__sent = true; };
  Xhr.prototype.dispatchEvent = function (ev) {
    if (ev && ev.type === 'error' && typeof this.onerror === 'function') this.onerror(ev);
    return true;
  };

  var ctx = {
    console: console, URL: URL, Promise: Promise, Date: Date, Math: Math, JSON: JSON,
    setTimeout: setTimeout, clearTimeout: clearTimeout, setInterval: setInterval, clearInterval: clearInterval,
    AbortController: typeof AbortController === 'function' ? AbortController : undefined,
    localStorage: { getItem: function () { return null; }, setItem: function () {} },
    navigator: {},
    location: { href: 'https://os.example/', origin: 'https://os.example', pathname: '/' },
    document: doc,
    Event: function ClientEvent(t) { this.type = t; },
    CustomEvent: function ClientCustomEvent(t, o) { this.type = t; this.detail = o && o.detail; },
    XMLHttpRequest: Xhr,
    WebSocket: function NativeWS(url) { this.__native = true; this.url = url; },
    __fetched: []
  };
  ctx.__failStatus = false;   // poner a true simula «el ping no llega» (sin internet real)
  ctx.fetch = function (input) {
    var url = typeof input === 'string' ? input : (input && input.url) || '';
    ctx.__fetched.push(url);
    if (ctx.__failStatus && url.indexOf('/api/status') === 0) return Promise.reject(new Error('sin red'));
    return Promise.resolve({ ok: true, status: 200, url: url });
  };
  ctx.window = ctx;
  ctx.globalThis = ctx;
  ctx.self = ctx;
  return ctx;
}

function load() {
  var ctx = makeSandbox();
  vm.createContext(ctx);
  vm.runInContext(fs.readFileSync(path.join(root, 'snake-network.js'), 'utf8'), ctx, { filename: 'snake-network.js' });
  return ctx;
}

(async function main() {
  var ctx = load();
  var D = ctx.DogaNet;
  assert.ok(D && typeof D === 'object', 'window.DogaNet existe');
  assert.strictEqual(D.__installed, true);
  ok('el módulo se instala una sola vez (window.DogaNet)');

  // 1) Qué necesita internet
  assert.strictEqual(D.isOnlineRequest('/api/clima'), true, 'la API del OS es online');
  assert.strictEqual(D.isOnlineRequest('/api/weather?city=Madrid'), true);
  assert.strictEqual(D.isOnlineRequest('https://api.github.com/repos'), true, 'otro origen es internet');
  assert.strictEqual(D.isOnlineRequest('/static/snake-safe.js'), false, 'los estáticos son locales');
  assert.strictEqual(D.isOnlineRequest('/index.html'), false);
  assert.strictEqual(D.isOnlineRequest('data:text/plain,hola'), false, 'data: no necesita red');
  ['/api/status', '/api/status?x=1', '/api/os-gate', '/api/login', '/api/signup', '/api/logout',
   '/api/me?x=1', '/api/bootstrap', '/api/avatars/a.png'].forEach(function (u) {
    assert.strictEqual(D.isOnlineRequest(u), false, 'siempre pasa: ' + u);
  });
  ok('online = /api/* (salvo arranque y sesión) u otro dominio; local = estáticos');

  // 2) Por defecto viene encendida y sin comprobar: no bloquea nada al entrar
  assert.strictEqual(D.isOn(), true);
  assert.strictEqual(D.hasInternet(), false, 'todavía no se ha comprobado internet');
  var r0 = await ctx.fetch('/api/clima');
  assert.strictEqual(r0.ok, true, 'por defecto las funciones online no se tocan');
  ok('por defecto encendida y sin bloqueos (nada cambia al entrar)');

  // 3) Apagada: las funciones online fallan como en un móvil sin wifi
  var off = await D.set(false);
  assert.strictEqual(off, false);
  assert.strictEqual(D.state().state, 'off');
  assert.strictEqual(D.requireOnline('clima'), false, 'requireOnline avisa y dice que no');
  var blocked = null;
  await ctx.fetch('/api/clima').then(function () { blocked = 'paso'; }, function (e) { blocked = e; });
  assert.ok(blocked && blocked !== 'paso', 'fetch de una función online se rechaza');
  assert.strictEqual(blocked.dogaNet, true);
  assert.strictEqual(blocked.name, 'TypeError', 'parece un error de red del navegador');
  assert.strictEqual(blocked.code, 'doga_net_offline');
  assert.ok(blocked.message.indexOf('Doganiero_Network') >= 0);
  var statusOk = await ctx.fetch('/api/status?dogaNet=1');
  assert.strictEqual(statusOk.ok, true, 'el ping de estado nunca se bloquea');
  ok('apagada: online rechazado (TypeError de red) y /api/status siempre pasa');

  // 4) XHR y WebSocket bloqueados como sin conexión
  var xhr = new ctx.XMLHttpRequest();
  var xhrErr = null;
  xhr.onerror = function (ev) { xhrErr = ev && ev.type; };
  xhr.open('POST', '/api/clima');
  xhr.send();
  await wait(15);
  assert.strictEqual(xhr.__sent, undefined, 'el send real no se llama');
  assert.strictEqual(xhrErr, 'error', 'XHR termina en error');
  assert.strictEqual(xhr.status, 0, 'status 0 como sin red');

  var ws = new ctx.WebSocket('wss://api.ejemplo/demo');
  assert.ok(!ws.__native, 'no se crea el WebSocket nativo');
  var wsCode = null;
  ws.onclose = function (ev) { wsCode = ev && ev.code; };
  await wait(15);
  assert.strictEqual(wsCode, 1006, 'WebSocket cierra 1006');
  ok('XHR en error y WebSocket 1006, igual que sin conexión');

  // 5) Encender: pide internet real y, si hay, vuelve a permitir lo online
  var on = await D.set(true);
  assert.strictEqual(on, true, 'con el ping correcto se enciende');
  assert.strictEqual(D.isOn(), true);
  assert.strictEqual(D.hasInternet(), true);
  assert.strictEqual(D.state().state, 'online');
  var allowed = await ctx.fetch('/api/clima');
  assert.strictEqual(allowed.ok, true, 'conectada, las funciones online pasan');
  assert.strictEqual(D.requireOnline('clima'), true);
  assert.ok(ctx.__fetched.some(function (u) { return u.indexOf('/api/status') === 0; }), 'comprueba internet con /api/status');
  ok('encendida con internet real: online permitido otra vez');

  // 6) Encendida pero sin internet real: no se miente, se sigue bloqueando
  ctx.__failStatus = true;
  var res = await D.check();
  assert.strictEqual(res, false, 'el ping falla');
  assert.strictEqual(D.hasInternet(), false);
  assert.strictEqual(D.isOn(), true, 'la red sigue encendida');
  assert.strictEqual(D.state().state, 'nointernet');
  var blocked2 = null;
  await ctx.fetch('/api/clima').then(function () { blocked2 = 'paso'; }, function (e) { blocked2 = e; });
  assert.ok(blocked2 && blocked2 !== 'paso', 'sin internet real lo online sigue bloqueado');
  ok('encendida sin internet real: lo dice y no deja pasar lo online');

  // 7) index.html carga el módulo
  var html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
  assert.ok(html.indexOf('/static/snake-network.js?v=') >= 0, 'index.html carga snake-network.js');
  assert.ok(html.indexOf('snake-network.js') < html.indexOf('snake-safe.js'), 'se carga antes que el resto de módulos');
  assert.ok(html.indexOf("window.SNAKE_OS_VERSION='2026.17'") >= 0);
  assert.ok(html.indexOf("{v:'2026.17'") >= 0);
  ok('index.html: módulo cargado pronto y versión 2026.17');

  if (process.exitCode) process.exit(process.exitCode);
  console.log('todo bien');
})().catch(function (e) {
  console.error('FAIL', e && e.stack || e);
  process.exit(1);
});
