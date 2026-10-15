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
    '.mos-logo{font-size:1.35rem;font-weight:800;letter-spacing:-.5px;color:#ff8a00}.mos-logo span{color:#ff8a00}',
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
    '.mos-menu{position:absolute;left:6px;bottom:6px;z-index:6;width:min(230px,calc(100% - 12px));background:rgba(16,28,20,.97);color:#fff;border-radius:14px;padding:6px;box-shadow:0 10px 30px rgba(0,0,0,.5);display:none}.mos-menu.on{display:block}',
    '.mos-menu .hd{padding:6px 8px 8px;font-weight:700;font-size:.78rem;border-bottom:1px solid rgba(255,255,255,.12);margin-bottom:4px}',
    '.mos .mos-menu button{display:flex !important;align-items:center;gap:8px;width:100% !important;height:auto !important;min-height:34px;padding:6px 10px !important;border:0 !important;border-radius:9px !important;background:transparent !important;color:#fff !important;font-size:.8rem !important;text-align:left;cursor:pointer}',
    '.mos .mos-menu button:hover,.mos .mos-menu button:focus{background:rgba(124,252,154,.18) !important}.mos-menu hr{border:0;border-top:1px solid rgba(255,255,255,.12);margin:4px 0}',
    '.mos-off{position:absolute;inset:0;z-index:7;background:#000;color:#9f9;display:none;flex-direction:column;align-items:center;justify-content:center;gap:12px;font-size:.8rem}.mos-off.on{display:flex}',
    '.mos .mos-off button{width:auto !important;padding:8px 16px !important;border-radius:999px !important;border:1px solid #3c6 !important;background:#0b2 !important;color:#fff !important;cursor:pointer}',
    '.mos-page.live{padding:0;overflow:hidden}.mos-page.live iframe{display:block;background:#fff}',
    '.mos-fb{padding:6px 10px;font-size:.72rem;background:#fff8e1;color:#5d4200;border-bottom:1px solid #f0d78c}.mos-fb a{color:#1a0dab;cursor:pointer;text-decoration:underline}',
    '.mos .mos-tool button.on{background:#d2e3fc !important}',
    '.mos-code textarea{flex:1 1 55%;min-height:60px;border:0 !important;border-radius:0 !important;resize:none;background:#0d1117 !important;color:#c9f7d4 !important;font:12px/1.45 ui-monospace,Menlo,Consolas,monospace !important;padding:8px !important;outline:0}',
    '.mos-code iframe{flex:1 1 45%;min-height:50px;border:0;border-top:1px solid #222;background:#0b1410}',
    '.mos .mos-code select{height:24px;border-radius:8px;border:1px solid #ccc;font-size:.72rem;background:#fff;color:#222}.mos-ch{font-size:.62rem;color:#5f6368;margin-left:auto;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}',
    '.mos-fig{display:inline-flex;align-items:center;margin-left:4px}',
    '.dbp-modal{position:fixed;inset:0;z-index:2147483602;background:rgba(0,0,0,.45);display:flex;align-items:center;justify-content:center;font-family:"Open Sans",system-ui,sans-serif}',
    '.dbp-modal .box{background:#fff;color:#111;border-radius:18px;padding:18px 20px;max-width:min(340px,90vw);box-shadow:0 20px 50px rgba(0,0,0,.4);text-align:center}.dbp-modal .box b{display:block;font-size:1.05rem;margin:6px 0 14px}',
    '.dbp-modal button{border:0;border-radius:999px;padding:8px 16px;margin:0 4px;cursor:pointer;font:600 13px system-ui;width:auto}.dbp-modal .y{background:#1e8e3e;color:#fff}.dbp-modal .n{background:#eee;color:#222}',
    '.dbp-stop button{background:#b3261e;color:#fff;border:0;border-radius:999px;padding:5px 12px;cursor:pointer;font:inherit;width:auto}'
  ].join('');
  document.head.appendChild(css);

  function cursorSvg(color, size) { return '<svg viewBox="0 0 24 24" width="' + (size || 16) + '" height="' + (size || 16) + '"><path d="M3 2l15 9-6.5 1.5L8 19z" fill="' + color + '" stroke="#fff" stroke-width="1.5" stroke-linejoin="round"/></svg>'; }

  // ---------------- Mini Snake OS Lite ----------------
  var TOK = { t: '', at: 0 };
  function token() {
    if (TOK.t && Date.now() - TOK.at < 2 * 3600 * 1000) return Promise.resolve(TOK.t);
    return api('/api/dbots/proxy-token', { method: 'POST', body: {} }).then(function (r) { TOK = { t: r.t, at: Date.now() }; return r.t; });
  }
  function proxUrl(u, t) { return '/api/dbots/proxy?u=' + encodeURIComponent(u) + '&t=' + encodeURIComponent(t); }
  function mount(host, bot, color, opts) {
    opts = opts || {};
    color = color || '#34d17a';
    host.insertAdjacentHTML('beforeend',
      '<div class="mos" data-mos>' +
        '<div class="mos-screen">' +
          '<div class="mos-win" data-w="web"><div class="mos-tb"><i style="background:#ff5f57"></i><i style="background:#febc2e"></i><i style="background:#28c840"></i><b>🌐 Navegador de ' + esc(bot.name) + '</b></div>' +
            '<div class="mos-tool"><button data-back title="Atrás">◀</button><button data-home title="Inicio">⌂</button><button data-reader title="Vista de lectura (si la página no carga)">📄</button><div class="mos-bar-in"><span style="font-weight:700;color:#4285f4">G</span><input data-q placeholder="Buscar en Doganiero Search o pegar una URL" spellcheck="false"></div></div>' +
            '<div class="mos-page" data-page></div></div>' +
          '<div class="mos-win mos-term" data-w="term" hidden><div class="mos-tb"><i style="background:#ff5f57"></i><i style="background:#febc2e"></i><i style="background:#28c840"></i><b>🖥️ Terminal</b></div><div data-termhost style="flex:1;min-height:0;display:flex;flex-direction:column"></div></div>' +
          '<div class="mos-win mos-code" data-w="code" hidden><div class="mos-tb"><i style="background:#ff5f57"></i><i style="background:#febc2e"></i><i style="background:#28c840"></i><b>💻 Código de ' + esc(bot.name) + '</b></div>' +
            '<div class="mos-tool"><select data-lang><option value="js">JavaScript</option><option value="py">Python</option></select><button data-run title="Ejecutar">▶</button><button data-tocl title="Copiar a mi Code Lab">📋</button><span class="mos-ch" data-chint>Aislado: sin red ni cookies</span></div>' +
            '<textarea data-code spellcheck="false" placeholder="// El bot escribe aquí su código"></textarea><iframe data-out sandbox="allow-scripts" title="Salida"></iframe></div>' +
          '<div class="mos-status" data-status></div>' +
          '<div class="mos-menu" data-menu role="menu"><div class="hd">🐍 Snake OS Lite · ' + esc(bot.name) + '</div>' +
            '<button data-m="web">🌐 Navegador</button><button data-m="term">🖥️ Terminal</button><button data-m="code">💻 Código</button>' +
            (opts.notes ? '<button data-m="notes">🧠 Notas del bot</button>' : '') + (opts.settings ? '<button data-m="settings">⚙️ Ajustes del bot</button>' : '') +
            '<hr><button data-m="reboot">🔄 Reiniciar mini OS</button><button data-m="off">⏻ Apagar mini OS</button></div>' +
          '<div class="mos-off" data-off><div style="font-size:30px">🐍</div><div>Snake OS Lite está apagado</div><button data-on>⏻ Encender</button></div>' +
          '<div class="mos-cur" data-cur style="color:' + color + '">' + cursorSvg(color, 16) + '</div>' +
        '</div>' +
        '<div class="mos-bar"><button data-start title="Snake OS Lite">🐍</button><button data-app="web" class="on">🌐 Navegador</button><button data-app="term">🖥️ Terminal</button><button data-app="code">💻 Código</button>' + (opts.fig ? '<span class="mos-fig">' + opts.fig + '</span>' : '') + '<span class="clk" data-clk></span></div>' +
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
    var menu = el.querySelector('[data-menu]'), off = el.querySelector('[data-off]');
    function menuOn(v) { menu.classList.toggle('on', v); }
    el.querySelector('[data-start]').onclick = function (e) { e.stopPropagation(); menuOn(!menu.classList.contains('on')); };
    el.addEventListener('click', function (e) { if (!menu.contains(e.target) && !e.target.closest('[data-start]')) menuOn(false); });
    function reboot() { off.classList.add('on'); off.querySelector('div:nth-child(2)').textContent = 'Reiniciando…'; off.querySelector('[data-on]').hidden = true;
      setTimeout(function () { off.classList.remove('on'); off.querySelector('div:nth-child(2)').textContent = 'Snake OS Lite está apagado'; off.querySelector('[data-on]').hidden = false; hist = []; home(); show('web'); }, 900); }
    menu.querySelectorAll('[data-m]').forEach(function (b) { b.onclick = function (e) { e.stopPropagation(); menuOn(false); var m = b.getAttribute('data-m');
      if (m === 'web' || m === 'term' || m === 'code') show(m);
      else if (m === 'notes') opts.notes();
      else if (m === 'settings') opts.settings();
      else if (m === 'reboot') reboot();
      else if (m === 'off') { off.classList.add('on'); frame = null; page.innerHTML = ''; } }; });
    off.querySelector('[data-on]').onclick = function () { reboot(); };
    // ---- Editor de código del bot (como Code Lab, ejecución aislada) ----
    var codeTa = el.querySelector('[data-code]'), langSel = el.querySelector('[data-lang]'), out = el.querySelector('[data-out]');
    var CSPJS = "default-src 'none'; script-src 'unsafe-inline' 'unsafe-eval'; style-src 'unsafe-inline'";
    var PYB = 'https://cdn.jsdelivr.net/pyodide/v0.27.7/full/';
    var CSPPY = "default-src 'none'; script-src 'unsafe-inline' 'unsafe-eval' 'wasm-unsafe-eval' https://cdn.jsdelivr.net; connect-src https://cdn.jsdelivr.net; style-src 'unsafe-inline'";
    function js(s) { return JSON.stringify(String(s)).replace(/</g, '\\u003c'); }
    var HEAD = '<style>body{margin:0;background:#0b1410;color:#9f9;font:12px/1.45 ui-monospace,Menlo,monospace}pre{margin:0;padding:8px;white-space:pre-wrap}.e{color:#ff8a80}</style>';
    var W = 'var o=document.getElementById("o");function w(t,c){var s=document.createElement("span");if(c)s.className=c;s.textContent=t+"\\n";o.appendChild(s);}';
    function runCode() {
      var code = codeTa.value || '', lang = langSel.value, html;
      if (lang === 'py') html = '<!doctype html><meta http-equiv="Content-Security-Policy" content="' + CSPPY + '">' + HEAD + '<pre id="o">Cargando Python…\n</pre><script src="' + PYB + 'pyodide.js"></' + 'script><script>' + W + '(async function(){try{var py=await loadPyodide({indexURL:"' + PYB + '",stdout:function(t){w(t)},stderr:function(t){w(t,"e")}});o.textContent="";await py.runPythonAsync(' + js(code) + ');w("— fin —","d")}catch(e){w(String(e&&e.message||e),"e")}})();</' + 'script>';
      else html = '<!doctype html><meta http-equiv="Content-Security-Policy" content="' + CSPJS + '">' + HEAD + '<pre id="o"></pre><script>' + W + 'var f=function(c){return function(){w(Array.prototype.map.call(arguments,function(a){try{return typeof a==="object"?JSON.stringify(a):String(a)}catch(e){return String(a)}}).join(" "),c)}};console.log=f();console.info=f();console.warn=f("e");console.error=f("e");window.onerror=function(m){w(m,"e")};try{(0,eval)(' + js(code) + ');w("— fin —")}catch(e){w(String(e),"e")}</' + 'script>';
      out.srcdoc = html;
    }
    el.querySelector('[data-run]').onclick = runCode;
    el.querySelector('[data-tocl]').onclick = function () {
      if (!window.openApp || !(window.APPS || {}).code) { el.querySelector('[data-chint]').textContent = 'Code Lab no disponible'; return; }
      window.openApp('code');
      setTimeout(function () { var ed = document.querySelector('#codeEditor-x'), lg = document.querySelector('#codeLang-x'), nm = document.querySelector('#codeName-x');
        if (!ed) return; if (lg) { lg.value = langSel.value; lg.dispatchEvent(new Event('change', { bubbles: true })); } if (nm) nm.value = 'bot-' + String(bot.name || 'bot').toLowerCase().replace(/\W+/g, '-') + (langSel.value === 'py' ? '.py' : '.js');
        ed.value = codeTa.value; ed.dispatchEvent(new Event('input', { bubbles: true })); el.querySelector('[data-chint]').textContent = '✅ Copiado a tu Code Lab'; }, 500);
    };
    function writeCode(c) {
      show('code'); langSel.value = /^py/.test(c.lang || '') ? 'py' : 'js';
      var txt = String(c.code || ''); codeTa.value = ''; say('⌨️ ' + bot.name + ' está programando…');
      var i = 0, step = Math.max(1, Math.ceil(txt.length / 120));
      return new Promise(function (res) { (function go() { if (i >= txt.length) return res(); codeTa.value += txt.slice(i, i + step); i += step; codeTa.scrollTop = codeTa.scrollHeight; setTimeout(go, 16); })(); })
        .then(function () { return curTo(el.querySelector('[data-run]')); }).then(click).then(function () { say(''); cur.classList.remove('on'); runCode(); });
    }
    // ---- iframe real (directo o por el proxy del servidor) ----
    var frame = null, frameMode = '', curUrl = '', pend = {}, seq = 0, onLoaded = null;
    window.addEventListener('message', function (e) {
      if (!frame || e.source !== frame.contentWindow) return;
      var m = e.data || {}; if (!m.__dbp) return;
      if (m.type === 'loaded') {
        if (m.url) { var dq = /^(doggle|dsearch):/.test(m.url) ? m.url.replace(/^(doggle|dsearch):/, '') : null; if (dq && /^https?:/.test(dq)) { try { dq = new URL(dq).searchParams.get('q'); } catch (e2) {} } curUrl = dq == null ? m.url : ''; q.value = dq == null ? m.url : dq; }
        if (m.error) showFallback(m.error); else hideFallback();
        if (onLoaded) { var f = onLoaded; onLoaded = null; f(m); }
      } else if (m.type === 'open') { if (m.url) open(m.url); } else if (m.type === 'nav') { if (m.url) { hist.push({ t: 'u', v: m.url }); q.value = m.url; } }
      else if (m.type === 'note') say(m.text);
      else if (m.id && pend[m.id]) { pend[m.id](m); delete pend[m.id]; }
    });
    function cmd(c, extra, ms) {
      if (!frame || frameMode !== 'proxy') return Promise.resolve({ ok: false });
      var id = 'c' + (++seq), msg = Object.assign({ cmd: c, id: id }, extra || {});
      return new Promise(function (res) { pend[id] = res; try { frame.contentWindow.postMessage(msg, '*'); } catch (e) { res({ ok: false }); } setTimeout(function () { if (pend[id]) { delete pend[id]; res({ ok: false, timeout: true }); } }, ms || 4000); });
    }
    function waitLoaded(ms) { return new Promise(function (res) { onLoaded = res; setTimeout(function () { if (onLoaded === res) { onLoaded = null; res({ timeout: true }); } }, ms || 12000); }); }
    function showFallback(msg) {
      var fb = page.querySelector('.mos-fb'); if (fb) fb.remove();
      page.insertAdjacentHTML('afterbegin', '<div class="mos-fb">⚠️ ' + esc(msg) + ' · <a data-rd>Ver en vista de lectura</a></div>');
      page.querySelector('[data-rd]').onclick = function () { reader(curUrl); };
    }
    function hideFallback() { var fb = page.querySelector('.mos-fb'); if (fb) fb.remove(); }
    function setFrame(src, mode) {
      page.classList.add('live'); frameMode = mode;
      page.innerHTML = '<iframe sandbox="allow-scripts allow-forms" referrerpolicy="no-referrer" src="' + esc(src) + '"></iframe>';
      frame = page.querySelector('iframe');
      if (mode === 'direct') frame.onerror = function () { showFallback('No cargó'); };
    }
    function clearFrame() { page.classList.remove('live'); frame = null; frameMode = ''; }
    function proxyOpen(url) { return token().then(function (t) { var w = waitLoaded(); setFrame(proxUrl(url, t), 'proxy'); return w; }); }
    function reader(url) {
      clearFrame(); el.querySelector('[data-reader]').classList.add('on');
      page.innerHTML = '<div class="mos-err" style="color:#5f6368">Abriendo vista de lectura…</div>';
      return api('/api/dbots/browse', { method: 'POST', body: { url: url } }).then(renderView).catch(function (e) { page.innerHTML = '<div class="mos-err">' + esc(errMsg(e)) + '</div>'; });
    }
    el.querySelector('[data-reader]').onclick = function () { if (!curUrl) return; if (frame) reader(curUrl); else { el.querySelector('[data-reader]').classList.remove('on'); proxyOpen(curUrl); } };
    function say(t) { status.textContent = t; status.classList.toggle('on', !!t); }
    function home() {
      clearFrame(); curUrl = '';
      page.innerHTML = '<div class="mos-home"><div class="mos-logo"><span>Doganiero Search</span></div><div style="color:#5f6368;font-size:.72rem">El buscador de ' + esc(bot.name) + '</div></div>';
      q.value = '';
    }
    function renderResults(qq, results) {
      clearFrame();
      page.innerHTML = '<div style="color:#5f6368;font-size:.7rem;margin-bottom:8px">Resultados de «' + esc(qq) + '»</div>' + (results.length ? results.map(function (r, i) {
        return '<div class="mos-res"><div class="u">' + esc(r.url) + '</div><a data-go="' + esc(r.url) + '" data-i="' + i + '">' + esc(r.title || r.url) + '</a><p>' + esc(r.snippet || '') + '</p></div>';
      }).join('') : '<div class="mos-err">Sin resultados</div>');
      page.scrollTop = 0; wire();
    }
    function renderView(v) {
      clearFrame(); curUrl = v.url;
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
    function search(qq, fallbackResults, pg) {
      hist.push({ t: 'q', v: qq }); q.value = qq; clearFrame(); curUrl = ''; el.querySelector('[data-reader]').classList.remove('on');
      page.innerHTML = '<div class="mos-err" style="color:#5f6368">Buscando…</div>';
      return token().then(function (t) {
        var w = waitLoaded(); setFrame('/api/dbots/serp?q=' + encodeURIComponent(qq) + '&p=' + (pg || 1) + '&t=' + encodeURIComponent(t), 'proxy');
        return w.then(function (m) { if (m && (m.timeout || m.error)) { renderResults(qq, fallbackResults || []); } return 'doggle'; });
      }).catch(function (e) { renderResults(qq, fallbackResults || []); return 'doggle'; });
    }
    function open(url, readerOnly) {
      if (!/^https?:\/\//i.test(url)) url = 'https://' + url;
      hist.push({ t: 'u', v: url }); q.value = url; curUrl = url; clearFrame(); el.querySelector('[data-reader]').classList.remove('on');
      page.innerHTML = '<div class="mos-err" style="color:#5f6368">Abriendo…</div>';
      if (readerOnly) return reader(url);
      return api('/api/frame-check?u=' + encodeURIComponent(url)).catch(function () { return { embeddable: false }; }).then(function (fc) {
        if (fc && fc.embeddable && !opts.forceProxy) { setFrame(url, 'direct'); return; }
        return proxyOpen(url).then(function (m) { if (m && m.timeout) showFallback('La página tarda en cargar'); });
      }).catch(function (e) { reader(url); });
    }
    function live() { return frame && frameMode === 'proxy'; }
    function frameXY(rc) { var fr = frame.getBoundingClientRect(); return { getBoundingClientRect: function () { return { left: fr.left + rc.x, top: fr.top + rc.y - 6, width: 12, height: 12 }; } }; }
    q.onkeydown = function (e) { if (e.key !== 'Enter') return; var v = q.value.trim(); if (!v) return; if (/^(https?:\/\/|www\.)|^[\w-]+(\.[\w-]+)*\.[a-z]{2,}(\/|$)/i.test(v)) open(v); else search(v); };
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
          if (t.op === 'search') { say('🔎 Buscando «' + t.q + '»'); return curTo(bar).then(click).then(function () { return typeInto(q, t.q); }).then(function () { return search(t.q, t.results || []); }).then(function () { return wait(700); }); }
          if (t.error) { say('⚠️ ' + t.error); return wait(900); }
          if ((t.op === 'open' || t.op === 'click' || t.op === 'form') && t.view) {
            say((t.op === 'form' ? '⌨️ Buscando en la página: ' + t.q : t.op === 'click' ? '👆 Abriendo «' + (t.text || '') + '»' : '🌐 Abriendo ' + t.view.domain));
            var target = t.view.url;
            if (live() && t.op === 'click') {
              return cmd('locate', { text: t.text, url: t.url }).then(function (r) {
                if (!r.ok) return curTo(bar).then(click).then(function () { return typeInto(q, target); }).then(function () { hist.push({ t: 'u', v: target }); return proxyOpen(target); });
                return curTo(frameXY(r.rect)).then(click).then(function () { var w = waitLoaded(); cmd('click', { text: t.text, url: t.url }); hist.push({ t: 'u', v: target }); return w; });
              }).then(function () { return wait(700); });
            }
            if (live() && t.op === 'form') {
              return cmd('type', { text: t.q, submit: false }, 8000).then(function (r) {
                if (!r.ok) return proxyOpen(target);
                return curTo(frameXY(r.rect)).then(click).then(function () { hist.push({ t: 'u', v: target }); return proxyOpen(target); });
              }).then(function () { return wait(700); });
            }
            var a = !live() && findLink(t);
            var pre = a ? (a.scrollIntoView({ block: 'center' }), a.classList.add('mos-hl'), curTo(a).then(click)) : curTo(bar).then(click).then(function () { return typeInto(q, t.url || target); });
            return pre.then(function () { hist.push({ t: 'u', v: target }); curUrl = target; return proxyOpen(target); }).then(function (m) { if (!m || m.timeout || m.error) { renderView(t.view); showFallback((m && m.error) || 'La página no cargó; muestro la vista de lectura'); } return wait(800); });
          }
          if (t.op === 'scroll') { say('📜 Desplazando'); if (live()) return cmd('scroll', {}).then(function () { return wait(700); }); page.scrollTop += page.clientHeight * 0.8; return wait(700); }
          if (t.op === 'read') { say('📖 Leyendo'); if (live()) return curTo(frame).then(function () { return cmd('read', {}, 4000); });
            var ps = page.querySelectorAll('.mos-pg p'); var k = 0; return (function hl() { if (k >= Math.min(4, ps.length)) return Promise.resolve(); var el2 = ps[k++]; el2.classList.add('mos-hl'); return curTo(el2).then(function () { return wait(250); }).then(function () { el2.classList.remove('mos-hl'); return hl(); }); })(); }
          return wait(200);
        });
      });
      return p.then(function () { say(''); cur.classList.remove('on'); busy = false; }, function () { say(''); busy = false; });
    }
    home();
    return { el: el, termHost: el.querySelector('[data-termhost]'), show: show, search: search, open: open, replay: replay, say: say, curTo: curTo, click: click, cmd: cmd, menu: menuOn, reader: reader, code: writeCode };
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
  function confirmBox(text, bot) {
    return new Promise(function (res) {
      var m = document.createElement('div'); m.className = 'dbp-modal';
      m.innerHTML = '<div class="box" role="dialog" aria-modal="true"><div style="font-size:28px">📞</div><b>' + esc(text) + '</b><div style="font-size:12px;color:#555;margin:-8px 0 14px">Lo pide ' + esc(bot.name) + '. La llamada solo empieza si aceptas.</div><button class="n" data-n>Cancelar</button><button class="y" data-y>Llamar</button></div>';
      document.body.appendChild(m);
      function done(v) { m.remove(); res(v); }
      m.querySelector('[data-y]').onclick = function () { done(true); }; m.querySelector('[data-n]').onclick = function () { done(false); };
      m.onclick = function (e) { if (e.target === m) done(false); };
    });
  }
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
      call_contact: function (s) {
        var want = String(s.name || '').trim(), wd = want.replace(/\D/g, '');
        if (!want) throw new Error('¿A quién llamo?');
        return api('/api/phone/contacts').then(function (d) {
          var cs = (d && d.contacts) || [], lw = want.toLowerCase();
          var c = cs.filter(function (x) { var n = String(x.number || '').replace(/\D/g, ''); return wd.length === 6 && n === wd; })[0] ||
            cs.filter(function (x) { return String(x.name || '').toLowerCase() === lw; })[0] ||
            cs.filter(function (x) { return String(x.name || '').toLowerCase().indexOf(lw) >= 0; })[0];
          if (!c) throw new Error('«' + want + '» no está entre tus contactos; solo llamo a tus contactos');
          var label = (c.name || 'contacto') + ' (' + c.number + ')';
          return confirmBox('¿Llamar a ' + label + '?', bot).then(function (ok) {
            if (!ok) return 'No llamé a ' + label + ' (cancelado)';
            if (!(window.APPS || {}).phone) throw new Error('Teléfono no disponible');
            return moveTo(appIcon('phone')).then(clk).then(function () { window.openApp('phone'); return wait(700); }).then(function () {
              var w = win('phone'), disp = w && w.querySelector('.dph-display'), btn = w && w.querySelector('.dph-call');
              if (!disp || !btn) throw new Error('No encontré el marcador del Teléfono');
              return moveTo(disp).then(clk).then(function () { disp.value = String(c.number); disp.dispatchEvent(new Event('input', { bubbles: true })); return wait(400); })
                .then(function () { return moveTo(btn); }).then(clk).then(function () { btn.click(); return 'Llamando a ' + label + ' (yo no hablo en la llamada)'; });
            });
          });
        });
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
