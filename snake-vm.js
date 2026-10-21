/* Snake OS · Máquinas virtuales (2026.13)
   Una sola opción: Ubuntu (Linux ligero de Buildroot emulado con v86 en TU navegador; no es la Ubuntu completa).
   Nada se ejecuta en el servidor: solo sirve los archivos fijos de /static/assets/vm/ (se cargan al abrir la app).
   Estado y elección guardados en IndexedDB del navegador, por perfil (base «snkVMv1», clave = correo del perfil).
   Una vez configurada, la máquina queda fija para ese perfil: no se puede quitar ni cambiar.
   Sin red, sin sonido. Independiente de cualquier otro «Ubuntu» de Snake OS (no comparte código, archivos ni ids). */
(function () {
  'use strict';
  if (window.renderSnakeVMApp) return;
  var BASE = '/static/assets/vm/', VER = '202610210900';
  var DBN = 'snkVMv1', ST = 'machines';
  function en() { return !!(window.snakeI18n && window.snakeI18n.lang === 'en'); }
  function T(es, e) { return en() ? e : es; }
  function who() { var u = window.currentUser; var e = u && u.email ? String(u.email).trim().toLowerCase() : ''; return e || ''; }
  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  function db() {
    return new Promise(function (res, rej) {
      if (!window.indexedDB) return rej(new Error('IndexedDB'));
      var r = indexedDB.open(DBN, 1);
      r.onupgradeneeded = function () { r.result.createObjectStore(ST); };
      r.onsuccess = function () { res(r.result); }; r.onerror = function () { rej(r.error); };
    });
  }
  function get(k) { return db().then(function (d) { return new Promise(function (res, rej) { var q = d.transaction(ST).objectStore(ST).get(k); q.onsuccess = function () { res(q.result || null); }; q.onerror = function () { rej(q.error); }; }); }); }
  function put(k, v) { return db().then(function (d) { return new Promise(function (res, rej) { var t = d.transaction(ST, 'readwrite'); t.objectStore(ST).put(v, k); t.oncomplete = function () { res(true); }; t.onerror = function () { rej(t.error); }; }); }); }
  var libP = null;
  function loadLib() {
    if (window.V86) return Promise.resolve();
    if (libP) return libP;
    libP = new Promise(function (res, rej) { var s = document.createElement('script'); s.src = BASE + 'libv86.js?v=' + VER; s.onload = function () { window.V86 ? res() : rej(new Error('v86')); }; s.onerror = function () { libP = null; rej(new Error('libv86')); }; document.head.appendChild(s); });
    return libP;
  }
  function css() {
    if (document.getElementById('snkvm-css')) return;
    var st = document.createElement('style'); st.id = 'snkvm-css';
    st.textContent = '.snkvm{display:flex;flex-direction:column;height:100%;font:14px var(--snake-font,Inter,system-ui,sans-serif);color:inherit}' +
      '.snkvm-pick{padding:18px;display:flex;flex-direction:column;gap:12px}.snkvm-card{display:flex;gap:14px;align-items:center;padding:14px;border-radius:16px;border:1px solid rgba(127,127,127,.3);background:rgba(233,84,32,.10);cursor:pointer;text-align:left;color:inherit;font:inherit}' +
      '.snkvm-card:hover{background:rgba(233,84,32,.18)}.snkvm-logo{width:54px;height:54px;border-radius:50%;background:#e95420;display:flex;align-items:center;justify-content:center;flex:0 0 auto}' +
      '.snkvm-card b{font-size:17px}.snkvm-card small,.snkvm-note{opacity:.75;font-size:12px}' +
      '.snkvm-bar{display:flex;gap:8px;align-items:center;padding:6px 10px;border-bottom:1px solid rgba(127,127,127,.25);flex-wrap:wrap}.snkvm-bar .t{flex:1;font-weight:600}.snkvm-bar button,.snkvm-setup button{border:0;border-radius:10px;padding:6px 12px;background:#2ecc71;color:#06210f;font-weight:700;cursor:pointer}' +
      '.snkvm-bar button.sec{background:rgba(127,127,127,.25);color:inherit}.snkvm-screen{flex:1;overflow:auto;background:#000;display:flex;align-items:flex-start;justify-content:center;outline:none}' +
      '.snkvm-screen>div{white-space:pre;font:14px/14px monospace;color:#ddd}.snkvm-screen canvas{display:none}' +
      '.snkvm-setup{padding:10px 12px;border-bottom:1px solid rgba(127,127,127,.25);display:flex;gap:8px;align-items:center;flex-wrap:wrap;background:rgba(46,204,113,.10)}.snkvm-setup input{padding:6px 8px;border-radius:8px;border:1px solid rgba(127,127,127,.4);background:rgba(255,255,255,.7);color:#111;min-width:140px}' +
      '.snkvm-lock{font-size:12px;opacity:.8}';
    document.head.appendChild(st);
  }
  var LOGO = '<svg viewBox="0 0 32 32" width="40" height="40"><circle cx="16" cy="16" r="9" fill="none" stroke="#fff" stroke-width="3.2"/><circle cx="16" cy="5.5" r="3.2" fill="#fff" stroke="#e95420" stroke-width="1.4"/><circle cx="6.9" cy="21.2" r="3.2" fill="#fff" stroke="#e95420" stroke-width="1.4"/><circle cx="25.1" cy="21.2" r="3.2" fill="#fff" stroke="#e95420" stroke-width="1.4"/></svg>';

  window.renderSnakeVMApp = function (body) {
    css();
    var dead = false, emu = null, key = who(), rec = null, saveT = null;
    var root = document.createElement('div'); root.className = 'snkvm'; body.innerHTML = ''; body.appendChild(root);
    function msg(h) { root.innerHTML = '<div class="snkvm-pick">' + h + '</div>'; }
    if (!key) { msg('<p>' + T('Inicia sesión en Snake OS para usar las máquinas virtuales.', 'Sign in to Snake OS to use virtual machines.') + '</p>'); return function () {}; }
    msg('<p>' + T('Cargando…', 'Loading…') + '</p>');
    get(key).then(function (r) { if (dead) return; rec = r; if (rec && rec.os === 'ubuntu') boot(); else pick(); })
      .catch(function () { if (!dead) msg('<p>' + T('Este navegador no permite guardar la máquina (IndexedDB desactivado).', 'This browser cannot store the machine (IndexedDB is disabled).') + '</p>'); });
    function pick() {
      msg('<h3 style="margin:0">' + T('Máquinas virtuales', 'Virtual machines') + '</h3>' +
        '<button type="button" class="snkvm-card" data-os="ubuntu"><span class="snkvm-logo">' + LOGO + '</span><span><b>Ubuntu</b><br><small>' +
        T('Linux ligero (Buildroot + BusyBox) que funciona dentro de tu navegador, sin red. No es la Ubuntu completa.', 'Lightweight Linux (Buildroot + BusyBox) running inside your browser, offline. It is not full Ubuntu.') + '</small></span></button>' +
        '<p class="snkvm-note">' + T('Ábrela y ya está instalada, lista para configurar. Cuando la configures quedará fija en este perfil: no se podrá quitar ni cambiar.', 'Open it and it is already installed, ready to set up. Once you set it up it stays fixed on this profile: it cannot be removed or changed.') + '</p>');
      root.querySelector('[data-os]').onclick = function () { rec = { os: 'ubuntu', configured: false, created: Date.now() }; boot(); };
    }
    function boot() {
      root.innerHTML = '<div class="snkvm-bar"><span class="t">🖥️ Ubuntu' + (rec.configured && rec.name ? ' · ' + esc(rec.name) : '') + '</span><span class="st snkvm-lock"></span>' +
        '<button type="button" class="sec" data-a="save">' + T('Guardar estado', 'Save state') + '</button><button type="button" class="sec" data-a="restart">' + T('Reiniciar', 'Restart') + '</button></div>' +
        (rec.configured ? '' : '<div class="snkvm-setup"><b>' + T('Configurar', 'Set up') + ':</b><input class="nm" maxlength="24" placeholder="' + T('Nombre del equipo', 'Computer name') + '" value="snake-ubuntu"><button type="button" data-a="cfg">' + T('Configurar y fijar', 'Set up and lock') + '</button><span class="snkvm-note">' + T('Al configurarla queda fija en este perfil.', 'Once set up it stays fixed on this profile.') + '</span></div>') +
        '<div class="snkvm-screen" tabindex="0"><div></div><canvas></canvas></div>';
      var st = root.querySelector('.st'), scr = root.querySelector('.snkvm-screen');
      st.textContent = rec.configured ? T('🔒 Configurada en este perfil', '🔒 Set up on this profile') : T('Arrancando…', 'Booting…');
      root.querySelector('[data-a="save"]').onclick = function () { saveState(true); };
      root.querySelector('[data-a="restart"]').onclick = function () { if (emu) { try { emu.restart(); } catch (e) {} } };
      var cfgB = root.querySelector('[data-a="cfg"]');
      if (cfgB) cfgB.onclick = function () {
        var nm = (root.querySelector('.nm').value || '').replace(/[^A-Za-z0-9-]/g, '').slice(0, 24) || 'snake-ubuntu';
        rec.configured = true; rec.name = nm; rec.configuredAt = Date.now();
        put(key, rec).then(function () {
          var s2 = root.querySelector('.snkvm-setup'); if (s2) s2.remove();
          st.textContent = T('🔒 Configurada en este perfil', '🔒 Set up on this profile'); root.querySelector('.t').textContent = '🖥️ Ubuntu · ' + nm;
          if (emu) try { emu.keyboard_send_text('hostname ' + nm + ' && export PS1="root@' + nm + ':\\w# " && clear\n'); } catch (e) {}
          saveState(false);
        }).catch(function () { st.textContent = T('No se ha podido guardar', 'Could not save'); });
      };
      loadLib().then(function () {
        if (dead) return;
        var opt = { wasm_path: BASE + 'v86.wasm?v=' + VER, memory_size: 64 * 1024 * 1024, vga_memory_size: 2 * 1024 * 1024, screen_container: scr,
          bios: { url: BASE + 'seabios.bin?v=' + VER }, vga_bios: { url: BASE + 'vgabios.bin?v=' + VER },
          bzimage: { url: BASE + 'linux-bzimage.bin?v=' + VER }, cmdline: 'tsc=reliable mitigations=off random.trust_cpu=on',
          autostart: true, disable_speaker: true, disable_mouse: true };
        if (rec.configured && rec.state) opt.initial_state = { buffer: rec.state };
        emu = new window.V86(opt);
        emu.add_listener('emulator-ready', function () { if (!dead && !rec.configured) st.textContent = T('Lista para configurar', 'Ready to set up'); scr.focus(); });
        // autoguardado cada 2 min si está configurada
        saveT = setInterval(function () { if (rec.configured && !document.hidden) saveState(false); }, 120000);
      }).catch(function () { st.textContent = T('No se ha podido cargar el emulador', 'Could not load the emulator'); });
      scr.addEventListener('mousedown', function () { scr.focus(); });
    }
    function saveState(show) {
      if (!emu || !rec || !rec.configured) { if (show) toast(T('Configura la máquina primero.', 'Set up the machine first.')); return Promise.resolve(); }
      return emu.save_state().then(function (buf) { rec.state = buf; rec.savedAt = Date.now(); return put(key, rec); })
        .then(function () { if (show) toast(T('Estado guardado ✅', 'State saved ✅')); }).catch(function () { if (show) toast(T('No se ha podido guardar el estado', 'Could not save the state')); });
    }
    function toast(t) { var s = root.querySelector('.st'); if (s) { s.textContent = t; } }
    return function () {
      dead = true; if (saveT) clearInterval(saveT);
      var e = emu; emu = null;
      if (e) { var fin = function () { try { e.destroy(); } catch (x) {} }; if (rec && rec.configured) { e.save_state().then(function (buf) { rec.state = buf; rec.savedAt = Date.now(); return put(key, rec); }).then(fin, fin); } else fin(); }
    };
  };
})();
