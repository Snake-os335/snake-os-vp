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
  /* 2026.14b: el servidor manda un código de error (cabecera X-Snk-Err) y aquí se muestra en el idioma de la página */
  var ERR = {"es": {"bad_site": "Página no válida", "not_signed_in": "No has iniciado sesión", "too_many_tries": "Demasiados intentos. Espera unos minutos y vuelve a probar.", "bad_login": "Correo o contraseña incorrectos", "too_many_signups": "Se han creado muchas cuentas desde aquí. Vuelve a intentarlo más tarde.", "bad_email": "Correo no válido", "no_gmail": "No se pueden crear cuentas nuevas con Gmail. Usa otro correo, por ejemplo tu correo@dogaemail.com.", "name_empty": "El nombre no puede estar vacío", "name_long": "El nombre es demasiado largo (máx. 60 caracteres)", "pw_long": "La contraseña es demasiado larga", "pw_short": "La contraseña debe tener al menos 4 caracteres", "email_taken": "Ya existe una cuenta con ese correo", "code_need_login": "Inicia sesión con tu cuenta Dogaemail para pedir el código.", "account_already_pro": "Tu cuenta ya tiene Snake OS VP Pro activado.", "too_many_codes": "Has pedido muchos códigos seguidos. Vuelve a intentarlo dentro de un rato.", "code_gen_failed": "No se pudo generar el código", "profile_already_pro": "Este perfil ya tiene Snake OS VP Pro activado.", "code_format": "Código no válido. Revisa que tenga la forma SNKPRO-XXXX-XXXX-XXXX.", "code_invalid": "Código no válido.", "code_used": "Este código ya se ha usado.", "bad_prefs": "Preferencias no válidas", "prefs_big": "Demasiados datos en las funciones Pro (máx. 48 KB)", "not_pro": "Este perfil no tiene Snake OS VP Pro", "too_many_queries": "Demasiadas consultas. Espera un momento.", "code_other_account": "Este código es de la cuenta Dogaemail {arg}. Entra en Snake OS VP con esa cuenta para activarlo.", "slow": "El servidor tarda demasiado. Vuelve a intentarlo.", "offline": "Sin conexión con el servidor. Vuelve a intentarlo.", "blocked_origin": "Petición bloqueada: viene de otra web.", "too_big": "El envío es demasiado grande.", "rate": "Demasiadas peticiones seguidas; espera un momento.", "server": "Error interno del servidor. Inténtalo de nuevo."}, "en": {"bad_site": "Invalid page", "not_signed_in": "You are not signed in", "too_many_tries": "Too many attempts. Wait a few minutes and try again.", "bad_login": "Wrong email or password", "too_many_signups": "Many accounts have been created from here. Try again later.", "bad_email": "Invalid email", "no_gmail": "New accounts cannot use Gmail. Use another email, for example your address@dogaemail.com.", "name_empty": "The name cannot be empty", "name_long": "The name is too long (max. 60 characters)", "pw_long": "The password is too long", "pw_short": "The password must have at least 4 characters", "email_taken": "An account with that email already exists", "code_need_login": "Sign in with your Dogaemail account to request the code.", "account_already_pro": "Your account already has Snake OS VP Pro activated.", "too_many_codes": "You have requested many codes in a row. Try again in a while.", "code_gen_failed": "The code could not be generated", "profile_already_pro": "This profile already has Snake OS VP Pro activated.", "code_format": "Invalid code. Check that it looks like SNKPRO-XXXX-XXXX-XXXX.", "code_invalid": "Invalid code.", "code_used": "This code has already been used.", "bad_prefs": "Invalid preferences", "prefs_big": "Too much data in the Pro features (max. 48 KB)", "not_pro": "This profile does not have Snake OS VP Pro", "too_many_queries": "Too many requests. Wait a moment.", "code_other_account": "This code belongs to the Dogaemail account {arg}. Sign in to Snake OS VP with that account to activate it.", "slow": "The server is taking too long. Try again.", "offline": "No connection to the server. Try again.", "blocked_origin": "Request blocked: it comes from another website.", "too_big": "The upload is too large.", "rate": "Too many requests in a row; wait a moment.", "server": "Internal server error. Please try again."}};
  var curLang = function () { var l = (document.documentElement.lang || '').slice(0, 2); return l === 'en' ? 'en' : 'es'; };
  function errText(code, arg, fallback) {
    var t = code && ERR[curLang()][code];
    return t ? t.replace('{arg}', arg || '') : fallback;
  }
  function req(path, opts) {
    opts = opts || {};
    var o = { method: opts.method || 'GET', credentials: 'same-origin', headers: { Accept: 'application/json' }, cache: 'no-store' };
    if (opts.body !== undefined) { o.headers['Content-Type'] = 'application/json'; o.body = JSON.stringify(opts.body); }
    /* 2026.14: límite de tiempo (20 s) para que la página nunca se quede esperando para siempre */
    var ac = typeof AbortController === 'function' ? new AbortController() : null, tm = 0;
    if (ac) { o.signal = ac.signal; tm = setTimeout(function () { try { ac.abort(); } catch (e) {} }, opts.timeout || 20000); }
    return fetch(path, o).catch(function (e) {
      clearTimeout(tm);
      var c3 = e && e.name === 'AbortError' ? 'slow' : 'offline';
      var e3 = new Error(errText(c3, '', '')); e3.status = 0; e3.code = c3; throw e3;
    }).then(function (r) {
      clearTimeout(tm);
      return r.text().then(function (t) {
        var d = null; try { d = t ? JSON.parse(t) : null; } catch (e) { d = { detail: t }; }
        if (!r.ok) {
          var code = r.headers.get('X-Snk-Err') || '', arg = '';
          try { arg = decodeURIComponent(r.headers.get('X-Snk-Err-Arg') || ''); } catch (x) {}
          var e2 = new Error(errText(code, arg, (d && (typeof d.detail === 'string' ? d.detail : d.message)) || ('Error ' + r.status))); e2.status = r.status; e2.code = code; throw e2;
        }
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
        curLang = lang;
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
  window.DogaAuth = { create: create, errText: errText };
})();
