/* Snake OS 2026.32: Doga Tag VR sustituye al juego de 2026.31 en /doga-gorilla.
 *
 * Qué se comprueba (estático, sobre los ficheros reales):
 *  - el juego viejo (doga-gorilla.js / doga-gorilla-page.js / doga-gorilla.html) ya NO está;
 *  - doga_gorilla.py sirve la carpeta doga-tag-vr/, sus archivos por /doga-gorilla/files/ con
 *    rutas saneadas y el ?v= real, la API de estado y el subdominio de Cloudflare;
 *  - doga-tag-vr/index.html: importmap de three, módulo game.js, HUD y tarjeta de inicio;
 *  - doga-tag-vr/game.js: locomoción de brazos, huesos, tienda, power-ups, bots, ciudad,
 *    pilla-pilla, audio procedural, WebXR y API window.__game;
 *  - index.html (versión 2026.32 y sus novedades), README al día y la mascota MR igual.
 */
'use strict';
var fs = require('fs');
var path = require('path');
var assert = require('assert');
var root = path.join(__dirname, '..');

function ok(msg) { console.log('ok', msg); }
function read(name) { return fs.readFileSync(path.join(root, name), 'utf8'); }
function hay(src, txt, msg) { assert.ok(src.indexOf(txt) >= 0, msg + ' (' + txt + ')'); }

var main = read('main.py');
var srv = read('doga_gorilla.py');
var page = read('doga-tag-vr/index.html');
var game = read('doga-tag-vr/game.js');
var pet = read('snake-vr.js');
var html = read('index.html');
var readme = read('README.md');

/* 1) El juego anterior ya no está: se sustituye, no se mezcla */
['doga-gorilla.js', 'doga-gorilla-page.js', 'doga-gorilla.html'].forEach(function (f) {
  assert.ok(!fs.existsSync(path.join(root, f)), 'ya no está ' + f);
});
['tests/test_doga_gorilla_smoke.js', 'tests/test_doga_gorilla_xr.js', 'tests/test_doga_gorilla_cache.py']
  .forEach(function (f) {
    assert.ok(!fs.existsSync(path.join(root, f)), 'ya no está ' + f);
  });
['index.html', 'game.js', 'lib/three.module.js', 'lib/VRButton.js'].forEach(function (f) {
  assert.ok(fs.existsSync(path.join(root, 'doga-tag-vr', f)), 'está doga-tag-vr/' + f);
});
ok('sustitución: fuera el juego viejo, dentro doga-tag-vr/');

/* 2) Servidor: la carpeta del juego, rutas saneadas y caché por token */
assert.ok(/GAME_VERSION = "2026\.\d{2}"/.test(srv), 'versión del juego (2026.32 o posterior)');
hay(srv, 'GAME_NAME = "Doga Tag VR"', 'nombre del juego');
hay(srv, '_GAME_DIR = _APP_DIR / "doga-tag-vr"', 'sirve la carpeta doga-tag-vr');
hay(srv, '_FILES_URL = "/doga-gorilla/files/"', 'los archivos van por /doga-gorilla/files/');
hay(srv, '@r.get("/doga-gorilla")', 'ruta /doga-gorilla');
hay(srv, '@r.get("/doga-tag-vr")', 'alias /doga-tag-vr');
hay(srv, '@r.get(_FILES_URL + "{rel:path}")', 'ruta de los archivos del juego');
hay(srv, '@r.get("/api/doga-gorilla/status")', 'estado del juego por API');
hay(srv, 'HOST = "doga-gorilla."', 'subdominio doga-gorilla.*');
hay(srv, 'def build_router()', 'router');
hay(srv, 'def install_hosts(app)', 'subdominio servido en /');
hay(srv, 'def _safe_rel(rel: str)', 'rutas saneadas (sin salir de la carpeta)');
hay(srv, 'def _asset_token(rel: str)', 'token por archivo (mtime+tamaño)');
hay(srv, 'def _render_page()', 'la página se reescribe al servirla');
hay(srv, '_REL_REF_RE', 'busca las referencias ./archivo de la página');
hay(srv, 'FileResponse(', 'sirve los archivos del juego');
hay(srv, '"text/javascript; charset=utf-8"', 'los módulos ES van como javascript');
hay(srv, 'public, max-age=31536000, immutable', 'con el ?v= bueno, caché larga');
hay(srv, 'no-store', 'la página no se cachea');
hay(main, 'import doga_gorilla', 'main.py incluye doga_gorilla');
hay(main, 'doga_gorilla.build_router()', 'main.py monta el router');
hay(main, 'doga_gorilla.install_hosts(app)', 'main.py enruta el subdominio');
assert.ok(fs.existsSync(path.join(root, 'tests/test_doga_tag_vr.js')), 'hay prueba del motor');
assert.ok(fs.existsSync(path.join(root, 'tests/test_doga_tag_vr.py')), 'hay prueba del servidor');
ok('servidor: carpeta del juego, /doga-gorilla/files/, token de caché y estado');

/* 3) Página del juego */
hay(page, '<script type="importmap">', 'importmap');
hay(page, '"three":"./lib/three.module.js"', 'three local (sin CDN)');
hay(page, '<script type="module" src="./game.js">', 'arranca game.js como módulo');
['hud', 'status', 'score', 'bones', 'power', 'cross', 'start', 'vrslot', 'play', 'musicToggle']
  .forEach(function (id) { hay(page, 'id="' + id + '"', 'la página tiene #' + id); });
hay(page, 'Jugar en escritorio', 'botón de jugar');
hay(page, 'WASD', 'controles de escritorio');
hay(page, 'manos contra el suelo', 'explica la locomoción de brazos');
hay(page, 'joystick izquierdo', 'explica que en VR se anda con el joystick');
hay(page, 'Doga-huesos', 'los huesos');
hay(page, 'Tienda Doganiero', 'la tienda');
hay(page, 'la lleva', 'quién la lleva');
ok('página: importmap, módulo, HUD, tarjeta y controles');

/* 4) Motor: pilla-pilla, brazos, huesos, tienda, power-ups, ciudad y XR */
hay(game, "import * as THREE from 'three';", 'usa three por el importmap');
hay(game, "import { VRButton } from './lib/VRButton.js';", 'importa el VRButton del juego');
hay(game, "const params = new URLSearchParams(location.search);", 'lee los parámetros de la URL');
hay(game, "const AUTOSTART = params.has('autostart');", 'modo autostart para pruebas');
hay(game, 'const renderer = new THREE.WebGLRenderer(', 'renderizador WebGL');
hay(game, 'renderer.xr.enabled = true;', 'WebXR activado');
hay(game, 'renderer.setAnimationLoop(', 'bucle de animación del visor');
hay(game, 'function updatePlayerDesktop(dt, t)', 'andar en el ordenador');
hay(game, 'function updatePlayerVR(dt)', 'locomoción de brazos en VR');
hay(game, 'function insideSurface(p)', 'las manos detectan superficies');
hay(game, 'h.anchor = s; vibrate(i);', 'la mano se ancla y vibra el mando');
hay(game, 'player.vel.copy(v.multiplyScalar(1.25 * powerMul().fling)', 'al soltar sale disparado');
hay(game, 'function supportHeight(', 'altura de apoyo (suelo, rocas, azoteas)');
hay(game, 'function pushOut(', 'choques contra troncos y edificios');
hay(game, 'const WORLD_R = 58;', 'límite del mundo');
hay(game, 'const CITY = { minX: -15, maxX: 15, minZ: -52, maxZ: -23 };', 'Ciudad Doganiero');
hay(game, 'const CITY_SPOTS = [];', 'Coleccionables en la ciudad');
hay(game, "const BOT_NAMES = ['Dogabot'", 'los bots tienen nombre');
hay(game, 'function makeGorilla(', 'cuerpo de monke');
hay(game, 'function makeBlockyHand(', 'manos de bloques');
hay(game, "new THREE.TextureLoader().load('./assets/doganiero-icon.png'", 'emblema de Doganiero');
hay(game, 'function setIt(ent, by)', 'pasar la etiqueta');
hay(game, 'function checkTags()', 'tocar para pillar');
hay(game, 'const IT_COLOR = new THREE.Color(0xff3b2f);', 'quien la lleva brilla en rojo');
hay(game, 'const BONE_N = 24;', '24 Doga-huesos');
hay(game, 'const boneIM = new THREE.InstancedMesh(', 'los huesos van en un InstancedMesh');
hay(game, 'function updateCollectibles(dt, t)', 'recoger huesos y power-ups');
hay(game, 'const power = { snake: 0, speed: 0 };', 'power-ups');
hay(game, 'const powerMul = () =>', 'efectos de los power-ups');
hay(game, 'const HATS = {', 'gorros de la tienda');
hay(game, 'const COLORS = {', 'colores de pelo');
hay(game, 'function pressShop(btn)', 'comprar en la tienda');
hay(game, 'function shopRaycast(', 'tocar los botones de la tienda');
hay(game, 'localStorage.setItem(SAVE_KEY', 'guarda la partida');
hay(game, 'function playImpact(', 'sonidos por superficie');
hay(game, 'const SURFACE_FX = {', 'hierba, madera, piedra, cemento y metal');
hay(game, 'function composeTitleMusic(', 'música propia del menú');
hay(game, 'window.__game = {', 'API para las pruebas');
var apiStart = game.indexOf('window.__game = {');
var api = game.slice(apiStart, game.indexOf('};', apiStart));
['scene', 'rig', 'camera', 'entities', 'player', 'hands', 'bones', 'powerItems', 'power',
  'shopButtons', 'pressShop', 'setIt', 'save', 'tagBurst', 'CITY', 'CITY_SPOTS', 'keys', 'surfaceAt']
  .forEach(function (k) { hay(api, k, 'la API expone ' + k); });
ok('motor: brazos, pilla-pilla, huesos, tienda, power-ups, ciudad, audio y API');


/* 5) index.html: versión 2026.32 con sus novedades del juego */
hay(html, "window.SNAKE_OS_VERSION='2026.", 'la versión de Snake OS se publica ahí');
assert.ok(/window\.SNAKE_OS_VERSION='2026\.\d{2}'/.test(html), 'versión de Snake OS con formato 2026.xx');
hay(html, "{v:'2026.32'", 'entrada de novedades 2026.32');
assert.ok(html.indexOf("{v:'2026.32'") < html.indexOf("{v:'2026.31'"),
  'la entrada 2026.32 va primera');
hay(html, 'Doga Tag VR', 'las novedades hablan de Doga Tag VR');
hay(html, 'gorilla tag', 'explican a qué se juega');
hay(html, 'Doga-huesos', 'los huesos en las novedades');
hay(html, 'Tienda Doganiero', 'la tienda en las novedades');
hay(html, 'Ciudad Doganiero', 'la ciudad en las novedades');
hay(html, 'Salto Snake', 'los power-ups en las novedades');
assert.ok(html.indexOf('Doga Tag VR: the VR game') >= 0, 'las novedades están también en inglés');
assert.ok(html.indexOf("'Doga Gorilla: juego nuevo") < 0, 'ya no anuncian el juego viejo');
ok('index.html: versión 2026.32 y novedades del juego nuevo (es/en)');

/* 6) README al día */
['2026.32', 'Doga Tag VR', 'doga-gorilla.softportweb.com', '/doga-gorilla/files/',
  'three.module.js', 'test_doga_tag_vr.js', 'huesos', 'Tienda Doganiero'].forEach(function (t) {
    hay(readme, t, 'README cita ' + t);
});
hay(readme, 'updatePlayerVR', 'README cuenta la locomoción de brazos');
hay(readme, '_REL_REF_RE', 'README explica la caché por token');
ok('README: sección del juego nuevo, caché y pruebas');

/* 7) La mascota MR sigue como en 2026.31 (no se toca) */
hay(pet, 'GARDEN_R', 'el jardín de la mascota sigue');
hay(pet, 'function walkSticks(', 'andar con el mando sigue');
ok('mascota MR: jardín y andar con el mando intactos');

console.log('\ntest_release_2632 OK');

