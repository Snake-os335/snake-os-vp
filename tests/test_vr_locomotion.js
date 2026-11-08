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
  frame(t, frame) {
    const self = this;
    if (!this.frames.length) {
      this.requestAnimationFrame(function () { if (self.nextGameTick) self.nextGameTick(); });
    }
    const cb = this.frames.shift();
    if (cb) cb(t || 0, frame);
  }
  setStick(hand, x, y) {
    this.inputSources = this.inputSources.filter((s) => s.handedness !== hand);
    this.inputSources.push({ handedness: hand, targetRaySpace: { id: hand }, gamepad: { axes: [0, 0, x, y] } });
  }
}

function makeCtl() {
  const ray = { visible: true, material: { opacity: 0.55 }, scale: { z: 7 } };
  const snakeGroup = { visible: true, traverse(fn) { fn(this); } };
  const mat = {
    e: [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1],
    fromArray(a) { this.e = a.slice(); return this; },
    decompose(p, q, s) { p.x = this.e[12]; p.y = this.e[13]; p.z = this.e[14]; return this; }
  };
  const ctl = {
    userData: { ray: ray, snake: { group: snakeGroup } },
    children: [snakeGroup, ray],
    matrix: mat,
    /* pose congelada del objeto del juego (el bug: el rayo se queda fijo) */
    matrixWorld: { elements: [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 1.2, -0.3, 1] },
    position: { x: 0, y: 1.2, z: -0.3 },
    quaternion: { x: 0, y: 0, z: 0, w: 1 },
    scale: { x: 1, y: 1, z: 1 },
    matrixWorldNeedsUpdate: false,
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
  xrControllers: ctrls,
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
      getControllerGrip(i) { return grips[i]; },
      getReferenceSpace() { return { id: 'local-floor' }; }
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

console.log('\n7) el juego de realidad mixta (🐍 MR) queda intacto: sesión ajena');

/* La mascota de realidad mixta (SNK-MR-MASCOTA) abre su PROPIA sesión con su
   propio renderer. El parche de mandos se cuelga de
   XRSession.prototype.requestAnimationFrame, así que ve esos fotogramas: no
   debe ocultar sus manos, ni mover el rig del juego, ni tragarse su gatillo. */
const mrSess = new XRSession();
mrSess.setStick('left', 0, -1);                  // stick a tope en el juego MR
st.renderer.xr.isPresenting = false;             // el renderer del juego NO presenta
const mr = { getSession: st.renderer.xr.getSession, isPresenting: true };
st.renderer.xr.getSession = function () { return null; };
const zMr = rig.position.z;
const walkedMr = api.state.walked;
ctrls[0].userData.snake.group.visible = true;
grips[0].visible = true;
for (let i = 1; i <= 10; i++) mrSess.frame(6000 + i * 33);
ok(Math.abs(rig.position.z - zMr) < 1e-9, 'en la sesión MR no se mueve el rig del juego: ' + (rig.position.z - zMr).toFixed(3) + ' m');
ok(api.state.walked === walkedMr, 'en la sesión MR no se cuenta como andado');
ok(ctrls[0].userData.snake.group.visible === true, 'en la sesión MR no se ocultan las manos');
ok(grips[0].visible === true, 'en la sesión MR no se oculta la empuñadura');

/* Un fotograma roto de la sesión MR no debe arrancar el bucle de rescate del
   juego (que dibujaría su escena dentro de la habitación). */
const errs0 = api.state.errs;
mrSess.requestAnimationFrame(function () { throw new Error('fotograma MR roto'); });
mrSess.frame(6500);
ok(api.state.errs === errs0 + 1, 'el error del fotograma MR se cuenta: ' + api.state.errs);
ok(!mrSess.__snkRescue, 'sin bucle de rescate dentro de la sesión MR (no se dibuja la escena del juego)');

/* Al volver al juego, la locomoción funciona otra vez. */
st.renderer.xr.isPresenting = mr.isPresenting;
st.renderer.xr.getSession = mr.getSession;
sess.setStick('left', 0, -1);
const zBack = rig.position.z;
for (let i = 1; i <= 10; i++) sess.frame(7000 + i * 33);
ok(rig.position.z < zBack - 0.3, 'de vuelta al juego, el stick avanza: ' + (zBack - rig.position.z).toFixed(2) + ' m');

console.log('\n8) el puntero va donde está el mando, no clavado en un punto fijo');

/* El rayo es hijo del objeto del mando del juego y su pose la escribe three.js
   con frame.getPose(); si se queda congelada, el puntero se ve fijo. Con el
   "frame" del fotograma el parche lee la pose REAL y recoloca el mando. */
function poseFrame(map) {
  return {
    getPose(space) {
      const p = map[space.id];
      if (!p) return null;
      const m = [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, p[0], p[1], p[2], 1];
      return { transform: { matrix: m, position: { x: p[0], y: p[1], z: p[2] } } };
    }
  };
}
const fix0 = api.state.poseFix;
const ok0 = api.state.poseOk;
/* mando izquierdo de verdad en (0.42, 1.35, -0.60); el objeto del juego sigue
   clavado en (0, 1.20, -0.30) */
sess.setStick('left', 0, 0);
sess.setStick('right', 0, 0);   // los dos mandos están delante del jugador
sess.frame(8000, poseFrame({ left: [0.42, 1.35, -0.60], right: [-0.35, 1.30, -0.45] }));
ok(Math.abs(ctrls[0].position.x - 0.42) < 1e-6 && Math.abs(ctrls[0].position.z + 0.60) < 1e-6,
  'el mando del juego se recoloca en la pose real: (' + ctrls[0].position.x + ', ' + ctrls[0].position.z + ')');
ok(api.state.poseFix === fix0 + 2, 'recolocados los dos mandos: poseFix=' + api.state.poseFix);
ok(ctrls[0].matrixWorldNeedsUpdate === true, 'se pide recalcular la matriz (el rayo hijo se mueve con él)');
ok(ctrls[0].userData.ray.visible === true, 'el rayo sigue visible tras recolocarlo');

/* Ya coincide: no se toca nada (no se pelea con three.js). */
ctrls[0].matrixWorld.elements = [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0.42, 1.35, -0.60, 1];
ctrls[1].matrixWorld.elements = [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, -0.35, 1.30, -0.45, 1];
const fix1 = api.state.poseFix;
sess.frame(8033, poseFrame({ left: [0.42, 1.35, -0.60], right: [-0.35, 1.30, -0.45] }));
ok(api.state.poseFix === fix1, 'si la pose ya es la buena, no se recoloca');
ok(api.state.poseOk > ok0, 'se cuenta como pose correcta: poseOk=' + api.state.poseOk);
/* Y sin frame (navegadores que no lo dan) no se rompe nada. */
sess.frame(8066);
ok(true, 'un fotograma sin frame no rompe el bucle');

console.log('\n9) la pestaña vieja se entera y se recarga sola (2026.29)');

/* El servidor ya sirve el snake-vr.js nuevo, pero la pestaña tiene el viejo en
   memoria y el aviso «Actualizar ahora» es DOM (en VR ni se ve). El parche
   compara el ?v= de esta página con el del HTML servido y recarga una vez. */
async function case9() {
  st.mode = 'mono';       /* fuera de VR, como al abrir la app */
  const scripts = [{ src: 'https://snake-os-vp.softportweb.com/static/snake-vr.js?v=viejo123' }];
  let reloads = 0;
  let servedVer = 'aaaaaaa-1111';                   // version de /api/status
  let served = '<script src="/static/snake-vr.js?v=nuevo456"></script>';
  const store = {};
  Object.assign(sandbox, {
    document: {
      hidden: false,
      querySelectorAll(sel) { return sel === 'script[src]' ? scripts : []; },
      addEventListener() {}
    },
    sessionStorage: {
      getItem(k) { return Object.prototype.hasOwnProperty.call(store, k) ? store[k] : null; },
      setItem(k, v) { store[k] = String(v); }
    },
    location: { reload() { reloads++; } },
    fetch: (url) => Promise.resolve({
      ok: true,
      json: () => Promise.resolve({ updating: false, version: servedVer }),
      text: () => Promise.resolve(String(url) === '/' ? served : '')
    })
  });
  const tick = () => new Promise((r) => setTimeout(r, 10));

  ok(api.version === '2026.29', 'la versión del parche se puede consultar: ' + api.version);
  ok(typeof api.update === 'function', 'existe window.SnakeVrLocomotion.update()');

  api.update();
  await tick();
  ok(reloads === 1, 'con un ?v= nuevo en el servidor, la página se recarga: ' + reloads);
  ok(api.state.updNew === true && api.state.updTo === 'nuevo456', 'queda anotado a qué versión se actualiza: ' + api.state.updTo);

  api.update();
  await tick();
  ok(reloads === 1, 'no entra en bucle: la segunda vez no vuelve a recargar');
  ok(store.snkXrUpd === 'nuevo456', 'la marca queda en sessionStorage');
  ok(api.state.updVer === servedVer, 'recuerda el version del servidor ya comprobado: ' + api.state.updVer);

  /* Ya con el archivo nuevo en la página: no hay nada que recargar. */
  scripts[0].src = 'https://snake-os-vp.softportweb.com/static/snake-vr.js?v=nuevo456';
  servedVer = 'bbbbbbb-2222';                       // nuevo deploy, mismo archivo de VR
  reloads = 0;
  api.update();
  await tick();
  ok(reloads === 0, 'si el ?v= ya es el del servidor, no se recarga');
  ok(api.state.updNew === false, 'y se anota que no hay nada nuevo');

  /* En VR nunca recarga sola (no cortar la partida), pero sí avisa. */
  st.mode = 'xr';
  scripts[0].src = 'https://snake-os-vp.softportweb.com/static/snake-vr.js?v=otro789';
  servedVer = 'ccccccc-3333';
  served = '<script src="/static/snake-vr.js?v=zzz000"></script>';
  reloads = 0;
  api.update();
  await tick();
  ok(reloads === 0, 'dentro de VR no recarga aunque haya versión nueva');
  ok(api.state.updNew === true, 'pero avisa de que hay versión nueva');
}

case9().then(function () {
  console.log('');
  if (fails) {
    console.error(fails + ' comprobación(es) fallida(s)');
    process.exit(1);
  }
  console.log('todo correcto ✔');
});
