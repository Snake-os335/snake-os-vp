/* Doga Gorilla: prueba de humo en VR FALSA (sin visor ni WebGL).
 *
 * Carga el three.js real, cambia el WebGLRenderer por uno falso y simula una
 * sesión `immersive-vr` con dos mandos y un visor a 1,70 m de altura. Con eso se
 * ejecutan de verdad start(), readHands(), physics() y updateAvatar(), y se
 * comprueba lo importante del estilo gorilla tag:
 *  - el suelo sube hasta el pecho (drop = altura de tus ojos − EYE_MONKE);
 *  - las manos del monke siguen a los mandos (posición real de la pose);
 *  - arrastrar las manos empuja al cuerpo (locomoción con las manos);
 *  - el gatillo agarra el suelo/tronco y las manos 1:1 hacen trepar.
 *
 * Uso: node tests/test_doga_gorilla_xr.js
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

var pending = null;
var handlers = {};
var win = {};
win.window = win;
win.self = win;
win.console = console;
win.performance = { now: function () { return 0; } };
win.devicePixelRatio = 1;
win.requestAnimationFrame = function (cb) { pending = cb; return 1; };
win.cancelAnimationFrame = function () {};
win.addEventListener = function (type, fn) { (handlers[type] = handlers[type] || []).push(fn); };
win.removeEventListener = function () {};
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

/* --- el visor y los mandos de mentira ------------------------------------- */
var REF = { name: 'local-floor' };
var eyeY = 1.70;                       // altura real de tus ojos
var grip = {
  left: { x: -0.22, y: 1.05, z: -0.18 },
  right: { x: 0.22, y: 1.05, z: -0.18 }
};
var pads = {
  left: { buttons: [{ pressed: false, value: 0 }, { pressed: false, value: 0 }] },
  right: { buttons: [{ pressed: false, value: 0 }, { pressed: false, value: 0 }] }
};
var sources = [
  { handedness: 'left', gripSpace: { h: 'left' }, gamepad: pads.left },
  { handedness: 'right', gripSpace: { h: 'right' }, gamepad: pads.right }
];
var session = {
  inputSources: sources,
  addEventListener: function () {},
  removeEventListener: function () {},
  end: function () { return Promise.resolve(); },
  requestAnimationFrame: function (cb) { pending = cb; return 1; }
};
win.navigator = {
  userAgent: 'smoke-test',
  xr: { requestSession: function () { return Promise.resolve(session); } }
};

vm.createContext(win);
vm.runInContext(fs.readFileSync(path.join(root, 'assets/three-r160.min.js'), 'utf8'), win,
  { filename: 'three-r160.min.js' });
assert.ok(win.THREE && win.THREE.Vector3, 'three.js real cargado');

function FakeRenderer() {
  this.domElement = fakeCanvas();
  this.shadowMap = {};
  this.xr = {
    enabled: false,
    setReferenceSpaceType: function () {},
    getReferenceSpace: function () { return REF; },
    setSession: function () { return Promise.resolve(); }
  };
  this.setPixelRatio = function () {};
  this.setSize = function () {};
  this.render = function () {};
  this.dispose = function () {};
  this.setAnimationLoop = function () {};
}
win.THREE.WebGLRenderer = FakeRenderer;

vm.runInContext(fs.readFileSync(path.join(root, 'doga-gorilla.js'), 'utf8'), win,
  { filename: 'doga-gorilla.js' });
var G = win.DogaGorilla;

/* frame falso de WebXR (visor y mandos donde toque) */
var clock = 0;
function makeFrame() {
  return {
    getViewerPose: function () {
      return {
        transform: {
          position: { x: 0, y: eyeY, z: 0 },
          orientation: { x: 0, y: 0, z: 0, w: 1 }
        }
      };
    },
    getPose: function (space) {
      if (!space || !space.h) return null;
      var g = grip[space.h];
      return {
        transform: {
          position: { x: g.x, y: g.y, z: g.z },
          orientation: { x: 0, y: 0, z: 0, w: 1 }
        }
      };
    }
  };
}
function tick(n) {
  for (var i = 0; i < n; i++) {
    var cb = pending;
    pending = null;
    if (!cb) throw new Error('el motor no ha pedido otro fotograma');
    clock += 16;
    cb(clock, makeFrame());
  }
}

var host = { clientWidth: 900, clientHeight: 500, appendChild: function () {} };

G.start({ host: host, world: 'prado', onLog: function () {} }).then(function () {
  assert.strictEqual(G.state().xr, true, 'hay sesión de VR');
  tick(2);

  /* 1) el suelo, a la altura del pecho */
  var mk = G.monke();
  assert.strictEqual(mk.body, true, 'el monke existe en VR');
  assert.ok(Math.abs(mk.eyeY - eyeY) < 0.01, 'los ojos están donde está el visor (' + mk.eyeY + ')');
  var drop = eyeY - 1.15;
  assert.ok(Math.abs(mk.drop - drop) < 0.02, 'el cuerpo baja ' + drop.toFixed(2) + ' m (drop ' + mk.drop + ')');
  assert.ok(mk.drop > 0.4 && mk.drop < 0.7, 'el suelo queda a la altura del pecho (' + mk.drop + ' m)');
  assert.ok(Math.abs((mk.eyeY - mk.drop) - 1.15) < 0.03, 'los ojos quedan a 1,15 m del suelo');
  ok('VR: el suelo se sube hasta el pecho (drop ' + mk.drop + ' m)');

  /* 2) las manos del monke siguen a los mandos */
  var lm = mk.handPos.left, rm = mk.handPos.right;
  assert.ok(Math.abs(lm[0] - grip.left.x) < 0.01 && Math.abs(lm[1] - grip.left.y) < 0.01
    && Math.abs(lm[2] - grip.left.z) < 0.01, 'la mano izquierda está donde el mando');
  assert.ok(Math.abs(rm[0] - grip.right.x) < 0.01 && Math.abs(rm[1] - grip.right.y) < 0.01,
    'la mano derecha está donde el mando');
  assert.ok(lm[1] < mk.shoulderY, 'las manos quedan por debajo de los hombros');
  assert.ok(mk.armLen[0] > 0.2 && mk.armLen[1] > 0.2, 'los brazos llegan hasta las manos');
  ok('VR: las manos del monke siguen a los mandos y los brazos se estiran');

  /* 3) arrastrar las manos empuja al cuerpo */
  var startZ = G.state().pos.z;
  for (var i = 0; i < 30; i++) {
    grip.left.z -= 0.05;
    grip.right.z -= 0.05;
    tick(1);
  }
  var after = G.state();
  assert.ok(after.pos.z - startZ > 0.15, 'arrastrar las manos mueve al monke (+'
    + (after.pos.z - startZ).toFixed(2) + ' m)');
  assert.ok(after.speed > 0.2, 'y coge velocidad (' + after.speed + ' m/s)');
  ok('VR: arrastrar las manos hacia delante empuja el cuerpo');

  /* 4) el gatillo agarra y las manos 1:1 hacen trepar */
  grip.left.x = 0.2; grip.left.z = 0.4;
  grip.right.x = -0.2; grip.right.z = 0.4;
  grip.left.y = 0.62; grip.right.y = 0.62;
  tick(2);
  pads.left.buttons[1].pressed = true;
  tick(2);
  var grabMk = G.monke();
  assert.ok(!!grabMk.grabbing, 'con el gatillo apretado en el suelo se agarra (' + grabMk.grabbing + ')');
  var y0 = G.state().pos.y;
  for (var j = 0; j < 12; j++) {
    grip.left.y -= 0.03;                       // bajas las manos…
    tick(1);
  }
  var climbed = G.state().pos.y;
  assert.ok(climbed - y0 > 0.2, '…y el monke sube (' + (climbed - y0).toFixed(2) + ' m trepados)');
  pads.left.buttons[1].pressed = false;
  tick(2);
  assert.strictEqual(G.monke().grabbing, null, 'al soltar el gatillo deja de trepar');
  ok('VR: con el gatillo se agarra y se trepa moviendo las manos');

  G.stop();
  assert.strictEqual(G.state().running, false, 'se sale de la sesión');
  assert.strictEqual(G.monke().body, false, 'el cuerpo se limpia al salir');
  ok('VR: la sesión se cierra limpia');
  console.log('\ntest_doga_gorilla_xr OK');
}).catch(function (err) {
  console.error('FALLO:', err && err.stack || err);
  process.exitCode = 1;
});
