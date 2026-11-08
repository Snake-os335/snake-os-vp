#!/usr/bin/env node
/* Test del parche SNK-XR-MANDOS (locomoción con sticks + puntero).
 *
 *   node tests/test_vr_locomotion.js        (desde la raíz del repo)
 *   node /ruta/al/test_vr_locomotion.js     (busca el bloque donde esté)
 *
 * Comprueba, sin gafas:
 *   1. el bloque está en snake-vr.js y evalúa
 *   2. con el stick izquierdo el jugador AVANZA de verdad (no un milímetro)
 *   3. el bug del retroceso: si el juego deja un teletransporte pendiente
 *      (st.xrMoveTo, su "mordida al suelo"), al andar se cancela y no tira
 *      al jugador hacia atrás
 *   4. sin stick, el teletransporte suave del juego se respeta
 *   5. el gatillo sobre el suelo se descarta, pero los clics en el tótem y en
 *      el escritorio siguen llegando al juego (se puede seguir pulsando)
 *   6. el rayo-puntero queda visible y la serpiente-mano oculta
 */
'use strict';

const fs = require('fs');
const path = require('path');
const vm = require('vm');

const START = '/* === SNK-XR-MANDOS';
const END = '/* === fin SNK-XR-MANDOS === */';
let fails = 0;

function ok(cond, msg) {
  if (cond) { console.log('  ok  ' + msg); return; }
  fails++;
  console.error('  FAIL ' + msg);
}

function findBlock() {
  const tries = [
    path.join(process.cwd(), 'snake-vr.js'),
    path.join(process.cwd(), 'static', 'snake-vr.js'),
    path.join(__dirname, '..', 'snake-vr.js'),
    '/Users/antonella/snake-vr-mandos-block.js'
  ];
  for (const f of tries) {
    if (!fs.existsSync(f)) continue;
    const src = fs.readFileSync(f, 'utf8');
    const i = src.indexOf(START);
    if (i === -1) continue;
    const j = src.indexOf(END, i);
    return { file: f, code: src.slice(i, j === -1 ? undefined : j + END.length) };
  }
  return null;
}

/* ---- three.js mínimo: lo único que usa el parche de locomoción ---------- */
class V3 {
  constructor(x, y, z) { this.x = x || 0; this.y = y || 0; this.z = z || 0; }
  clone() { return new V3(this.x, this.y, this.z); }
  copy(v) { this.x = v.x; this.y = v.y; this.z = v.z; return this; }
  set(x, y, z) { this.x = x; this.y = y; this.z = z; return this; }
  add(v) { this.x += v.x; this.y += v.y; this.z += v.z; return this; }
  sub(v) { this.x -= v.x; this.y -= v.y; this.z -= v.z; return this; }
  addScaledVector(v, s) { this.x += v.x * s; this.y += v.y * s; this.z += v.z * s; return this; }
  applyQuaternion() { return this; }               // el test sólo gira en Y
  applyMatrix4() { return this; }
  setFromMatrixPosition() { return this; }
  lengthSq() { return this.x * this.x + this.y * this.y + this.z * this.z; }
  normalize() { const l = Math.sqrt(this.lengthSq()) || 1; this.x /= l; this.y /= l; this.z /= l; return this; }
  distanceTo(v) { return Math.hypot(this.x - v.x, this.y - v.y, this.z - v.z); }
  lerp(v, a) { this.x += (v.x - this.x) * a; this.y += (v.y - this.y) * a; this.z += (v.z - this.z) * a; return this; }
}
class Quat {
  constructor() { this.y = 0; }
  setFromAxisAngle() { return this; }
  premultiply() { return this; }
}
class Mat4 {
  extractRotation() { return this; }
  setFromMatrixPosition() { return this; }
}
let HIT = null;                                     // objeto que "toca" el rayo
class Raycaster {
  set() { return this; }
  intersectObject(target) { return target && target === HIT ? [{ distance: 1 }] : []; }
}
const THREE = { Vector3: V3, Quaternion: Quat, Matrix4: Mat4, Raycaster: Raycaster };

/* ---- sesión XR falsa: permite disparar fotogramas a mano ---------------- */
class XRSession {
  constructor() {
    this.frames = [];
    this.inputSources = [];
    this.listeners = {};
  }
  requestAnimationFrame(cb) { this.frames.push(cb); return this.frames.length; }
  cancelAnimationFrame() {}
  /* three.js vuelve a pedir fotograma en cada vuelta: el simulador hace lo
     mismo antes de ejecutar el que toca. Between the parche's frame and its
     watch(), el "juego" ejecuta su tick (this.nextGameTick). */
  frame(t) {
    const self = this;
    if (!this.frames.length) {
      this.requestAnimationFrame(function () { if (self.nextGameTick) self.nextGameTick(); });
    }
    const cb = this.frames.shift();
    if (cb) cb(t || 0);
  }
  setStick(hand, x, y) {
    this.inputSources = this.inputSources.filter((s) => s.handedness !== hand);
    this.inputSources.push({ handedness: hand, gamepad: { axes: [0, 0, x, y] } });
  }
}

function makeCtl() {
  const ray = { visible: true, material: { opacity: 0.55 } };
  const snakeGroup = { visible: true, traverse(fn) { fn(this); } };
  const ctl = {
    userData: { ray: ray, snake: { group: snakeGroup } },
    children: [snakeGroup, ray],
    matrixWorld: {},
    seen: [],
    dispatchEvent(ev) { this.seen.push(ev && ev.type); return true; },
    updateMatrixWorld() {}
  };
  return ctl;
}

/* ---- montaje: estado del juego + sesión XR ----------------------------- */
const found = findBlock();
if (!found) {
  console.error('no encuentro el bloque SNK-XR-MANDOS (¿aplicaste el parche?)');
  process.exit(1);
}
console.log('bloque: ' + found.file);

const rig = {
  position: new V3(0, 0, 3.4),
  quaternion: new Quat(),
  updates: 0,
  updateMatrixWorld() { this.updates++; }
};
const head = {
  matrixWorld: {},
  getWorldPosition(o) { return o.set(0, 1.6, rig.position.z); },
  getWorldDirection(o) { return o.set(0, 0, -1); }   // mirando al fondo (-Z)
};
const ctrls = [makeCtl(), makeCtl()];
const grips = [
  { visible: true, traverse(fn) { fn(this); } },
  { visible: true, traverse(fn) { fn(this); } }
];
let sess = null;

const st = {
  three: THREE,
  rig: rig,
  camera: head,
  mode: 'xr',
  yaw: 0,
  xrMoveTo: null,
  handSnakes: [],
  reticles: [],
  screenOpen: false,
  floorMesh: { id: 'floor' },
  spirit: { pickMesh: { id: 'totem' } },
  mirrorMesh: { id: 'mirror' },
  renderer: {
    xr: {
      isPresenting: true,
      getSession() { return sess; },
      getCamera() { return head; },
      getController(i) { return ctrls[i]; },
      getControllerGrip(i) { return grips[i]; }
    }
  }
};

const sandbox = { console: console, Math: Math, Date: Date, XRSession: XRSession, st: st };
sandbox.global = sandbox;
sandbox.window = sandbox;
sandbox.globalThis = sandbox;

let api = null;
try {
  vm.createContext(sandbox);
  vm.runInContext(found.code, sandbox, { filename: 'snake-vr.js#SNK-XR-MANDOS', timeout: 5000 });
  api = sandbox.SnakeVrLocomotion;
} catch (e) {
  console.error('  FAIL el bloque no evalúa: ' + e.message);
  process.exit(1);
}

console.log('\n1) carga');
ok(!!api, 'window.SnakeVrLocomotion existe');
ok(api && typeof api.on === 'function' && typeof api.pointer === 'function' &&
   typeof api.teleport === 'function' && typeof api.reset === 'function', 'API on/pointer/teleport/reset');
ok(api && api.state && api.state.pointer === true, 'el puntero viene activado');
ok(api && api.state.noTeleport === true, 'la mordida al suelo no teletransporta por defecto');

sess = new XRSession();

console.log('\n2) stick izquierdo hacia delante: se avanza de verdad');
sess.setStick('left', 0, -1);
const zIni = rig.position.z;
for (let i = 1; i <= 10; i++) sess.frame(2000 + i * 33);
const avance = zIni - rig.position.z;
ok(avance > 0.5, 'recorrido en 10 fotogramas: ' + avance.toFixed(2) + ' m');
ok(api.state.walked > 0.2, 'segundos andando contabilizados: ' + api.state.walked.toFixed(2));
ok(api.state.stickSeen === true, 'stick del mando detectado');

console.log('\n3) el bug del retroceso: teletransporte pendiente a los pies');
/* El juego, al morder el suelo, deja st.xrMoveTo y su tick hace
   rig.position.lerp(st.xrMoveTo, dt*6). Eso es lo que devolvía al jugador. */
st.xrMoveTo = new V3(rig.position.x, 0, rig.position.z + 0.02);
const killsAntes = api.state.kills;
const z3 = rig.position.z;
for (let i = 1; i <= 20; i++) sess.frame(3000 + i * 33);
ok(st.xrMoveTo === null, 'al andar se cancela el teletransporte pendiente');
ok(api.state.kills > killsAntes, 'cancelaciones contadas: ' + api.state.kills);
ok(rig.position.z < z3 - 0.3, 'aun así avanza ' + (z3 - rig.position.z).toFixed(2) + ' m (no se queda pegado)');

console.log('\n4) sin stick, el teletransporte del juego se respeta');
sess.setStick('left', 0, 0);
st.xrMoveTo = new V3(rig.position.x, 0, rig.position.z - 2.5);
const kills4 = api.state.kills;
const z4 = rig.position.z;
/* El tick del juego va entre el fotograma del parche y su watch(): así es
   como mueve el rig su rig.position.lerp(st.xrMoveTo, dt*6). */
sess.nextGameTick = function () { rig.position.lerp(st.xrMoveTo, 0.25); };
for (let i = 1; i <= 12; i++) sess.frame(4000 + i * 33);
sess.nextGameTick = null;
ok(rig.position.z < z4 - 0.5, 'el jugador se acerca al destino: ' + (z4 - rig.position.z).toFixed(2) + ' m');
ok(api.state.kills === kills4, 'parado no se cancela ningún teletransporte');
st.xrMoveTo = null;
api.reset();

console.log('\n5) el gatillo: se puede seguir pulsando cosas');
sess.frame(5000);
HIT = st.floorMesh;
let s0 = ctrls[0].seen.length;
let b0 = api.state.blocked;
ctrls[0].dispatchEvent({ type: 'selectstart' });
ok(ctrls[0].seen.length === s0, 'apuntar al suelo ya no muerde ni teletransporta');
ok(api.state.blocked === b0 + 1, 'mordidas descartadas contadas: ' + api.state.blocked);

HIT = st.spirit.pickMesh;
ctrls[0].dispatchEvent({ type: 'selectstart' });
ok(ctrls[0].seen.length === s0 + 1, 'pulsar el tótem SÍ llega al juego');

HIT = st.mirrorMesh;
st.screenOpen = true;
ctrls[1].dispatchEvent({ type: 'selectstart' });
ok(ctrls[1].seen.length === 1, 'pulsar el escritorio SÍ llega al juego');

HIT = null;
ctrls[0].dispatchEvent({ type: 'selectstart' });
ok(ctrls[0].seen.length === s0 + 2, 'morder al aire se deja pasar');
st.screenOpen = false;

/* Salvaguarda: si las gafas no exponen stick, no se capa el teletransporte. */
api.state.stickSeen = false;
let s5 = ctrls[0].seen.length;
HIT = st.floorMesh;
ctrls[0].dispatchEvent({ type: 'selectstart' });
ok(ctrls[0].seen.length === s5 + 1, 'sin stick, el teletransporte al suelo sigue disponible');
api.state.stickSeen = true;
HIT = null;

console.log('\n6) puntero visible y manos ocultas');
sess.frame(5033);
ok(ctrls[0].userData.ray.visible === true, 'el rayo-puntero se ve: se puede apuntar');
ok(ctrls[0].userData.snake.group.visible === false, 'la serpiente-mano sigue oculta');
ok(grips[0].visible === false, 'la empuñadura sigue oculta');
api.pointer(false);
ok(ctrls[0].userData.ray.visible === false, 'pointer(false) esconde el rayo');
api.pointer(true);
api.hideHands(false);
sess.frame(5066);
ok(ctrls[0].userData.snake.group.visible === true, 'hideHands(false) devuelve las manos');
ok(grips[0].visible === true, 'hideHands(false) devuelve la empuñadura');
api.hideHands(true);

console.log('');
if (fails) {
  console.error(fails + ' comprobación(es) fallida(s)');
  process.exit(1);
}
console.log('todo correcto ✔');
