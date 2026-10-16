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
  // Textos dinámicos (fechas, saludos, contadores) que no pueden estar en el diccionario.
  var DAYS = {lunes:'Monday',martes:'Tuesday','miércoles':'Wednesday',jueves:'Thursday',viernes:'Friday','sábado':'Saturday',domingo:'Sunday'};
  var MON = {enero:'January',febrero:'February',marzo:'March',abril:'April',mayo:'May',junio:'June',julio:'July',agosto:'August',septiembre:'September',octubre:'October',noviembre:'November',diciembre:'December'};
  var GREET = {'buenos días':'Good morning','buenas tardes':'Good afternoon','buenas noches':'Good evening','hola':'Hi'};
  function dyn(k) {
    var m = k.match(/^(lunes|martes|miércoles|jueves|viernes|sábado|domingo),?\s+(\d{1,2})\s+de\s+([a-zé]+)(?:\s+de\s+(\d{4}))?$/i);
    if (m && MON[m[3].toLowerCase()]) return DAYS[m[1].toLowerCase()] + ', ' + MON[m[3].toLowerCase()] + ' ' + m[2] + (m[4] ? ', ' + m[4] : '');
    m = k.match(/^(\d{1,2})\s+de\s+([a-zé]+)(?:\s+de\s+(\d{4}))?$/i);
    if (m && MON[m[2].toLowerCase()]) return MON[m[2].toLowerCase()] + ' ' + m[1] + (m[3] ? ', ' + m[3] : '');
    m = k.match(/^(buenos días|buenas tardes|buenas noches|hola)([,!\s].*)?$/i);
    if (m) return GREET[m[1].toLowerCase()] + (m[2] || '');
    m = k.match(/^Récord: (\d+)$/); if (m) return 'High score: ' + m[1];
    m = k.match(/^Lín (\d+), Col (\d+) · (\d+) car\.$/); if (m) return 'Ln ' + m[1] + ', Col ' + m[2] + ' · ' + m[3] + ' chars';
    m = k.match(/^(\d+) archivo\(s\) · (.+?) · (\d+) nota\(s\)$/); if (m) return m[1] + ' file(s) · ' + m[2] + ' · ' + m[3] + ' note(s)';
    m = k.match(/^Perfil activo: (.+)$/); if (m) return 'Active profile: ' + m[1];
    m = k.match(/^¡Hola, ([^!]+)! Soy Doganiero AI\. (.+)$/); if (m) { var rest = D['¡Hola! Soy Doganiero AI. ' + m[2]]; if (rest) return rest.replace(/^Hi!/, 'Hi, ' + m[1] + '!'); }
    m = k.match(/^Doganiero AI \((.+)\) está escribiendo…$/); if (m) return 'Doganiero AI (' + m[1] + ') is typing…';
    m = k.match(/^No se pudieron cargar (los contactos|las llamadas): (.+)$/); if (m) return "Couldn't load " + (m[1] === 'los contactos' ? 'contacts' : 'calls') + ': ' + (D[m[2]] || m[2]);
    m = k.match(/^No se pudo leer la suscripción \((.+)\)\.$/); if (m) return "Couldn't read the subscription (" + (D[m[1]] || m[1]) + ').';
    m = k.match(/^Ajustes rápidos · (.+)$/); if (m) return 'Quick settings · ' + m[1];
    m = k.match(/^Ahora: (.+)$/); if (m) return 'Now: ' + (D[m[1]] || m[1]);
    m = k.match(/^Símbolos · (\d+)$/); if (m) return 'Symbols · ' + m[1];
    m = k.match(/^hace (\d+) (minutos?|horas?|días?|segundos?)$/i);
    if (m) { var u = {minuto:'minute',hora:'hour','día':'day',segundo:'second'}[m[2].toLowerCase().replace(/s$/, '')] || m[2]; return m[1] + ' ' + u + (m[1] === '1' ? '' : 's') + ' ago'; }
    return null;
  }
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
    // «Frase (detalle)» → traducir cada parte
    var m3 = k.match(/^(.+?)\s*(\((.+)\))$/);
    if (m3) { var a3 = lookup(m3[1]), b3 = lookup(m3[3]); if (a3 && b3) return a3 + ' (' + b3 + ')'; if (a3 && !looksEs(m3[3])) return a3 + ' ' + m3[2]; }
    // «parte · parte» → traducir las partes conocidas (nombres propios/dinámicos se quedan)
    if (k.indexOf(' · ') > 0) { var ps = k.split(' · '), any = false; for (var i = 0; i < ps.length; i++) { var t3 = lookup(ps[i]); if (t3) { ps[i] = t3; any = true; } } if (any) return ps.join(' · '); }
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
    try { var ls = (navigator.languages && navigator.languages.length ? navigator.languages : [navigator.language || '']); for (var i = 0; i < ls.length; i++) if (/^es\b/i.test(String(ls[i]))) return 'es'; } catch (e) {}
    return 'en';
  }
  // Solo una elección MANUAL (botón 🌐) se respeta; la clave antigua snkLang se ignora (podía guardar una detección automática errónea).
  function getLang() { var v = null; try { v = localStorage.getItem('snkLangManual'); localStorage.removeItem('snkLang'); } catch (e) {} return v === 'es' || v === 'en' ? v : autoLang(); }
  var lang = getLang();
  function tr(t) {
    var k = t.trim(); if (!k || onlyBrand(k)) return null;
    var dy = dyn(k); if (dy) return t.replace(k, dy);
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
    if (n.nodeType === 1 && n.tagName === 'TEXTAREA' && lang === 'en') { var ph = n.getAttribute('placeholder'); if (ph && ph !== n.__en_placeholder) { var rp = tr(ph); if (rp && rp !== ph) { n.__es_placeholder = ph; n.__en_placeholder = rp; n.setAttribute('placeholder', rp); } } }
    if (n.nodeType !== 1 || /^(SCRIPT|STYLE|TEXTAREA|IFRAME|CODE|PRE)$/.test(n.tagName) || (n.closest && n.closest('[data-noi18n],.term-wrap,.dbx-msg'))) return;
    for (var a = 0; a < ATTRS.length; a++) {
      var at = ATTRS[a], key = '__es_' + at, v = n.getAttribute(at);
      var ekey = '__en_' + at;
      if (lang === 'en') { if (v && (n[key] == null || v !== n[ekey])) { if (v === n[ekey]) continue; var r2 = tr(v); if (r2 && r2 !== v) { n[key] = v; n[ekey] = r2; n.setAttribute(at, r2); } else { n[key] = null; n[ekey] = null; } } }
      else if (n[key] != null) { if (v === n[ekey]) n.setAttribute(at, n[key]); n[key] = null; n[ekey] = null; }
    }
    for (var c = n.firstChild; c; c = c.nextSibling) doNode(c);
  }
  var busy = false;
  function apply(root) { busy = true; try { doNode(root || document.body); } finally { busy = false; try { mo.takeRecords(); } catch (e) {} } document.documentElement.lang = lang; document.documentElement.setAttribute('translate', 'no'); document.documentElement.classList.add('notranslate'); }
  var queue = [], qT = 0;
  function pump() {
    qT = 0; if (lang !== 'en') { queue = []; return; }
    var t0 = Date.now(); busy = true;
    try { while (queue.length && Date.now() - t0 < 20) { var qn = queue.shift(); qn.__q = 0; if (qn.isConnected) doNode(qn); } }
    finally { busy = false; mo.takeRecords(); }
    if (queue.length) qT = setTimeout(pump, 16);
  }
  function sweepAttrs() {
    if (lang !== 'en' || document.hidden) return;
    var els = document.querySelectorAll('.app-window [placeholder], .app-window [title], .app-window [aria-label], #startMenu [title], #startMenu [placeholder], #taskbar [title], #taskbar [aria-label]');
    if (els.length > 4000) return;
    busy = true;
    try {
      for (var i = 0; i < els.length; i++) { var e = els[i]; for (var a = 0; a < ATTRS.length; a++) { var at = ATTRS[a], v = e.getAttribute(at); if (!v || v === e['__en_' + at]) continue; var r = tr(v); if (r && r !== v) { e['__es_' + at] = v; e['__en_' + at] = r; e.setAttribute(at, r); } } }
    } finally { busy = false; try { mo.takeRecords(); } catch (x) {} }
  }
  function enq(n) { if (n && !n.__q) { n.__q = 1; queue.push(n); } }
  var mo = new MutationObserver(function (ms) {
    if (busy || lang !== 'en') return;
    for (var i = 0; i < ms.length; i++) {
      var m = ms[i];
      if (m.type === 'characterData') { if (m.target.__en == null || m.target.nodeValue !== m.target.__en) enq(m.target); }
      else if (m.type === 'attributes') { var tv = m.target.getAttribute(m.attributeName); if (tv && tv !== m.target['__en_' + m.attributeName]) enq(m.target); }
      else for (var j = 0; j < m.addedNodes.length; j++) enq(m.addedNodes[j]);
    }
    if (!qT) qT = setTimeout(pump, 60);
  });
  function setLang(l, manual) {
    lang = l === 'en' ? 'en' : 'es'; if (manual) { try { localStorage.setItem('snkLangManual', lang); } catch (e) {} }
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
    b.onclick = function (e) { e.stopPropagation(); setLang(lang === 'en' ? 'es' : 'en', true); };
    g.insertBefore(b, g.firstChild); paintTile();
  }
  function start() {
    addTile(); apply();
    mo.observe(document.body, { childList: true, subtree: true, characterData: true });
    // Atributos que las apps cambian después de pintar (placeholder/title): repaso ligero de ventanas abiertas, sin observar atributos (evita bucles con otros observadores).
    setInterval(sweepAttrs, 2500);
  }
  window.snakeI18n = { get lang() { return lang; }, set: function (l) { setLang(l, true); }, t: function (s) { return lang === 'en' ? (tr(String(s)) || s) : s; } };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start); else start();
})();
