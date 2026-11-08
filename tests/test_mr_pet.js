#!/usr/bin/env node
/* Test del módulo de realidad mixta SNK-MR-MASCOTA.
 *
 *   node tests/test_mr_pet.js            (desde la raíz del repo)
 *   node /ruta/al/test_mr_pet.js         (busca el bloque donde esté)
 *
 * Comprueba, sin gafas:
 *   1. el bloque está en snake-vr.js y parsea sin errores
 *   2. el mapa de celdas sólo abre paso por suelo escaneado
 *   3. los obstáculos (muebles) no se pueden atravesar
 *   4. no se puede salir del cuarto
 *   5. la ruta rodea el mueble en vez de cruzarlo
 */
'use strict';

const fs = require('fs');
const path = require('path');
const vm = require('vm');

const START = '/* === SNK-MR-MASCOTA';
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
    '/Users/antonella/snake-vr-mr-block.js'
  ];
  for (const f of tries) {
    if (!fs.existsSync(f)) continue;
    const src = fs.readFileSync(f, 'utf8');
    const i = src.indexOf(START);
    if (i !== -1) return { file: f, code: src.slice(i) };
  }
  return null;
}

/* Vector3 mínimo: lo único de three.js que usa la lógica de navegación. */
class V3 {
  constructor(x, y, z) { this.x = x || 0; this.y = y || 0; this.z = z || 0; }
  clone() { return new V3(this.x, this.y, this.z); }
  copy(v) { this.x = v.x; this.y = v.y; this.z = v.z; return this; }
  set(x, y, z) { this.x = x; this.y = y; this.z = z; return this; }
  setY(y) { this.y = y; return this; }
  distanceTo(v) { return Math.hypot(this.x - v.x, this.y - v.y, this.z - v.z); }
  lengthSq() { return this.x * this.x + this.y * this.y + this.z * this.z; }
}

const found = findBlock();
if (!found) {
  console.error('no encuentro el bloque SNK-MR-MASCOTA (¿aplicaste el parche?)');
  process.exit(1);
}
console.log('bloque: ' + found.file);

/* Sandbox: sin DOM real y sin XR, sólo lo justo para que el IIFE se evalúe. */
const sandbox = {
  console: console,
  Math: Math,
  Promise: Promise,
  setTimeout: function () {},
  setInterval: function () {},
  location: { hash: '' },
  navigator: {},
  document: {
    readyState: 'complete',
    body: null,
    head: null,
    addEventListener: function () {},
    getElementById: function () { return null; },
    createElement: function () { return { style: {}, getContext: function () { return null; } }; }
  }
};
sandbox.window = sandbox;
sandbox.globalThis = sandbox;

let api = null;
try {
  vm.createContext(sandbox);
  vm.runInContext(found.code, sandbox, { filename: 'snake-vr.js#SNK-MR-MASCOTA', timeout: 5000 });
  api = sandbox.window.SnakeMr;
} catch (e) {
  console.error('  FAIL el bloque no evalúa: ' + e.message);
  process.exit(1);
}

console.log('\n1) carga');
ok(!!api, 'window.SnakeMr existe');
ok(api && typeof api.open === 'function' && typeof api.close === 'function', 'open()/close() disponibles');
ok(api && api.state().phase === 'idle' && api.state().progress === 0, 'estado inicial en reposo');

const t = api.__test;
t.setThree({ Vector3: V3 });
t.newMap();

console.log('\n2) mapa del cuarto (3 m × 3 m) con un mueble de 1 m × 1 m en el centro');
for (let x = -1.5; x <= 1.5 + 1e-9; x += 0.25) {
  for (let z = -1.5; z <= 1.5 + 1e-9; z += 0.25) t.stampFloor(x, z, 0.1);
}
const suelo = t.count();
ok(suelo >= 100, 'celdas de suelo escaneadas: ' + suelo);
t.addBlock(-0.5, 0.5, -0.5, 0.5, 0.4, 0.8);   // mesa en el centro
t.buildRoom();
ok(t.freeAt(1.2, 1.2), 'esquina libre: se puede andar');
ok(!t.freeAt(0, 0), 'centro con mueble: prohibido');
ok(!t.freeAt(9, 9), 'fuera del cuarto: prohibido');
ok(!t.freeAt(0, 0) && t.freeAt(1.2, 1.2), 'la comprobación distingue dentro/fuera');

console.log('\n3) ruta de esquina a esquina sin cruzar el mueble');
const ruta = t.findPath(new V3(1.2, 0, 1.2), new V3(-1.2, 0, -1.2));
ok(!!ruta && ruta.length > 3, 'hay ruta (' + (ruta ? ruta.length : 0) + ' waypoints)');
if (ruta) {
  const cruza = ruta.some((p) => Math.abs(p.x) < 0.5 && Math.abs(p.z) < 0.5);
  ok(!cruza, 'ningún waypoint cae dentro del mueble');
  const fuera = ruta.some((p) => Math.abs(p.x) > 1.76 || Math.abs(p.z) > 1.76);
  ok(!fuera, 'ningún waypoint sale de las celdas escaneadas');
}

console.log('\n4) sin suelo escaneado no hay ruta (no se inventa el cuarto)');
t.newMap();
t.setThree({ Vector3: V3 });
ok(t.findPath(new V3(0, 0, 0), new V3(1, 0, 1)) === null, 'sin mapa: findPath devuelve null');
ok(!t.freeAt(0, 0), 'sin mapa: freeAt es false');

console.log('');
if (fails) {
  console.error(fails + ' comprobación(es) fallida(s)');
  process.exit(1);
}
console.log('todo correcto ✔');
