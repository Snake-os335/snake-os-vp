/* Doga Auth (oct 2026): inicio de sesión compartido con las cuentas Dogaemail de Snake OS VP para páginas propias.
 *
 * Uso en cualquier página (el id del sitio tiene que estar en doga_auth.SITES del servidor):
 *   <script src="/static/doga-auth.js"></script>
 *   var auth = DogaAuth.create('pro');
 *   auth.mount(document.getElementById('login'), { onChange: function (user) { ... } });  // formulario listo
 *   auth.me().then(function (user) { ... });   // null si no hay sesión
 *   auth.login(email, password) · auth.signup({ email, name, password }) · auth.logout()
 *   auth.fetch('/api/...', { method: 'POST', body: {...} })  // JSON con la cookie de esta página
 * Misma cuenta que Snake OS VP (mismo almacén y contraseña). La sesión de la página va en su propia cookie
 * (doga_s_<sitio>): entrar o salir aquí no cierra ni cambia la sesión de Snake OS en otra pestaña.
 */
(function () {
  'use strict';
  /* Foto de perfil de Snake OS (o GIF animado: se muestra tal cual con <img>), emoji o, si no hay, la inicial */
  function isPhoto(a) { a = String(a || ''); return a.indexOf('/api/avatars/') === 0 || /^data:image\/(png|jpe?g|gif|webp);base64,/i.test(a); }
  function initial(u) { var n = String((u && (u.name || u.email)) || '?').trim(); return (Array.from ? Array.from(n)[0] : n.charAt(0)).toUpperCase() || '?'; }
  function avatarHtml(u) {
    var a = String((u && u.avatar) || '').trim();
    if (isPhoto(a)) return '<span class="da-av da-photo"><img alt="" src="' + a.replace(/"/g, '&quot;') + '"></span>';
    if (a && a.length <= 16 && !/[<>"']/.test(a)) return '<span class="da-av">' + a + '</span>';
    return '<span class="da-av da-ini">' + initial(u).replace(/[<>&"']/g, '') + '</span>';
  }
  if (window.DogaAuth) return;
  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  function req(path, opts) {
    opts = opts || {};
    var o = { method: opts.method || 'GET', credentials: 'same-origin', headers: { Accept: 'application/json' }, cache: 'no-store' };
    if (opts.body !== undefined) { o.headers['Content-Type'] = 'application/json'; o.body = JSON.stringify(opts.body); }
    /* 2026.14: límite de tiempo (20 s) para que la página nunca se quede esperando para siempre */
    var ac = typeof AbortController === 'function' ? new AbortController() : null, tm = 0;
    if (ac) { o.signal = ac.signal; tm = setTimeout(function () { try { ac.abort(); } catch (e) {} }, opts.timeout || 20000); }
    return fetch(path, o).catch(function (e) {
      clearTimeout(tm);
      var e3 = new Error(e && e.name === 'AbortError' ? 'El servidor tarda demasiado. Vuelve a intentarlo.' : 'Sin conexión con el servidor. Vuelve a intentarlo.'); e3.status = 0; throw e3;
    }).then(function (r) {
      clearTimeout(tm);
      return r.text().then(function (t) {
        var d = null; try { d = t ? JSON.parse(t) : null; } catch (e) { d = { detail: t }; }
        if (!r.ok) { var e2 = new Error((d && (typeof d.detail === 'string' ? d.detail : d.message)) || ('Error ' + r.status)); e2.status = r.status; throw e2; }
        return d;
      });
    });
  }
  var TXT = {
    es: { in: 'Iniciar sesión', up: 'Crear cuenta', email: 'Correo Dogaemail', name: 'Nombre', pw: 'Contraseña', pw2: 'Repite la contraseña', go_in: 'Entrar', go_up: 'Crear cuenta', mism: 'Las contraseñas no coinciden', hint: 'Es la misma cuenta que usas en Snake OS VP.', hint_up: 'La cuenta nueva también sirve para entrar en Snake OS VP.', out: 'Cerrar sesión', as: 'Sesión iniciada como', wait: 'Un momento…' },
    en: { in: 'Sign in', up: 'Create account', email: 'Dogaemail address', name: 'Name', pw: 'Password', pw2: 'Repeat the password', go_in: 'Sign in', go_up: 'Create account', mism: 'The passwords do not match', hint: 'It is the same account you use in Snake OS VP.', hint_up: 'The new account also works to sign in to Snake OS VP.', out: 'Sign out', as: 'Signed in as', wait: 'One moment…' }
  };
  var CSS = '.doga-auth{font:inherit;color:inherit;display:flex;flex-direction:column;gap:10px}' +
    '.doga-auth .da-tabs{display:flex;gap:6px;padding:4px;border-radius:12px;background:rgba(255,255,255,.07)}' +
    '.doga-auth .da-tabs button{flex:1;border:0;border-radius:9px;padding:9px;background:transparent;color:inherit;font:inherit;font-weight:700;cursor:pointer}' +
    '.doga-auth .da-tabs button.on{background:rgba(74,222,128,.22);box-shadow:inset 0 0 0 1px rgba(74,222,128,.5)}' +
    '.doga-auth label{display:flex;flex-direction:column;gap:4px;font-size:.85rem;font-weight:700}' +
    '.doga-auth input{font:inherit;font-weight:500;padding:11px 12px;border-radius:10px;border:1px solid rgba(255,255,255,.18);background:rgba(0,0,0,.25);color:inherit;outline:none}' +
    '.doga-auth input:focus{border-color:#4ade80;box-shadow:0 0 0 3px rgba(74,222,128,.25)}' +
    '.doga-auth .da-go{border:0;border-radius:12px;padding:12px;font:inherit;font-weight:800;cursor:pointer;background:linear-gradient(135deg,#4ade80,#16a34a);color:#04170b}' +
    '.doga-auth .da-go:disabled{opacity:.6;cursor:wait}' +
    '.doga-auth .da-msg{min-height:1.2em;font-size:.85rem;font-weight:700;color:#ff8a7a}' +
    '.doga-auth .da-hint{font-size:.78rem;opacity:.7;margin:0}' +
    '.doga-auth .da-user{display:flex;align-items:center;gap:10px;padding:10px 12px;border-radius:12px;background:rgba(255,255,255,.07)}' +
    '.doga-auth .da-user b{display:block}.doga-auth .da-user span{font-size:.8rem;opacity:.75}' +
    '.doga-auth .da-user .da-av{font-size:1.6rem;flex:0 0 44px;width:44px;height:44px;border-radius:50%;overflow:hidden;display:inline-flex;align-items:center;justify-content:center;background:rgba(255,255,255,.08)}.doga-auth .da-user .da-av img{width:100%;height:100%;object-fit:cover;display:block}.doga-auth .da-user .da-ini{font:800 1.15rem/1 system-ui,sans-serif;color:#05160c;background:linear-gradient(135deg,#7df0a8,#34d17a)}.doga-auth .da-who{min-width:0;flex:1 1 auto}.doga-auth .da-name{display:flex!important;align-items:center;min-width:0}.doga-auth .da-nm{overflow:hidden;text-overflow:ellipsis;white-space:nowrap;min-width:0;font-size:inherit!important;opacity:1!important}.doga-auth .da-mail{display:block;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.doga-auth .da-pro{flex:0 0 auto;white-space:nowrap;margin-left:6px;padding:0 6px;border-radius:5px;font:800 10px/1.7 system-ui,sans-serif!important;letter-spacing:.05em;opacity:1!important;color:#2a1c00;background:linear-gradient(135deg,#ffe48a,#f5c542 55%,#c9931a)}.doga-auth .da-user button{margin-left:auto;border:1px solid rgba(255,255,255,.2);background:transparent;color:inherit;border-radius:9px;padding:7px 10px;font:inherit;font-size:.8rem;cursor:pointer}';
  function addCss() { if (document.getElementById('dogaAuthCss')) return; var s = document.createElement('style'); s.id = 'dogaAuthCss'; s.textContent = CSS; document.head.appendChild(s); }

  function create(site) {
    var listeners = [], user = null;
    function emit() { listeners.forEach(function (f) { try { f(user); } catch (e) {} }); }
    var api = {
      site: site,
      user: function () { return user; },
      me: function () { return req('/api/doga-auth/me?soft=1&site=' + encodeURIComponent(site)).then(function (u) { if (u && u.signed_in === false) u = null; user = u; return u; }, function (e) { if (e.status === 401) { user = null; return null; } throw e; }); },
      login: function (email, password) { return req('/api/doga-auth/login', { method: 'POST', body: { site: site, email: email, password: password } }).then(function (u) { user = u; emit(); return u; }); },
      signup: function (d) { return req('/api/doga-auth/signup', { method: 'POST', body: { site: site, email: d.email, name: d.name, password: d.password, avatar: d.avatar } }).then(function (u) { user = u; emit(); return u; }); },
      logout: function () { return req('/api/doga-auth/logout', { method: 'POST', body: { site: site } }).catch(function () {}).then(function () { user = null; emit(); }); },
      onChange: function (f) { listeners.push(f); },
      fetch: req,
      mount: function (el, o) {
        o = o || {}; addCss();
        var lang = function () { return (typeof o.lang === 'function' ? o.lang() : o.lang) === 'en' ? 'en' : 'es'; };
        var mode = 'in';
        if (o.onChange) listeners.push(o.onChange);
        function paint() {
          var t = TXT[lang()];
          el.classList.add('doga-auth');
          if (user) {
            el.innerHTML = '<div class="da-user">' + avatarHtml(user) + '<div class="da-who"><span>' + t.as + '</span><b translate="no" class="da-name"><span class="da-nm">' + esc(user.name) + '</span>' + (user.pro === true ? '<span class="da-pro" data-noi18n translate="no" title="Snake OS VP Pro">⭐ PRO</span>' : '') + '</b><span translate="no" class="da-mail">' + esc(user.email) + '</span></div><button type="button" class="da-out">' + t.out + '</button></div>';
            var img = el.querySelector('.da-av img');
            if (img) img.onerror = function () { var sp = img.parentNode; if (sp) { sp.className = 'da-av da-ini'; sp.textContent = initial(user); } };
            el.querySelector('.da-out').onclick = function () { api.logout().then(paint); };
            return;
          }
          el.innerHTML = '<div class="da-tabs" role="tablist"><button type="button" data-m="in">' + t.in + '</button><button type="button" data-m="up">' + t.up + '</button></div>' +
            '<form novalidate>' +
            (mode === 'up' ? '<label>' + t.name + '<input name="name" autocomplete="name" maxlength="60" required></label>' : '') +
            '<label>' + t.email + '<input name="email" type="email" autocomplete="' + (mode === 'up' ? 'email' : 'username') + '" placeholder="tu@dogaemail.com" required></label>' +
            '<label>' + t.pw + '<input name="pw" type="password" autocomplete="' + (mode === 'up' ? 'new-password' : 'current-password') + '" required></label>' +
            (mode === 'up' ? '<label>' + t.pw2 + '<input name="pw2" type="password" autocomplete="new-password" required></label>' : '') +
            '<p class="da-hint">' + (mode === 'up' ? t.hint_up : t.hint) + '</p>' +
            '<div class="da-msg" role="alert"></div><button class="da-go" type="submit">' + (mode === 'up' ? t.go_up : t.go_in) + '</button></form>';
          el.querySelectorAll('.da-tabs button').forEach(function (b) { b.classList.toggle('on', b.dataset.m === mode); b.onclick = function () { mode = b.dataset.m; paint(); }; });
          var f = el.querySelector('form'), msg = el.querySelector('.da-msg'), go = el.querySelector('.da-go');
          f.onsubmit = function (ev) {
            ev.preventDefault();
            var em = f.email.value.trim(), pw = f.pw.value;
            if (mode === 'up' && pw !== f.pw2.value) { msg.textContent = t.mism; return; }
            msg.textContent = ''; go.disabled = true; go.textContent = t.wait;
            (mode === 'up' ? api.signup({ email: em, name: f.name.value.trim(), password: pw }) : api.login(em, pw))
              .then(function () { paint(); }, function (e) { go.disabled = false; go.textContent = mode === 'up' ? t.go_up : t.go_in; msg.textContent = (e && e.message) || 'Error'; });
          };
        }
        api.repaint = paint;
        api.me().catch(function () { return null; }).then(function () { paint(); emit(); });
        return api;
      }
    };
    return api;
  }
  window.DogaAuth = { create: create };
})();
