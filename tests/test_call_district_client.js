var assert = require("assert");
var cd = require("../static/call-district-client.js");

assert.strictEqual(cd.normalize(" Salamanca "), "Salamanca");
assert.strictEqual(cd.normalize("Calle Mayor"), null);
assert.strictEqual(cd.normalize("40.41"), null);
assert.strictEqual(cd.normalize("Madrid"), "Madrid");

var on = cd.outgoing("cdemo1234", true, "Retiro");
assert.deepStrictEqual(Object.keys(on).sort(), ["callId", "consent", "district", "type"]);
assert.strictEqual(on.district, "Retiro");
assert.strictEqual(on.lat, undefined);

var off = cd.outgoing("cdemo1234", false, "Retiro");
assert.strictEqual(off.consent, false);
assert.strictEqual(off.district, undefined);

assert.strictEqual(cd.viewText({ shared: true, district: "Retiro", reason: "indicado" }), "Distrito indicado (sin comprobar): Retiro");
assert.strictEqual(cd.viewText({ shared: false, reason: "no_compartido" }), "Distrito no compartido");
assert.strictEqual(cd.viewText({ shared: false, reason: "no_disponible" }), "Distrito no disponible");
assert.ok(cd.viewText({ shared: true, district: "Madrid", reason: "indicado" }).indexOf("sin comprobar") !== -1);
console.log("call-district-client ok");
