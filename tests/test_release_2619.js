/* Snake OS 2026.19: el audio de las llamadas y videollamadas vuelve a oírse.
 *
 * Qué se comprueba (estático, sobre los ficheros reales):
 *  - doganiero-chat.js reproduce el audio remoto con reintento (dcRawPlay) y
 *    desbloqueo por gesto (dcArmAudioUnlock) si el navegador lo bloquea.
 *  - El banner de llamada activa tiene botón «🔊 Sonido» (dcEnableSound).
 *  - El fallback PCM ya no se descarta si WebRTC «parece» conectado pero no
 *    llegan bytes: dcWebrtcHears() mira el sondeo getStats (_rtpAudioOk).
 *  - Un AudioContext suspendido no se da por bueno: dcPlayPcm/dcStartPcmSend
 *    arman el desbloqueo.
 *  - El <audio> remoto ya no se crea con display:none (rompe reproducción en móviles).
 *  - main.py: el server i9 ya no cierra los WebSocket (chat/llamadas/metaverso).
 *  - index.html: versión 2026.22, entrada de novedades y ?v= nuevo del chat.
 */
'use strict';
var fs = require('fs');
var path = require('path');
var assert = require('assert');
var root = path.join(__dirname, '..');

function fail(msg) { console.error('FAIL', msg); process.exitCode = 1; }
function ok(msg) { console.log('ok', msg); }

var chat = fs.readFileSync(path.join(root, 'doganiero-chat.js'), 'utf8');
var py = fs.readFileSync(path.join(root, 'main.py'), 'utf8');
var html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');

// 1) Reproducción del audio remoto con reintento y desbloqueo por gesto
assert.ok(chat.indexOf('function dcRawPlay(el)') >= 0, 'existe dcRawPlay');
assert.ok(chat.indexOf('function dcArmAudioUnlock()') >= 0, 'existe dcArmAudioUnlock');
assert.ok(chat.indexOf('function dcClearAudioUnlock()') >= 0, 'existe dcClearAudioUnlock');
assert.ok(chat.indexOf('function dcKickAudioAll()') >= 0, 'existe dcKickAudioAll');
assert.ok(chat.indexOf("document.addEventListener('touchend', once, true)") >= 0, 'el desbloqueo escucha toques en móvil');
assert.ok(chat.indexOf('dcRawPlay(audioV)') >= 0, 'el audio mezclado del vídeo usa dcRawPlay');
assert.ok(chat.indexOf('dcRawPlay(audio)') >= 0, 'el audio remoto usa dcRawPlay');
assert.strictEqual(chat.indexOf('var pr = audio.play();'), -1, 'ya no hay play() sin reintento en ontrack');
assert.strictEqual(chat.indexOf('var prV = audioV.play();'), -1, 'ya no hay play() sin reintento en ontrack (vídeo)');
assert.strictEqual(chat.indexOf("a.style.display = 'none'"), -1, 'el <audio> remoto ya no usa display:none');
ok('audio remoto con reintento, desbloqueo por gesto y sin display:none');


// 2) Botón «Sonido» en la barra de la llamada
assert.ok(chat.indexOf('function dcEnableSound()') >= 0, 'existe dcEnableSound');
assert.ok(chat.indexOf("'🔊 Sonido'") >= 0, 'el banner ofrece el botón Sonido');
var activeBanner = chat.slice(chat.indexOf('function dcActiveBanner()'));
activeBanner = activeBanner.slice(0, activeBanner.indexOf('function dcEnableSound'));
assert.ok(activeBanner.indexOf('dcEnableSound') >= 0, 'dcActiveBanner engancha el botón Sonido');
ok('botón «🔊 Sonido» en la llamada activa');

// 3) Fallback de voz: solo se descarta el PCM si de verdad llega audio por WebRTC
assert.ok(chat.indexOf('dcCall._rtpAudioOk === false') >= 0, 'dcWebrtcHears mira el sondeo real');
assert.ok(chat.indexOf('function dcStartAudioProbe()') >= 0, 'existe el sondeo getStats');
assert.ok(chat.indexOf('function dcStopAudioProbe()') >= 0, 'existe la parada del sondeo');
assert.ok(chat.indexOf('inbound-rtp') >= 0, 'el sondeo mira inbound-rtp');
assert.ok(chat.indexOf('bytesReceived') >= 0, 'el sondeo mira bytesReceived');
var begin = chat.slice(chat.indexOf('function dcBeginMedia()'));
begin = begin.slice(0, begin.indexOf('function dcReset'));
assert.ok(begin.indexOf('dcStartAudioProbe()') >= 0, 'la llamada activa arranca el sondeo');
var reset = chat.slice(chat.indexOf('function dcReset(reason)'));
reset = reset.slice(0, reset.indexOf('function dcCleanupVideoExtras') > 0 ? reset.indexOf('function dcCleanupVideoExtras') : 4000);
assert.ok(reset.indexOf('dcStopAudioProbe()') >= 0, 'colgar para el sondeo');
assert.ok(reset.indexOf('dcClearAudioUnlock()') >= 0, 'colgar limpia el desbloqueo');
assert.ok(chat.indexOf('if (dcCall._webrtcDead) return false;') >= 0, 'con WebRTC muerto no se descarta el PCM');
ok('fallback PCM con comprobación real de audio entrante');

// 4) AudioContext suspendido → se arma el desbloqueo en recepción y envío
var playPcm = chat.slice(chat.indexOf('function dcPlayPcm('));
playPcm = playPcm.slice(0, playPcm.indexOf('function dcEnsureAudio'));
assert.ok(playPcm.indexOf("ctx.state !== 'running'") >= 0, 'dcPlayPcm no da por bueno un contexto suspendido');
var pcmSend = chat.slice(chat.indexOf('function dcStartPcmSend()'));
pcmSend = pcmSend.slice(0, pcmSend.indexOf('dcCall.pcmSrc ='));
assert.ok(pcmSend.indexOf('dcArmAudioUnlock()') >= 0, 'el envío PCM arma el desbloqueo si el contexto está suspendido');
ok('contextos de audio suspendidos cubiertos');

// 5) Estado nuevo en dcCall
assert.ok(chat.indexOf('audioUnlock: null') >= 0, 'dcCall guarda el desbloqueo');
assert.ok(chat.indexOf('_audioProbeTimer: null') >= 0, 'dcCall guarda el sondeo');
assert.ok(chat.indexOf('_rtpAudioOk: null') >= 0, 'dcCall guarda el resultado del sondeo');
ok('estado del audio de llamada declarado');

// 6) main.py: los WebSocket ya no se cierran si el server i9 no está conectado
var wsEnter = py.indexOf('async def _i9_ws_enter');
assert.ok(wsEnter >= 0, 'sigue existiendo _i9_ws_enter');
assert.ok(py.slice(wsEnter, wsEnter + 600).indexOf('ws.close(code=4403)') === -1, 'el gate ya no cierra con 4403');
var sweep = py.indexOf('async def _i9_socket_sweep');
assert.ok(sweep >= 0, 'sigue existiendo _i9_socket_sweep');
assert.ok(py.slice(sweep, sweep + 400).indexOf('while True') === -1, 'el barrido ya no corre en bucle');
ok('main.py: WebSocket libres del gate del server i9');

// 7) Versión y cache-bust del chat
assert.ok(html.indexOf("window.SNAKE_OS_VERSION='2026.31'") >= 0, 'versión 2026.22');
assert.ok(html.indexOf("{v:'2026.22'") >= 0, 'entrada de novedades 2026.22');
assert.ok(html.indexOf("{v:'2026.22'") < html.indexOf("{v:'2026.19'"), 'la entrada 2026.22 va primera');
assert.ok(html.indexOf('doganiero-chat.js?v=202611111830') >= 0, '?v= nuevo de doganiero-chat.js');
ok('index.html en 2026.22 y chat sin caché vieja');

if (process.exitCode) process.exit(process.exitCode);
console.log('todo bien');
