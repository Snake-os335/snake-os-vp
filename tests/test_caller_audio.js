/* Audio saliente del que llama: una pista muda no debe tapar el PCM. */
'use strict';
var fs = require('fs');
var path = require('path');
var vm = require('vm');
var assert = require('assert');
var root = path.join(__dirname, '..');
var src = fs.readFileSync(path.join(root, 'doganiero-chat.js'), 'utf8');

function grab(name) {
  var re = new RegExp('function ' + name + '\\([^)]*\\) \\{[\\s\\S]*?\\n  \\}');
  var m = src.match(re);
  if (!m) throw new Error('no está ' + name);
  return m[0];
}

var sandbox = {};
vm.createContext(sandbox);
vm.runInContext(
  [grab('dcCollectInbound'), grab('dcMarkRtpVoice'), grab('dcShouldPlayRemotePcm'), grab('dcPlanAudioSenders'), grab('dcNextRtpVoice')].join('\n') +
  '\nthis.dcCollectInbound=dcCollectInbound; this.dcMarkRtpVoice=dcMarkRtpVoice; this.dcShouldPlayRemotePcm=dcShouldPlayRemotePcm; this.dcPlanAudioSenders=dcPlanAudioSenders; this.dcNextRtpVoice=dcNextRtpVoice;',
  sandbox
);

var silent = sandbox.dcCollectInbound([
  { type: 'inbound-rtp', kind: 'audio', bytesReceived: 4000, audioLevel: 0 },
  { type: 'inbound-rtp', kind: 'video', bytesReceived: 99999, audioLevel: 0.9 }
]);
assert.strictEqual(silent.haveLevel, true);
assert.strictEqual(silent.level, 0);
assert.strictEqual(silent.bytes, 4000);
assert.strictEqual(sandbox.dcMarkRtpVoice(1000, silent).heard, false);

var voice = sandbox.dcCollectInbound([
  { type: 'inbound-rtp', kind: 'audio', bytesReceived: 8000, audioLevel: 0.2 }
]);
assert.strictEqual(sandbox.dcMarkRtpVoice(1000, voice).heard, true);

var noLevel = sandbox.dcCollectInbound([
  { type: 'inbound-rtp', mediaType: 'audio', bytesReceived: 3000 }
]);
assert.strictEqual(noLevel.haveLevel, false);
assert.strictEqual(sandbox.dcMarkRtpVoice(0, noLevel).heard, false);
assert.strictEqual(sandbox.dcMarkRtpVoice(1000, noLevel).heard, true);

assert.strictEqual(sandbox.dcShouldPlayRemotePcm({
  phase: 'active', b64: 'abc', rtpVoice: false, elementPlaying: true
}), true);
assert.strictEqual(sandbox.dcShouldPlayRemotePcm({
  phase: 'active', b64: 'abc', rtpVoice: true, elementPlaying: true
}), false);
assert.strictEqual(sandbox.dcShouldPlayRemotePcm({
  phase: 'active', b64: 'abc', rtpVoice: true, elementPlaying: false
}), true);
assert.strictEqual(sandbox.dcShouldPlayRemotePcm({
  phase: 'ringing', b64: 'abc', rtpVoice: false, elementPlaying: false
}), false);

function plain(v) { return JSON.parse(JSON.stringify(v)); }
var ended = plain(sandbox.dcPlanAudioSenders(1, [{ kind: 'audio', live: false }, { kind: 'video', live: true }]));
assert.deepStrictEqual(ended, { add: 0, replace: [0] });
var videoFirst = plain(sandbox.dcPlanAudioSenders(1, [{ i: 1, kind: 'audio', live: false }]));
assert.deepStrictEqual(videoFirst, { add: 0, replace: [1] });
var middle = plain(sandbox.dcPlanAudioSenders(1, [
  { i: 0, kind: 'audio', live: true },
  { i: 2, kind: 'audio', live: false }
]));
assert.deepStrictEqual(middle, { add: 0, replace: [2] });
var missing = plain(sandbox.dcPlanAudioSenders(1, []));
assert.deepStrictEqual(missing, { add: 1, replace: [] });
var ok = plain(sandbox.dcPlanAudioSenders(1, [{ kind: 'audio', live: true }]));
assert.deepStrictEqual(ok, { add: 0, replace: [] });

var voice = { voice: false, quiet: 0 };
voice = sandbox.dcNextRtpVoice(voice, true);
assert.strictEqual(voice.voice, true);
voice = sandbox.dcNextRtpVoice(voice, false);
assert.strictEqual(voice.voice, true);
voice = sandbox.dcNextRtpVoice(voice, false);
voice = sandbox.dcNextRtpVoice(voice, false);
voice = sandbox.dcNextRtpVoice(voice, false);
assert.strictEqual(voice.voice, false);
voice = sandbox.dcNextRtpVoice({ voice: false, quiet: 0 }, true);
assert.strictEqual(voice.voice, true);
assert.ok(src.indexOf('dcCall._rtpQuiet = 0') > 0);
assert.ok(src.indexOf('dcReviveCallerMic') > 0);
assert.ok(src.indexOf('pcmGain.gain.value = 1') > 0);
assert.ok(src.indexOf('pcmSink.gain.value = 0') > 0);

assert.ok(src.indexOf('dcWatchInbound') > 0);
assert.ok(src.indexOf('dcBindLiveAudio') > 0);
assert.ok(src.indexOf('pcmGain.gain.value = 1') > 0);
console.log('ok caller: pista muda no tapa el PCM; pista viva se vuelve a enganchar');
