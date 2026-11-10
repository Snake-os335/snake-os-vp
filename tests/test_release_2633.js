/* Snake OS 2026.33: en Doga Tag VR ya no cuesta caminar.
 *
 * Qué se comprueba (estático, sobre los ficheros reales):
 *  - game.js: andar con el joystick en VR (VR_WALK / VR_RUN / STICK_DEAD, xrSticks, applyStickWalk)
 *    leído del mando «xr-standard» (axes[2] / axes[3]) y sumado a la locomoción de brazos;
 *  - game.js: en el ordenador se anda a 8,2 m/s y con Shift se corre a 12,5 m/s, con más aceleración;
 *  - game.js: los empujones y lanzamientos en VR llegan más lejos (powerMul y menos frenada en el aire);
 *  - doga-tag-vr/index.html: la tarjeta de inicio explica el joystick y la velocidad a pie;
 *  - doga_gorilla.py, index.html (versión 2026.33 con sus novedades es/en), README y las pruebas
 *    de versiones anteriores al día.
 */
'use strict';
var fs = require('fs');
var path = require('path');
var assert = require('assert');
var root = path.join(__dirname, '..');

function ok(msg) { console.log('ok', msg); }
function read(name) { return fs.readFileSync(path.join(root, name), 'utf8'); }
function hay(src, txt, msg) { assert.ok(src.indexOf(txt) >= 0, msg + ' (' + txt + ')'); }

var srv = read('doga_gorilla.py');
var page = read('doga-tag-vr/index.html');
var game = read('doga-tag-vr/game.js');
var html = read('index.html');
var readme = read('README.md');
var vrReadme = read('doga-tag-vr/README.md');

/* 1) Versión: 2026.33 en todas partes */
var ver = (html.match(/window\.SNAKE_OS_VERSION='([0-9.]+)'/) || [])[1];
assert.strictEqual(ver, '2026.33', 'index.html publica la 2026.33');
hay(html, "{v:'2026.33'", 'entrada de novedades 2026.33');
assert.ok(html.indexOf("{v:'2026.33'") < html.indexOf("{v:'2026.32'"),
  'la entrada 2026.33 va antes que la 2026.32');
hay(srv, 'GAME_VERSION = "2026.33"', 'el juego se anuncia como 2026.33');
hay(srv, 'Doga Tag VR (2026.33)', 'la cabecera del servidor lleva la versión');
ok('versión 2026.33 en index.html y en doga_gorilla.py');

/* 2) Novedades: cuentan lo de caminar rápido, en español y en inglés */
var cambios = html.slice(html.indexOf("{v:'2026.33'"), html.indexOf("{v:'2026.32'"));
['joystick', '12 m/s', '8 m/s', 'Shift'].forEach(function (t) { hay(cambios, t, 'novedades es citan ' + t); });
['left stick', '12 m/s', '8 m/s', 'Shift'].forEach(function (t) { hay(cambios, t, 'novedades en citan ' + t); });
hay(cambios, 'VR', 'las novedades hablan de VR');
ok('novedades 2026.33: caminar rápido con joystick y en el ordenador (es/en)');


/* 3) VR: andar con el joystick, con zona muerta y corriendo a tope */
hay(game, 'const VR_WALK = 7.0;', 'velocidad de andar con el joystick (7 m/s)');
hay(game, 'const VR_RUN = 12.0;', 'velocidad de correr con el joystick a tope (12 m/s)');
hay(game, 'const STICK_DEAD = 0.16;', 'zona muerta del joystick');
hay(game, 'function xrSticks()', 'lee los joysticks de los mandos');
hay(game, 'renderer.xr.getSession()', 'los lee de la sesión XR de verdad');
hay(game, 'sess.inputSources', 'recorre los mandos conectados');
hay(game, 'ax[2] : ax[0]', 'usa la disposición xr-standard (axes[2]/axes[3])');
hay(game, "src.handedness === 'left'", 'prefiere el mando izquierdo');
hay(game, 'function applyStickWalk(dt)', 'aplica el andar del joystick');
assert.ok(/applyStickWalk\(dt\);/.test(game), 'se llama cada fotograma desde updatePlayerVR');
hay(game, 'camera.getWorldDirection(swA)', 'anda hacia donde miras');
hay(game, 'vrWalk', 'guarda la velocidad de andar aparte del impulso de los brazos');
hay(game, 'const running = mag > 0.85;', 'el joystick a tope es correr');
hay(game, 'vrStepAcc', 'pasos de nudillos al andar con el joystick');
assert.ok(/xrSticks, applyStickWalk, vrWalk, VR_WALK, VR_RUN, STICK_DEAD, powerMul,/.test(game),
  'la API de pruebas expone el andar con joystick');
/* la locomoción de brazos sigue ahí */
hay(game, 'handHistory', 'el impulso al soltar las manos sigue funcionando');
hay(game, 'player.vel.copy(v.multiplyScalar(1.25 * powerMul().fling)', 'lanzamiento de brazos más fuerte');
hay(game, 'player.vel.multiplyScalar(1 - 0.07 * dt)', 'en el aire casi no se frena');
ok('VR: joystick (zona muerta, andar y correr) sin perder la locomoción de brazos');

/* 4) Escritorio: más rápido de serie y corriendo con Shift */
hay(game, 'const speed = (running ? 12.5 : 8.2) * powerMul().speed;', 'andar 8,2 m/s y correr 12,5 m/s');
hay(game, 'const accel = player.onGround ? 22 : 7;', 'aceleración más viva en el suelo y en el aire');
hay(page, 'Shift', 'la tarjeta de inicio explica Shift');
hay(page, 'ya va rápido', 'la tarjeta avisa de que se anda rápido');
hay(page, 'joystick izquierdo', 'la tarjeta explica el joystick en VR');
hay(page, 'manos contra el suelo', 'y la locomoción de brazos sigue explicada');
ok('escritorio: 8,2 m/s al andar y 12,5 m/s corriendo, con la tarjeta de inicio al día');

/* 5) Power-ups: el lanzamiento y el tope de VR suben con 2026.33 */
assert.ok(/cap: power\.snake > 0 \? 20 : 13/.test(game), 'tope del lanzamiento 13 m/s (20 con Salto Snake)');
assert.ok(/fling: \(power\.snake > 0 \? 1\.8 : 1\.35\) \* \(power\.speed > 0 \? 1\.3 : 1\)/.test(game),
  'más fuerza al soltar las manos, y más con power-ups');
ok('power-ups: lanzamiento y tope de VR actualizados');

/* 6) README al día (los dos) */
['2026.33', 'joystick', 'VR_RUN', 'applyStickWalk', 'test_release_2633.js'].forEach(function (t) {
  hay(readme, t, 'README cita ' + t);
});
['left stick', 'applyStickWalk', 'VR_RUN', '12.5 m/s'].forEach(function (t) {
  hay(vrReadme, t, 'doga-tag-vr/README cita ' + t);
});
ok('README y doga-tag-vr/README al día');

/* 7) Las pruebas de versiones anteriores apuntan a la versión publicada */
['2616', '2617', '2618', '2619', '2620', '2621', '2622', '2623'].forEach(function (v) {
  var src = read('tests/test_release_' + v + '.js');
  hay(src, "window.SNAKE_OS_VERSION='" + ver + "'", 'test_release_' + v + ' espera la ' + ver);
});
hay(read('tests/test_release_2632.js'), 'GAME_VERSION = "2026\\.', 'test_release_2632 acepta la versión nueva');
hay(read('tests/test_doga_tag_vr.js'), 'GAME_VERSION = "2026\\.', 'test_doga_tag_vr acepta la versión nueva');
ok('pruebas de versiones anteriores al día con la ' + ver);

console.log('\ntest_release_2633 OK');
