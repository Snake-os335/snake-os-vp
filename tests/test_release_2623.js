/* Snake OS 2026.23: Doganiero VR — buscar gafas (ordenador) + enviar lo que ves (gafas) + juego MR.
 *
 * Qué se comprueba (estático, sobre los ficheros reales):
 *  - Servidor vr_link.py: hub de presencia por cuenta (pc/send), códigos de 6 caracteres,
 *     relay de solicitud/aceptar/rechazar y de la señalización WebRTC (offer/answer/ice),
 *     dispositivos Bluetooth y estado del juego; páginas /vr-search y /vr-send; enrutado por
 *     subdominio (doganiero-vr-search.* / doganiero-vr-send.*) y WebSocket /api/vrlink/ws.
 *     main.py lo incluye y doga_auth acepta los sitios vrsearch/vrsend.
 *  - vr-search.js (ordenador): Web Bluetooth (requestDevice + battery_service), petición de
 *     conexión, receptor WebRTC (setRemoteDescription + createAnswer + ontrack → <video>),
 *     estadísticas y juego (barras), foto a la carta.
 *  - vr-send.js (gafas): código o cuenta, aceptar/rechazar, emisor WebRTC (offer + addTrack),
 *     fuentes: pantalla del visor / cámara / espejo del juego, y lazo con el juego MR.
 *  - vr-room-snake.js: sesión immersive-ar con hit-test, escaneo de suelo y obstáculos,
 *     zona de juego con celdas bloqueadas, serpiente que se arrastra, comida/acariciar/limpiar,
 *     panel de estado y espejo (captureStream + toDataURL) para que el ordenador lo vea.
 *  - index.html: versión 2026.23, entrada de novedades primera y README al día.
 */
'use strict';
var fs = require('fs');
var path = require('path');
var assert = require('assert');
var root = path.join(__dirname, '..');

function ok(msg) { console.log('ok', msg); }
function read(name) { return fs.readFileSync(path.join(root, name), 'utf8'); }

var main = read('main.py');
var link = read('vr_link.py');
var dogaAuth = read('doga_auth.py');
var searchJs = read('vr-search.js');
var searchHtml = read('vr-search.html');
var sendJs = read('vr-send.js');
var sendHtml = read('vr-send.html');
var gameJs = read('vr-room-snake.js');
var html = read('index.html');
var readme = read('README.md');

/* 1) Servidor: páginas, hub y WebSocket */
assert.ok(link.indexOf('VR_SITE_PC = "vrsearch"') >= 0, 'sitio doga_auth del ordenador');
assert.ok(link.indexOf('VR_SITE_SEND = "vrsend"') >= 0, 'sitio doga_auth de las gafas');
assert.ok(link.indexOf('class VrLinkHub') >= 0, 'hub de presencia');
assert.ok(link.indexOf('def new_code(') >= 0, 'código de emparejamiento');
assert.ok(link.indexOf('PAIR_TTL_S = 6 * 3600') >= 0, 'el código dura 6 h');
assert.ok(link.indexOf('@r.websocket("/api/vrlink/ws")') >= 0, 'WebSocket del enlace');
assert.ok(link.indexOf('if mtype == "request":') >= 0, 'solicitud del ordenador');
assert.ok(link.indexOf('"type": "accepted"') >= 0, 'aceptar desde las gafas');
assert.ok(link.indexOf('"type": "rejected"') >= 0, 'rechazar desde las gafas');
assert.ok(link.indexOf('("offer", "answer", "ice", "restart", "hangup", "game_cmd", "game_state", "status", "screenshot")') >= 0, 'relay WebRTC y juego');
assert.ok(link.indexOf('def ice_servers()') >= 0, 'STUN/TURN configurables');
assert.ok(link.indexOf('SNAKEOS_TURN_URL') >= 0, 'TURN por entorno');
assert.ok(link.indexOf('_HOST_SEARCH = "doganiero-vr-search."') >= 0, 'subdominio del ordenador');
assert.ok(link.indexOf('_HOST_SEND = "doganiero-vr-send."') >= 0, 'subdominio de las gafas');
assert.ok(link.indexOf('def install_hosts(app)') >= 0, 'las páginas se sirven en «/» de su host');
assert.ok(link.indexOf('@r.get("/vr-search")') >= 0 && link.indexOf('@r.get("/vr-send")') >= 0, 'rutas de las dos páginas');
assert.ok(link.indexOf('@r.post("/api/vrlink/pair")') >= 0, 'crear código');
assert.ok(main.indexOf('import vr_link') >= 0, 'main.py incluye vr_link');
assert.ok(main.indexOf('vr_link.build_router(doga_auth.site_user)') >= 0, 'router con la cuenta dogaemail');
assert.ok(main.indexOf('vr_link.install_hosts(app)') >= 0, 'enrutado por subdominio instalado');
assert.ok(dogaAuth.indexOf('"vrsearch", "vrsend"') >= 0, 'doga_auth acepta los dos sitios');
ok('servidor: hub, código, relay WebRTC y subdominios');

/* 2) Ordenador: Bluetooth + petición + receptor WebRTC */
assert.ok(searchJs.indexOf('acceptAllDevices: true') >= 0, 'Web Bluetooth busca todo');
assert.ok(searchJs.indexOf("getPrimaryService('battery_service')") >= 0, 'lee la batería de las gafas');
assert.ok(searchJs.indexOf('async function btSearch()') >= 0, 'búsqueda Bluetooth');
assert.ok(searchJs.indexOf("wsSend({ type: 'request' })") >= 0, 'pide la conexión');
assert.ok(searchJs.indexOf('new RTCPeerConnection(cfg)') >= 0, 'conexión WebRTC del ordenador');
assert.ok(searchJs.indexOf('rtc.createAnswer()') >= 0, 'responde a la oferta de las gafas');
assert.ok(searchJs.indexOf('rtc.ontrack') >= 0, 'recibe la imagen');
assert.ok(searchJs.indexOf('video.srcObject = stream') >= 0, 'la pinta en el <video>');
assert.ok(searchJs.indexOf('inbound-rtp') >= 0, 'estadísticas de vídeo');
assert.ok(searchJs.indexOf("type: 'bt_devices'") >= 0, 'guarda las gafas vistas en la cuenta');
assert.ok(searchJs.indexOf('requestFullscreen') >= 0, 'pantalla completa');
assert.ok(searchJs.indexOf("action: 'screenshot'") >= 0, 'pide foto a las gafas');
assert.ok(searchHtml.indexOf('id="remote"') >= 0 && searchHtml.indexOf('<video') >= 0, 'reproductor');
assert.ok(searchHtml.indexOf('id="pairCode"') >= 0, 'enseña el código para las gafas');
assert.ok(searchHtml.indexOf('/static/vr-search.js') >= 0, 'carga su JS');
assert.ok(searchHtml.indexOf('Doganiero-vr-send.softportweb.com') >= 0, 'explica la página de las gafas');
ok('ordenador: Bluetooth, petición y vídeo en directo');

/* 3) Gafas: aceptar y transmitir */
assert.ok(sendJs.indexOf("api('/api/doga-auth/login'") >= 0, 'entra con la cuenta dogaemail');
assert.ok(sendJs.indexOf('function enterCode()') >= 0, 'o con el código del ordenador');
assert.ok(sendJs.indexOf("wsSend({ type: 'accept', id: rid") >= 0, 'acepta la solicitud');
assert.ok(sendJs.indexOf("wsSend({ type: 'reject'") >= 0, 'rechaza la solicitud');
assert.ok(sendJs.indexOf('getDisplayMedia') >= 0, 'pantalla del visor si el navegador lo permite');
assert.ok(sendJs.indexOf('getUserMedia') >= 0, 'cámara como alternativa');
assert.ok(sendJs.indexOf('DoganieroRoomSnake.mirrorStream()') >= 0, 'el espejo del juego también se transmite');
assert.ok(sendJs.indexOf('rtc.addTrack(track, stream)') >= 0, 'envía las pistas');
assert.ok(sendJs.indexOf('rtc.createOffer()') >= 0, 'ofrece la conexión');
assert.ok(sendJs.indexOf("type: 'game_state'") >= 0, 'manda el estado del juego');
assert.ok(sendJs.indexOf("action === 'screenshot'") >= 0, 'atiende la foto pedida');
assert.ok(sendHtml.indexOf('id="acceptBtn"') >= 0, 'botón grande de aceptar');
assert.ok(sendHtml.indexOf('id="codeInput"') >= 0, 'campo del código');
assert.ok(sendHtml.indexOf('id="gameBtn"') >= 0, 'botón del juego');
assert.ok(sendHtml.indexOf('/static/vr-room-snake.js') >= 0, 'carga el juego');
assert.ok(sendHtml.indexOf('/static/vr-send.js') >= 0, 'carga su JS');
ok('gafas: aceptar, transmitir y lanzar el juego');

/* 4) Juego MR: escaneo + serpiente + espejo */
assert.ok(gameJs.indexOf('requestSession(mode, sessionInit)') >= 0, 'abre sesión inmersiva');
assert.ok(gameJs.indexOf("requiredFeatures: ['hit-test', 'local-floor']") >= 0, 'hit-test y suelo');
assert.ok(gameJs.indexOf('requestHitTestSource') >= 0, 'fuente de impactos');
assert.ok(gameJs.indexOf('function scanHits(frame)') >= 0, 'escanea con los impactos');
assert.ok(gameJs.indexOf('up.y > 0.72') >= 0, 'distingue suelo de paredes/muebles');
assert.ok(gameJs.indexOf('function finishScan(why)') >= 0, 'cierra el escaneo');
assert.ok(gameJs.indexOf("blocked[cc + ':' + rr] = 1") >= 0, 'los obstáculos se bloquean');
assert.ok(gameJs.indexOf('function buildArena(bounds)') >= 0, 'zona de juego según lo escaneado');
assert.ok(gameJs.indexOf('function spawnSnake()') >= 0, 'aparece la serpiente');
assert.ok(gameJs.indexOf('function spawnFood(x, z)') >= 0, 'comida con el gatillo');
assert.ok(gameJs.indexOf("ctrl.addEventListener('squeezestart'") >= 0, 'squeeze (limpiar)');
assert.ok(gameJs.indexOf("ctrl.addEventListener('selectstart'") >= 0, 'gatillo (comer/acariciar)');
assert.ok(gameJs.indexOf('function cleanMess(ctrl, point)') >= 0, 'limpiar desastres');
assert.ok(gameJs.indexOf('hunger') >= 0 && gameJs.indexOf('happy') >= 0 && gameJs.indexOf('clean') >= 0, 'las tres barras de cuidado');
assert.ok(gameJs.indexOf('function updateStats(dt)') >= 0, 'los cuidados bajan con el tiempo');
assert.ok(gameJs.indexOf('m.renderer.render(st.scene, m.cam)') >= 0, 'espejo 3D aparte');
assert.ok(gameJs.indexOf('captureStream(15)') >= 0, 'el espejo se puede transmitir');
assert.ok(gameJs.indexOf('toDataURL') >= 0, 'foto de la habitación');
assert.ok(gameJs.indexOf('window.DoganieroRoomSnake') >= 0, 'API pública');
assert.ok(gameJs.indexOf('hapticActuators') >= 0, 'vibración de los mandos');
assert.ok(gameJs.indexOf('immersive-vr') >= 0, 'sin AR cae a VR');
assert.ok(gameJs.indexOf('function startPreview(why)') >= 0, 'y sin WebXR, modo prueba');
ok('juego: escaneo de la habitación y serpiente a cuidar');

/* 5) index.html + README */
assert.ok(html.indexOf("window.SNAKE_OS_VERSION='2026.33'") >= 0, 'versión 2026.23');
assert.ok(html.indexOf("{v:'2026.23'") >= 0, 'entrada de novedades 2026.23');
assert.ok(html.indexOf("{v:'2026.23'") < html.indexOf("{v:'2026.22'"), 'la entrada 2026.23 va primera');
assert.ok(html.indexOf('Doganiero-vr-send.softportweb.com') >= 0, 'novedades citan la página de las gafas');
assert.ok(html.indexOf('escanea tu habitación') >= 0, 'novedades del escaneo');
assert.ok(readme.indexOf('2026.23') >= 0, 'README cita la versión 2026.23');
assert.ok(readme.indexOf('Doganiero-vr-search.softportweb.com') >= 0, 'README cita la web del ordenador');
assert.ok(readme.indexOf('Doganiero-vr-send.softportweb.com') >= 0, 'README cita la web de las gafas');
ok('index.html y README en 2026.23');

console.log('\ntest_release_2623 OK');
