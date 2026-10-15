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
  function autoLang() {
    try { var tz = Intl.DateTimeFormat().resolvedOptions().timeZone || ''; if (/^(Europe\/Madrid|Atlantic\/Canary|Africa\/Ceuta)$/.test(tz)) return 'es'; } catch (e) {}
    return 'en';
  }
  function getLang() { var v = null; try { v = localStorage.getItem('snkLang'); } catch (e) {} return v === 'es' || v === 'en' ? v : autoLang(); }
  var lang = getLang();
  function tr(t) {
    var k = t.trim(); if (!k) return null;
    var hit = D[k];
    if (!hit) for (var i = 0; i < PARTS.length; i++) if (PARTS[i][0].test(k)) { hit = k.replace(PARTS[i][0], PARTS[i][1]); break; }
    return hit ? t.replace(k, hit) : null;
  }
  function doNode(n) {
    if (n.nodeType === 3) {
      if (lang === 'en') { if (n.__es == null) { var r = tr(n.nodeValue); if (r) { n.__es = n.nodeValue; n.nodeValue = r; } } }
      else if (n.__es != null) { n.nodeValue = n.__es; n.__es = null; }
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
  function apply(root) { busy = true; try { doNode(root || document.body); } finally { busy = false; } document.documentElement.lang = lang; }
  var mo = new MutationObserver(function (ms) { if (busy || lang !== 'en') return; busy = true; try { ms.forEach(function (m) { if (m.type === 'characterData') { m.target.__es = null; doNode(m.target); } else m.addedNodes.forEach(doNode); }); } finally { busy = false; } });
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
