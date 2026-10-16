/* Snake OS · Traductor del sistema ES/EN.
   Preferencia en localStorage('snkLang'). Sin preferencia: ES en España (zona horaria), EN fuera. */
(function () {
  var D = {
    'Ajustes rápidos':'Quick settings','No molestar':'Do not disturb','Modo foco':'Focus mode','Rendimiento':'Performance','Compacto':'Compact',
    'Cerrar apps':'Close apps','Pantalla completa':'Fullscreen','Bloquear cuenta':'Lock account','Código Desk':'Desk code',
    'Los interruptores se guardan en tu cuenta.':'Toggles are saved to your account.',
    'Fondo de pantalla (solo tu cuenta)':'Wallpaper (your account only)','Batería del dispositivo':'Device battery','Batería':'Battery','Hora de Madrid':'Madrid time',
    'Iniciar sesión':'Sign in','Entrar':'Sign in','Crear cuenta':'Create account','Registrarse':'Sign up','Cerrar sesión':'Sign out','Correo':'Email','Contraseña':'Password',
    'Nombre':'Name','Usuario':'Username','Cancelar':'Cancel','Aceptar':'OK','Guardar':'Save','Borrar':'Delete','Eliminar':'Delete','Cerrar':'Close','Abrir':'Open',
    'Atrás':'Back','Adelante':'Forward','Inicio':'Home','Buscar':'Search','Enviar':'Send','Copiar':'Copy','Pegar':'Paste','Renombrar':'Rename','Nueva carpeta':'New folder',
    'Navegador':'Browser','Explorador':'Explorer','Papelera':'Trash','Notas':'Notes','Calculadora':'Calculator','Juegos':'Games','Terminal':'Terminal','Mi perfil':'My profile',
    'Acerca de':'About','Teléfono':'Phone','Mapas':'Maps','Archivos':'Files','Código':'Code','Ajustes':'Settings','Configuración':'Settings','Tienda':'Store',
    'Apagar':'Shut down','Reiniciar':'Restart','Suspender':'Sleep','Bloquear':'Lock','Apagando…':'Shutting down…','Cargando…':'Loading…','Buscando…':'Searching…',
    'Escritorio':'Desktop','Documentos':'Documents','Imágenes':'Images','Descargas':'Downloads','Música':'Music','Vídeos':'Videos',
    'Ordenar iconos':'Arrange icons','Cambiar fondo':'Change wallpaper','Actualizar':'Refresh','Propiedades':'Properties','Minimizar':'Minimize','Maximizar':'Maximize',
    'Buscar en Doganiero Search o pegar una URL':'Search Doganiero Search or paste a URL','Buscar en Doganiero Search…':'Search Doganiero Search…',
    'Buscar en Doganiero Search':'Search in Doganiero Search','Abrir con el proxy de Snake OS':'Open with Snake OS proxy',
    'Esta web no se puede mostrar dentro de Snake OS':'This site can’t be shown inside Snake OS','No se ha podido abrir esta web':'This site couldn’t be opened',
    'Esta dirección no se puede abrir aquí':'This address can’t be opened here',
    'Error al iniciar Snake OS!':'Snake OS failed to start!','Idioma':'Language','Español':'Spanish','Inglés':'English',
    'Escribe un mensaje…':'Type a message…','Mensaje':'Message','Hoy':'Today','Ayer':'Yesterday','Ahora':'Now','Sí':'Yes','No':'No',
    'Llamar':'Call','Colgar':'Hang up','Contactos':'Contacts','Recientes':'Recent','Favoritos':'Favorites','Ejecutar':'Run','Parar':'Stop',
    'Notas del bot':'Bot notes','Ajustes del bot':'Bot settings','Reiniciar mini OS':'Restart mini OS','Apagar mini OS':'Shut down mini OS','Encender':'Power on',
    'Despertar':'Wake up','La computadora está dormida':'The computer is asleep','Snake OS Lite está apagado':'Snake OS Lite is off','Vacío':'Empty','Crear':'Create'
  };
  var PARTS = [[/^Navegador de /, 'Browser of '], [/^Notas de /, 'Notes of '], [/^Archivos de /, 'Files of '], [/^Código de /, 'Code of '], [/ está usando tu escritorio$/, ' is using your desktop']];
  var ATTRS = ['title', 'placeholder', 'aria-label'];
  // Marcas: NUNCA se traducen (ni en ES ni en EN). Se enmascaran antes del diccionario y de AskBox.
  var BRANDS = ['Snake OS Lite', 'Snake OS!', 'Snake OS', 'Doganiero Search', 'Doganiero Bots', 'Doganiero Book', 'Doganiero Chat', 'Doganiero Store',
    'Doganiero Cloud', 'Doganiero TV', 'Doganiero AI', 'Doganiero Metaverse', 'Doganiero', 'Direct™', 'Snakemoji', 'Snakemojis', 'Code Lab', 'AskBox',
    'Dogalandia', 'Snake Racing', 'Book', 'Prism', 'Doggle', 'server i8', 'server i9'];
  var BRAND_RE = new RegExp('(' + BRANDS.map(function (b) { return b.replace(/[.*+?^${}()|[\]\\!™]/g, '\\$&'); }).join('|') + ')', 'g');
  function onlyBrand(k) { return k.replace(BRAND_RE, '').replace(/[\s!¡?¿.,:;·…\-–—()"'«»]+/g, '') === ''; }
  function brandsOk(src, out) { var b = src.match(BRAND_RE) || []; for (var i = 0; i < b.length; i++) if (out.indexOf(b[i]) < 0) return false; return true; }
  // Diccionario completo generado (snake-i18n-dict.js); el manual D tiene prioridad
  var BIG = window.__SNK_I18N_EN || {};
  Object.keys(BIG).forEach(function (k) { if (D[k] == null) D[k] = BIG[k]; });
  var LOW = {}; Object.keys(D).forEach(function (k) { LOW[k.toLowerCase()] = D[k]; });
  var MEMO = {};
  function lookup(k) { if (k in MEMO) return MEMO[k]; return (MEMO[k] = lookup0(k)); }
  function lookup0(k) {
    var h = D[k] || LOW[k.toLowerCase()];
    if (h) return h;
    var m = k.match(/^(.*?)([\s:.…!?,·]+)$/); // sin puntuación final
    if (m && m[1]) { h = D[m[1]] || LOW[m[1].toLowerCase()]; if (h) return h + m[2]; }
    var m2 = k.match(/^([\p{Extended_Pictographic}\uFE0F\u200D\s]+)(.+)$/u); // emoji delante
    if (m2) { h = D[m2[2]] || LOW[m2[2].toLowerCase()]; if (h) return m2[1] + h; }
    // frases con partes dinámicas: sustituir fragmentos conocidos largos
    return null;
  }
  var RT = {}; try { RT = JSON.parse(localStorage.getItem('snkI18nEn3') || '{}') || {}; localStorage.removeItem('snkI18nEn'); } catch (e) { RT = {}; }
  var miss = {}, missT = null, asked = {};
  function looksEs(k) { return k.length >= 2 && k.length <= 200 && /[A-Za-zÁÉÍÓÚÑáéíóúñü]{2}/.test(k) && !/^(https?:|www\.|[\w.-]+@)/i.test(k); }
  function want(k) { if (lang !== 'en' || RT[k] != null || asked[k] || !looksEs(k)) return; miss[k] = 1; clearTimeout(missT); missT = setTimeout(flush, 350); }
  function flush() {
    var list = Object.keys(miss).slice(0, 80); miss = {};
    if (!list.length || !window.api) return;
    list.forEach(function (k) { asked[k] = 1; });
    window.api('/api/i18n/en', { method: 'POST', body: { strings: list } }).then(function (r) {
      var t = (r && r.t) || {}, any = false;
      Object.keys(t).forEach(function (k) { RT[k] = t[k]; any = true; });
      if (!any) return;
      try { var keys = Object.keys(RT); if (keys.length > 6000) { var n = {}; keys.slice(-6000).forEach(function (k) { n[k] = RT[k]; }); RT = n; } localStorage.setItem('snkI18nEn3', JSON.stringify(RT)); } catch (e) {}
      if (lang === 'en') apply();
      if (Object.keys(miss).length) flush();
    }).catch(function () {});
  }
  function autoLang() {
    try { var tz = Intl.DateTimeFormat().resolvedOptions().timeZone || ''; if (/^(Europe\/Madrid|Atlantic\/Canary|Africa\/Ceuta)$/.test(tz)) return 'es'; } catch (e) {}
    return 'en';
  }
  function getLang() { var v = null; try { v = localStorage.getItem('snkLang'); } catch (e) {} return v === 'es' || v === 'en' ? v : autoLang(); }
  var lang = getLang();
  function tr(t) {
    var k = t.trim(); if (!k || onlyBrand(k)) return null;
    var hit = lookup(k) || RT[k];
    if (!hit) for (var i = 0; i < PARTS.length; i++) if (PARTS[i][0].test(k)) { hit = k.replace(PARTS[i][0], PARTS[i][1]); break; }
    if (hit && !brandsOk(k, hit)) hit = null;
    if (!hit) { want(k); return null; }
    return t.replace(k, hit);
  }
  function doNode(n) {
    if (n.nodeType === 3) {
      if (lang === 'en') { if (n.__en != null && n.nodeValue === n.__en) return; if (n.__es == null || n.nodeValue !== n.__en) { n.__es = null; var r = tr(n.nodeValue); if (r && r !== n.nodeValue) { n.__es = n.nodeValue; n.__en = r; n.nodeValue = r; } } }
      else if (n.__es != null) { if (n.nodeValue === n.__en) n.nodeValue = n.__es; n.__es = null; n.__en = null; }
      return;
    }
    if (n.nodeType !== 1 || /^(SCRIPT|STYLE|TEXTAREA|IFRAME|CODE|PRE)$/.test(n.tagName) || (n.closest && n.closest('[data-noi18n],.term-wrap,.dbx-msg'))) return;
    for (var a = 0; a < ATTRS.length; a++) {
      var at = ATTRS[a], key = '__es_' + at, v = n.getAttribute(at);
      if (lang === 'en') { if (v && n[key] == null) { var r2 = tr(v); if (r2) { n[key] = v; n.setAttribute(at, r2); } } }
      else if (n[key] != null) { n.setAttribute(at, n[key]); n[key] = null; }
    }
    for (var c = n.firstChild; c; c = c.nextSibling) doNode(c);
  }
  var busy = false;
  function apply(root) { busy = true; try { doNode(root || document.body); } finally { busy = false; try { mo.takeRecords(); } catch (e) {} } document.documentElement.lang = lang; document.documentElement.setAttribute('translate', 'no'); document.documentElement.classList.add('notranslate'); }
  var queue = [], qT = 0;
  function pump() {
    qT = 0; if (lang !== 'en') { queue = []; return; }
    var t0 = Date.now(); busy = true;
    try { while (queue.length && Date.now() - t0 < 12) doNode(queue.shift()); }
    finally { busy = false; mo.takeRecords(); }
    if (queue.length) qT = setTimeout(pump, 30);
  }
  var mo = new MutationObserver(function (ms) {
    if (busy || lang !== 'en') return;
    for (var i = 0; i < ms.length; i++) {
      var m = ms[i];
      if (m.type === 'characterData') { if (m.target.__en == null || m.target.nodeValue !== m.target.__en) queue.push(m.target); }
      else for (var j = 0; j < m.addedNodes.length; j++) queue.push(m.addedNodes[j]);
    }
    if (queue.length > 5000) queue = queue.slice(-5000);
    if (!qT) qT = setTimeout(pump, 60);
  });
  function setLang(l) {
    lang = l === 'en' ? 'en' : 'es'; try { localStorage.setItem('snkLang', lang); } catch (e) {}
    apply(); paintTile();
    try { window.dispatchEvent(new CustomEvent('snk-lang', { detail: lang })); } catch (e) {}
  }
  function paintTile() {
    var t = document.getElementById('qsLang'); if (!t) return;
    t.setAttribute('aria-pressed', lang === 'en' ? 'true' : 'false');
    var lab = t.querySelector('.qs-tile-lab'); if (lab) { lab.__es = null; lab.firstChild && (lab.firstChild.__es = null); lab.textContent = lang === 'en' ? 'Language: EN' : 'Idioma: ES'; }
  }
  function addTile() {
    var g = document.getElementById('qsGrid'); if (!g || document.getElementById('qsLang')) return;
    var b = document.createElement('button'); b.type = 'button'; b.className = 'qs-tile qs-tile-action'; b.id = 'qsLang'; b.setAttribute('data-noi18n', '');
    b.title = 'ES / EN'; b.innerHTML = '<span class="qs-tile-ico">🌐</span><span class="qs-tile-lab"></span>';
    b.onclick = function (e) { e.stopPropagation(); setLang(lang === 'en' ? 'es' : 'en'); };
    g.appendChild(b); paintTile();
  }
  function start() {
    addTile(); apply();
    mo.observe(document.body, { childList: true, subtree: true, characterData: true });
  }
  window.snakeI18n = { get lang() { return lang; }, set: setLang, t: function (s) { return lang === 'en' ? (tr(String(s)) || s) : s; } };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start); else start();
})();
