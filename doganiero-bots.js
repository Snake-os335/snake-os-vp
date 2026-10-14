/* Snake OS VP · Doganiero Bots (2026-10-14). Bots por perfil con tareas en paralelo,
   terminal estilo Snake OS Lite (local, NO va a la placa) y búsqueda con AskBox. */
(function () {
  if (window.__dbotsLoaded) return; window.__dbotsLoaded = 1;
  var THEMES = {
    selva: ['Selva', '#0f3d22', '#34d17a'], lava: ['Lava', '#3d120c', '#ff6a3d'],
    oceano: ['Océano', '#0b2740', '#3db8ff'], lila: ['Lila', '#2a1640', '#b98aff'],
    oro: ['Oro', '#3a2c08', '#ffc93d'], noche: ['Noche', '#0d0f1c', '#8fa3ff'],
    coral: ['Coral', '#3d1424', '#ff7aa8'], menta: ['Menta', '#0c3533', '#5cf2d6']
  };
  var AVATARS = ['🤖', '🐍', '🐶', '🦊', '🦉', '🐙', '🦄', '🐉', '🛰️', '🔎', '📰', '🧠'];
  var ST = { 'en cola': '⏳ en cola', 'trabajando': '⚙️ trabajando', 'hecho': '✅ hecho', 'error': '❌ error', 'cancelada': '🚫 cancelada' };
  var css = document.createElement('style');
  css.textContent =
    '.dbots{display:flex;height:100%;min-height:0;background:#07140d;color:#eafff0;font-family:ui-sans-serif,system-ui,sans-serif;font-size:.9rem}' +
    '.dbots-side{width:210px;flex-shrink:0;border-right:1px solid rgba(157,255,194,.15);display:flex;flex-direction:column;overflow:auto}' +
    '.dbots-side h3{margin:12px 12px 6px;font-size:1rem}' +
    '.dbots-bot{display:flex;gap:8px;align-items:center;margin:4px 8px;padding:8px;border-radius:12px;cursor:pointer;border:2px solid transparent}' +
    '.dbots-bot.on{border-color:var(--ac)}.dbots-bot .av{font-size:1.5rem}.dbots-bot small{display:block;opacity:.7}' +
    '.dbots-btn{background:#1d6b41;color:#fff;border:0;border-radius:10px;padding:7px 11px;cursor:pointer;font:inherit}' +
    '.dbots-btn.alt{background:rgba(255,255,255,.1)}.dbots-btn.red{background:#8a2b22}' +
    '.dbots-main{flex:1;min-width:0;display:flex;flex-direction:column;overflow:auto}' +
    '.dbots-head{padding:12px;display:flex;gap:10px;align-items:center;flex-wrap:wrap}' +
    '.dbots-head .av{font-size:2rem}.dbots-head h2{margin:0;font-size:1.15rem;flex:1;min-width:120px}' +
    '.dbots-role{margin:0 12px 8px;padding:8px 10px;border-radius:10px;background:rgba(0,0,0,.25);white-space:pre-wrap}' +
    '.dbots-new{display:flex;gap:6px;margin:0 12px 8px}.dbots-new input{flex:1;min-width:0}' +
    '.dbots input,.dbots textarea,.dbots select{background:rgba(0,0,0,.35);color:#eafff0;border:1px solid rgba(157,255,194,.25);border-radius:9px;padding:7px;font:inherit;box-sizing:border-box}' +
    '.dbots-tasks{margin:0 12px 8px;display:flex;flex-direction:column;gap:6px}' +
    '.dbots-task{padding:8px 10px;border-radius:10px;background:rgba(255,255,255,.05);border-left:4px solid var(--ac)}' +
    '.dbots-task .row{display:flex;gap:8px;align-items:center}.dbots-task .row b{flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis}' +
    '.dbots-task pre{white-space:pre-wrap;word-break:break-word;margin:6px 0 0;font:inherit;font-size:.85rem}' +
    '.dbots .term-wrap{height:220px;min-height:160px;flex-shrink:0;margin:0 12px 12px;border-radius:12px;overflow:hidden;border:1px solid var(--ac)}' +
    '.dbots-empty{padding:30px;text-align:center;opacity:.8}.dbots-warn{margin:0 12px 8px;padding:8px 10px;border-radius:10px;background:#3a2c08;color:#ffe9a8}' +
    '.dbots-form{padding:14px;display:flex;flex-direction:column;gap:8px}.dbots-form textarea{min-height:80px}' +
    '.dbots-pick{display:flex;flex-wrap:wrap;gap:6px}.dbots-pick span{cursor:pointer;padding:5px 8px;border-radius:9px;border:2px solid transparent;background:rgba(255,255,255,.06)}.dbots-pick span.on{border-color:#7CFC9A}' +
    '@media (max-width:640px){.dbots{flex-direction:column}.dbots-side{width:auto;flex-direction:row;border-right:0;border-bottom:1px solid rgba(157,255,194,.15);flex-shrink:0;overflow-x:auto}.dbots-side h3{display:none}.dbots-bot{flex-shrink:0}.dbots-bot small{display:none}}';
  css.textContent +=
    '.dbots-tabs{display:flex;gap:4px;margin:0 12px 8px;flex-wrap:wrap}.dbots-tabs button{background:rgba(255,255,255,.07);color:#eafff0;border:0;border-radius:9px;padding:6px 10px;cursor:pointer;font:inherit}.dbots-tabs button.on{background:var(--ac);color:#06130b;font-weight:700}' +
    '.dbots-pane{display:none;flex-direction:column;min-height:0}.dbots-pane.on{display:flex}' +
    '.dbots-chat{flex:1;min-height:200px;overflow:auto;margin:0 12px;padding:6px 2px;display:flex;flex-direction:column;gap:8px}' +
    '.dbots-msg{max-width:82%;padding:8px 11px;border-radius:14px;white-space:pre-wrap;word-break:break-word;line-height:1.4}' +
    '.dbots-msg.user{align-self:flex-end;background:#1d6b41;border-bottom-right-radius:4px}' +
    '.dbots-msg.bot{align-self:flex-start;background:rgba(255,255,255,.08);border-left:3px solid var(--ac);border-bottom-left-radius:4px}' +
    '.dbots-msg small{display:block;opacity:.6;font-size:.72rem;margin-top:4px}.dbots-msg a{color:var(--ac)}' +
    '.dbots-typing span{display:inline-block;width:7px;height:7px;margin:0 2px;border-radius:50%;background:var(--ac);animation:dbotsDot 1s infinite}' +
    '.dbots-typing span:nth-child(2){animation-delay:.15s}.dbots-typing span:nth-child(3){animation-delay:.3s}' +
    '@keyframes dbotsDot{0%,80%,100%{opacity:.25;transform:translateY(0)}40%{opacity:1;transform:translateY(-4px)}}' +
    '.dbots-chatin{display:flex;gap:6px;margin:8px 12px 12px}.dbots-chatin textarea{flex:1;min-width:0;resize:none;height:42px}' +
    '.dbots-main.chatmode{overflow:hidden}.dbots-main.chatmode .dbots-pane.on{flex:1}';
  document.head.appendChild(css);

  function api(path, opts) { return window.api ? window.api(path, opts) : Promise.reject(new Error('api')); }
  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  function emo(el) { try { if (window.snakeEmoji) window.snakeEmoji.parse(el); } catch (e) {} }
  function errMsg(e) { return (e && (e.message || e.detail)) || 'Error'; }
  function th(b) { return THEMES[b && b.theme] || THEMES.selva; }

  function render(body) {
    var S = { bots: [], tasks: [], hasKey: true, sel: null, timer: 0, alive: true, logs: {} };
    body.innerHTML = '<div class="dbots"><div class="dbots-side"></div><div class="dbots-main"></div></div>';
    var side = body.querySelector('.dbots-side'), main = body.querySelector('.dbots-main');

    function load() {
      return Promise.all([api('/api/dbots/bots'), api('/api/dbots/tasks')]).then(function (r) {
        S.bots = r[0].bots || []; S.hasKey = !!r[0].hasKey; S.tasks = r[1].tasks || [];
        if (!S.sel || !S.bots.some(function (b) { return b.id === S.sel; })) S.sel = S.bots[0] ? S.bots[0].id : null;
        drawSide(); drawMain();
      }).catch(function (e) { main.innerHTML = '<div class="dbots-empty">No se pudo cargar: ' + esc(errMsg(e)) + '</div>'; });
    }
    function poll() {
      if (!S.alive) return;
      if (!body.isConnected) { S.alive = false; clearInterval(S.timer); return; }
      api('/api/dbots/tasks').then(function (r) {
        var old = JSON.stringify(S.tasks); S.tasks = r.tasks || [];
        if (old !== JSON.stringify(S.tasks)) { drawSide(); drawTasks(); syncLog(); if (S.refreshChat && !S.sending) S.refreshChat().catch(function () {}); }
      }).catch(function () {});
    }
    S.timer = setInterval(function () {
      if (S.tasks.some(function (t) { return t.status === 'en cola' || t.status === 'trabajando'; })) poll();
      else if (!body.isConnected) { S.alive = false; clearInterval(S.timer); }
    }, 2500);

    function botTasks(id) { return S.tasks.filter(function (t) { return t.bot_id === id; }); }
    function drawSide() {
      var h = '<h3>🤖 Mis bots</h3>';
      S.bots.forEach(function (b) {
        var t = th(b), act = botTasks(b.id).filter(function (x) { return x.status === 'trabajando' || x.status === 'en cola'; }).length;
        h += '<div class="dbots-bot' + (b.id === S.sel ? ' on' : '') + '" data-id="' + esc(b.id) + '" style="background:' + t[1] + ';--ac:' + t[2] + '">' +
          '<span class="av">' + esc(b.avatar) + '</span><div><b>' + esc(b.name) + '</b><small>' + (act ? '⚙️ ' + act + ' activas' : 'Libre') + '</small></div></div>';
      });
      h += '<div style="padding:8px"><button class="dbots-btn" data-new>➕ Nuevo bot</button></div>';
      side.innerHTML = h; emo(side);
      side.querySelectorAll('.dbots-bot').forEach(function (el) { el.onclick = function () { S.sel = el.getAttribute('data-id'); drawSide(); drawMain(); }; });
      side.querySelector('[data-new]').onclick = function () { form(null); };
    }
    function cur() { return S.bots.find(function (b) { return b.id === S.sel; }); }
    function drawMain() {
      var b = cur();
      if (!b) { main.innerHTML = '<div class="dbots-empty">🤖<br><br>Aún no tienes bots.<br>Crea uno, dale una función y ponlo a trabajar.<br><br><button class="dbots-btn" data-new>➕ Crear mi primer bot</button></div>'; main.querySelector('[data-new]').onclick = function () { form(null); }; emo(main); return; }
      var t = th(b);
      main.style.setProperty('--ac', t[2]);
      main.innerHTML =
        '<div class="dbots-head" style="background:linear-gradient(90deg,' + t[1] + ',transparent)"><span class="av">' + esc(b.avatar) + '</span><h2>' + esc(b.name) + '</h2>' +
        '<button class="dbots-btn alt" data-edit>✏️ Editar</button><button class="dbots-btn red" data-del>🗑️ Borrar</button></div>' +
        '<div class="dbots-role"><b>Función:</b> ' + esc(b.role || 'Sin función (asistente general)') + '</div>' +
        (S.hasKey ? '' : '<div class="dbots-warn">⚠️ Para que los bots busquen en internet necesitas tu propia clave de AskBox. Añádela en <b>Ajustes → IA → Key de AskBox</b>.</div>') +
        '<div class="dbots-tabs"><button data-tab="chat">💬 Chat</button><button data-tab="term">🖥️ Terminal</button><button data-tab="tasks">📋 Tareas</button><button data-tab="mem">🧠 Memoria</button></div>' +
        '<div class="dbots-pane" data-pane="chat"><div class="dbots-chat"></div><div class="dbots-chatin"><textarea data-msg maxlength="2000" placeholder="Escríbele a ' + esc(b.name) + '…"></textarea><button class="dbots-btn" data-send>➤</button></div></div>' +
        '<div class="dbots-pane" data-pane="mem"><div class="dbots-form" style="padding:0 12px 12px"><p style="margin:0;opacity:.8">Cosas que el bot recuerda siempre (una por línea). También las apunta él solo cuando le pides que recuerde algo.</p><textarea data-memtxt style="min-height:160px">' + esc((b.memory || []).join('\n')) + '</textarea><div><button class="dbots-btn" data-memsave>Guardar memoria</button></div></div></div>' +
        '<div class="dbots-pane" data-pane="tasks">' +
        '<div class="dbots-new"><input data-in placeholder="Nueva tarea, p. ej. «Busca noticias de Dogalandia»" maxlength="1000"><button class="dbots-btn" data-go>▶️ Hacer</button></div>' +
        '</div>' +
        '<div class="dbots-pane" data-pane="term"><div class="term-wrap"><div class="term-out"></div><div class="term-in-row"><span class="term-prompt">' + esc(b.name.toLowerCase().replace(/\s+/g, '-')) + '@snake-os-lite:~$</span><input class="term-input" placeholder="help" autocomplete="off" spellcheck="false"></div></div></div>';
      main.querySelector('[data-pane="tasks"]').insertAdjacentHTML('beforeend', '<div style="display:flex;align-items:center;margin:0 12px 6px"><b style="flex:1">Tareas</b><button class="dbots-btn alt" data-clear>🧹 Borrar historial</button></div><div class="dbots-tasks"></div>');
      emo(main);
      var inp = main.querySelector('[data-in]');
      function go() { var v = inp.value.trim(); if (!v) return; inp.value = ''; addTask(b, 'tarea', v); }
      main.querySelector('[data-go]').onclick = go;
      inp.onkeydown = function (e) { if (e.key === 'Enter') go(); };
      main.querySelector('[data-edit]').onclick = function () { form(b); };
      main.querySelector('[data-del]').onclick = function () {
        if (!confirm('¿Borrar el bot «' + b.name + '»? Se cancelan sus tareas.')) return;
        api('/api/dbots/bots/' + encodeURIComponent(b.id), { method: 'DELETE' }).then(function () { S.sel = null; load(); }).catch(function (e) { alert(errMsg(e)); });
      };
      main.querySelector('[data-clear]').onclick = function () {
        api('/api/dbots/tasks?bot_id=' + encodeURIComponent(b.id), { method: 'DELETE' }).then(poll);
      };
      setupTerm(b);
      drawTasks();
      setupChat(b);
      main.querySelectorAll('[data-tab]').forEach(function (bt) { bt.onclick = function () { tab(bt.getAttribute('data-tab')); }; });
      main.querySelector('[data-memsave]').onclick = function () {
        var mem = main.querySelector('[data-memtxt]').value.split('\n').map(function (x) { return x.trim(); }).filter(Boolean);
        api('/api/dbots/bots/' + encodeURIComponent(b.id), { method: 'PUT', body: { memory: mem } }).then(function (r) {
          S.bots = S.bots.map(function (x) { return x.id === b.id ? r.bot : x; }); b.memory = r.bot.memory; alert('Memoria guardada 🧠');
        }).catch(function (e) { alert(errMsg(e)); });
      };
      tab(S.tab || 'chat');
    }
    function tab(n) {
      S.tab = n;
      main.classList.toggle('chatmode', n === 'chat' || n === 'term');
      main.querySelectorAll('[data-tab]').forEach(function (x) { x.classList.toggle('on', x.getAttribute('data-tab') === n); });
      main.querySelectorAll('[data-pane]').forEach(function (x) { x.classList.toggle('on', x.getAttribute('data-pane') === n); });
      if (n === 'chat') { var c = main.querySelector('.dbots-chat'); if (c) c.scrollTop = c.scrollHeight; var t = main.querySelector('[data-msg]'); if (t && !window.matchMedia('(pointer:coarse)').matches) t.focus(); }
    }
    function linkify(t) { return esc(t).replace(/https?:\/\/[^\s<)\]]+/g, function (u) { return '<a href="' + u + '" target="_blank" rel="noopener">' + u + '</a>'; }); }
    function fmtTime(at) { try { return new Date(at * 1000).toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' }); } catch (e) { return ''; } }
    function setupChat(b) {
      var box = main.querySelector('.dbots-chat'), ta = main.querySelector('[data-msg]'), btn = main.querySelector('[data-send]');
      S.chatBot = b.id; S.msgs = S.msgs || {}; S.sending = false;
      function paint() {
        var list = S.msgs[b.id] || [];
        var h = list.length ? '' : '<div style="opacity:.7;text-align:center;margin-top:20px">' + esc(b.avatar) + ' Hola, soy ' + esc(b.name) + '. Háblame con normalidad: puedo buscar en internet y hacer tareas en segundo plano.</div>';
        list.forEach(function (m) {
          var meta = fmtTime(m.at) + (m.search ? ' · 🔎 ' + esc(m.search) : '') + (m.task ? ' · 📋 tarea ' + esc(String(m.task).slice(-4)) : '') + (m.memory ? ' · 🧠 recordado' : '');
          h += '<div class="dbots-msg ' + (m.role === 'user' ? 'user' : 'bot') + '">' + linkify(m.text) + '<small>' + meta + '</small></div>';
        });
        if (S.sending) h += '<div class="dbots-msg bot dbots-typing"><span></span><span></span><span></span></div>';
        box.innerHTML = h; emo(box); box.scrollTop = box.scrollHeight;
      }
      function refresh() { return api('/api/dbots/chat/' + encodeURIComponent(b.id)).then(function (r) { S.msgs[b.id] = r.messages || []; if (S.chatBot === b.id && box.isConnected) paint(); }); }
      S.refreshChat = refresh;
      paint(); refresh().catch(function () {});
      function send() {
        var v = ta.value.trim(); if (!v || S.sending) return;
        if (!S.hasKey) { alert('Para hablar con tus bots necesitas tu clave de AskBox. Añádela en Ajustes → IA → Key de AskBox.'); return; }
        ta.value = ''; S.sending = true;
        (S.msgs[b.id] = S.msgs[b.id] || []).push({ role: 'user', text: v, at: Date.now() / 1000 }); paint();
        api('/api/dbots/chat/' + encodeURIComponent(b.id), { method: 'POST', body: { text: v } })
          .then(function () { S.sending = false; return refresh(); })
          .then(function () { poll(); })
          .catch(function (e) { S.sending = false; S.msgs[b.id].push({ role: 'bot', text: '❌ ' + errMsg(e), at: Date.now() / 1000 }); paint(); });
      }
      btn.onclick = send;
      ta.onkeydown = function (e) { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(); } };
    }
    function drawTasks() {
      var box = main.querySelector('.dbots-tasks'); if (!box) return;
      var list = botTasks(S.sel);
      if (!list.length) { box.innerHTML = '<div style="opacity:.7">Sin tareas todavía.</div>'; return; }
      box.innerHTML = list.map(function (t) {
        var live = t.status === 'en cola' || t.status === 'trabajando';
        return '<div class="dbots-task"><div class="row"><b title="' + esc(t.input) + '">' + (t.kind === 'buscar' ? '🔎 ' : '📝 ') + esc(t.input) + '</b><span>' + (ST[t.status] || esc(t.status)) + '</span>' +
          (live ? '<button class="dbots-btn red" data-cancel="' + esc(t.id) + '">Cancelar</button>' : '') + '</div>' +
          (t.result ? '<pre>' + esc(t.result) + '</pre>' : '') + '</div>';
      }).join('');
      emo(box);
      box.querySelectorAll('[data-cancel]').forEach(function (el) {
        el.onclick = function () { api('/api/dbots/tasks/' + el.getAttribute('data-cancel') + '/cancel', { method: 'POST' }).then(poll); };
      });
    }
    // ---- Terminal del bot (local; jamás se envía a la placa Arduino) ----
    var term = null;
    function line(txt, cls) { if (!term) return; var d = document.createElement('div'); d.className = 'term-line ' + (cls || ''); d.textContent = txt; term.out.appendChild(d); term.out.scrollTop = term.out.scrollHeight; }
    function setupTerm(b) {
      var wrap = main.querySelector('.term-wrap');
      term = { out: wrap.querySelector('.term-out'), inp: wrap.querySelector('.term-input'), bot: b, seen: {} };
      line('Snake OS Lite · terminal de ' + b.name + '. Escribe «help».', 'term-muted');
      syncLog();
      var hist = [], hi = 0;
      term.inp.onkeydown = function (e) {
        if (e.key === 'ArrowUp') { if (hi > 0) term.inp.value = hist[--hi]; e.preventDefault(); return; }
        if (e.key === 'ArrowDown') { term.inp.value = hi < hist.length - 1 ? hist[++hi] : ''; if (hi >= hist.length - 1) hi = hist.length; e.preventDefault(); return; }
        if (e.key !== 'Enter') return;
        var v = term.inp.value.trim(); term.inp.value = ''; if (!v) return; hist.push(v); hi = hist.length;
        line('$ ' + v, 'term-cmd'); cmd(b, v);
      };
    }
    function syncLog() {
      if (!term) return;
      botTasks(term.bot.id).slice().reverse().forEach(function (t) {
        var n = term.seen[t.id] || 0;
        (t.log || []).slice(n).forEach(function (l) { line('[' + t.id.slice(-4) + '] ' + l, /❌|Error|Falta|AskBox:/.test(l) ? 'term-err' : (/Hecho/.test(l) ? 'term-ok' : '')); });
        term.seen[t.id] = (t.log || []).length;
      });
    }
    function cmd(b, v) {
      var p = v.split(/\s+/), c = p[0].toLowerCase(), rest = v.slice(p[0].length).trim();
      if (c === 'help' || c === 'ayuda') {
        ['help            esta ayuda', 'tarea <texto>   el bot hace una tarea (busca y resume con AskBox)', 'buscar <texto>  búsqueda directa en internet + resumen',
          'ps | estado     tareas en cola y trabajando', 'cancelar <id>   cancela una tarea (id de 4 letras de ps)', 'historial       últimas tareas terminadas',
          'cat <id>        muestra el resultado de una tarea', 'rol             muestra la función del bot', 'whoami          nombre y estilo del bot', 'clear           limpia la terminal'].forEach(function (s) { line(s, 'term-muted'); });
      } else if (c === 'clear' || c === 'limpiar') { term.out.innerHTML = '';
      } else if (c === 'tarea' || c === 'run' || c === 'buscar' || c === 'search') {
        if (!rest) return line('Uso: ' + c + ' <texto>', 'term-err');
        addTask(b, (c === 'buscar' || c === 'search') ? 'buscar' : 'tarea', rest);
      } else if (c === 'ps' || c === 'estado') {
        var a = botTasks(b.id).filter(function (t) { return t.status === 'en cola' || t.status === 'trabajando'; });
        if (!a.length) line('Nada en marcha.', 'term-muted');
        a.forEach(function (t) { line(t.id.slice(-4) + '  ' + t.status + '  ' + t.input.slice(0, 60)); });
      } else if (c === 'historial' || c === 'history') {
        botTasks(b.id).slice(0, 10).forEach(function (t) { line(t.id.slice(-4) + '  ' + t.status + '  ' + t.input.slice(0, 60)); });
      } else if (c === 'cancelar' || c === 'kill') {
        var t = botTasks(b.id).find(function (x) { return rest && x.id.slice(-rest.length) === rest; });
        if (!t) return line('No encuentro esa tarea.', 'term-err');
        api('/api/dbots/tasks/' + t.id + '/cancel', { method: 'POST' }).then(function () { line('Cancelando ' + rest + '…', 'term-ok'); poll(); });
      } else if (c === 'cat') {
        var r = botTasks(b.id).find(function (x) { return rest && x.id.slice(-rest.length) === rest; });
        if (!r) return line('No encuentro esa tarea.', 'term-err');
        line(r.result || '(sin resultado todavía)');
      } else if (c === 'rol') { line(b.role || 'Sin función (asistente general)');
      } else if (c === 'whoami') { line(b.avatar + ' ' + b.name + ' · estilo ' + th(b)[0]);
      } else { line('Comando no encontrado: ' + c + ' (prueba «help» o escribe «tarea …»)', 'term-err'); }
    }
    function addTask(b, kind, text) {
      api('/api/dbots/tasks', { method: 'POST', body: { bot_id: b.id, kind: kind, input: text } })
        .then(function (r) { line('Tarea ' + r.id.slice(-4) + ' en cola ⏳', 'term-ok'); poll(); })
        .catch(function (e) { line(errMsg(e), 'term-err'); if (!term) alert(errMsg(e)); });
    }
    // ---- Formulario crear/editar ----
    function form(b) {
      var used = {}; S.bots.forEach(function (x) { if (!b || x.id !== b.id) used[x.theme] = 1; });
      var theme = b ? b.theme : (Object.keys(THEMES).find(function (k) { return !used[k]; }) || 'selva');
      var av = b ? b.avatar : AVATARS[S.bots.length % AVATARS.length];
      main.innerHTML = '<div class="dbots-form"><h2 style="margin:0">' + (b ? '✏️ Editar bot' : '➕ Nuevo bot') + '</h2>' +
        '<label>Nombre</label><input data-n maxlength="40" value="' + esc(b ? b.name : '') + '" placeholder="Bot Noticias">' +
        '<label>Función</label><textarea data-r maxlength="600" placeholder="Busca noticias de Dogalandia">' + esc(b ? b.role : '') + '</textarea>' +
        '<label>Avatar</label><div class="dbots-pick" data-av>' + AVATARS.map(function (a) { return '<span data-v="' + a + '"' + (a === av ? ' class="on"' : '') + '>' + a + '</span>'; }).join('') + '</div>' +
        '<label>Estilo</label><div class="dbots-pick" data-th>' + Object.keys(THEMES).map(function (k) { var t = THEMES[k]; return '<span data-v="' + k + '" style="background:' + t[1] + ';color:' + t[2] + '"' + (k === theme ? ' class="on"' : '') + '>● ' + t[0] + (used[k] ? ' (en uso)' : '') + '</span>'; }).join('') + '</div>' +
        '<div style="display:flex;gap:8px"><button class="dbots-btn" data-save>Guardar</button><button class="dbots-btn alt" data-cancel>Cancelar</button></div></div>';
      emo(main);
      function pick(sel, set) { main.querySelectorAll(sel + ' span').forEach(function (s) { s.onclick = function () { main.querySelectorAll(sel + ' span').forEach(function (o) { o.classList.remove('on'); }); s.classList.add('on'); set(s.getAttribute('data-v')); }; }); }
      pick('[data-av]', function (v) { av = v; }); pick('[data-th]', function (v) { theme = v; });
      main.querySelector('[data-cancel]').onclick = drawMain;
      main.querySelector('[data-save]').onclick = function () {
        var payload = { name: main.querySelector('[data-n]').value.trim(), role: main.querySelector('[data-r]').value.trim(), avatar: av, theme: theme };
        if (!payload.name) return alert('Ponle un nombre al bot');
        api(b ? '/api/dbots/bots/' + encodeURIComponent(b.id) : '/api/dbots/bots', { method: b ? 'PUT' : 'POST', body: payload })
          .then(function (r) { S.sel = r.bot.id; load(); }).catch(function (e) { alert(errMsg(e)); });
      };
    }
    load();
  }

  function install() {
    var apps = window.APPS; if (!apps) return false;
    if (!apps.dbots) apps.dbots = { title: 'Doganiero Bots', icon: '🤖', width: 780, height: 600, render: render };
    try {
      if (document.querySelector('#iconLayer .desktop-icon') && typeof buildIcons === 'function') buildIcons();
      if (typeof buildStartMenu === 'function' && document.querySelector('#startMenu .start-item')) buildStartMenu();
    } catch (e) {}
    return true;
  }
  if (!install()) { var n = 0, iv = setInterval(function () { if (install() || ++n > 200) clearInterval(iv); }, 50); }
})();
