/* Snake OS VP · Doganiero Bots · Mini «Snake OS Lite» de cada bot (2026-10-14).
   - Pantallita con barra de tareas, Navegador (vista de lectura del servidor, buscador estilo Google) y Terminal.
   - Sin placa/Arduino. El servidor descarga las páginas sin cookies ni credenciales (protección SSRF).
   - Control del escritorio real con lista blanca de acciones, puntero visible del bot y botón/Esc para parar. */
(function () {
  if (window.DogBotsOS) return;
  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  function api(p, o) { return window.api ? window.api(p, o) : Promise.reject(new Error('api')); }
  function wait(ms) { return new Promise(function (r) { setTimeout(r, ms); }); }
  function errMsg(e) { return (e && (e.message || e.detail)) || 'Error'; }
  var css = document.createElement('style');
  css.textContent = [
    '.mos{width:100%;flex:1 1 auto;min-height:260px;display:flex;flex-direction:column;border-radius:22px;overflow:hidden;background:#000;box-shadow:0 6px 20px rgba(0,0,0,.3);font-family:"Open Sans",system-ui,sans-serif}',
    '.mos-screen{position:relative;flex:1;min-height:0;background:radial-gradient(circle at 30% 20%,#2f9e5b 0,#0b3d22 45%,#05140c 100%);overflow:hidden}',
    '.mos-screen::after{content:"🐍";position:absolute;right:10px;bottom:6px;font-size:42px;opacity:.15;pointer-events:none}',
    '.mos-win{position:absolute;inset:8px 8px 8px 8px;background:#fff;border-radius:12px;display:flex;flex-direction:column;overflow:hidden;box-shadow:0 8px 24px rgba(0,0,0,.45)}',
    '.mos-win[hidden]{display:none !important}',
    '.mos-tb{display:flex;align-items:center;gap:6px;padding:4px 8px;background:#efefef;font-size:.72rem;color:#333;flex-shrink:0}.mos-tb b{flex:1;font-weight:600}',
    '.mos-tb i{width:9px;height:9px;border-radius:50%;display:inline-block}',
    '.mos-tool{display:flex;align-items:center;gap:4px;padding:5px 6px;border-bottom:1px solid #e3e3e3;flex-shrink:0;background:#fff}',
    '.mos .mos-tool button{width:24px !important;height:24px !important;min-width:24px;padding:0 !important;border-radius:50% !important;border:0 !important;background:#f1f3f4 !important;color:#333 !important;font-size:.8rem !important;cursor:pointer}',
    '.mos-bar-in{flex:1;min-width:0;display:flex;align-items:center;gap:6px;border:1px solid #dfe1e5;border-radius:999px;padding:2px 10px;background:#fff;box-shadow:0 1px 4px rgba(32,33,36,.12)}',
    '.mos-bar-in.typing{border-color:#4285f4;box-shadow:0 0 0 2px rgba(66,133,244,.25)}',
    '.mos .mos-bar-in input{flex:1;min-width:0;border:0 !important;outline:0;background:transparent !important;font-size:.78rem;color:#202124 !important;padding:3px 0 !important;border-radius:0 !important;box-shadow:none !important}',
    '.mos-page{flex:1;min-height:0;overflow:auto;padding:10px 12px;color:#202124;font-size:.78rem;line-height:1.45;scroll-behavior:smooth}',
    '.mos-page iframe{border:0;width:100%;height:100%}',
    '.mos-home{display:flex;flex-direction:column;align-items:center;justify-content:center;height:100%;gap:10px}',
    '.mos-logo{font-size:1.7rem;font-weight:700;letter-spacing:-1px}.mos-logo span:nth-child(1){color:#4285f4}.mos-logo span:nth-child(2){color:#ea4335}.mos-logo span:nth-child(3){color:#fbbc05}.mos-logo span:nth-child(4){color:#4285f4}.mos-logo span:nth-child(5){color:#34a853}.mos-logo span:nth-child(6){color:#ea4335}',
    '.mos-res{margin:0 0 12px}.mos-res .u{color:#188038;font-size:.7rem;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.mos-res a,.mos-lk{color:#1a0dab;cursor:pointer;text-decoration:none;font-size:.86rem}.mos-res a:hover,.mos-lk:hover{text-decoration:underline}.mos-res p{margin:2px 0 0;color:#4d5156}',
    '.mos-pg h3{margin:0 0 2px;font-size:.95rem}.mos-pg .dom{color:#188038;font-size:.7rem;margin-bottom:8px}.mos-pg p{margin:0 0 6px}',
    '.mos-links{display:flex;flex-wrap:wrap;gap:4px;margin-top:8px}.mos-links .mos-lk{font-size:.72rem;background:#f1f3f4;border-radius:999px;padding:2px 8px}',
    '.mos-hl{background:#fff3a0 !important;outline:2px solid #fbbc05;border-radius:6px;transition:background .2s}',
    '.mos-err{color:#b3261e;padding:20px;text-align:center}',
    '.mos-term .term-wrap{flex:1;border-radius:0 !important;min-height:0 !important}',
    '.mos-bar{display:flex;align-items:center;gap:4px;padding:4px 6px;background:rgba(10,20,14,.92);color:#fff;font-size:.72rem;flex-shrink:0}',
    '.mos .mos-bar button{height:24px !important;padding:0 8px !important;border-radius:8px !important;border:0 !important;background:rgba(255,255,255,.08) !important;color:#fff !important;font-size:.72rem !important;cursor:pointer}',
    '.mos .mos-bar button.on{background:rgba(124,252,154,.28) !important}.mos-bar .clk{margin-left:auto;opacity:.8}',
    '.mos-status{position:absolute;left:8px;right:8px;bottom:10px;z-index:3;background:rgba(0,0,0,.75);color:#fff;border-radius:10px;padding:4px 8px;font-size:.7rem;display:none}.mos-status.on{display:block}',
    '.mos-cur{position:absolute;left:50%;top:50%;width:16px;height:16px;z-index:4;pointer-events:none;transition:left .55s cubic-bezier(.3,.7,.3,1),top .55s cubic-bezier(.3,.7,.3,1);display:none}.mos-cur.on{display:block}',
    '.mos-cur.click::after,.dbp-ptr.click::after{content:"";position:absolute;left:-10px;top:-10px;width:22px;height:22px;border-radius:50%;border:2px solid currentColor;animation:mosRip .45s ease-out}',
    '@keyframes mosRip{from{transform:scale(.3);opacity:1}to{transform:scale(1.6);opacity:0}}',
    '.dbp-ptr{position:fixed;left:50vw;top:50vh;z-index:2147483600;pointer-events:none;transition:left .7s cubic-bezier(.3,.7,.3,1),top .7s cubic-bezier(.3,.7,.3,1);filter:drop-shadow(0 2px 3px rgba(0,0,0,.45))}',
    '.dbp-ptr .lab{position:absolute;left:20px;top:20px;white-space:nowrap;padding:2px 8px;border-radius:999px;color:#fff;font:600 12px/1.4 "Open Sans",system-ui,sans-serif}',
    '.dbp-stop{position:fixed;left:50%;top:14px;transform:translateX(-50%);z-index:2147483601;display:flex;align-items:center;gap:10px;background:#111;color:#fff;border-radius:999px;padding:6px 8px 6px 14px;font:13px "Open Sans",system-ui,sans-serif;box-shadow:0 8px 24px rgba(0,0,0,.35)}',
    '.dbp-stop button{background:#b3261e;color:#fff;border:0;border-radius:999px;padding:5px 12px;cursor:pointer;font:inherit;width:auto}'
  ].join('');
  document.head.appendChild(css);

  function cursorSvg(color, size) { return '<svg viewBox="0 0 24 24" width="' + (size || 16) + '" height="' + (size || 16) + '"><path d="M3 2l15 9-6.5 1.5L8 19z" fill="' + color + '" stroke="#fff" stroke-width="1.5" stroke-linejoin="round"/></svg>'; }

  // ---------------- Mini Snake OS Lite ----------------
  function mount(host, bot, color) {
    color = color || '#34d17a';
    host.insertAdjacentHTML('beforeend',
      '<div class="mos" data-mos>' +
        '<div class="mos-screen">' +
          '<div class="mos-win" data-w="web"><div class="mos-tb"><i style="background:#ff5f57"></i><i style="background:#febc2e"></i><i style="background:#28c840"></i><b>🌐 Navegador de ' + esc(bot.name) + '</b></div>' +
            '<div class="mos-tool"><button data-back title="Atrás">◀</button><button data-home title="Inicio">⌂</button><div class="mos-bar-in"><span style="font-weight:700;color:#4285f4">G</span><input data-q placeholder="Busca o escribe una dirección" spellcheck="false"></div></div>' +
            '<div class="mos-page" data-page></div></div>' +
          '<div class="mos-win mos-term" data-w="term" hidden><div class="mos-tb"><i style="background:#ff5f57"></i><i style="background:#febc2e"></i><i style="background:#28c840"></i><b>🖥️ Terminal</b></div><div data-termhost style="flex:1;min-height:0;display:flex;flex-direction:column"></div></div>' +
          '<div class="mos-status" data-status></div>' +
          '<div class="mos-cur" data-cur style="color:' + color + '">' + cursorSvg(color, 16) + '</div>' +
        '</div>' +
        '<div class="mos-bar"><button data-start title="Snake OS Lite">🐍</button><button data-app="web" class="on">🌐 Navegador</button><button data-app="term">🖥️ Terminal</button><span class="clk" data-clk></span></div>' +
      '</div>');
    var el = host.querySelector('[data-mos]:last-child');
    var page = el.querySelector('[data-page]'), q = el.querySelector('[data-q]'), bar = el.querySelector('.mos-bar-in');
    var cur = el.querySelector('[data-cur]'), screen = el.querySelector('.mos-screen'), status = el.querySelector('[data-status]');
    var hist = [], busy = false;
    var clk = el.querySelector('[data-clk]');
    function tick() { if (!el.isConnected) return clearInterval(ti); clk.textContent = new Date().toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' }); }
    var ti = setInterval(tick, 20000); tick();
    function show(w) { el.querySelectorAll('.mos-win').forEach(function (x) { x.hidden = x.getAttribute('data-w') !== w; }); el.querySelectorAll('.mos-bar [data-app]').forEach(function (b) { b.classList.toggle('on', b.getAttribute('data-app') === w); }); }
    el.querySelectorAll('.mos-bar [data-app]').forEach(function (b) { b.onclick = function () { show(b.getAttribute('data-app')); }; });
    el.querySelector('[data-start]').onclick = function () { show('web'); home(); };
    function say(t) { status.textContent = t; status.classList.toggle('on', !!t); }
    function home() {
      page.innerHTML = '<div class="mos-home"><div class="mos-logo"><span>D</span><span>o</span><span>g</span><span>g</span><span>l</span><span>e</span></div><div style="color:#5f6368;font-size:.72rem">El buscador de ' + esc(bot.name) + '</div></div>';
      q.value = '';
    }
    function renderResults(qq, results) {
      page.innerHTML = '<div style="color:#5f6368;font-size:.7rem;margin-bottom:8px">Resultados de «' + esc(qq) + '»</div>' + (results.length ? results.map(function (r, i) {
        return '<div class="mos-res"><div class="u">' + esc(r.url) + '</div><a data-go="' + esc(r.url) + '" data-i="' + i + '">' + esc(r.title || r.url) + '</a><p>' + esc(r.snippet || '') + '</p></div>';
      }).join('') : '<div class="mos-err">Sin resultados</div>');
      page.scrollTop = 0; wire();
    }
    function renderView(v) {
      var paras = String(v.text || '').split('\n').filter(function (x) { return x.trim().length > 1; }).slice(0, 80);
      page.innerHTML = '<div class="mos-pg"><h3>' + esc(v.title) + '</h3><div class="dom">🔒 ' + esc(v.domain) + ' · vista de lectura</div>' +
        (v.forms && v.forms.length ? '<div class="mos-bar-in" style="margin:0 0 8px"><span>🔎</span><input data-form placeholder="Buscar en ' + esc(v.domain) + '"></div>' : '') +
        paras.map(function (p) { return '<p>' + esc(p) + '</p>'; }).join('') +
        (v.links && v.links.length ? '<div class="mos-links">' + v.links.slice(0, 25).map(function (l) { return '<a class="mos-lk" data-go="' + esc(l.url) + '">' + esc(l.text) + '</a>'; }).join('') + '</div>' : '') + '</div>';
      page.scrollTop = 0; q.value = v.url; wire();
      var f = page.querySelector('[data-form]');
      if (f) f.onkeydown = function (e) { if (e.key === 'Enter' && f.value.trim()) { var fm = v.forms[0]; open(fm.action + (fm.action.indexOf('?') >= 0 ? '&' : '?') + encodeURIComponent(fm.field) + '=' + encodeURIComponent(f.value.trim())); } };
    }
    function wire() { page.querySelectorAll('[data-go]').forEach(function (a) { a.onclick = function () { open(a.getAttribute('data-go')); }; }); }
    function search(qq) {
      hist.push({ t: 'q', v: qq }); q.value = qq; page.innerHTML = '<div class="mos-err" style="color:#5f6368">Buscando…</div>';
      return api('/api/dbots/search', { method: 'POST', body: { q: qq } }).then(function (r) { renderResults(qq, r.results || []); }).catch(function (e) { page.innerHTML = '<div class="mos-err">' + esc(errMsg(e)) + '</div>'; });
    }
    function open(url, readerOnly) {
      if (!/^https?:\/\//i.test(url)) url = 'https://' + url;
      hist.push({ t: 'u', v: url }); q.value = url; page.innerHTML = '<div class="mos-err" style="color:#5f6368">Abriendo…</div>';
      var chk = readerOnly ? Promise.resolve({ embeddable: false }) : api('/api/frame-check?u=' + encodeURIComponent(url)).catch(function () { return { embeddable: false }; });
      return chk.then(function (fc) {
        if (fc && fc.embeddable) {
          page.innerHTML = '<iframe sandbox="allow-scripts allow-forms allow-popups" referrerpolicy="no-referrer" src="' + esc(url) + '"></iframe>';
          return;
        }
        return api('/api/dbots/browse', { method: 'POST', body: { url: url } }).then(renderView);
      }).catch(function (e) { page.innerHTML = '<div class="mos-err">' + esc(errMsg(e)) + '</div>'; });
    }
    q.onkeydown = function (e) { if (e.key !== 'Enter') return; var v = q.value.trim(); if (!v) return; if (/^(https?:\/\/|www\.)|^[\w-]+\.[a-z]{2,}(\/|$)/i.test(v)) open(v); else search(v); };
    el.querySelector('[data-home]').onclick = home;
    el.querySelector('[data-back]').onclick = function () { hist.pop(); var h = hist.pop(); if (!h) return home(); if (h.t === 'q') search(h.v); else open(h.v); };
    // ---- animación de las acciones del bot ----
    function curTo(target) {
      var sr = screen.getBoundingClientRect(), x, y;
      if (target && target.getBoundingClientRect) { var r = target.getBoundingClientRect(); x = r.left - sr.left + Math.min(r.width / 2, 40); y = r.top - sr.top + r.height / 2; }
      else { x = sr.width / 2; y = sr.height / 2; }
      cur.classList.add('on'); cur.style.left = x + 'px'; cur.style.top = y + 'px';
      return wait(600);
    }
    function click() { cur.classList.remove('click'); void cur.offsetWidth; cur.classList.add('click'); return wait(350); }
    function typeInto(input, text) {
      bar.classList.add('typing'); input.value = '';
      var i = 0; return new Promise(function (res) { (function step() { if (i >= text.length) { bar.classList.remove('typing'); return res(); } input.value += text[i++]; setTimeout(step, Math.max(18, 600 / Math.max(10, text.length))); })(); });
    }
    function findLink(t) {
      var all = page.querySelectorAll('[data-go]'), want = String(t.url || t.text || '').toLowerCase();
      for (var i = 0; i < all.length; i++) { var a = all[i]; if (want && (a.getAttribute('data-go').toLowerCase() === want || a.textContent.toLowerCase().indexOf(String(t.text || '~').toLowerCase()) >= 0)) return a; }
      return null;
    }
    function replay(trace) {
      if (!trace || !trace.length) return Promise.resolve();
      busy = true; show('web');
      var p = Promise.resolve();
      trace.forEach(function (t) {
        p = p.then(function () {
          if (t.op === 'search') { say('🔎 Buscando «' + t.q + '»'); return curTo(bar).then(click).then(function () { return typeInto(q, t.q); }).then(function () { hist.push({ t: 'q', v: t.q }); renderResults(t.q, t.results || []); return wait(700); }); }
          if (t.error) { say('⚠️ ' + t.error); return wait(900); }
          if ((t.op === 'open' || t.op === 'click' || t.op === 'form') && t.view) {
            var a = findLink(t);
            say((t.op === 'form' ? '⌨️ Buscando en la página: ' + t.q : t.op === 'click' ? '👆 Abriendo «' + (t.text || '') + '»' : '🌐 Abriendo ' + t.view.domain));
            var pre = a ? (a.scrollIntoView({ block: 'center' }), a.classList.add('mos-hl'), curTo(a).then(click)) : curTo(bar).then(click).then(function () { return typeInto(q, t.url || t.view.url); });
            return pre.then(function () { hist.push({ t: 'u', v: t.view.url }); renderView(t.view); return wait(800); });
          }
          if (t.op === 'scroll') { say('📜 Desplazando'); page.scrollTop += page.clientHeight * 0.8; return wait(700); }
          if (t.op === 'read') { say('📖 Leyendo'); var ps = page.querySelectorAll('.mos-pg p'); var k = 0; return (function hl() { if (k >= Math.min(4, ps.length)) return Promise.resolve(); var el2 = ps[k++]; el2.classList.add('mos-hl'); return curTo(el2).then(function () { return wait(250); }).then(function () { el2.classList.remove('mos-hl'); return hl(); }); })(); }
          return wait(200);
        });
      });
      return p.then(function () { say(''); cur.classList.remove('on'); busy = false; }, function () { say(''); busy = false; });
    }
    home();
    return { el: el, termHost: el.querySelector('[data-termhost]'), show: show, search: search, open: open, replay: replay, say: say, curTo: curTo, click: click };
  }

  // ---------------- Control del escritorio real ----------------
  var WALLS = ['mint', 'ocean', 'sunset', 'nebula', 'snake-pixel', 'snake-vivid', 'snake-real-python-verde', 'snake-real-vibora-desierto', 'snake-real-coralillo', 'snake-real-piton-dorada'];
  function context() {
    var apps = [];
    try { var A = window.APPS || {}; Object.keys(A).forEach(function (k) { if (k !== 'dbots') apps.push({ id: k, title: A[k] && A[k].title || k }); }); } catch (e) {}
    return { apps: apps.slice(0, 60), wallpapers: WALLS };
  }
  var running = null;
  function bridge() { return window.SnakeTermBridge || null; }
  function b64(t) { try { return btoa(unescape(encodeURIComponent(t))); } catch (e) { return ''; } }
  function vis(el) { if (!el) return null; var r = el.getBoundingClientRect(); return (r.width > 0 && r.height > 0 && r.bottom > 0 && r.right > 0 && r.top < innerHeight && r.left < innerWidth) ? el : null; }
  function runDesktop(steps, bot, color, log) {
    if (running) running.stop();
    log = log || function () {};
    color = color || '#8b3dff';
    var ptr = document.createElement('div');
    ptr.className = 'dbp-ptr'; ptr.style.color = color;
    ptr.innerHTML = cursorSvg(color, 26) + '<span class="lab" style="background:' + color + '">' + esc(bot.name) + '</span>';
    document.body.appendChild(ptr);
    var bar = document.createElement('div');
    bar.className = 'dbp-stop';
    bar.innerHTML = '<span>🤖 <b>' + esc(bot.name) + '</b> está usando tu escritorio</span><button data-stop>⏹ Parar (Esc)</button>';
    document.body.appendChild(bar);
    var st = { cancelled: false, stop: function () { st.cancelled = true; } };
    running = st;
    function onKey(e) { if (e.key === 'Escape') st.stop(); }
    document.addEventListener('keydown', onKey, true);
    bar.querySelector('[data-stop]').onclick = st.stop;
    function moveTo(el, fx, fy) {
      var x, y;
      if (el && el.getBoundingClientRect) { var r = el.getBoundingClientRect(); x = r.left + r.width / 2; y = r.top + Math.min(r.height / 2, 30); }
      else { x = fx != null ? fx : innerWidth / 2; y = fy != null ? fy : innerHeight / 2; }
      ptr.style.left = Math.max(4, Math.min(innerWidth - 30, x)) + 'px'; ptr.style.top = Math.max(4, Math.min(innerHeight - 30, y)) + 'px';
      return wait(750);
    }
    function clk() { ptr.classList.remove('click'); void ptr.offsetWidth; ptr.classList.add('click'); return wait(380); }
    function appIcon(id) { return vis(document.querySelector('.desktop-icon[data-app="' + id + '"]')) || vis(document.querySelector('#startBtn,.start-btn,[data-start-btn]')); }
    function win(id) { return vis(document.getElementById('win-' + id)); }
    var B = bridge(), done = [];
    var ops = {
      open_app: function (s) { if (!(window.APPS || {})[s.app]) throw new Error('No existe la app «' + s.app + '»'); return moveTo(appIcon(s.app)).then(clk).then(function () { window.openApp(s.app); return 'Abrí ' + ((window.APPS[s.app] || {}).title || s.app); }); },
      close_app: function (s) { var w = win(s.app); if (!w) return 'La app «' + s.app + '» no estaba abierta'; var c = w.querySelector('.win-btn.close,[data-close],.close'); return moveTo(c || w).then(clk).then(function () { (B && B.closeApp ? B.closeApp : window.closeApp)(s.app); return 'Cerré ' + s.app; }); },
      create_folder: function (s) {
        var name = String(s.name || 'Nueva carpeta').replace(/[\\/]/g, '-').slice(0, 60);
        return moveTo(null, innerWidth * 0.45, innerHeight * 0.4).then(clk).then(function () {
          if (typeof window.snkCreateFolder !== 'function') throw new Error('No puedo crear carpetas aquí');
          var orig = window.prompt; window.prompt = function () { return name; };
          return Promise.resolve(window.snkCreateFolder('')).finally(function () { window.prompt = orig; }).then(function () { return 'Creé la carpeta «' + name + '»'; });
        });
      },
      create_note: function (s) {
        if (!B) throw new Error('Notas no disponible');
        if (!(window.APPS || {}).notes) throw new Error('Notas no disponible');
        return moveTo(appIcon('notes')).then(clk).then(function () {
          B.notes().push({ id: Date.now() + '-' + Math.random().toString(36).slice(2), text: String(s.text || '').slice(0, 4000), date: new Date().toLocaleString('es-ES') });
          return Promise.resolve(B.saveNotes()).catch(function () {});
        }).then(function () { try { if (win('notes')) B.closeApp('notes'); } catch (e) {} return wait(250); })
          .then(function () { window.openApp('notes'); return moveTo(win('notes')); }).then(function () { return 'Escribí una nota en Notas'; });
      },
      create_file: function (s) {
        if (!B) throw new Error('Archivos no disponible');
        var name = String(s.name || 'archivo.txt').replace(/^\/+/, '').slice(0, 100); if (!/\.\w{1,5}$/.test(name)) name += '.txt';
        var text = String(s.text || '');
        return moveTo(null, innerWidth * 0.5, innerHeight * 0.45).then(clk).then(function () {
          var e = { id: B.newFileId(), name: name, type: 'text/plain', dataUrl: 'data:text/plain;base64,' + b64(text), size: text.length };
          B.files().push(e);
          return Promise.resolve(B.upload(e)).catch(function () {}).then(function () { return B.persistFiles(); }).catch(function () {}).then(function () { B.refresh(); return 'Creé el archivo «' + name + '»'; });
        });
      },
      set_wallpaper: function (s) {
        if (WALLS.indexOf(s.id) < 0) throw new Error('Ese fondo no existe');
        var X = window.__snakeOsDesktopExtras; if (!X || !X.applyWallpaper) throw new Error('No puedo cambiar el fondo aquí');
        return moveTo(null, innerWidth * 0.3, innerHeight * 0.3).then(clk).then(function () { X.applyWallpaper(s.id); return 'Cambié el fondo a «' + s.id + '»'; });
      },
      move_window: function (s) {
        var w = win(s.app); if (!w) throw new Error('La app «' + s.app + '» no está abierta');
        var tb = w.querySelector('.win-titlebar,.win-title,.titlebar') || w;
        return moveTo(tb).then(clk).then(function () {
          var W = Math.min(innerWidth - 20, Math.max(260, s.w || w.offsetWidth)), H = Math.min(innerHeight - 80, Math.max(180, s.h || w.offsetHeight));
          var X = Math.max(0, Math.min(innerWidth - W, s.x != null ? s.x : w.offsetLeft)), Y = Math.max(0, Math.min(innerHeight - H - 50, s.y != null ? s.y : w.offsetTop));
          w.style.transition = 'left .5s,top .5s,width .5s,height .5s'; w.style.left = X + 'px'; w.style.top = Y + 'px'; w.style.width = W + 'px'; w.style.height = H + 'px';
          ptr.style.left = (X + 60) + 'px'; ptr.style.top = (Y + 14) + 'px';
          return wait(650).then(function () { w.style.transition = ''; return 'Moví la ventana de ' + s.app; });
        });
      },
      switch_desktop: function (s) {
        var b = document.querySelector('[data-vd="' + (s.n || 1) + '"]'); if (!b) throw new Error('No hay escritorios virtuales aquí');
        return moveTo(vis(b) || null).then(clk).then(function () { b.click(); return 'Cambié al escritorio ' + s.n; });
      },
      delete_file: function (s) {
        if (!B) throw new Error('Archivos no disponible');
        var want = String(s.name || '').toLowerCase(), f = (B.files() || []).filter(function (x) { var n = String(x.name || '').toLowerCase(); return n === want || n.split('/').pop() === want; })[0];
        if (!f) throw new Error('No encontré «' + s.name + '»');
        return moveTo(null, innerWidth * 0.5, innerHeight * 0.5).then(clk).then(function () { B.trash(f.id); return 'Mandé «' + s.name + '» a la Papelera'; });
      }
    };
    var p = Promise.resolve();
    (steps || []).forEach(function (s) {
      p = p.then(function () {
        if (st.cancelled) throw new Error('STOP');
        var fn = ops[s.op]; if (!fn) return;
        return Promise.resolve().then(function () { return fn(s); }).then(function (msg) { if (msg) { done.push('✅ ' + msg); log('✅ ' + msg); } }, function (e) { if (String(e && e.message) === 'STOP') throw e; done.push('⚠️ ' + errMsg(e)); log('⚠️ ' + errMsg(e)); });
      });
    });
    function end() { document.removeEventListener('keydown', onKey, true); ptr.remove(); bar.remove(); if (running === st) running = null; }
    return p.then(function () { end(); return { done: done, stopped: false }; }, function () { end(); done.push('⏹ Parado'); return { done: done, stopped: true }; });
  }

  window.DogBotsOS = { mount: mount, runDesktop: runDesktop, context: context, cursorSvg: cursorSvg };
})();
