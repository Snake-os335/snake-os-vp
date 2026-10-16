/* Doganiero Phone (Teléfono) — Snake OS
 * Números ficticios DOG-XXXXXX. Llama solo a perfiles de Snake OS usando el mismo sistema
 * de llamadas que Doganiero Chat (doganiero-chat.js: startDoganieroCall / onDoganieroCallChange).
 */
(function (global) {
  'use strict';

  var STYLE_ID = 'dphone-style-req';
  var CSS = [
    '#win-phone .win-body{padding:0;overflow:hidden;display:flex;flex-direction:column;background:linear-gradient(165deg,#0b1a12 0%,#11251a 60%,#0a1410 100%);color:#eafff0}',
    '.dph{display:flex;flex-direction:column;height:100%;min-height:0;font-family:inherit}',
    '.dph-head{flex:0 0 auto;padding:14px 16px 10px;text-align:center;border-bottom:1px solid rgba(52,209,122,.22)}',
    '.dph-mine-label{font-size:.72rem;letter-spacing:.06em;text-transform:uppercase;color:#9fd8b4}',
    '.dph-mine{font-size:1.65rem;font-weight:800;letter-spacing:.04em;color:#7CFC9A;margin-top:2px;font-variant-numeric:tabular-nums}',
    '.dph-mine-note{font-size:.7rem;color:#8fb59d;margin-top:3px}',
    '.dph-tabs{flex:0 0 auto;display:flex;gap:6px;padding:8px 10px;border-bottom:1px solid rgba(52,209,122,.16)}',
    '#win-phone .dph-tab{flex:1 1 0;margin:0;width:auto;min-height:34px;padding:6px 8px;border-radius:999px;border:1px solid rgba(255,255,255,.18);background:rgba(255,255,255,.06);color:#d6f5e1;font-size:.82rem;font-weight:700;box-shadow:none}',
    '#win-phone .dph-tab.on{background:#1f9e57;border-color:#34d17a;color:#fff}',
    '.dph-body{flex:1 1 auto;min-height:0;overflow:auto;padding:12px 14px 16px}',
    '.dph-pane[hidden]{display:none!important}',
    '#win-phone .dph-display{display:block;width:100%;box-sizing:border-box;margin:0 0 10px;padding:10px 12px;border-radius:14px;border:1px solid rgba(52,209,122,.35);background:rgba(0,0,0,.35);color:#fff !important;-webkit-text-fill-color:#fff !important;opacity:1 !important;caret-color:#7CFC9A !important;font-size:1.5rem;font-weight:800;text-align:center;letter-spacing:.06em;font-variant-numeric:tabular-nums}',
    '#win-phone .snk-ei-wrap,#win-phone .snk-ei-layer,#win-phone .snk-ei-caret{display:none!important}',
    '#win-phone .dph-display::placeholder{color:rgba(234,255,240,.32)}',
    '#win-phone .dph-match{display:block;width:auto !important;max-width:100%;margin:-4px auto 8px !important;padding:4px 12px !important;border-radius:999px;border:1px solid rgba(52,209,122,.35);background:rgba(52,209,122,.14);color:#c9ffdc;font-size:.78rem;font-weight:700;cursor:pointer;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;box-shadow:none;min-height:1.9em;min-width:40px}',
    '#win-phone .dph-match[hidden]{display:block !important;visibility:hidden}',
    '#win-phone .dph-match:hover{background:rgba(52,209,122,.26)}',
    '.dph-pad{display:grid;grid-template-columns:repeat(3,1fr);gap:8px;max-width:300px;margin:0 auto}',
    '#win-phone .dph-key{margin:0;width:auto;min-height:52px;padding:6px;border-radius:16px;border:1px solid rgba(255,255,255,.16);background:rgba(255,255,255,.08);color:#fff;font-size:1.35rem;font-weight:700;box-shadow:none}',
    '#win-phone .dph-key:hover:not(:disabled){background:rgba(52,209,122,.22)}',
    '#win-phone .dph-key.ghost{visibility:hidden}',
    '.dph-actions{display:flex;gap:10px;justify-content:center;margin:12px auto 0;max-width:300px}',
    '#win-phone .dph-call,#win-phone .dph-hang,#win-phone .dph-ans{margin:0;flex:1 1 0;width:auto;min-height:46px;border-radius:999px;border:0;font-size:.95rem;font-weight:800;box-shadow:none}',
    '#win-phone .dph-call,#win-phone .dph-ans{background:#34d17a;color:#053018}',
    '#win-phone .dph-hang{background:#ff4d6d;color:#fff}',
    '#win-phone .dph-call:disabled,#win-phone .dph-hang:disabled{opacity:.45;background:#2a3b31;color:#9fb8a8}',
    '.dph-status{min-height:1.3em;margin-top:10px;text-align:center;font-size:.86rem;color:#cfeedd}',
    '.dph-status.err{color:#ff8a80}',
    '.dph-status.live{color:#7CFC9A;font-weight:700}',
    '#win-phone .dph-search{display:block;width:100%;box-sizing:border-box;margin:0 0 10px;padding:8px 12px;border-radius:12px;border:1px solid rgba(255,255,255,.18);background:rgba(0,0,0,.3);color:#fff;font-size:.9rem}',
    '.dph-list{display:flex;flex-direction:column;gap:6px}',
    '.dph-row{display:flex;align-items:center;gap:10px;padding:8px 10px;border-radius:14px;background:rgba(255,255,255,.05);border:1px solid rgba(255,255,255,.08);cursor:pointer}',
    '.dph-row:hover{background:rgba(52,209,122,.14)}',
    '.dph-av{width:38px;height:38px;flex:0 0 38px;border-radius:50%;overflow:hidden;display:inline-flex;align-items:center;justify-content:center;font-size:1.3rem;background:rgba(255,255,255,.12)}',
    '.dph-av img{width:100%;height:100%;object-fit:cover;display:block}',
    '.dph-info{flex:1 1 auto;min-width:0}',
    '.dph-name{font-weight:700;font-size:.92rem;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}',
    '.dph-sub{font-size:.76rem;color:#9fd8b4;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;font-variant-numeric:tabular-nums}',
    '.dph-sub.miss{color:#ff8a80}',
    '#win-phone .dph-rowcall{margin:0;width:38px;height:38px;flex:0 0 38px;min-height:0;padding:0;border-radius:50%;border:0;background:#34d17a;color:#053018;font-size:1.05rem;box-shadow:none}',
    '.dph-empty{text-align:center;color:#8fb59d;font-size:.86rem;padding:24px 8px}',
    '#win-phone .dph-tab{position:relative;font-size:.78rem;padding:6px 4px;white-space:nowrap}',
    '.dph-badge{position:absolute;top:-5px;right:-2px;min-width:18px;height:18px;padding:0 5px;border-radius:999px;background:#ff4d6d;color:#fff;font-size:.68rem;font-weight:800;line-height:18px;text-align:center;box-shadow:0 2px 6px rgba(0,0,0,.35)}',
    '.dph-badge[hidden]{display:none!important}',
    '#win-phone .dph-star{margin:0;width:34px;height:34px;flex:0 0 34px;min-height:0;padding:0;border-radius:50%;border:1px solid rgba(255,255,255,.14);background:rgba(255,255,255,.06);color:#ffd166;font-size:1rem;box-shadow:none;line-height:1}',
    '#win-phone .dph-star.on{background:rgba(255,209,102,.18);border-color:rgba(255,209,102,.55)}',
    '.dph-row.miss-row{border-color:rgba(255,138,128,.35)}',
    '.dph-mine{cursor:copy;-webkit-user-select:none;user-select:none}',
    '.dph-toast{position:absolute;left:50%;bottom:14px;transform:translate(-50%,8px);opacity:0;pointer-events:none;background:rgba(10,24,16,.95);border:1px solid rgba(52,209,122,.45);color:#eafff0;padding:7px 14px;border-radius:999px;font-size:.82rem;font-weight:700;transition:opacity .2s,transform .2s;z-index:5;white-space:nowrap}',
    '.dph-toast.on{opacity:1;transform:translate(-50%,0)}',
    '.dph{position:relative}',
    '.dph-hint{font-size:.7rem;color:#8fb59d;text-align:center;margin-top:8px}',
    '#win-phone .dph-key:active:not(:disabled){transform:scale(.95);background:rgba(52,209,122,.3)}',
    '#win-phone .dph-key{transition:transform .08s,background .15s;-webkit-user-select:none;user-select:none;touch-action:manipulation}',
    'body.theme-light #win-phone .dph-star{background:rgba(255,255,255,.08)}',
    '#win-phone .dph-add{display:flex;gap:6px;margin:0 0 10px;}',
    '#win-phone .dph-add .dph-search{flex:1 1 auto;margin:0;}',
    '#win-phone .dph-add-btn{margin:0;width:auto;flex:0 0 auto;border:0;border-radius:999px;background:#34d17a;color:#053018;font-weight:800;padding:8px 12px;}',
    '#win-phone .dph-reqs{display:flex;flex-direction:column;gap:6px;margin:0 0 10px;}',
    '#win-phone .dph-req{display:flex;align-items:center;gap:8px;padding:8px 10px;border-radius:14px;background:rgba(255,209,102,.08);border:1px solid rgba(255,209,102,.35);}',
    '#win-phone .dph-req-actions{display:flex;gap:4px;flex:0 0 auto;}',
    '#win-phone .dph-req-ok,#win-phone .dph-req-no,#win-phone .dph-remove{margin:0;width:auto;min-height:0;padding:4px 8px;border-radius:999px;font-size:.72rem;font-weight:800;}',
    '#win-phone .dph-req-ok{border:0;background:#34d17a;color:#053018;}',
    '#win-phone .dph-req-no,#win-phone .dph-remove{border:1px solid rgba(255,255,255,.3);background:transparent;color:#eafff0;}'
  ].join('\n');

  function ensureStyle() {
    if (document.getElementById(STYLE_ID)) return;
    var st = document.createElement('style');
    st.id = STYLE_ID;
    st.textContent = CSS;
    document.head.appendChild(st);
  }

  function el(tag, cls, text) {
    var e = document.createElement(tag);
    if (cls) e.className = cls;
    if (text != null) e.textContent = text;
    return e;
  }

  function avatarEl(av) {
    var wrap = el('span', 'dph-av');
    var a = String(av || '👤');
    if (a.indexOf('/api/avatars/') === 0 || a.indexOf('data:image/') === 0) {
      var img = document.createElement('img');
      img.alt = '';
      img.src = a;
      wrap.appendChild(img);
    } else {
      wrap.textContent = a;
    }
    return wrap;
  }

  function apiGet(url) {
    return fetch(url, { credentials: 'same-origin', cache: 'no-store' }).then(function (r) {
      return r.json().catch(function () { return {}; }).then(function (data) {
        if (!r.ok) {
          var err = new Error((data && data.detail) || ('Error ' + r.status));
          err.status = r.status;
          throw err;
        }
        return data;
      });
    });
  }

  function apiSend(url, method, body) {
    return fetch(url, {
      method: method || 'POST',
      credentials: 'same-origin',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body || {})
    }).then(function (r) {
      return r.json().catch(function () { return {}; }).then(function (data) {
        if (!r.ok) {
          var detail = data && data.detail;
          var err = new Error(typeof detail === 'string' ? detail : ('Error ' + r.status));
          err.status = r.status;
          throw err;
        }
        return data;
      });
    });
  }

  function digitsOf(v) { return String(v || '').replace(/\D/g, '').slice(0, 6); }
  function formatTyped(d) { return d ? 'DOG-' + d : ''; }

  function fmtTime(ts) {
    try {
      var d = new Date(ts * 1000);
      var now = new Date();
      var opts = { timeZone: 'Europe/Madrid', hour: '2-digit', minute: '2-digit' };
      var sameDay = d.toLocaleDateString('es-ES', { timeZone: 'Europe/Madrid' }) === now.toLocaleDateString('es-ES', { timeZone: 'Europe/Madrid' });
      if (sameDay) return 'Hoy ' + d.toLocaleTimeString('es-ES', opts);
      return d.toLocaleDateString('es-ES', { timeZone: 'Europe/Madrid', day: 'numeric', month: 'short' }) + ' ' + d.toLocaleTimeString('es-ES', opts);
    } catch (e) {
      return '';
    }
  }
  function fmtDur(s) {
    s = Math.max(0, s | 0);
    var m = Math.floor(s / 60);
    var r = s % 60;
    return m + ':' + (r < 10 ? '0' : '') + r;
  }

  // ---- Extras 2026-10-09: favoritos, perdidas, tonos del teclado, copiar número ----
  function profKey(base) {
    var u = global.currentUser;
    var who = (u && u.email) ? String(u.email).toLowerCase() : 'invitado';
    return base + ':' + who;
  }
  function readJson(k, dflt) { try { var v = JSON.parse(localStorage.getItem(k) || 'null'); return v == null ? dflt : v; } catch (e) { return dflt; } }
  function writeJson(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) {} }
  function getFavs() { var a = readJson(profKey('snakeos_phone_favs_v1'), []); return Array.isArray(a) ? a : []; }
  function setFavs(a) { writeJson(profKey('snakeos_phone_favs_v1'), a); }
  function isFav(num) { return !!num && getFavs().indexOf(String(num)) >= 0; }
  function toggleFav(num) {
    var a = getFavs(); var n = String(num); var i = a.indexOf(n);
    if (i >= 0) a.splice(i, 1); else a.unshift(n);
    setFavs(a); return i < 0;
  }
  function soundsMuted() {
    try { return typeof global.snakeOsSoundsMuted === 'function' && !!global.snakeOsSoundsMuted(); } catch (e) { return false; }
  }
  var DTMF = { '1': [697, 1209], '2': [697, 1336], '3': [697, 1477], '4': [770, 1209], '5': [770, 1336], '6': [770, 1477],
    '7': [852, 1209], '8': [852, 1336], '9': [852, 1477], '0': [941, 1336], '⌫': [941, 1209] };
  var toneCtx = null;
  function keyTone(k) {
    if (soundsMuted()) return;
    var f = DTMF[k]; if (!f) return;
    try {
      var AC = global.AudioContext || global.webkitAudioContext; if (!AC) return;
      if (!toneCtx) toneCtx = new AC();
      if (toneCtx.state === 'suspended') toneCtx.resume();
      var t = toneCtx.currentTime;
      var g = toneCtx.createGain();
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(0.08, t + 0.01);
      g.gain.exponentialRampToValueAtTime(0.0001, t + 0.12);
      g.connect(toneCtx.destination);
      f.forEach(function (hz) {
        var o = toneCtx.createOscillator(); o.type = 'sine'; o.frequency.value = hz;
        o.connect(g); o.start(t); o.stop(t + 0.13);
      });
    } catch (e) {}
  }
  function copyText(text) {
    if (navigator.clipboard && global.isSecureContext) return navigator.clipboard.writeText(text);
    return new Promise(function (resolve, reject) {
      try {
        var ta = document.createElement('textarea'); ta.value = text; ta.setAttribute('readonly', '');
        ta.style.cssText = 'position:fixed;left:-9999px;top:0;opacity:0;';
        document.body.appendChild(ta); ta.select();
        var ok = document.execCommand('copy'); ta.remove();
        if (ok) resolve(); else reject(new Error('copy'));
      } catch (e) { reject(e); }
    });
  }
  // Clic derecho o mantener pulsado (550 ms) → callback; evita el clic que sigue a la pulsación larga
  function bindLongPress(node, fn) {
    var timer = null, fired = false, sx = 0, sy = 0;
    node.addEventListener('contextmenu', function (e) { e.preventDefault(); e.stopPropagation(); fn(); });
    node.addEventListener('touchstart', function (e) {
      fired = false; var t0 = e.touches && e.touches[0]; sx = t0 ? t0.clientX : 0; sy = t0 ? t0.clientY : 0;
      clearTimeout(timer);
      timer = setTimeout(function () { fired = true; fn(); try { if (navigator.vibrate) navigator.vibrate(15); } catch (e2) {} }, 550);
    }, { passive: true });
    node.addEventListener('touchmove', function (e) {
      var t1 = e.touches && e.touches[0];
      if (t1 && (Math.abs(t1.clientX - sx) > 10 || Math.abs(t1.clientY - sy) > 10)) clearTimeout(timer);
    }, { passive: true });
    node.addEventListener('touchend', function (e) { clearTimeout(timer); if (fired) { e.preventDefault(); } }, { passive: false });
    node.addEventListener('touchcancel', function () { clearTimeout(timer); });
    node.addEventListener('click', function (e) { if (fired) { fired = false; e.preventDefault(); e.stopImmediatePropagation(); } }, true);
  }

  function renderDoganieroPhoneApp(container) {
    ensureStyle();
    container.innerHTML = '';
    var alive = true;
    var state = { mine: '', contacts: [], recents: [], tab: 'pad', digits: '', busy: false, contactsLoaded: false, incoming: [], outgoing: [] };
    var SEEN_KEY = profKey('snakeos_phone_missed_seen_v1');

    var root = el('div', 'dph');
    var head = el('div', 'dph-head');
    head.appendChild(el('div', 'dph-mine-label', 'Tu número Doganiero'));
    var mineEl = el('div', 'dph-mine', '…');
    head.appendChild(mineEl);
    mineEl.title = 'Clic derecho o mantén pulsado para copiar tu número';
    bindLongPress(mineEl, function () { if (state.mine) copyNumber(state.mine); });
    head.appendChild(el('div', 'dph-mine-note', 'Número ficticio: solo sirve para llamar a otros perfiles de Snake OS.'));

    var tabs = el('div', 'dph-tabs');
    var tabDefs = [['pad', '⌨️ Teclado'], ['favs', '⭐ Favoritos'], ['contacts', '👥 Contactos'], ['recents', '🕘 Recientes']];
    var tabBtns = {};
    tabDefs.forEach(function (t) {
      var b = el('button', 'dph-tab', t[1]);
      b.type = 'button';
      b.addEventListener('click', function () { showTab(t[0]); });
      tabBtns[t[0]] = b;
      tabs.appendChild(b);
    });
    var missBadge = el('span', 'dph-badge', '');
    missBadge.hidden = true;
    missBadge.setAttribute('aria-label', 'Llamadas perdidas sin ver');
    tabBtns.recents.appendChild(missBadge);

    var body = el('div', 'dph-body');

    // --- Teclado ---
    var padPane = el('div', 'dph-pane');
    var display = document.createElement('input');
    display.className = 'dph-display snk-noemoji';
    display.type = 'text';
    display.placeholder = 'DOG-000000';
    display.setAttribute('inputmode', 'none');
    display.setAttribute('autocomplete', 'off');
    display.setAttribute('aria-label', 'Número a marcar');
    display.addEventListener('input', function () { setDigits(digitsOf(display.value)); });
    display.addEventListener('keydown', function (e) {
      if (e.key === 'Enter') { e.preventDefault(); dial(); }
    });
    padPane.appendChild(display);
    // Identificador: al marcar, muestra el perfil cuyo número empieza por esas cifras
    var matchEl = el('button', 'dph-match', '');
    matchEl.type = 'button';
    matchEl.hidden = true;
    matchEl.title = 'Usar este número';
    matchEl.addEventListener('click', function () { if (matchEl._num) setDigits(matchEl._num); });
    padPane.appendChild(matchEl);
    var matchTried = false;
    function paintMatch() {
      var d = state.digits;
      if (!d) { matchEl.hidden = true; return; }
      if (!state.contactsLoaded) {
        if (!matchTried) { matchTried = true; loadContacts(); }
        matchEl.hidden = true;
        return;
      }
      var hits = state.contacts.filter(function (c) { return digitsOf(c.number).indexOf(d) === 0; });
      if (!hits.length) { matchEl.hidden = true; return; }
      var c = hits[0];
      var num = digitsOf(c.number);
      matchEl._num = num;
      matchEl.textContent = (num === d ? '✓ ' : '') + (c.name || 'Perfil') + ' · ' + formatTyped(num) + (hits.length > 1 ? ' (+' + (hits.length - 1) + ')' : '');
      matchEl.hidden = false;
    }
    var pad = el('div', 'dph-pad');
    ['1', '2', '3', '4', '5', '6', '7', '8', '9', '', '0', '⌫'].forEach(function (k) {
      var b = el('button', 'dph-key' + (k === '' ? ' ghost' : ''), k);
      b.type = 'button';
      if (k === '⌫') b.setAttribute('aria-label', 'Borrar');
      if (k !== '') {
        b.addEventListener('click', function () {
          keyTone(k);
          if (k === '⌫') setDigits(state.digits.slice(0, -1));
          else setDigits((state.digits + k).slice(0, 6));
        });
        if (k === '⌫') {
          b.title = 'Borrar (mantén pulsado para borrar todo)';
          bindLongPress(b, function () { setDigits(''); toast('Número borrado'); });
        }
      }
      pad.appendChild(b);
    });
    padPane.appendChild(pad);
    var actions = el('div', 'dph-actions');
    var callBtn = el('button', 'dph-call', '📞 Llamar');
    callBtn.type = 'button';
    callBtn.addEventListener('click', function () { dial(); });
    var vidBtn = el('button', 'dph-call dph-vid', '🎥 Vídeo');
    vidBtn.type = 'button';
    vidBtn.title = 'Videollamada';
    vidBtn.addEventListener('click', function () { dial(null, true); });
    var ansBtn = el('button', 'dph-ans', 'Contestar');
    ansBtn.type = 'button';
    ansBtn.hidden = true;
    ansBtn.addEventListener('click', function () {
      if (typeof global.answerDoganieroCall === 'function') global.answerDoganieroCall();
    });
    var hangBtn = el('button', 'dph-hang', 'Colgar');
    hangBtn.type = 'button';
    hangBtn.addEventListener('click', function () {
      var s = callState();
      if (s.phase === 'ringing' && s.role === 'callee' && typeof global.declineDoganieroCall === 'function') global.declineDoganieroCall();
      else if (typeof global.hangupDoganieroCall === 'function') global.hangupDoganieroCall();
    });
    actions.appendChild(callBtn);
    actions.appendChild(vidBtn);
    actions.appendChild(ansBtn);
    actions.appendChild(hangBtn);
    padPane.appendChild(actions);
    var statusEl = el('div', 'dph-status', '');
    statusEl.setAttribute('role', 'status');
    padPane.appendChild(statusEl);
    padPane.appendChild(el('div', 'dph-hint', 'Consejo: clic derecho o mantén pulsado un contacto para copiar su número.'));

    // --- Favoritos ---
    var favsPane = el('div', 'dph-pane');
    var favsList = el('div', 'dph-list');
    favsPane.appendChild(favsList);

    // --- Contactos ---
    var contactsPane = el('div', 'dph-pane');
    var search = document.createElement('input');
    search.className = 'dph-search snk-noemoji';
    search.type = 'search';
    search.placeholder = 'Buscar contacto o número';
    search.setAttribute('autocomplete', 'off');
    search.addEventListener('input', function () { paintContacts(); });
    var addRow = el('form', 'dph-add');
    var addInp = el('input', 'dph-search');
    addInp.type = 'text';
    addInp.placeholder = 'correo@dogaemail.com o DOG-123456';
    addInp.maxLength = 120;
    addInp.setAttribute('aria-label', 'Añadir cuenta');
    var addBtn = el('button', 'dph-add-btn', 'Añadir');
    addBtn.type = 'submit';
    addRow.appendChild(addInp);
    addRow.appendChild(addBtn);
    addRow.addEventListener('submit', function (ev) {
      ev.preventDefault();
      var query = (addInp.value || '').trim();
      if (!query) return;
      addBtn.disabled = true;
      fetch('/api/added-accounts', {
        method: 'POST',
        credentials: 'same-origin',
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ query: query })
      }).then(function (r) {
        return r.json().catch(function () { return {}; }).then(function (data) {
          if (!r.ok) {
            var detail = data && data.detail;
            throw new Error(typeof detail === 'string' ? detail : 'No se pudo añadir');
          }
          addInp.value = '';
          state.contactsLoaded = false;
          loadContacts();
          if (data && data.status === 'pending') toast('Solicitud enviada. Tiene que aceptarla.');
          else toast('Cuenta añadida');
        });
      }).catch(function (err) {
        toast((err && err.message) || 'No se pudo añadir');
      }).then(function () { addBtn.disabled = false; });
    });
    contactsPane.appendChild(addRow);
    contactsPane.appendChild(search);
    var reqsBox = el('div', 'dph-reqs');
    contactsPane.appendChild(reqsBox);
    var contactsList = el('div', 'dph-list');
    contactsPane.appendChild(contactsList);

    // --- Recientes ---
    var recentsPane = el('div', 'dph-pane');
    var recentsList = el('div', 'dph-list');
    recentsPane.appendChild(recentsList);

    body.appendChild(padPane);
    body.appendChild(favsPane);
    body.appendChild(contactsPane);
    body.appendChild(recentsPane);
    root.appendChild(head);
    root.appendChild(tabs);
    root.appendChild(body);
    container.appendChild(root);
    var toastEl = el('div', 'dph-toast', '');
    toastEl.setAttribute('role', 'status');
    root.appendChild(toastEl);
    var toastTimer = null;
    function toast(t) {
      toastEl.textContent = t;
      toastEl.classList.add('on');
      clearTimeout(toastTimer);
      toastTimer = setTimeout(function () { toastEl.classList.remove('on'); }, 1700);
    }
    function copyNumber(num) {
      copyText(String(num)).then(function () { toast('📋 ' + num + ' copiado'); })
        .catch(function () { toast('No se pudo copiar el número'); });
    }

    function setStatus(text, kind) {
      statusEl.textContent = text || '';
      statusEl.className = 'dph-status' + (kind ? ' ' + kind : '');
    }
    global.snakeOsShowCallDuration = function (label) {
      if (!alive || !label) return;
      setStatus('Llamada terminada · ' + label);
    };
    function setDigits(d) {
      state.digits = digitsOf(d);
      var shown = formatTyped(state.digits);
      if (display.value !== shown) display.value = shown;
      if (statusEl.classList.contains('err')) setStatus('');
      try { paintMatch(); } catch (eM) {}
    }
    function showTab(t) {
      state.tab = t;
      padPane.hidden = t !== 'pad';
      favsPane.hidden = t !== 'favs';
      contactsPane.hidden = t !== 'contacts';
      recentsPane.hidden = t !== 'recents';
      Object.keys(tabBtns).forEach(function (k) {
        tabBtns[k].classList.toggle('on', k === t);
        tabBtns[k].setAttribute('aria-pressed', k === t ? 'true' : 'false');
      });
      if (t === 'contacts') loadContacts();
      if (t === 'favs') { paintFavs(); loadContacts(); }
      if (t === 'recents') { markMissedSeen(); loadRecents(); }
    }

    function callState() {
      try {
        if (typeof global.getDoganieroCallState === 'function') return global.getDoganieroCallState() || { phase: 'idle' };
      } catch (e) {}
      return { phase: 'idle' };
    }
    function paintCall(s) {
      if (!alive) return;
      s = s || callState();
      var name = s.peerName || 'contacto';
      var num = s.peerNumber ? ' · ' + s.peerNumber : '';
      var idle = !s.phase || s.phase === 'idle';
      callBtn.disabled = !idle || state.busy;
      vidBtn.disabled = !idle || state.busy;
      hangBtn.disabled = idle;
      var incoming = s.phase === 'ringing' && s.role === 'callee';
      ansBtn.hidden = !incoming;
      callBtn.hidden = incoming;
      vidBtn.hidden = incoming;
      hangBtn.textContent = incoming ? 'Rechazar' : 'Colgar';
      if (s.phase === 'ringing' && s.role === 'caller') setStatus('Llamando a ' + name + num + '…', 'live');
      else if (incoming) setStatus(name + num + ' te está llamando', 'live');
      else if (s.phase === 'active') setStatus('En llamada con ' + name + num, 'live');
      else if (statusEl.classList.contains('live')) setStatus('Llamada terminada');
    }

    function dial(numberOverride, asVideo) {
      var d = digitsOf(numberOverride != null ? numberOverride : state.digits);
      if (numberOverride != null) setDigits(d);
      if (d.length !== 6) {
        setStatus('Número no válido. Los números Doganiero son DOG- y 6 cifras (p. ej. DOG-123456).', 'err');
        return;
      }
      var target = 'DOG-' + d;
      if (state.mine && target === state.mine) {
        setStatus('No puedes llamarte a ti mismo.', 'err');
        return;
      }
      if (state.contactsLoaded && !state.contacts.some(function (c) { return digitsOf(c.number) === d; })) {
        setStatus('Solo puedes llamar a números que has añadido.', 'err');
        return;
      }
      if (callState().phase && callState().phase !== 'idle') {
        setStatus('Ya hay una llamada en curso.', 'err');
        return;
      }
      if (typeof global.startDoganieroCall !== 'function') {
        setStatus('El sistema de llamadas no está disponible. Recarga la página.', 'err');
        return;
      }
      state.busy = true;
      paintCall();
      setStatus('Buscando ' + target + '…');
      function ensureChatLive() {
        try {
          if (typeof global.ensureDoganieroChatWs === 'function') {
            return Promise.resolve(global.ensureDoganieroChatWs()).then(function (ok) { return !!ok; });
          }
        } catch (e0) {}
        try {
          if (typeof global.isDoganieroChatConnected === 'function') {
            return Promise.resolve(!!global.isDoganieroChatConnected());
          }
        } catch (e1) {}
        return Promise.resolve(true);
      }
      apiGet('/api/phone/lookup?number=' + encodeURIComponent(target)).then(function (peer) {
        if (!alive) return null;
        if (peer.self) {
          state.busy = false;
          setStatus('No puedes llamarte a ti mismo.', 'err');
          paintCall();
          return null;
        }
        setStatus('Conectando…');
        return ensureChatLive().then(function (live) {
          if (!alive) return;
          if (!live) {
            state.busy = false;
            setStatus('Sin conexión con el chat. Espera un momento y vuelve a intentar.', 'err');
            paintCall();
            return;
          }
          state.busy = false;
          setStatus('Llamando a ' + (peer.name || target) + '…', 'live');
          global.startDoganieroCall({
            id: peer.id,
            name: peer.name,
            avatar: peer.avatar,
            number: peer.number || target
          }, !!asVideo);
          paintCall();
        });
      }).catch(function (err) {
        if (!alive) return;
        state.busy = false;
        paintCall();
        setStatus(err && err.message ? err.message : 'No se pudo llamar.', 'err');
      });
    }

    function contactRow(c, subText, subCls, onCall) {
      var row = el('div', 'dph-row');
      row.tabIndex = 0;
      row.appendChild(avatarEl(c.avatar));
      var info = el('div', 'dph-info');
      info.appendChild(el('div', 'dph-name', c.name || 'Usuario'));
      info.appendChild(el('div', 'dph-sub' + (subCls ? ' ' + subCls : ''), subText));
      row.appendChild(info);
      if (c.number) {
        var star = el('button', 'dph-star' + (isFav(c.number) ? ' on' : ''), isFav(c.number) ? '★' : '☆');
        star.type = 'button';
        star.title = isFav(c.number) ? 'Quitar de favoritos' : 'Añadir a favoritos';
        star.setAttribute('aria-label', star.title);
        star.setAttribute('aria-pressed', isFav(c.number) ? 'true' : 'false');
        star.addEventListener('click', function (ev) {
          ev.stopPropagation();
          var on = toggleFav(c.number);
          toast(on ? '⭐ ' + (c.name || c.number) + ' añadido a favoritos' : 'Quitado de favoritos');
          if (state.tab === 'favs') paintFavs();
          else if (state.tab === 'contacts') paintContacts();
          else if (state.tab === 'recents') paintRecents();
        });
        row.appendChild(star);
        bindLongPress(row, function () { copyNumber(c.number); });
        var cb = el('button', 'dph-rowcall', '📞');
        cb.type = 'button';
        cb.title = (subCls === 'miss' ? 'Devolver la llamada a ' : 'Llamar a ') + (c.name || c.number);
        cb.setAttribute('aria-label', cb.title);
        cb.addEventListener('click', function (ev) {
          ev.stopPropagation();
          onCall();
        });
        row.appendChild(cb);
        var fill = function () {
          setDigits(c.number);
          showTab('pad');
        };
        row.addEventListener('click', fill);
        row.addEventListener('keydown', function (ev) {
          if (ev.key === 'Enter') { ev.preventDefault(); fill(); }
        });
      }
      return row;
    }

    function paintContacts() {
      contactsList.innerHTML = '';
      var q = String(search.value || '').trim().toLowerCase();
      var qd = q.replace(/\D/g, '');
      var list = state.contacts.filter(function (c) {
        if (!q) return true;
        return String(c.name || '').toLowerCase().indexOf(q) >= 0 || (qd && String(c.number || '').indexOf(qd) >= 0);
      });
      if (!list.length) {
        contactsList.appendChild(el('div', 'dph-empty', state.contacts.length ? 'Ningún contacto coincide.' : 'Aún no has añadido cuentas. La otra persona tiene que aceptar la solicitud.'));
        return;
      }
      list.forEach(function (c) {
        var row = contactRow(c, c.number, '', function () {
          showTab('pad');
          dial(c.number);
        });
        if (c.id) {
          var rm = el('button', 'dph-remove', 'Quitar');
          rm.type = 'button';
          rm.title = 'Quitar de Chat y Teléfono';
          rm.addEventListener('click', function (ev) {
            ev.preventDefault();
            ev.stopPropagation();
            var name = c.name || c.number || 'esta cuenta';
            if (!window.confirm('Quitar a ' + name + ' de Chat y Teléfono? También se quita para esa persona.')) return;
            apiSend('/api/added-accounts/' + encodeURIComponent(c.id), 'DELETE').then(function () {
              toast('Cuenta quitada');
              state.contactsLoaded = false;
              loadContacts();
            }).catch(function (err) {
              toast((err && err.message) || 'No se pudo quitar');
            });
          });
          row.appendChild(rm);
        }
        contactsList.appendChild(row);
      });
    }
    function paintFavs() {
      favsList.innerHTML = '';
      var favs = getFavs();
      if (!favs.length) {
        favsList.appendChild(el('div', 'dph-empty', 'Aún no tienes favoritos. Pulsa ☆ en un contacto o en Recientes para añadirlo.'));
        return;
      }
      var byNum = {};
      state.contacts.forEach(function (c) { if (c.number) byNum[String(c.number)] = c; });
      state.recents.forEach(function (r) { var p = r.peer || {}; if (p.number && !byNum[p.number]) byNum[String(p.number)] = p; });
      favs.forEach(function (num) {
        var c = byNum[num] || { name: num, number: num, avatar: '⭐' };
        favsList.appendChild(contactRow(c, c.number, '', function () { showTab('pad'); dial(c.number); }));
      });
      if (!state.contactsLoaded) favsList.appendChild(el('div', 'dph-hint', 'Cargando nombres…'));
    }
    function paintRequests() {
      if (!reqsBox) return;
      reqsBox.innerHTML = '';
      function line(entry, incoming) {
        var u = (entry && entry.user) || {};
        var row = el('div', 'dph-req');
        row.appendChild(avatarEl(u.avatar));
        var info = el('div', 'dph-info');
        info.appendChild(el('div', 'dph-name', u.name || u.email || 'Cuenta'));
        info.appendChild(el('div', 'dph-sub', incoming ? 'Quiere añadirte' : 'Esperando que acepte'));
        row.appendChild(info);
        var actions = el('div', 'dph-req-actions');
        if (incoming) {
          var ok = el('button', 'dph-req-ok', 'Aceptar');
          ok.type = 'button';
          ok.addEventListener('click', function () { decidePhone(entry.id, 'accept'); });
          var no = el('button', 'dph-req-no', 'Rechazar');
          no.type = 'button';
          no.addEventListener('click', function () { decidePhone(entry.id, 'reject'); });
          actions.appendChild(ok);
          actions.appendChild(no);
        } else {
          var cancel = el('button', 'dph-req-no', 'Cancelar');
          cancel.type = 'button';
          cancel.addEventListener('click', function () { decidePhone(entry.id, 'cancel'); });
          actions.appendChild(cancel);
        }
        row.appendChild(actions);
        reqsBox.appendChild(row);
      }
      (state.incoming || []).forEach(function (entry) { line(entry, true); });
      (state.outgoing || []).forEach(function (entry) { line(entry, false); });
    }
    function decidePhone(id, action) {
      var url = '/api/added-accounts/requests/' + encodeURIComponent(id);
      var method = 'POST';
      if (action === 'cancel') method = 'DELETE';
      else url += (action === 'accept' ? '/accept' : '/reject');
      apiSend(url, method).then(function () {
        if (action === 'accept') toast('Cuenta añadida');
        else if (action === 'reject') toast('Solicitud rechazada');
        else toast('Solicitud cancelada');
        state.contactsLoaded = false;
        loadContacts();
      }).catch(function (err) {
        toast((err && err.message) || 'No se pudo actualizar');
      });
    }
    function loadContacts() {
      if (!state.contactsLoaded && !contactsList.firstChild) contactsList.appendChild(el('div', 'dph-empty', 'Cargando contactos…'));
      apiGet('/api/phone/contacts').then(function (data) {
        if (!alive) return;
        state.contacts = (data && data.contacts) || [];
        state.contactsLoaded = true;
        paintContacts();
        try { paintMatch(); } catch (eM2) {}
        if (state.tab === 'favs') paintFavs();
      }).catch(function (err) {
        if (!alive) return;
        contactsList.innerHTML = '';
        contactsList.appendChild(el('div', 'dph-empty', 'No se pudieron cargar los contactos: ' + (err && err.message ? err.message : 'error')));
      });
      apiGet('/api/added-accounts/requests').then(function (data) {
        if (!alive) return;
        state.incoming = (data && data.incoming) || [];
        state.outgoing = (data && data.outgoing) || [];
        paintRequests();
      }).catch(function () {});
    }

    function paintRecents() {
      recentsList.innerHTML = '';
      if (!state.recents.length) {
        recentsList.appendChild(el('div', 'dph-empty', 'Aún no hay llamadas.'));
        return;
      }
      state.recents.forEach(function (r) {
        var p = r.peer || {};
        var video = r.media === 'video';
        var label;
        var miss = false;
        if (r.status === 'missed') {
          label = r.direction === 'in' ? '↙️ Perdida' : '↗️ Sin respuesta';
          miss = r.direction === 'in';
        } else if (r.status === 'declined') {
          label = r.direction === 'in' ? '↙️ Rechazada' : '↗️ Rechazada';
          miss = r.direction === 'out';
        } else if (r.status === 'ringing') {
          label = r.direction === 'in' ? '↙️ Sonando' : '↗️ Llamando';
        } else {
          label = (r.direction === 'in' ? '↙️ Entrante' : '↗️ Saliente') + (r.durationSec ? ' · ' + fmtDur(r.durationSec) : '');
        }
        if (video) label += ' · vídeo';
        var sub = label + ' · ' + fmtTime(r.ts) + (p.number ? ' · ' + p.number : '');
        var rrow = contactRow(p, sub, miss ? 'miss' : '', function () {
          showTab('pad');
          dial(p.number);
        });
        if (miss) rrow.classList.add('miss-row');
        recentsList.appendChild(rrow);
      });
    }
    function missedCount() {
      var stored = readJson(SEEN_KEY, null);
      var seen = stored == null ? (Date.now() / 1000 - 86400) : (Number(stored) || 0);
      return state.recents.filter(function (r) { return r.direction === 'in' && r.status === 'missed' && Number(r.ts) > seen; }).length;
    }
    function updateMissBadge() {
      var n = state.tab === 'recents' ? 0 : missedCount();
      missBadge.hidden = !n;
      missBadge.textContent = n > 9 ? '9+' : String(n);
      tabBtns.recents.title = n ? (n === 1 ? '1 llamada perdida' : n + ' llamadas perdidas') : 'Recientes';
    }
    function markMissedSeen() {
      var mx = 0;
      state.recents.forEach(function (r) { if (Number(r.ts) > mx) mx = Number(r.ts); });
      var cur = Number(readJson(SEEN_KEY, 0)) || 0;
      writeJson(SEEN_KEY, Math.max(cur, mx, Date.now() / 1000));
      missBadge.hidden = true;
    }
    function loadRecents() {
      if (!state.recents.length && !recentsList.firstChild) recentsList.appendChild(el('div', 'dph-empty', 'Cargando llamadas…'));
      apiGet('/api/phone/recents').then(function (data) {
        if (!alive) return;
        state.recents = (data && data.calls) || [];
        paintRecents();
        if (state.tab === 'recents') markMissedSeen();
        updateMissBadge();
      }).catch(function (err) {
        if (!alive) return;
        recentsList.innerHTML = '';
        recentsList.appendChild(el('div', 'dph-empty', 'No se pudieron cargar las llamadas: ' + (err && err.message ? err.message : 'error')));
      });
    }

    function onKey(e) {
      if (!alive || state.tab !== 'pad') return;
      if (e.target === search || e.target === display) return;
      if (e.ctrlKey || e.metaKey || e.altKey) return;
      if (/^[0-9]$/.test(e.key)) { e.preventDefault(); keyTone(e.key); setDigits((state.digits + e.key).slice(0, 6)); }
      else if (e.key === 'Backspace') { e.preventDefault(); setDigits(state.digits.slice(0, -1)); }
      else if (e.key === 'Enter') { e.preventDefault(); dial(); }
    }
    root.addEventListener('keydown', onKey);

    var lastPhase = callState().phase || 'idle';
    var unsub = null;
    if (typeof global.onDoganieroCallChange === 'function') {
      unsub = global.onDoganieroCallChange(function (s) {
        paintCall(s);
        var ph = (s && s.phase) || 'idle';
        if (ph === 'idle' && lastPhase !== 'idle') setTimeout(loadRecents, 800);
        lastPhase = ph;
      });
    }

    function loadMineNumber() {
      apiGet('/api/phone/me').then(function (data) {
        if (!alive) return;
        state.mine = (data && data.number) || '';
        mineEl.textContent = state.mine || '—';
        mineEl.style.cursor = ''; mineEl.title = ''; mineEl.onclick = null;
        if (statusEl.classList.contains('err')) setStatus('');
      }).catch(function (err) {
        if (!alive) return;
        if (err && err.status === 401) {
          mineEl.textContent = '—';
          setStatus('No se pudo cargar tu número. Inicia sesión de nuevo.', 'err');
          return;
        }
        mineEl.textContent = '🔄 Reintentar';
        mineEl.style.cursor = 'pointer';
        mineEl.title = 'Volver a cargar tu número';
        mineEl.onclick = function () { mineEl.textContent = '…'; mineEl.onclick = null; loadMineNumber(); };
        setStatus('No se pudo cargar tu número (problema de conexión). Pulsa «Reintentar».', 'err');
      });
    }
    function onAccountReqPhone() { if (alive) loadContacts(); }
    window.addEventListener('snake-account-request', onAccountReqPhone);
    var reqPoll = setInterval(function () { if (alive) loadContacts(); }, 15000);
    loadMineNumber();
    loadContacts();

    // Mostrar en el Teléfono el detalle de call_error del banner de chat
    var bannerObs = null;
    try {
      var ban = document.getElementById('dcCallBanner');
      if (ban && window.MutationObserver) {
        bannerObs = new MutationObserver(function () {
          if (!alive) return;
          try {
            var t = (ban.textContent || '').trim();
            if (!t) return;
            if (/no se pudo|ocupado|no existe|no válido|sin conexión|interrump/i.test(t)) {
              setStatus(t, 'err');
            }
          } catch (eB) {}
        });
        bannerObs.observe(ban, { childList: true, subtree: true, characterData: true });
      }
    } catch (eObs) {}

    showTab('pad');
    paintCall();
    loadRecents();

    return function cleanup() {
      alive = false;
      try { window.removeEventListener('snake-account-request', onAccountReqPhone); } catch (eReqOff) {}
      try { clearInterval(reqPoll); } catch (ePoll) {}
      try { root.removeEventListener('keydown', onKey); } catch (e0) {}
      try { if (unsub) unsub(); } catch (e1) {}
      try { if (bannerObs) bannerObs.disconnect(); } catch (e2) {}
    };
  }

  global.renderDoganieroPhoneApp = renderDoganieroPhoneApp;
})(window);
