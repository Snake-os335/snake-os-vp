/* Snake OS · voz propia (Piper TTS en el servidor, /api/tts).
   Sustituye window.speechSynthesis por un envoltorio compatible: las apps siguen usando
   speechSynthesis.speak(new SpeechSynthesisUtterance(...)) y suenan con la voz de Snake OS.
   Si el servidor falla, esa frase se dice con la voz del sistema. Respeta ES/EN. */
(function () {
  var nat = window.speechSynthesis;
  if (!nat || window.snakeVoice) return;
  var queue = [], cur = null, curU = null, paused = false, serverOk = true, failUntil = 0;
  function uiLang() { try { return window.snakeI18n && window.snakeI18n.lang === 'en' ? 'en' : 'es'; } catch (e) { return 'es'; } }
  function langOf(u) { var l = String((u && u.lang) || ''); return /^en/i.test(l) ? 'en' : (/^es/i.test(l) ? 'es' : uiLang()); }
  function fire(u, type, extra) {
    var ok = false;
    try { var ev = new SpeechSynthesisEvent(type, Object.assign({ utterance: u, charIndex: 0, elapsedTime: 0 }, extra || {})); ok = true; u.dispatchEvent(ev); } catch (e) {}
    if (!ok) { try { var h = u['on' + type]; if (typeof h === 'function') h.call(u, { type: type, utterance: u }); } catch (e2) {} }
  }
  function chunks(text) {
    var out = [], parts = String(text).match(/[^.!?¡¿…\n]+[.!?…]*\s*|\n+/g) || [String(text)], buf = '';
    parts.forEach(function (p) { if ((buf + p).length > 280 && buf) { out.push(buf.trim()); buf = ''; } buf += p; while (buf.length > 280) { var cut = buf.lastIndexOf(' ', 280); if (cut < 80) cut = 280; out.push(buf.slice(0, cut).trim()); buf = buf.slice(cut); } });
    if (buf.trim()) out.push(buf.trim());
    return out.filter(function (x) { return /[\wÀ-ÿ]/.test(x); });
  }
  function fetchWav(text, lang) {
    return fetch('/api/tts', { method: 'POST', credentials: 'same-origin', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ text: text, lang: lang }) })
      .then(function (r) { if (!r.ok) throw new Error('tts ' + r.status); return r.blob(); })
      .then(function (b) { return URL.createObjectURL(b); });
  }
  function native(u) {
    // Voz del sistema para esta frase; al terminar seguimos con la cola.
    var done = function () { u.removeEventListener('end', done); u.removeEventListener('error', done); curU = null; pump(); };
    u.addEventListener('end', done); u.addEventListener('error', done);
    curU = u;
    try { nat.speak(u); } catch (e) { done(); }
  }
  // Con Snake OS! en inglés, toda narración (TV, tutorial, asistente, bots...) sale en inglés:
  // texto traducido (diccionario + /api/i18n/en, marcas intactas) y voz inglesa de Piper.
  var EN = {};
  function looksEs(t) { return /[áéíóúñ¿¡]|\b(el|la|los|las|de|que|y|en|un|una|es|para|con|por|tu|hola)\b/i.test(t); }
  function toEn(text) {
    var I = window.snakeI18n, out = [], need = [];
    var segs = String(text).match(/[^.!?…]+[.!?…]*\s*/g) || [String(text)];
    segs.forEach(function (sg, i) {
      var k = sg.trim(), t = k && (EN[k] || (I && I.t ? I.t(k) : k));
      out[i] = t && t !== k ? sg.replace(k, t) : sg;
      if (k && (!t || t === k) && looksEs(k)) need.push([i, k.slice(0, 200)]);
    });
    if (!need.length) return Promise.resolve({ text: out.join(''), en: true });
    return fetch('/api/i18n/en', { method: 'POST', credentials: 'same-origin', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ strings: need.map(function (n) { return n[1]; }) }) })
      .then(function (r) { return r.ok ? r.json() : {}; }).catch(function () { return {}; })
      .then(function (r) {
        var t = (r && r.t) || {}, all = true;
        need.forEach(function (n) { var v = t[n[1]]; if (v) { EN[n[1]] = v; out[n[0]] = segs[n[0]].replace(n[1], v); } else all = false; });
        return { text: out.join(''), en: all };
      });
  }
  function pump() {
    if (cur || curU || paused || !queue.length) return;
    var u0 = queue[0];
    if (uiLang() === 'en' && !u0.__snkEn) {
      if (u0.__snkEnBusy) return;
      u0.__snkEnBusy = 1;
      toEn(u0.text || '').then(function (r) {
        u0.__snkEn = 1;
        // Si no se pudo traducir, se queda en español con la voz española (mejor que inglés con acento raro).
        if (r.en) { u0.__snkText = r.text; u0.__snkLang = 'en'; } else u0.__snkLang = 'es';
        pump();
      });
      return;
    }
    var u = queue.shift(), lang = u.__snkLang || (uiLang() === 'en' ? 'en' : langOf(u)), parts = chunks(u.__snkText || u.text || '');
    if (!parts.length) { fire(u, 'start'); fire(u, 'end'); return pump(); }
    if (!serverOk && Date.now() < failUntil) return native(u);
    curU = u;
    var i = 0, started = false, next = fetchWav(parts[0], lang), cancelled = false;
    u.__snkCancel = function () { cancelled = true; };
    function step() {
      var p = next; next = (i + 1 < parts.length) ? fetchWav(parts[i + 1], lang) : null;
      p.then(function (url) {
        if (cancelled) { URL.revokeObjectURL(url); return; }
        var a = new Audio(url); cur = a;
        try { a.volume = u.volume == null ? 1 : Math.max(0, Math.min(1, u.volume)); } catch (e) {}
        try { if (u.rate && u.rate !== 1) a.playbackRate = Math.max(0.5, Math.min(2, u.rate)); } catch (e) {}
        a.onended = function () { URL.revokeObjectURL(url); cur = null; i++; if (cancelled) return; if (i < parts.length) step(); else { curU = null; fire(u, 'end'); pump(); } };
        a.onerror = function () { a.onended = null; cur = null; fail(); };
        var pr = a.play();
        if (!started) { started = true; fire(u, 'start'); }
        if (pr && pr.catch) pr.catch(function () { if (cur === a) { cur = null; fail(); } });
      }, function () { fail(); });
    }
    function fail() {
      if (cancelled) return;
      cancelled = true; cur = null; curU = null;
      serverOk = false; failUntil = Date.now() + 60000;   // un minuto con la voz del sistema y se reintenta
      var rest = parts.slice(i).join(' ');
      var nu; try { nu = new SpeechSynthesisUtterance(rest); nu.lang = u.lang || (lang === 'en' ? 'en-GB' : 'es-ES'); nu.rate = u.rate; nu.volume = u.volume; nu.pitch = u.pitch; if (u.voice) nu.voice = u.voice; } catch (e) { nu = null; }
      if (!nu) { fire(u, 'end'); return pump(); }
      nu.onend = function () { fire(u, 'end'); }; nu.onerror = function () { fire(u, 'end'); };
      if (!started) { started = true; fire(u, 'start'); }
      native(nu);
    }
    step();
    setTimeout(function () { if (Date.now() > failUntil) serverOk = true; }, 0);
  }
  var api = {
    speak: function (u) {
      if (!u) return;
      var t = String(u.text || '');
      if (!t.trim() || u.__snkNative) { try { nat.speak(u); } catch (e) {} return; } // silencios de «desbloqueo»
      queue.push(u); pump();
    },
    cancel: function () {
      var q = queue.slice(); queue = [];
      var u = curU; curU = null; paused = false;
      if (cur) { try { cur.pause(); cur.removeAttribute('src'); } catch (e) {} cur = null; }
      if (u) { try { if (u.__snkCancel) u.__snkCancel(); } catch (e) {} fire(u, 'end'); }
      try { nat.cancel(); } catch (e) {}
    },
    pause: function () { paused = true; if (cur) try { cur.pause(); } catch (e) {} try { nat.pause(); } catch (e) {} },
    resume: function () { paused = false; if (cur) { try { cur.play(); } catch (e) {} } try { nat.resume(); } catch (e) {} pump(); },
    getVoices: function () { return nat.getVoices(); },
    addEventListener: function () { return nat.addEventListener.apply(nat, arguments); },
    removeEventListener: function () { return nat.removeEventListener.apply(nat, arguments); }
  };
  Object.defineProperty(api, 'speaking', { get: function () { return !!(cur || curU) || nat.speaking; } });
  Object.defineProperty(api, 'pending', { get: function () { return queue.length > 0 || nat.pending; } });
  Object.defineProperty(api, 'paused', { get: function () { return paused || nat.paused; } });
  Object.defineProperty(api, 'onvoiceschanged', { get: function () { return nat.onvoiceschanged; }, set: function (f) { nat.onvoiceschanged = f; } });
  try { Object.defineProperty(window, 'speechSynthesis', { configurable: true, get: function () { return api; } }); } catch (e) { return; }
  window.snakeVoice = { native: nat, speak: function (text, lang) { var u = new SpeechSynthesisUtterance(String(text || '')); if (lang) u.lang = lang; api.speak(u); return u; }, cancel: api.cancel };
})();
