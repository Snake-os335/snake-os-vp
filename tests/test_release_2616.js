/* Snake OS 2026.16: pruebas de la lógica nueva (calculadora, recordatorios, terminal, versión). */
'use strict';
var fs = require('fs');
var path = require('path');
var vm = require('vm');
var assert = require('assert');
var root = path.join(__dirname, '..');

function fail(msg) { console.error('FAIL', msg); process.exitCode = 1; }
function ok(msg) { console.log('ok', msg); }

var apps = fs.readFileSync(path.join(root, 'snake-apps-extras.js'), 'utf8');
function grab(name) {
  var re = new RegExp('function ' + name + '\\([^)]*\\) \\{[\\s\\S]*?\\n  \\}');
  var m = apps.match(re);
  if (!m) throw new Error('no está ' + name);
  return m[0];
}
var sandbox = {};
vm.createContext(sandbox);
vm.runInContext(
  grab('calcSignToggle') + '\n' +
  grab('hmToMin') + '\n' +
  grab('quietEndMs') + '\n' +
  grab('quietDeferOpen') + '\n' +
  grab('reminderAction') + '\n' +
  'this.calcSignToggle=calcSignToggle; this.quietEndMs=quietEndMs; this.quietDeferOpen=quietDeferOpen; this.reminderAction=reminderAction;',
  sandbox
);

assert.strictEqual(sandbox.calcSignToggle('5'), '−5');
assert.strictEqual(sandbox.calcSignToggle('−5'), '5');
assert.strictEqual(sandbox.calcSignToggle('5−3'), '5−−3');
assert.strictEqual(sandbox.calcSignToggle('5+3'), '5+−3');
assert.strictEqual(sandbox.calcSignToggle('5×−3'), '5×3');
assert.strictEqual(sandbox.calcSignToggle('5−−3'), '5−3');
assert.strictEqual(sandbox.calcSignToggle(''), null);
assert.strictEqual(sandbox.calcSignToggle('−'), null);
ok('calculadora ± no se come la resta');

var catchMs = 10 * 60 * 1000;
function act(extra) {
  var o = { now: 100000, ev: 100000, fired: false, snoozeWait: false, snoozeDue: false, blocked: false, held: false, catchMs: catchMs, quietSlot: false, quietDefer: false };
  Object.keys(extra).forEach(function (k) { o[k] = extra[k]; });
  return sandbox.reminderAction(o);
}
assert.strictEqual(act({ ev: 200000 }), 'wait');
assert.strictEqual(act({}), 'ping');
assert.strictEqual(act({ now: 100000 + 9 * 60 * 1000 }), 'ping');
assert.strictEqual(act({ now: 100000 + 11 * 60 * 1000 }), 'skip');
assert.strictEqual(act({ fired: true }), 'skip');
assert.strictEqual(act({ blocked: true, quietSlot: true, now: 100000 + 5 * 3600000 }), 'hold');
assert.strictEqual(act({ blocked: true, now: 100000 + 11 * 60 * 1000 }), 'skip');
assert.strictEqual(act({ blocked: true, held: true, now: 100000 + 3 * 3600000 }), 'hold');
assert.strictEqual(act({ quietDefer: true, now: 100000 + 8 * 3600000 }), 'ping');
assert.strictEqual(act({ snoozeWait: true }), 'wait');
assert.strictEqual(act({ snoozeDue: true, blocked: true }), 'hold');
assert.strictEqual(act({ snoozeDue: true }), 'ping');
ok('recordatorios: tarde, silencio y posponer');

var ev = new Date(2026, 10, 5, 23, 0, 0, 0).getTime();
var end = sandbox.quietEndMs(ev, '22:00', '07:00');
assert.strictEqual(end, new Date(2026, 10, 6, 7, 0, 0, 0).getTime());
assert.strictEqual(sandbox.quietEndMs(new Date(2026, 10, 5, 10, 0).getTime(), '22:00', '07:00'), null);
assert.strictEqual(sandbox.quietEndMs(new Date(2026, 10, 5, 6, 30).getTime(), '22:00', '07:00'), new Date(2026, 10, 5, 7, 0).getTime());
var morning = new Date(2026, 10, 6, 7, 30).getTime();
assert.strictEqual(sandbox.quietDeferOpen(morning, end, 90 * 60 * 1000), true);
assert.strictEqual(sandbox.quietDeferOpen(new Date(2026, 10, 6, 9, 0).getTime(), end, 90 * 60 * 1000), false);
assert.strictEqual(sandbox.quietDeferOpen(ev, end, 90 * 60 * 1000), false);
ok('el silencio que cruza la medianoche avisa al acabar');

var termCtx = {
  window: {},
  console: console,
  Date: Date,
  Math: Math,
  JSON: JSON,
  Promise: Promise,
  setTimeout: setTimeout,
  clearTimeout: clearTimeout,
  TextEncoder: TextEncoder,
  TextDecoder: TextDecoder,
  crypto: global.crypto,
  document: { addEventListener: function () {}, createElement: function () { return { style: {}, addEventListener: function () {} }; } },
  navigator: { language: 'es-ES' }
};
termCtx.window = termCtx;
termCtx.globalThis = termCtx;
vm.createContext(termCtx);
vm.runInContext(fs.readFileSync(path.join(root, 'snake-terminal.js'), 'utf8'), termCtx, { filename: 'snake-terminal.js' });
assert.strictEqual(typeof termCtx.SnakeTerminal.cal, 'function');

function mondayMonth() {
  for (var y = 2026; y < 2032; y++) {
    for (var m = 1; m <= 12; m++) {
      var dt = new Date(y, m - 1, 1);
      if (dt.getDay() === 1 && !(y === 2026 && m === 11)) return [String(m), String(y)];
    }
  }
  throw new Error('sin mes');
}
var mon = mondayMonth();
termCtx.snakeI18n = { lang: 'es' };
var es = termCtx.SnakeTerminal.cal(mon);
assert.strictEqual(es[1].length, 21, 'cabecera ES de 21: ' + JSON.stringify(es[1]));
assert.ok(es[1].indexOf('sá') >= 0);
assert.strictEqual(es[es.length - 1], '(* = hoy)');
assert.ok(/^ {0,3}1 /.test(es[2]) || es[2].indexOf(' 1 ') === 0 || es[2].indexOf('1 ') >= 0, es[2]);
assert.ok(es[2].indexOf('1') < 3, 'el día 1 queda en la primera columna: ' + JSON.stringify(es[2]));
termCtx.snakeI18n = { lang: 'en' };
var en = termCtx.SnakeTerminal.cal(mon);
assert.strictEqual(en[1].length, 21, 'cabecera EN de 21: ' + JSON.stringify(en[1]));
assert.ok(en[1].indexOf('Mo') === 0);
assert.strictEqual(en[en.length - 1], '(* = today)');
assert.ok(en[1].indexOf('sá') < 0);
ok('cal alinea y se traduce');

var html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
assert.ok(html.indexOf("window.SNAKE_OS_VERSION='2026.23'") >= 0);
assert.ok(html.indexOf("{v:'2026.22'") >= 0);
assert.ok(html.indexOf("{v:'2026.22'") < html.indexOf("{v:'2026.19'"));
['snake-apps-extras.js', 'snake-terminal.js', 'doganiero-phone.js', 'snake-i18n.js', 'snake-2615.js', 'snake-2616.js'].forEach(function (f) {
  if (html.indexOf('/static/' + f + '?v=202611062200') < 0) fail('falta ?v= en ' + f);
});
assert.ok(html.indexOf('snake-2616.js?v=202611062200') >= 0);
assert.ok(html.indexOf('doganiero-chat.js?v=202611111830') >= 0, 'el chat de llamadas lleva su propio ?v=');
ok('versión 2026.22 y ?v= por fichero');

if (process.exitCode) process.exit(process.exitCode);
console.log('todo bien');
