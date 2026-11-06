var assert = require("assert");
var fs = require("fs");
var ad = require("../call-video-ad.js");

function rect(box) {
  return { left: box.left, top: box.top, right: box.right, bottom: box.bottom };
}

function inside(name, box, vw, vh) {
  assert.ok(box.left >= 16, name + " left " + box.left);
  assert.ok(box.top >= 8, name + " top " + box.top);
  assert.ok(box.right <= vw - 16, name + " right " + box.right + " vw " + vw);
  assert.ok(box.bottom <= vh - 8, name + " bottom " + box.bottom + " vh " + vh);
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
  var placed = ad.layout(vw, vh, minimized);
  var boxes = [placed.ad, placed.stage, placed.hangup];
  if (placed.controls) boxes.push(placed.controls);
  boxes.forEach(function (item, i) {
    inside(["ad", "stage", "hang", "controls"][i] || "box", item, vw, vh);
  });
  assert.ok(!ad.overlaps(rect(placed.ad), placed.stage), vw + " ad/video");
  assert.ok(!ad.overlaps(rect(placed.ad), placed.hangup), vw + " ad/colgar");
  assert.ok(!ad.overlaps(rect(placed.stage), placed.hangup), vw + " video/colgar");
  if (placed.controls) {
    assert.ok(!ad.overlaps(rect(placed.ad), placed.controls), vw + " ad/controles");
    assert.ok(!ad.overlaps(rect(placed.hangup), placed.controls), vw + " colgar/controles");
  }
  ad.SLOTS.forEach(function (slot) {
    assert.ok(ad.wrapsInside(slot.line, placed.ad.width - 16, 7), vw + " " + slot.name);
    assert.ok(ad.wrapsInside(slot.name, placed.ad.width - 16, 7.2), slot.name);
  });
  return placed;
}

var p360 = check(360, 640, false);
assert.strictEqual(p360.mode, "stack");
assert.strictEqual(p360.ad.left, 16);
assert.ok(p360.ad.right <= 344, p360.ad.right);
assert.ok(p360.ad.width >= 300, p360.ad.width);

var p390 = check(390, 780, false);
assert.strictEqual(p390.mode, "stack");
assert.ok(p390.ad.width >= 350, p390.ad.width);

var wide = check(1280, 800, false);
assert.strictEqual(wide.mode, "side");
assert.strictEqual(wide.moveStage, false);
assert.strictEqual(wide.stage.width, 360);

check(1280, 800, true);

var src = fs.readFileSync(require("path").join(__dirname, "..", "call-video-ad.js"), "utf8");
assert.ok(src.indexOf("drawImage") === -1);
assert.ok(src.indexOf("toDataURL") === -1);
assert.ok(src.indexOf("getUserMedia") === -1);
assert.ok(src.indexOf("document.cookie") === -1);
assert.ok(src.indexOf("localStorage") === -1);
console.log("call-video-ad ok", p360.mode, p360.ad.left, p360.ad.width, wide.mode);
