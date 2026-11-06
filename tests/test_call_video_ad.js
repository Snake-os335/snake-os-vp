var assert = require("assert");
var fs = require("fs");
var ad = require("../static/call-video-ad.js");

function rect(box) {
  return { left: box.left, top: box.top, right: box.right, bottom: box.bottom };
}

ad.SLOTS.forEach(function (slot) {
  var blob = (slot.name + " " + slot.line).toLowerCase();
  assert.ok(blob.indexOf("book") === -1, slot.name);
  assert.ok(blob.indexOf("precio") === -1, slot.name);
  assert.ok(blob.indexOf("oferta") === -1, slot.name);
  assert.ok(blob.indexOf("ordenador") === -1, slot.name);
  assert.ok(blob.indexOf("http") === -1, slot.name);
  if (slot.img) assert.ok(slot.img.indexOf("/static/assets/doganiero-") === 0, slot.img);
});

function check(vw, vh, minimized) {
  var box = ad.layout(vw, vh, minimized);
  var stage = box.stage;
  assert.ok(!ad.overlaps(rect(box), stage), vw + "x" + vh + " ad tapa el vídeo");
  if (!minimized) {
    assert.ok(!ad.overlaps(rect(box), ad.controlsBox(stage)), "ad tapa controles");
  }
  assert.ok(!ad.overlaps(rect(box), ad.hangupBox(vw, vh)), "ad tapa colgar");
  assert.ok(box.left >= 0 && box.top >= 0, "ad fuera de pantalla");
  assert.ok(box.right <= vw && box.bottom <= vh, "ad desborda");
  assert.strictEqual(stage.width, Math.min(minimized ? 156 : 360, vw - 24));
}

check(1280, 800, false);
check(360, 640, false);
check(1280, 800, true);
check(390, 700, false);

var narrow = ad.layout(360, 640, false);
assert.strictEqual(narrow.mode, "above");
assert.strictEqual(narrow.stage.width, 336);
var wide = ad.layout(1280, 800, false);
assert.strictEqual(wide.mode, "side");
assert.strictEqual(wide.stage.width, 360);

var src = fs.readFileSync(require("path").join(__dirname, "..", "static", "call-video-ad.js"), "utf8");
assert.ok(src.indexOf("drawImage") === -1);
assert.ok(src.indexOf("toDataURL") === -1);
assert.ok(src.indexOf("getUserMedia") === -1);
assert.ok(src.indexOf("document.cookie") === -1);
assert.ok(src.indexOf("localStorage") === -1);
assert.ok(src.indexOf("fetch(") === -1);
console.log("call-video-ad ok", wide.mode, narrow.mode);
