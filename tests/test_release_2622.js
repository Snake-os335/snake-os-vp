/* Snake OS 2026.22: Snake VR — el escritorio de la pantalla funciona igual que en el ordenador.
 *
 * Qué se comprueba (estático, sobre los ficheros reales):
 *  - El espejo pinta el escritorio REAL completo (paintDomNode/drawMirrorText/styleOf): fondos,
 *    bordes, textos con sus rectángulos reales, imágenes, canvas de apps y recorte por overflow.
 *  - Ya no quedan bocetos falsos (drawWindow/drawIcon ni el velo «rgba(3,8,14,.26)»).
 *  - El repintado es rápido y adaptativo (~14 fps, st.paintEvery), no una foto cada 1,2 s.
 *  - Ratón completo como en el PC: PointerEvent+MouseEvent reales (fireDom), pulsar (domPressUv),
 *    arrastrar (domMoveUv), soltar con clic (domReleaseUv), doble clic, clic derecho
 *    (domRightClickUv/contextmenu) y rueda (domWheelUv).
 *  - En XR: selectstart pulsa, selectend suelta, el gatillo mantenido arrastra (domMoveUv en
 *    updateXRPointers), squeeze sobre la pantalla = clic derecho y el stick hace de rueda.
 *  - index.html: versión 2026.22, entrada de novedades primera y ?v= nuevo de snake-vr.js.
 */
'use strict';
var fs = require('fs');
var path = require('path');
var assert = require('assert');
var root = path.join(__dirname, '..');

function ok(msg) { console.log('ok', msg); }

var vr = fs.readFileSync(path.join(root, 'snake-vr.js'), 'utf8');
var html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
var readme = fs.readFileSync(path.join(root, 'README.md'), 'utf8');

/* 1) El espejo pinta el escritorio REAL (no un boceto) */
assert.ok(vr.indexOf("VR_VERSION = '2026.22'") >= 0, 'versión del módulo 2026.22');
assert.ok(vr.indexOf('function paintDomNode(') >= 0, 'pintor del DOM real');
assert.ok(vr.indexOf('function drawMirrorText(') >= 0, 'textos reales con sus rectángulos');
assert.ok(vr.indexOf('function styleOf(') >= 0, 'estilos calculados con caché');
assert.ok(vr.indexOf('st.domBudget = 3200') >= 0, 'presupuesto de nodos por fotograma');
assert.ok(vr.indexOf('range.getClientRects') >= 0, 'cada línea de texto va a su sitio');
assert.ok(vr.indexOf('new THREE.CanvasTexture(mirrorCanvas)') >= 0, 'el canvas va de textura a la pantalla');
assert.ok(vr.indexOf('paintDomNode(ctx, body.children[bi]') >= 0, 'se recorre el body real salvo el visor');
assert.ok(vr.indexOf('ctx.drawImage(el, x, y, w, h)') >= 0, 'se copian también los canvas de las apps');
assert.ok(vr.indexOf('k.nodeType === 3') >= 0, 'se pintan los nodos de texto');
assert.ok(vr.indexOf('ctx.clip()') >= 0, 'recorte por overflow como el navegador');
assert.ok(vr.indexOf('getComputedStyle(el)') >= 0, 'usa los estilos reales');
assert.ok(vr.indexOf('function firstColor(s)') >= 0, 'color de reserva para fondos con degradado');
assert.ok(vr.indexOf('drawWindow') === -1, 'ya no hay ventanas-boceto');
assert.ok(vr.indexOf('drawIcon') === -1, 'ya no hay iconos-boceto');
assert.ok(vr.indexOf('Esqueleto del cuerpo') === -1, 'ya no queda el esqueleto falso del cuerpo');
assert.ok(vr.indexOf("'rgba(3,8,14,.26)'") === -1, 'ya no queda el velo que oscurecía el espejo');
ok('el espejo pinta el escritorio REAL: textos, imágenes, canvas de apps y recortes');

/* 2) Repintado rápido y adaptativo */
assert.ok(vr.indexOf('paintEvery: 0.09') >= 0, 'intervalo de repintado en el estado');
assert.ok(vr.indexOf('now - st.mirrorLast > st.paintEvery') >= 0, 'el bucle repinta según paintEvery');
assert.ok(vr.indexOf('now - st.mirrorLast > 1.2') === -1, 'ya no se queda una foto cada 1,2 s');
assert.ok(vr.indexOf('st.paintCost > 0.045') >= 0, 'si pintar cuesta mucho se espacia solo');
ok('repintado ~14 fps con ajuste automático de coste');

/* 3) Ratón completo, igual que en el ordenador */
assert.ok(vr.indexOf('function fireDom(el, type, x, y, extra)') >= 0, 'inyector de eventos reales');
assert.ok(vr.indexOf('new PointerEvent(type, common)') >= 0, 'PointerEvent real');
assert.ok(vr.indexOf('new MouseEvent(mt, common)') >= 0, 'MouseEvent real');
assert.ok(vr.indexOf("new WheelEvent('wheel'") >= 0, 'rueda real');
assert.ok(vr.indexOf('function domPressUv(uv)') >= 0, 'pulsar');
assert.ok(vr.indexOf('function domMoveUv(uv, press)') >= 0, 'mover arrastrando');
assert.ok(vr.indexOf('function domReleaseUv(uv, press)') >= 0, 'soltar con clic');
assert.ok(vr.indexOf('function domRightClickUv(uv)') >= 0, 'clic derecho');
assert.ok(vr.indexOf('function domWheelUv(uv, dx, dy)') >= 0, 'rueda en la app');
assert.ok(vr.indexOf("fireDom(el, 'dblclick'") >= 0, 'doble clic para abrir como en el PC');
assert.ok(vr.indexOf("fireDom(a.el, 'contextmenu'") >= 0, 'menú contextual');
assert.ok(vr.indexOf("closest('input,textarea,select')") >= 0, 'foco en campos de texto');
assert.ok(vr.indexOf('press.moved < 14') >= 0, 'clic frente a arrastre con umbral de dedo/mando');
assert.ok(vr.indexOf('function screenUvAt(cx, cy)') >= 0, 'rayo de ratón hacia la pantalla');
assert.ok(vr.indexOf('function spiritHitAt(cx, cy)') >= 0, 'el tótem delante de la pantalla manda al pulsar');
assert.ok(vr.indexOf('domMoveUv(uvD, st.deskDrag)') >= 0, 'arrastrar ventanas con el ratón en VR');
assert.ok(vr.indexOf('domWheelUv(uvW, e.deltaX, e.deltaY)') >= 0, 'rueda sobre la pantalla = scroll de la app');
ok('clic, arrastre, doble clic, clic derecho, rueda y foco inyectados de verdad');

/* 4) Mandos XR con las mismas acciones */
assert.ok(vr.indexOf("addEventListener('selectstart', onXRSelect.bind(null, c, rc))") >= 0, 'el gatillo pulsa');
assert.ok(vr.indexOf("addEventListener('selectend', onXRSelectEnd.bind(null, c, rc))") >= 0, 'soltar el gatillo suelta');
assert.ok(vr.indexOf("addEventListener('squeezestart', onXRSqueeze.bind(null, c, rc))") >= 0, 'apretar el mando');
assert.ok(vr.indexOf('function onXRSelectEnd(c, rc)') >= 0, 'fin de pulsación XR');
assert.ok(vr.indexOf('function onXRSqueeze(c, rc)') >= 0, 'squeeze = clic derecho / salir');
assert.ok(vr.indexOf('c.userData.press = domPressUv(hits[0].uv)') >= 0, 'el gatillo pulsa el DOM real');
assert.ok(vr.indexOf('domMoveUv(hitM[0].uv, c.userData.press)') >= 0, 'mantener y mover arrastra en XR');
assert.ok(vr.indexOf('domRightClickUv(hits[0].uv)') >= 0, 'squeeze sobre la pantalla = clic derecho');
assert.ok(vr.indexOf('Math.abs(pad.axes[1] || 0) > 0.45') >= 0, 'el stick hace de rueda');
ok('en VR real: pulsar, arrastrar, soltar, clic derecho y scroll con el stick');

/* 5) Textos de ayuda coherentes */
assert.ok(vr.indexOf('mantener y mover: arrastrar') >= 0, 'el panel de controles enseña el arrastre');
assert.ok(vr.indexOf('clic derecho') >= 0, 'se menciona el clic derecho');
assert.ok(vr.indexOf('todo va igual que en el ordenador') >= 0, 'la barra de ayuda lo explica');

/* 6) index.html en 2026.22 con novedades nuevas */
assert.ok(html.indexOf("window.SNAKE_OS_VERSION='2026.23'") >= 0, 'versión 2026.22');
assert.ok(html.indexOf("{v:'2026.22'") >= 0, 'entrada de novedades 2026.22');
assert.ok(html.indexOf("{v:'2026.22'") < html.indexOf("{v:'2026.21'"), 'la entrada 2026.22 va primera');
assert.ok(html.indexOf('/static/snake-vr.js?v=202607112100') >= 0, '?v= nuevo de snake-vr.js');
ok('index.html en 2026.22 con las novedades del escritorio real en VR');

/* 7) README al día */
assert.ok(readme.indexOf('2026.22') >= 0, 'README cita la 2026.22');
assert.ok(readme.indexOf('Escritorio REAL dentro de la pantalla') >= 0, 'README explica el espejo real');
assert.ok(readme.indexOf('Todo funciona igual que en el ordenador') >= 0, 'README explica el ratón completo');
ok('README al día con el espejo real y el ratón completo');

console.log('\ntest_release_2622 OK: Snake VR usa el escritorio real y un ratón completo, igual que en el ordenador');
