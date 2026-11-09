/* Snake OS 2026.31: Doga Gorilla (juego VR tipo «gorilla tag», sin terror) y la
 * mascota MR sin límites (jardín + andar con el mando).
 *
 * Qué se comprueba (estático, sobre los ficheros reales):
 *  - doga_gorilla.py: página /doga-gorilla, /api/doga-gorilla/status, subdominio
 *    doga-gorilla.softportweb.com servido en «/» y main.py que lo incluye.
 *  - doga-gorilla.js: motor del juego — tres mundos bonitos, locomoción de manos
 *    (empujar y arrastrar como en gorilla tag), límites del mundo (pared invisible
 *    con rebote y no caerse al vacío), cosas con las que jugar, HUD, sesión XR y
 *    vista previa en el PC; API window.DogaGorilla.
 *  - doga-gorilla.html + doga-gorilla-page.js: botones, mundos y estado en vivo.
 *  - snake-vr.js: la mascota MR ya no exige escanear y se pasea por el jardín.
 *  - index.html: versión 2026.31, entrada de novedades primera, README al día.
 */
'use strict';
var fs = require('fs');
var path = require('path');
var vm = require('vm');
var assert = require('assert');
var root = path.join(__dirname, '..');

function ok(msg) { console.log('ok', msg); }
function read(name) { return fs.readFileSync(path.join(root, name), 'utf8'); }

var main = read('main.py');
var srv = read('doga_gorilla.py');
var game = read('doga-gorilla.js');
var page = read('doga-gorilla.html');
var pageJs = read('doga-gorilla-page.js');
var pet = read('snake-vr.js');
var html = read('index.html');
var readme = read('README.md');

/* 1) Servidor: la página y el subdominio */
assert.ok(srv.indexOf('GAME_VERSION = "2026.31"') >= 0, 'versión del juego 2026.31');
assert.ok(srv.indexOf('HOST = "doga-gorilla."') >= 0, 'subdominio doga-gorilla.*');
assert.ok(srv.indexOf('@r.get("/doga-gorilla")') >= 0, 'ruta /doga-gorilla');
assert.ok(srv.indexOf('@r.get("/api/doga-gorilla/status")') >= 0, 'estado del juego por API');
assert.ok(srv.indexOf('def build_router()') >= 0 && srv.indexOf('def install_hosts(app)') >= 0, 'router + host');
assert.ok(srv.indexOf('FileResponse(_PAGE') >= 0, 'sirve la página del juego');
assert.ok(main.indexOf('import doga_gorilla') >= 0, 'main.py incluye doga_gorilla');
assert.ok(main.indexOf('doga_gorilla.build_router()') >= 0, 'main.py monta el router');
assert.ok(main.indexOf('doga_gorilla.install_hosts(app)') >= 0, 'main.py enruta el subdominio');
assert.ok(main.indexOf('"js", "mjs", "css"') >= 0, 'los .js del juego pasan la lista blanca de /static');
ok('servidor: página /doga-gorilla, API de estado y subdominio');

/* 2) Motor: mundos, manos, física y límites */
assert.ok(game.indexOf("var VERSION = '2026.31'") >= 0, 'versión del motor 2026.31');
assert.ok(game.indexOf("'/static/assets/three-r160.min.js?v=r160'") >= 0, 'usa el three.js local');
['prado', 'caramelo', 'cristal'].forEach(function (id) {
  assert.ok(game.indexOf(id + ': {') >= 0, 'mundo ' + id);
});
assert.ok(game.indexOf('Prado de las Nubes') >= 0 && game.indexOf('Isla Caramelo') >= 0
  && game.indexOf('Selva de Cristal') >= 0, 'los tres mundos tienen nombre bonito');
assert.ok(game.indexOf('radius: 26') >= 0 && game.indexOf('radius: 24') >= 0
  && game.indexOf('radius: 25') >= 0, 'cada mundo tiene su radio (límite)');
/* locomoción de manos: sin sticks */
assert.ok(game.indexOf('var HAND_REACH = 1.0') >= 0, 'alcance de la mano al suelo');
assert.ok(game.indexOf('var PUSH_K = 4.5') >= 0, 'constante de empuje');
assert.ok(game.indexOf('var MAX_SPEED = 9.5') >= 0, 'tope de velocidad');
assert.ok(game.indexOf('var GRAVITY = -12.5') >= 0, 'gravedad del salto');
assert.ok(game.indexOf('function armPush(dt)') >= 0, 'empujar con los brazos');
assert.ok(game.indexOf('S.vel.addScaledVector(h.vel, -k)') >= 0, 'la mano empuja al lado contrario');
assert.ok(game.indexOf('function readHands(frame)') >= 0, 'lee las manos del visor');
assert.ok(game.indexOf('function physics(dt)') >= 0, 'física del cuerpo');
/* límites duros */
assert.ok(game.indexOf('radius - 0.9') >= 0 || game.indexOf('radius-0.9') >= 0, 'pared invisible en el borde');
assert.ok(game.indexOf('var FALL_Y = -9') >= 0, 'no se puede caer al vacío');
assert.ok(game.indexOf('function respawn(') >= 0, 'si bajas, vuelves al centro');
assert.ok(game.indexOf('function buildWorld(name)') >= 0, 'se construye el mundo elegido');
ok('motor: mundos, manos que empujan y límites del mundo');

/* 3) Cosas con las que jugar, HUD, XR y vista previa */
['function addOrb', 'function addBouncer', 'function addSpinner', 'function addBell',
 'function addCritter', 'function propTouch', 'function updateProps',
 'function makeHud', 'function drawHud', 'function placeHud',
 'function start(opts)', 'function startPreview(host, opts)', 'function stopAll()',
 'function state()', 'function pushState'].forEach(function (fn) {
  assert.ok(game.indexOf(fn) >= 0, fn);
});
assert.ok(game.indexOf("requestSession('immersive-vr'") >= 0, 'pide sesión de VR');
assert.ok(game.indexOf("'hand-tracking'") >= 0, 'admite seguimiento de manos');
assert.ok(game.indexOf('function onFrame(time, frame)') >= 0, 'bucle de fotogramas XR');
assert.ok(game.indexOf('renderer.xr.setSession') >= 0, 'three.js dentro de la sesión');
assert.ok(game.indexOf('hapticActuators') >= 0, 'vibración de los mandos');
assert.ok(game.indexOf('global.DogaGorilla = {') >= 0, 'API pública');
ok('motor: cosas que tocar, cartel de estado, sesión XR y vista previa');


/* 4) La API se evalúa de verdad (sin DOM ni XR) y responde */
var win = { navigator: {}, console: console, performance: { now: function () { return 0; } } };
win.window = win;
win.document = {
  getElementById: function () { return null; },
  createElement: function () { return { style: {}, getContext: function () { return null; } }; },
  head: { appendChild: function () {} },
  addEventListener: function () {},
  body: { classList: { add: function () {}, remove: function () {}, toggle: function () {} } }
};
vm.runInNewContext(game, win, { filename: 'doga-gorilla.js' });

var G = win.DogaGorilla;
assert.ok(G, 'window.DogaGorilla existe');
assert.strictEqual(G.version, '2026.31', 'la API dice la versión');
assert.strictEqual(G.supported(), false, 'sin navigator.xr no hay VR');
var worlds = G.worlds();
assert.strictEqual(worlds.length, 3, 'tres mundos en la API');
assert.ok(worlds.some(function (w) { return w.id === 'prado' && w.radius === 26; }), 'el prado tiene su radio');
assert.strictEqual(G.world(), 'prado', 'empieza en el prado');
assert.strictEqual(G.world('caramelo'), 'caramelo', 'se cambia de mundo');
assert.strictEqual(G.world('no-existe'), 'caramelo', 'un mundo que no existe no rompe nada');
var st = G.state();
assert.strictEqual(st.running, false, 'al principio no está corriendo');
assert.strictEqual(st.world, 'caramelo', 'el estado dice el mundo');
assert.ok(typeof st.orbs === 'number' && typeof st.bells === 'number', 'el estado trae los marcadores');
assert.strictEqual(typeof st.version, 'string', 'el estado trae la versión');
assert.strictEqual(G.stop().running, false, 'parar dos veces no rompe');
ok('API: version, supported, worlds, world, state y stop funcionan de verdad');

/* 5) La página: botones, mundos y estado */
assert.ok(page.indexOf('/static/doga-gorilla.js') >= 0, 'la página carga el motor');
assert.ok(page.indexOf('/static/doga-gorilla-page.js') >= 0, 'la página carga su controlador');
assert.ok(page.indexOf('id="go"') >= 0 && page.indexOf('id="prev"') >= 0
  && page.indexOf('id="out"') >= 0, 'botones de entrar, vista previa y salir');
assert.ok(page.indexOf('data-world="prado"') >= 0 && page.indexOf('data-world="caramelo"') >= 0
  && page.indexOf('data-world="cristal"') >= 0, 'los tres mundos en la página');
assert.ok(page.indexOf('sin nada de terror') >= 0, 'dice que no hay terror');
assert.ok(page.indexOf('arrástralas') >= 0, 'explica que se anda arrastrando las manos');
assert.ok(page.indexOf('no se puede caer al vacío') >= 0, 'explica los límites');
assert.ok(page.indexOf('WebXR') >= 0, 'avisa de que hace falta WebXR');
assert.ok(pageJs.indexOf('G.start({') >= 0, 'la página entra en VR');
assert.ok(pageJs.indexOf('G.startPreview(') >= 0, 'la página abre la vista previa');
assert.ok(pageJs.indexOf('G.stop()') >= 0, 'la página sabe salir');
assert.ok(pageJs.indexOf('function paint(s)') >= 0, 'la página pinta el estado');
ok('página: entrar, vista previa, salir, mundos y estado en vivo');

/* 6) La mascota MR: sin escanear y con jardín para pasear */
assert.ok(pet.indexOf('GARDEN_R') >= 0, 'el jardín tiene radio propio');
assert.ok(pet.indexOf('function buildGarden(') >= 0, 'se construye el jardín');
assert.ok(pet.indexOf('function setWorld(') >= 0 && pet.indexOf('function toggleWorld(') >= 0,
  'se cambia de jardín a habitación');
assert.ok(pet.indexOf('function walkSticks(') >= 0, 'andar con los sticks en el jardín');
assert.ok(pet.indexOf('2026.31') >= 0, 'la mascota MR va por la 2026.31');
ok('mascota MR: jardín, cambio de mundo y andar con el mando');

/* 7) index.html y README */
assert.ok(html.indexOf("window.SNAKE_OS_VERSION='2026.31'") >= 0, 'versión 2026.31');
assert.ok(html.indexOf("{v:'2026.31'") >= 0, 'entrada de novedades 2026.31');
assert.ok(html.indexOf("{v:'2026.31'") < html.indexOf("{v:'2026.23'"), 'la entrada 2026.31 va primera');
assert.ok(html.indexOf('Doga Gorilla') >= 0, 'las novedades hablan de Doga Gorilla');
assert.ok(html.indexOf('gorilla tag') >= 0, 'explican a qué se juega');
assert.ok(readme.indexOf('2026.31') >= 0, 'README cita la versión 2026.31');
assert.ok(readme.indexOf('doga-gorilla') >= 0, 'README cita el juego');
assert.ok(readme.indexOf('doga-gorilla.softportweb.com') >= 0, 'README cita el subdominio');
ok('index.html y README en 2026.31');

console.log('\ntest_release_2631 OK');
