/* Snake OS VP · Doganiero Bots (2026-10-14). Bots por perfil con tareas en paralelo,
   terminal estilo Snake OS Lite (local) y búsqueda con AskBox. */
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
    '.dbots-row{display:flex;gap:6px;align-items:flex-end;align-self:flex-start;max-width:90%}.dbots-row .dbots-msg{max-width:100%}.dbots-row .dbots-fig{flex-shrink:0}' +
    '.dbots-fig{display:block;filter:drop-shadow(0 2px 2px rgba(0,0,0,.35))}.dbots-bot .av,.dbots-head .av{display:flex;line-height:0}.dbots-figs span{padding:2px 4px}' +
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
    '.dbots-main.chatmode{overflow:hidden}.dbots-main.chatmode .dbots-pane.on{flex:1}' +
    /* Composer SIEMPRE visible: la ventana da altura fija, el chat hace scroll y la caja de escribir queda abajo */
    '.app-window .win-body:has(> .dbots){padding:0 !important;overflow:hidden !important;display:flex !important;flex-direction:column !important}' +
    '.dbots{flex:1 1 auto;height:100%;min-height:0;overflow:hidden}' +
    '.dbots-main{min-height:0}.dbots-main.chatmode .dbots-head,.dbots-main.chatmode .dbots-role,.dbots-main.chatmode .dbots-warn,.dbots-main.chatmode .dbots-tabs{flex-shrink:0}' +
    '.dbots-main.chatmode .dbots-role{max-height:3.2em;overflow:hidden;flex-shrink:1 !important;min-height:0}.dbots-main.chatmode .dbots-warn{flex-shrink:1 !important;min-height:0;overflow:hidden}' +
    '.dbots-main.chatmode .dbots-pane.on{flex:1 1 0;min-height:0;overflow:hidden}' +
    '.dbots-chat{flex:1 1 0 !important;min-height:24px !important}' +
    '.dbots-chatin{flex-shrink:0;display:flex !important;align-items:stretch;background:rgba(0,0,0,.25);padding:6px;border-radius:12px}' +
    '.dbots .dbots-chatin textarea{display:block !important;visibility:visible !important;width:auto !important;flex:1 1 auto;min-width:0;height:44px !important;min-height:44px;max-height:120px}' +
    '.dbots .dbots-chatin button{flex:0 0 auto;width:auto !important;min-width:74px}' +
    '.dbots .term-wrap{flex:1 1 0;height:auto;min-height:120px}' +
    '.dbots-main.chatmode{container-type:size;container-name:dbmain}' +
    '@container dbmain (max-height:470px){.dbots-role,.dbots-warn{display:none !important}.dbots-head{padding:4px 10px !important}.dbots-head .av svg{width:28px;height:28px}.dbots-tabs{margin-bottom:4px !important}.dbots-chatin{margin:4px 8px 6px !important}}' +
    /* Botones compactos: anula la regla global de Snake OS que los pone al 100% de ancho */
    '.dbots button{width:auto !important;max-width:100%;display:inline-flex !important;align-items:center;justify-content:center;gap:4px;flex:0 0 auto;padding:6px 11px !important;min-height:0 !important;height:auto !important;line-height:1.2;white-space:nowrap;box-sizing:border-box}' +
    '.dbots-tabs button{padding:6px 10px !important}.dbots-head .dbots-btn{padding:5px 10px !important}' +
    '.dbots-task .row .dbots-btn{padding:3px 8px !important;font-size:.8rem}' +
    '@media (max-width:640px){.dbots-main.chatmode .dbots-head{padding:8px}.dbots-main.chatmode .dbots-head .av{font-size:1.4rem}.dbots-main.chatmode .dbots-role{display:none}.dbots-side{max-height:64px}}';
  document.head.appendChild(css);

  /* ===== Diseño según plantilla «bots_creados» (2026-10-14): 3 columnas, blanco + panel degradado ===== */
  var css2 = document.createElement('style');
  css2.textContent = [
    '.dbots.dbx{background:#fff;color:#111;font-family:"Open Sans","Segoe UI",ui-sans-serif,system-ui,sans-serif;font-size:.92rem}',
    '.dbx .dbots-side{width:240px;background:#fff;border-right:1px solid #9a9a9a;padding:10px 0 10px;position:relative}',
    '.dbx .dbots-side h3{margin:14px 16px 10px;font-size:1.35rem;font-weight:800;color:#111;padding-right:64px}',
    '.dbx-star{display:inline-grid;place-items:center;position:relative;flex-shrink:0}',
    '.dbx-star>svg.st{position:absolute;inset:0;width:100%;height:100%}',
    '.dbx-star>.in{position:relative;display:grid;place-items:center;line-height:0}',
    '.dbx .dbx-new{position:absolute;top:8px;right:10px;width:58px;height:58px;background:none !important;border:0 !important;padding:0 !important;cursor:pointer;color:#111;font-size:2rem;font-weight:300}',
    '.dbx .dbots-bot{background:#fff !important;border:1.5px solid #cfcfcf;border-radius:22px;margin:6px 12px;padding:8px 12px;color:#111}',
    '.dbx .dbots-bot b{font-weight:700}.dbx .dbots-bot small{color:#666;opacity:1}',
    '.dbx .dbots-bot.on{border-color:#111;box-shadow:0 0 0 1px #111}',
    '.dbx .dbots-bot:hover{border-color:#777}',
    '.dbx .dbots-main{background:#fff;color:#111;position:relative}',
    '.dbx .dbots-head{background:none !important;justify-content:center;padding:8px 12px !important;gap:12px}',
    '.dbx .dbots-head h2{flex:0 1 auto !important;font-size:1.4rem;font-weight:500;color:#111}',
    '.dbx .dbots-head .dbx-hbtn{position:absolute;right:10px;top:12px;display:flex;gap:6px}',
    '.dbx .dbots-role,.dbx .dbots-tabs{display:none !important}',
    '.dbx .dbots-warn{background:#fff7e0;color:#5a4300;border:1px solid #f1d27a;border-radius:16px}',
    '.dbx .dbots-chat{padding:8px 4px;gap:14px}',
    '.dbx .dbots-msg{border-radius:28px;padding:14px 22px;max-width:72%;font-size:.95rem;line-height:1.45}',
    '.dbx .dbots-msg.bot{background:#000 !important;color:#fff;border:0 !important}',
    '.dbx .dbots-msg.user{background:#fff !important;color:#111;border:1px solid #777;align-self:flex-end}',
    '.dbx .dbots-msg small{color:inherit;opacity:.55}.dbx .dbots-msg.bot a{color:#7fd1ff}.dbx .dbots-msg.user a{color:#2457d6}',
    '.dbx .dbots-row{max-width:80%}.dbx .dbots-row .dbots-msg{max-width:100%}',
    '.dbx .dbots-typing span{background:#fff}' +
    '.dbots-fig .dbf-face *{transform-box:fill-box;transform-origin:center}.dbots-fig .dbf-q,.dbots-fig .dbf-ex{opacity:0}' +
    '.dbots-fig .dbf-body{transform-box:fill-box;transform-origin:50% 100%}' +
    '.dbots-fig.dbf-think{/* tamaño normal al pensar — sin agrandar */}.dbf-think .dbf-eyes{animation:dbfLook 7s ease-in-out infinite}.dbf-think .dbf-el{animation:dbfL 7s ease-in-out infinite}.dbf-think .dbf-er{animation:dbfR 7s ease-in-out infinite}' +
    '.dbf-think .dbf-q{animation:dbfQ 7s ease-in-out infinite}.dbf-think .dbf-ex{animation:dbfEx 7s ease-in-out infinite}.dbf-think .dbf-body{animation:dbfBob 2s ease-in-out infinite}' +
    '.dbf-happy .dbf-body{animation:dbfJump .6s ease-out 2}.dbf-happy .dbf-ex{opacity:1}.dbf-happy .dbf-el,.dbf-happy .dbf-er{transform:scale(1.25,1.3)}' +
    /* 0-25 mira a los lados · 28-32 parpadeo · 40-46 guiño · 52-70 ojos entornados (concentrado) · 78-88 ojos muy abiertos (sorpresa) */
    '@keyframes dbfLook{0%,6%{transform:translate(0,0)}10%,16%{transform:translate(-2px,0)}20%,25%{transform:translate(2px,-.5px)}28%,100%{transform:translate(0,0)}}' +
    '@keyframes dbfL{0%,28%{transform:scale(1)}30%{transform:scaleY(.12)}32%,40%{transform:scale(1)}43%{transform:scaleY(.12)}46%,52%{transform:scale(1)}56%,70%{transform:scaleY(.45)}74%,78%{transform:scale(1)}82%,88%{transform:scale(1.25,1.3)}92%,100%{transform:scale(1)}}' +
    '@keyframes dbfR{0%,28%{transform:scale(1)}30%{transform:scaleY(.12)}32%,52%{transform:scale(1)}56%,70%{transform:scaleY(.45)}74%,78%{transform:scale(1)}82%,88%{transform:scale(1.25,1.3)}92%,100%{transform:scale(1)}}' +
    '@keyframes dbfQ{0%,4%{opacity:0}8%,48%{opacity:1}52%,100%{opacity:0}}' +
    '@keyframes dbfEx{0%,78%{opacity:0}82%,88%{opacity:1}92%,100%{opacity:0}}' +
    '@keyframes dbfBob{0%,100%{transform:translateY(0)}50%{transform:translateY(-1.5px)}}' +
    '@keyframes dbfJump{0%,100%{transform:translateY(0) scale(1)}40%{transform:translateY(-4px) scale(1.04,.97)}}' +
    '@media (prefers-reduced-motion:reduce){.dbots-fig *{animation:none !important}.dbf-think .dbf-q{opacity:1}}',
    '.dbx .dbots-chatin{background:#fff !important;border:1px solid #333;border-radius:999px;padding:6px 8px !important;margin:6px 12px 10px !important;align-items:center !important;gap:8px;position:relative}',
    '.dbx .dbots .dbots-chatin textarea,.dbx .dbots-chatin textarea{background:transparent !important;border:0 !important;color:#111 !important;text-align:center;font-size:1.05rem;height:38px !important;min-height:38px !important;padding:8px 4px !important;outline:none;box-shadow:none !important}',
    '.dbx .dbots-chatin textarea::placeholder{color:#222;opacity:.85}',
    '.dbx .dbx-plus{width:34px !important;height:34px !important;min-width:34px !important;padding:0 !important;border-radius:50% !important;border:0 !important;background:linear-gradient(135deg,#2bd4e6,#2a4bd8) !important;color:#111 !important;font-size:1.3rem !important;cursor:pointer}',
    '.dbx .dbx-send{width:40px !important;min-width:40px !important;height:38px !important;padding:0 !important;background:none !important;border:0 !important;cursor:pointer}',
    '.dbx-menu{position:absolute;left:8px;bottom:52px;background:#fff;border:1px solid #333;border-radius:18px;padding:6px;display:none;flex-direction:column;gap:2px;z-index:5;box-shadow:0 8px 24px rgba(0,0,0,.18)}',
    '.dbx-menu.open{display:flex}.dbx .dbx-menu button{background:none !important;color:#111 !important;border:0 !important;justify-content:flex-start !important;padding:7px 12px !important;border-radius:12px !important;cursor:pointer}',
    '.dbx .dbx-menu button:hover{background:#f0f0f0 !important}',
    '.dbx .dbots-aside{width:340px;flex-shrink:0;background:linear-gradient(135deg,#8b3dff 0%,#6c7cf5 50%,#48d6e8 100%);color:#111;display:flex;flex-direction:column;align-items:center;padding:16px 12px;gap:10px;overflow:auto;min-height:0}',
    '.dbx .dbots-aside .dbx-avname{font-weight:800;font-size:1.25rem;text-align:center}',
    '.dbx .dbots-aside .dbx-role{font-size:.8rem;text-align:center;opacity:.85;max-height:4.2em;overflow:hidden}',
    '.dbx .dbots-aside .term-wrap{width:100%;flex:1 1 auto;min-height:160px;margin:0 !important;background:#000 !important;border:0 !important;border-radius:26px !important;color:#e8e8e8}',
    '.dbx .dbots-aside .term-out{padding:12px 14px 4px;font-size:.74rem}.dbx .dbots-aside .term-in-row{background:transparent;border-top:1px solid #222;font-size:.74rem;padding:6px 12px 10px}',
    '.dbx .dbots-aside .term-prompt{color:#fff}.dbx .dbots-aside .term-input{color:#fff}',
    '.dbx .dbots-pane[data-pane="tasks"],.dbx .dbots-pane[data-pane="mem"]{padding-top:4px}',
    '.dbx .dbx-back{margin:0 12px 8px;align-self:flex-start}',
    '.dbx .dbots-btn{background:#111;color:#fff;border-radius:999px}.dbx .dbots-btn.alt{background:#fff;color:#111;border:1px solid #777}.dbx .dbots-btn.red{background:#fff;color:#b3261e;border:1px solid #b3261e}',
    '.dbx input,.dbx textarea,.dbx select{background:#fff;color:#111;border:1px solid #888;border-radius:14px}',
    '.dbx .dbots-task{background:#fafafa;border:1px solid #ddd;border-left:4px solid #111;border-radius:16px;color:#111}',
    '.dbx .dbots-form label{font-weight:700}.dbx .dbots-pick span{background:#f4f4f4}.dbx .dbots-pick span.on{border-color:#111}',
    '.dbx .dbots-empty{color:#111}',
    '.dbx .dbots-main input::placeholder,.dbx .dbots-main textarea::placeholder{color:#777 !important;opacity:1}',
    '.dbx .dbots-aside .mos .term-wrap{border-radius:0 !important;min-height:0 !important;flex:1 1 auto;margin:0 !important}.dbx .dbots-aside .dbx-mini{display:flex;align-items:center;gap:10px;align-self:stretch}.dbx .dbots-aside .dbx-mini .dbx-avname{text-align:left}',
    '.dbx-acts{display:flex;flex-wrap:wrap;gap:6px;margin-top:8px}.dbx .dbx-acts button{background:#fff !important;color:#111 !important;border:0 !important;border-radius:999px !important;padding:4px 12px !important;font-size:.8rem !important;cursor:pointer}.dbx .dbx-acts button.no{background:#333 !important;color:#fff !important}',
    '.dbx-steps{margin:6px 0 0;padding-left:16px;font-size:.8rem;opacity:.85}',
    '.dbots.dbx .dbx-asidebtn,.dbots.dbx .dbots-aside .dbx-close{display:none !important}',
    '.dbx .dbots-head .dbx-hbtn{gap:4px !important}.dbx .dbx-hbtn button{width:32px !important;height:32px !important;min-width:32px;padding:0 !important;border-radius:50% !important;background:#fff !important;color:#111 !important;border:1px solid #bbb !important;font-size:.95rem !important}',
    '.dbx .dbx-hbtn button:hover{border-color:#111 !important}.dbx .dbx-hbtn button.on{background:#111 !important;color:#fff !important;border-color:#111 !important}.dbx .dbx-hbtn button.red{color:#b3261e !important;border-color:#e2a29d !important}',
    '.dbx-chips{display:flex;flex-wrap:wrap;gap:6px;margin:4px 14px 0}.dbx-chips:empty{display:none}',
    '.dbx-chip{display:flex;align-items:center;gap:6px;border:1px solid #999;border-radius:999px;padding:3px 4px 3px 4px;background:#fff;font-size:.8rem;max-width:220px}',
    '.dbx-chip img{width:28px;height:28px;object-fit:cover;border-radius:50%}.dbx-chip .ic{width:28px;height:28px;display:grid;place-items:center;border-radius:50%;background:#eee}',
    '.dbx-chip .nm{overflow:hidden;text-overflow:ellipsis;white-space:nowrap;max-width:130px}.dbx-chip.up{opacity:.55}.dbx-chip.err{border-color:#b3261e;color:#b3261e}',
    '.dbx .dbx-chip button{width:22px !important;height:22px !important;padding:0 !important;border-radius:50% !important;border:0 !important;background:#eee !important;color:#111 !important;font-size:.75rem !important;cursor:pointer}',
    '.dbx-page{display:flex;flex-direction:column;gap:1px;padding:8px 12px;margin:0 0 6px;border-radius:16px;text-decoration:none !important;max-width:300px;border-left:4px solid #48d6e8}',
    '.dbots-msg.bot .dbx-page{background:#1c1c1c;color:#fff !important}.dbots-msg.user .dbx-page{background:#f2f2f2;color:#111 !important}',
    '.dbx-page b{font-weight:600;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.dbx-page small{opacity:.7;margin:0 !important}',
    '.dbx-att{display:flex;flex-wrap:wrap;gap:6px;margin:0 0 6px}',
    '.dbx-att img{max-width:220px;max-height:180px;border-radius:16px;display:block;background:#222}',
    '.dbx-file{display:flex;align-items:center;gap:8px;padding:8px 12px;border-radius:16px;text-decoration:none !important;max-width:260px}',
    '.dbots-msg.bot .dbx-file{background:#1c1c1c;color:#fff !important}.dbots-msg.user .dbx-file{background:#f2f2f2;color:#111 !important}',
    '.dbx-file b{display:block;font-weight:600;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;max-width:190px}.dbx-file small{opacity:.7;margin:0 !important}',
    '.dbx .dbots-pane[data-pane="chat"].drag{outline:3px dashed #2a4bd8;outline-offset:-6px;border-radius:18px}',
    '.dbx .dbots-aside .term-input,.dbx .dbots-aside input.term-input{background:transparent !important;border:0 !important;border-radius:0 !important;color:#fff !important;padding:0 !important;box-shadow:none !important}',
    '.dbx .dbx-send,.dbx .dbx-plus{box-shadow:none !important}',
    '.dbx .dbots-aside .dbx-close{position:absolute;top:8px;right:8px;width:34px !important;height:34px !important;padding:0 !important;border-radius:50% !important;background:rgba(255,255,255,.85) !important;color:#111 !important;border:0 !important}',
    '@media (max-width:640px){',
    ' .dbx{flex-direction:column}',
    ' .dbx .dbots-side{width:auto;border-right:0;border-bottom:1px solid #9a9a9a;padding:6px 64px 6px 0;max-height:72px !important;flex-direction:row;overflow-x:auto}',
    ' .dbx .dbx-new{width:48px;height:48px;top:10px}',
    ' .dbx .dbots-bot{margin:4px 0 4px 8px;padding:4px 10px}',
    ' .dbx .dbots-aside{position:absolute;right:0;top:0;bottom:0;width:78%;max-width:300px;z-index:6;transform:translateX(105%);transition:transform .2s;box-shadow:-6px 0 20px rgba(0,0,0,.25)}',
    ' .dbx.aside-open .dbots-aside{transform:none}',
    ' .dbots.dbx.dbx .dbx-asidebtn,.dbots.dbx.dbx .dbots-aside .dbx-close{display:inline-flex !important}',
    ' .dbx .dbots-head{justify-content:flex-start !important}.dbx .dbots-head .dbx-hbtn{position:static;margin-left:auto}',
    ' .dbx .dbots-msg{max-width:85%;padding:11px 16px}',
    ' .dbx .dbots-head h2{font-size:1.15rem}',
    '}',
    '.app-window .win-body:has(> .dbots.dbx){container-type:inline-size;container-name:dbwin}',
    '@container dbwin (max-width:760px){',
    ' .dbx{flex-direction:column}',
    ' .dbx .dbots-side{width:auto;border-right:0;border-bottom:1px solid #9a9a9a;padding:6px 64px 6px 0;max-height:72px !important;flex-direction:row;overflow-x:auto}',
    ' .dbx .dbx-new{width:48px;height:48px;top:10px}',
    ' .dbx .dbots-bot{margin:4px 0 4px 8px;padding:4px 10px}',
    ' .dbx .dbots-aside{position:absolute;right:0;top:0;bottom:0;width:78%;max-width:300px;z-index:6;transform:translateX(105%);transition:transform .2s;box-shadow:-6px 0 20px rgba(0,0,0,.25)}',
    ' .dbx.aside-open .dbots-aside{transform:none}',
    ' .dbots.dbx.dbx .dbx-asidebtn,.dbots.dbx.dbx .dbots-aside .dbx-close{display:inline-flex !important}',
    ' .dbx .dbots-head{justify-content:flex-start !important}.dbx .dbots-head .dbx-hbtn{position:static;margin-left:auto}',
    ' .dbx .dbots-msg{max-width:85%;padding:11px 16px}',
    ' .dbx .dbots-head h2{font-size:1.15rem}',
    '}'
  ].join('');
  document.head.appendChild(css2);
  var STAR_PTS = (function () { var p = [], n = 12; for (var i = 0; i < n * 2; i++) { var a = Math.PI * i / n - Math.PI / 2, r = i % 2 ? 41 : 48; p.push((50 + r * Math.cos(a)).toFixed(1) + ',' + (50 + r * Math.sin(a)).toFixed(1)); } return p.join(' '); })();
  function star(inner, size) { return '<span class="dbx-star" style="width:' + size + 'px;height:' + size + 'px"><svg class="st" viewBox="0 0 100 100"><polygon points="' + STAR_PTS + '" fill="#fff" stroke="#333" stroke-width="1.6"/></svg><span class="in">' + inner + '</span></span>'; }
  var PLANE = '<svg viewBox="0 0 24 24" width="30" height="30" fill="none" stroke="#111" stroke-width="1.3" stroke-linejoin="round"><path d="M22 2 2 10.5l7 2.5 2.5 7L22 2z"/><path d="M9 13 22 2M11.5 20l-1-5.5"/></svg>';

  function api(path, opts) { return window.api ? window.api(path, opts) : Promise.reject(new Error('api')); }
  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  function emo(el) { try { if (window.snakeEmoji) window.snakeEmoji.parse(el); } catch (e) {} }
  function errMsg(e) { return (e && (e.message || e.detail)) || 'Error'; }
  function th(b) { return THEMES[b && b.theme] || THEMES.selva; }

  // ---- Figuritas 2.5D originales (SVG isométrico con sombreado; color principal por bot) ----
  function shade(hex, f) {
    var m = /^#?([0-9a-f]{6})$/i.exec(hex || '') ; var n = parseInt(m ? m[1] : '34d17a', 16);
    var r = n >> 16, g = (n >> 8) & 255, b = n & 255;
    function c(v) { v = f >= 0 ? v + (255 - v) * f : v * (1 + f); return Math.max(0, Math.min(255, Math.round(v))); }
    return '#' + ((1 << 24) + (c(r) << 16) + (c(g) << 8) + c(b)).toString(16).slice(1);
  }
  var FIGS = ['Cubo', 'Esfera', 'Pirámide', 'Octaedro', 'Cilindro', 'Toro', 'Prisma', 'Cono', 'Diamante', 'Cápsula', 'Hexágono', 'Icosaedro'];
  var figSeq = 0;
  // Cara al estilo del logo: dos ojos blancos verticales redondeados, sin boca. Las expresiones solo con los ojos.
  function faceSvg(x, y, sc) {
    return '<g class="dbf-face" transform="translate(' + x + ' ' + y + ') scale(' + (sc || 1) + ')">' +
      '<g class="dbf-eyes"><rect class="dbf-el" x="-7" y="-4.5" width="4" height="9" rx="2" fill="#fff"/><rect class="dbf-er" x="3" y="-4.5" width="4" height="9" rx="2" fill="#fff"/></g>' +
      '<text class="dbf-q" x="8.5" y="-6" font-size="8" font-weight="800" fill="#fff" stroke="#111" stroke-width=".6">?</text>' +
      '<path class="dbf-ex" d="M12 -13q.6 3.4 4 4q-3.4.6-4 4q-.6-3.4-4-4q3.4-.6 4-4z" fill="#ffd23f"/></g>';
  }
  function figSvg(kind, color, size, botId) {
    var k = ((+kind || 0) % FIGS.length + FIGS.length) % FIGS.length, C = color || '#34d17a';
    var L = shade(C, .4), D = shade(C, -.3), DD = shade(C, -.55), id = 'dbf' + (++figSeq);
    var g = '<defs><radialGradient id="' + id + '" cx="35%" cy="30%" r="75%"><stop offset="0" stop-color="' + shade(C, .6) + '"/><stop offset=".55" stop-color="' + C + '"/><stop offset="1" stop-color="' + DD + '"/></radialGradient>' +
      '<linearGradient id="' + id + 'v" x1="0" x2="1"><stop offset="0" stop-color="' + D + '"/><stop offset=".35" stop-color="' + L + '"/><stop offset="1" stop-color="' + DD + '"/></linearGradient></defs>';
    var S = 'url(#' + id + ')', V = 'url(#' + id + 'v)';
    function P(d, f) { return '<path d="' + d + '" fill="' + f + '" stroke="' + DD + '" stroke-width=".6" stroke-linejoin="round"/>'; }
    var shadow = '<ellipse cx="32" cy="58" rx="19" ry="4.5" fill="rgba(0,0,0,.3)"/>', b = '', fc = [32, 34, 1];
    switch (k) {
      case 0: b = P('M32 8L52 18L32 28L12 18Z', L) + P('M12 18L32 28V52L12 42Z', C) + P('M32 28L52 18V42L32 52Z', D); fc = [22, 34, .8]; break;
      case 1: b = '<circle cx="32" cy="30" r="21" fill="' + S + '"/><ellipse cx="25" cy="21" rx="6" ry="4" fill="#fff" opacity=".35"/>'; fc = [32, 32, 1.05]; break;
      case 2: b = P('M32 6L12 46L32 54Z', C) + P('M32 6L52 46L32 54Z', D); fc = [25, 40, .75]; break;
      case 3: b = P('M32 4L12 30L32 38Z', L) + P('M32 4L52 30L32 38Z', C) + P('M12 30L32 38L32 56Z', D) + P('M52 30L32 38L32 56Z', DD); fc = [24, 28, .7]; break;
      case 4: b = '<path d="M12 16V46A20 7 0 0 0 52 46V16Z" fill="' + V + '"/><ellipse cx="32" cy="16" rx="20" ry="7" fill="' + L + '" stroke="' + DD + '" stroke-width=".6"/>'; fc = [32, 34, 1]; break;
      case 5: b = '<ellipse cx="32" cy="32" rx="24" ry="15" fill="' + S + '"/><ellipse cx="32" cy="29" rx="9" ry="4.5" fill="' + DD + '"/><ellipse cx="32" cy="30.5" rx="9" ry="3.5" fill="rgba(0,0,0,.25)"/>'; fc = [32, 40, .75]; break;
      case 6: b = P('M14 14L32 8L50 14L32 20Z', L) + P('M14 14L32 20V54L14 46Z', C) + P('M32 20L50 14V46L32 54Z', D); fc = [23, 33, .75]; break;
      case 7: b = '<path d="M32 4L12 46A20 7 0 0 0 52 46Z" fill="' + V + '"/>'; fc = [32, 38, .9]; break;
      case 8: b = P('M18 12H46L56 24L32 56L8 24Z', C) + P('M8 24H56L32 56Z', D) + P('M18 12L24 24H40L46 12Z', L) + P('M24 24L32 56L40 24Z', C); fc = [32, 31, .75]; break;
      case 9: b = '<rect x="15" y="6" width="34" height="50" rx="17" fill="' + V + '"/><ellipse cx="26" cy="16" rx="4" ry="6" fill="#fff" opacity=".3"/>'; fc = [32, 30, 1]; break;
      case 10: b = P('M18 12L46 12L54 20L46 28L18 28L10 20Z', L) + P('M10 20L18 28V50L10 42Z', DD) + P('M18 28H46V50H18Z', C) + P('M46 28L54 20V42L46 50Z', D); fc = [32, 38, .9]; break;
      default: b = P('M32 4L54 18L54 42L32 56L10 42L10 18Z', D) + P('M32 4L10 18L32 22Z', L) + P('M32 4L54 18L32 22Z', C) + P('M10 18L32 22L20 44L10 42Z', C) + P('M54 18L32 22L44 44L54 42Z', DD) + P('M32 22L20 44H44Z', L) + P('M20 44L32 56L44 44Z', D); fc = [32, 34, .8];
    }
    var cls = 'dbots-fig' + (botId && S_mood[botId] ? ' dbf-' + S_mood[botId] : '');
    return '<svg class="' + cls + '"' + (botId ? ' data-fb="' + esc(botId) + '"' : '') + ' data-ow="' + (size || 40) + '" viewBox="0 0 64 64" width="' + (size || 40) + '" height="' + (size || 40) + '" aria-hidden="true">' + g + '<g class="dbf-body">' + shadow + b + faceSvg(fc[0], fc[1], fc[2]) + '</g></svg>';
  }
  var S_mood = {}, moodT = {};
  function setMood(id, m) {
    if (moodT[id]) { clearTimeout(moodT[id]); moodT[id] = null; }
    S_mood[id] = m || null;
    document.querySelectorAll('svg[data-fb="' + String(id).replace(/"/g, '') + '"]').forEach(function (x) {
      x.classList.remove('dbf-think', 'dbf-happy');
      if (m) x.classList.add('dbf-' + m);
      // Tamaño normal siempre (override: no agrandar al pensar)
      if (!x.closest('.dbots-aside')) { var w = x.getAttribute('data-ow'); if (w) { x.setAttribute('width', w); x.setAttribute('height', w); } }
    });
    if (m === 'happy') moodT[id] = setTimeout(function () { setMood(id, null); }, 1800);
  }
  window.DogBotsMood = setMood;
  function botFig(b, size) { return figSvg(b && b.fig != null ? b.fig : 0, (b && b.color) || th(b)[2], size, b && b.id); }
  window.dogBotsFig = figSvg;

  function render(body) {
    var S = { bots: [], tasks: [], hasKey: true, sel: null, timer: 0, alive: true, logs: {} };
    body.innerHTML = '<div class="dbots dbx"><div class="dbots-side"></div><div class="dbots-main"></div><div class="dbots-aside"></div></div>';
    var side = body.querySelector('.dbots-side'), main = body.querySelector('.dbots-main'), aside = body.querySelector('.dbots-aside'), root = body.querySelector('.dbots');

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
      var h = '<button class="dbx-new" data-new title="Nuevo bot">' + star('<span style="font-size:30px;line-height:1">+</span>', 58) + '</button><h3>Bots creados</h3>';
      S.bots.forEach(function (b) {
        var t = th(b), act = botTasks(b.id).filter(function (x) { return x.status === 'trabajando' || x.status === 'en cola'; }).length;
        h += '<div class="dbots-bot' + (b.id === S.sel ? ' on' : '') + '" data-id="' + esc(b.id) + '" style="background:' + t[1] + ';--ac:' + t[2] + '">' +
          '<span class="av">' + star(botFig(b, 30), 44) + '</span><div><b>' + esc(b.name) + '</b><small>' + (act ? '⚙️ ' + act + ' activas' : 'Libre') + '</small></div></div>';
      });
      side.innerHTML = h; emo(side);
      side.querySelectorAll('.dbots-bot').forEach(function (el) { el.onclick = function () { S.sel = el.getAttribute('data-id'); drawSide(); drawMain(); }; });
      side.querySelector('[data-new]').onclick = function () { form(null); };
    }
    function cur() { return S.bots.find(function (b) { return b.id === S.sel; }); }
    function drawMain() {
      var b = cur();
      if (!b) { aside.innerHTML = star(botFig({ fig: 0, color: '#8b3dff' }, 96), 140) + '<div class="dbx-avname">Tu bot</div>'; main.classList.remove('chatmode'); main.innerHTML = '<div class="dbots-empty">🤖<br><br>Aún no tienes bots.<br>Crea uno, dale una función y ponlo a trabajar.<br><br><button class="dbots-btn" data-new>➕ Crear mi primer bot</button></div>'; main.querySelector('[data-new]').onclick = function () { form(null); }; emo(main); return; }
      var t = th(b);
      main.style.setProperty('--ac', t[2]);
      main.innerHTML =
        '<div class="dbots-head"><span class="av">' + star(botFig(b, 44), 66) + '</span><h2>' + esc(b.name) + '</h2>' +
        '<span class="dbx-hbtn"><button data-hb="tasks" title="Tareas">📋</button><button data-hb="mem" title="Memoria">🧠</button><button data-hb="term" data-aside title="Terminal">🖥️</button><button data-edit title="Editar bot">✏️</button><button class="red" data-del title="Borrar bot">🗑️</button></span></div>' +
        '<div class="dbots-role"><b>Función:</b> ' + esc(b.role || 'Sin función (asistente general)') + '</div>' +
        (S.hasKey ? '' : '<div class="dbots-warn">⚠️ Para que los bots busquen en internet necesitas tu propia clave de AskBox. Añádela en <b>Ajustes → IA → Key de AskBox</b>.</div>') +
        '<div class="dbots-tabs"><button data-tab="chat">💬 Chat</button><button data-tab="term">🖥️ Terminal</button><button data-tab="tasks">📋 Tareas</button><button data-tab="mem">🧠 Memoria</button></div>' +
        '<div class="dbots-pane" data-pane="chat"><div class="dbots-chat"></div><div class="dbx-chips" data-chips></div><div class="dbots-chatin"><button class="dbx-plus" data-plus title="Adjuntar archivos">+</button><input type="file" data-file multiple hidden accept="image/*,.pdf,.txt,.md,.csv,.json,.log,.py,.js,.html,.css,.docx,.xlsx,.pptx,.doc,.xls,.zip"><textarea data-msg maxlength="2000" placeholder="Escribir"></textarea><button class="dbx-send" data-send title="Enviar">' + PLANE + '</button></div></div>' +
        '<div class="dbots-pane" data-pane="mem"><button class="dbots-btn alt dbx-back" data-back>← Volver al chat</button><div class="dbots-form" style="padding:0 12px 12px"><p style="margin:0;opacity:.8">Cosas que el bot recuerda siempre (una por línea). También las apunta él solo cuando le pides que recuerde algo.</p><textarea data-memtxt style="min-height:160px">' + esc((b.memory || []).join('\n')) + '</textarea><div><button class="dbots-btn" data-memsave>Guardar memoria</button></div></div></div>' +
        '<div class="dbots-pane" data-pane="tasks"><button class="dbots-btn alt dbx-back" data-back>← Volver al chat</button>' +
        '<div class="dbots-new"><input data-in placeholder="Nueva tarea, p. ej. «Busca noticias de Dogalandia»" maxlength="1000"><button class="dbots-btn" data-go>▶️ Hacer</button></div>' +
        '</div>' +
        '<div class="dbots-pane" data-pane="term"><div class="term-wrap"><div class="term-out"></div><div class="term-in-row"><span class="term-prompt">' + esc(b.name.toLowerCase().replace(/\s+/g, '-')) + '@snake-os-lite:~$</span><input class="term-input" placeholder="help" autocomplete="off" spellcheck="false"></div></div></div>';
      main.querySelector('[data-pane="tasks"]').insertAdjacentHTML('beforeend', '<div style="display:flex;align-items:center;margin:0 12px 6px"><b style="flex:1">Tareas</b><button class="dbots-btn alt" data-clear>🧹 Borrar historial</button></div><div class="dbots-tasks"></div>');
      aside.innerHTML = '<div class="dbx-mini">' + star(botFig(b, 40), 60) + '<div><div class="dbx-avname">' + esc(b.name) + '</div><div class="dbx-role" style="text-align:left">' + esc(b.role || 'Asistente general') + '</div></div></div>';
      S.mos = window.DogBotsOS ? window.DogBotsOS.mount(aside, b, b.color || th(b)[2], { notes: function () { root.classList.remove('aside-open'); tab('mem'); }, settings: function () { root.classList.remove('aside-open'); var ed = main.querySelector('[data-edit]'); if (ed) ed.click(); }, fig: botFig(b, 20) }) : null;
      aside.insertAdjacentHTML('afterbegin', '<button class="dbx-close" data-closeaside title="Cerrar">✕</button>');
      aside.querySelector('[data-closeaside]').onclick = function () { root.classList.remove('aside-open'); };
      var tp = main.querySelector('[data-pane="term"]'), tw = tp.querySelector('.term-wrap'); (S.mos ? S.mos.termHost : aside).appendChild(tw); tp.remove();
      emo(main); emo(aside);
      main.querySelectorAll('[data-hb]').forEach(function (x) { x.onclick = function (e) { e.stopPropagation(); var v = x.getAttribute('data-hb');
        if (v === 'term') { if (S.mos) S.mos.show('term'); root.classList.toggle('aside-open'); var ti = aside.querySelector('.term-input'); if (ti) ti.focus(); return; }
        tab(S.tab === v ? 'chat' : v); }; });
      main.querySelectorAll('[data-back]').forEach(function (x) { x.onclick = function () { tab('chat'); }; });
      main.querySelector('.dbots-chat').addEventListener('click', function () { root.classList.remove('aside-open'); });
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
      if (n === 'term') { root.classList.add('aside-open'); n = 'chat'; }
      S.tab = n;
      main.classList.toggle('chatmode', n === 'chat' || n === 'term');
      main.querySelectorAll('[data-tab]').forEach(function (x) { x.classList.toggle('on', x.getAttribute('data-tab') === n); });
      main.querySelectorAll('[data-hb]').forEach(function (x) { x.classList.toggle('on', x.getAttribute('data-hb') === n); });
      main.querySelectorAll('[data-pane]').forEach(function (x) { x.classList.toggle('on', x.getAttribute('data-pane') === n); });
      if (n === 'chat') { var c = main.querySelector('.dbots-chat'); if (c) c.scrollTop = c.scrollHeight; var t = main.querySelector('[data-msg]'); if (t && !window.matchMedia('(pointer:coarse)').matches) t.focus(); }
    }
    function linkify(t) { return esc(t).replace(/https?:\/\/[^\s<)\]]+/g, function (u) { return '<a href="' + u + '" target="_blank" rel="noopener">' + u + '</a>'; }); }
    function fmtTime(at) { try { return new Date(at * 1000).toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' }); } catch (e) { return ''; } }
    function fileIcon(type, name) { type = type || ''; if (/^image\//.test(type)) return '🖼️'; if (/pdf/.test(type) || /\.pdf$/i.test(name || '')) return '📕'; if (/sheet|excel|csv/.test(type)) return '📊'; if (/presentation/.test(type)) return '📽️'; if (/zip/.test(type)) return '🗜️'; if (/word/.test(type)) return '📘'; return '📄'; }
    function fmtSize(n) { n = +n || 0; return n < 1024 ? n + ' B' : n < 1048576 ? (n / 1024).toFixed(0) + ' KB' : (n / 1048576).toFixed(1).replace('.', ',') + ' MB'; }
    var DESK_LABEL = { open_app: 'Abrir app', close_app: 'Cerrar app', create_folder: 'Crear carpeta', create_note: 'Escribir nota', create_file: 'Crear archivo', set_wallpaper: 'Cambiar fondo', move_window: 'Mover ventana', switch_desktop: 'Cambiar de escritorio', delete_file: '🗑️ Borrar archivo', call_contact: '📞 Llamar a' };
    function stepTxt(s) { return (DESK_LABEL[s.op] || s.op) + ' ' + esc(s.app || s.name || s.id || (s.n != null ? s.n : '') || (s.text ? '«' + String(s.text).slice(0, 40) + '»' : '')); }
    S.ran = S.ran || {};
    function actHtml(m) {
      var h = '';
      if (m.desktop && m.desktop.length) {
        h += '<ul class="dbx-steps">' + m.desktop.map(function (s) { return '<li>' + stepTxt(s) + '</li>'; }).join('') + '</ul>';
        var conf = m.desktop.some(function (s) { return s.confirm; });
        if (S.ran[m.id]) h += '<div class="dbx-acts"><button data-redo="' + esc(m.id) + '">↻ Repetir en el escritorio</button></div>';
        else if (conf) h += '<div class="dbx-acts"><button data-yes="' + esc(m.id) + '">✅ Sí, hazlo</button><button class="no" data-no="' + esc(m.id) + '">✖ No</button></div>';
        else h += '<div class="dbx-acts"><button data-redo="' + esc(m.id) + '">▶ Hacerlo en el escritorio</button></div>';
      }
      if (m.code && m.code.code) h += '<div class="dbx-acts"><button data-codeview="' + esc(m.id) + '">💻 Ver y ejecutar el código</button></div>';
      if (m.browse && m.browse.length) h += '<div class="dbx-acts"><button data-replay="' + esc(m.id) + '">🌐 Ver navegación (' + m.browse.length + ' pasos)</button></div>';
      return h;
    }
    function findMsg(id) { return (S.msgs[S.chatBot] || []).filter(function (x) { return x.id === id; })[0]; }
    function runDesk(b, m) {
      if (!window.DogBotsOS || !m || !m.desktop) return;
      S.ran[m.id] = 1; if (S.paintChat) S.paintChat();
      var col = b.color || th(b)[2];
      if (window.matchMedia('(max-width:640px)').matches || document.body.classList.contains('phone-mode')) { var w = document.getElementById('win-dbots'); if (w && typeof window.minimizeApp === 'function') window.minimizeApp('dbots'); }
      setMood(b.id, 'think');
      window.DogBotsOS.runDesktop(m.desktop, b, col, function (t) { line('[escritorio] ' + t, /✅/.test(t) ? 'term-ok' : 'term-err'); })
        .then(function (res) { setMood(b.id, 'happy'); (S.msgs[b.id] = S.msgs[b.id] || []).push({ id: 'local' + Date.now(), role: 'bot', text: (res.stopped ? '⏹ Me has parado.\n' : '🖱️ Hecho en tu escritorio:\n') + res.done.join('\n'), at: Date.now() / 1000 }); if (S.paintChat) S.paintChat(); });
    }
    function handleBot(b, m) {
      if (!m) return;
      if (m.browse && m.browse.length && S.mos) { root.classList.add('aside-open'); setMood(b.id, 'think'); S.mos.replay(m.browse).then(function () { setMood(b.id, 'happy'); }); }
      if (m.code && m.code.code && S.mos) { root.classList.add('aside-open'); S.mos.code(m.code); }
      if (m.desktop && m.desktop.length && !m.desktop.some(function (s) { return s.confirm; })) runDesk(b, m);
    }
    function wireActs(box, b) {
      box.querySelectorAll('[data-yes],[data-redo]').forEach(function (x) { x.onclick = function () { runDesk(b, findMsg(x.getAttribute('data-yes') || x.getAttribute('data-redo'))); }; });
      box.querySelectorAll('[data-no]').forEach(function (x) { x.onclick = function () { S.ran[x.getAttribute('data-no')] = 1; (S.msgs[b.id] = S.msgs[b.id] || []).push({ id: 'local' + Date.now(), role: 'bot', text: 'Vale, no lo hago.', at: Date.now() / 1000 }); S.paintChat(); }; });
      box.querySelectorAll('[data-codeview]').forEach(function (x) { x.onclick = function () { var m = findMsg(x.getAttribute('data-codeview')); if (m && S.mos) { root.classList.add('aside-open'); S.mos.code(m.code); } }; });
      box.querySelectorAll('[data-replay]').forEach(function (x) { x.onclick = function () { var m = findMsg(x.getAttribute('data-replay')); if (m && S.mos) { root.classList.add('aside-open'); S.mos.replay(m.browse); } }; });
    }
    function pageHtml(list) {
      if (!list || !list.length) return '';
      return list.map(function (pg) { return '<a class="dbx-page" href="' + esc(pg.url) + '" target="_blank" rel="noopener noreferrer"><b>🌐 ' + esc(pg.title || pg.domain) + '</b><small>' + esc(pg.domain) + ' · página leída</small></a>'; }).join('');
    }
    function attHtml(list) {
      if (!list || !list.length) return '';
      return '<div class="dbx-att">' + list.map(function (a) {
        var u = '/api/dbots/file/' + encodeURIComponent(a.id);
        if (/^image\//.test(a.type || '')) return '<a href="' + u + '" target="_blank" rel="noopener"><img src="' + u + '" alt="' + esc(a.name) + '" loading="lazy"></a>';
        return '<a class="dbx-file" href="' + u + '?dl=1" download="' + esc(a.name) + '"><span>' + fileIcon(a.type, a.name) + '</span><span><b>' + esc(a.name) + '</b><small>' + fmtSize(a.size) + ' · Descargar</small></span></a>';
      }).join('') + '</div>';
    }
    function setupChat(b) {
      var box = main.querySelector('.dbots-chat'), ta = main.querySelector('[data-msg]'), btn = main.querySelector('[data-send]');
      S.chatBot = b.id; S.msgs = S.msgs || {}; S.sending = false;
      function paint() {
        var list = S.msgs[b.id] || [];
        var h = list.length ? '' : '<div style="opacity:.7;text-align:center;margin-top:20px">' + botFig(b, 72) + '<br>Hola, soy ' + esc(b.name) + '. Háblame con normalidad: puedo buscar en internet y hacer tareas en segundo plano.</div>';
        list.forEach(function (m) {
          var meta = fmtTime(m.at) + (m.search ? ' · 🔎 ' + esc(m.search) : '') + (m.task ? ' · 📋 tarea ' + esc(String(m.task).slice(-4)) : '') + (m.memory ? ' · 🧠 recordado' : '');
          var att = attHtml(m.attachments) + pageHtml(m.pages), txt = m.text ? linkify(m.text) : '';
          if (m.role === 'user') h += '<div class="dbots-msg user">' + att + txt + '<small>' + meta + '</small></div>';
          else h += '<div class="dbots-row">' + botFig(b, 30) + '<div class="dbots-msg bot">' + att + txt + actHtml(m) + '<small>' + meta + '</small></div></div>';
        });
        if (S.sending) h += '<div class="dbots-row">' + botFig(b, 52) + '<div class="dbots-msg bot dbots-typing"><span></span><span></span><span></span></div></div>';
        box.innerHTML = h; emo(box); wireActs(box, b); box.scrollTop = box.scrollHeight;
      }
      S.paintChat = paint;
      function refresh() { return api('/api/dbots/chat/' + encodeURIComponent(b.id)).then(function (r) { S.msgs[b.id] = r.messages || []; if (S.chatBot === b.id && box.isConnected) paint(); }); }
      S.refreshChat = refresh;
      paint(); refresh().catch(function () {});
      var chips = main.querySelector('[data-chips]'), fin = main.querySelector('[data-file]'), pane = main.querySelector('[data-pane="chat"]');
      S.pending = [];
      function drawChips() {
        chips.innerHTML = S.pending.map(function (f, i) {
          var ic = f.preview ? '<img src="' + f.preview + '" alt="">' : '<span class="ic">' + fileIcon(f.type, f.name) + '</span>';
          return '<span class="dbx-chip' + (f.state === 'up' ? ' up' : '') + (f.state === 'err' ? ' err' : '') + '" title="' + esc(f.err || f.name) + '">' + ic + '<span class="nm">' + esc(f.state === 'up' ? 'Subiendo… ' + f.name : (f.err || f.name)) + '</span><button data-rm="' + i + '" title="Quitar">✕</button></span>';
        }).join('');
        chips.querySelectorAll('[data-rm]').forEach(function (x) { x.onclick = function () { var f = S.pending.splice(+x.getAttribute('data-rm'), 1)[0]; if (f && f.preview) URL.revokeObjectURL(f.preview); drawChips(); }; });
      }
      function addFiles(list) {
        Array.prototype.slice.call(list || []).forEach(function (file) {
          if (S.pending.length >= 6) return;
          var f = { name: file.name || 'imagen.png', type: file.type || '', size: file.size, state: 'up', preview: /^image\//.test(file.type) ? URL.createObjectURL(file) : '' };
          if (file.size > 20 * 1024 * 1024) { f.state = 'err'; f.err = file.name + ': pasa de 20 MB'; S.pending.push(f); return; }
          S.pending.push(f);
          var fd = new FormData(); fd.append('file', file, f.name);
          fetch('/api/dbots/upload/' + encodeURIComponent(b.id), { method: 'POST', body: fd, credentials: 'include' })
            .then(function (r) { return r.json().then(function (j) { if (!r.ok) throw new Error(j.detail || 'Error al subir'); return j; }); })
            .then(function (j) { f.id = j.file.id; f.type = j.file.type; f.state = 'ok'; drawChips(); })
            .catch(function (e) { f.state = 'err'; f.err = f.name + ': ' + errMsg(e); drawChips(); });
        });
        drawChips();
      }
      main.querySelector('[data-plus]').onclick = function (e) { e.stopPropagation(); fin.click(); };
      fin.onchange = function () { addFiles(fin.files); fin.value = ''; };
      ['dragenter', 'dragover'].forEach(function (ev) { pane.addEventListener(ev, function (e) { if (e.dataTransfer && Array.prototype.indexOf.call(e.dataTransfer.types || [], 'Files') >= 0) { e.preventDefault(); pane.classList.add('drag'); } }); });
      pane.addEventListener('dragleave', function (e) { if (e.target === pane) pane.classList.remove('drag'); });
      pane.addEventListener('drop', function (e) { pane.classList.remove('drag'); if (e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files.length) { e.preventDefault(); addFiles(e.dataTransfer.files); } });
      ta.addEventListener('paste', function (e) { var it = (e.clipboardData && e.clipboardData.files) || []; if (it.length) { e.preventDefault(); addFiles(it); } });
      function send() {
        var v = ta.value.trim(); if (S.sending) return;
        if (S.pending.some(function (f) { return f.state === 'up'; })) { alert('Espera a que terminen de subirse los archivos'); return; }
        var ready = S.pending.filter(function (f) { return f.state === 'ok'; });
        if (!v && !ready.length) return;
        if (!S.hasKey) { (S.msgs[b.id] = S.msgs[b.id] || []).push({ role: 'bot', text: '🔑 Para hablar conmigo necesitas tu propia clave de AskBox. Añádela en Ajustes → IA → Key de AskBox.', at: Date.now() / 1000 }); paint(); return; }
        ta.value = ''; S.sending = true; setMood(b.id, 'think');
        var ids = ready.map(function (f) { return f.id; });
        (S.msgs[b.id] = S.msgs[b.id] || []).push({ role: 'user', text: v, at: Date.now() / 1000, attachments: ready.map(function (f) { return { id: f.id, name: f.name, type: f.type, size: f.size }; }) });
        S.pending = []; drawChips(); paint();
        api('/api/dbots/chat/' + encodeURIComponent(b.id), { method: 'POST', body: { text: v, attachments: ids, ctx: window.DogBotsOS ? window.DogBotsOS.context() : {} } })
          .then(function (r) { S.sending = false; setMood(b.id, 'happy'); var m = r && r.message; return refresh().then(function () { handleBot(b, m); }); })
          .then(function () { poll(); })
          .catch(function (e) { S.sending = false; setMood(b.id, null); S.msgs[b.id].push({ role: 'bot', text: '❌ ' + errMsg(e), at: Date.now() / 1000 }); paint(); });
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
    // ---- Terminal del bot (local) ----
    var term = null;
    function line(txt, cls) { if (!term) return; var d = document.createElement('div'); d.className = 'term-line ' + (cls || ''); d.textContent = txt; term.out.appendChild(d); term.out.scrollTop = term.out.scrollHeight; }
    function setupTerm(b) {
      var wrap = aside.querySelector('.term-wrap') || main.querySelector('.term-wrap');
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
          'abrir <url>     abre una página y muestra su título, texto y enlaces (también: ver <url>)',
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
      } else if (c === 'abrir' || c === 'ver' || c === 'open') {
        var url = rest.split(/\s+/)[0] || '';
        if (url && !/^https?:\/\//i.test(url)) url = 'https://' + url;
        if (!url) return line('Uso: abrir <url>', 'term-err');
        line('Abriendo ' + url + '…', 'term-muted');
        if (S.mos) S.mos.open(url, true);
        api('/api/dbots/fetch', { method: 'POST', body: { url: url } }).then(function (pg) {
          line('🌐 ' + (pg.title || pg.domain) + '  (' + pg.url + ')', 'term-ok');
          line(String(pg.text || '').slice(0, 1500) + (String(pg.text || '').length > 1500 ? '…' : ''));
          (pg.links || []).slice(0, 10).forEach(function (l) { line('  → ' + l.text + ': ' + l.url, 'term-muted'); });
        }).catch(function (e) { line(errMsg(e), 'term-err'); });
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
      main.classList.remove('chatmode');
      var used = {}; S.bots.forEach(function (x) { if (!b || x.id !== b.id) used[x.theme] = 1; });
      var theme = b ? b.theme : (Object.keys(THEMES).find(function (k) { return !used[k]; }) || 'selva');
      var av = b ? b.avatar : AVATARS[S.bots.length % AVATARS.length];
      var fg = b && b.fig != null ? b.fig : S.bots.length % FIGS.length;
      var col = (b && b.color) || THEMES[theme][2];
      main.innerHTML = '<div class="dbots-form"><h2 style="margin:0">' + (b ? '✏️ Editar bot' : '➕ Nuevo bot') + '</h2>' +
        '<label>Nombre</label><input data-n maxlength="40" value="' + esc(b ? b.name : '') + '" placeholder="Bot Noticias">' +
        '<label>Función</label><textarea data-r maxlength="600" placeholder="Busca noticias de Dogalandia">' + esc(b ? b.role : '') + '</textarea>' +
        '<label>Figurita</label><div class="dbots-pick dbots-figs" data-fg></div>' +
        '<label>Color de la figurita <input type="color" data-col value="' + esc(col) + '" style="width:48px;height:32px;padding:2px;vertical-align:middle"></label>' +
        '<label>Estilo</label><div class="dbots-pick" data-th>' + Object.keys(THEMES).map(function (k) { var t = THEMES[k]; return '<span data-v="' + k + '" style="background:' + t[1] + ';color:' + t[2] + '"' + (k === theme ? ' class="on"' : '') + '>● ' + t[0] + (used[k] ? ' (en uso)' : '') + '</span>'; }).join('') + '</div>' +
        '<div style="display:flex;gap:8px"><button class="dbots-btn" data-save>Guardar</button><button class="dbots-btn alt" data-cancel>Cancelar</button></div></div>';
      emo(main);
      function pick(sel, set) { main.querySelectorAll(sel + ' span').forEach(function (s) { s.onclick = function () { main.querySelectorAll(sel + ' span').forEach(function (o) { o.classList.remove('on'); }); s.classList.add('on'); set(s.getAttribute('data-v')); }; }); }
      function drawFigs() { var el = main.querySelector('[data-fg]'); el.innerHTML = FIGS.map(function (n, i) { return '<span data-v="' + i + '" title="' + n + '"' + (i === +fg ? ' class="on"' : '') + '>' + figSvg(i, col, 44) + '</span>'; }).join(''); pick('[data-fg]', function (v) { fg = +v; }); }
      drawFigs();
      main.querySelector('[data-col]').oninput = function (e) { col = e.target.value; drawFigs(); };
      pick('[data-th]', function (v) { theme = v; });
      main.querySelector('[data-cancel]').onclick = drawMain;
      main.querySelector('[data-save]').onclick = function () {
        var payload = { name: main.querySelector('[data-n]').value.trim(), role: main.querySelector('[data-r]').value.trim(), avatar: av, theme: theme, fig: +fg, color: col };
        if (!payload.name) return alert('Ponle un nombre al bot');
        api(b ? '/api/dbots/bots/' + encodeURIComponent(b.id) : '/api/dbots/bots', { method: b ? 'PUT' : 'POST', body: payload })
          .then(function (r) { S.sel = r.bot.id; load(); }).catch(function (e) { alert(errMsg(e)); });
      };
    }
    load();
  }

  function install() {
    var apps = window.APPS; if (!apps) return false;
    var LOGO = '/static/assets/dbots-logo.svg?v=1';
    if (!document.getElementById('dbots-logo-css')) { var st = document.createElement('style'); st.id = 'dbots-logo-css'; st.textContent = '.app-icon-img.dbots-logo{width:44px;height:44px;object-fit:contain;border-radius:22%;background:transparent;box-shadow:none}.start-item img.app-icon-img.dbots-logo,.taskbar img.app-icon-img.dbots-logo,#taskbar img.app-icon-img.dbots-logo,.win-title img.app-icon-img.dbots-logo,.win-titlebar img.app-icon-img.dbots-logo{width:1.35em;height:1.35em;vertical-align:-0.25em;margin-right:4px}'; document.head.appendChild(st); }
    if (!apps.dbots) apps.dbots = { title: 'Doganiero Bots', icon: '🤖', iconImg: LOGO, iconImgClass: 'dbots-logo', iconHtml: '<img class="app-icon-img dbots-logo" src="' + LOGO + '" alt="">', width: 1120, height: 700, render: render };
    try {
      if (document.querySelector('#iconLayer .desktop-icon') && typeof buildIcons === 'function') buildIcons();
      if (typeof buildStartMenu === 'function' && document.querySelector('#startMenu .start-item')) buildStartMenu();
    } catch (e) {}
    return true;
  }
  if (!install()) { var n = 0, iv = setInterval(function () { if (install() || ++n > 200) clearInterval(iv); }, 50); }
})();

/* Vuelta del login del Navegador sin ventana de origen (móvil): al arrancar Snake OS, reabre el Navegador. */
(function () {
  try { var b = JSON.parse(localStorage.getItem('snkAuthReturn') || 'null'); if (!b || Date.now() - (b.at || 0) > 5 * 60 * 1000) return; } catch (e) { return; }
  var n = 0, iv = setInterval(function () { if (++n > 60) return clearInterval(iv); if (window.__snakeBootAck && window.openApp && (window.APPS || {}).browser) { clearInterval(iv); try { window.openApp('browser'); } catch (e) {} } }, 500);
})();
