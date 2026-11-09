/* Snake OS 2026.31: Doga Gorilla (juego VR tipo «gorilla tag», sin terror) y la
 * mascota MR sin límites (jardín + andar con el mando).
 *
 * Qué se comprueba (estático, sobre los ficheros reales):
 *  - doga_gorilla.py: página /doga-gorilla, /api/doga-gorilla/status, subdominio
 *    doga-gorilla.softportweb.com servido en «/» y main.py que lo incluye.
 *  - doga-gorilla.js: motor del juego — tres mundos bonitos, locomoción de manos
 *    (empujar y arrastrar como en gorilla tag), cuerpo de monke con brazos largos y
 *    las dos manos siguiendo a los mandos, suelo a la altura del pecho (EYE_MONKE) y
 *    gatillo para agarrarse y trepar, límites del mundo (pared invisible con rebote y
 *    no caerse al vacío), cosas con las que jugar, HUD, sesión XR y vista previa en el
 *    PC; API window.DogaGorilla.
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
/* la página se sirve reescrita con el ?v= real de cada estático (caché de Cloudflare) */
assert.ok(srv.indexOf('def _render_page()') >= 0, 'la página se reescribe al servirla');
assert.ok(srv.indexOf('_STATIC_REF_RE') >= 0, 'busca los /static/ de la página');
assert.ok(srv.indexOf('def _asset_token(rel: str)') >= 0, 'token por archivo (mtime+tamaño)');
assert.ok(srv.indexOf('HTMLResponse(') >= 0, 'sirve la página del juego desde memoria');
assert.ok(srv.indexOf('def _assets_sig()') >= 0, 'firma del motor para el sello de build');
assert.ok(fs.existsSync(path.join(root, 'tests/test_doga_gorilla_cache.py')),
  'hay test del token de caché de la página');
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
assert.ok(game.indexOf('var HAND_REACH = 1.15') >= 0, 'alcance de la mano al suelo');
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

/* 2b) Cuerpo de monke visible y suelo a la altura del pecho (estilo gorilla tag) */
assert.ok(game.indexOf('var EYE_MONKE = 1.15') >= 0, 'los ojos del monke van a 1,15 m del suelo');
assert.ok(game.indexOf('var DROP_MAX = 1.05') >= 0, 'el cuerpo se puede bajar hasta 1,05 m');
assert.ok(game.indexOf('function buildAvatar()') >= 0, 'se construye el cuerpo del monke');
assert.ok(game.indexOf('function updateAvatar(frame)') >= 0, 'el cuerpo se coloca cada fotograma');
assert.ok(game.indexOf('function makeHand(') >= 0, 'cada mano es una malla propia');
assert.ok(game.indexOf("g.name = 'doga-gorilla-monke'") >= 0, 'el cuerpo se llama doga-gorilla-monke');
assert.ok(game.indexOf('S.player.add(g)') >= 0, 'el cuerpo cuelga del jugador');
assert.ok(game.indexOf('makeHand(furMat, skinMat)') >= 0, 'se ven las dos manos');
assert.ok(game.indexOf('hand.g.quaternion.copy(quat)') >= 0, 'las manos siguen a los mandos');
assert.ok(game.indexOf('function btn(src, i)') >= 0 && game.indexOf('grab: !!btn(src, 1)') >= 0,
  'el gatillo (grip) agarra');
assert.ok(game.indexOf('function trunkNear(h)') >= 0 && game.indexOf('S.trunks.push(') >= 0,
  'los troncos se pueden agarrar para trepar');
assert.ok(game.indexOf('climb.now.y - climb.prev.y') >= 0, 'trepar moviendo las manos 1:1');
assert.ok(game.indexOf('eyeY - EYE_MONKE') >= 0, 'el suelo se sube hasta el pecho');
assert.ok(game.indexOf('S.player.position.set(S.pos.x, S.pos.y - drop, S.pos.z)') >= 0,
  'el cuerpo va bajado «drop»');
assert.ok(game.indexOf('S.pos.y + h.now.y - (S.drop || 0)') >= 0, 'empujar cuenta el cuerpo bajado');
assert.ok(game.indexOf('monke: 0x') >= 0 && game.indexOf('function paintMonke()') >= 0,
  'cada mundo tiene su monke de color');
['torso', 'belly', 'muzzle', 'earL', 'shL', 'armL', 'hands'].forEach(function (part) {
  assert.ok(game.indexOf(part + ':') >= 0, 'el cuerpo tiene ' + part);
});
assert.ok(game.indexOf('setFromUnitVectors(new T.Vector3(0, 1, 0)') >= 0, 'los brazos apuntan a las manos');
ok('monke: cuerpo visible, manos con los mandos, trepar y suelo al pecho');

/* 2c) Look pixelado, como Gorilla Tag: caras planas, texturas de píxeles y paleta */
assert.ok(game.indexOf('var PIXEL = true') >= 0, 'el motor va en modo pixelado');
assert.ok(game.indexOf('function flatMat(opts)') >= 0 && game.indexOf('flatShading = true') >= 0,
  'todas las mallas usan caras planas (flat shading)');
assert.ok(game.indexOf('function pixelTex(rows, palette, opts)') >= 0, 'texturas de píxeles por mapa de letras');
assert.ok(game.indexOf('t.magFilter = T.NearestFilter') >= 0
  && game.indexOf('t.minFilter = T.NearestFilter') >= 0, 'las texturas no se suavizan (nearest)');
assert.ok(game.indexOf('var FUR_MAP = [') >= 0 && game.indexOf('var GRASS_MAP = [') >= 0,
  'hay pelo de monke y hierba dibujados píxel a píxel');
assert.ok(game.indexOf('var MONKES = {') >= 0 && game.indexOf('blue: 0x2f6fd0') >= 0
  && game.indexOf('purple: 0x8b5cf6') >= 0, 'paleta de monkes del gorilla tag original');
assert.ok(game.indexOf('new T.IcosahedronGeometry(0.34, 1)') >= 0, 'el torso es un icosaedro (pocos polígonos)');
assert.ok(game.indexOf('new T.BoxGeometry(0.19, 0.13, 0.22)') >= 0, 'la palma de la mano es un bloque');
assert.ok(game.indexOf('var PIXEL_RES = 0.55') >= 0, 'la vista previa se dibuja a menos resolución');
assert.ok(game.indexOf("dom0.style.imageRendering = 'pixelated'") >= 0, 'los píxeles se estiran sin suavizar');
assert.ok(game.indexOf('var HUD_W = 288, HUD_H = 144') >= 0, 'el cartel es un lienzo de píxeles pequeño');
assert.ok(game.indexOf('function hudText(g, txt, x, y, size, color, bold)') >= 0
  && game.indexOf('function hudBlock(g, x, y, size, color)') >= 0, 'cartel con texto y bloques de píxeles');
assert.ok(game.indexOf('var STEPS = 12') >= 0, 'el cielo va en bandas de píxeles (sin degradado fino)');
assert.ok(game.indexOf('pixel: !!PIXEL') >= 0, 'el estado y la API dicen que el look es pixelado');
assert.ok(game.indexOf('pixelTex: !!(S.body') >= 0 && game.indexOf('palette: MONKES') >= 0,
  'la API del monke cuenta el look');
ok('look pixelado: caras planas, texturas nearest, paleta de monkes y cartel de píxeles');

/* 2c) Pruebas de humo de verdad: hay dos ficheros que arrancan el motor */
['tests/test_doga_gorilla_smoke.js', 'tests/test_doga_gorilla_xr.js'].forEach(function (f) {
  assert.ok(fs.existsSync(path.join(root, f)), 'existe ' + f);
  var src = fs.readFileSync(path.join(root, f), 'utf8');
  assert.ok(src.indexOf('assets/three-r160.min.js') >= 0, f + ' usa el three.js real');
  assert.ok(src.indexOf('WebGLRenderer') >= 0, f + ' cambia sólo el renderer');
});
ok('pruebas de humo: vista previa y VR falsa arrancan el motor de verdad');

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
assert.strictEqual(st.body, false, 'sin jugar aún no hay cuerpo');
assert.strictEqual(st.drop, 0.5, 'el estado dice cuánto va bajado el suelo');
assert.ok(typeof st.orbs === 'number' && typeof st.bells === 'number', 'el estado trae los marcadores');
assert.strictEqual(typeof st.version, 'string', 'el estado trae la versión');
var mk = G.monke();
assert.strictEqual(typeof G.monke, 'function', 'la API cuenta cómo va el monke');
assert.strictEqual(mk.body, false, 'sin escena no hay cuerpo montado');
assert.strictEqual(typeof mk.drop, 'number', 'el monke dice cuánto va bajado el cuerpo');
assert.strictEqual(mk.grabbing, null, 'de primeras no está agarrado a nada');
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
assert.ok(page.indexOf('monke sin piernas') >= 0, 'explica que eres un monke sin piernas');
assert.ok(page.indexOf('brazos largos y manos visibles') >= 0, 'dice que se ven cuerpo y manos');
assert.ok(page.indexOf('suelo queda a la altura del pecho') >= 0, 'explica el suelo al pecho');
assert.ok(page.indexOf('gatillo apretado') >= 0 && page.indexOf('trepar') >= 0, 'explica cómo trepar');
assert.ok(page.indexOf('id="kBody"') >= 0, 'la página muestra el cuerpo');
assert.ok(pageJs.indexOf('kBody') >= 0, 'la página pinta el cuerpo');
/* look pixelado y caché del motor */
assert.ok(page.indexOf('id="kLook"') >= 0 && pageJs.indexOf('kLook') >= 0, 'la página muestra el look');
assert.ok(page.indexOf('image-rendering: pixelated') >= 0, 'el lienzo del juego se estira sin suavizar');
assert.ok(page.indexOf('look pixelado') >= 0, 'la página cuenta que el look es pixelado');
assert.ok(page.indexOf('?v=auto') >= 0, 'el ?v= lo pone el servidor (token real, sin caché vieja)');
assert.ok(pageJs.indexOf("split('?v=')") >= 0 && pageJs.indexOf('stampBuild') >= 0,
  'la página enseña el build servido');
assert.ok(page.indexOf('id="build"') >= 0, 'la página tiene sello de build');
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
assert.ok(readme.indexOf('EYE_MONKE') >= 0 && readme.indexOf('buildAvatar') >= 0,
  'README cuenta el cuerpo y el suelo al pecho');
assert.ok(readme.indexOf('trepar') >= 0 && readme.indexOf('S.trunks') >= 0, 'README cuenta cómo trepar');
assert.ok(readme.indexOf('pixel') >= 0 || readme.indexOf('píxeles') >= 0, 'README cuenta el look pixelado');
assert.ok(readme.indexOf('PIXEL_RES') >= 0 || readme.indexOf('NearestFilter') >= 0,
  'README explica las texturas de píxeles');
assert.ok(readme.indexOf('_render_page') >= 0 || readme.indexOf('max-age=14400') >= 0,
  'README explica la caché del motor (?v= real)');
ok('index.html y README en 2026.31');

console.log('\ntest_release_2631 OK');
