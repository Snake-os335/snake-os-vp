/* Distrito escrito por la persona. Sin GPS, sin mapa, sin red de anuncios.
   Snake OS no comprueba que el texto sea un distrito administrativo. */
(function (root, factory) {
  var api = factory();
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  if (root) root.CallDistrict = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  var street = /\b(calle|avda|avenida|plaza|paseo|carretera|ctra|barrio|urbanizacion|urbanización|portal|piso|puerta|km|numero|número)\b/i;

  function normalize(raw) {
    if (typeof raw !== "string") return null;
    var text = raw.replace(/\s+/g, " ").trim();
    if (text.length < 2 || text.length > 40) return null;
    if (/\d/.test(text) || street.test(text)) return null;
    var low = text.toLowerCase();
    if (low.indexOf("http") !== -1 || text.indexOf("@") !== -1 || text.indexOf("/") !== -1 || text.indexOf("\\") !== -1 || text.indexOf(",") !== -1) return null;
    if (!/^[A-Za-zÁÉÍÓÚÜÑáéíóúüñÀ-ÿ'’.\- ]+$/.test(text)) return null;
    return text;
  }

  function outgoing(callId, consent, raw) {
    var body = { type: "call_district", callId: String(callId || ""), consent: !!consent };
    if (body.consent) {
      var district = normalize(raw);
      if (district) body.district = district;
    }
    return body;
  }

  function viewText(msg) {
    var reason = msg && msg.reason;
    if (msg && msg.shared && typeof msg.district === "string" && msg.district) {
      return "Distrito indicado (sin comprobar): " + msg.district;
    }
    if (reason === "no_compartido") return "Distrito no compartido";
    if (reason === "retirado") return "Distrito retirado";
    return "Distrito no disponible";
  }

  return { normalize: normalize, outgoing: outgoing, viewText: viewText };
});
