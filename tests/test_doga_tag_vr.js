/* Doga Tag VR: prueba de verdad del juego, sin WebGL, sin gafas y sin navegador.
 *
 * Carga el Three.js r160 de verdad (doga-tag-vr/lib/three.module.js) en un contexto
 * con un DOM mínimo, cambia sólo el WebGLRenderer (y el reloj) por dobles y arranca
 * doga-tag-vr/game.js. Así se ejecutan de verdad el bosque, la Ciudad Doganiero, los
 * bots, los huesos, los power-ups, la Tienda, el HUD y la locomoción de manos en VR,
 * y se comprueba que:
 *  - el mundo se construye (suelo, árboles, rocas, ciudad, bots, huesos…);
 *  - en el ordenador se anda con WASD, se salta con espacio y se recogen huesos;
 *  - los power-ups se cogen y duran 8 s;
 *  - quien la lleva brilla en rojo y la etiqueta se pasa al tocarse;
 *  - la Tienda Doganiero cobra los huesos y guarda el gorro comprado;
 *  - en VR, apoyar las manos en el suelo y arrastrarlas empuja al jugador y al
 *    soltar sale disparado (locomoción de brazos estilo gorilla tag).
 *
 * También mira los ficheros tal cual: la página, el servidor (doga_gorilla.py) y los
 * estáticos (three.js r160, VRButton, PNGs).
 *
 * Uso: node tests/test_doga_tag_vr.js
 * (sin node en el PATH: ELECTRON_RUN_AS_NODE=1 "/Applications/Visual Studio Code.app/Contents/MacOS/Code" tests/test_doga_tag_vr.js)
 */
'use strict';
var fs = require('fs');
var path = require('path');
var vm = require('vm');
var assert = require('assert');
var root = path.join(__dirname, '..');
var DIR = path.join(root, 'doga-tag-vr');

function ok(msg) { console.log('ok', msg); }
function read(name) { return fs.readFileSync(path.join(root, name), 'utf8'); }
function gameFile(rel) { return fs.readFileSync(path.join(DIR, rel), 'utf8'); }

/* ---------------- página y estáticos (ficheros tal cual) ---------------- */
var page = gameFile('index.html');
var game = gameFile('game.js');
var server = read('doga_gorilla.py');
var mainPy = read('main.py');

['index.html', 'game.js', 'lib/three.module.js', 'lib/VRButton.js', 'README.md',
  'assets/doganiero-logo.png', 'assets/doganiero-icon.png', 'assets/favicon-64.png'].forEach(function (f) {
  assert.ok(fs.existsSync(path.join(DIR, f)), 'existe doga-tag-vr/' + f);
});
/* los PNG son PNG de verdad (firma 89 50 4E 47) */
['assets/doganiero-logo.png', 'assets/doganiero-icon.png', 'assets/favicon-64.png'].forEach(function (f) {
  var head = fs.readFileSync(path.join(DIR, f)).slice(0, 4);
  assert.strictEqual(head.toString('hex'), '89504e47', f + ' es un PNG');
});
assert.ok(gameFile('lib/three.module.js').indexOf("REVISION = '160'") >= 0,
  'Three.js r160 tal cual, servido desde el propio juego (sin CDN)');
assert.ok(gameFile('lib/VRButton.js').indexOf('class VRButton') >= 0, 'VRButton propio');
ok('estáticos: página, motor, Three.js r160, VRButton y los tres PNG');

/* la página carga el juego como módulo ES con el importmap de three */
assert.ok(page.indexOf('<script type="importmap">') >= 0, 'la página lleva importmap');
assert.ok(page.indexOf('"three":"./lib/three.module.js"') >= 0, 'el importmap apunta al three local');
assert.ok(page.indexOf('<script type="module" src="./game.js">') >= 0, 'la página arranca game.js como módulo');
assert.ok(page.indexOf('href="./assets/favicon-64.png"') >= 0, 'favicon del juego');
assert.ok(page.indexOf('src="./assets/doganiero-logo.png"') >= 0, 'logo Doganiero en la tarjeta');
['hud', 'status', 'score', 'bones', 'power', 'cross', 'start', 'vrslot', 'play', 'musicToggle']
  .forEach(function (id) {
    assert.ok(page.indexOf('id="' + id + '"') >= 0, 'la página tiene #' + id);
  });
assert.ok(page.indexOf('Jugar en escritorio') >= 0, 'botón de jugar en escritorio');
assert.ok(page.indexOf('WASD') >= 0 && page.indexOf('Espacio') >= 0, 'explica los controles de escritorio');
assert.ok(page.indexOf('mantén las manos contra el suelo') >= 0, 'explica la locomoción de brazos en VR');
assert.ok(page.indexOf('Doga-huesos') >= 0 && page.indexOf('Tienda Doganiero') >= 0,
  'explica huesos y tienda');
assert.ok(page.indexOf('lang="es"') >= 0, 'la página va en español');
ok('página: importmap, HUD, tarjeta de inicio, botón de VR y controles');

/* el servidor sirve la carpeta y no deja salir de ella */
assert.ok(server.indexOf('GAME_VERSION = "2026.32"') >= 0, 'versión del juego 2026.32');
assert.ok(server.indexOf('_GAME_DIR = _APP_DIR / "doga-tag-vr"') >= 0, 'sirve la carpeta doga-tag-vr');
assert.ok(server.indexOf('@r.get("/doga-gorilla")') >= 0, 'ruta /doga-gorilla');
assert.ok(server.indexOf('@r.get("/doga-tag-vr")') >= 0, 'alias /doga-tag-vr');
assert.ok(server.indexOf('def doga_gorilla_file(rel: str, request: Request)') >= 0,
  'ruta de los archivos del juego');
assert.ok(server.indexOf('@r.get("/api/doga-gorilla/status")') >= 0, 'estado del juego por API');
assert.ok(server.indexOf('def _render_page()') >= 0, 'la página se reescribe al servirla');
assert.ok(server.indexOf('def _safe_rel(rel: str)') >= 0, 'rutas saneadas (sin salir de la carpeta)');
assert.ok(server.indexOf('HOST = "doga-gorilla."') >= 0, 'subdominio doga-gorilla.*');
assert.ok(mainPy.indexOf('import doga_gorilla') >= 0, 'main.py incluye doga_gorilla');
assert.ok(mainPy.indexOf('doga_gorilla.build_router()') >= 0, 'main.py monta el router');
assert.ok(mainPy.indexOf('doga_gorilla.install_hosts(app)') >= 0, 'main.py enruta el subdominio');
ok('servidor: carpeta del juego, tokens de caché, API de estado y subdominio');

/* ---------------- arnés: DOM, lienzo y renderizador falsos ---------------- */
function fake2d(canvas) {
  var ctx = {
    canvas: canvas, fillStyle: '#000', strokeStyle: '#000', font: '', lineWidth: 1,
    textAlign: 'left', textBaseline: 'alphabetic', globalAlpha: 1, imageSmoothingEnabled: true,
    ops: [],
    fillRect: function (x, y, w, h) { ctx.ops.push(['fillRect', x, y, w, h, ctx.fillStyle]); },
    clearRect: function () { }, strokeRect: function () { },
    fillText: function (t, x, y) { ctx.ops.push(['fillText', String(t), x, y, ctx.font]); },
    strokeText: function () { }, measureText: function (t) { return { width: String(t).length * 6 }; },
    beginPath: function () { }, closePath: function () { }, fill: function () { }, stroke: function () { },
    moveTo: function () { }, lineTo: function () { }, arc: function () { }, arcTo: function () { },
    ellipse: function () { }, rect: function () { }, roundRect: function () { },
    bezierCurveTo: function () { }, quadraticCurveTo: function () { }, clip: function () { },
    save: function () { }, restore: function () { }, translate: function () { }, scale: function () { },
    rotate: function () { }, setTransform: function () { }, drawImage: function () { },
    getImageData: function () { return { data: new Uint8ClampedArray(4) }; },
    putImageData: function () { },
    createLinearGradient: function () { return { addColorStop: function () { } }; },
    createRadialGradient: function () { return { addColorStop: function () { } }; },
    createPattern: function () { return null; }
  };
  return ctx;
}

function fakeCanvas() {
  var c = {
    width: 0, height: 0, style: {}, _ctx: null,
    getContext: function (kind) {
      if (kind !== '2d') return null;
      if (!c._ctx) c._ctx = fake2d(c);
      return c._ctx;
    },
    toDataURL: function () { return 'data:image/png;base64,'; },
    addEventListener: function () { }, removeEventListener: function () { },
    requestPointerLock: function () { }, releasePointerLock: function () { },
    setPointerCapture: function () { }, releasePointerCapture: function () { }
  };
  return c;
}

function fakeEl(id) {
  return {
    id: id || '', style: {}, className: '', textContent: '', innerHTML: '', onclick: null, hidden: false,
    children: [],
    appendChild: function (c) { this.children.push(c); return c; },
    removeChild: function () { }, setAttribute: function () { }, getAttribute: function () { return null; },
    addEventListener: function () { }, removeEventListener: function () { },
    focus: function () { }, blur: function () { }
  };
}

var renderStats = { renders: 0, frames: 0 };



function buildSandbox() {
  var realThree = require(path.join(DIR, 'lib', 'three.module.js')); // Node ≥22: require de un ESM
  assert.ok(realThree.REVISION, 'Three.js de verdad cargado (r' + realThree.REVISION + ')');
  var THREE = Object.assign({}, realThree);

  /* Renderizador falso: sin WebGL. Lo demás (geometrías, mallas, luces,
     InstancedMesh, Matrix4, Raycaster…) es el Three.js de verdad. */
  function FakeXR(three) {
    this.enabled = false; this.isPresenting = false; this._l = {};
    this.getControllerGrip = function () { return new three.Group(); };
    this.getController = function () { return new three.Group(); };
    this.getSession = function () { return null; };
    this.setSession = function () { return Promise.resolve(); };
    this.setReferenceSpaceType = function () { };
    this.addEventListener = function (t, f) { (this._l[t] = this._l[t] || []).push(f); };
    this.removeEventListener = function (t, f) {
      this._l[t] = (this._l[t] || []).filter(function (x) { return x !== f; });
    };
    this.dispatch = function (t, e) { (this._l[t] || []).forEach(function (f) { f(e || {}); }); };
  }
  function FakeRenderer(three) {
    this.domElement = fakeCanvas();
    this.shadowMap = { enabled: false, type: 0 };
    this.info = { render: { calls: 0, triangles: 0 } };
    this.outputColorSpace = '';
    this.xr = new FakeXR(three);
    this._loop = null;
  }
  FakeRenderer.prototype.setPixelRatio = function () { };
  FakeRenderer.prototype.setSize = function () { };
  FakeRenderer.prototype.setClearColor = function () { };
  FakeRenderer.prototype.compile = function () { };
  FakeRenderer.prototype.dispose = function () { };
  FakeRenderer.prototype.render = function (scene, camera) {
    renderStats.renders++;
    scene.updateMatrixWorld(true);
    camera.updateMatrixWorld(true);
  };
  FakeRenderer.prototype.setAnimationLoop = function (cb) { this._loop = cb; };
  var fakeRenderer = null;
  THREE.WebGLRenderer = function () { fakeRenderer = new FakeRenderer(realThree); return fakeRenderer; };

  /* Reloj falso: cada fotograma dura 1/60 s, así el test es determinista. */
  function FakeClock() { this.dt = 1 / 60; }
  FakeClock.prototype.getDelta = function () { return this.dt; };
  FakeClock.prototype.getElapsedTime = function () { return 0; };
  THREE.Clock = FakeClock;

  /* TextureLoader falso: en node no hay imágenes; nunca llama al callback. */
  THREE.TextureLoader = function () { };
  THREE.TextureLoader.prototype.load = function (url) { return { image: null, url: url, isTexture: true }; };

  var els = {};
  var store = {};
  var doc = {
    body: fakeEl('body'),
    documentElement: fakeEl('html'),
    pointerLockElement: null,
    getElementById: function (id) { return els[id] || (els[id] = fakeEl(id)); },
    querySelector: function () { return fakeEl(''); },
    querySelectorAll: function () { return []; },
    createElement: function (tag) { return String(tag).toLowerCase() === 'canvas' ? fakeCanvas() : fakeEl(tag); },
    createElementNS: function (ns, tag) { return String(tag).toLowerCase() === 'canvas' ? fakeCanvas() : fakeEl(tag); },
    addEventListener: function () { }, removeEventListener: function () { },
    exitPointerLock: function () { }
  };

  var win = {
    innerWidth: 1280, innerHeight: 720, devicePixelRatio: 2,
    location: {
      search: '?autostart&seed=7', href: 'https://doga-gorilla.softportweb.com/doga-gorilla',
      pathname: '/doga-gorilla'
    },
    navigator: { userAgent: 'test', xr: { isSessionSupported: function () { return Promise.resolve(false); } } },
    localStorage: {
      getItem: function (k) { return Object.prototype.hasOwnProperty.call(store, k) ? store[k] : null; },
      setItem: function (k, v) { store[k] = String(v); },
      removeItem: function (k) { delete store[k]; }
    },
    document: doc,
    THREE: THREE,
    VRButton: { createButton: function () { return fakeEl('vr-button'); } },
    setTimeout: setTimeout, clearTimeout: clearTimeout,
    setInterval: setInterval, clearInterval: clearInterval,
    console: console,
    addEventListener: function () { }, removeEventListener: function () { },
    requestAnimationFrame: function (cb) { return setTimeout(function () { cb(0); }, 0); },
    cancelAnimationFrame: function () { },
    matchMedia: function () { return { matches: false, addEventListener: function () { } }; },
    alert: function () { }, prompt: function () { return null; },
    URLSearchParams: URLSearchParams, URL: URL, TextEncoder: TextEncoder, TextDecoder: TextDecoder,
    atob: function (s) { return Buffer.from(String(s), 'base64').toString('binary'); },
    btoa: function (s) { return Buffer.from(String(s), 'binary').toString('base64'); }
  };
  win.window = win;
  win.self = win;
  win.globalThis = win;

  /* game.js es un módulo: se le quitan los dos import y se le pasa el THREE del arnés. */
  var src = game
    .replace(/^import \* as THREE from 'three';\s*$/m, 'var THREE = window.THREE;')
    .replace(/^import \{ VRButton \} from '\.\/lib\/VRButton\.js';\s*$/m, 'var VRButton = window.VRButton;');
  assert.ok(src.indexOf('var THREE = window.THREE;') >= 0, 'el módulo usa el THREE del arnés');
  assert.ok(src.indexOf('var VRButton = window.VRButton;') >= 0, 'el módulo usa el VRButton del arnés');

  vm.createContext(win);
  vm.runInContext(src, win, { filename: 'doga-tag-vr/game.js' });

  return {
    win: win, doc: doc, els: els, store: store,
    renderer: function () { return fakeRenderer; }, G: win.__game
  };
}

function step(env, frames) {
  var loop = env.renderer()._loop;
  assert.ok(typeof loop === 'function', 'el motor dejó su bucle de animación');
  for (var i = 0; i < (frames || 1); i++) { renderStats.frames++; loop(); }
}


/* ---------------- el juego, de verdad ---------------- */
var env = buildSandbox();
var G = env.G;
assert.ok(G, 'el juego publica window.__game');
step(env, 3);
assert.ok(renderStats.renders >= 3, 'el bucle de animacion dibuja (render por fotograma)');
assert.strictEqual(G.entities.length, 7, '6 bots y tu');
assert.strictEqual(G.bones.length, 24, 'veinticuatro Doga-huesos');
assert.strictEqual(G.powerItems.length, 8, 'power-ups repartidos por el mapa');
assert.strictEqual(G.shopButtons.length, 10, 'la tienda tiene 5 gorros y 5 colores');
assert.ok(G.trunks.length > 100, 'el bosque tiene troncos de verdad');
assert.ok(G.boxes.length > 20, 'hay rocas, mostrador y edificios con los que chocar');
assert.ok(G.scene.children.length > 15, 'la escena tiene suelo, arboles, ciudad y coleccionables');
assert.ok(env.renderer().xr.enabled === true, 'el renderizador tiene WebXR activado');
assert.strictEqual(G.inCity(0, -30), true, 'la Ciudad Doganiero esta al norte');
assert.strictEqual(G.inCity(0, 20), false, 'el claro no es ciudad');
assert.strictEqual(G.surfaceAt(0, -30, 0.2), 'concrete', 'en la ciudad se pisa cemento');
assert.strictEqual(G.surfaceAt(4, 6, 0.2), 'grass', 'en el claro se pisa hierba');
ok('mundo: bosque, ciudad, bots, huesos, power-ups y tienda montados de verdad');


/* escritorio: andar con WASD, saltar y no hundirse en el suelo */
var startPos = G.rig.position.clone();
G.keys.KeyW = true;
step(env, 45);
G.keys.KeyW = false;
var walked = startPos.distanceTo(G.rig.position);
assert.ok(walked > 1.5, 'con W el jugador anda (recorrido ' + walked.toFixed(2) + ' m)');
assert.ok(G.rig.position.z < startPos.z, 'anda hacia delante (yaw 0 = -Z)');
assert.ok(G.player.onGround, 'sigue apoyado en el suelo');
var yBefore = G.rig.position.y;
G.keys.Space = true;
step(env, 1);
G.keys.Space = false;
assert.ok(G.rig.position.y > yBefore, 'con espacio salta');
step(env, 90);
assert.ok(G.player.onGround, 'vuelve a caer al suelo');
ok('escritorio: WASD anda, espacio salta y se cae con la gravedad');

/* huesos: se recogen al pasar por encima y vuelven a salir */
var bone = G.bones[0];
bone.pos.copy(G.rig.position); bone.respawn = 0;
var bonesBefore = G.save.bones;
step(env, 1);
assert.strictEqual(G.save.bones, bonesBefore + 1, 'recoger un hueso suma 1');
assert.ok(bone.respawn > 15, 'el hueso desaparece y volvera en 18-28 s');

/* power-ups: se cogen y duran 8 s */
var snake = G.powerItems.filter(function (it) { return it.kind === 'snake'; })[0];
snake.pos.copy(G.rig.position); snake.respawn = 0;
step(env, 1);
assert.ok(G.power.snake > 7 && G.power.snake <= 8, 'Salto Snake activo 8 s');
assert.ok(snake.respawn > 20, 'el power-up respawna a los 25 s');
step(env, 60);

/* quien la lleva: se pone en rojo y se pasa al tocarse */
var bot = G.entities[2];
G.setIt(bot, G.player);
assert.strictEqual(bot.it, true, 'el bot pillado la lleva');
assert.strictEqual(G.player.it, false, 'el jugador no la lleva');
assert.strictEqual(G.player.tags, 1, 'el jugador suma una pillada');
assert.ok(bot.cooldown > 0, 'no se puede devolver la pillada al instante');
bot.pos.copy(G.rig.position); bot.cooldown = 0;
step(env, 1);
assert.strictEqual(G.player.it, true, 'al tocarse la lleva el jugador');
assert.ok(G.player.cooldown > 0, 'el jugador tiene su tiempo de gracia');
assert.ok(G.entities.filter(function (e) { return e.it; }).length === 1, 'solo uno la lleva');
ok('pilla-pilla: la etiqueta se pasa al tocarse y solo la lleva uno');

/* Tienda Doganiero: cobra los huesos, guarda lo comprado y no deja comprar sin saldo */
G.save.bones = 50;
var corona = G.shopButtons.filter(function (b) { return b.userData.item.id === 'corona'; })[0];
assert.ok(corona, 'la tienda tiene la Corona');
G.pressShop(corona);
assert.strictEqual(G.save.hat, 'corona', 'te pones la Corona');
assert.ok(G.save.owned.indexOf('corona') >= 0, 'la Corona queda comprada');
assert.strictEqual(G.save.bones, 35, 'descuenta los 15 huesos que cuesta');
assert.ok(env.store['dogaTag.v1'] && env.store['dogaTag.v1'].indexOf('corona') >= 0,
  'la partida se guarda en localStorage');
G.save.bones = 0;
var dorado = G.shopButtons.filter(function (b) { return b.userData.item.id === 'dorado'; })[0];
G.pressShop(dorado);
assert.ok(G.save.owned.indexOf('dorado') < 0, 'sin huesos no hay compra');
assert.strictEqual(G.save.bones, 0, 'y no se queda en negativo');
ok('tienda: cobra, equipa, guarda en localStorage y no deja comprar sin huesos');


assert.ok(G.power.snake < 7, 'el power-up se va gastando');

/* HUD: huesos, estado y marcador se pintan cada fotograma */
step(env, 2);
assert.ok(/Doga-huesos/.test(env.els.bones.textContent), 'el HUD cuenta los huesos: ' + env.els.bones.textContent);
assert.ok(env.els.status.textContent.length > 3, 'el HUD dice quien la lleva');
assert.ok(env.els.score.textContent.indexOf('pilladas') >= 0, 'el marcador cuenta las pilladas');
assert.ok(env.els.score.textContent.indexOf('s libre') >= 0, 'y el tiempo libre de cada uno');
ok('HUD: huesos, quien la lleva y marcador de pilladas');

ok('coleccionables: huesos que suman y power-ups de 8 s');

/* VR: apoyar las manos y arrastrarlas empuja al jugador; al soltar sale disparado */
var xrDouble = env.renderer().xr;
xrDouble.dispatch('sessionstart');
step(env, 1);
var grips = G.rig.children.filter(function (o) { return o !== G.camera; });
assert.strictEqual(grips.length, 2, 'los dos mandos cuelgan del jugador');
var vrStart = G.rig.position.clone();
grips.forEach(function (g) { g.position.set(0.35, -2.2, 0.4); });
step(env, 2);
for (var f = 0; f < 10; f++) {
  grips.forEach(function (g) { g.position.x += 0.06; });
  step(env, 1);
}
var vrMoved = vrStart.distanceTo(G.rig.position);
assert.ok(vrMoved > 0.08, 'arrastrar las manos empuja al jugador (' + vrMoved.toFixed(2) + ' m)');
grips.forEach(function (g) { g.position.set(0.3, 1.6, 0.3); });
step(env, 1);
assert.ok(G.player.vel.length() > 0.05, 'al soltar las manos el impulso sigue (se sale disparado)');
xrDouble.dispatch('sessionend');
step(env, 1);
ok('VR: locomocion de brazos (empujar y salir disparado) con los dos mandos');

console.log('\ntest_doga_tag_vr OK  (' + renderStats.frames + ' fotogramas simulados, ' +
  renderStats.renders + ' dibujados)');



