/* Snake OS · barra lateral de apps abiertas (2026-10-17)
   Como el dock del modo trabajo, pero con las ventanas abiertas: icono y nombre, la activa resaltada,
   clic para enfocar (o restaurar si está minimizada), ✕ para cerrar. Se actualiza sola al abrir/cerrar.
   - Las ventanas (también las maximizadas) y los iconos del escritorio se desplazan para no quedar debajo.
   - Ajustes › Escritorio: mostrar/ocultar y lado (izquierda/derecha). Por perfil. Por defecto visible a la izquierda.
   - Botón « para plegarla a solo iconos; en pantallas estrechas se pliega sola; en modo teléfono no aparece.
   - Solo lista ventanas ya abiertas (no abre apps nuevas), así que respeta Snake OS Kids. */
(function () {
  'use strict';
  var W_FULL = 208, W_MINI = 60, GAP = 10, NARROW = 1100;
  function $(id) { return document.getElementById(id); }
  function esc(t) { return String(t == null ? '' : t).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); }
  function tr(s) { try { return window.snakeI18n && window.snakeI18n.t ? window.snakeI18n.t(s) : s; } catch (e) { return s; } }
  function T(es, en) { try { return window.snakeI18n && window.snakeI18n.lang === 'en' ? en : es; } catch (e) { return es; } }
  function email() { var u = window.currentUser; return (u && u.email) || ''; }
  function key() { return 'snkSidebar:' + (email() || 'anon'); }
  function prefs() {
    var p = {}; try { p = JSON.parse(localStorage.getItem(key()) || '{}') || {}; } catch (e) {}
    return { on: p.on !== false, side: p.side === 'right' ? 'right' : 'left', mini: !!p.mini };
  }
  function save(p) { try { localStorage.setItem(key(), JSON.stringify(p)); } catch (e) {} schedule(); }

  var css = [
    '#snkSide{position:fixed;top:' + GAP + 'px;bottom:76px;width:' + W_FULL + 'px;z-index:900;display:none;flex-direction:column;gap:4px;padding:10px 8px;box-sizing:border-box;border-radius:20px;',
    ' color:#f4fff8;background:linear-gradient(160deg,rgba(255,255,255,0.20),rgba(255,255,255,0.06) 45%,rgba(120,255,180,0.08)),rgba(12,40,26,0.62);',
    ' border:1px solid rgba(255,255,255,0.32);box-shadow:0 14px 40px rgba(0,0,0,0.28),inset 0 1px 0 rgba(255,255,255,0.4);backdrop-filter:blur(22px) saturate(170%);-webkit-backdrop-filter:blur(22px) saturate(170%);font-size:13px;user-select:none}',
    'body.snk-side-on:not(.phone-mode) #snkSide{display:flex}',
    'body.snk-side-left #snkSide{left:' + GAP + 'px}body.snk-side-right #snkSide{right:' + GAP + 'px}',
    'body.snk-side-mini #snkSide{width:' + W_MINI + 'px;padding:10px 6px}',
    '#snkSide .sd-h{display:flex;align-items:center;justify-content:space-between;gap:6px;padding:0 4px 6px;margin-bottom:2px;border-bottom:1px solid rgba(255,255,255,0.18);font-weight:800;font-size:12px;letter-spacing:.2px;opacity:.95}',
    '#snkSide .sd-h span{white-space:nowrap;overflow:hidden;text-overflow:ellipsis}',
    'body.snk-side-mini #snkSide .sd-h{justify-content:center;padding:0 0 6px}body.snk-side-mini #snkSide .sd-h span{display:none}',
    '#snkSide .sd-fold{margin:0;width:26px;height:26px;min-height:0;min-width:0;padding:0;flex:0 0 26px;border-radius:8px;border:0;background:rgba(255,255,255,0.12);color:inherit;cursor:pointer;box-shadow:none;font:700 14px/26px system-ui,sans-serif}',
    '#snkSide .sd-fold:hover{background:rgba(255,255,255,0.26)}',
    '#snkSide .sd-list{flex:1;min-height:0;overflow-y:auto;overflow-x:hidden;display:flex;flex-direction:column;gap:3px;scrollbar-width:thin}',
    '#snkSide .sd-it{position:relative;display:flex;align-items:center;gap:8px;margin:0;width:100%;min-height:40px;padding:5px 30px 5px 6px;box-sizing:border-box;border-radius:12px;border:1px solid transparent;background:transparent;color:inherit;cursor:pointer;text-align:left;box-shadow:none;font:inherit;font-weight:600}',
    '#snkSide .sd-it:hover{background:rgba(255,255,255,0.14)}',
    '#snkSide .sd-it.on{background:rgba(52,209,122,0.30);border-color:rgba(140,255,190,0.65);box-shadow:inset 3px 0 0 #34d17a}',
    'body.snk-side-right #snkSide .sd-it.on{box-shadow:inset -3px 0 0 #34d17a}',
    '#snkSide .sd-it.min .sd-lab{opacity:.62;font-style:italic}#snkSide .sd-it.min .sd-ico{opacity:.6}',
    '#snkSide .sd-it.away .sd-lab::after{content:attr(data-vd);margin-left:6px;font-size:10px;font-style:normal;font-weight:800;padding:1px 5px;border-radius:6px;background:rgba(255,255,255,0.2)}',
    '#snkSide .sd-ico{flex:0 0 28px;width:28px;height:28px;display:flex;align-items:center;justify-content:center;font-size:20px;line-height:1;overflow:hidden}',
    '#snkSide .sd-ico img{width:26px;height:26px;object-fit:contain;border-radius:7px}',
    '#snkSide .sd-lab{flex:1;min-width:0;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;text-shadow:0 1px 2px rgba(0,0,0,0.3)}',
    '#snkSide .sd-x{position:absolute;right:4px;top:50%;margin:-11px 0 0;width:22px;height:22px;min-height:0;min-width:0;padding:0;border-radius:50%;border:0;background:transparent;color:inherit;cursor:pointer;opacity:.0;box-shadow:none;font:700 12px/22px system-ui,sans-serif}',
    '#snkSide .sd-it:hover .sd-x,#snkSide .sd-it.on .sd-x,#snkSide .sd-x:focus-visible{opacity:.85}',
    '#snkSide .sd-x:hover{opacity:1;background:#ff5f57;color:#fff}',
    'body.snk-side-mini #snkSide .sd-it{justify-content:center;padding:5px 0}body.snk-side-mini #snkSide .sd-lab{display:none}',
    'body.snk-side-mini #snkSide .sd-x{right:-2px;top:2px;margin:0;width:16px;height:16px;font-size:9px;line-height:16px}',
    '#snkSide .sd-empty{padding:10px 6px;opacity:.7;font-size:12px;text-align:center}',
    /* desplazar ventanas e iconos */
    'body.snk-side-on.snk-side-left:not(.phone-mode) #windows{left:var(--snk-side-w)}',
    'body.snk-side-on.snk-side-right:not(.phone-mode) #windows{right:var(--snk-side-w)}',
    'body.snk-side-on.snk-side-left:not(.phone-mode) #iconLayer{left:var(--snk-side-w) !important}',
    'body.snk-side-on.snk-side-right:not(.phone-mode) #iconLayer{right:var(--snk-side-w) !important}',
    /* tema claro */
    'body.theme-light #snkSide{color:#0d3a22;background:linear-gradient(160deg,rgba(255,255,255,0.72),rgba(255,255,255,0.45) 50%,rgba(200,255,225,0.40)),rgba(255,255,255,0.35);border-color:rgba(0,0,0,0.10);box-shadow:0 14px 40px rgba(0,0,0,0.16),inset 0 1px 0 #fff}',
    'body.theme-light #snkSide .sd-h{border-bottom-color:rgba(0,0,0,0.10)}',
    'body.theme-light #snkSide .sd-lab{text-shadow:none}',
    'body.theme-light #snkSide .sd-it:hover{background:rgba(0,0,0,0.06)}',
    'body.theme-light #snkSide .sd-it.on{background:rgba(18,165,86,0.16);border-color:rgba(18,165,86,0.55)}',
    'body.theme-light #snkSide .sd-fold{background:rgba(0,0,0,0.06)}body.theme-light #snkSide .sd-fold:hover{background:rgba(0,0,0,0.12)}',
    /* modo trabajo: grises sólidos, sin desenfoque */
    'body.osx-work #snkSide{background:#1b1c20;border-color:#2c2d33;color:#e8e8ea;box-shadow:0 2px 10px rgba(0,0,0,0.45);backdrop-filter:none;-webkit-backdrop-filter:none}',
    'body.osx-work.theme-light #snkSide{background:#ececee;border-color:#d0d0d4;color:#1d1d20}',
    'body.osx-work #snkSide .sd-it.on{background:rgba(255,255,255,0.12);border-color:rgba(255,255,255,0.30);box-shadow:inset 3px 0 0 #9aa0a6}',
    'body.osx-work.theme-light #snkSide .sd-it.on{background:rgba(0,0,0,0.08);border-color:rgba(0,0,0,0.22)}',
    'body.osx-work #snkSide .sd-lab{text-shadow:none}',
    /* Kids */
    'body.osx-kids #snkSide{border:2px solid #fff;background:linear-gradient(180deg,rgba(255,154,158,0.55),rgba(254,207,106,0.5),rgba(126,232,162,0.5),rgba(116,192,252,0.5),rgba(195,166,255,0.55));color:#26214a}',
    'body.osx-kids #snkSide .sd-lab{text-shadow:0 1px 0 rgba(255,255,255,0.7);font-weight:800}',
    'body.osx-kids #snkSide .sd-it.on{background:rgba(255,255,255,0.65);border-color:#fff;box-shadow:none}',
    /* alto contraste */
    'body.snk-hc #snkSide{background:#000 !important;color:#fff !important;border:2px solid #fff !important}body.snk-hc #snkSide .sd-it.on{background:#ffd400 !important;color:#000 !important}'
  ].join('\n');

  var bar, list, raf = 0, last = '';
  function build() {
    if (bar || !document.body) return;
    var st = document.createElement('style'); st.id = 'snkSideCss'; st.textContent = css; document.head.appendChild(st);
    bar = document.createElement('nav'); bar.id = 'snkSide'; bar.setAttribute('aria-label', T('Apps abiertas', 'Open apps'));
    bar.innerHTML = '<div class="sd-h"><span data-t></span><button type="button" class="sd-fold" data-fold></button></div><div class="sd-list" role="list"></div>';
    list = bar.querySelector('.sd-list');
    (($('desktop')) || document.body).appendChild(bar);
    bar.addEventListener('click', function (e) {
      if (e.target.closest('[data-fold]')) { var p = prefs(); p.mini = !p.mini; save(p); return; }
      var it = e.target.closest('.sd-it'); if (!it) return;
      var id = it.dataset.app;
      if (e.target.closest('.sd-x')) { e.stopPropagation(); close(id); return; }
      focus(id);
    });
    bar.addEventListener('auxclick', function (e) { var it = e.target.closest('.sd-it'); if (it && e.button === 1) { e.preventDefault(); close(it.dataset.app); } });
    var wo = new MutationObserver(schedule);
    function watchWins() { wins().forEach(function (w) { if (!w._snkSide) { w._snkSide = 1; wo.observe(w, { attributes: true, attributeFilter: ['class', 'style', 'data-snkvd'] }); } }); }
    var mo = new MutationObserver(function () { watchWins(); schedule(); });
    var wl = $('windows'); if (wl) { mo.observe(wl, { childList: true }); watchWins(); }
    var ti = $('taskItems'); if (ti) mo.observe(ti, { childList: true, subtree: true, characterData: true });
    new MutationObserver(schedule).observe(document.body, { attributes: true, attributeFilter: ['class'] });
    window.addEventListener('resize', schedule);
    setInterval(function () { if (email() !== build._em) { build._em = email(); schedule(); } }, 1500);
  }
  function wins() {
    return Array.prototype.slice.call(document.querySelectorAll('#windows > .app-window')).filter(function (w) { return w.id && !w.classList.contains('win-closing'); });
  }
  function curVd() { var b = document.querySelector('#snkVd button.cur'); return b ? +b.dataset.vd : 0; }
  function info(w) {
    var id = w.id.replace(/^win-/, ''), a = (window.APPS || {})[id], icon = '', title = '';
    if (a) {
      title = tr(a.title || id);
      icon = a.iconImg ? '<img src="' + esc(a.iconImg) + '" alt="" draggable="false">' : esc(a.icon || '');
    }
    if (!title || !icon) {
      var t = w.querySelector('.win-title');
      if (t) {
        var img = t.querySelector('img'), txt = (t.textContent || '').trim();
        if (!icon) { if (img) icon = '<img src="' + esc(img.getAttribute('src')) + '" alt="" draggable="false">'; else { var m = txt.match(/^(\S+)\s+/); if (m && !/[A-Za-z0-9]/.test(m[1])) icon = esc(m[1]); } }
        if (!title) title = img ? txt : txt.replace(/^(\S+)\s+/, function (all, f) { return /[A-Za-z0-9]/.test(f) ? all : ''; });
      }
    }
    return { id: id, title: title || id, icon: icon || '🪟' };
  }
  function schedule() { if (!raf) raf = requestAnimationFrame(paint); }
  function paint() {
    raf = 0; if (!bar) return;
    var p = prefs(), body = document.body, logged = !!email() && !($('desktop') && $('desktop').classList.contains('hidden'));
    var ws = logged ? wins() : [], phone = body.classList.contains('phone-mode');
    var on = p.on && logged && ws.length > 0 && !phone;
    var mini = p.mini || window.innerWidth < NARROW;
    body.classList.toggle('snk-side-on', on);
    body.classList.toggle('snk-side-left', p.side === 'left');
    body.classList.toggle('snk-side-right', p.side === 'right');
    body.classList.toggle('snk-side-mini', mini);
    body.style.setProperty('--snk-side-w', ((mini ? W_MINI : W_FULL) + GAP * 2 - 4) + 'px');
    if (!on) { if (last) { list.innerHTML = ''; last = ''; } return; }
    var top = null, z = -1, vd = curVd();
    ws.forEach(function (w) {
      if (w.classList.contains('minimized') || w.classList.contains('snk-vd-off')) return;
      var zi = parseInt(w.style.zIndex, 10) || 0; if (zi >= z) { z = zi; top = w; }
    });
    var foldTxt = (p.side === 'left') === !mini ? '«' : '»';
    var html = ws.map(function (w) {
      var i = info(w), wvd = parseInt(w.getAttribute('data-snkvd'), 10) || 0;
      var cls = 'sd-it' + (w === top ? ' on' : '') + (w.classList.contains('minimized') ? ' min' : '') + (vd && wvd && wvd !== vd ? ' away' : '');
      var tip = i.title + (w.classList.contains('minimized') ? T(' · minimizada', ' · minimized') : '') + (vd && wvd && wvd !== vd ? T(' · escritorio ', ' · desktop ') + wvd : '');
      return '<div class="' + cls + '" role="listitem" tabindex="0" data-app="' + esc(i.id) + '" data-vd="' + (wvd || '') + '" title="' + esc(tip) + '" aria-current="' + (w === top ? 'true' : 'false') + '">' +
        '<span class="sd-ico">' + i.icon + '</span><span class="sd-lab">' + esc(i.title) + '</span>' +
        '<button type="button" class="sd-x" title="' + esc(T('Cerrar ', 'Close ') + i.title) + '" aria-label="' + esc(T('Cerrar ', 'Close ') + i.title) + '">✕</button></div>';
    }).join('');
    var sig = html + '|' + foldTxt + mini;
    if (sig === last) return;
    last = sig;
    bar.querySelector('[data-t]').textContent = T('Apps abiertas', 'Open apps') + ' · ' + ws.length;
    var fb = bar.querySelector('[data-fold]'); fb.textContent = foldTxt;
    fb.title = mini ? T('Mostrar nombres', 'Show names') : T('Plegar a solo iconos', 'Collapse to icons');
    list.innerHTML = html;
    try { if (window.snakeEmoji && window.snakeEmoji.scan) window.snakeEmoji.scan(list); } catch (e) {}
  }
  function focus(id) {
    var api = window.snkWin;
    if (api && api.focus) { api.focus(id); schedule(); return; }
    var w = $('win-' + id); if (!w) return;
    if (w.classList.contains('minimized') && window.restoreApp) window.restoreApp(id);
    else w.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true }));
    schedule();
  }
  function close(id) {
    if (window.snkWin && window.snkWin.close) window.snkWin.close(id);
    else { var b = document.querySelector('#win-' + CSS.escape(id) + ' .win-btn.close'); if (b) b.click(); }
    schedule();
  }
  document.addEventListener('keydown', function (e) {
    if ((e.key === 'Enter' || e.key === ' ') && e.target && e.target.classList && e.target.classList.contains('sd-it')) { e.preventDefault(); focus(e.target.dataset.app); }
  });
  window.snkSidebar = {
    get: function () { return prefs(); },
    setOn: function (v) { var p = prefs(); p.on = !!v; save(p); },
    setSide: function (s) { var p = prefs(); p.side = s === 'right' ? 'right' : 'left'; save(p); },
    toggleSide: function () { var p = prefs(); p.side = p.side === 'right' ? 'left' : 'right'; save(p); return p.side; },
    refresh: schedule
  };
  function start() { build(); schedule(); }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start); else start();
})();
