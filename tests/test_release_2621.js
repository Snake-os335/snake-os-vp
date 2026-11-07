/* Snake OS 2026.21: Snake VR — jungla viva, mandos-serpiente y tótem para abrir el escritorio.
 *
 * Qué se comprueba (estático, sobre los ficheros reales):
 *  - Jungla animada: suelo de musgo, árboles/helechos instanciados, lianas que se mecen,
 *    luciérnagas y 10 serpientes que se arrastran por curvas (sin restos del espacio viejo).
 *  - Los DOS mandos de WebXR son serpientes (cabeza con ojos y lengua bífida), el rayo sale
 *    de su boca, el gatillo muerde y hay vibración háptica.
 *  - La pantalla del escritorio empieza CERRADA; la serpiente tótem te sigue, y al pulsarla
 *    (ratón o mando) se abre; al volver a pulsarla se cierra. Se puede abrir también desde
 *    el HUD (🗔 Escritorio) y desde la app (botón #snkvr-screen).
 *  - index.html: versión 2026.21, entrada de novedades primera y ?v= nuevo del script.
 */
'use strict';
var fs = require('fs');
var path = require('path');
var assert = require('assert');
var root = path.join(__dirname, '..');

function ok(msg) { console.log('ok', msg); }

var vr = fs.readFileSync(path.join(root, 'snake-vr.js'), 'utf8');
var html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
var i18n = fs.readFileSync(path.join(root, 'snake-i18n.js'), 'utf8');
var readme = fs.readFileSync(path.join(root, 'README.md'), 'utf8');

/* 1) Jungla animada con serpientes por todas partes */
assert.ok(vr.indexOf("VR_VERSION = '2026.21'") >= 0, 'versión del módulo 2026.21');
assert.ok(vr.indexOf('function makeJungle(THREE)') >= 0, 'se construye la jungla');
assert.ok(vr.indexOf('function makeGroundTexture(') >= 0, 'suelo de musgo procedural');
assert.ok(vr.indexOf('function makeLeafTexture(') >= 0, 'textura de hoja para los helechos');
assert.ok(vr.indexOf('function makeFireflies(') >= 0, 'luciérnagas');
assert.ok(vr.indexOf('function updateJungle(') >= 0, 'las lianas se mecen');
assert.ok(vr.indexOf('function makeAmbientSnake(') >= 0, 'serpientes ambientales');
assert.ok(vr.indexOf('function updateAmbientSnakes(') >= 0, 'las serpientes se mueven');
assert.ok(vr.indexOf('new THREE.InstancedMesh') >= 0, 'árboles/serpientes instanciados');
assert.ok(vr.indexOf('new THREE.CatmullRomCurve3') >= 0, 'curvas para los cuerpos de serpiente');
assert.ok(vr.indexOf('for (var sI = 0; sI < 10; sI++)') >= 0, 'diez serpientes en la jungla');
assert.ok(vr.indexOf('updateAmbientSnakes(dt, now)') >= 0, 'las serpientes se animan en el bucle');
assert.ok(vr.indexOf('updateFireflies(dt, now)') >= 0, 'las luciérnagas se animan en el bucle');
assert.ok(vr.indexOf('makeStarField') === -1, 'ya no queda el campo de estrellas');
assert.ok(vr.indexOf('THREE.GridHelper') === -1, 'ya no queda la rejilla de neón');
ok('jungla viva: árboles, helechos, lianas, luciérnagas y serpientes por todas partes');

/* 2) Los dos mandos son serpientes */
assert.ok(vr.indexOf('function makeControllerSnake(THREE, hand)') >= 0, 'serpiente para el mando');
assert.ok(vr.indexOf('function makeSnakeHead(THREE, color, size)') >= 0, 'cabeza con ojos y lengua reutilizable');
assert.ok(vr.indexOf('var tongue = new THREE.Group();') >= 0, 'lengua bífida de la serpiente');
assert.ok(vr.indexOf('for (var e = -1; e <= 1; e += 2)') >= 0, 'dos ojos por cabeza');
assert.ok(vr.indexOf('hand === 0 ? 0x9dff3c : 0x35ffd6') >= 0, 'una serpiente por mano con su color');
assert.ok(vr.indexOf('r.xr.getController(i)') >= 0, 'los dos mandos XR');
assert.ok(vr.indexOf('line.position.set(0, 0.005, -0.2);') >= 0, 'el rayo sale de la boca de la serpiente');
assert.ok(vr.indexOf('function updateHandSnakes(') >= 0, 'las serpientes de las manos se animan');
assert.ok(vr.indexOf('function updateXRPointers(') >= 0, 'los dos punteros se acortan/colorean');
assert.ok(vr.indexOf('function hapticPulse(') >= 0, 'vibración del mando al morder');
assert.ok(vr.indexOf('function biteNow(') >= 0, 'animación de mordisco');
assert.ok(vr.indexOf('onCtrlConnected') >= 0, 'lee el gamepad al conectar el mando');
ok('los dos mandos son serpientes que apuntan, muerden y vibran');

/* 3) Tótem que te sigue: abre y cierra el escritorio */
assert.ok(vr.indexOf('function makeSpiritSnake(THREE)') >= 0, 'serpiente tótem');
assert.ok(vr.indexOf('function updateSpirit(') >= 0, 'el tótem sigue al jugador');
assert.ok(vr.indexOf('function viewerWorldPos(') >= 0 && vr.indexOf('function viewerWorldDir(') >= 0, 'sigue la cabeza en XR y fuera de XR');
assert.ok(vr.indexOf('function setScreenOpen(') >= 0 && vr.indexOf('function toggleScreen(') >= 0, 'abrir/cerrar el escritorio');
assert.ok(vr.indexOf('function updateScreenAnim(') >= 0, 'animación de apertura/cierre');
assert.ok(vr.indexOf('screenGroup.visible = false;') >= 0, 'la pantalla empieza cerrada');
assert.ok(vr.indexOf('st.screenOpen = false;') >= 0, 'estado inicial cerrado');
assert.ok(vr.indexOf('if (st.screenOpen && st.mirrorMesh) {') >= 0, 'los clics de la pantalla exigen que esté abierta');
/* El tótem se comprueba ANTES que la pantalla, con ratón y con mando */
var tapSpirit = vr.indexOf('if (st.spirit && rc.intersectObject(st.spirit.pickMesh', vr.indexOf('function tapAt('));
var tapScreen = vr.indexOf('if (st.screenOpen && st.mirrorMesh) {', vr.indexOf('function tapAt('));
assert.ok(tapSpirit > 0 && tapScreen > tapSpirit, 'con el ratón, el tótem se pulsa antes que la pantalla');
var xrSpirit = vr.indexOf('rc.intersectObject(st.spirit.pickMesh', vr.indexOf('function onXRSelect('));
var xrScreen = vr.indexOf('rc.intersectObject(st.mirrorMesh', vr.indexOf('function onXRSelect('));
assert.ok(xrSpirit > 0 && xrScreen > xrSpirit, 'con el mando, el tótem se muerde antes que la pantalla');
assert.ok(vr.indexOf('data-vr="screen"') >= 0, 'el HUD tiene el botón 🗔 Escritorio');
assert.ok(vr.indexOf("else if (a === 'screen') toggleScreen();") >= 0, 'ese botón abre y cierra');
assert.ok(vr.indexOf('toggleScreen: toggleScreen') >= 0 && vr.indexOf('setScreenOpen: setScreenOpen') >= 0, 'API pública toggleScreen/setScreenOpen');
assert.ok(vr.indexOf('get isScreenOpen()') >= 0, 'API pública isScreenOpen');
assert.ok(vr.indexOf('if (opts.screen) setScreenOpen(true);') >= 0, 'open({screen:true}) abre el escritorio');
assert.ok(vr.indexOf('id="snkvr-screen"') >= 0, 'la app tiene el botón de abrir el escritorio');
assert.ok(vr.indexOf('Cerrado: muerde al tótem') >= 0, 'el panel enseña que está cerrado');
ok('el tótem te sigue y abre/cierra el escritorio con ratón, mandos y HUD');


/* 4) Traducciones nuevas */
assert.ok(i18n.indexOf("'Mandos serpiente':'Snake controllers'") >= 0, 'i18n de «Mandos serpiente»');
assert.ok(i18n.indexOf("'Cerrado: muerde al tótem':'Closed: bite the totem'") >= 0, 'i18n del estado cerrado');
assert.ok(i18n.indexOf("'Abrir el escritorio dentro de VR':'Open the desktop inside VR'") >= 0, 'i18n del botón de la app');
ok('cadenas nuevas en snake-i18n.js (ES/EN)');

/* 5) index.html en 2026.21 con novedades nuevas */
assert.ok(html.indexOf("window.SNAKE_OS_VERSION='2026.21'") >= 0, 'versión 2026.21');
assert.ok(html.indexOf("{v:'2026.21'") >= 0, 'entrada de novedades 2026.21');
assert.ok(html.indexOf("{v:'2026.21'") < html.indexOf("{v:'2026.20'"), 'la entrada 2026.21 va primera');
assert.ok(html.indexOf('jungla viva') >= 0, 'las novedades cuentan la jungla');
assert.ok(html.indexOf('serpiente tótem') >= 0, 'las novedades cuentan el tótem');
assert.ok(html.indexOf('/static/snake-vr.js?v=202607111200') >= 0, '?v= nuevo de snake-vr.js (sin caché vieja)');
assert.ok(html.indexOf("'snake-vr': { title:'Snake VR'") >= 0, 'la app sigue registrada');
ok('index.html en 2026.21 con la jungla y el tótem en las novedades');

/* 6) README y limpieza */
assert.ok(readme.indexOf('2026.21') >= 0, 'README cita la 2026.21');
assert.ok(readme.indexOf('tests/test_release_2621.js') >= 0, 'README lista esta prueba');
assert.strictEqual(/TODO|FIXME/.test(vr), false, 'sin TODOs pendientes');
ok('README actualizado y sin TODOs');

if (process.exitCode) process.exit(process.exitCode);
console.log('todo bien');

