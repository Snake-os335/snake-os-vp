/* Doga Gorilla: prueba de humo DE VERDAD (sin WebGL).
 *
 * Carga el three.js real (assets/three-r160.min.js) en un contexto con un DOM
 * mínimo, cambia sólo el WebGLRenderer por uno falso y arranca el motor en modo
 * vista previa. Así se ejecutan de verdad buildScene, buildAvatar, updateAvatar,
 * physics y placePreviewCam, y se comprueba que:
 *  - el monke existe, tiene sus partes y las dos manos;
 *  - las manos cuelgan por debajo de los hombros y los brazos se estiran hasta ellas;
 *  - el suelo queda a la altura del pecho (ojos del monke a EYE_MONKE);
 *  - el jugador queda apoyado en el suelo y puede andar.
 *
 * Uso: node tests/test_doga_gorilla_smoke.js
 */
'use strict';
var fs = require('fs');
var path = require('path');
var vm = require('vm');
var assert = require('assert');
var root = path.join(__dirname, '..');

function ok(msg) { console.log('ok', msg); }

function fakeCanvas() {
  return {
    width: 0, height: 0, style: {},
    getContext: function () { return null; },
    addEventListener: function () {}, removeEventListener: function () {},
    setPointerCapture: function () {}, releasePointerCapture: function () {}
  };
}

var win = {};
win.window = win;
win.self = win;
win.console = console;
win.performance = { now: function () { return 0; } };
win.navigator = { userAgent: 'smoke-test' };
win.devicePixelRatio = 1;
var pending = null;
win.requestAnimationFrame = function (cb) { pending = cb; return 1; };  // bucle controlado
win.cancelAnimationFrame = function () {};
var handlers = {};
win.addEventListener = function (type, fn) { (handlers[type] = handlers[type] || []).push(fn); };
win.removeEventListener = function () {};
function frames(n) {
  for (var i = 0; i < n; i++) {
    var cb = pending;
    pending = null;
    if (cb) cb(0);
  }
}
function key(k, down) {
  var list = handlers[down ? 'keydown' : 'keyup'] || [];
  for (var i = 0; i < list.length; i++) list[i]({ key: k, preventDefault: function () {} });
}
win.setTimeout = setTimeout;
win.document = {
  createElement: function (tag) {
    if (tag === 'canvas') return fakeCanvas();
    return { style: {}, setAttribute: function () {}, appendChild: function () {} };
  },
  createElementNS: function () { return fakeCanvas(); },
  getElementById: function () { return null; },
  querySelector: function () { return null; },
  head: { appendChild: function (s) { if (s && s.onload) s.onload(); } },
  body: {
    appendChild: function () {},
    classList: { add: function () {}, remove: function () {}, toggle: function () {} }
  },
  addEventListener: function () {}, removeEventListener: function () {}
};
vm.createContext(win);

/* 1) three.js real, tal cual se sirve en producción */
vm.runInContext(fs.readFileSync(path.join(root, 'assets/three-r160.min.js'), 'utf8'), win,
  { filename: 'three-r160.min.js' });
assert.ok(win.THREE && win.THREE.Vector3, 'three.js real cargado');

/* 2) sólo el renderer es falso (en node no hay WebGL) */
function FakeRenderer() {
  this.domElement = fakeCanvas();
  this.xr = { enabled: false };
  this.shadowMap = {};
  this.setPixelRatio = function () {};
  this.setSize = function () {};
  this.render = function () {};
  this.dispose = function () {};
  this.setAnimationLoop = function () {};
}
win.THREE.WebGLRenderer = FakeRenderer;

/* 3) el motor del juego */
vm.runInContext(fs.readFileSync(path.join(root, 'doga-gorilla.js'), 'utf8'), win,
  { filename: 'doga-gorilla.js' });
var G = win.DogaGorilla;
assert.ok(G && typeof G.startPreview === 'function', 'API del juego disponible');
assert.strictEqual(G.monke().body, false, 'antes de arrancar no hay cuerpo');

var host = { clientWidth: 900, clientHeight: 500, appendChild: function () {} };
var logs = [];
var states = [];

G.startPreview(host, {
  world: 'prado',
  onLog: function (m) { logs.push(m); },
  onState: function (s) { states.push(s); }
}).then(function () {
  var mk = G.monke();
  assert.strictEqual(mk.body, true, 'el monke existe');
  assert.strictEqual(mk.hands, true, 'tiene las dos manos');
  ['torso', 'belly', 'muzzle', 'earL', 'earR', 'shL', 'shR', 'armL', 'armR', 'hands']
    .forEach(function (p) { assert.ok(mk.parts.indexOf(p) >= 0, 'el monke tiene ' + p); });

  /* el suelo, a la altura del pecho: los ojos del monke a 1,15 m y sin bajar el cuerpo en el PC */
  assert.ok(Math.abs(mk.eyeY - 1.15) < 0.001, 'los ojos del monke están a 1,15 m (' + mk.eyeY + ')');
  assert.strictEqual(mk.drop, 0, 'en la vista previa no hay que bajar el cuerpo');
  assert.ok(mk.torsoY > 0 && mk.torsoY < mk.eyeY, 'el torso va por debajo de la cabeza');
  assert.ok(mk.shoulderY > mk.torsoY, 'los hombros van por encima del centro del torso');

  /* las manos cuelgan por debajo de los hombros y los brazos se estiran hasta ellas */
  var lm = mk.handPos.left, rm = mk.handPos.right;
  assert.ok(lm[0] < 0 && rm[0] > 0, 'cada mano en su lado');
  assert.ok(lm[1] < mk.shoulderY && rm[1] < mk.shoulderY, 'las manos cuelgan por debajo de los hombros');
  assert.ok(lm[2] < 0 && rm[2] < 0, 'las manos van por delante del cuerpo');
  assert.ok(mk.armLen[0] > 0.2 && mk.armLen[1] > 0.2, 'los brazos se estiran (' + mk.armLen.join('/') + ')');
  var dyL = mk.shoulderY - lm[1], dxL = lm[0] + 0.3, dzL = lm[2];
  var lenL = Math.sqrt(dxL * dxL + dyL * dyL + dzL * dzL);
  assert.ok(Math.abs(lenL - mk.armLen[0]) < 0.05, 'la longitud del brazo es la distancia hombro-mano');

  /* física: apoyado en el suelo y andando de verdad */
  var st = G.state();
  assert.strictEqual(st.running, true, 'el juego está corriendo');
  assert.strictEqual(st.onGround, true, 'el monke está en el suelo');
  ok('monke: cuerpo y manos colocados, suelo al pecho y brazos estirados');

  /* WASD mueve al monke de verdad (20 fotogramas con «w» apretada) */
  var before = G.monke().torsoY;
  key('w', true);
  frames(20);
  key('w', false);
  var walking = G.state();
  assert.ok(walking.speed > 3, 'con «w» el monke coge velocidad (' + walking.speed + ' m/s)');
  assert.strictEqual(walking.onGround, true, 'sigue apoyado mientras anda');
  assert.strictEqual(G.monke().torsoY, before, 'el cuerpo no se deforma al andar');
  frames(10);
  ok('vista previa: el monke anda con WASD');

  /* espacio: salta y vuelve a caer al suelo */
  key(' ', true);
  frames(2);
  var air = G.state();
  assert.ok(air.speed >= 0, 'el salto no rompe el estado');
  frames(90);
  assert.strictEqual(G.state().onGround, true, 'vuelve al suelo después del salto');
  key(' ', false);
  ok('vista previa: salto con la barra espaciadora y vuelta al suelo');

  return G.stop();
}).then(function (s) {
  assert.strictEqual(s.running, false, 'se puede salir');
  assert.strictEqual(G.monke().body, false, 'al salir se limpia el cuerpo');
  ok('vista previa: arranca, coloca el monke y se cierra limpia');
  console.log('\ntest_doga_gorilla_smoke OK');
}).catch(function (err) {
  console.error('FALLO:', err && err.stack || err);
  process.exitCode = 1;
});
