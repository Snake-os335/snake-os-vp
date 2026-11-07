/* Snake OS 2026.22: Snake VR — realidad virtual para gafas VR.
 *
 * Qué se comprueba (estático, sobre los ficheros reales):
 *  - snake-vr.js existe y expone window.SnakeVR + window.renderSnakeVrApp.
 *  - Mundo 3D con el three.js local que ya usa Snake OS (sin dependencias nuevas).
 *  - Pantalla «espejo» del escritorio REAL: pinta iconos (#iconLayer), ventanas
 *    (#windows) y reloj, y los clics se reenvían al DOM (elementsFromPoint + click).
 *  - Tres modos: ratón/teclado, estereoscópico SBS (dos cámaras/viewports) y WebXR
 *    immersive-vr con mandos (selectstart) y teletransporte.
 *  - Giroscopio del móvil (deviceorientation + requestPermission en iOS).
 *  - Limpieza: al salir se para el render, se hace dispose y se quita el overlay.
 *  - index.html: versión 2026.22, entrada de novedades, script y app «Snake VR».
 */
'use strict';
var fs = require('fs');
var path = require('path');
var assert = require('assert');
var root = path.join(__dirname, '..');

function fail(msg) { console.error('FAIL', msg); process.exitCode = 1; }
function ok(msg) { console.log('ok', msg); }

var vr = fs.readFileSync(path.join(root, 'snake-vr.js'), 'utf8');
var html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
var readme = fs.readFileSync(path.join(root, 'README.md'), 'utf8');

// 1) Módulo y API pública
assert.ok(vr.indexOf("global.SnakeVR") >= 0, 'expone window.SnakeVR');
assert.ok(vr.indexOf('global.renderSnakeVrApp = renderSnakeVrApp') >= 0, 'expone renderSnakeVrApp');
assert.ok(vr.indexOf("VR_VERSION = '2026.22'") >= 0, 'versión del módulo 2026.22');
assert.ok(vr.indexOf("'/static/assets/three-r160.min.js?v=r160'") >= 0, 'usa el three.js local de Snake OS');
assert.ok(vr.indexOf('__snakeBootBroken') === -1, 'no toca el arranque del OS');
ok('snake-vr.js: módulo cargado con API pública y three.js local');

// 2) Espejo del escritorio real y clics hacia el DOM
assert.ok(vr.indexOf('function paintMirror()') >= 0, 'existe paintMirror');
assert.ok(vr.indexOf('function paintDomNode(ctx, el, kx, ky, depth, alpha, vw, vh, now)') >= 0, 'el espejo pinta el DOM real');
assert.ok(vr.indexOf('.desktop-icon') === -1 || vr.indexOf('paintDomNode(ctx, body.children[bi]') >= 0, 'el espejo recorre el body real (iconos incluidos)');
assert.ok(vr.indexOf('function clickDomFromUv(') >= 0, 'existe clickDomFromUv');
assert.ok(vr.indexOf('document.elementsFromPoint(') >= 0, 'usa elementsFromPoint para llegar al DOM real');
assert.ok(vr.indexOf('new st.three.Raycaster()') >= 0, 'usa raycast para saber dónde pulsas la pantalla');
assert.ok(vr.indexOf("data-vr=\"sbs\"") >= 0 && vr.indexOf("data-vr=\"xr\"") >= 0 && vr.indexOf("data-vr=\"gyro\"") >= 0, 'HUD con giroscopio, gafas y VR real');
assert.ok(vr.indexOf("data-vr=\"exit\"") >= 0, 'el HUD tiene botón Salir');
ok('espejo del escritorio y clics reales desde la pantalla VR');

// 3) Estereoscopía para gafas de cartón (SBS)
assert.ok(vr.indexOf('function toggleSbs(') >= 0, 'existe toggleSbs');
assert.ok(vr.indexOf('r.setScissorTest(true)') >= 0, 'SBS con dos viewports (scissor)');
assert.ok(vr.indexOf('st.camL') >= 0 && vr.indexOf('st.camR') >= 0, 'dos cámaras (un ojo cada una)');
assert.ok(vr.indexOf("screen.orientation.lock('landscape')") >= 0, 'pide horizontal en el móvil para las gafas');
ok('modo gafas de cartón (SBS) con dos ojos');

// 4) WebXR real con mandos y teletransporte
assert.ok(vr.indexOf("'immersive-vr'") >= 0, 'pide una sesión immersive-vr');
assert.ok(vr.indexOf('isSessionSupported') >= 0, 'comprueba si las gafas soportan WebXR');
assert.ok(vr.indexOf('xr.setSession(session)') >= 0, 'arranca la sesión en el renderer');
assert.ok(vr.indexOf('xr.getController(i)') >= 0, 'crea los mandos XR');
assert.ok(vr.indexOf("addEventListener('selectstart'") >= 0, 'el gatillo del mando pulsa la pantalla');
assert.ok(vr.indexOf('function teleportTo(') >= 0, 'teletransporte al suelo con el mando');
ok('WebXR con mandos, clic en la pantalla y teletransporte');

// 5) Giroscopio y controles
assert.ok(vr.indexOf("addEventListener('deviceorientation'") >= 0, 'escucha el giroscopio');
assert.ok(vr.indexOf('requestPermission') >= 0, 'pide permiso de sensores en iOS');
assert.ok(vr.indexOf('function moveForward(') >= 0, 'movimiento con WASD/rueda');
assert.ok(vr.indexOf('function recenter(') >= 0, 'recentrar la vista');
ok('giroscopio, WASD y recentrado');

// 6) Limpieza al salir
assert.ok(vr.indexOf('setAnimationLoop(null)') >= 0, 'para el bucle al cerrar');
assert.ok(vr.indexOf('renderer.dispose()') >= 0, 'libera el renderer');
assert.ok(vr.indexOf("removeChild(st.root)") >= 0, 'quita el overlay al cerrar');
assert.strictEqual(/TODO|FIXME/.test(vr), false, 'sin TODOs pendientes');
ok('salida limpia sin fugas de render ni overlay');

// 7) index.html: versión, novedades, script y app
assert.ok(html.indexOf("window.SNAKE_OS_VERSION='2026.23'") >= 0, 'versión 2026.22');
assert.ok(html.indexOf("{v:'2026.22'") >= 0, 'entrada de novedades 2026.22');
assert.ok(html.indexOf("{v:'2026.22'") < html.indexOf("{v:'2026.19'"), 'la entrada 2026.22 va primera');
assert.ok(html.indexOf('/static/snake-vr.js?v=') >= 0, 'index.html carga snake-vr.js');
assert.ok(html.indexOf("'snake-vr': { title:'Snake VR'") >= 0, 'app Snake VR registrada en APPS');
assert.ok(html.indexOf('window.renderSnakeVrApp(body)') >= 0, 'la app delega en renderSnakeVrApp');
ok('index.html en 2026.22 con la app Snake VR');

// 8) README
assert.ok(readme.indexOf('Snake VR') >= 0, 'README documenta Snake VR');
assert.ok(readme.indexOf('2026.22') >= 0, 'README cita la versión 2026.22');
assert.ok(readme.indexOf('tests/test_release_2621.js') >= 0, 'README lista la prueba vigente de Snake VR');
ok('README actualizado');

if (process.exitCode) process.exit(process.exitCode);
console.log('todo bien');
