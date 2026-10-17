/* Los Snakes — simulador de vida de serpientes (parodia de Los Sims) para Snake OS.
   Todo dibujado con formas en canvas. Expone window.renderLosSnakesApp(body) → cleanup. */
(function (global) {
  'use strict';
  var SAVE_VER = 1;
  var GW = 16, GH = 14, TW = 64, TH = 32;
  var SPEEDS = [0, 2, 6, 15];           // minutos de juego por segundo real
  var DAY = 1440;
  var EXIT = [7, 13];                   // casilla de salida del solar
  var PALETTE = [
    { n: 'Azul', c: '#3498db' }, { n: 'Rosa', c: '#ff6fae' }, { n: 'Amarillo', c: '#f1c40f' }, { n: 'Turquesa', c: '#1abc9c' },
    { n: 'Morado', c: '#9b59b6' }, { n: 'Naranja', c: '#e67e22' }, { n: 'Verde', c: '#2ecc71' }, { n: 'Rojo', c: '#e74c3c' }
  ];
  var NEEDS = [
    { k: 'hunger', n: 'Hambre', i: '🐁', d: 4.0 }, { k: 'energy', n: 'Energía', i: '⚡', d: 3.0 },
    { k: 'hygiene', n: 'Higiene', i: '🫧', d: 2.6 }, { k: 'fun', n: 'Diversión', i: '🎈', d: 3.4 },
    { k: 'social', n: 'Social', i: '💬', d: 2.6 }, { k: 'bladder', n: 'Vejiga', i: '🚽', d: 5.2 },
    { k: 'warmth', n: 'Calor', i: '☀️', d: 3.4 }
  ];
  var NEED_BY = {}; NEEDS.forEach(function (n) { NEED_BY[n.k] = n; });
  var TRAITS = {
    gloton: { n: 'Glotón', i: '🐁', dec: { hunger: 1.35 }, bias: { eat: 1.5 } },
    dormilon: { n: 'Dormilón', i: '😴', dec: { energy: 1.3 }, bias: { sleep: 1.5 } },
    pulcro: { n: 'Pulcro', i: '🧼', dec: { hygiene: 1.1 }, bias: { hygiene: 1.6 } },
    desalinado: { n: 'Desaliñado', i: '🦨', dec: { hygiene: 0.7 }, bias: { hygiene: 0.6 } },
    jugueton: { n: 'Juguetón', i: '🎲', dec: { fun: 1.3 }, bias: { fun: 1.5 } },
    sociable: { n: 'Sociable', i: '🗣️', dec: { social: 1.35 }, bias: { social: 1.6 }, soc: 0.15 },
    solitario: { n: 'Solitario', i: '🌙', dec: { social: 0.6 }, bias: { social: 0.6 }, soc: -0.05 },
    grunon: { n: 'Gruñón', i: '😠', soc: -0.15, bias: { argue: 3 } },
    bromista: { n: 'Bromista', i: '🤡', joke: 0.25, bias: { joke: 2.5 } },
    romantico: { n: 'Romántico', i: '💘', rom: 0.2, bias: { romance: 2.5 } },
    genio: { n: 'Genio', i: '🧠', skill: { logica: 1.7 }, bias: { study: 1.7 } },
    friolero: { n: 'Friolero', i: '🥶', dec: { warmth: 1.45 }, bias: { warm: 1.5 } },
    activo: { n: 'Activo', i: '💪', skill: { constriccion: 1.6 }, dec: { energy: 0.85 }, bias: { train: 1.8 } },
    curioso: { n: 'Curioso', i: '👅', skill: { olfato: 1.7 }, bias: { sniff: 2.2 } },
    sigiloso: { n: 'Sigiloso', i: '🥷', skill: { sigilo: 1.7 }, bias: { stealth: 1.8, hunt: 1.6 } },
    cocinillas: { n: 'Cocinillas', i: '🍳', skill: { cocina: 1.7 }, bias: { cook: 2 } }
  };
  var AGES = {
    bebe: { n: 'Bebé', s: 0.55, next: 'joven', days: 3 },
    joven: { n: 'Joven', s: 0.78, next: 'adulto', days: 7 },
    adulto: { n: 'Adulto', s: 1, next: 'anciano', days: 28 },
    anciano: { n: 'Anciano', s: 0.95 }
  };
  var SKILLS = { cocina: 'Cocina', logica: 'Lógica', carisma: 'Carisma', sigilo: 'Sigilo', constriccion: 'Constricción', olfato: 'Olfato' };
  var PATTERNS = { lisa: 'Lisa', rayas: 'Rayas', manchas: 'Manchas', anillos: 'Anillos', rombos: 'Rombos', degradado: 'Degradado', brillo: 'Brillo nacarado', estrellas: 'Estrellas' };
  var SEASONS = [
    { n: 'Primavera', i: '🌸', grass: '#7fcf5c', grass2: '#72c252' }, { n: 'Verano', i: '☀️', grass: '#a2d24e', grass2: '#94c544' },
    { n: 'Otoño', i: '🍂', grass: '#c9a64c', grass2: '#bb9842' }, { n: 'Invierno', i: '❄️', grass: '#e8f0f6', grass2: '#dbe6ef' }
  ];
  var WEEK = ['Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado', 'Domingo'];
  var FLOORS = [
    { n: 'Madera', c: '#cf9d63', c2: '#bf8c53', p: 'planks' }, { n: 'Baldosa', c: '#eef2f5', c2: '#d8e0e7', p: 'check' },
    { n: 'Moqueta lavanda', c: '#b9a7e0', c2: '#b09dd8' }, { n: 'Moqueta coral', c: '#f3aaa2', c2: '#eb9f97' },
    { n: 'Mármol', c: '#ece8df', c2: '#dcd6ca', p: 'check' }, { n: 'Ajedrez', c: '#f4f4f4', c2: '#3a4250', p: 'check' },
    { n: 'Piedra', c: '#aab0b6', c2: '#979ea5', p: 'check' }, { n: 'Hierba', c: null }
  ];
  var WALLS = [
    { n: 'Crema', c: '#f6ead2' }, { n: 'Menta', c: '#bfe9d6' }, { n: 'Cielo', c: '#bfe0f6' }, { n: 'Rosa', c: '#f7cbd9' },
    { n: 'Lavanda', c: '#d8cdf2' }, { n: 'Limón', c: '#f7eaa0' }, { n: 'Ladrillo', c: '#c86a50', c2: '#b25a42', p: 'brick' },
    { n: 'Rayas', c: '#e9f3fb', c2: '#bcd6ee', p: 'stripes' }
  ];
  var CAREERS = {
    ciencia: { n: 'Ciencia Reptil', i: '🔬', skill: 'logica', h: [9, 17], lv: [['Becario de laboratorio', 14], ['Técnico en escamas', 21], ['Herpetólogo', 31], ['Investigador jefe', 46], ['Premio Nobel de la Muda', 72]] },
    cocina: { n: 'Alta Cocina', i: '👨‍🍳', skill: 'cocina', h: [15, 23], lv: [['Pinche', 12], ['Cocinero de línea', 19], ['Sous-chef', 28], ['Chef', 41], ['Chef con tres estrellas', 64]] },
    seguridad: { n: 'Seguridad', i: '🕶️', skill: 'sigilo', h: [20, 4], lv: [['Vigilante nocturno', 13], ['Guarda sigiloso', 20], ['Agente encubierto', 29], ['Espía', 43], ['Maestro del sigilo', 66]] },
    espectaculo: { n: 'Espectáculo', i: '🎤', skill: 'carisma', h: [12, 20], lv: [['Animador de terrario', 11], ['Bailarín de cascabel', 18], ['Encantador de humanos', 27], ['Estrella', 41], ['Leyenda escamosa', 68]] },
    lucha: { n: 'Lucha libre', i: '🤼', skill: 'constriccion', h: [8, 15], lv: [['Aprendiz de constrictor', 13], ['Luchador', 20], ['Campeón regional', 30], ['Campeón nacional', 45], ['Abrazo de oro', 70]] }
  };
  var SPECIES = {
    tortuga: { n: 'Tortuga', c: '#6aa84f' }, lagarto: { n: 'Lagarto', c: '#8bc34a' }, rana: { n: 'Rana', c: '#43a047' },
    camaleon: { n: 'Camaleón', c: '#26a69a' }, iguana: { n: 'Iguana', c: '#7cb342' }
  };
  var NEIGHBOR_SEED = [['tortuga', 'Tomasa'], ['lagarto', 'Lalo'], ['rana', 'Ramona'], ['camaleon', 'Camilo'], ['iguana', 'Inés'], ['tortuga', 'Tobías']];
  var NAMES = ['Kaa', 'Siseo', 'Escamila', 'Silvia', 'Sisebuto', 'Nagini', 'Cascabel', 'Mamba', 'Pitón', 'Boa', 'Culebrín', 'Víbora', 'Zigzag', 'Lengüita', 'Anilla', 'Coral', 'Jade', 'Sinuoso', 'Ondina', 'Ssssusi'];
  var ACH = {
    primera_muda: ['🐍', 'Primera muda', 'Una serpiente ha mudado la piel'],
    ascenso: ['📈', '¡Ascendido!', 'Primer ascenso en el trabajo'],
    huevo: ['🥚', 'Huevo a la vista', 'Pon tu primer huevo'],
    nacimiento: ['🐣', '¡Ha nacido una cría!', 'Eclosiona un huevo'],
    cazador: ['🐭', 'Cazador de ratones', 'Atrapa un ratón suelto'],
    amigos: ['🤝', 'Mejores amigos', 'Amistad de 80 o más'],
    pareja: ['💞', 'Amor escamoso', 'Dos serpientes se hacen pareja'],
    hibernador: ['🛌', 'Dormilón invernal', 'Hiberna en invierno'],
    rico: ['💰', '10.000 escamoleones', 'Ahorra §10.000'],
    decorador: ['🛋️', 'Decorador', 'Ten 20 muebles en el solar'],
    vecino: ['🐢', 'Hola, vecino', 'Recibe la visita de un vecino'],
    fiesta: ['🎉', 'Fiestero', 'Celebra una fiesta'],
    olfato: ['👅', 'Nariz de oro', 'Encuentra 5 cosas olfateando'],
    patrones: ['🎨', 'Coleccionista de pieles', 'Desbloquea 4 patrones'],
    maestro: ['🏅', 'Maestro', 'Una habilidad a nivel 10'],
    visita_amigo: ['🏡', 'De visita', 'Visita la casa de un amigo'],
    regalo: ['🎁', 'Detallista', 'Deja un regalo en el buzón de un amigo'],
    anfitrion: ['🫖', 'Buen anfitrión', 'Recibe en vivo la visita de un amigo']
  };
  var ASP = {
    familia: { n: 'Familia numerosa', i: '🥚', d: 'Ver nacer 2 crías', p: function (sn) { return Math.min(1, (S.stats.births || 0) / 2); } },
    fortuna: { n: 'Fortuna escamosa', i: '💰', d: 'Ahorrar §30.000', p: function () { return Math.min(1, S.money / 30000); } },
    saber: { n: 'Sabiduría', i: '📚', d: 'Dos habilidades a nivel 7', p: function (sn) { var a = Object.keys(sn.skills).map(function (k) { return Math.min(7, sn.skills[k]); }).sort(function (x, y) { return y - x; }); return Math.min(1, (a[0] + a[1]) / 14); } },
    popular: { n: 'Popularidad', i: '🌟', d: 'Tener 4 amigos (amistad ≥ 60)', p: function (sn) { var c = 0; for (var k in sn.rel) if (sn.rel[k].fr >= 60) c++; return Math.min(1, c / 4); } },
    carrera: { n: 'Cima profesional', i: '💼', d: 'Llegar al nivel 4 de una carrera', p: function (sn) { return sn.job ? Math.min(1, (sn.job.lv + 1) / 4) : 0; } },
    mudas: { n: 'Piel de leyenda', i: '✨', d: 'Desbloquear 6 patrones de piel', p: function (sn) { return Math.min(1, sn.patterns.length / 6); } }
  };

  function clamp(v, a, b) { return v < a ? a : v > b ? b : v; }
  function rnd(a, b) { return a + Math.random() * (b - a); }
  function ri(a, b) { return Math.floor(rnd(a, b + 1)); }
  function pick(a) { return a[Math.floor(Math.random() * a.length)]; }
  function money(v) { return '§' + Math.round(v).toLocaleString('es-ES'); }
  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  function shade(hex, f) {
    var n = parseInt(hex.slice(1), 16), r = n >> 16, g = (n >> 8) & 255, b = n & 255;
    if (f < 0) { r *= 1 + f; g *= 1 + f; b *= 1 + f; } else { r += (255 - r) * f; g += (255 - g) * f; b += (255 - b) * f; }
    return 'rgb(' + (r | 0) + ',' + (g | 0) + ',' + (b | 0) + ')';
  }
  function mix(h1, h2, t) {
    var a = parseInt(h1.slice(1), 16), b = parseInt(h2.slice(1), 16);
    var r = Math.round((a >> 16) * (1 - t) + (b >> 16) * t), g = Math.round(((a >> 8) & 255) * (1 - t) + ((b >> 8) & 255) * t), bl = Math.round((a & 255) * (1 - t) + (b & 255) * t);
    return '#' + ((1 << 24) + (r << 16) + (g << 8) + bl).toString(16).slice(1);
  }
  function hhmm(min) { var m = ((min % DAY) + DAY) % DAY; var h = Math.floor(m / 60), mm = Math.floor(m % 60); return (h < 10 ? '0' : '') + h + ':' + (mm < 10 ? '0' : '') + mm; }

  var HOME = null, V = null, REMOTE = {};   // visitas: casa propia guardada, contexto de visita, invitados remotos en mi casa
  var S = null;        // estado de la partida (serializable; las claves que empiezan por _ no se guardan)
  // ---------- Catálogo de objetos ----------
  var CAT = {
    nevera: { n: 'Nevera Fresquita', cat: 'Cocina', p: 600, w: 1, h: 1, ht: 62, acts: ['snack'] },
    cocina: { n: 'Cocina Vitro-Escama', cat: 'Cocina', p: 450, w: 1, h: 1, ht: 30, acts: ['cook'] },
    cama: { n: 'Cama Enroscada', cat: 'Dormitorio', p: 700, w: 1, h: 2, ht: 16, on: 1, acts: ['sleep', 'nap', 'hibernate'] },
    cuna: { n: 'Cesta de cría', cat: 'Dormitorio', p: 250, w: 1, h: 1, ht: 14, on: 1, acts: ['sleep'] },
    ducha: { n: 'Ducha Lluvia Tropical', cat: 'Baño', p: 500, w: 1, h: 1, ht: 70, on: 1, acts: ['shower'] },
    vater: { n: 'Váter Silencioso', cat: 'Baño', p: 300, w: 1, h: 1, ht: 26, on: 1, acts: ['toilet'] },
    sofa: { n: 'Sofá Ovillo', cat: 'Salón', p: 550, w: 2, h: 1, ht: 24, on: 1, cap: 2, acts: ['relax'] },
    tv: { n: 'Tele Plana 50"', cat: 'Ocio', p: 800, w: 1, h: 1, ht: 44, far: 1, cap: 3, acts: ['tv'] },
    ordenador: { n: 'Ordenador Pitón', cat: 'Ocio', p: 900, w: 1, h: 1, ht: 40, acts: ['pcplay', 'pcresearch', 'pcjob'] },
    estanteria: { n: 'Estantería de libros', cat: 'Ocio', p: 350, w: 1, h: 1, ht: 66, acts: ['read'] },
    espejo: { n: 'Espejo de pie', cat: 'Ocio', p: 150, w: 1, h: 1, ht: 58, acts: ['mirror'] },
    radio: { n: 'Equipo de música', cat: 'Ocio', p: 300, w: 1, h: 1, ht: 30, cap: 4, far: 1, acts: ['dance', 'listen'] },
    terrario: { n: 'Terrario-calefactor', cat: 'Reptil', p: 650, w: 1, h: 1, ht: 46, on: 1, acts: ['terr', 'hibernate'] },
    piedra: { n: 'Piedra caliente', cat: 'Reptil', p: 300, w: 1, h: 1, ht: 14, on: 1, acts: ['rock'] },
    poste: { n: 'Poste de enroscar', cat: 'Reptil', p: 400, w: 1, h: 1, ht: 70, acts: ['train'] },
    planta: { n: 'Planta en maceta', cat: 'Decoración', p: 80, w: 1, h: 1, ht: 40, decor: 2 },
    lampara: { n: 'Lámpara de pie', cat: 'Decoración', p: 120, w: 1, h: 1, ht: 64, decor: 1, light: 1 },
    tumbona: { n: 'Tumbona solar', cat: 'Exterior', p: 250, w: 1, h: 2, ht: 14, on: 1, acts: ['lounger'] },
    arbol: { n: 'Árbol frutal', cat: 'Exterior', p: 180, w: 1, h: 1, ht: 90, decor: 3 },
    huevo: { n: 'Huevo', nobuy: 1, p: 0, w: 1, h: 1, ht: 18, acts: ['incubate'] },
    piel: { n: 'Piel mudada', nobuy: 1, p: 60, w: 1, h: 1, ht: 4, acts: ['pickup'] },
    hallazgo: { n: 'Algo escondido', nobuy: 1, p: 0, w: 1, h: 1, ht: 8, acts: ['pickup'] }
  };
  var BUY_CATS = ['Cocina', 'Dormitorio', 'Baño', 'Salón', 'Ocio', 'Reptil', 'Decoración', 'Exterior'];

  // ---------- Acciones ----------
  function isWinter() { return season() === 3; }
  function isDay() { var h = hour(); return h >= 8 && h < 19; }
  function isSunny() { return isDay() && S.weather.k !== 'tormenta' && !isWinter(); }
  var ACT = {
    snack: { l: 'Tomar un tentempié', i: '🧀', c: 'eat', dur: 20, tot: { hunger: 32 }, b: 1 },
    cook: { l: 'Cocinar ratón asado', i: '🍳', c: 'cook', dur: 55, tot: { hunger: 72, fun: 6 }, sk: ['cocina', 1.2], ages: ['joven', 'adulto', 'anciano'],
      end: function (sn) { if (sn.skills.cocina < 2 && Math.random() < 0.18) { sn.needs.hunger = clamp(sn.needs.hunger - 35, 0, 100); think(sn, '🔥'); toast(sn.name + ' ha quemado la comida… sabe a carbón.', 'warn'); } } },
    sleep: { l: 'Dormir', i: '💤', c: 'sleep', until: 'energy', max: 660, rate: { energy: 13 }, sleeping: 1, b: 1 },
    nap: { l: 'Echar una siesta', i: '😪', c: 'sleep', dur: 90, rate: { energy: 12 }, sleeping: 1 },
    hibernate: { l: 'Hibernar', i: '🛌', c: 'hib', dur: 1200, hib: 1, sleeping: 1, ok: function () { return isWinter() || 'Solo se hiberna en invierno'; },
      end: function (sn) { addMood(sn, 'hib', 'Hibernación reparadora', 22, 48); sn.needs.energy = 100; sn.needs.warmth = Math.max(sn.needs.warmth, 70); unlock('hibernador'); logEv(sn, 'ha hibernado'); } },
    shower: { l: 'Ducharse', i: '🚿', c: 'hygiene', dur: 25, tot: { hygiene: 85, warmth: 8 } },
    toilet: { l: 'Usar el váter', i: '🚽', c: 'bladder', dur: 10, tot: { bladder: 100 } },
    relax: { l: 'Relajarse en el sofá', i: '🛋️', c: 'fun', dur: 60, tot: { fun: 18, energy: 8 }, b: 1 },
    tv: { l: 'Ver la tele', i: '📺', c: 'fun', dur: 60, tot: { fun: 45, energy: -3 }, b: 1 },
    pcplay: { l: 'Jugar a videojuegos', i: '🎮', c: 'fun', dur: 60, tot: { fun: 50 }, sk: ['logica', 0.3], ages: ['joven', 'adulto', 'anciano'] },
    pcresearch: { l: 'Investigar herpetología', i: '🧪', c: 'study', dur: 60, tot: { fun: 4 }, sk: ['logica', 1.1], ages: ['joven', 'adulto', 'anciano'] },
    pcjob: { l: 'Buscar trabajo', i: '💼', c: 'job', dur: 20, ages: ['adulto', 'anciano'], noauto: 1,
      end: function (sn, a) { if (a.arg && CAREERS[a.arg]) { sn.job = { c: a.arg, lv: 0, perf: 0 }; var C = CAREERS[a.arg]; toast(sn.name + ' empieza en ' + C.n + ' como ' + C.lv[0][0] + ' (' + hhmm(C.h[0] * 60) + '–' + hhmm(C.h[1] * 60) + ', L-V).', 'good'); logEv(sn, 'ha conseguido trabajo de ' + C.lv[0][0]); } } },
    read: { l: 'Leer un libro', i: '📖', c: 'study', dur: 60, tot: { fun: 22 }, sk: ['logica', 0.8], ages: ['joven', 'adulto', 'anciano'] },
    mirror: { l: 'Ensayar discurso', i: '🗣️', c: 'study', dur: 45, tot: { fun: 6 }, sk: ['carisma', 1.2], ages: ['joven', 'adulto', 'anciano'] },
    terr: { l: 'Calentarse en el terrario', i: '🔥', c: 'warm', dur: 45, tot: { warmth: 65 }, b: 1 },
    rock: { l: 'Tumbarse en la piedra caliente', i: '🪨', c: 'warm', dur: 45, tot: { warmth: 55, fun: 4 }, b: 1 },
    bask: { l: 'Tomar el sol', i: '😎', c: 'warm', at: 'out', dur: 60, tot: { warmth: 70, fun: 8 }, b: 1, ok: function () { return isSunny() || (isWinter() ? 'En invierno el sol no calienta' : 'Ahora no hay sol'); } },
    lounger: { l: 'Tomar el sol en la tumbona', i: '😎', c: 'warm', dur: 60, tot: { warmth: 75, fun: 15, energy: 5 }, ok: function () { return isSunny() || 'Ahora no hay sol'; } },
    train: { l: 'Entrenar constricción', i: '💪', c: 'train', dur: 60, tot: { energy: -12, hygiene: -12, fun: 10 }, sk: ['constriccion', 1.2], ages: ['joven', 'adulto', 'anciano'] },
    dance: { l: 'Bailar', i: '💃', c: 'fun', dur: 45, tot: { fun: 40, energy: -10, social: 6 } },
    listen: { l: 'Escuchar música', i: '🎵', c: 'fun', dur: 45, tot: { fun: 22 }, b: 1 },
    stealth: { l: 'Practicar sigilo', i: '🥷', c: 'stealth', at: 'out', dur: 45, tot: { fun: 6, energy: -5 }, sk: ['sigilo', 1.2], ages: ['joven', 'adulto', 'anciano'] },
    sniff: { l: 'Olfatear con la lengua', i: '👅', c: 'sniff', at: 'self', dur: 20, tot: { fun: 4 }, sk: ['olfato', 1.3], end: function (sn) { sniffResult(sn); } },
    shed: { l: 'Mudar la piel', i: '✨', c: 'shed', at: 'self', dur: 90, ok: function (sn) { return sn.shedReady || 'Aún no le toca mudar'; }, end: function (sn) { doShed(sn); }, b: 1 },
    playalone: { l: 'Jugar sola', i: '🧸', c: 'fun', at: 'self', dur: 40, tot: { fun: 30 }, b: 1, ages: ['bebe', 'joven'] },
    go: { l: 'Ir aquí', i: '👣', c: 'go', at: 'tile', dur: 0, b: 1, noauto: 1 },
    idle: { l: 'Pasar el rato', i: '🙂', c: 'idle', at: 'self', dur: 15, b: 1, noauto: 1 },
    pickup: { l: 'Recoger', i: '🫳', c: 'pick', dur: 5, end: function (sn, a) { pickupObj(sn, a.obj); } },
    incubate: { l: 'Incubar el huevo', i: '🥚', c: 'egg', dur: 120, tot: { warmth: 10, fun: -4 } },
    hunt: { l: 'Cazar el ratón', i: '🐭', c: 'hunt', at: 'target', dur: 15, ages: ['joven', 'adulto', 'anciano'], end: function (sn) { huntResult(sn); } },
    gowork: { l: 'Ir al trabajo', i: '🚌', c: 'job', at: 'edge', dur: 0, noauto: 1, nocancel: 0 },
    floor: { l: 'Dormir en el suelo', i: '😵', c: 'sleep', at: 'self', until: 'energy', max: 240, rate: { energy: 10 }, sleeping: 1, noauto: 1, b: 1 },
    recv: { l: 'Socializar', i: '💬', c: 'social', at: 'self', noauto: 1, b: 1 }
  };
  // Interacciones sociales (objetivo: otra serpiente, cría o vecino)
  var SOC = {
    chat: { l: 'Charlar', i: '💬', c: 'social', dur: 30, fr: 6, ff: -3, need: { social: 25, fun: 5 } },
    joke: { l: 'Bromear', i: '😂', c: 'joke', dur: 25, fr: 8, ff: -5, need: { social: 18, fun: 16 } },
    hug: { l: 'Abrazar enroscándose', i: '🤗', c: 'social', dur: 20, fr: 10, ff: -7, need: { social: 22, fun: 6 }, req: function (a, b, r) { return r.fr >= 30 || 'Necesitan más amistad (30)'; } },
    argue: { l: 'Discutir', i: '😤', c: 'argue', dur: 25, fr: -14, ff: -14, need: { social: 6 }, always: 1 },
    flirt: { l: 'Coquetear', i: '😏', c: 'romance', dur: 25, fr: 3, ff: -4, ro: 10, need: { social: 16, fun: 6 }, adult: 1, req: function (a, b, r) { return r.fr >= 25 || 'Necesitan más amistad (25)'; } },
    nuzzle: { l: 'Rozar hocicos', i: '😘', c: 'romance', dur: 20, fr: 4, ff: -6, ro: 12, need: { social: 20 }, adult: 1, req: function (a, b, r) { return r.ro >= 35 || 'Necesitan más romance (35)'; } },
    propose: { l: 'Pedir ser pareja', i: '💍', c: 'romance', dur: 30, fr: 6, ff: -10, ro: 10, need: { social: 20 }, adult: 1, req: function (a, b, r) { return a.partner === b.id ? 'Ya son pareja' : (r.ro >= 60 || 'Necesitan más romance (60)'); } },
    eggs: { l: 'Poner huevos', i: '🥚', c: 'romance', dur: 60, fr: 4, ro: 5, need: { social: 20, energy: -15 }, adult: 1, always: 1, req: function (a, b, r) {
      if (a.partner !== b.id) return 'Tienen que ser pareja'; if (r.ro < 70) return 'Necesitan más romance (70)';
      if (familySize() >= 8) return 'La familia está completa (8)'; if ((a.eggCd || 0) > S.time || (b.eggCd || 0) > S.time) return 'Hace poco que pusieron huevos'; return true; } },
    feed: { l: 'Dar de comer a la cría', i: '🍼', c: 'care', dur: 15, fr: 4, need: {}, kid: 1, always: 1 },
    bathe: { l: 'Bañar a la cría', i: '🛁', c: 'care', dur: 20, fr: 3, need: {}, kid: 1, always: 1 },
    playkid: { l: 'Jugar con la cría', i: '🪀', c: 'care', dur: 30, fr: 7, need: { fun: 20, social: 15 }, kid: 1, always: 1 },
    cuddle: { l: 'Acunar', i: '🌙', c: 'care', dur: 30, fr: 5, need: { social: 10 }, kid: 1, always: 1 },
    treat: { l: 'Invitar a un tentempié', i: '🧁', c: 'social', dur: 30, fr: 12, ff: 0, need: { social: 20, hunger: 10 }, vis: 1, always: 1, cost: 15 },
    bye: { l: 'Despedirse', i: '👋', c: 'social', dur: 5, fr: 1, need: {}, vis: 1, always: 1 }
  };

  // ---------- Mundo ----------
  function season() { return Math.floor(Math.floor(S.time / DAY) / 7) % 4; }
  function dayIdx() { return Math.floor(S.time / DAY); }
  function hour() { return Math.floor((S.time % DAY) / 60); }
  function weekday() { return dayIdx() % 7; }
  function inside(x, y) { return x >= 1 && x <= 11 && y >= 1 && y <= 9; }
  function inLot(x, y) { return x >= 0 && y >= 0 && x < GW && y < GH; }
  function fp(o) { var c = CAT[o.t]; return (o.r & 1) ? { w: c.h, h: c.w } : { w: c.w, h: c.h }; }
  function objTiles(o) { var f = fp(o), r = []; for (var i = 0; i < f.w; i++) for (var j = 0; j < f.h; j++) r.push([o.x + i, o.y + j]); return r; }
  function objById(id) { for (var i = 0; i < S.objects.length; i++) if (S.objects[i].id === id) return S.objects[i]; return null; }
  function entById(id) {
    var i; for (i = 0; i < S.snakes.length; i++) if (S.snakes[i].id === id) return S.snakes[i];
    for (i = 0; i < S.visitors.length; i++) if (S.visitors[i].id === id) return S.visitors[i];
    if (S.hosts) for (i = 0; i < S.hosts.length; i++) if (S.hosts[i].id === id) return S.hosts[i];
    for (var rk in REMOTE) if (REMOTE[rk].id === id) return REMOTE[rk];
    if (S.mouse && S.mouse.id === id) return S.mouse; return null;
  }
  function nid() { return S.nid++; }
  function familySize() { return S.snakes.length + S.objects.filter(function (o) { return o.t === 'huevo'; }).length; }

  function buildHouse() {
    var w = [], doors = [], x, y;
    for (x = 1; x <= 11; x++) { w.push('h,' + x + ',1'); if (x !== 6) w.push('h,' + x + ',10'); else doors.push('h,6,10'); }
    for (y = 1; y <= 9; y++) { w.push('v,1,' + y); if (y !== 7) w.push('v,12,' + y); else doors.push('v,12,7'); }
    for (x = 1; x <= 3; x++) w.push('h,' + x + ',4');
    for (y = 1; y <= 3; y++) { if (y !== 3) w.push('v,4,' + y); else doors.push('v,4,3'); }
    for (y = 1; y <= 5; y++) { if (y !== 4) w.push('v,8,' + y); else doors.push('v,8,4'); }
    for (x = 8; x <= 11; x++) w.push('h,' + x + ',6');
    return { walls: w, doors: doors };
  }
  function rebuildCaches() {
    S._wallset = {}; S.walls.forEach(function (k) { S._wallset[k] = 1; });
    S._occ = new Array(GW * GH); for (var i = 0; i < S._occ.length; i++) S._occ[i] = 0;
    S.objects.forEach(function (o) { objTiles(o).forEach(function (t) { if (inLot(t[0], t[1])) S._occ[t[1] * GW + t[0]] = o.id; }); });
  }
  function occ(x, y) { return inLot(x, y) ? S._occ[y * GW + x] : -1; }
  function canStep(x, y, nx, ny) {
    if (!inLot(nx, ny)) return false;
    if (nx === x + 1) return !S._wallset['v,' + nx + ',' + y];
    if (nx === x - 1) return !S._wallset['v,' + x + ',' + y];
    if (ny === y + 1) return !S._wallset['h,' + x + ',' + ny];
    if (ny === y - 1) return !S._wallset['h,' + x + ',' + y];
    return false;
  }
  var DIRS = [[1, 0], [-1, 0], [0, 1], [0, -1]];
  // BFS: devuelve camino (sin la casilla inicial) hasta una casilla que cumpla goal(x,y). allowId: objeto que se puede pisar
  function bfs(sx, sy, goal, allowId) {
    if (goal(sx, sy)) return [];
    var prev = new Int32Array(GW * GH).fill(-2), qx = [sx], qy = [sy], h = 0;
    prev[sy * GW + sx] = -1;
    while (h < qx.length) {
      var x = qx[h], y = qy[h]; h++;
      for (var d = 0; d < 4; d++) {
        var nx = x + DIRS[d][0], ny = y + DIRS[d][1];
        if (!inLot(nx, ny) || prev[ny * GW + nx] !== -2 || !canStep(x, y, nx, ny)) continue;
        var o = S._occ[ny * GW + nx]; if (o && o !== allowId) continue;
        prev[ny * GW + nx] = y * GW + x;
        if (goal(nx, ny)) { var path = [], c = ny * GW + nx; while (c !== sy * GW + sx) { path.unshift([c % GW, Math.floor(c / GW)]); c = prev[c]; } return path; }
        qx.push(nx); qy.push(ny);
      }
    }
    return null;
  }
  function frontDir(o) { return [[0, 1], [1, 0], [0, -1], [-1, 0]][o.r & 3]; }
  // casillas desde las que se usa un objeto
  function useGoal(o) {
    var c = CAT[o.t], tiles = objTiles(o), set = {};
    if (c.on) { tiles.forEach(function (t) { set[t[0] + ',' + t[1]] = 1; }); return function (x, y) { return !!set[x + ',' + y]; }; }
    if (c.far) {
      var fd = frontDir(o);
      tiles.forEach(function (t) { for (var k = 1; k <= 3; k++) set[(t[0] + fd[0] * k) + ',' + (t[1] + fd[1] * k)] = 1; });
      // también vale cualquier adyacente por si el frente está tapado
      tiles.forEach(function (t) { DIRS.forEach(function (d) { var k2 = (t[0] + d[0]) + ',' + (t[1] + d[1]); if (!set[k2] && canStep(t[0], t[1], t[0] + d[0], t[1] + d[1])) set[k2] = 2; }); });
      return function (x, y) { return !!set[x + ',' + y] && !occ(x, y); };
    }
    tiles.forEach(function (t) { DIRS.forEach(function (d) { if (canStep(t[0], t[1], t[0] + d[0], t[1] + d[1])) set[(t[0] + d[0]) + ',' + (t[1] + d[1])] = 1; }); });
    return function (x, y) { return !!set[x + ',' + y] && !occ(x, y); };
  }
  function adjGoal(tx, ty) {
    return function (x, y) { return Math.abs(x - tx) + Math.abs(y - ty) === 1 && canStep(x, y, tx, ty) && !occ(x, y); };
  }
  function nearestFree(x, y) {
    var p = bfs(clamp(x, 0, GW - 1), clamp(y, 0, GH - 1), function (a, b) { return !occ(a, b); }, -99);
    if (p && p.length) return p[p.length - 1];
    for (var r = 1; r < 16; r++) for (var i = -r; i <= r; i++) for (var j = -r; j <= r; j++) if (inLot(x + i, y + j) && !occ(x + i, y + j)) return [x + i, y + j];
    return [EXIT[0], EXIT[1]];
  }
  // ---------- Serpientes ----------
  function makeSnake(o) {
    var needs = {}; NEEDS.forEach(function (n) { needs[n.k] = rnd(65, 95); });
    var skills = {}; Object.keys(SKILLS).forEach(function (k) { skills[k] = 0; });
    var pat = o.pattern || 'lisa';
    return { id: nid(), name: o.name || pick(NAMES), color: o.color || pick(PALETTE).c, pattern: pat, patterns: [pat], traits: (o.traits || []).slice(0, 3),
      age: o.age || 'adulto', ageD: 0, asp: o.asp || pick(Object.keys(ASP)), aspDone: false, needs: needs, skills: skills, rel: {}, job: null, school: { perf: 50 },
      x: 6.5, y: 7.5, fx: 1, q: [], mood: 70, ml: [], shed: ri(0, 2), shedAt: ri(4, 6), shedReady: false, partner: null, away: null,
      today: { acts: {}, who: {}, ev: [] }, diary: [], finds: 0, eggCd: 0, idle: 0, seen: {} };
  }
  function relOf(a, b) { var k = String(b.id); if (!a.rel[k]) a.rel[k] = { fr: 0, ro: 0, n: b.name }; return a.rel[k]; }
  function hasTrait(sn, t) { return sn.traits && sn.traits.indexOf(t) >= 0; }
  function traitMul(sn, field, key) { var m = 1; (sn.traits || []).forEach(function (t) { var T = TRAITS[t]; if (T && T[field] && T[field][key]) m *= T[field][key]; }); return m; }
  function traitAdd(sn, field) { var v = 0; (sn.traits || []).forEach(function (t) { var T = TRAITS[t]; if (T && T[field]) v += T[field]; }); return v; }
  function addMood(sn, id, label, val, hours) {
    sn.ml = sn.ml.filter(function (m) { return m.id !== id; });
    sn.ml.push({ id: id, l: label, v: val, until: S.time + hours * 60 });
  }
  function calcMood(sn) {
    var sum = 0, mn = 100; NEEDS.forEach(function (n) { var v = sn.needs[n.k]; sum += v; if (v < mn) mn = v; });
    var m = 0.55 * (sum / NEEDS.length) + 0.45 * mn;
    sn.ml.forEach(function (x) { m += x.v; });
    m += roomDecor(sn) * 0.6;
    sn.mood = clamp(m, 0, 100);
    return sn.mood;
  }
  function moodLabel(m) { return m >= 80 ? 'Radiante' : m >= 62 ? 'Contenta' : m >= 42 ? 'Normal' : m >= 22 ? 'Tensa' : 'Fatal'; }
  function moodColor(m) { return 'hsl(' + Math.round(clamp(m, 0, 100) * 1.25) + ',78%,48%)'; }
  function roomDecor(sn) {
    var x = Math.floor(sn.x), y = Math.floor(sn.y), d = 0;
    S.objects.forEach(function (o) { var c = CAT[o.t]; if (c.decor && Math.abs(o.x - x) <= 3 && Math.abs(o.y - y) <= 3) d += c.decor; });
    return Math.min(8, d);
  }
  function think(sn, ic, txt, secs) { sn._th = { i: ic, txt: txt || '', until: performance.now() + (secs || (txt ? 7 : 3.2)) * 1000 }; }
  function logEv(sn, txt) { if (sn.today) sn.today.ev.push(txt); }
  function countAct(sn, label) { if (!sn.today) return; sn.today.acts[label] = (sn.today.acts[label] || 0) + 1; }
  function canDo(sn, def, tgt) {
    if (sn.away) return 'Está fuera de casa';
    var ages = def.ages || (def.b ? null : ['joven', 'adulto', 'anciano']);
    if (ages && ages.indexOf(sn.age) < 0) return 'No a esa edad (' + AGES[sn.age].n.toLowerCase() + ')';
    if (def.ok) { var r = def.ok(sn, tgt); if (r !== true) return r; }
    return true;
  }

  // Cola de acciones
  function enqueue(sn, a, front) {
    if (!sn || sn.away) return false;
    a.phase = 'walk'; a.t = 0; a.started = false;
    if (a.user) sn.q = sn.q.filter(function (x, i) { return x.user || (i === 0 && x.started && x.id !== 'idle'); });
    if (front) { if (sn.q[0]) { leaveObj(sn); sn.q[0].started = false; sn.q[0].phase = 'walk'; sn.q[0]._path = null; } sn.q.unshift(a); }
    else { if (sn.q.length >= 7) return false; sn.q.push(a); }
    sn.idle = 0; return true;
  }
  function cancelAt(sn, i) {
    var a = sn.q[i]; if (!a) return; if (a.id === 'recv') return;
    if (i === 0) { endSocialPartner(sn, a, true); leaveObj(sn); }
    sn.q.splice(i, 1);
    if (sn.q[0]) { sn.q[0].started = false; sn.q[0].phase = 'walk'; sn.q[0]._path = null; }
  }
  function leaveObj(sn) {
    if (sn._on) { var o = objById(sn._on); if (o && o._users) o._users = o._users.filter(function (id) { return id !== sn.id; }); sn._on = 0; }
    if (sn._onTile) { var p = nearestFree(Math.floor(sn.x), Math.floor(sn.y)); if (occ(Math.floor(sn.x), Math.floor(sn.y))) { sn.x = p[0] + 0.5; sn.y = p[1] + 0.5; } sn._onTile = 0; }
  }
  function objUsers(o) { if (!o._users) o._users = []; o._users = o._users.filter(function (id) { var e = entById(id); return e && e.q && e.q[0] && e.q[0].obj === o.id && e.q[0].phase === 'do'; }); return o._users; }
  function planPath(sn, a) {
    var x = Math.floor(sn.x), y = Math.floor(sn.y), def = ACT[a.id] || SOC[a.id] || {}, at = def.at || (a.soc ? 'target' : 'obj');
    if (a.soc) at = 'target';
    if (at === 'self') return [];
    if (at === 'tile') return bfs(x, y, function (gx, gy) { return gx === a.tile[0] && gy === a.tile[1]; }, -1) || bfs(x, y, adjGoal(a.tile[0], a.tile[1]), -1);
    if (at === 'out') { if (!inside(x, y)) return []; return bfs(x, y, function (gx, gy) { return !inside(gx, gy) && !occ(gx, gy); }, -1); }
    if (at === 'edge') return bfs(x, y, function (gx, gy) { return gx === EXIT[0] && gy === EXIT[1]; }, -1) || [];
    if (at === 'target') {
      var t = entById(a.target); if (!t || t.away) return null;
      var tx = Math.floor(t.x), ty = Math.floor(t.y);
      if (Math.abs(tx - x) + Math.abs(ty - y) <= 1 && (tx !== x || ty !== y)) return [];
      return bfs(x, y, adjGoal(tx, ty), -1) || bfs(x, y, function (gx, gy) { return Math.abs(gx - tx) <= 1 && Math.abs(gy - ty) <= 1 && !occ(gx, gy); }, -1);
    }
    var o = objById(a.obj); if (!o) return null;
    return bfs(x, y, useGoal(o), CAT[o.t].on ? o.id : -1);
  }

  function stepSnake(sn, dm) {
    // necesidades
    var a = sn.q[0], doing = a && a.phase === 'do', def = a ? (ACT[a.id] || SOC[a.id] || {}) : {};
    var sleeping = doing && def.sleeping, hib = doing && def.hib, ageM = sn.age === 'bebe' ? 1.15 : sn.age === 'anciano' ? 1.1 : 1;
    var awayM = sn.away ? 0.55 : 1, outside = !inside(Math.floor(sn.x), Math.floor(sn.y));
    NEEDS.forEach(function (n) {
      var r = n.d * traitMul(sn, 'dec', n.k) * ageM * awayM;
      if (hib) r = n.k === 'hunger' ? 0.25 : 0;
      else if (sleeping) { if (n.k === 'energy') r = 0; else if (n.k === 'fun' || n.k === 'social') r = 0.2; else r *= 0.45; }
      if (n.k === 'warmth' && !hib) {
        var h = hour(); r *= (h >= 21 || h < 7) ? 1.35 : 1; r *= [1, 0.6, 1.1, 1.8][season()];
        if (S.weather.k === 'tormenta') r *= 1.3;
        if (outside && isSunny() && !sn.away) r = -4;
        if (sleeping && !hib) r *= 0.6;
      }
      if (n.k === 'social' && S.party > S.time && !sn.away) r = -6;
      if (n.k === 'bladder' && sn.age === 'bebe') r = 0; // pañal escamoso
      sn.needs[n.k] = clamp(sn.needs[n.k] - r * dm / 60, 0, 100);
    });
    sn.ml = sn.ml.filter(function (m) { return m.until > S.time; });
    if (sn.away) { calcMood(sn); sn._workMood = (sn._workMood || 0) + sn.mood * dm; sn._workMin = (sn._workMin || 0) + dm; if (S.time >= sn.away.until) comeBack(sn); return; }
    // fallos de necesidades
    if (sn.needs.bladder <= 0) { sn.needs.bladder = 100; sn.needs.hygiene = 0; addMood(sn, 'acc', '¡Qué vergüenza!', -20, 6); think(sn, '💦'); toast(sn.name + ' no llegó al váter a tiempo… 💦', 'bad'); logEv(sn, 'tuvo un accidente'); }
    if (sn.needs.energy <= 0 && !sleeping) { enqueue(sn, { id: 'floor', label: ACT.floor.l }, true); toast(sn.name + ' se ha quedado dormida en el suelo de puro cansancio.', 'warn'); }
    if (sn.needs.hunger <= 0) { sn.needs.hunger = 45; S.money -= 150; addMood(sn, 'famine', 'Hambre atroz', -25, 8); toast('La Granja de Ratones trae comida de urgencia para ' + sn.name + ' (−§150).', 'bad'); }
    if (sn.needs.warmth <= 3) { addMood(sn, 'cold', 'Congelada', -18, 3); }
    if (sn.shedReady && S.time - (sn._shedReadyAt || S.time) > DAY) addMood(sn, 'tight', 'Piel tirante', -10, 2);
    calcMood(sn);
    // acción actual
    a = sn.q[0];
    if (!a) {
      sn.idle += dm;
      if ((S.settings.freeWill || sn.age === 'bebe') && sn.idle > (sn.age === 'bebe' ? 4 : 6)) { sn.idle = 0; autonomy(sn); }
      return;
    }
    def = ACT[a.id] || SOC[a.id] || {};
    if (a.phase === 'walk') {
      if (!a._path) {
        var chk = a.soc ? true : canDo(sn, def, a.obj ? objById(a.obj) : null);
        if (chk !== true) { failAct(sn, chk); return; }
        var p = planPath(sn, a);
        if (p === null) { failAct(sn, 'No puedo llegar'); return; }
        a._path = p; a._wait = 0;
        if (a.target) { var t0 = entById(a.target); if (t0) a._tpos = [Math.floor(t0.x), Math.floor(t0.y)]; }
        leaveObj(sn);
      }
      if (a.target && a._tpos) { var tg = entById(a.target); if (!tg || tg.away) { failAct(sn, 'Se ha ido'); return; } var tp = [Math.floor(tg.x), Math.floor(tg.y)]; if (Math.abs(tp[0] - a._tpos[0]) + Math.abs(tp[1] - a._tpos[1]) > 1) { a._path = null; return; } }
      if (a._path.length) { moveAlong(sn, a._path, dm); return; }
      // llegada
      if (a.id === 'go') { sn.q.shift(); return; }
      if (a.id === 'gowork') { leaveForWork(sn); return; }
      if (a.obj) {
        var o = objById(a.obj); if (!o) { failAct(sn, 'Ya no está'); return; }
        var cap = CAT[o.t].cap || 1, us = objUsers(o);
        if (us.length >= cap && us.indexOf(sn.id) < 0) {
          if (a.user) { for (var ui2 = 0; ui2 < us.length; ui2++) { var other = entById(us[ui2]); if (other && other.q[0] && !other.q[0].user) { think(other, '😒'); cancelAt(other, 0); break; } } }
          a._wait = (a._wait || 0) + dm; think(sn, '⏳'); if (a._wait > (a.user ? 120 : 40)) failAct(sn, 'Está ocupado'); return; }
        us.push(sn.id); o._users = us; sn._on = o.id;
        if (CAT[o.t].on) { var tl = objTiles(o)[us.length - 1] || [o.x, o.y]; sn.x = tl[0] + 0.5; sn.y = tl[1] + 0.5; sn._onTile = 1; }
        faceTo(sn, o.x + 0.5, o.y + 0.5);
      }
      if (a.soc) { if (!startSocial(sn, a)) return; }
      a.phase = 'do'; a.t = 0; a.started = true; countAct(sn, a.label || def.l);
      if (a.id === 'hunt') huntStart(sn, a);
      return;
    }
    // haciendo
    a.t += dm;
    var dur = a.dur || def.dur || 30;
    if (def.tot) for (var k in def.tot) sn.needs[k] = clamp(sn.needs[k] + def.tot[k] * dm / dur * (a.id === 'rock' && !isDay() ? 0.4 : 1), 0, 100);
    if (def.rate) for (var k2 in def.rate) sn.needs[k2] = clamp(sn.needs[k2] + def.rate[k2] * dm / 60, 0, 100);
    if (def.sk) gainSkill(sn, def.sk[0], def.sk[1] * dm / 60);
    if (a.id === 'incubate') { var eg = objById(a.obj); if (eg) eg.prog = Math.min(100, (eg.prog || 0) + 100 / (48 * 60) * 3 * dm); }
    if (a.id === 'hunt' && S.mouse) { S.mouse.x = sn.x + sn.fx * 0.4; }
    var done = def.until ? (sn.needs[def.until] >= 99 || a.t >= (def.max || 600)) : a.t >= dur;
    if (def.sleeping && def.until && hour() === 7 && sn.needs.energy > 75) done = true;
    if (done) finishAct(sn, a, def);
  }
  function failAct(sn, why) { think(sn, '❓', typeof why === 'string' ? why : '', 3); var a = sn.q.shift(); if (a) endSocialPartner(sn, a, true); leaveObj(sn); if (sn.q[0]) { sn.q[0].phase = 'walk'; sn.q[0]._path = null; } }
  function finishAct(sn, a, def) {
    if (a.soc) endSocial(sn, a);
    if (def.end) def.end(sn, a);
    if (a.id === 'recv') { /* el actor resuelve */ }
    sn.q.shift(); leaveObj(sn);
    if (sn.q[0]) { sn.q[0].phase = 'walk'; sn.q[0]._path = null; }
  }
  function moveAlong(sn, path, dm) {
    var sp = (sn.age === 'bebe' ? 0.65 : sn.age === 'anciano' ? 0.75 : 1) * (sn.needs && sn.needs.warmth < 12 ? 0.6 : 1) * (sn.sp || 1);
    var dist = sp * dm * 1.1;
    while (dist > 0 && path.length) {
      var tx = path[0][0] + 0.5, ty = path[0][1] + 0.5, dx = tx - sn.x, dy = ty - sn.y, d = Math.sqrt(dx * dx + dy * dy);
      if (d <= dist) { sn.x = tx; sn.y = ty; path.shift(); dist -= d; }
      else { sn.x += dx / d * dist; sn.y += dy / d * dist; dist = 0; }
      if (Math.abs(dx - dy) > 0.01) sn.fx = (dx - dy) > 0 ? 1 : -1;
    }
    sn._moving = performance.now();
  }
  function faceTo(sn, x, y) { var dx = x - sn.x, dy = y - sn.y; if (Math.abs(dx - dy) > 0.01) sn.fx = (dx - dy) > 0 ? 1 : -1; }
  function gainSkill(sn, k, v) {
    var before = Math.floor(sn.skills[k]);
    var m = traitMul(sn, 'skill', k) * (sn.mood > 70 ? 1.2 : sn.mood < 30 ? 0.7 : 1) * (sn.age === 'joven' ? 1.25 : 1);
    sn.skills[k] = Math.min(10, sn.skills[k] + v * m * 0.38 / (1 + sn.skills[k] * 0.5));
    var after = Math.floor(sn.skills[k]);
    if (after > before) { toast(sn.name + ' sube ' + SKILLS[k] + ' a nivel ' + after + ' ⭐', 'good'); think(sn, '⭐'); if (after >= 10) unlock('maestro'); logEv(sn, 'subió ' + SKILLS[k] + ' a nivel ' + after); }
  }

  // ---------- Social ----------
  function socChance(a, b, def, r) {
    var c = 0.62 + (a.mood - 50) / 220 + ((b.mood != null ? b.mood : 60) - 50) / 300 + r.fr / 350 + traitAdd(a, 'soc');
    if (def.c === 'joke') c += traitAdd(a, 'joke') + (hasTrait(b, 'grunon') ? -0.2 : 0);
    if (def.c === 'romance') c += traitAdd(a, 'rom') + traitAdd(b, 'rom') + (r.ro - 30) / 200;
    if (hasTrait(b, 'solitario')) c -= 0.08;
    return clamp(c, 0.1, 0.96);
  }
  function startSocial(sn, a) {
    var t = entById(a.target), def = SOC[a.id];
    if (!t || t.away) { failAct(sn, 'Se ha ido'); return false; }
    if (t.q) {
      var cur = t.q[0], cdef = cur ? (ACT[cur.id] || SOC[cur.id] || {}) : {};
      if (cur && cur.phase === 'do' && (cdef.sleeping && SOC[a.id] && !SOC[a.id].kid || cdef.hib || cur.id === 'shed' || cur.id === 'recv' || cur.soc)) { failAct(sn, t.name + ' está ocupada'); return false; }
      var rv = { id: 'recv', label: def.l, partner: sn.id, dur: def.dur, user: true };
      if (cur && cur.phase === 'do' && cdef.sleeping) { /* bebé dormido: se le atiende sin despertarlo */ }
      else { enqueue(t, rv, true); t.q[0].phase = 'do'; t.q[0].started = true; }
    } else { t._busyUntil = S.time + def.dur; t._with = sn.id; }
    faceTo(sn, t.x, t.y); if (t.fx != null) faceTo(t, sn.x, sn.y);
    var r = relOf(sn, t);
    a._ok = def.always ? (a.id !== 'argue') : Math.random() < socChance(sn, t, def, r);
    if (a.id === 'argue') a._ok = false;
    think(sn, a._ok ? def.i : '💢'); if (t.q) think(t, a._ok ? (def.c === 'romance' ? '💗' : '💚') : '💢');
    return true;
  }
  function endSocialPartner(sn, a, cancelled) {
    if (!a || !a.soc) return; var t = entById(a.target); if (!t || !t.q) return;
    if (t.q[0] && t.q[0].id === 'recv' && t.q[0].partner === sn.id) { t.q.shift(); if (t.q[0]) { t.q[0].phase = 'walk'; t.q[0]._path = null; } }
  }
  function endSocial(sn, a) {
    var t = entById(a.target), def = SOC[a.id]; if (!t) return;
    var r1 = relOf(sn, t), r2 = t.rel ? relOf(t, sn) : null, ok = a._ok, k;
    var dfr = ok ? def.fr : (def.ff || -3);
    r1.fr = clamp(r1.fr + dfr, -100, 100); if (r2) r2.fr = clamp(r2.fr + dfr, -100, 100);
    if (def.ro && ok) { r1.ro = clamp(r1.ro + def.ro, 0, 100); if (r2) r2.ro = clamp(r2.ro + def.ro, 0, 100); }
    var mul = ok ? 1 : 0.35;
    for (k in def.need) { sn.needs[k] = clamp(sn.needs[k] + def.need[k] * mul, 0, 100); if (t.needs && t.age !== 'bebe') t.needs[k] = clamp(t.needs[k] + def.need[k] * mul * 0.8, 0, 100); }
    sn.today.who[t.name] = (sn.today.who[t.name] || 0) + 1; if (t.today) t.today.who[sn.name] = (t.today.who[sn.name] || 0) + 1;
    if (a.id === 'argue') {
      [sn, t].forEach(function (x) { if (!x.needs) return; if (hasTrait(x, 'grunon')) x.needs.fun = clamp(x.needs.fun + 12, 0, 100); else addMood(x, 'argue', 'Discusión reciente', -12, 6); });
      logEv(sn, 'discutió con ' + t.name);
    }
    if (ok && a.id === 'hug') addMood(sn, 'hug', 'Abrazo enroscado', 8, 4);
    if (ok && a.id === 'nuzzle') { addMood(sn, 'love', 'Enamorada', 12, 8); if (t.needs) addMood(t, 'love', 'Enamorada', 12, 8); }
    if (ok && a.id === 'propose') { sn.partner = t.id; t.partner = sn.id; toast('💞 ¡' + sn.name + ' y ' + t.name + ' ahora son pareja!', 'good'); unlock('pareja'); logEv(sn, 'se hizo pareja de ' + t.name); logEv(t, 'se hizo pareja de ' + sn.name); }
    if (!ok && a.id === 'propose') { toast(t.name + ' ha dicho que todavía no… 💔', 'warn'); addMood(sn, 'rej', 'Rechazo', -15, 8); }
    if (a.id === 'eggs') layEggs(sn, t);
    if (a.id === 'feed' && t.needs) t.needs.hunger = clamp(t.needs.hunger + 65, 0, 100);
    if (a.id === 'bathe' && t.needs) t.needs.hygiene = clamp(t.needs.hygiene + 80, 0, 100);
    if (a.id === 'playkid' && t.needs) { t.needs.fun = clamp(t.needs.fun + 35, 0, 100); t.needs.social = clamp(t.needs.social + 30, 0, 100); }
    if (a.id === 'cuddle' && t.needs) { t.needs.energy = clamp(t.needs.energy + 30, 0, 100); t.needs.social = clamp(t.needs.social + 25, 0, 100); }
    if (a.id === 'treat') { S.money -= def.cost; }
    if (a.id === 'bye' && t.species) t.leaveAt = S.time;
    if (r1.fr >= 80) unlock('amigos');
    if (t.species && ok && !sn.seen[t.id]) { sn.seen[t.id] = 1; }
    if (t.hostSn || t.remote) netSocial(sn, t, a.id, ok, r1);
    if (S.neighbors && t.species) { var nb = S.neighbors.filter(function (n) { return n.id === t.nb; })[0]; if (nb) nb.fr = clamp((nb.fr || 0) + dfr, -100, 100); }
  }
  function layEggs(a, b) {
    var n = Math.random() < 0.3 ? 2 : 1; n = Math.min(n, 8 - familySize());
    var terr = S.objects.filter(function (o) { return o.t === 'terrario'; })[0];
    for (var i = 0; i < n; i++) {
      var base = terr ? [terr.x, terr.y + 1] : [Math.floor(a.x), Math.floor(a.y)];
      var p = nearestFree(base[0], base[1]);
      S.objects.push({ id: nid(), t: 'huevo', x: p[0], y: p[1], r: 0, prog: 0, par: [a.id, b.id], col: Math.random() < 0.5 ? a.color : b.color });
      rebuildCaches();
    }
    a.eggCd = b.eggCd = S.time + 3 * DAY;
    toast('🥚 ¡' + a.name + ' y ' + b.name + ' han puesto ' + (n > 1 ? n + ' huevos' : 'un huevo') + '! Mantenlo caliente cerca del terrario o incúbalo.', 'good');
    unlock('huevo'); logEv(a, 'puso huevos con ' + b.name); logEv(b, 'puso huevos con ' + a.name); sfx('egg');
  }
  function hatch(egg) {
    var pa = entById(egg.par[0]), pb = entById(egg.par[1]);
    var traits = []; [pa, pb].forEach(function (p) { if (p && p.traits.length) { var t = pick(p.traits); if (traits.indexOf(t) < 0) traits.push(t); } });
    if (Math.random() < 0.6) { var tt = pick(Object.keys(TRAITS)); if (traits.indexOf(tt) < 0) traits.push(tt); }
    var col = pa && pb ? (Math.random() < 0.3 ? mix(pa.color, pb.color, 0.5) : egg.col) : egg.col;
    var used = S.snakes.map(function (x) { return x.name; }), free = NAMES.filter(function (n) { return used.indexOf(n) < 0; });
    var b = makeSnake({ name: pick(free.length ? free : NAMES), color: col, age: 'bebe', traits: traits.slice(0, 3) });
    b.x = egg.x + 0.5; b.y = egg.y + 0.5; b.needs.hunger = 60;
    S.objects = S.objects.filter(function (o) { return o.id !== egg.id; }); rebuildCaches();
    S.snakes.push(b);
    [pa, pb].forEach(function (p) { if (p) { relOf(p, b).fr = 50; relOf(b, p).fr = 50; addMood(p, 'baby', '¡Nueva cría!', 25, 24); logEv(p, 'vio nacer a ' + b.name); } });
    S.snakes.forEach(function (s) { if (s !== b && s !== pa && s !== pb) { relOf(s, b).fr = 25; relOf(b, s).fr = 25; } });
    S.stats.births = (S.stats.births || 0) + 1;
    toast('🐣 ¡Ha nacido ' + b.name + '! Ponle nombre en su ficha.', 'good'); unlock('nacimiento'); sfx('ach');
    if (UI) UI.askName(b);
  }

  // ---------- Muda, olfato, caza ----------
  function doShed(sn) {
    sn.shedReady = false; sn.shed = 0; sn.shedAt = ri(4, 6);
    sn.needs.hygiene = 100; addMood(sn, 'shed', 'Piel nueva y brillante', 25, 24);
    var locked = Object.keys(PATTERNS).filter(function (p) { return sn.patterns.indexOf(p) < 0; });
    var msg = '';
    if (locked.length) { var np = pick(locked); sn.patterns.push(np); sn.pattern = np; msg = ' Nuevo patrón: ' + PATTERNS[np] + '.'; }
    var p = nearestFree(Math.floor(sn.x), Math.floor(sn.y));
    S.objects.push({ id: nid(), t: 'piel', x: p[0], y: p[1], r: 0, col: sn.color }); rebuildCaches();
    toast('✨ ' + sn.name + ' ha mudado la piel.' + msg, 'good'); think(sn, '✨'); sfx('ach');
    unlock('primera_muda'); if (sn.patterns.length >= 4) unlock('patrones');
    logEv(sn, 'mudó la piel' + (msg ? ' y estrena ' + PATTERNS[sn.pattern] : ''));
  }
  function spawnHidden() {
    for (var tries = 0; tries < 30; tries++) {
      var x = ri(0, GW - 1), y = ri(0, GH - 1);
      if (!occ(x, y) && !(x === EXIT[0] && y === EXIT[1]) && !S.hidden.some(function (h) { return h.x === x && h.y === y; })) {
        S.hidden.push({ x: x, y: y, k: pick(['raton', 'raton', 'monedas', 'monedas', 'gema', 'juguete']) }); return;
      }
    }
  }
  function sniffResult(sn) {
    var x = Math.floor(sn.x), y = Math.floor(sn.y), rad = 3 + sn.skills.olfato * 0.9, best = null, bd = 1e9;
    S.hidden.forEach(function (h) { var d = Math.abs(h.x - x) + Math.abs(h.y - y); if (d <= rad && d < bd) { bd = d; best = h; } });
    if (!best || Math.random() > 0.55 + sn.skills.olfato * 0.05) { think(sn, '🤷'); if (sn === sel()) toast(sn.name + ' no huele nada interesante cerca.', ''); return; }
    S.hidden = S.hidden.filter(function (h) { return h !== best; });
    var p = occ(best.x, best.y) ? nearestFree(best.x, best.y) : [best.x, best.y];
    var o = { id: nid(), t: 'hallazgo', x: p[0], y: p[1], r: 0, k: best.k };
    S.objects.push(o); rebuildCaches();
    think(sn, '❗'); toast('👅 ' + sn.name + ' ha olido algo escondido… ¡Ve a recogerlo!', 'good');
    enqueue(sn, { id: 'pickup', obj: o.id, label: 'Recoger hallazgo' });
  }
  function pickupObj(sn, id) {
    var o = objById(id); if (!o) return;
    var msg = '';
    if (o.t === 'piel') { S.money += 60; msg = sn.name + ' vende la piel mudada a una tienda de curiosidades (+§60).'; }
    else if (o.t === 'hallazgo') {
      sn.finds = (sn.finds || 0) + 1; S.stats.finds = (S.stats.finds || 0) + 1; if (S.stats.finds >= 5) unlock('olfato');
      if (o.k === 'raton') { sn.needs.hunger = clamp(sn.needs.hunger + 45, 0, 100); msg = sn.name + ' ha encontrado un ratón escondido. ¡Ñam! 🐁'; }
      else if (o.k === 'monedas') { var v = ri(40, 160); S.money += v; msg = sn.name + ' encuentra ' + money(v) + ' bajo el suelo. 🪙'; }
      else if (o.k === 'gema') { var g = ri(250, 600); S.money += g; msg = '💎 ¡' + sn.name + ' encuentra una gema! La vende por ' + money(g) + '.'; }
      else { sn.needs.fun = clamp(sn.needs.fun + 35, 0, 100); msg = sn.name + ' encuentra un juguete perdido y se lo pasa en grande. 🧸'; }
      logEv(sn, 'encontró algo olfateando');
    }
    S.objects = S.objects.filter(function (x) { return x.id !== id; }); rebuildCaches();
    if (msg) toast(msg, 'good'); sfx('coin');
  }
  function huntStart(sn, a) { if (S.mouse) S.mouse._caught = sn.id; }
  function huntResult(sn) {
    if (!S.mouse) { think(sn, '🤷'); return; }
    var c = 0.35 + sn.skills.sigilo * 0.05 + sn.skills.constriccion * 0.04 + (hasTrait(sn, 'sigiloso') ? 0.15 : 0);
    gainSkill(sn, 'sigilo', 0.4); gainSkill(sn, 'constriccion', 0.3);
    if (Math.random() < c) {
      S.mouse = null; sn.needs.hunger = clamp(sn.needs.hunger + 55, 0, 100); addMood(sn, 'prey', 'Presa fresca', 15, 8);
      toast('🐭 ¡' + sn.name + ' ha cazado el ratón!', 'good'); unlock('cazador'); logEv(sn, 'cazó un ratón'); sfx('ach');
    } else { S.mouse._caught = 0; S.mouse.x = clamp(S.mouse.x + rnd(-3, 3), 0.5, GW - 0.5); S.mouse.y = clamp(S.mouse.y + rnd(-3, 3), 0.5, GH - 0.5); S.mouse._path = null; think(sn, '😾'); toast('El ratón se le ha escapado a ' + sn.name + '.', 'warn'); }
  }

  // ---------- Trabajo y colegio ----------
  function shiftFor(sn) {
    if (sn.job && (sn.age === 'adulto' || sn.age === 'anciano')) { var C = CAREERS[sn.job.c]; return { s: C.h[0], e: C.h[1], kind: 'job' }; }
    if (sn.age === 'joven') return { s: 8, e: 14, kind: 'school' };
    return null;
  }
  function workToday(sh) { var wd = weekday(); return wd < 5; }
  function checkWork(sn) {
    var sh = shiftFor(sn); if (!sh || sn.away || !workToday(sh)) return;
    var h = hour();
    var curA = sn.q[0], hib = curA && ACT[curA.id] && ACT[curA.id].hib && curA.phase === 'do';
    if (h === (sh.s + 23) % 24) {
      if (hib) return;
      if (!sn.q.some(function (a) { return a.id === 'gowork'; })) {
        sn.q = sn.q.filter(function (a, i) { return i === 0 && a.phase === 'do' && a.id !== 'idle'; });
        enqueue(sn, { id: 'gowork', label: sh.kind === 'job' ? 'Ir al trabajo' : 'Ir al colegio', user: true }, sn.q.length && !(ACT[sn.q[0].id] || {}).sleeping ? false : true);
        if (sn === sel()) toast(sn.name + ': el ' + (sh.kind === 'job' ? 'autobús del trabajo' : 'autobús escolar') + ' llega en una hora.', '');
      }
    }
    if (h === sh.s) {
      if (hib) { if (sh.kind === 'job') { sn.job.perf = clamp(sn.job.perf - 15, -100, 100); toast(sn.name + ' no ha ido a trabajar por hibernar (−rendimiento).', 'warn'); } return; }
      leaveForWork(sn);
    }
  }
  function leaveForWork(sn) {
    var sh = shiftFor(sn); if (!sh) { sn.q.shift(); return; }
    var len = ((sh.e - sh.s) + 24) % 24 || 8, nowH = (S.time % DAY) / 60;
    var until = dayIdx() * DAY + sh.e * 60;
    if (sh.e <= sh.s && nowH >= sh.s - 1) until += DAY;
    if (until <= S.time || until - S.time > (len + 2) * 60) until = S.time + len * 60;
    sn.q.forEach(function (a) { endSocialPartner(sn, a, true); }); leaveObj(sn);
    sn.q = []; sn.away = { until: until, kind: sh.kind }; sn._workMood = 0; sn._workMin = 0;
    sn.x = EXIT[0] + 0.5; sn.y = EXIT[1] + 0.5;
    logEv(sn, sh.kind === 'job' ? 'fue a trabajar' : 'fue al colegio');
  }
  function comeBack(sn) {
    var k = sn.away.kind, avg = sn._workMin ? sn._workMood / sn._workMin : 50; sn.away = null;
    sn.x = EXIT[0] + 0.5; sn.y = EXIT[1] + 0.5;
    if (k === 'job' && sn.job) {
      var C = CAREERS[sn.job.c], L = C.lv[sn.job.lv], hours = (((C.h[1] - C.h[0]) + 24) % 24) || 8, pay = L[1] * hours;
      S.money += pay; sn.job.perf = clamp(sn.job.perf + (avg - 45) / 2.2 + sn.skills[C.skill] * 0.8, -100, 120);
      var msg = sn.name + ' vuelve del trabajo: +' + money(pay) + '.';
      if (sn.job.perf >= 100 && sn.job.lv < 4) {
        if (sn.skills[C.skill] >= (sn.job.lv + 1) * 2) { sn.job.lv++; sn.job.perf = 10; msg += ' 📈 ¡ASCENSO a ' + C.lv[sn.job.lv][0] + '!'; addMood(sn, 'promo', '¡Ascenso!', 25, 24); unlock('ascenso'); logEv(sn, 'fue ascendida a ' + C.lv[sn.job.lv][0]); sfx('ach'); }
        else { msg += ' Necesita ' + SKILLS[C.skill] + ' ' + ((sn.job.lv + 1) * 2) + ' para ascender.'; sn.job.perf = 100; }
      }
      if (sn.job.perf <= -80) { msg += ' 😬 La han despedido.'; sn.job = null; addMood(sn, 'fired', 'Despedida', -25, 24); }
      toast(msg, 'good'); sfx('coin'); logEv(sn, 'ganó ' + money(pay) + ' en el trabajo');
    } else if (k === 'school') {
      sn.school.perf = clamp(sn.school.perf + (avg - 45) / 3, 0, 100);
      if (sn.school.perf > 75) addMood(sn, 'grades', 'Buenas notas', 10, 24); else if (sn.school.perf < 30) addMood(sn, 'grades', 'Malas notas', -10, 24);
      if (sn === sel()) toast(sn.name + ' vuelve del colegio.', '');
    }
  }
  // ---------- Vecinos, ratón, eventos ----------
  function spawnVisitor(nb, silent) {
    if (!nb || S.visitors.some(function (v) { return v.nb === nb.id; })) return null;
    var v = { id: 'nb' + nb.id, nb: nb.id, species: nb.sp, name: nb.name, color: nb.color, x: EXIT[0] + 0.5, y: EXIT[1] + 0.5, fx: -1, leaveAt: S.time + ri(150, 300), _path: null, _busyUntil: 0, mood: 65 };
    S.visitors.push(v);
    if (!silent) { toast('🔔 ' + nb.name + ' (' + SPECIES[nb.sp].n.toLowerCase() + ') viene de visita.', ''); sfx('bell'); }
    unlock('vecino'); return v;
  }
  function stepVisitor(v, dm) {
    if (v._busyUntil > S.time) return;
    if (S.time >= v.leaveAt && S.party <= S.time) {
      if (!v._leaving) { v._leaving = 1; v._path = bfs(Math.floor(v.x), Math.floor(v.y), function (x, y) { return x === EXIT[0] && y === EXIT[1]; }, -1) || []; }
      if (v._path.length) moveAlong(v, v._path, dm); else { S.visitors = S.visitors.filter(function (x) { return x !== v; }); toast(v.name + ' se despide y se va a casa. 👋', ''); }
      return;
    }
    if (v._path && v._path.length) { moveAlong(v, v._path, dm); return; }
    v._wait = (v._wait || 0) - dm; if (v._wait > 0) return;
    // a veces inicia una charla con una serpiente
    var home = S.snakes.filter(function (s) { return !s.away && s.age !== 'bebe' && !(s.q[0] && s.q[0].phase === 'do' && (ACT[s.q[0].id] || {}).sleeping); });
    if (home.length && Math.random() < 0.35) {
      var t = pick(home), cur = t.q[0];
      if (!cur || !(cur.soc || cur.id === 'recv' || cur.id === 'gowork')) {
        enqueue(t, { id: 'chat', soc: 1, target: v.id, label: 'Charlar con ' + v.name, user: false }, true); v._wait = 60; return;
      }
    }
    var tx = ri(1, GW - 2), ty = ri(1, GH - 2);
    if (!occ(tx, ty)) v._path = bfs(Math.floor(v.x), Math.floor(v.y), function (x, y) { return x === tx && y === ty; }, -1) || [];
    v._wait = ri(20, 60);
  }
  function spawnMouse() {
    var p = nearestFree(ri(2, 10), ri(2, 8));
    S.mouse = { id: 'mouse', x: p[0] + 0.5, y: p[1] + 0.5, fx: 1, until: S.time + 240, _path: null, sp: 1.6 };
    toast('🐭 ¡Un ratón suelto en casa! Haz clic en él para cazarlo.', 'warn'); sfx('bell');
  }
  function stepMouse(m, dm) {
    if (m._caught) return;
    if (S.time > m.until) { S.mouse = null; toast('El ratón ha encontrado un agujero y se ha escapado.', ''); return; }
    if (m._path && m._path.length) { moveAlong(m, m._path, dm); return; }
    var tx = ri(0, GW - 1), ty = ri(0, GH - 1);
    if (!occ(tx, ty)) m._path = bfs(Math.floor(m.x), Math.floor(m.y), function (x, y) { return x === tx && y === ty; }, -1) || [];
  }
  function startEvent(k) {
    if (k === 'raton' && !S.mouse) spawnMouse();
    else if (k === 'tormenta') { S.weather = { k: 'tormenta', until: S.time + ri(180, 360) }; toast('⛈️ ¡Se acerca una tormenta! Nada de tomar el sol por ahora.', 'warn'); }
    else if (k === 'fiesta') {
      S.party = S.time + 240; var nbs = S.neighbors.slice().sort(function () { return Math.random() - 0.5; }).slice(0, 3);
      nbs.forEach(function (nb, i) { var v = spawnVisitor(nb, true); if (v) { v.leaveAt = S.party + 10; v.x = EXIT[0] + 0.5 - i * 0.3; } });
      toast('🎉 ¡Fiesta sorpresa! Los vecinos se presentan con música y aperitivos.', 'good'); unlock('fiesta'); sfx('ach');
      S.snakes.forEach(function (s) { logEv(s, 'disfrutó de una fiesta sorpresa'); });
    } else if (k === 'regalo') { var nb = pick(S.neighbors), v2 = ri(80, 300); S.money += v2; toast('🎁 ' + nb.name + ' os deja un regalo en la puerta: ' + money(v2) + '.', 'good'); }
    else if (k === 'visita') { spawnVisitor(pick(S.neighbors)); }
  }
  function stepEggs(dm) {
    S.objects.forEach(function (o) {
      if (o.t !== 'huevo') return;
      var nearT = S.objects.some(function (t) { return t.t === 'terrario' && Math.abs(t.x - o.x) <= 2 && Math.abs(t.y - o.y) <= 2; });
      var r = 100 / (48 * 60) * (nearT ? 2 : 1) * (isWinter() && !nearT ? 0.2 : 1) * (inside(o.x, o.y) ? 1 : 0.6);
      o.prog = Math.min(100, (o.prog || 0) + r * dm);
      if (o.prog >= 100 && !o._hatching) { o._hatching = 1; hatch(o); }
    });
  }

  // ---------- Reloj ----------
  function advance(mins) {
    while (mins > 0) { var st = Math.min(1, mins); simStep(st); mins -= st; }
  }
  function simStep(dm) {
    var before = S.time; S.time += dm;
    if (Math.floor(S.time / 60) !== Math.floor(before / 60)) hourly();
    if (Math.floor(S.time / DAY) !== Math.floor(before / DAY)) daily();
    if (S.weather.k !== 'sol' && S.time > S.weather.until) S.weather = { k: 'sol', until: 0 };
    for (var i = 0; i < S.snakes.length; i++) stepSnake(S.snakes[i], dm);
    if (S.hosts && !(V && V.live)) for (var hi = 0; hi < S.hosts.length; hi++) if (!S.hosts[hi].away) stepSnake(S.hosts[hi], dm);
    for (var j = S.visitors.length - 1; j >= 0; j--) if (S.visitors[j]) stepVisitor(S.visitors[j], dm);
    if (S.mouse) stepMouse(S.mouse, dm);
    stepEggs(dm);
  }
  function hourly() {
    var h = hour();
    if (S.visit) { visitHourly(h); return; }
    S.snakes.forEach(function (sn) {
      checkWork(sn);
      if (sn.age === 'anciano' && h === 9 && sn.job === null && sn._pension !== dayIdx() && sn.wasWorker) { sn._pension = dayIdx(); S.money += 40; }
    });
    var ev = S.todayEv; if (ev && ev.h === h && !ev.done) { ev.done = 1; startEvent(ev.k); }
    if (h >= 10 && h <= 19 && Math.random() < 0.07 && S.visitors.length < 2) startEvent('visita');
    if (h === 8 && weekday() === 0 && dayIdx() > 0 && S._billDay !== dayIdx()) { S._billDay = dayIdx(); var val = S.objects.reduce(function (s, o) { return s + (CAT[o.t].p || 0); }, 0); var bill = Math.round(60 + val * 0.025); S.money -= bill; toast('🧾 Facturas de la semana: −' + money(bill) + '.', 'warn'); }
    if (h === 22) writeDiaries();
    if (Math.random() < 0.22) randomThought();
    S.snakes.forEach(function (sn) { if (sn.shedReady && h % 3 === 0 && !sn.away) think(sn, '✨'); });
    if (S.money >= 10000) unlock('rico');
    if (S.objects.filter(function (o) { return !CAT[o.t].nobuy; }).length >= 20) unlock('decorador');
  }
  function daily() {
    var d = dayIdx();
    if (S.visit) { S.snakes.forEach(function (sn) { sn.today = { acts: {}, who: {}, ev: [] }; }); return; }
    S.snakes.slice().forEach(function (sn) {
      sn.ageD++; var A = AGES[sn.age];
      if (A.next && sn.ageD >= A.days) {
        if (sn.job && A.next === 'anciano') { sn.wasWorker = 1; toast(sn.name + ' se jubila con una pequeña pensión.', ''); sn.job = null; }
        sn.age = A.next; sn.ageD = 0; addMood(sn, 'bday', '¡Cumpleaños!', 20, 24);
        toast('🎂 ¡' + sn.name + ' cumple años y ahora es ' + AGES[sn.age].n.toLowerCase() + '!', 'good'); logEv(sn, 'cumplió años'); sfx('ach');
      }
      sn.shed++; if (!sn.shedReady && sn.shed >= sn.shedAt) { sn.shedReady = true; sn._shedReadyAt = S.time; if (!sn.away) think(sn, '✨'); toast('✨ A ' + sn.name + ' le toca mudar la piel. ¡Elige «Mudar la piel»!', ''); }
      checkAsp(sn);
    });
    if (d % 7 === 0) toast(SEASONS[season()].i + ' Empieza ' + SEASONS[season()].n.toLowerCase() + '.' + (isWinter() ? ' Las serpientes pueden hibernar en la cama o el terrario.' : ''), '');
    S.todayEv = Math.random() < 0.6 ? { k: pick(['raton', 'raton', 'tormenta', 'fiesta', 'regalo', 'visita']), h: ri(9, 20) } : null;
    if (isWinter() && S.todayEv && S.todayEv.k === 'tormenta') S.todayEv.k = 'raton';
    if (S.hidden.length < 5) { spawnHidden(); if (Math.random() < 0.5) spawnHidden(); }
    S.snakes.forEach(function (sn) { sn.today = { acts: {}, who: {}, ev: [] }; });
    save(false);
  }

  // ---------- Libre albedrío ----------
  function urg(v) { var x = (100 - v) / 100; return x * x * 100 + x * 8; }
  function scoreGains(sn, gains, cat) {
    var s = 0; for (var k in gains) if (gains[k] > 0) s += urg(sn.needs[k]) * gains[k] / 100;
    var b = 1; (sn.traits || []).forEach(function (t) { var T = TRAITS[t]; if (T && T.bias) { if (T.bias[cat]) b *= T.bias[cat]; for (var k2 in gains) if (gains[k2] > 0 && T.bias[k2]) b *= T.bias[k2]; } });
    return s * b;
  }
  function autonomy(sn) {
    if (sn.away) return;
    var x = Math.floor(sn.x), y = Math.floor(sn.y), cands = [];
    function add(a, sc) { if (sc > 0.5) cands.push({ a: a, s: sc * rnd(0.85, 1.15) }); }
    S.objects.forEach(function (o) {
      var c = CAT[o.t]; if (!c.acts) return;
      var dist = Math.abs(o.x - x) + Math.abs(o.y - y), dm = 1 / (1 + dist * 0.05);
      c.acts.forEach(function (aid) {
        var d = ACT[aid]; if (!d || d.noauto || canDo(sn, d, o) !== true) return;
        if (aid === 'sleep' && o.t === 'cama' && sn.age === 'bebe' && S.objects.some(function (q) { return q.t === 'cuna'; })) return;
        if (aid === 'sleep' && o.t === 'cuna' && sn.age !== 'bebe') return;
        if ((aid === 'pickup')) { add({ id: aid, obj: o.id }, 6 * dm); return; }
        if (aid === 'incubate') { if (sn.age === 'adulto' || sn.age === 'anciano') add({ id: aid, obj: o.id }, (o.prog < 90 ? 7 : 0) * (isWinter() ? 2 : 1) * dm); return; }
        var cap = c.cap || 1; if (objUsers(o).length >= cap) return;
        var g = {}; if (d.tot) for (var k in d.tot) g[k] = d.tot[k]; if (d.rate) for (var k2 in d.rate) g[k2] = d.until ? (100 - sn.needs[k2]) : d.rate[k2] * (d.dur || 60) / 60;
        if (aid === 'rock' && !isDay()) g.warmth = 22;
        var sc = scoreGains(sn, g, d.c);
        if (d.sk && (d.c !== 'cook' || sn.needs.hunger < 65)) sc += (3 + sn.skills[d.sk[0]] * 0.3) * traitMul(sn, 'bias', d.c) * (sn.mood > 55 ? 1 : 0.3);
        if (d.sleeping && !d.hib) { var h = hour(); if (h >= 22 || h < 6) sc *= 1.8; else if (sn.needs.energy > 45) sc *= 0.3; }
        if (d.hib) sc = isWinter() && sn.needs.energy < 40 && sn.needs.warmth < 40 && !shiftFor(sn) ? sc * 1.3 + 10 : 0;
        add({ id: aid, obj: o.id }, sc * dm);
      });
    });
    // acciones propias
    if (sn.shedReady) add({ id: 'shed' }, 30 + (S.time - (sn._shedReadyAt || S.time)) / 60);
    if (canDo(sn, ACT.bask) === true) add({ id: 'bask' }, scoreGains(sn, { warmth: 70, fun: 8 }, 'warm') * (inside(x, y) ? 0.8 : 1));
    if (canDo(sn, ACT.sniff) === true && S.hidden.length) add({ id: 'sniff' }, (3 + sn.skills.olfato * 0.4) * traitMul(sn, 'bias', 'sniff') * (sn.mood > 50 ? 1 : 0.4));
    if (canDo(sn, ACT.stealth) === true) add({ id: 'stealth' }, (2 + sn.skills.sigilo * 0.25) * traitMul(sn, 'bias', 'stealth') * (sn.mood > 55 ? 1 : 0.3));
    if (canDo(sn, ACT.playalone) === true) add({ id: 'playalone' }, scoreGains(sn, { fun: 30 }, 'fun') * 0.7);
    if (S.mouse && !S.mouse._caught && canDo(sn, ACT.hunt) === true) add({ id: 'hunt', target: 'mouse' }, (urg(sn.needs.hunger) * 0.6 + 10) * traitMul(sn, 'bias', 'hunt'));
    // social
    if (sn.age !== 'bebe') {
      var others = S.snakes.filter(function (o) { return o !== sn && !o.away; }).concat(S.visitors).concat((S.hosts || []).filter(function (o) { return o !== sn && !o.away; })).concat(remoteList());
      others.forEach(function (t) {
        var busy = t.q && t.q[0] && t.q[0].phase === 'do' && (ACT[t.q[0].id] || {}).sleeping;
        var r = relOf(sn, t), dist = Math.abs(Math.floor(t.x) - x) + Math.abs(Math.floor(t.y) - y), dm = 1 / (1 + dist * 0.06);
        if (t.age === 'bebe') {
          if (sn.age === 'joven') { if (!busy) add({ id: 'playkid', soc: 1, target: t.id }, scoreGains(sn, { fun: 20, social: 15 }, 'care') * dm); return; }
          if (t.needs.hunger < 45) add({ id: 'feed', soc: 1, target: t.id }, (urg(t.needs.hunger) + 15) * dm);
          if (t.needs.hygiene < 35) add({ id: 'bathe', soc: 1, target: t.id }, (urg(t.needs.hygiene) * 0.6 + 6) * dm);
          if (!busy && t.needs.fun < 50) add({ id: 'playkid', soc: 1, target: t.id }, (urg(t.needs.fun) * 0.4 + scoreGains(sn, { fun: 20, social: 15 }, 'care')) * dm);
          if (!busy && t.needs.energy < 30) add({ id: 'cuddle', soc: 1, target: t.id }, (urg(t.needs.energy) * 0.4) * dm);
          return;
        }
        if (busy || (t.q && t.q[0] && (t.q[0].soc || t.q[0].id === 'recv'))) return;
        var base = scoreGains(sn, { social: 25, fun: 5 }, 'social') * dm;
        add({ id: 'chat', soc: 1, target: t.id }, base);
        if (r.fr > 10) add({ id: 'joke', soc: 1, target: t.id }, base * 0.7 * traitMul(sn, 'bias', 'joke'));
        if (r.fr >= 30) add({ id: 'hug', soc: 1, target: t.id }, base * 0.6);
        if (hasTrait(sn, 'grunon') || r.fr < -20) add({ id: 'argue', soc: 1, target: t.id }, base * 0.25 * traitMul(sn, 'bias', 'argue'));
        var adults = sn.age === 'adulto' && t.age === 'adulto' && !t.species;
        if (adults && (!sn.partner || sn.partner === t.id) && (!t.partner || t.partner === sn.id)) {
          if (r.fr >= 25) add({ id: 'flirt', soc: 1, target: t.id }, base * 0.5 * traitMul(sn, 'bias', 'romance'));
          if (r.ro >= 35) add({ id: 'nuzzle', soc: 1, target: t.id }, base * 0.5 * traitMul(sn, 'bias', 'romance'));
        }
      });
    }
    if (!cands.length) { enqueue(sn, { id: 'idle', label: 'Pasar el rato' }); return; }
    cands.sort(function (a, b) { return b.s - a.s; });
    var top = cands.slice(0, 3), tot = top.reduce(function (s, c) { return s + c.s; }, 0), r0 = Math.random() * tot, ch = top[0];
    for (var i = 0; i < top.length; i++) { r0 -= top[i].s; if (r0 <= 0) { ch = top[i]; break; } }
    var a = ch.a; a.label = labelFor(a); a.user = false;
    if (a.soc) { var tt = entById(a.target); var chk = socReq(sn, tt, a.id); if (chk !== true) return; }
    enqueue(sn, a);
  }
  function labelFor(a) {
    if (a.soc) { var t = entById(a.target); return SOC[a.id].l + (t ? ' con ' + t.name : ''); }
    if (a.id === 'hunt') return ACT.hunt.l;
    return (ACT[a.id] || {}).l || a.id;
  }
  function socReq(a, b, id) {
    var def = SOC[id]; if (!b) return 'No está';
    if (a.age === 'bebe') return 'Las crías no pueden';
    if (def.kid && b.age !== 'bebe') return 'Solo con crías';
    if (!def.kid && b.age === 'bebe') return 'Es una cría';
    if (def.kid && a.age === 'joven' && id !== 'playkid') return 'Mejor que lo haga un adulto';
    if (def.vis && !b.species && !b.remote && !b.hostSn) return 'Solo con visitas';
    if ((id === 'propose' || id === 'eggs') && (b.remote || b.hostSn || a.hostSn)) return 'Solo con tu propia familia';
    if (def.adult && (a.age !== 'adulto' || b.age !== 'adulto' || b.species)) return 'Solo entre serpientes adultas';
    if (def.adult && ((a.partner && a.partner !== b.id) || (b.partner && b.partner !== a.id)) && id !== 'eggs') return 'Ya tiene pareja';
    if (def.req) return def.req(a, b, relOf(a, b));
    return true;
  }

  // ---------- Pensamientos y diario (Askbox opcional) ----------
  var ai = { on: false, checked: false, busy: false };
  function aiCheck() {
    if (ai.checked) return; ai.checked = true;
    try { fetch('/api/los-snakes/ai', { credentials: 'same-origin' }).then(function (r) { return r.ok ? r.json() : null; }).then(function (j) { ai.on = !!(j && j.llm); }).catch(function () {}); } catch (e) {}
  }
  function aiAsk(kind, facts) {
    if (!ai.on) return Promise.resolve(null);
    try {
      var ctl = typeof AbortController !== 'undefined' ? new AbortController() : null; if (ctl) setTimeout(function () { ctl.abort(); }, 9000);
      return fetch('/api/los-snakes/ai', { method: 'POST', credentials: 'same-origin', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ kind: kind, facts: facts }), signal: ctl ? ctl.signal : undefined })
        .then(function (r) { return r.ok ? r.json() : null; }).then(function (j) { return j && j.ok && j.text ? String(j.text) : null; }).catch(function () { return null; });
    } catch (e) { return Promise.resolve(null); }
  }
  function factsOf(sn) {
    var low = NEEDS.filter(function (n) { return sn.needs[n.k] < 35; }).map(function (n) { return n.n.toLowerCase(); });
    return { nombre: sn.name, edad: AGES[sn.age].n, rasgos: sn.traits.map(function (t) { return TRAITS[t].n; }), animo: moodLabel(sn.mood), necesidades_bajas: low,
      estacion: SEASONS[season()].n, hora: hhmm(S.time), clima: S.weather.k, haciendo: sn.q[0] ? (sn.q[0].label || '') : 'nada', trabajo: sn.job ? CAREERS[sn.job.c].lv[sn.job.lv][0] : null,
      hoy: sn.today.ev.slice(-6), con_quien: Object.keys(sn.today.who).slice(0, 4), patron_piel: PATTERNS[sn.pattern] };
  }
  var LOCAL_THOUGHTS = {
    hunger: ['Me comería un ratón entero… o dos.', '¿Alguien ha dicho ratón asado?', 'Mi estómago sisea más que yo.'],
    energy: ['Necesito enroscarme y dormir una semana.', 'Se me cierran los párpados… ah, que no tengo.'],
    hygiene: ['Huelo a terrario sin limpiar.', 'Una ducha tropical, por favor.'],
    fun: ['Qué aburrimiento de escamas…', 'Necesito algo divertido YA.'],
    social: ['Me apetece charlar con alguien.', '¿Nadie quiere enroscarse un rato?'],
    bladder: ['¡¿Dónde está el váter?!'],
    warmth: ['Tengo la sangre fría… literalmente.', 'Un poco de sol no me vendría mal.', 'Brrr. ¿Quién ha bajado la calefacción?'],
    happy: ['¡Qué día tan escamoso!', 'La vida es bella cuando estás enroscada.', 'Hoy me siento como recién mudada.', 'Sssí, sssoy feliz.'],
    winter: ['Este frío pide hibernar…', 'Noto el invierno hasta en la punta de la cola.'],
    shed: ['Me pica toda la piel. Toca mudar.', 'Esta piel ya me queda pequeña.'],
    grunon: ['Todo el mundo hace demasiado ruido.', 'Hmpf.'], romantico: ['Ay, el amor sabe a ratón con miel.'], genio: ['Estoy a punto de descifrar el sentido de la muda.'],
    bromista: ['Tengo un chiste buenísimo sobre víboras… es venenoso.'], gloton: ['Pienso, luego como.']
  };
  function localThought(sn) {
    var low = NEEDS.slice().sort(function (a, b) { return sn.needs[a.k] - sn.needs[b.k]; })[0];
    if (sn.shedReady && Math.random() < 0.5) return pick(LOCAL_THOUGHTS.shed);
    if (sn.needs[low.k] < 35) return pick(LOCAL_THOUGHTS[low.k]);
    if (isWinter() && Math.random() < 0.3) return pick(LOCAL_THOUGHTS.winter);
    var tr = sn.traits.filter(function (t) { return LOCAL_THOUGHTS[t]; });
    if (tr.length && Math.random() < 0.4) return pick(LOCAL_THOUGHTS[pick(tr)]);
    return pick(LOCAL_THOUGHTS.happy);
  }
  function randomThought() {
    var home = S.snakes.filter(function (s) { return !s.away && s.age !== 'bebe'; }); if (!home.length || !UI) return;
    var sn = Math.random() < 0.6 && sel() && !sel().away && sel().age !== 'bebe' ? sel() : pick(home);
    if (ai.on && !ai.busy && Math.random() < 0.6) {
      ai.busy = true;
      aiAsk('thought', factsOf(sn)).then(function (t) { ai.busy = false; think(sn, '💭', t || localThought(sn), 8); });
    } else think(sn, '💭', localThought(sn), 7);
  }
  function localDiary(sn) {
    var d = dayIdx() + 1, acts = Object.keys(sn.today.acts).sort(function (a, b) { return sn.today.acts[b] - sn.today.acts[a]; }).slice(0, 2);
    var who = Object.keys(sn.today.who), ev = sn.today.ev.slice(-3);
    var p = [pick(['Querido diario:', 'Diario escamoso:', 'Hoy, día ' + d + ':', 'Nota mental:'])];
    if (ev.length) p.push('Hoy ' + ev.join(', ') + '.');
    if (acts.length) p.push(pick(['Me pasé el día', 'Dediqué mucho rato a', 'Lo más destacado:']) + ' ' + acts.map(function (a) { return a.toLowerCase(); }).join(' y ') + '.');
    if (who.length) p.push(pick(['Charlé con', 'Pasé tiempo con', 'Me crucé con']) + ' ' + who.slice(0, 3).join(', ') + '.');
    else p.push(pick(['No hablé con nadie, qué soledad.', 'Día tranquilo, sin mucha compañía.']));
    p.push(pick(['Me siento ', 'Ánimo: ', 'Termino el día ']) + moodLabel(sn.mood).toLowerCase() + '. ' + pick(['Sssss.', '¡Hasta mañana!', 'Mañana más.', '🐍']));
    return p.join(' ');
  }
  function writeDiaries() {
    var list = S.snakes.filter(function (s) { return s.age !== 'bebe'; });
    list.forEach(function (sn, i) {
      var entry = { d: dayIdx() + 1, t: localDiary(sn), ai: false };
      sn.diary.push(entry); if (sn.diary.length > 30) sn.diary.shift();
      if (ai.on) setTimeout(function () { aiAsk('diary', factsOf(sn)).then(function (txt) { if (txt) { entry.t = txt; entry.ai = true; } }); }, i * 3000);
    });
  }

  // ---------- Logros y aspiraciones ----------
  function unlock(k) {
    if (!S || S.ach[k] || !ACH[k]) return; S.ach[k] = dayIdx() + 1; S.money += 100;
    toast('🏆 Logro: ' + ACH[k][1] + ' (+§100)', 'ach'); sfx('ach');
  }
  function checkAsp(sn) {
    if (sn.aspDone || !ASP[sn.asp]) return;
    if (ASP[sn.asp].p(sn) >= 1) { sn.aspDone = true; addMood(sn, 'asp', 'Aspiración cumplida', 30, 72); S.money += 1000; toast('🌟 ¡' + sn.name + ' ha cumplido su aspiración «' + ASP[sn.asp].n + '»! (+§1.000)', 'ach'); sfx('ach'); }
  }
  // ---------- Partida nueva / guardado ----------
  function newGame(spec) {
    var hs = buildHouse();
    S = { v: SAVE_VER, name: spec.name || 'Escamosa', money: 6000, time: 8 * 60, snakes: [], objects: [], floor: [], walls: hs.walls, doors: hs.doors, wallc: {},
      nid: 1, visitors: [], mouse: null, neighbors: [], weather: { k: 'sol', until: 0 }, party: 0, ach: {}, stats: { births: 0, finds: 0 }, hidden: [],
      settings: { freeWill: true, sound: true }, sel: 0, todayEv: { k: 'visita', h: 11 }, created: Date.now() };
    for (var y = 0; y < GH; y++) for (var x = 0; x < GW; x++) {
      var f = -1; if (inside(x, y)) f = (x <= 3 && y <= 3) ? 1 : (x >= 8 && y <= 5) ? 2 : (x >= 4 && x <= 7 && y <= 3) ? 4 : 0;
      if (!inside(x, y) && (x === 6 || x === 7) && y >= 10) f = 6;
      S.floor.push(f);
    }
    // paredes interiores: baño baldosa celeste, dormitorio lavanda, resto crema
    function add(t, x, y, r) { S.objects.push({ id: nid(), t: t, x: x, y: y, r: r || 0 }); }
    add('ducha', 1, 1); add('vater', 3, 1); add('planta', 1, 3);
    add('nevera', 4, 1); add('cocina', 5, 1); add('estanteria', 7, 1);
    add('cama', 9, 1); add('cama', 11, 1); add('cuna', 11, 4); add('lampara', 8, 1); add('espejo', 10, 5);
    add('sofa', 2, 6, 0); add('tv', 2, 9, 2); add('lampara', 1, 9); add('planta', 4, 9);
    add('ordenador', 10, 9, 2); add('radio', 8, 7); add('terrario', 11, 8); add('planta', 7, 6);
    add('piedra', 13, 3); add('poste', 14, 6); add('arbol', 14, 1); add('tumbona', 13, 9); add('arbol', 1, 12); add('planta', 9, 10);
    rebuildCaches();
    for (var yy = 1; yy <= 9; yy++) for (var xx = 1; xx <= 11; xx++) {
      var wc = (xx <= 3 && yy <= 3) ? 2 : (xx >= 8 && yy <= 5) ? 4 : 0;
      ['h', 'v'].forEach(function (d) { var k = d + ',' + xx + ',' + yy; if (S._wallset[k]) S.wallc[k] = wc; });
    }
    NEIGHBOR_SEED.forEach(function (n, i) { S.neighbors.push({ id: i + 1, sp: n[0], name: n[1], color: shade(SPECIES[n[0]].c, rnd(-0.15, 0.15)), fr: 0 }); });
    var spots = [[6, 7], [5, 7], [6, 8], [5, 8], [7, 7], [7, 8], [4, 7], [4, 8]];
    (spec.snakes || []).forEach(function (o, i) { var sn = makeSnake(o); sn.x = spots[i % 8][0] + 0.5; sn.y = spots[i % 8][1] + 0.5; S.snakes.push(sn); });
    S.snakes.forEach(function (a) { S.snakes.forEach(function (b) { if (a !== b) { var r = relOf(a, b); r.fr = 35; } }); });
    var ad = S.snakes.filter(function (s) { return s.age === 'adulto'; });
    if (ad.length >= 2 && spec.couple) { ad[0].partner = ad[1].id; ad[1].partner = ad[0].id; relOf(ad[0], ad[1]).ro = relOf(ad[1], ad[0]).ro = 55; relOf(ad[0], ad[1]).fr = relOf(ad[1], ad[0]).fr = 60; }
    S.sel = S.snakes[0] ? S.snakes[0].id : 0;
    for (var h = 0; h < 3; h++) spawnHidden();
  }
  function userKey() {
    try { if (typeof currentUser !== 'undefined' && currentUser) return String(currentUser.id || currentUser.email || currentUser.name || 'u'); } catch (e) {}
    return 'anon';
  }
  function saveKey() { return 'losSnakes:v1:' + userKey(); }
  function serialize() { return JSON.stringify({ v: SAVE_VER, savedAt: Date.now(), S: (V && HOME) ? HOME : S }, function (k, v) { return k.charAt(0) === '_' && k !== '_billDay' ? undefined : v; }); }
  var lastServerSave = 0;
  function save(toServer) {
    if (!S || (S.visit && !HOME)) return;
    var txt; try { txt = serialize(); localStorage.setItem(saveKey(), txt); } catch (e) { return; }
    if ((toServer !== false || Date.now() - lastServerSave > 120000) && userKey() !== 'anon') {
      lastServerSave = Date.now();
      try { fetch('/api/los-snakes/save', { method: 'PUT', credentials: 'same-origin', headers: { 'Content-Type': 'application/json' }, body: txt, keepalive: txt.length < 60000 }).catch(function () {}); } catch (e) {}
    }
  }
  function loadLocal() { try { var t = localStorage.getItem(saveKey()); return t ? JSON.parse(t) : null; } catch (e) { return null; } }
  function loadServer() {
    if (userKey() === 'anon') return Promise.resolve(null);
    try {
      var ctl = typeof AbortController !== 'undefined' ? new AbortController() : null; if (ctl) setTimeout(function () { ctl.abort(); }, 3000);
      return fetch('/api/los-snakes/save', { credentials: 'same-origin', signal: ctl ? ctl.signal : undefined }).then(function (r) { return r.ok ? r.json() : null; })
        .then(function (j) { return j && j.ok && j.save ? j.save : null; }).catch(function () { return null; });
    } catch (e) { return Promise.resolve(null); }
  }
  function applySave(sv) {
    if (!sv || !sv.S || !sv.S.snakes) return false;
    S = sv.S; S.visitors = S.visitors || []; S.hidden = S.hidden || []; S.stats = S.stats || { births: 0, finds: 0 }; S.settings = S.settings || { freeWill: true, sound: true };
    S.snakes.forEach(function (sn) { sn.q = (sn.q || []).filter(function (a) { return a.id !== 'recv' && !a.soc; }); sn.q.forEach(function (a) { a.phase = 'walk'; a.started = false; }); sn.today = sn.today || { acts: {}, who: {}, ev: [] }; sn.seen = sn.seen || {}; if (sn.away && sn.away.kind === 'visita') { sn.away = null; sn.x = EXIT[0] + 0.5; sn.y = EXIT[1] + 0.5; } });
    S.visit = false; delete S.hosts; S.mail = S.mail || [];
    rebuildCaches(); return true;
  }
  // ---------- Render ----------
  function P(gx, gy, z) { return [(gx - gy) * 32, (gx + gy) * 16 - (z || 0)]; }
  function poly(c, pts, fill, stroke, lw) {
    c.beginPath(); c.moveTo(pts[0][0], pts[0][1]); for (var i = 1; i < pts.length; i++) c.lineTo(pts[i][0], pts[i][1]); c.closePath();
    if (fill) { c.fillStyle = fill; c.fill(); } if (stroke) { c.strokeStyle = stroke; c.lineWidth = lw || 1; c.stroke(); }
  }
  function box(c, x0, y0, x1, y1, z0, z1, top, south, east, line) {
    var st = line === undefined ? 'rgba(40,30,20,.28)' : line;
    poly(c, [P(x0, y1, z0), P(x1, y1, z0), P(x1, y1, z1), P(x0, y1, z1)], south, st);
    poly(c, [P(x1, y0, z0), P(x1, y1, z0), P(x1, y1, z1), P(x1, y0, z1)], east, st);
    poly(c, [P(x0, y0, z1), P(x1, y0, z1), P(x1, y1, z1), P(x0, y1, z1)], top, st);
  }
  function cbox(c, x0, y0, x1, y1, z0, z1, col, line) { box(c, x0, y0, x1, y1, z0, z1, shade(col, 0.12), shade(col, -0.08), shade(col, -0.22), line); }
  function ell(c, x, y, rx, ry, fill, stroke, lw) { c.beginPath(); c.ellipse(x, y, Math.max(0.1, rx), Math.max(0.1, ry), 0, 0, Math.PI * 2); if (fill) { c.fillStyle = fill; c.fill(); } if (stroke) { c.strokeStyle = stroke; c.lineWidth = lw || 1; c.stroke(); } }
  function backEdge(o, th) {
    var f = fp(o), x0 = o.x, y0 = o.y, x1 = o.x + f.w, y1 = o.y + f.h, fd = frontDir(o);
    if (fd[1] === 1) return [x0, y0, x1, y0 + th]; if (fd[0] === 1) return [x0, y0, x0 + th, y1];
    if (fd[1] === -1) return [x0, y1 - th, x1, y1]; return [x1 - th, y0, x1, y1];
  }
  var TT = 0; // tiempo real para animaciones (s)
  function drawObj(c, o) {
    var f = fp(o), x0 = o.x + 0.1, y0 = o.y + 0.1, x1 = o.x + f.w - 0.1, y1 = o.y + f.h - 0.1, cx = o.x + f.w / 2, cy = o.y + f.h / 2, m, b;
    var night = darkness() > 0.2;
    // sombra
    poly(c, [P(x0 - 0.02, y0 + 0.05), P(x1 + 0.08, y0 + 0.05), P(x1 + 0.08, y1 + 0.1), P(x0 - 0.02, y1 + 0.1)], 'rgba(0,0,0,.10)');
    switch (o.t) {
      case 'nevera':
        cbox(c, x0 + 0.05, y0 + 0.05, x1 - 0.05, y1 - 0.05, 0, 62, '#eef4f8');
        m = P(x0 + 0.05, y1 - 0.05, 40); b = P(x1 - 0.05, y1 - 0.05, 40); c.strokeStyle = '#9fb2c0'; c.lineWidth = 1.2; c.beginPath(); c.moveTo(m[0], m[1]); c.lineTo(b[0], b[1]); c.stroke();
        m = P(x1 - 0.2, y1 - 0.05, 52); b = P(x1 - 0.2, y1 - 0.05, 44); c.strokeStyle = '#7d8f9c'; c.lineWidth = 2; c.beginPath(); c.moveTo(m[0], m[1]); c.lineTo(b[0], b[1]); c.stroke();
        m = P(x1 - 0.2, y1 - 0.05, 34); b = P(x1 - 0.2, y1 - 0.05, 20); c.beginPath(); c.moveTo(m[0], m[1]); c.lineTo(b[0], b[1]); c.stroke();
        break;
      case 'cocina':
        cbox(c, x0, y0, x1, y1, 0, 30, '#f2f2f2'); poly(c, [P(x0, y0, 30.5), P(x1, y0, 30.5), P(x1, y1, 30.5), P(x0, y1, 30.5)], '#2d3238');
        [[0.3, 0.3], [0.7, 0.3], [0.3, 0.7], [0.7, 0.7]].forEach(function (q) { var p = P(x0 + (x1 - x0) * q[0], y0 + (y1 - y0) * q[1], 31); ell(c, p[0], p[1], 6, 3, '#555', '#e74c3c', 1); });
        m = P(x0 + 0.15, y1, 22); poly(c, [m, P(x1 - 0.15, y1, 22), P(x1 - 0.15, y1, 6), P(x0 + 0.15, y1, 6)], '#3a3f45');
        break;
      case 'cama': case 'cuna':
        var wood = o.t === 'cama' ? '#a8754a' : '#c99a64', h = o.t === 'cama' ? 10 : 12;
        cbox(c, x0, y0, x1, y1, 0, h, wood);
        poly(c, [P(x0 + 0.05, y0 + 0.05, h + 4), P(x1 - 0.05, y0 + 0.05, h + 4), P(x1 - 0.05, y1 - 0.05, h + 4), P(x0 + 0.05, y1 - 0.05, h + 4)], '#fbfbfb', 'rgba(0,0,0,.15)');
        var fd = frontDir(o), blanket = o.t === 'cama' ? '#5b8def' : '#ffb3c8';
        if (o.t === 'cama') {
          var pb = backEdge(o, 0.38); poly(c, [P(pb[0] + 0.12, pb[1] + 0.12, h + 8), P(pb[2] - 0.12, pb[1] + 0.12, h + 8), P(pb[2] - 0.12, pb[3] - 0.08, h + 8), P(pb[0] + 0.12, pb[3] - 0.08, h + 8)], '#ffffff', 'rgba(0,0,0,.2)');
          var bl = [x0 + 0.03, y0 + 0.03, x1 - 0.03, y1 - 0.03]; if (fd[1] === 1) bl[1] = y0 + (y1 - y0) * 0.45; else if (fd[0] === 1) bl[0] = x0 + (x1 - x0) * 0.45; else if (fd[1] === -1) bl[3] = y1 - (y1 - y0) * 0.45; else bl[2] = x1 - (x1 - x0) * 0.45;
          box(c, bl[0], bl[1], bl[2], bl[3], h + 2, h + 6, blanket, shade(blanket, -0.15), shade(blanket, -0.28));
          var hb = backEdge(o, 0.08); cbox(c, hb[0], hb[1], hb[2], hb[3], 0, h + 22, wood);
        } else { poly(c, [P(x0 + 0.2, y0 + 0.2, h + 5), P(x1 - 0.2, y0 + 0.2, h + 5), P(x1 - 0.2, y1 - 0.2, h + 5), P(x0 + 0.2, y1 - 0.2, h + 5)], blanket); }
        break;
      case 'ducha':
        cbox(c, x0, y0, x1, y1, 0, 5, '#e9f2f7');
        poly(c, [P(x0, y1, 5), P(x1, y1, 5), P(x1, y1, 70), P(x0, y1, 70)], 'rgba(170,215,240,.35)', 'rgba(120,170,200,.6)');
        poly(c, [P(x1, y0, 5), P(x1, y1, 5), P(x1, y1, 70), P(x1, y0, 70)], 'rgba(150,200,230,.35)', 'rgba(120,170,200,.6)');
        m = P(x0 + 0.25, y0 + 0.25, 62); ell(c, m[0], m[1], 6, 3, '#b8c4cc', '#7f8b93');
        if (o._users && o._users.length) { c.strokeStyle = 'rgba(120,190,255,.7)'; c.lineWidth = 1; for (var dr = 0; dr < 6; dr++) { var dx = m[0] - 5 + dr * 2, dy = m[1] + ((TT * 120 + dr * 13) % 40); c.beginPath(); c.moveTo(dx, dy); c.lineTo(dx, dy + 5); c.stroke(); } }
        break;
      case 'vater':
        var bk = backEdge(o, 0.25); cbox(c, bk[0] + 0.15, bk[1] + 0.1, bk[2] - 0.15, bk[3] - 0.05, 0, 30, '#f6f8fa');
        m = P(cx, cy, 12); ell(c, m[0], m[1] + 2, 11, 6, '#f6f8fa', '#b9c3cb'); ell(c, m[0], m[1] - 1, 9, 4.5, '#dfe7ed', '#b9c3cb');
        break;
      case 'sofa':
        var col = o.col || '#e2725b';
        cbox(c, x0, y0, x1, y1, 0, 14, col);
        var sb = backEdge(o, 0.28); cbox(c, sb[0], sb[1], sb[2], sb[3], 14, 30, o.col2 || '#c95f4a');
        break;
      case 'tv':
        cbox(c, x0 + 0.15, y0 + 0.15, x1 - 0.15, y1 - 0.15, 0, 14, '#5b4636');
        var tb = backEdge(o, 0.1), fdd = frontDir(o);
        var sx0 = tb[0], sy0 = tb[1], sx1 = tb[2], sy1 = tb[3];
        if (fdd[0] === 0) { sx0 += 0.05; sx1 -= 0.05; sy0 += 0.35; sy1 += 0.35; } else { sy0 += 0.05; sy1 -= 0.05; sx0 += 0.35; sx1 += 0.35; }
        cbox(c, sx0, sy0, sx1, sy1, 16, 46, '#22262b');
        var on = objUsers(o).length > 0, scol = on ? 'hsl(' + ((TT * 40) % 360) + ',70%,60%)' : '#30363d';
        if (fdd[1] === 1) poly(c, [P(sx0 + 0.04, sy1, 19), P(sx1 - 0.04, sy1, 19), P(sx1 - 0.04, sy1, 43), P(sx0 + 0.04, sy1, 43)], scol);
        else if (fdd[0] === 1) poly(c, [P(sx1, sy0 + 0.04, 19), P(sx1, sy1 - 0.04, 19), P(sx1, sy1 - 0.04, 43), P(sx1, sy0 + 0.04, 43)], scol);
        break;
      case 'ordenador':
        cbox(c, x0, y0, x1, y1, 22, 26, '#b98a5a'); cbox(c, x0 + 0.05, y0 + 0.05, x0 + 0.15, y0 + 0.15, 0, 22, '#8a6440'); cbox(c, x1 - 0.15, y1 - 0.15, x1 - 0.05, y1 - 0.05, 0, 22, '#8a6440');
        var mb = backEdge(o, 0.12); var ux = (mb[2] - mb[0]) > 0.5 ? 0.25 : 0, uy = (mb[3] - mb[1]) > 0.5 ? 0.25 : 0;
        cbox(c, mb[0] + ux + 0.05, mb[1] + uy + 0.05, mb[2] - ux, mb[3] - uy, 26, 48, '#2b2f36');
        var pcOn = objUsers(o).length > 0; m = P(cx, cy, 37); ell(c, m[0], m[1], 5, 3, pcOn ? '#7df9ff' : '#3c4f63');
        break;
      case 'estanteria':
        cbox(c, x0 + 0.05, y0 + 0.2, x1 - 0.05, y1 - 0.2, 0, 66, '#9a6a3e');
        var bc = ['#e74c3c', '#3498db', '#f1c40f', '#2ecc71', '#9b59b6', '#e67e22'];
        for (var sh = 0; sh < 3; sh++) for (var bi = 0; bi < 5; bi++) { var z = 8 + sh * 20, gx = x0 + 0.12 + bi * 0.15; poly(c, [P(gx, y1 - 0.2, z), P(gx + 0.11, y1 - 0.2, z), P(gx + 0.11, y1 - 0.2, z + 13 + (bi % 2) * 3), P(gx, y1 - 0.2, z + 13 + (bi % 2) * 3)], bc[(bi + sh * 2) % 6]); }
        break;
      case 'espejo':
        var eb = backEdge(o, 0.1); cbox(c, eb[0] + 0.1, eb[1] + 0.1, eb[2] - 0.1, eb[3] - 0.1, 0, 58, '#d4a54d');
        m = P(cx, cy, 34); ell(c, m[0], m[1] - 4, 8, 18, '#cfe9f7', '#b98b33', 2);
        break;
      case 'radio':
        cbox(c, x0 + 0.1, y0 + 0.2, x1 - 0.1, y1 - 0.2, 0, 30, '#3b3f46');
        [12, 23].forEach(function (z) { var p = P(cx - 0.15, y1 - 0.2, z); ell(c, p[0], p[1], 5, 5, '#22252a', '#777'); p = P(cx + 0.2, y1 - 0.2, z); ell(c, p[0], p[1], 5, 5, '#22252a', '#777'); });
        if (objUsers(o).length || S.party > S.time) { m = P(cx, cy, 44 + Math.sin(TT * 4) * 4); c.fillStyle = '#7b5cff'; c.font = '14px sans-serif'; c.fillText('♪', m[0] + Math.sin(TT * 2) * 8, m[1]); c.fillText('♫', m[0] - 12, m[1] - 8 + Math.cos(TT * 3) * 4); }
        break;
      case 'terrario':
        cbox(c, x0, y0, x1, y1, 0, 8, '#6b4f36');
        poly(c, [P(x0, y1, 8), P(x1, y1, 8), P(x1, y1, 46), P(x0, y1, 46)], 'rgba(170,230,200,.25)', 'rgba(90,150,120,.7)');
        poly(c, [P(x1, y0, 8), P(x1, y1, 8), P(x1, y1, 46), P(x1, y0, 46)], 'rgba(150,210,190,.25)', 'rgba(90,150,120,.7)');
        poly(c, [P(x0, y0, 46), P(x1, y0, 46), P(x1, y1, 46), P(x0, y1, 46)], 'rgba(200,240,220,.25)', 'rgba(90,150,120,.7)');
        m = P(x0 + 0.3, y0 + 0.4, 14); ell(c, m[0], m[1], 4, 9, '#3fa55a'); m = P(x1 - 0.25, y0 + 0.3, 16); ell(c, m[0], m[1], 3, 11, '#2f8f4c');
        m = P(cx, cy, 47); var gl = c.createRadialGradient(m[0], m[1], 1, m[0], m[1], 22); gl.addColorStop(0, 'rgba(255,120,40,.65)'); gl.addColorStop(1, 'rgba(255,120,40,0)'); c.fillStyle = gl; c.fillRect(m[0] - 24, m[1] - 24, 48, 48); ell(c, m[0], m[1], 5, 2.5, '#ff7a2f');
        break;
      case 'piedra':
        m = P(cx, cy, 0); var hot = isDay() && S.weather.k !== 'tormenta';
        ell(c, m[0], m[1] - 3, 24, 11, hot ? '#b8836b' : '#8f9499', 'rgba(0,0,0,.25)'); ell(c, m[0] - 4, m[1] - 7, 14, 5, hot ? '#d29b7e' : '#a8adb2');
        if (hot) { c.strokeStyle = 'rgba(255,140,60,.45)'; c.lineWidth = 1.5; for (var hw = 0; hw < 3; hw++) { var hx = m[0] - 10 + hw * 10, hy = m[1] - 14 - ((TT * 10 + hw * 5) % 12); c.beginPath(); c.moveTo(hx, hy); c.quadraticCurveTo(hx + 3, hy - 4, hx, hy - 8); c.stroke(); } }
        break;
      case 'poste':
        m = P(cx, cy, 0); cbox(c, cx - 0.32, cy - 0.32, cx + 0.32, cy + 0.32, 0, 4, '#8d6e4f');
        c.fillStyle = '#c49a6c'; c.fillRect(m[0] - 4, m[1] - 70, 8, 68); c.strokeStyle = '#7a5530'; c.lineWidth = 1; c.strokeRect(m[0] - 4, m[1] - 70, 8, 68);
        for (var rr = 0; rr < 4; rr++) ell(c, m[0], m[1] - 18 - rr * 14, 7, 2.5, null, '#e6d2a8', 2);
        break;
      case 'planta':
        m = P(cx, cy, 0); cbox(c, cx - 0.18, cy - 0.18, cx + 0.18, cy + 0.18, 0, 14, '#c8643c');
        var lc = isWinter() && !inside(o.x, o.y) ? '#9bb5a0' : '#3aa856';
        ell(c, m[0], m[1] - 26, 11, 12, lc); ell(c, m[0] - 8, m[1] - 20, 8, 7, shade(lc, -0.15)); ell(c, m[0] + 8, m[1] - 22, 8, 7, shade(lc, 0.1));
        break;
      case 'lampara':
        m = P(cx, cy, 0); ell(c, m[0], m[1], 8, 4, '#555'); c.fillStyle = '#666'; c.fillRect(m[0] - 1.5, m[1] - 50, 3, 50);
        poly(c, [[m[0] - 10, m[1] - 48], [m[0] + 10, m[1] - 48], [m[0] + 6, m[1] - 64], [m[0] - 6, m[1] - 64]], night ? '#ffe7a3' : '#f4e1b8', '#b89a5c');
        break;
      case 'tumbona':
        var tcol = '#ff8f5a'; cbox(c, x0 + 0.1, y0 + 0.1, x1 - 0.1, y1 - 0.1, 4, 9, tcol);
        var tb2 = backEdge(o, 0.45); cbox(c, tb2[0] + 0.1, tb2[1] + 0.1, tb2[2] - 0.1, tb2[3] - 0.1, 9, 20, '#ffd166');
        break;
      case 'arbol':
        m = P(cx, cy, 0); c.fillStyle = '#7b5233'; c.fillRect(m[0] - 4, m[1] - 40, 8, 40);
        var sc = season(), tc = ['#4caf50', '#3d9a40', '#e08a2e', '#f4f7fa'][sc];
        ell(c, m[0], m[1] - 62, 28, 26, tc, 'rgba(0,0,0,.15)'); ell(c, m[0] - 14, m[1] - 50, 16, 14, shade(tc, -0.1)); ell(c, m[0] + 14, m[1] - 54, 16, 14, shade(tc, 0.08));
        if (sc < 2) { [[-10, -66], [8, -58], [14, -72], [-4, -50]].forEach(function (q) { ell(c, m[0] + q[0], m[1] + q[1], 3, 3, '#e8413c'); }); }
        break;
      case 'huevo':
        m = P(cx, cy, 0); ell(c, m[0], m[1], 14, 6, 'rgba(120,90,60,.35)');
        ell(c, m[0], m[1] - 12, 9, 12, '#fffaf0', '#c9b9a0', 1.5);
        [[-3, -16], [3, -10], [-2, -7], [4, -17]].forEach(function (q) { ell(c, m[0] + q[0], m[1] + q[1], 1.6, 1.2, o.col || '#8bc34a'); });
        if ((o.prog || 0) > 85) { c.strokeStyle = '#8a7a66'; c.lineWidth = 1; c.beginPath(); c.moveTo(m[0] - 6, m[1] - 14); c.lineTo(m[0] - 2, m[1] - 11); c.lineTo(m[0] + 2, m[1] - 15); c.lineTo(m[0] + 6, m[1] - 12); c.stroke(); }
        break;
      case 'piel':
        m = P(cx, cy, 0); c.strokeStyle = 'rgba(240,235,215,.9)'; c.lineWidth = 4; c.lineCap = 'round'; c.beginPath(); c.moveTo(m[0] - 18, m[1]); c.bezierCurveTo(m[0] - 8, m[1] - 8, m[0] + 2, m[1] + 8, m[0] + 16, m[1] - 2); c.stroke();
        c.strokeStyle = 'rgba(200,190,160,.8)'; c.lineWidth = 1; c.stroke();
        break;
      case 'hallazgo':
        m = P(cx, cy, 0); var bob = Math.sin(TT * 4) * 2; ell(c, m[0], m[1], 10, 4, 'rgba(0,0,0,.18)');
        drawEmoji(c, { raton: '🐁', monedas: '🪙', gema: '💎', juguete: '🧸' }[o.k] || '❔', m[0], m[1] - 12 + bob, 18); c.textAlign = 'left';
        break;
    }
  }

  // Serpiente plana estilo logo v2
  function patternStroke(c, sn, w) {
    var col = sn.color;
    switch (sn.pattern) {
      case 'rayas': c.setLineDash([w * 0.45, w * 0.9]); c.strokeStyle = shade(col, -0.3); c.lineWidth = w * 0.92; c.stroke(); break;
      case 'manchas': c.setLineDash([w * 0.3, w * 1.1]); c.strokeStyle = shade(col, 0.45); c.lineWidth = w * 0.45; c.stroke(); break;
      case 'anillos': c.setLineDash([w * 0.22, w * 0.7]); c.strokeStyle = '#2b2b2b'; c.lineWidth = w * 0.95; c.stroke(); break;
      case 'rombos': c.setLineDash([w * 0.6, w * 0.6]); c.strokeStyle = shade(col, 0.35); c.lineWidth = w * 0.35; c.stroke(); break;
      case 'degradado': c.setLineDash([]); c.strokeStyle = shade(col, 0.35); c.lineWidth = w * 0.35; c.globalAlpha = 0.7; c.stroke(); c.globalAlpha = 1; break;
      case 'brillo': c.setLineDash([]); c.strokeStyle = 'rgba(255,255,255,.55)'; c.lineWidth = w * 0.22; c.stroke(); break;
      case 'estrellas': c.setLineDash([1, w * 1.4]); c.strokeStyle = '#fff6a8'; c.lineWidth = w * 0.4; c.lineCap = 'round'; c.stroke(); break;
    }
    c.setLineDash([]);
  }
  function drawSnake(c, sn, wx, wy) {
    var s = AGES[sn.age] ? AGES[sn.age].s : 1, a = sn.q && sn.q[0], def = a ? (ACT[a.id] || {}) : {};
    var moving = sn._moving && performance.now() - sn._moving < 150;
    var sleeping = (a && a.phase === 'do' && def.sleeping) || sn._sleep;
    var col = sn.age === 'anciano' ? mix(sn.color, '#9aa3a8', 0.25) : sn.color, dark = shade(col, -0.45);
    c.save(); c.translate(wx, wy); ell(c, 0, 0, 16 * s, 6 * s, 'rgba(0,0,0,.18)');
    if (a && a.id === 'shed' && a.phase === 'do') { c.globalAlpha = 0.65 + Math.sin(TT * 6) * 0.2; }
    if (a && a.id === 'stealth' && a.phase === 'do') c.globalAlpha = 0.45;
    c.scale(sn.fx < 0 ? -s : s, s);
    c.lineCap = 'round'; c.lineJoin = 'round';
    var W = sn.age === 'bebe' ? 10 : 8.5;
    if (sleeping) {
      c.beginPath(); c.moveTo(-14, -2); c.bezierCurveTo(-16, -12, 14, -12, 14, -3); c.bezierCurveTo(14, 5, -10, 5, -9, -2); c.bezierCurveTo(-8, -7, 6, -8, 6, -3);
      c.strokeStyle = dark; c.lineWidth = W + 3; c.stroke(); c.strokeStyle = col; c.lineWidth = W; c.stroke(); patternStroke(c, { color: col, pattern: sn.pattern }, W);
      ell(c, 8, -6, 6.5, 5, col, dark, 1.5); c.strokeStyle = dark; c.lineWidth = 1.2; c.beginPath(); c.moveTo(8, -7); c.lineTo(12, -7); c.stroke();
      c.restore();
      c.save(); c.translate(wx, wy); c.fillStyle = '#5b6bd6'; c.font = 'bold ' + (9 + (TT * 2 % 1) * 4) + 'px sans-serif'; c.fillText('z', 10, -18 - (TT * 8 % 10)); c.font = 'bold 8px sans-serif'; c.fillText('z', 16, -28 - (TT * 6 % 8)); c.restore();
      return;
    }
    var wig = moving ? Math.sin(TT * 14) * 3 : Math.sin(TT * 2 + sn.id) * 1.2;
    var hx = 3 + wig * 0.3, hy = -36;
    if (moving) hy = -26;
    var lean = (a && (a.soc || a.id === 'recv') && a.phase === 'do') ? 5 : 0;
    hx += lean;
    // cuerpo: base enroscada + cuello
    c.beginPath();
    c.moveTo(-17, -1 + wig * 0.3);
    c.bezierCurveTo(-18, 7, 15, 7, 14, -2);
    c.bezierCurveTo(13, -9, -6, -9, -5, -3);
    c.bezierCurveTo(-3, 4 + wig, 9 + wig, -14, hx - 4, hy + 6);
    c.strokeStyle = dark; c.lineWidth = W + 3; c.stroke();
    c.strokeStyle = col; c.lineWidth = W; c.stroke();
    patternStroke(c, { color: col, pattern: sn.pattern }, W);
    // vientre
    c.beginPath(); c.moveTo(-3, -1); c.bezierCurveTo(-1, 4 + wig, 8 + wig, -12, hx - 4, hy + 8);
    c.strokeStyle = 'rgba(255,255,255,.28)'; c.lineWidth = W * 0.3; c.stroke();
    // cabeza
    var hr = sn.age === 'bebe' ? 8.5 : 7.5;
    ell(c, hx, hy, hr + 1.5, hr * 0.85, col, dark, 1.6);
    var eyeR = sn.age === 'bebe' ? 3.6 : 3;
    ell(c, hx + 3, hy - 2.5, eyeR, eyeR, '#fff', dark, 0.8); ell(c, hx + 3.8, hy - 2.3, eyeR * 0.5, eyeR * 0.62, '#1b1b1b');
    ell(c, hx + 3.2, hy - 3.4, 0.8, 0.8, '#fff');
    if (sn.age === 'anciano') { c.strokeStyle = '#333'; c.lineWidth = 1; c.beginPath(); c.arc(hx + 3, hy - 2.5, 4.4, 0, Math.PI * 2); c.stroke(); }
    c.strokeStyle = dark; c.lineWidth = 1; c.beginPath(); c.moveTo(hx + 5, hy + 3); c.quadraticCurveTo(hx + 7.5, hy + 4, hx + 9.5, hy + 2); c.stroke();
    var tongue = ((TT + sn.id * 0.37) % 2.2) < 0.25 || (a && a.id === 'sniff' && a.phase === 'do' && (TT % 0.6) < 0.35);
    if (tongue) { c.strokeStyle = '#e8413c'; c.lineWidth = 1.3; c.beginPath(); c.moveTo(hx + 9.5, hy + 2); c.lineTo(hx + 15, hy + 2.5); c.lineTo(hx + 17.5, hy + 0.5); c.moveTo(hx + 15, hy + 2.5); c.lineTo(hx + 17.5, hy + 4.5); c.stroke(); }
    if (sn.mood != null && sn.mood < 25) { c.fillStyle = 'rgba(80,140,255,.8)'; ell(c, hx + 1, hy - 8 - (TT * 6 % 6), 1.5, 2.2, 'rgba(90,150,255,.8)'); }
    c.restore();
  }
  function drawVisitor(c, v, wx, wy) {
    var col = v.color || SPECIES[v.species].c, dark = shade(col, -0.45), moving = v._moving && performance.now() - v._moving < 150, bob = moving ? Math.abs(Math.sin(TT * 10)) * 2 : 0;
    c.save(); c.translate(wx, wy); ell(c, 0, 0, 16, 6, 'rgba(0,0,0,.18)'); c.scale(v.fx < 0 ? -1 : 1, 1); c.translate(0, -bob);
    c.lineJoin = 'round'; c.lineCap = 'round';
    if (v.species === 'tortuga') {
      ell(c, 12, -9, 5, 4.5, '#9ccc65', dark, 1.2); ell(c, 14, -10.5, 1.2, 1.2, '#222');
      ell(c, -8, -3, 3, 3, '#9ccc65', dark); ell(c, 6, -2, 3, 3, '#9ccc65', dark);
      c.beginPath(); c.ellipse(0, -9, 13, 10, 0, Math.PI, 0); c.closePath(); c.fillStyle = col; c.fill(); c.strokeStyle = dark; c.lineWidth = 1.5; c.stroke();
      c.strokeStyle = shade(col, -0.25); c.lineWidth = 1; c.beginPath(); c.moveTo(-6, -9); c.lineTo(-3, -16); c.lineTo(3, -16); c.lineTo(6, -9); c.stroke();
    } else if (v.species === 'rana') {
      ell(c, 0, -9, 12, 9, col, dark, 1.5); ell(c, -5, -18, 4.5, 4.5, col, dark, 1.2); ell(c, 5, -18, 4.5, 4.5, col, dark, 1.2);
      ell(c, -5, -18, 2.5, 2.5, '#fff'); ell(c, 5, -18, 2.5, 2.5, '#fff'); ell(c, -4.4, -18, 1.2, 1.5, '#111'); ell(c, 5.6, -18, 1.2, 1.5, '#111');
      c.strokeStyle = dark; c.beginPath(); c.arc(0, -10, 6, 0.2, Math.PI - 0.2); c.stroke(); ell(c, -10, -2, 5, 2.5, shade(col, -0.1), dark); ell(c, 10, -2, 5, 2.5, shade(col, -0.1), dark);
    } else {
      var camo = v.species === 'camaleon' ? 'hsl(' + ((TT * 30) % 360) + ',55%,50%)' : col;
      c.beginPath(); c.moveTo(-20, -4); c.quadraticCurveTo(-12, -2, -6, -6);
      if (v.species === 'camaleon') { c.moveTo(-6, -6); c.bezierCurveTo(-18, -4, -22, -14, -14, -14); }
      c.strokeStyle = dark; c.lineWidth = 6; c.stroke(); c.strokeStyle = camo; c.lineWidth = 4; c.stroke();
      ell(c, 0, -8, 11, 5.5, camo, dark, 1.4); ell(c, 12, -12, 6, 4.5, camo, dark, 1.4); ell(c, 14, -13.5, 1.6, 1.6, '#fff'); ell(c, 14.4, -13.5, 0.9, 1.1, '#111');
      [[-6, -3], [6, -3]].forEach(function (q) { c.strokeStyle = dark; c.lineWidth = 2; c.beginPath(); c.moveTo(q[0], q[1] - 2); c.lineTo(q[0] - 2, q[1] + 3); c.stroke(); });
      if (v.species === 'iguana') { c.fillStyle = shade(col, -0.25); for (var k = -6; k <= 8; k += 3.5) { c.beginPath(); c.moveTo(k - 1.5, -13); c.lineTo(k, -17); c.lineTo(k + 1.5, -13); c.fill(); } }
    }
    c.restore();
  }
  function drawMouse(c, m, wx, wy) {
    c.save(); c.translate(wx, wy); c.scale(m.fx < 0 ? -1 : 1, 1); var b = Math.abs(Math.sin(TT * 18)) * 1.5;
    ell(c, 0, 0, 8, 3, 'rgba(0,0,0,.18)'); ell(c, 0, -5 - b, 7, 4.5, '#9e9e9e', '#616161'); ell(c, 6, -7 - b, 3.5, 3, '#9e9e9e', '#616161');
    ell(c, 5, -10 - b, 2, 2, '#f8bbd0', '#616161'); ell(c, 8, -7.5 - b, 0.8, 0.8, '#111');
    c.strokeStyle = '#f48fb1'; c.lineWidth = 1; c.beginPath(); c.moveTo(-7, -4 - b); c.quadraticCurveTo(-13, -10, -16, -3); c.stroke(); c.restore();
  }
  function darkness() {
    var h = (S.time % DAY) / 60, d;
    if (h >= 7.5 && h < 18.5) d = 0; else if (h >= 18.5 && h < 21) d = (h - 18.5) / 2.5 * 0.5; else if (h >= 5 && h < 7.5) d = (7.5 - h) / 2.5 * 0.5; else d = 0.5;
    if (S.weather.k === 'tormenta') d = Math.min(0.6, d + 0.18);
    return d;
  }
  var WINDOWS = { 'h,2,1': 1, 'h,6,1': 1, 'h,10,1': 1, 'v,1,6': 1, 'v,1,8': 1 };
  function wallColor(k) { var w = WALLS[S.wallc[k] || 0] || WALLS[0]; return w; }
  function drawWall(c, k) {
    var p = k.split(','), d = p[0], x = +p[1], y = +p[2];
    var back = (d === 'h' && y === 1) || (d === 'v' && x === 1), front = (d === 'h' && y === 10) || (d === 'v' && x === 12);
    var H = back ? 78 : 16, a, b;
    if (d === 'h') { a = [x, y]; b = [x + 1, y]; } else { a = [x, y]; b = [x, y + 1]; }
    var W = front ? { c: '#efe1c4' } : wallColor(k), base = W.c, f = d === 'h' ? 0 : -0.12;
    var face = [P(a[0], a[1], 0), P(b[0], b[1], 0), P(b[0], b[1], H), P(a[0], a[1], H)];
    poly(c, face, shade(base, f), 'rgba(60,40,20,.25)');
    if (W.p === 'stripes') { c.save(); c.beginPath(); c.moveTo(face[0][0], face[0][1]); for (var i = 1; i < 4; i++) c.lineTo(face[i][0], face[i][1]); c.closePath(); c.clip(); c.strokeStyle = shade(W.c2, f); c.lineWidth = 4; for (var t = 0.125; t < 1; t += 0.25) { var q0 = P(a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, 0), q1 = P(a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, H); c.beginPath(); c.moveTo(q0[0], q0[1]); c.lineTo(q1[0], q1[1]); c.stroke(); } c.restore(); }
    if (W.p === 'brick' && H > 20) { c.strokeStyle = shade(W.c2, f); c.lineWidth = 1; for (var z = 8; z < H; z += 8) { var r0 = P(a[0], a[1], z), r1 = P(b[0], b[1], z); c.beginPath(); c.moveTo(r0[0], r0[1]); c.lineTo(r1[0], r1[1]); c.stroke(); } }
    // zócalo
    if (H > 20) { var z0 = [P(a[0], a[1], 0), P(b[0], b[1], 0), P(b[0], b[1], 5), P(a[0], a[1], 5)]; poly(c, z0, 'rgba(0,0,0,.12)'); }
    if (WINDOWS[k] && back) {
      var dk = darkness(), glass = dk > 0.2 ? '#ffe9a8' : (S.weather.k === 'tormenta' ? '#8fa3b5' : '#bfe6ff');
      var w0 = 0.2, w1 = 0.8, zA = 30, zB = 62;
      var wp = [P(a[0] + (b[0] - a[0]) * w0, a[1] + (b[1] - a[1]) * w0, zA), P(a[0] + (b[0] - a[0]) * w1, a[1] + (b[1] - a[1]) * w1, zA), P(a[0] + (b[0] - a[0]) * w1, a[1] + (b[1] - a[1]) * w1, zB), P(a[0] + (b[0] - a[0]) * w0, a[1] + (b[1] - a[1]) * w0, zB)];
      poly(c, wp, glass, '#ffffff', 3);
      var mA = P(a[0] + (b[0] - a[0]) * 0.5, a[1] + (b[1] - a[1]) * 0.5, zA), mB = P(a[0] + (b[0] - a[0]) * 0.5, a[1] + (b[1] - a[1]) * 0.5, zB);
      c.strokeStyle = '#fff'; c.lineWidth = 2; c.beginPath(); c.moveTo(mA[0], mA[1]); c.lineTo(mB[0], mB[1]); c.stroke();
    }
    // remate superior
    var t0 = P(a[0], a[1], H), t1 = P(b[0], b[1], H);
    c.strokeStyle = shade(base, -0.3); c.lineWidth = 3; c.lineCap = 'round'; c.beginPath(); c.moveTo(t0[0], t0[1]); c.lineTo(t1[0], t1[1]); c.stroke(); c.lineCap = 'butt';
  }
  function drawTile(c, x, y) {
    var f = S.floor[y * GW + x], pts = [P(x, y), P(x + 1, y), P(x + 1, y + 1), P(x, y + 1)], F = FLOORS[f];
    if (f < 0 || !F || !F.c) { var se = SEASONS[season()]; poly(c, pts, (x + y) % 2 ? se.grass : se.grass2); return; }
    var col = F.c; if (F.p === 'check' && (x + y) % 2) col = F.c2; else if (!F.p && (x + y) % 2) col = F.c2;
    poly(c, pts, col, 'rgba(0,0,0,.06)');
    if (F.p === 'planks') { c.strokeStyle = F.c2; c.lineWidth = 1; for (var t = 0.25; t < 1; t += 0.25) { var a = P(x, y + t), b = P(x + 1, y + t); c.beginPath(); c.moveTo(a[0], a[1]); c.lineTo(b[0], b[1]); c.stroke(); } }
  }
  var cam = { x: 0, y: 0, z: 1, fit: true };
  function fitCam(w, h) {
    var span = w < 560 ? GW + GH - 7 : GW + GH; var z = clamp(Math.min(w / (span * 32 + 60), (h - 10) / (span * 16 + 120)), 0.45, 2.2);
    cam.z = z; var cpt = P(GW / 2, GH / 2); cam.x = w / 2 - cpt[0] * z; cam.y = h / 2 - cpt[1] * z + 30 * z;
  }
  function toScreen(gx, gy, z) { var p = P(gx, gy, z); return [p[0] * cam.z + cam.x, p[1] * cam.z + cam.y]; }
  function toGrid(sx, sy) { var wx = (sx - cam.x) / cam.z, wy = (sy - cam.y) / cam.z; return [(wx / 32 + wy / 16) / 2, (wy / 16 - wx / 32) / 2]; }
  var rain = []; for (var ri0 = 0; ri0 < 120; ri0++) rain.push([Math.random(), Math.random(), rnd(0.6, 1.2)]);
  var flash = 0;
  function renderScene(c, w, h, dpr, ui) {
    TT = performance.now() / 1000;
    var dk = darkness(), se = SEASONS[season()];
    c.setTransform(dpr, 0, 0, dpr, 0, 0);
    var g = c.createLinearGradient(0, 0, 0, h);
    if (S.weather.k === 'tormenta') { g.addColorStop(0, '#6f7f8f'); g.addColorStop(1, '#a9b6c0'); }
    else if (isWinter()) { g.addColorStop(0, '#cfe3f3'); g.addColorStop(1, '#eef5fa'); }
    else { g.addColorStop(0, '#8fd3ff'); g.addColorStop(1, '#dff3ff'); }
    c.fillStyle = g; c.fillRect(0, 0, w, h);
    c.setTransform(dpr * cam.z, 0, 0, dpr * cam.z, dpr * cam.x, dpr * cam.y);
    // terreno exterior
    poly(c, [P(-8, -8), P(GW + 8, -8), P(GW + 8, GH + 8), P(-8, GH + 8)], se.grass2);
    poly(c, [P(-8, GH + 1.2), P(GW + 8, GH + 1.2), P(GW + 8, GH + 2.6), P(-8, GH + 2.6)], '#8d949b');
    poly(c, [P(-8, GH + 1.8), P(GW + 8, GH + 1.8), P(GW + 8, GH + 1.95), P(-8, GH + 1.95)], '#f2f2f2');
    for (var y = 0; y < GH; y++) for (var x = 0; x < GW; x++) drawTile(c, x, y);
    poly(c, [P(0, 0), P(GW, 0), P(GW, GH), P(0, GH)], null, 'rgba(255,255,255,.55)', 2);
    poly(c, [P(6, 10.05), P(7, 10.05), P(7, 10.6), P(6, 10.6)], '#b5523b');
    if (ui && ui.hoverTiles) ui.hoverTiles.forEach(function (t) { poly(c, [P(t[0], t[1]), P(t[0] + 1, t[1]), P(t[0] + 1, t[1] + 1), P(t[0], t[1] + 1)], t[2] || 'rgba(255,255,255,.35)', 'rgba(255,255,255,.8)', 1.5); });
    // elementos ordenados por profundidad
    var items = [];
    S.walls.forEach(function (k) { var p = k.split(','); items.push({ k: +p[1] + +p[2] + 0.5, f: function () { drawWall(c, k); } }); });
    S.objects.forEach(function (o) { if (ui && ui.moving && ui.moving.id === o.id) return; var f = fp(o); items.push({ k: o.x + f.w - 0.5 + o.y + f.h - 0.5, f: function () { drawObj(c, o); if (ui && ui.selObj === o.id) { poly(c, [P(o.x, o.y), P(o.x + f.w, o.y), P(o.x + f.w, o.y + f.h), P(o.x, o.y + f.h)], null, '#ffd23f', 3); } } }); });
    S.snakes.forEach(function (sn) { if (sn.away) return; items.push({ k: sn.x + sn.y + (sn._onTile ? 0.6 : 0.05), f: function () { var p = P(sn.x, sn.y); drawSnake(c, sn, p[0], p[1] + (sn._onTile ? -8 : 0)); } }); });
    S.visitors.forEach(function (v) { items.push({ k: v.x + v.y + 0.05, f: function () { var p = P(v.x, v.y); drawVisitor(c, v, p[0], p[1]); } }); });
    extraSnakes().forEach(function (sn) { items.push({ k: sn.x + sn.y + (sn._onTile ? 0.6 : 0.05), f: function () { var p = P(sn.x, sn.y); drawSnake(c, sn, p[0], p[1] + (sn._onTile ? -8 : 0)); } }); });
    items.push({ k: 8.6 + 14.35 + 2, f: function () { drawMailbox(c); } });
    if (S.mouse) { var m = S.mouse; items.push({ k: m.x + m.y, f: function () { var p = P(m.x, m.y); drawMouse(c, m, p[0], p[1]); } }); }
    items.sort(function (a, b) { return a.k - b.k; });
    for (var i = 0; i < items.length; i++) items[i].f();
    if (ui && ui.ghost) { c.globalAlpha = 0.7; drawObj(c, ui.ghost); c.globalAlpha = 1; var gf = fp(ui.ghost); poly(c, [P(ui.ghost.x, ui.ghost.y), P(ui.ghost.x + gf.w, ui.ghost.y), P(ui.ghost.x + gf.w, ui.ghost.y + gf.h), P(ui.ghost.x, ui.ghost.y + gf.h)], ui.ghostOk ? 'rgba(60,220,120,.25)' : 'rgba(240,70,70,.3)', ui.ghostOk ? '#2ecc71' : '#e74c3c', 2); }
    // capa de pantalla
    c.setTransform(dpr, 0, 0, dpr, 0, 0);
    if (dk > 0) {
      c.fillStyle = 'rgba(16,24,70,' + dk + ')'; c.fillRect(0, 0, w, h);
      c.globalCompositeOperation = 'lighter';
      S.objects.forEach(function (o) {
        var L = o.t === 'lampara' ? [58, 120, 'rgba(255,200,110,'] : o.t === 'terrario' ? [44, 70, 'rgba(255,120,50,'] : (o.t === 'tv' && objUsers(o).length) ? [30, 70, 'rgba(120,170,255,'] : null; if (!L) return;
        var p = toScreen(o.x + 0.5, o.y + 0.5, L[0]), r = L[1] * cam.z, gr = c.createRadialGradient(p[0], p[1], 2, p[0], p[1], r);
        gr.addColorStop(0, L[2] + (dk * 0.9) + ')'); gr.addColorStop(1, L[2] + '0)'); c.fillStyle = gr; c.fillRect(p[0] - r, p[1] - r, r * 2, r * 2);
      });
      c.globalCompositeOperation = 'source-over';
    }
    if (S.weather.k === 'tormenta') {
      c.strokeStyle = 'rgba(200,220,255,.55)'; c.lineWidth = 1.2; c.beginPath();
      rain.forEach(function (r) { var x = (r[0] * w + TT * 60 * r[2]) % w, y = (r[1] * h + TT * 500 * r[2]) % h; c.moveTo(x, y); c.lineTo(x - 4, y + 12); }); c.stroke();
      if (Math.random() < 0.004) flash = 1; if (flash > 0) { c.fillStyle = 'rgba(255,255,255,' + flash * 0.6 + ')'; c.fillRect(0, 0, w, h); flash -= 0.08; }
    } else if (isWinter()) {
      c.fillStyle = 'rgba(255,255,255,.85)'; rain.forEach(function (r, i) { if (i % 2) return; var x = (r[0] * w + Math.sin(TT + i) * 20) % w, y = (r[1] * h + TT * 30 * r[2]) % h; c.beginPath(); c.arc(x, y, 1.5 * r[2], 0, 6.3); c.fill(); });
    }
    // superposiciones: plumbob, globos, nombres
    var selS = sel();
    S.snakes.forEach(function (sn) {
      if (sn.away) return; var s = AGES[sn.age].s, hp = toScreen(sn.x, sn.y, (sn._onTile ? 8 : 0) + 48 * s);
      if (sn === selS) drawPlumbob(c, hp[0], hp[1] - 14 * cam.z - Math.sin(TT * 2.4) * 3, cam.z, moodColor(sn.mood), sn.mood);
      var th = sn._th; var tLow = null;
      if (!th || th.until < performance.now()) { var lo = NEEDS.slice().sort(function (a, b) { return sn.needs[a.k] - sn.needs[b.k]; })[0]; if (sn.needs[lo.k] < 22 && (TT % 6) < 2.5) tLow = { i: lo.i }; }
      var T = th && th.until > performance.now() ? th : tLow;
      if (T) bubble(c, hp[0] + 16 * cam.z, hp[1] - 6 * cam.z, T.i, T.txt, cam.z);
      if (ui && ui.hoverEnt === sn.id) nameTag(c, hp[0], hp[1] + 4, sn.name);
    });
    S.visitors.forEach(function (v) { var hp = toScreen(v.x, v.y, 30); nameTag(c, hp[0], hp[1], v.name + ' · ' + SPECIES[v.species].n); });
    extraSnakes().forEach(function (sn) {
      var s2 = (AGES[sn.age] || AGES.adulto).s, hp2 = toScreen(sn.x, sn.y, (sn._onTile ? 8 : 0) + 48 * s2), th2 = sn._th;
      if (th2 && th2.until > performance.now()) bubble(c, hp2[0] + 16 * cam.z, hp2[1] - 6 * cam.z, th2.i, th2.txt, cam.z);
      if (sn.remote || (ui && ui.hoverEnt === sn.id)) nameTag(c, hp2[0], hp2[1] + 4, sn.remote ? sn.name + ' · de ' + sn.owner : sn.name);
    });
    S.objects.forEach(function (o) { if (o.t !== 'huevo') return; var p = toScreen(o.x + 0.5, o.y + 0.5, 34); c.beginPath(); c.arc(p[0], p[1], 7, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * (o.prog || 0) / 100); c.strokeStyle = '#ffd23f'; c.lineWidth = 3; c.stroke(); });
  }
  function drawPlumbob(c, x, y, z, col, mood) {
    var s = clamp(z, 0.7, 1.6), w = 9 * s * (0.35 + 0.65 * Math.abs(Math.cos(TT * 1.6))), hU = 12 * s, hD = 16 * s;
    var base = 'hsl(' + Math.round(clamp(mood, 0, 100) * 1.25) + ',';
    c.save(); c.shadowColor = col; c.shadowBlur = 10;
    poly(c, [[x, y - hU], [x + w, y], [x, y + hD], [x - w, y]], base + '75%,45%)');
    c.shadowBlur = 0;
    poly(c, [[x, y - hU], [x + w, y], [x, y]], base + '80%,62%)'); poly(c, [[x, y - hU], [x - w, y], [x, y]], base + '78%,52%)');
    poly(c, [[x, y + hD], [x + w, y], [x, y]], base + '75%,36%)'); poly(c, [[x, y + hD], [x - w, y], [x, y]], base + '75%,42%)');
    c.restore();
  }
  function bubble(c, x, y, icon, txt, z) {
    c.save(); c.font = '600 12px system-ui,sans-serif';
    if (txt) {
      var words = String(txt).split(' '), lines = [], cur = '';
      words.forEach(function (wd) { if ((cur + ' ' + wd).trim().length > 26) { lines.push(cur.trim()); cur = wd; } else cur += ' ' + wd; }); if (cur.trim()) lines.push(cur.trim()); lines = lines.slice(0, 4);
      var bw = Math.max.apply(null, lines.map(function (l) { return c.measureText(l).width; })) + 18, bh = lines.length * 15 + 10, bx = x - 6, by = y - bh - 10;
      c.fillStyle = 'rgba(255,255,255,.96)'; c.strokeStyle = 'rgba(40,60,90,.25)'; c.lineWidth = 1; rr(c, bx, by, bw, bh, 9); c.fill(); c.stroke();
      c.beginPath(); c.arc(x - 2, y - 6, 3.5, 0, 6.3); c.fill(); c.stroke(); c.beginPath(); c.arc(x - 7, y, 2, 0, 6.3); c.fill(); c.stroke();
      c.fillStyle = '#1d2b3a'; lines.forEach(function (l, i) { c.fillText(l, bx + 9, by + 17 + i * 15); });
    } else {
      var r = 15; c.fillStyle = 'rgba(255,255,255,.96)'; c.strokeStyle = 'rgba(40,60,90,.25)';
      c.beginPath(); c.arc(x + 6, y - 22, r, 0, 6.3); c.fill(); c.stroke(); c.beginPath(); c.arc(x - 3, y - 4, 3.5, 0, 6.3); c.fill(); c.stroke(); c.beginPath(); c.arc(x - 8, y + 2, 2, 0, 6.3); c.fill(); c.stroke();
      drawEmoji(c, icon, x + 6, y - 21, 18);
    }
    c.restore();
  }
  function nameTag(c, x, y, t) { c.save(); c.font = '600 11px system-ui,sans-serif'; var w = c.measureText(t).width + 12; c.fillStyle = 'rgba(20,30,50,.72)'; rr(c, x - w / 2, y, w, 17, 8); c.fill(); c.fillStyle = '#fff'; c.textAlign = 'center'; c.fillText(t, x, y + 12.5); c.restore(); }
  function rr(c, x, y, w, h, r) { c.beginPath(); c.moveTo(x + r, y); c.arcTo(x + w, y, x + w, y + h, r); c.arcTo(x + w, y + h, x, y + h, r); c.arcTo(x, y + h, x, y, r); c.arcTo(x, y, x + w, y, r); c.closePath(); }
  // ---------- Interfaz ----------
  var UI = null;
  function sel() { if (!S) return null; for (var i = 0; i < S.snakes.length; i++) if (S.snakes[i].id === S.sel) return S.snakes[i]; return S.snakes[0] || null; }
  var QUIET = false;
  // ---------- Emojis de Snake OS ya en el primer pintado (sin parpadeo sistema → Snake) ----------
  var EMO_RE = null;
  try { EMO_RE = new RegExp('(?:\\p{Regional_Indicator}{2})|(?:\\p{Extended_Pictographic}(?:\\uFE0F|[\\u{1F3FB}-\\u{1F3FF}])?(?:\\u200D\\p{Extended_Pictographic}\\uFE0F?)*)', 'gu'); } catch (e) {}
  function snkE() { try { var se = global.snakeEmoji; return se && se.active && se.active() && se.url ? se : null; } catch (e) { return null; } }
  function emoText(t) {
    var se = snkE(); if (!se || !EMO_RE) return t;
    return t.replace(EMO_RE, function (m) { var u = se.url(m); if (!u) return m; emoImg(m); return '<span class="snk-ew"><span class="snk-e" role="img"><img class="snk-e-img" alt="" draggable="false" src="' + u + '"><span class="snk-et">' + m + '</span></span></span>'; });
  }
  function emo(html) {
    html = String(html == null ? '' : html); if (!snkE() || !EMO_RE) return html;
    var parts = html.split(/(<[^>]*>)/), skip = 0, out = '';
    for (var i = 0; i < parts.length; i++) {
      var p = parts[i]; if (!p) continue;
      if (p.charAt(0) === '<') { if (/^<(option|textarea|select|title|canvas)\b/i.test(p)) skip++; else if (/^<\/(option|textarea|select|title|canvas)>/i.test(p)) skip = Math.max(0, skip - 1); out += p; }
      else out += skip ? p : emoText(p);
    }
    return out;
  }
  function setHTML(el, html) { if (!el || el._h === html) return; el._h = html; el.innerHTML = emo(html); }
  function setText(el, t) { setHTML(el, esc(t)); }
  var EIMG = {};
  function emoImg(ch) {
    var se = snkE(); if (!se) return null;
    var im = EIMG[ch];
    if (im === undefined) { var u = se.url(ch); if (!u) { EIMG[ch] = null; return null; } im = new Image(); im.decoding = 'async'; im.src = u; EIMG[ch] = im; }
    return im && im.complete && im.naturalWidth ? im : null;
  }
  function preloadEmojis(str) { if (!snkE() || !EMO_RE) return; (String(str).match(EMO_RE) || []).forEach(function (c) { emoImg(c); }); }
  function drawEmoji(c, ch, x, y, size) {
    var im = emoImg(ch);
    if (im) { c.drawImage(im, x - size / 2, y - size / 2, size, size); return; }
    c.save(); c.font = size + 'px system-ui,sans-serif'; c.textAlign = 'center'; c.textBaseline = 'middle'; c.fillText(ch, x, y); c.restore();
  }
  function toast(msg, type) { if (QUIET) return; if (UI && UI.toast) UI.toast(msg, type); }
  var actx = null;
  function sfx(k) {
    if (!S || !S.settings.sound || !UI) return;
    try {
      if (!actx) { var AC = global.AudioContext || global.webkitAudioContext; if (!AC) return; actx = new AC(); }
      var notes = { coin: [880, 1320], ach: [660, 880, 1100], bell: [740, 560], egg: [520, 780], click: [600] }[k] || [600];
      notes.forEach(function (f, i) {
        var o = actx.createOscillator(), g = actx.createGain(), t = actx.currentTime + i * 0.09;
        o.type = 'sine'; o.frequency.value = f; g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(0.07, t + 0.02); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.22);
        o.connect(g); g.connect(actx.destination); o.start(t); o.stop(t + 0.25);
      });
    } catch (e) {}
  }
  var CSS = [
    '.lsx-top .lsx-tb{background:rgba(255,255,255,.18);color:#fff;box-shadow:none;position:relative;padding:5px 8px}',
    '.lsx-tb .bdg{position:absolute;top:-4px;right:-4px;min-width:17px;height:17px;border-radius:9px;background:#e74c3c;color:#fff;font:700 10.5px system-ui,sans-serif;font-style:normal;display:none;align-items:center;justify-content:center;padding:0 4px;box-shadow:0 1px 3px rgba(0,0,0,.3)}',
    '.lsx-modes button.dis{opacity:.4}',
    '.lsx-vbar{display:none;align-items:center;gap:8px;padding:5px 10px;background:linear-gradient(#fff6d8,#ffeeb8);border-bottom:1px solid #f0d98a;min-height:38px;flex-wrap:nowrap;overflow:hidden}',
    '.lsx-vbar .vt{white-space:nowrap;overflow:hidden;text-overflow:ellipsis;min-width:0}','.lsx-vbar .vt small{color:#8a6d1d;margin-left:4px}',
    '.lsx-vbar .lv{font-size:11.5px;font-weight:700;background:#fff;border-radius:9px;padding:2px 8px;white-space:nowrap;color:#6b7b8b}','.lsx-vbar .lv.on{color:#1e8449}',
    '.lsx-vbar .sp{flex:1}','.lsx-vbar button{flex:0 0 auto;padding:4px 10px}','.lsx-vbar em{font-style:normal}',
    '.lsx.mid .lsx-vbar em,.lsx.narrow .lsx-vbar .vt small{display:none}',
    '.lsx-fr{display:grid;grid-template-columns:150px 1fr;gap:12px;align-items:center;background:#f4f8fc;border-radius:14px;padding:10px;margin:8px 0}',
    '.lsx-fr canvas.hs{width:150px;height:96px;border-radius:10px;background:#cfe9c4;display:block}',
    '.lsx-fr .fm{display:flex;gap:4px;flex-wrap:wrap;margin:4px 0}','.lsx-fr .fm canvas{width:34px;height:34px;border-radius:8px;background:#fff}',
    '.lsx-fr .dot{display:inline-block;width:9px;height:9px;border-radius:50%;background:#b8c2cc;margin-right:5px}','.lsx-fr .dot.on{background:#2ecc71}',
    '.lsx-fr .why{color:#a05a00;font-size:12px}',
    '.lsx-gifts{display:grid;grid-template-columns:repeat(auto-fill,minmax(118px,1fr));gap:8px;margin:8px 0}',
    '.lsx-gifts button{display:flex;flex-direction:column;align-items:center;gap:2px;padding:8px 6px;background:#f4f8fc;white-space:normal !important;text-align:center}',
    '.lsx-gifts button.on{background:#d9ebff;outline:2px solid #2f80ed}','.lsx-gifts button .gi{font-size:24px}','.lsx-gifts button b{color:#1e8449;font-size:12px}',
    '.lsx-mailit{display:flex;gap:10px;align-items:flex-start;background:#fffbe9;border:1px solid #f1e4b3;border-radius:12px;padding:8px 10px;margin:6px 0}','.lsx-mailit .mi{font-size:22px}',
    '.lsx-card textarea{font:inherit;width:100%;min-height:64px;padding:6px 8px;border-radius:8px;border:1px solid #c5d3e2;resize:vertical;margin:0}',
    '.lsx.narrow .lsx-fr{grid-template-columns:1fr}','.lsx.narrow .lsx-fr canvas.hs{width:100%;height:110px}',
    ':where(.lsx) button{width:auto;min-width:0;margin:0;border:0;white-space:nowrap;line-height:1.2;text-transform:none;letter-spacing:normal;font-weight:inherit}',
    ':where(.lsx) input,:where(.lsx) select{width:auto;margin:0;min-width:0;max-width:100%}',
    ':where(.lsx) input[type=checkbox]{width:16px;height:16px;padding:0;flex:0 0 auto}',
    '.lsx{position:relative;width:100%;height:100%;display:flex;flex-direction:column;font:13px system-ui,-apple-system,"Segoe UI",Roboto,sans-serif;color:#1d2b3a;background:#dff3ff;overflow:hidden;user-select:none;-webkit-user-select:none;outline:none}',
    '.lsx *{box-sizing:border-box}','.lsx .snk-e-img{width:1.15em;height:1.15em;vertical-align:-0.2em}',
    '.lsx button{font:inherit;cursor:pointer;border:0;border-radius:10px;background:#fff;color:#1d2b3a;padding:5px 10px;box-shadow:0 1px 2px rgba(0,0,0,.12);transition:transform .08s,background .15s}',
    '.lsx button:active{transform:scale(.96)}',
    '.lsx-top{display:flex;align-items:center;gap:8px;padding:6px 8px;background:linear-gradient(#3a8bf0,#1c64d1);color:#fff;flex-wrap:nowrap;min-height:44px;overflow:hidden}',
    '.lsx-brand{display:flex;align-items:center;gap:7px;font-weight:800;font-size:14px;white-space:nowrap}',
    '.lsx-brand img{width:26px;height:26px;border-radius:7px;box-shadow:0 1px 3px rgba(0,0,0,.3)}',
    '.lsx-brand small{font-weight:600;opacity:.85;overflow:hidden;text-overflow:ellipsis;max-width:150px}','.lsx-brand{min-width:0;flex-shrink:1;overflow:hidden}',
    '.lsx-modes{display:flex;gap:3px;background:rgba(255,255,255,.16);padding:3px;border-radius:12px}',
    '.lsx-modes button{background:transparent;color:#fff;box-shadow:none;padding:4px 10px;font-weight:700;white-space:nowrap}','.lsx-modes em{font-style:normal}','.lsx.mid .lsx-modes em,.lsx.mid .lsx-brand small{display:none}','.lsx.mid .lsx-modes button{padding:4px 9px;font-size:15px}',
    '.lsx-modes button.on{background:#fff;color:#1c64d1}',
    '.lsx-sp{flex:1}',
    '.lsx-clock{display:flex;flex-direction:column;align-items:flex-end;line-height:1.15;font-size:10.5px;white-space:nowrap;flex-shrink:0}',
    '.lsx-clock b{font-size:17px;font-variant-numeric:tabular-nums}',
    '.lsx-speed{display:flex;gap:2px;background:rgba(0,0,0,.12);padding:2px;border-radius:11px}',
    '.lsx-speed button{padding:4px 8px;background:transparent;color:#fff;box-shadow:none;font-weight:800;letter-spacing:-2px !important}',
    '.lsx-speed button.on{background:#ffd23f;color:#1d2b3a}',
    '.lsx-money{background:#27ae60;color:#fff;font-weight:800;padding:6px 11px;border-radius:10px;min-width:84px;text-align:center;font-variant-numeric:tabular-nums;box-shadow:inset 0 -2px 0 rgba(0,0,0,.15)}',
    '.lsx-money.neg{background:#e74c3c}',
    '.lsx-stage{position:relative;flex:1;min-height:0;touch-action:none;cursor:pointer}',
    '.lsx-stage canvas.main{position:absolute;inset:0;width:100%;height:100%;display:block}',
    '.lsx-queue{position:absolute;left:8px;top:8px;display:flex;gap:6px;align-items:center;flex-wrap:wrap;max-width:55%;z-index:2}',
    '.lsx-qi{position:relative;width:38px;height:38px;border-radius:50%;background:#fff;display:flex;align-items:center;justify-content:center;font-size:18px;box-shadow:0 2px 6px rgba(0,0,0,.2);border:2px solid #fff;padding:0}',
    '.lsx-qi.cur{border-color:#2ecc71;width:48px;height:48px;font-size:23px}',
    '.lsx-qi.auto{opacity:.75;border-style:dashed;border-color:#9fb3c8}',
    '.lsx-qi .x{position:absolute;top:-5px;right:-5px;width:17px;height:17px;border-radius:50%;background:#e74c3c;color:#fff;font-size:11px;line-height:17px;text-align:center;font-weight:800}',
    '.lsx-qi .pg{position:absolute;left:6px;right:6px;bottom:-6px;height:4px;border-radius:2px;background:#d5dfe9;overflow:hidden}',
    '.lsx-qi .pg i{display:block;height:100%;background:#2ecc71}',
    '.lsx-qlabel{background:rgba(255,255,255,.92);padding:4px 9px;border-radius:9px;font-weight:700;font-size:12px;box-shadow:0 2px 6px rgba(0,0,0,.15)}',
    '.lsx-toasts{position:absolute;left:50%;bottom:10px;transform:translateX(-50%);display:flex;flex-direction:column;gap:6px;align-items:center;pointer-events:none;width:min(92%,470px);z-index:6}',
    '.lsx-toast{background:rgba(255,255,255,.97);border-left:5px solid #2f80ed;padding:7px 12px;border-radius:10px;box-shadow:0 4px 14px rgba(0,0,0,.18);font-weight:600;animation:lsxIn .25s ease-out;max-width:100%}',
    '.lsx-toast.good{border-color:#2ecc71}.lsx-toast.warn{border-color:#f39c12}.lsx-toast.bad{border-color:#e74c3c}.lsx-toast.ach{border-color:#9b59b6;background:linear-gradient(90deg,#fbf6ff,#fff)}',
    '@keyframes lsxIn{from{opacity:0;transform:translateY(-8px)}to{opacity:1;transform:none}}',
    '.lsx-pie{position:absolute;display:none;flex-direction:column;gap:4px;background:rgba(255,255,255,.98);border-radius:14px;padding:8px;box-shadow:0 10px 30px rgba(0,0,0,.28);width:240px;max-height:80%;overflow:auto;z-index:7}',
    '.lsx-pie h4{margin:0 2px 4px;font-size:12.5px;color:#4a5a6b;display:flex;justify-content:space-between;gap:6px}',
    '.lsx-pie button{white-space:normal !important;text-align:left;background:#f0f6fc;display:flex;gap:8px;align-items:center;padding:6px 9px;box-shadow:none}',
    '.lsx-pie button:hover{background:#d9ebff}',
    '.lsx-pie button[disabled]{opacity:.5;cursor:default}',
    '.lsx-pie button .ic{font-size:17px;width:22px;text-align:center}',
    '.lsx-pie small{display:block;color:#8592a0;font-size:10.5px}',
    '.lsx-drawer{position:absolute;right:8px;top:8px;bottom:8px;width:min(320px,86%);background:rgba(255,255,255,.98);border-radius:14px;box-shadow:0 10px 30px rgba(0,0,0,.25);display:none;flex-direction:column;overflow:hidden;z-index:5}',
    '.lsx-drawer header{display:flex;align-items:center;justify-content:space-between;padding:9px 12px;background:linear-gradient(#eef6ff,#e2eefb);font-weight:800}',
    '.lsx-drawer .bd{overflow:auto;padding:10px 12px;flex:1;user-select:text;-webkit-user-select:text}',
    '.lsx-drawer h5{margin:10px 0 5px;font-size:12px;color:#5b6b7b;text-transform:uppercase;letter-spacing:.04em}',
    '.lsx-row{display:flex;align-items:center;gap:8px;margin:5px 0}',
    '.lsx-chip{display:inline-block;padding:2px 8px;border-radius:9px;background:#eaf2fb;margin:2px !important;font-size:11.5px}',
    '.lsx-chip.on{background:#2f80ed;color:#fff}',
    '.lsx-bottom{display:flex;gap:12px;align-items:stretch;padding:8px 10px;background:linear-gradient(#f8fbff,#e2edf9);border-top:1px solid #c9d9ea;height:116px;flex-shrink:0;overflow:hidden}',
    '.lsx-ports{display:flex;gap:7px;align-items:center;flex-wrap:wrap;max-width:34%;align-content:center}',
    '.lsx-port{width:54px;height:54px;border-radius:15px;background:linear-gradient(#ffffff,#e9f3fd);position:relative;padding:0;border:3px solid transparent}',
    '.lsx-port.on{border-color:#2ecc71;box-shadow:0 0 0 2px rgba(46,204,113,.25)}',
    '.lsx-port canvas{width:100%;height:100%;display:block}',
    '.lsx-port .md{position:absolute;bottom:-4px;right:-4px;width:15px;height:15px;border-radius:50%;border:2px solid #fff}',
    '.lsx-port .aw{position:absolute;top:-6px;left:-6px;font-size:14px}',
    '.lsx-port .nm{position:absolute;left:-4px;right:-4px;bottom:-15px;font-size:10px;font-weight:700;text-align:center;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}',
    '.lsx-needs{flex:1;display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:5px 14px;align-content:center;min-width:0}',
    '.lsx-need{display:flex;align-items:center;gap:6px;font-size:11.5px;min-width:0}',
    '.lsx-need .l{width:78px;white-space:nowrap;overflow:hidden}',
    '.lsx-bar{flex:1;height:10px;background:#d3dde8;border-radius:6px;overflow:hidden;min-width:30px}',
    '.lsx-bar i{display:block;height:100%;border-radius:6px;transition:width .35s}',
    '.lsx-side{display:flex;flex-direction:column;gap:6px;width:262px;flex-shrink:0;justify-content:center}',
    '.lsx-mood{display:flex;align-items:center;gap:4px 8px;font-weight:800;font-size:13.5px;flex-wrap:wrap}',
    '.lsx-mood .dot{width:14px;height:14px;border-radius:50%}',
    '.lsx-mood small{font-weight:600;color:#6b7b8b;flex-basis:100%;padding-left:22px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}',
    '.lsx-ml{display:flex;flex-wrap:wrap;gap:3px;max-height:36px;overflow:hidden}',
    '.lsx-ml span{font-size:10.5px;padding:2px 6px;border-radius:8px;background:#e3f6e9}',
    '.lsx-ml span.neg{background:#fde6e3}',
    '.lsx-tabs{display:flex;gap:4px;flex-wrap:wrap}',
    '.lsx-tabs button{padding:4px 0;width:30px;font-size:15px}',
    '.lsx-tabs button.on{background:#2f80ed}',
    '.lsx-cats{display:grid;grid-template-columns:1fr 1fr;gap:3px;width:200px;flex-shrink:0;overflow:auto;align-content:start}',
    '.lsx-cats button{padding:3px 8px;text-align:left;font-size:11.5px;box-shadow:none;background:#eef4fb;white-space:nowrap}',
    '.lsx-cats button.on{background:#2f80ed;color:#fff}',
    '.lsx-items{flex:1;display:flex;gap:8px;overflow-x:auto;overflow-y:hidden;align-items:stretch;min-width:0;padding-bottom:2px}',
    '.lsx-item{white-space:normal !important;flex:0 0 92px;display:flex;flex-direction:column;align-items:center;gap:1px;padding:4px;border-radius:12px;background:#fff;font-size:10.5px;text-align:center;line-height:1.1}',
    '.lsx-item.on{outline:3px solid #2ecc71}',
    '.lsx-item canvas{width:50px;height:41px}',
    '.lsx-item b{color:#27ae60}',
    '.lsx-tool{display:flex;flex-direction:column;gap:5px;width:190px;flex-shrink:0;font-size:12px;justify-content:center}',
    '.lsx-sw{display:flex;flex-wrap:wrap;gap:6px;align-content:center;flex:1}',
    '.lsx-sw button{width:42px;height:42px;padding:0;border:3px solid #fff}',
    '.lsx-sw button.on{border-color:#2ecc71}',
    '.lsx-modal{position:absolute;inset:0;background:rgba(10,30,60,.5);display:none;align-items:center;justify-content:center;z-index:20;padding:10px}',
    '.lsx-card{background:#fff;border-radius:18px;padding:16px 18px;width:min(700px,100%);max-height:100%;overflow:auto;box-shadow:0 14px 44px rgba(0,0,0,.35);user-select:text;-webkit-user-select:text}',
    '.lsx-card button{white-space:normal}','.lsx-card h2{margin:0 0 8px;font-size:20px;color:#1c64d1}',
    '.lsx-card input,.lsx-card select{font:inherit;padding:5px 8px;border-radius:8px;border:1px solid #c5d3e2;background:#fff}',
    '.lsx-mem{border:1px solid #dbe6f1;border-radius:14px;padding:10px;margin:8px 0;display:grid;grid-template-columns:70px 1fr;gap:10px;align-items:start}',
    '.lsx-mem canvas{width:70px;height:70px;background:linear-gradient(#e9f6ff,#c9e7ff);border-radius:12px}',
    '.lsx-swatch{width:22px;height:22px;border-radius:50%;padding:0;border:3px solid #fff;box-shadow:0 0 0 1px #c5d3e2}',
    '.lsx-swatch.on{box-shadow:0 0 0 2px #1c64d1}',
    '.lsx-btnp{background:#2f80ed !important;color:#fff !important;font-weight:800}',
    '.lsx-btng{background:#27ae60 !important;color:#fff !important;font-weight:800}',
    '.lsx.narrow .lsx-bottom{flex-wrap:wrap;gap:8px;height:auto;max-height:46%;overflow:auto}',
    '.lsx.narrow .lsx-ports{max-width:none;width:100%;padding-bottom:12px}',
    '.lsx.narrow .lsx-port{width:44px;height:44px}',
    '.lsx.narrow .lsx-needs{grid-template-columns:repeat(2,minmax(0,1fr));min-width:100%}','.lsx.narrow .lsx-need .l{width:70px}',
    '.lsx.narrow .lsx-side{width:100%}',
    '.lsx.narrow .lsx-brand small,.lsx.narrow .lsx-brand b,.lsx.narrow .lsx-clock span{display:none}','.lsx.narrow .lsx-top{gap:5px;padding:5px}','.lsx.narrow .lsx-brand{display:none}','.lsx.narrow .lsx-money{min-width:0;padding:5px 7px}','.lsx.narrow .lsx-speed button{padding:4px 5px}',
    '.lsx.narrow .lsx-modes button{padding:4px 7px}',
    '.lsx.narrow .lsx-cats{display:flex;width:100%;overflow-x:auto}','.lsx.narrow .lsx-cats button{flex:0 0 auto}','.lsx.narrow .lsx-items{min-width:100%;height:96px}',
    '.lsx.narrow .lsx-tool{width:100%}',
    '.lsx.narrow .lsx-mem{grid-template-columns:1fr}'
  ].join('\n');
  function ensureCss() { if (document.getElementById('lsx-css')) return; var st = document.createElement('style'); st.id = 'lsx-css'; st.textContent = CSS; document.head.appendChild(st); }
  function el(tag, cls, html) { var e = document.createElement(tag); if (cls) e.className = cls; if (html != null) e.innerHTML = html; return e; }
  function needCol(v) { return v > 60 ? '#2ecc71' : v > 35 ? '#f1c40f' : v > 18 ? '#f39c12' : '#e74c3c'; }
  function drawPortrait(cv, sn, size) {
    var dpr = global.devicePixelRatio || 1, c = cv.getContext('2d'); cv.width = size * dpr; cv.height = size * dpr;
    c.setTransform(dpr, 0, 0, dpr, 0, 0); c.clearRect(0, 0, size, size);
    var fake = { id: sn.id, age: sn.age, color: sn.color, pattern: sn.pattern, fx: 1, q: [], mood: 80 };
    var k = size / 54, s = AGES[sn.age].s;
    c.save(); c.translate(size * 0.42, size * 0.86); c.scale(k * 0.95 / Math.max(0.75, s), k * 0.95 / Math.max(0.75, s)); drawSnake(c, fake, 0, 0); c.restore();
  }
  function objThumb(cv, t) {
    var dpr = global.devicePixelRatio || 1, c = cv.getContext('2d'), W = 64, H = 52; cv.width = W * dpr; cv.height = H * dpr; c.setTransform(dpr, 0, 0, dpr, 0, 0);
    var o = { id: -1, t: t, x: 0, y: 0, r: 0 }, f = fp(o), cc = P(f.w / 2, f.h / 2), ht = CAT[t].ht || 20, sc = Math.min(60 / (32 * (f.w + f.h)), 46 / (16 * (f.w + f.h) + ht));
    c.translate(W / 2 - cc[0] * sc, 3 + ht * sc); c.scale(sc, sc); drawObj(c, o);
  }
  function createUI(body) {
    ensureCss();
    try { preloadEmojis(JSON.stringify([NEEDS, TRAITS, SEASONS, ACH, CAREERS, ASP]) + Object.keys(ACT).map(function (k) { return ACT[k].i; }).join('') + Object.keys(SOC).map(function (k) { return SOC[k].i; }).join('') + '🏠🛋️🎨⚙️🏘️📬🎁👤👥⭐💼📔🏆❔💤🎒✨💭💚💗💢❓⏳🤷❗😾😒🔥🐁🪙💎🧸🟫🧱💾🐣🌡️👣👅🐭👆⟳✋💰🗑️➕🎲⛈️🍼🛁🪀🌙🧁👋🔔🐢🎉🧾🎂📈😬💞💔🥚🏅🌟'); } catch (e) {}
    var root = el('div', 'lsx'); root.tabIndex = 0; root.setAttribute('data-keyboard-game', '1');
    root.innerHTML = emo(
      '<div class="lsx-top"><div class="lsx-brand"><img src="/static/assets/los-snakes-icon-64.png?v=202610171812" alt=""><b>Los Snakes</b><small class="hh"></small></div>' +
      '<div class="lsx-modes"><button data-mode="live" class="on" title="Vivir">🏠<em> Vivir</em></button><button data-mode="buy" title="Comprar">🛋️<em> Comprar</em></button><button data-mode="build" title="Construir">🎨<em> Construir</em></button></div>' +
      '<div class="lsx-sp"></div><div class="lsx-clock"><span class="sea"></span><b class="tm">08:00</b></div>' +
      '<div class="lsx-speed"><button data-sp="0" title="Pausa (espacio)">❚❚</button><button data-sp="1" title="Velocidad 1 (1)">▶</button><button data-sp="2" title="Velocidad 2 (2)">▶▶</button><button data-sp="3" title="Velocidad 3 (3)">▶▶▶</button></div>' +
      '<div class="lsx-money">§0</div><button class="lsx-vis lsx-tb" title="Visitar a amigos">🏘️</button><button class="lsx-mail lsx-tb" title="Buzón"><span class="mic">📬</span><i class="bdg"></i></button><button class="lsx-opt" title="Opciones" style="background:rgba(255,255,255,.18);color:#fff;box-shadow:none">⚙️</button></div>' +
      '<div class="lsx-vbar"></div><div class="lsx-stage"><canvas class="main"></canvas><div class="lsx-queue"></div><div class="lsx-toasts"></div><div class="lsx-pie"></div><div class="lsx-drawer"><header><span class="dt"></span><button class="dx">✕</button></header><div class="bd"></div></div></div>' +
      '<div class="lsx-bottom"></div><div class="lsx-modal"><div class="lsx-card"></div></div>');
    body.innerHTML = ''; body.appendChild(root);
    var $ = function (q) { return root.querySelector(q); };
    var stage = $('.lsx-stage'), cv = $('canvas.main'), ctx = cv.getContext('2d'), pie = $('.lsx-pie'), drawer = $('.lsx-drawer'), bottom = $('.lsx-bottom'), modal = $('.lsx-modal'), card = $('.lsx-card');
    var W = 600, H = 400, dpr = 1, dead = false, mode = 'live', drawerTab = null, buyCat = 'Cocina', placing = null, ghost = null, ghostOk = false, moving = null, selObj = 0;
    var tool = 'floor', swatch = 0, roomFill = false, hoverTiles = null, hoverEnt = 0, prevSpeed = 1, modalOn = false;
    var ui = { toast: addToast, askName: askName };
    UI = ui;

    // ---- toasts
    function addToast(msg, type) {
      var box = $('.lsx-toasts'); var t = el('div', 'lsx-toast ' + (type || ''), emo(esc(msg))); box.appendChild(t);
      while (box.children.length > 3) box.removeChild(box.firstChild);
      setTimeout(function () { if (t.parentNode) { t.style.transition = 'opacity .4s'; t.style.opacity = '0'; setTimeout(function () { if (t.parentNode) t.parentNode.removeChild(t); }, 400); } }, type === 'ach' ? 5200 : 4200);
    }
    // ---- tamaño
    function resize() {
      var r = stage.getBoundingClientRect(); W = Math.max(50, r.width); H = Math.max(50, r.height); dpr = Math.min(2, global.devicePixelRatio || 1);
      cv.width = Math.round(W * dpr); cv.height = Math.round(H * dpr);
      var rw = root.getBoundingClientRect().width; root.classList.toggle('narrow', rw < 720); root.classList.toggle('mid', rw < 900);
      if (cam.fit) fitCam(W, H);
    }
    var ro = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(function () { resize(); }) : null; if (ro) ro.observe(root); else global.addEventListener('resize', resize);
    // ---- modo
    function setMode(m) {
      if (!S) return; if (m === mode) return;
      if (S.visit && m !== 'live') { toast('Estás de visita: los muebles de esta casa no se pueden tocar.', 'warn'); return; }
      if (mode === 'live' && m !== 'live') { prevSpeed = S.speed; }
      mode = m; placing = null; ghost = null; moving = null; selObj = 0; hidePie();
      root.querySelectorAll('.lsx-modes button').forEach(function (b) { b.classList.toggle('on', b.dataset.mode === m); });
      if (m === 'live') { S.speed = prevSpeed || 1; }
      buildBottom(); updateTop();
    }
    function setSpeed(i) { if (!S) return; if (mode !== 'live') setMode('live'); S.speed = i; updateTop(); }
    root.querySelector('.lsx-modes').addEventListener('click', function (e) { var b = e.target.closest('button'); if (b) setMode(b.dataset.mode); });
    root.querySelector('.lsx-speed').addEventListener('click', function (e) { var b = e.target.closest('button'); if (b) setSpeed(+b.dataset.sp); });
    $('.lsx-opt').addEventListener('click', function () { toggleDrawer('opts'); });
    $('.lsx-vis').addEventListener('click', function () { if (S) visitClick(); });
    $('.lsx-mail').addEventListener('click', function () { if (S) mailClick(); });
    $('.dx').addEventListener('click', function () { toggleDrawer(null); });

    function updateTop() {
      if (!S) return;
      setText(root.querySelector('.hh'), 'Familia ' + S.name);
      var se = SEASONS[season()];
      setText($('.sea'), se.i + ' ' + se.n + ' · ' + WEEK[weekday()] + ' · Día ' + (dayIdx() + 1) + (S.weather.k === 'tormenta' ? ' · ⛈️' : ''));
      setText($('.tm'), hhmm(S.time));
      var mo = $('.lsx-money'); setText(mo, money(S.money)); mo.classList.toggle('neg', S.money < 0);
      var sp = mode === 'live' ? S.speed : 0;
      root.querySelectorAll('.lsx-speed button').forEach(function (b) { b.classList.toggle('on', +b.dataset.sp === sp); });
    }

    // ---- barra inferior
    function buildBottom() {
      if (!S) { bottom.innerHTML = ''; return; }
      if (mode === 'live') {
        bottom.innerHTML = emo('<div class="lsx-ports"></div><div class="lsx-needs"></div><div class="lsx-side"><div class="lsx-mood"></div><div class="lsx-ml"></div><div class="lsx-tabs">' +
          [['ficha', '👤', 'Ficha'], ['rel', '👥', 'Relaciones'], ['skills', '⭐', 'Habilidades'], ['job', '💼', 'Trabajo'], ['diary', '📔', 'Diario'], ['ach', '🏆', 'Logros'], ['help', '❔', 'Cómo jugar']].map(function (t) { return '<button data-tab="' + t[0] + '" title="' + t[2] + '">' + t[1] + '</button>'; }).join('') + '</div></div>');
        var nh = ''; NEEDS.forEach(function (n) { nh += '<div class="lsx-need" data-k="' + n.k + '"><span class="l">' + n.i + ' ' + n.n + '</span><div class="lsx-bar"><i></i></div></div>'; });
        bottom.querySelector('.lsx-needs').innerHTML = emo(nh);
        bottom.querySelector('.lsx-tabs').addEventListener('click', function (e) { var b = e.target.closest('button'); if (b) toggleDrawer(b.dataset.tab); });
        buildPorts(); updateBottom();
      } else if (mode === 'buy') {
        bottom.innerHTML = '<div class="lsx-cats">' + BUY_CATS.map(function (c) { return '<button data-c="' + c + '"' + (c === buyCat ? ' class="on"' : '') + '>' + c + '</button>'; }).join('') + '</div><div class="lsx-items"></div><div class="lsx-tool"></div>';
        bottom.querySelector('.lsx-cats').addEventListener('click', function (e) { var b = e.target.closest('button'); if (!b) return; buyCat = b.dataset.c; buildBottom(); });
        var items = bottom.querySelector('.lsx-items');
        Object.keys(CAT).forEach(function (t) {
          var c = CAT[t]; if (c.nobuy || c.cat !== buyCat) return;
          var it = el('button', 'lsx-item' + (placing === t ? ' on' : ''), '<canvas></canvas><span>' + esc(c.n) + '</span><b>' + money(c.p) + '</b>'); it.dataset.t = t; items.appendChild(it);
          objThumb(it.querySelector('canvas'), t);
        });
        items.addEventListener('click', function (e) { var b = e.target.closest('.lsx-item'); if (!b) return; startPlacing(b.dataset.t); });
        updateTool();
      } else {
        bottom.innerHTML = emo('<div class="lsx-tool"><div class="lsx-row"><button data-tool="floor">🟫 Suelo</button><button data-tool="wall">🧱 Paredes</button></div><label class="lsx-row" style="gap:6px"><input type="checkbox" class="rf"> Habitación entera</label><small class="hint"></small></div><div class="lsx-sw"></div>');
        bottom.querySelector('.rf').checked = roomFill;
        bottom.querySelector('.rf').addEventListener('change', function (e) { roomFill = e.target.checked; });
        bottom.querySelectorAll('[data-tool]').forEach(function (b) { b.classList.toggle('lsx-btnp', b.dataset.tool === tool); b.addEventListener('click', function () { tool = b.dataset.tool; swatch = 0; buildBottom(); }); });
        var list = tool === 'floor' ? FLOORS : WALLS, sw = bottom.querySelector('.lsx-sw');
        list.forEach(function (f, i) {
          var b = el('button', i === swatch ? 'on' : ''); b.title = f.n;
          b.style.background = f.c ? (f.c2 && f.p ? 'repeating-linear-gradient(45deg,' + f.c + ' 0 7px,' + f.c2 + ' 7px 14px)' : f.c) : SEASONS[season()].grass;
          b.addEventListener('click', function () { swatch = i; buildBottom(); }); sw.appendChild(b);
        });
        bottom.querySelector('.hint').textContent = (tool === 'floor' ? 'Arrastra para pintar el suelo (§2/casilla). ' : 'Haz clic en una habitación para pintar sus paredes (§6/tramo). ') + 'Seleccionado: ' + list[swatch].n + '. Clic derecho y arrastrar o flechas para mover la cámara.';
      }
    }
    function buildPorts() {
      var box = bottom.querySelector('.lsx-ports'); if (!box) return; box.innerHTML = '';
      S.snakes.forEach(function (sn) {
        var b = el('button', 'lsx-port' + (sn.id === S.sel ? ' on' : ''), '<canvas></canvas><span class="md"></span><span class="aw"></span><span class="nm"></span>'); b.dataset.id = sn.id; b.title = sn.name;
        box.appendChild(b); drawPortrait(b.querySelector('canvas'), sn, 48);
      });
      box.onclick = function (e) { var b = e.target.closest('.lsx-port'); if (!b) return; var id = +b.dataset.id; if (S.sel === id) centerOn(sel()); S.sel = id; buildPorts(); updateBottom(); if (drawerTab) renderDrawer(); };
    }
    function centerOn(sn) { if (!sn || sn.away) return; var p = P(sn.x, sn.y); cam.x = W / 2 - p[0] * cam.z; cam.y = H / 2 - p[1] * cam.z; cam.fit = false; }
    function updateBottom() {
      if (!S || mode !== 'live') return;
      var s = sel(); if (!s) return;
      var ports = bottom.querySelectorAll('.lsx-port');
      if (ports.length !== S.snakes.length) { buildPorts(); ports = bottom.querySelectorAll('.lsx-port'); }
      ports.forEach(function (b) { var sn = entById(+b.dataset.id); if (!sn) return; b.querySelector('.md').style.background = moodColor(sn.mood); setText(b.querySelector('.aw'), sn.away ? (sn.away.kind === 'job' ? '💼' : '🎒') : (sn.q[0] && (ACT[sn.q[0].id] || {}).sleeping && sn.q[0].phase === 'do' ? '💤' : '')); setText(b.querySelector('.nm'), sn.name); });
      NEEDS.forEach(function (n) { var row = bottom.querySelector('.lsx-need[data-k="' + n.k + '"]'); if (!row) return; var v = s.needs[n.k]; var i = row.querySelector('i'); i.style.width = v.toFixed(0) + '%'; i.style.background = needCol(v); });
      var shedTxt = s.shedReady ? ' · ✨ lista para mudar' : '';
      setHTML(bottom.querySelector('.lsx-mood'), '<span class="dot" style="background:' + moodColor(s.mood) + '"></span>' + esc(s.name) + ' · ' + moodLabel(s.mood) + ' <small>' + AGES[s.age].n + (s.away ? ' · fuera hasta ' + hhmm(s.away.until) : '') + shedTxt + '</small>');
      setHTML(bottom.querySelector('.lsx-ml'), s.ml.slice(-5).map(function (m) { return '<span class="' + (m.v < 0 ? 'neg' : '') + '">' + esc(m.l) + ' ' + (m.v > 0 ? '+' : '') + m.v + '</span>'; }).join('') || '<span>Sin emociones especiales</span>');
      bottom.querySelectorAll('.lsx-tabs button').forEach(function (b) { b.classList.toggle('on', b.dataset.tab === drawerTab); });
    }
    function updateQueue() {
      var q = $('.lsx-queue'); if (!S || mode !== 'live') { setHTML(q, ''); return; }
      var s = sel(); if (!s) return;
      var h = '';
      if (s.away) h = '<div class="lsx-qlabel">' + (s.away.kind === 'job' ? '💼 En el trabajo' : '🎒 En el colegio') + ' hasta las ' + hhmm(s.away.until) + '</div>';
      else s.q.forEach(function (a, i) {
        var d = ACT[a.id] || SOC[a.id] || {}, dur = a.dur || d.dur || 30, pr = a.phase === 'do' ? (d.until ? s.needs[d.until] : clamp(a.t / dur * 100, 0, 100)) : 0;
        h += '<button class="lsx-qi' + (i === 0 ? ' cur' : '') + (a.user ? '' : ' auto') + '" data-i="' + i + '" title="' + esc(a.label || d.l) + '">' + (d.i || '•') + (a.id !== 'recv' ? '<span class="x">✕</span>' : '') + (i === 0 ? '<span class="pg"><i style="width:' + pr.toFixed(0) + '%"></i></span>' : '') + '</button>';
        if (i === 0) h += '<div class="lsx-qlabel">' + esc(a.label || d.l) + (a.phase === 'walk' && a.id !== 'go' ? ' <span style="opacity:.6">(yendo)</span>' : '') + '</div>';
      });
      setHTML(q, h);
    }
    $('.lsx-queue').addEventListener('click', function (e) { var b = e.target.closest('.lsx-qi'); if (!b) return; var s = sel(); if (s) { cancelAt(s, +b.dataset.i); updateQueue(); } });

    // ---- panel lateral
    function toggleDrawer(tab) { drawerTab = (tab && drawerTab !== tab) ? tab : null; drawer.style.display = drawerTab ? 'flex' : 'none'; if (drawerTab) renderDrawer(); updateBottom(); }
    function bar(v, max, col) { return '<div class="lsx-bar" style="height:9px"><i style="width:' + clamp(v / max * 100, 0, 100) + '%;background:' + col + '"></i></div>'; }
    function typing(box) { var a = document.activeElement; return !!(a && box && box.contains(a) && /^(INPUT|TEXTAREA|SELECT)$/.test(a.tagName)); }
    function renderDrawer(periodic) {
      if (!drawerTab || !S) return;
      if (periodic && typing(drawer)) return;
      var s = sel(), t = drawerTab, h = '', title = '';
      if (t === 'ficha' && s) {
        title = '👤 ' + s.name;
        h += '<h5>Nombre</h5><div class="lsx-row"><input class="rn" value="' + esc(s.name) + '" maxlength="16" style="flex:1" aria-label="Nombre"><button class="lsx-btnp" data-a="rename">Guardar</button></div>';
        h += '<div class="lsx-row"><small style="width:62px">Familia</small><input class="fam" value="' + esc(S.name) + '" maxlength="18" style="flex:1" aria-label="Apellido"' + (S.visit ? ' disabled' : '') + '></div>';
        h += '<h5>Color</h5><div class="lsx-row" style="flex-wrap:wrap;gap:5px">' + PALETTE.map(function (p) { return '<button class="lsx-swatch' + (s.color === p.c ? ' on' : '') + '" data-a="col" data-c="' + p.c + '" title="' + p.n + '" style="background:' + p.c + '"></button>'; }).join('') + '</div>';
        h += '<div>' + AGES[s.age].n + ' · día ' + (s.ageD + 1) + (AGES[s.age].days ? ' de ' + AGES[s.age].days : '') + (s.partner && entById(s.partner) ? ' · 💞 pareja de ' + esc(entById(s.partner).name) : '') + '</div>';
        h += '<h5>Rasgos <small style="text-transform:none;letter-spacing:0">(hasta 3, toca para cambiar)</small></h5><div>' + Object.keys(TRAITS).map(function (k) { var on = s.traits.indexOf(k) >= 0; return '<button class="lsx-chip' + (on ? ' on' : '') + '" data-a="tr" data-t="' + k + '">' + TRAITS[k].i + ' ' + TRAITS[k].n + '</button>'; }).join('') + '</div>';
        var A = ASP[s.asp]; h += '<h5>Aspiración</h5><select class="asp" style="width:100%">' + Object.keys(ASP).map(function (k) { return '<option value="' + k + '"' + (s.asp === k ? ' selected' : '') + '>' + ASP[k].i + ' ' + ASP[k].n + '</option>'; }).join('') + '</select>';
        if (A) h += '<div style="margin-top:4px">' + A.d + (s.aspDone ? ' ✅' : '') + '</div>' + bar(A.p(s), 1, '#9b59b6');
        h += '<h5>Muda de piel</h5><div>' + (s.shedReady ? '✨ ¡Lista para mudar! Haz clic sobre ' + esc(s.name) + ' → «Mudar la piel».' : 'Próxima muda en ~' + Math.max(1, s.shedAt - s.shed) + ' día(s).') + '</div>';
        h += '<h5>Patrón de piel</h5><div>' + Object.keys(PATTERNS).map(function (p) { var un = s.patterns.indexOf(p) >= 0; return '<button class="lsx-chip' + (s.pattern === p ? ' on' : '') + '" data-a="pat" data-p="' + p + '"' + (un ? '' : ' disabled style="opacity:.4"') + '>' + (un ? '' : '🔒 ') + PATTERNS[p] + '</button>'; }).join('') + '</div>';
        h += '<h5>Emociones</h5>' + (s.ml.length ? s.ml.map(function (m) { return '<div class="lsx-row"><span style="flex:1">' + esc(m.l) + '</span><b style="color:' + (m.v < 0 ? '#e74c3c' : '#27ae60') + '">' + (m.v > 0 ? '+' : '') + m.v + '</b></div>'; }).join('') : '<i>Nada especial</i>');
      } else if (t === 'rel' && s) {
        title = '👥 Relaciones de ' + s.name;
        var keys = Object.keys(s.rel).sort(function (a, b) { return s.rel[b].fr - s.rel[a].fr; });
        if (!keys.length) h = '<i>Aún no conoce a nadie.</i>';
        keys.forEach(function (k) {
          var r = s.rel[k], e = entById(isNaN(+k) ? k : +k), nm = e ? e.name : r.n, lab = r.fr >= 80 ? 'Mejor amigo' : r.fr >= 50 ? 'Amigo' : r.fr >= 10 ? 'Conocido' : r.fr > -30 ? 'Indiferente' : 'Enemigo';
          if (s.partner && String(s.partner) === k) lab = '💞 Pareja';
          var sp = String(k).indexOf('nb') === 0 ? (function () { var nb = S.neighbors.filter(function (n) { return 'nb' + n.id === k; })[0]; return nb ? ' (' + SPECIES[nb.sp].n.toLowerCase() + ')' : ''; })() : '';
          h += '<div style="margin:8px 0"><div class="lsx-row" style="margin:0"><b style="flex:1">' + esc(nm) + sp + (r.fam ? ' <small style="font-weight:500;color:#6b7b8b">· familia ' + esc(r.fam) + (r.own ? ' (' + esc(r.own) + ')' : '') + '</small>' : '') + '</b><small>' + lab + '</small></div>' +
            '<div class="lsx-row" style="margin:2px 0"><small style="width:62px">Amistad</small>' + bar(r.fr + 100, 200, r.fr >= 0 ? '#2ecc71' : '#e74c3c') + '<small style="width:30px;text-align:right">' + Math.round(r.fr) + '</small></div>' +
            (r.ro ? '<div class="lsx-row" style="margin:2px 0"><small style="width:62px">Romance</small>' + bar(r.ro, 100, '#ff6fae') + '<small style="width:30px;text-align:right">' + Math.round(r.ro) + '</small></div>' : '') + '</div>';
        });
      } else if (t === 'skills' && s) {
        title = '⭐ Habilidades de ' + s.name;
        Object.keys(SKILLS).forEach(function (k) { h += '<div class="lsx-row"><span style="width:96px">' + SKILLS[k] + '</span>' + bar(s.skills[k], 10, '#f1c40f') + '<b style="width:22px;text-align:right">' + Math.floor(s.skills[k]) + '</b></div>'; });
        h += '<h5>Cómo mejorarlas</h5><small>🍳 Cocina: cocinar · 🧠 Lógica: leer, investigar en el ordenador · 🗣️ Carisma: ensayar ante el espejo · 🥷 Sigilo: practicar sigilo en el jardín · 💪 Constricción: poste de enroscar · 👅 Olfato: olfatear con la lengua (encuentra comida, monedas y gemas escondidas).</small>';
      } else if (t === 'job' && s) {
        title = '💼 Trabajo de ' + s.name;
        if (s.job) {
          var C = CAREERS[s.job.c], L = C.lv[s.job.lv];
          h += '<div style="font-size:15px"><b>' + C.i + ' ' + L[0] + '</b></div><div>' + C.n + ' · nivel ' + (s.job.lv + 1) + '/5</div><div>Horario: ' + hhmm(C.h[0] * 60) + '–' + hhmm(C.h[1] * 60) + ', de lunes a viernes</div><div>Sueldo: ' + money(L[1]) + '/hora</div>';
          h += '<h5>Rendimiento</h5>' + bar(s.job.perf + 100, 220, '#2f80ed') + '<small>Ve al trabajo de buen humor para rendir más.</small>';
          if (s.job.lv < 4) h += '<h5>Próximo ascenso</h5><div>' + C.lv[s.job.lv + 1][0] + ' (' + money(C.lv[s.job.lv + 1][1]) + '/h). Requiere rendimiento alto y ' + SKILLS[C.skill] + ' ' + ((s.job.lv + 1) * 2) + ' (tienes ' + Math.floor(s.skills[C.skill]) + ').</div>';
          h += '<p><button data-a="quit">Dejar el trabajo</button></p>';
        } else if (s.age === 'joven') h += '<div>🎒 Va al colegio de 08:00 a 14:00 (L-V).</div><h5>Notas</h5>' + bar(s.school.perf, 100, '#2f80ed');
        else if (s.age === 'bebe') h += '<i>Las crías no trabajan: ¡solo comen, duermen y juegan!</i>';
        else h += '<div>Sin trabajo. Usa el <b>ordenador → Buscar trabajo</b>.</div><p><button class="lsx-btnp" data-a="jobs">Ver ofertas</button></p>';
      } else if (t === 'diary' && s) {
        title = '📔 Diario de ' + s.name;
        h += '<p><button data-a="diary">✍️ Escribir entrada ahora</button> <small>' + (ai.on ? '🤖 Con IA (Askbox)' : 'Frases locales (sin clave Askbox)') + '</small></p>';
        h += s.diary.slice().reverse().map(function (d) { return '<div style="background:#fffbe9;border-radius:10px;padding:8px 10px;margin:6px 0;border:1px solid #f1e4b3"><small><b>Día ' + d.d + '</b>' + (d.ai ? ' · 🤖' : '') + '</small><div>' + esc(d.t) + '</div></div>'; }).join('') || '<i>Todavía no hay entradas. Se escriben solas cada noche a las 22:00.</i>';
      } else if (t === 'ach') {
        title = '🏆 Logros de la familia';
        var n = Object.keys(S.ach).length; h += '<div>' + n + ' de ' + Object.keys(ACH).length + ' logros</div>';
        Object.keys(ACH).forEach(function (k) { var a = ACH[k], on = !!S.ach[k]; h += '<div class="lsx-row" style="opacity:' + (on ? 1 : 0.45) + '"><span style="font-size:20px">' + (on ? a[0] : '🔒') + '</span><div><b>' + a[1] + '</b><br><small>' + a[2] + (on ? ' · día ' + S.ach[k] : '') + '</small></div></div>'; });
        h += '<h5>Aspiraciones</h5>' + S.snakes.map(function (sn) { var A = ASP[sn.asp]; return A ? '<div class="lsx-row"><span style="width:84px">' + esc(sn.name) + '</span>' + bar(A.p(sn), 1, '#9b59b6') + '<small>' + A.i + '</small></div>' : ''; }).join('');
      } else if (t === 'opts') {
        title = '⚙️ Opciones';
        h += '<h5>Familia</h5><div class="lsx-row"><input class="fam" value="' + esc(S.name) + '" maxlength="18" style="flex:1" aria-label="Apellido de la familia"' + (S.visit ? ' disabled' : '') + '><button class="lsx-btnp" data-a="rename">Guardar</button></div><small>Para cambiar nombre, color, rasgos o aspiración de una serpiente, abre su 👤 Ficha.</small><h5>Juego</h5>';
        h += '<label class="lsx-row"><input type="checkbox" data-a="fw"' + (S.settings.freeWill ? ' checked' : '') + '> Libre albedrío (actúan solas cuando no les mandas nada)</label>';
        h += '<label class="lsx-row"><input type="checkbox" data-a="snd"' + (S.settings.sound ? ' checked' : '') + '> Sonidos</label>';
        h += '<p><button class="lsx-btng" data-a="save">💾 Guardar ahora</button></p><small>Se guarda solo cada día de juego y al cerrar' + (userKey() !== 'anon' ? ', en este navegador y en tu cuenta de Snake OS.' : ' (en este navegador).') + '</small>';
        h += '<h5>Visitas</h5><label class="lsx-row"><input type="checkbox" data-a="vis"' + (SOCIAL.allow !== 'off' ? ' checked' : '') + (SOCIAL.ok ? '' : ' disabled') + '> Permitir visitas de mis amigos</label><small>' + (SOCIAL.ok ? 'Tus amigos (cuentas añadidas en Chat/Teléfono) pueden visitar tu casa en solo lectura y dejarte regalos y notas en el buzón.' + (SOCIAL.kids ? ' Snake OS Kids: solo amigos aprobados por un adulto y notas preparadas.' : '') : 'Inicia sesión en Snake OS para recibir visitas.') + '</small>';
        h += '<h5>Partida</h5><p><button data-a="new"' + (S.visit ? ' disabled' : '') + '>🐣 Nueva familia</button></p>';
        h += '<h5>IA</h5><small>' + (ai.on ? 'Pensamientos y diarios generados con tu clave Askbox.' : 'Sin clave Askbox: se usan frases locales.') + '</small>';
      } else if (t === 'help') {
        title = '❔ Cómo jugar';
        h += '<small><p><b>Vivir:</b> selecciona una serpiente en los retratos (abajo). Haz clic en un objeto, otra serpiente, un vecino o el suelo para ver qué puede hacer. Las órdenes se encolan arriba a la izquierda (✕ para cancelar).</p>' +
          '<p><b>Necesidades:</b> hambre, energía, higiene, diversión, social, vejiga y <b>calor</b> (son de sangre fría: sol, terrario o piedra caliente). Si están bien, el plumbob se pone verde.</p>' +
          '<p><b>Serpientes:</b> cada pocos días mudan la piel (desbloquea patrones). En invierno pueden hibernar. Las parejas ponen huevos: mantenlos junto al terrario o incúbalos. Olfatea con la lengua para encontrar cosas escondidas. Caza los ratones sueltos.</p>' +
          '<p><b>Trabajo:</b> ordenador → Buscar trabajo. Ve de buen humor y sube la habilidad de tu carrera para ascender.</p>' +
          '<p><b>Comprar / Construir:</b> coloca, mueve, rota (R o clic derecho) y vende muebles; pinta suelos y paredes. El tiempo se detiene en estos modos.</p>' +
          '<p><b>Atajos:</b> espacio = pausa, 1/2/3 = velocidad, rueda = zoom, arrastrar = mover cámara, Esc = cancelar.</p></small>';
      }
      setText(drawer.querySelector('.dt'), title);
      var bd = drawer.querySelector('.bd'); if (bd._h !== h) { var st = bd.scrollTop; bd.innerHTML = emo(h); bd._h = h; bd.scrollTop = st; }
    }
    drawer.addEventListener('click', function (e) {
      var b = e.target.closest('[data-a]'); if (!b || !S) return; var s = sel(), a = b.dataset.a;
      if (a === 'rename' && s) { commitField(drawer.querySelector('.rn')); var fi = drawer.querySelector('.fam'); if (fi) commitField(fi); toast('Cambios guardados. 💾', 'good'); }
      if (a === 'col' && s) { s.color = b.dataset.c; buildPorts(); save(true); }
      if (a === 'tr' && s) { var tk = b.dataset.t, ti = s.traits.indexOf(tk); if (ti >= 0) s.traits.splice(ti, 1); else if (s.traits.length < 3) s.traits.push(tk); else toast('Máximo 3 rasgos: quita uno antes.', 'warn'); save(true); }
      if (a === 'pat' && s) { s.pattern = b.dataset.p; buildPorts(); }
      if (a === 'quit' && s) confirmBox('¿Seguro que ' + s.name + ' deja su trabajo?', function () { s.job = null; toast(s.name + ' ha dejado el trabajo.', ''); renderDrawer(); });
      if (a === 'jobs' && s) careerModal(s);
      if (a === 'diary' && s) { var en = { d: dayIdx() + 1, t: localDiary(s), ai: false }; s.diary.push(en); if (ai.on) aiAsk('diary', factsOf(s)).then(function (txt) { if (txt) { en.t = txt; en.ai = true; drawer.querySelector('.bd')._h = ''; renderDrawer(); } }); }
      if (a === 'save') { save(true); toast('Partida guardada. 💾', 'good'); }
      if (a === 'new') confirmBox('¿Empezar con una familia nueva? Se perderá la partida actual.', function () { toggleDrawer(null); createFamily(); });
      if (a === 'fw' || a === 'snd' || a === 'vis') return;
      drawer.querySelector('.bd')._h = ''; renderDrawer();
    });
    function commitField(inp) {
      if (!inp || !S) return; var s = sel(), v = String(inp.value || '').trim();
      if (inp.classList.contains('rn') && s) { v = v.slice(0, 16); if (v && v !== s.name) { s.name = v; buildPorts(); save(true); } else inp.value = s.name; }
      else if (inp.classList.contains('fam')) { v = v.slice(0, 18); if (v && v !== S.name && !S.visit) { S.name = v; updateTop(); save(true); } else inp.value = S.name; }
    }
    drawer.addEventListener('change', function (e) {
      var tg = e.target; if (tg.classList.contains('rn') || tg.classList.contains('fam')) { commitField(tg); return; }
      if (tg.classList.contains('asp')) { var s0 = sel(); if (s0 && ASP[tg.value]) { s0.asp = tg.value; s0.aspDone = false; save(true); drawer.querySelector('.bd')._h = ''; renderDrawer(); } return; }
    });
    drawer.addEventListener('change', function (e) { var a = e.target.dataset.a; if (a === 'fw') S.settings.freeWill = e.target.checked; if (a === 'snd') S.settings.sound = e.target.checked; if (a === 'vis') setAllowVisits(e.target.checked); });

    // ---- menú contextual
    function hidePie() { pie.style.display = 'none'; }
    function showPie(sx, sy, title, items) {
      var h = '<h4><span>' + title + '</span></h4>';
      items.forEach(function (it, i) { h += '<button data-i="' + i + '"' + (it.dis ? ' disabled' : '') + '><span class="ic">' + it.ic + '</span><span>' + esc(it.l) + (it.sub ? '<small>' + esc(it.sub) + '</small>' : '') + '</span></button>'; });
      pie.innerHTML = emo(h); pie.style.display = 'flex';
      var pw = 240, ph = pie.offsetHeight; pie.style.left = clamp(sx + 12, 6, W - pw - 6) + 'px'; pie.style.top = clamp(sy - 20, 6, Math.max(6, H - ph - 6)) + 'px';
      pie.onclick = function (e) { var b = e.target.closest('button'); if (!b || b.disabled) return; var it = items[+b.dataset.i]; hidePie(); if (it && it.fn) it.fn(); };
    }
    function act(id, extra) {
      var s = sel(); if (!s) return; var d = ACT[id] || SOC[id];
      var a = { id: id, label: d.l, user: true }; for (var k in extra) a[k] = extra[k];
      if (!enqueue(s, a)) toast('La cola de ' + s.name + ' está llena.', 'warn'); else sfx('click');
      updateQueue();
    }
    function whyNot(s, id, tgt) { if (!s) return 'Selecciona una serpiente'; return canDo(s, ACT[id], tgt); }
    function objMenu(o, sx, sy) {
      var s = sel(), c = CAT[o.t], items = [];
      (c.acts || []).forEach(function (id) {
        var d = ACT[id], w = whyNot(s, id, o);
        if (id === 'sleep' && o.t === 'cuna' && s && s.age !== 'bebe') w = 'La cesta es para crías';
        if (id === 'pcjob') { if (s && s.job) return; items.push({ ic: d.i, l: d.l, dis: w !== true, sub: w !== true ? w : 'Elige entre 5 carreras', fn: function () { careerModal(s, o); } }); return; }
        var lbl = id === 'pickup' ? (o.t === 'piel' ? 'Vender la piel (§60)' : 'Recoger hallazgo') : d.l;
        items.push({ ic: d.i, l: lbl, dis: w !== true, sub: w !== true ? w : '', fn: function () { act(id, { obj: o.id, label: lbl }); } });
      });
      if (o.t === 'huevo') items.unshift({ ic: '🌡️', l: 'Eclosión: ' + Math.floor(o.prog || 0) + '%', dis: true, sub: 'Más rápido junto al terrario o incubándolo' });
      if (!c.nobuy && !S.visit) items.push({ ic: '🛋️', l: 'Mover o vender…', sub: 'Abre el modo Comprar', fn: function () { setMode('buy'); selObj = o.id; updateTool(); } });
      showPie(sx, sy, (s ? esc(s.name) + ' → ' : '') + esc(c.n), items);
    }
    function entMenu(e, sx, sy) {
      var s = sel(), items = [];
      if (e.id === 'mouse') { var w = whyNot(s, 'hunt'); items.push({ ic: '🐭', l: 'Cazar el ratón', dis: w !== true, sub: w !== true ? w : 'Sigilo y constricción ayudan', fn: function () { act('hunt', { target: 'mouse' }); } }); showPie(sx, sy, 'Ratón suelto', items); return; }
      if (S.snakes.indexOf(e) >= 0 && e === s) {
        ['sniff', 'shed', 'bask', 'stealth', 'playalone'].forEach(function (id) { var w2 = whyNot(s, id); if (id === 'playalone' && w2 !== true) return; items.push({ ic: ACT[id].i, l: ACT[id].l, dis: w2 !== true, sub: w2 !== true ? w2 : '', fn: function () { act(id); } }); });
        items.push({ ic: '👤', l: 'Ver ficha', fn: function () { toggleDrawer('ficha'); } });
        showPie(sx, sy, esc(e.name) + ' (' + AGES[e.age].n.toLowerCase() + ')', items); return;
      }
      if (S.snakes.indexOf(e) >= 0) items.push({ ic: '👆', l: 'Seleccionar a ' + e.name, fn: function () { S.sel = e.id; buildPorts(); updateBottom(); if (drawerTab) renderDrawer(); } });
      if (s && !s.away) {
        Object.keys(SOC).forEach(function (id) {
          var d = SOC[id]; if (d.kid && e.age !== 'bebe') return; if (!d.kid && e.age === 'bebe') return; if (d.vis && !e.species) return; if (d.adult && (e.species || e.age !== 'adulto')) return;
          var w3 = socReq(s, e, id), r = relOf(s, e);
          items.push({ ic: d.i, l: d.l, dis: w3 !== true, sub: w3 !== true ? w3 : (d.kid ? '' : 'Amistad ' + Math.round(r.fr) + (r.ro ? ' · Romance ' + Math.round(r.ro) : '')), fn: function () { act(id, { soc: 1, target: e.id, label: d.l + ' con ' + e.name }); } });
        });
      } else if (s && s.away) items.push({ ic: '⏳', l: s.name + ' está fuera', dis: true });
      showPie(sx, sy, esc(e.name) + (e.species ? ' · ' + SPECIES[e.species].n : e.remote ? ' · invitada de ' + esc(e.owner) : e.hostSn ? ' · familia ' + esc(V ? V.family : '') : ' · ' + AGES[e.age].n), items);
    }
    function tileMenu(gx, gy, sx, sy) {
      var s = sel(), items = [], w = s ? (s.away ? 'Está fuera de casa' : true) : 'Selecciona una serpiente';
      items.push({ ic: '👣', l: 'Ir aquí', dis: w !== true, sub: w !== true ? w : '', fn: function () { act('go', { tile: [gx, gy] }); } });
      if (!inside(gx, gy)) ['bask', 'stealth'].forEach(function (id) { var w2 = whyNot(s, id); items.push({ ic: ACT[id].i, l: ACT[id].l + ' aquí', dis: w2 !== true, sub: w2 !== true ? w2 : '', fn: function () { act('go', { tile: [gx, gy] }); act(id); } }); });
      var w4 = whyNot(s, 'sniff'); items.push({ ic: '👅', l: 'Olfatear aquí', dis: w4 !== true, sub: w4 !== true ? w4 : 'Busca cosas escondidas cerca', fn: function () { act('go', { tile: [gx, gy] }); act('sniff'); } });
      showPie(sx, sy, inside(gx, gy) ? 'Suelo' : 'Jardín', items);
    }
    function hitEnt(sx, sy) {
      var best = null, bk = -1e9, list = S.snakes.filter(function (s) { return !s.away; }).concat(S.visitors).concat(extraSnakes()); if (S.mouse) list.push(S.mouse);
      list.forEach(function (e) {
        var s = e.age ? AGES[e.age].s : (e.id === 'mouse' ? 0.5 : 0.8), p = toScreen(e.x, e.y, e._onTile ? 8 : 0), z = cam.z;
        if (sx > p[0] - 20 * s * z && sx < p[0] + 22 * s * z && sy > p[1] - 50 * s * z && sy < p[1] + 8 * z) { var k = e.x + e.y; if (k > bk) { bk = k; best = e; } }
      });
      return best;
    }
    function hitObj(sx, sy, gx, gy) {
      var id = occ(gx, gy); if (id > 0) return objById(id);
      var arr = S.objects.slice().sort(function (a, b) { return (b.x + b.y) - (a.x + a.y); });
      for (var i = 0; i < arr.length; i++) {
        var o = arr[i], f = fp(o), ht = CAT[o.t].ht; if (ht < 30) continue;
        var a = toScreen(o.x, o.y + f.h, 0), b = toScreen(o.x + f.w, o.y, 0), t = toScreen(o.x, o.y, ht);
        if (sx > a[0] && sx < b[0] && sy > t[1] && sy < a[1]) return o;
      }
      return null;
    }

    // ---- comprar
    function fits(o, ignoreId) {
      var tiles = objTiles(o);
      for (var i = 0; i < tiles.length; i++) { var t = tiles[i]; if (!inLot(t[0], t[1])) return false; var oc = occ(t[0], t[1]); if (oc && oc !== ignoreId) return false; if (t[0] === EXIT[0] && t[1] === EXIT[1]) return false; }
      var f = fp(o); if (f.w > 1 && !canStep(o.x, o.y, o.x + 1, o.y)) return false; if (f.h > 1 && !canStep(o.x, o.y, o.x, o.y + 1)) return false;
      return true;
    }
    function startPlacing(t) { placing = t; moving = null; selObj = 0; ghost = { id: -1, t: t, x: 6, y: 6, r: 0 }; buildBottom(); }
    function updateTool() {
      var box = bottom.querySelector('.lsx-tool'); if (!box || mode !== 'buy') return;
      var o = selObj ? objById(selObj) : null;
      if (placing || moving) box.innerHTML = emo('<b>' + esc(CAT[(ghost || {}).t || placing].n) + '</b><small>Clic en el suelo para colocar · R o clic derecho: rotar · Esc: cancelar</small><div class="lsx-row"><button data-b="rot">⟳ Rotar</button><button data-b="cancel">Cancelar</button></div>');
      else if (o) box.innerHTML = emo('<b>' + esc(CAT[o.t].n) + '</b><div class="lsx-row"><button data-b="move">✋ Mover</button><button data-b="rot">⟳ Rotar</button></div><button data-b="sell" style="background:#ffe3df">💰 Vender por ' + money(Math.round(CAT[o.t].p * 0.75)) + '</button>');
      else box.innerHTML = '<b>Modo Comprar</b><small>Elige un mueble para colocarlo, o haz clic en uno del solar para moverlo, rotarlo o venderlo. El tiempo está en pausa.</small>';
      box.onclick = function (e) {
        var b = e.target.closest('[data-b]'); if (!b) return; var k = b.dataset.b;
        if (k === 'rot') rotate(); if (k === 'cancel') cancelPlace();
        if (k === 'move' && o) { moving = o; ghost = { id: -1, t: o.t, x: o.x, y: o.y, r: o.r }; S.objects = S.objects.filter(function (x) { return x !== o; }); rebuildCaches(); selObj = 0; updateTool(); }
        if (k === 'sell' && o) sellObj(o);
      };
    }
    function rotate() {
      if (ghost) { ghost.r = (ghost.r + 1) % 4; return; }
      var o = selObj && objById(selObj); if (!o) return; var old = o.r; o.r = (o.r + 1) % 4; if (!fits(o, o.id)) { o.r = old; var t2 = { id: o.id, t: o.t, x: o.x, y: o.y, r: (old + 2) % 4 }; if (fits(t2, o.id)) o.r = t2.r; else toast('No cabe girado ahí.', 'warn'); } rebuildCaches();
    }
    function cancelPlace() {
      if (moving) { S.objects.push(moving); rebuildCaches(); }
      placing = null; moving = null; ghost = null; buildBottom();
    }
    function sellObj(o) {
      S.objects = S.objects.filter(function (x) { return x !== o; }); S.money += Math.round(CAT[o.t].p * 0.75); rebuildCaches();
      S.snakes.forEach(function (sn) { if (sn.q.some(function (a) { return a.obj === o.id; })) { leaveObj(sn); sn.q = sn.q.filter(function (a) { return a.obj !== o.id; }); if (sn.q[0]) { sn.q[0].phase = 'walk'; sn.q[0]._path = null; } } });
      selObj = 0; sfx('coin'); updateTool();
    }
    function place() {
      if (!ghost || !fits(ghost, -1)) { toast('No cabe ahí.', 'warn'); return; }
      if (moving) { moving.x = ghost.x; moving.y = ghost.y; moving.r = ghost.r; S.objects.push(moving); var mid = moving.id; moving = null; ghost = null; rebuildCaches(); selObj = mid; nudge(); updateTool(); return; }
      var c = CAT[ghost.t]; if (S.money < c.p) { toast('No tienes suficientes escamoleones.', 'bad'); return; }
      S.money -= c.p; S.objects.push({ id: nid(), t: ghost.t, x: ghost.x, y: ghost.y, r: ghost.r }); rebuildCaches(); nudge(); sfx('coin');
    }
    function nudge() { S.snakes.concat(S.visitors).forEach(function (e) { if (e.away || e._onTile) return; var x = Math.floor(e.x), y = Math.floor(e.y); if (occ(x, y)) { var p = nearestFree(x, y); e.x = p[0] + 0.5; e.y = p[1] + 0.5; } if (e.q && e.q[0]) e.q[0]._path = null; }); }
    // ---- construir
    function roomTiles(gx, gy) {
      if (!inLot(gx, gy)) return [];
      var ins = inside(gx, gy), seen = {}, out = [], st = [[gx, gy]]; seen[gx + ',' + gy] = 1;
      while (st.length && out.length < 300) { var t = st.pop(); out.push(t); DIRS.forEach(function (d) { var nx = t[0] + d[0], ny = t[1] + d[1], k = nx + ',' + ny; if (seen[k] || !inLot(nx, ny) || inside(nx, ny) !== ins || !canStep(t[0], t[1], nx, ny)) return; seen[k] = 1; st.push([nx, ny]); }); }
      return out;
    }
    function paintAt(gx, gy) {
      if (!inLot(gx, gy)) return;
      if (tool === 'floor') {
        var tiles = roomFill ? roomTiles(gx, gy) : [[gx, gy]], cost = 0, val = FLOORS[swatch].c ? swatch : -1;
        tiles.forEach(function (t) { var i = t[1] * GW + t[0]; if (S.floor[i] !== val) { S.floor[i] = val; cost += 2; } }); S.money -= cost;
      } else {
        var cost2 = 0; roomTiles(gx, gy).forEach(function (t) { ['h,' + t[0] + ',' + t[1], 'v,' + t[0] + ',' + t[1]].forEach(function (k) { if (S._wallset[k] && S.wallc[k] !== swatch) { S.wallc[k] = swatch; cost2 += 6; } }); });
        S.money -= cost2; if (cost2) sfx('click');
      }
    }

    // ---- entrada
    var ptrs = {}, drag = null, pinch = null;
    function local(e) { var r = cv.getBoundingClientRect(); return [e.clientX - r.left, e.clientY - r.top]; }
    stage.addEventListener('pointerdown', function (e) {
      if (e.target !== cv) return; root.focus({ preventScroll: true }); var p = local(e); ptrs[e.pointerId] = p;
      try { cv.setPointerCapture(e.pointerId); } catch (er) {}
      var ids = Object.keys(ptrs);
      if (ids.length === 2) { var a = ptrs[ids[0]], b = ptrs[ids[1]]; pinch = { d: Math.hypot(a[0] - b[0], a[1] - b[1]), z: cam.z }; drag = null; return; }
      drag = { x: p[0], y: p[1], cx: cam.x, cy: cam.y, moved: false, btn: e.button, paint: mode === 'build' && tool === 'floor' && !roomFill && e.button === 0 };
      if (drag.paint) { var g = toGrid(p[0], p[1]); paintAt(Math.floor(g[0]), Math.floor(g[1])); }
    });
    stage.addEventListener('pointermove', function (e) {
      if (!S) return; var p = local(e);
      if (ptrs[e.pointerId]) ptrs[e.pointerId] = p;
      var ids = Object.keys(ptrs);
      if (pinch && ids.length === 2) { var a = ptrs[ids[0]], b = ptrs[ids[1]], d = Math.hypot(a[0] - b[0], a[1] - b[1]); zoomAt((a[0] + b[0]) / 2, (a[1] + b[1]) / 2, clamp(pinch.z * d / pinch.d, 0.45, 2.6) / cam.z); return; }
      var g = toGrid(p[0], p[1]), gx = Math.floor(g[0]), gy = Math.floor(g[1]);
      if (drag) {
        if (Math.abs(p[0] - drag.x) + Math.abs(p[1] - drag.y) > 6) drag.moved = true;
        if (drag.paint) paintAt(gx, gy);
        else if (drag.moved) { cam.x = drag.cx + p[0] - drag.x; cam.y = drag.cy + p[1] - drag.y; cam.fit = false; }
      }
      hoverTiles = null; hoverEnt = 0;
      if (mode === 'buy' && ghost) { var f = fp(ghost); ghost.x = clamp(gx - Math.floor((f.w - 1) / 2), 0, GW - f.w); ghost.y = clamp(gy - Math.floor((f.h - 1) / 2), 0, GH - f.h); ghostOk = fits(ghost, -1) && (moving || S.money >= CAT[ghost.t].p); }
      else if (mode === 'build') { hoverTiles = (tool === 'wall' || roomFill) ? roomTiles(gx, gy) : (inLot(gx, gy) ? [[gx, gy]] : null); }
      else if (mode === 'live' && e.pointerType === 'mouse') { var en = hitEnt(p[0], p[1]); if (en) hoverEnt = en.id; else if (inLot(gx, gy) && !occ(gx, gy)) hoverTiles = [[gx, gy, 'rgba(255,255,255,.22)']]; }
    });
    function endPtr(e) {
      var p = local(e), wasPinch = !!pinch; delete ptrs[e.pointerId]; if (Object.keys(ptrs).length < 2) pinch = null;
      if (!drag || wasPinch) { drag = null; return; }
      var d = drag; drag = null; if (d.moved || d.paint) return;
      if (e.type === 'pointercancel') return;
      if (d.btn === 2) { if (mode === 'buy') rotate(); return; }
      onClick(p[0], p[1]);
    }
    stage.addEventListener('pointerup', endPtr); stage.addEventListener('pointercancel', endPtr);
    stage.addEventListener('contextmenu', function (e) { e.preventDefault(); });
    stage.addEventListener('wheel', function (e) { e.preventDefault(); var p = local(e); zoomAt(p[0], p[1], e.deltaY < 0 ? 1.12 : 1 / 1.12); }, { passive: false });
    function zoomAt(sx, sy, f) { var z2 = clamp(cam.z * f, 0.45, 2.6); f = z2 / cam.z; cam.x = sx - (sx - cam.x) * f; cam.y = sy - (sy - cam.y) * f; cam.z = z2; cam.fit = false; }
    function onClick(sx, sy) {
      if (!S) return;
      if (pie.style.display === 'flex') { hidePie(); return; }
      var g = toGrid(sx, sy), gx = Math.floor(g[0]), gy = Math.floor(g[1]);
      if (mode === 'buy') { if (ghost) { place(); return; } var o = hitObj(sx, sy, gx, gy); selObj = o && !CAT[o.t].nobuy ? o.id : 0; updateTool(); return; }
      if (mode === 'build') { if (tool === 'wall' || roomFill) paintAt(gx, gy); return; }
      var en = hitEnt(sx, sy); if (en) { entMenu(en, sx, sy); return; }
      if (hitMailbox(sx, sy)) { mailClick(); return; }
      var ob = hitObj(sx, sy, gx, gy); if (ob) { objMenu(ob, sx, sy); return; }
      if (inLot(gx, gy)) tileMenu(gx, gy, sx, sy); else hidePie();
    }
    function stopKey(e) { e.stopPropagation(); }
    root.addEventListener('keyup', stopKey); root.addEventListener('keypress', stopKey);
    root.addEventListener('keydown', function (e) {
      e.stopPropagation();
      var tg = e.target || {}, field = /^(INPUT|SELECT|TEXTAREA)$/.test(tg.tagName || '') || tg.isContentEditable;
      if (modalOn) {
        if (e.key === 'Escape' && modalEsc) { e.preventDefault(); modalEsc(); }
        else if (e.key === 'Enter' && modalEnter && tg.tagName !== 'TEXTAREA') { e.preventDefault(); modalEnter(); }
        return;
      }
      if (field) {
        if (e.key === 'Enter' && tg.tagName === 'INPUT' && drawer.contains(tg)) { e.preventDefault(); commitField(tg); tg.blur(); }
        else if (e.key === 'Escape') tg.blur();
        return;
      }
      if (!S) return;
      var k = e.key;
      if (k === ' ') { e.preventDefault(); setSpeed(S.speed ? 0 : (prevSpeed || 1)); if (S.speed) prevSpeed = S.speed; }
      else if (k === '1' || k === '2' || k === '3') setSpeed(+k);
      else if (k === 'r' || k === 'R') rotate();
      else if (k === 'Escape') { hidePie(); if (ghost) cancelPlace(); else if (drawerTab) toggleDrawer(null); }
      else if ((k === 'Delete' || k === 'Backspace') && mode === 'buy' && selObj) { var o = objById(selObj); if (o) sellObj(o); }
      else if (k.indexOf('Arrow') === 0) { e.preventDefault(); var st = 40; if (k === 'ArrowLeft') cam.x += st; if (k === 'ArrowRight') cam.x -= st; if (k === 'ArrowUp') cam.y += st; if (k === 'ArrowDown') cam.y -= st; cam.fit = false; }
    });

    // ---- modales
    var modalEsc = null, modalEnter = null;
    function openModal(html, opt) { opt = opt || {}; card.innerHTML = emo(html); card.onclick = null; card.onchange = null; card.oninput = null; modal.style.display = 'flex'; modalOn = true; modalEsc = opt.esc || null; modalEnter = opt.enter || null; }
    function closeModal() { modal.style.display = 'none'; card.innerHTML = ''; modalOn = false; modalEsc = modalEnter = null; try { root.focus({ preventScroll: true }); } catch (e) {} }
    function confirmBox(msg, ok) {
      openModal('<h2>¿Seguro?</h2><p>' + esc(msg) + '</p><div class="lsx-row" style="justify-content:flex-end"><button data-c="no">Cancelar</button><button class="lsx-btnp" data-c="yes">Sí</button></div>', { esc: function () { closeModal(); } });
      card.onclick = function (e) { var b = e.target.closest('[data-c]'); if (!b) return; closeModal(); if (b.dataset.c === 'yes') ok(); };
    }
    function careerModal(s, pc) {
      if (!s) return; if (s.age !== 'adulto' && s.age !== 'anciano') { toast('Solo los adultos pueden trabajar.', 'warn'); return; }
      var comp = pc || S.objects.filter(function (o) { return o.t === 'ordenador'; })[0];
      if (!comp) { toast('Necesitas un ordenador para buscar trabajo (modo Comprar → Ocio).', 'warn'); return; }
      var h = '<h2>💼 Ofertas de trabajo para ' + esc(s.name) + '</h2><div style="display:grid;gap:8px">';
      Object.keys(CAREERS).forEach(function (k) { var C = CAREERS[k]; h += '<button data-k="' + k + '" style="text-align:left;background:#f0f6fc;padding:9px 12px"><b>' + C.i + ' ' + C.n + '</b> — ' + C.lv[0][0] + '<br><small>' + hhmm(C.h[0] * 60) + '–' + hhmm(C.h[1] * 60) + ' (L-V) · ' + money(C.lv[0][1]) + '/h · habilidad clave: ' + SKILLS[C.skill] + '</small></button>'; });
      h += '</div><div class="lsx-row" style="justify-content:flex-end;margin-top:10px"><button data-k="">Cerrar</button></div>';
      openModal(h, { esc: function () { closeModal(); } });
      card.onclick = function (e) { var b = e.target.closest('[data-k]'); if (!b) return; var k = b.dataset.k; closeModal(); if (k) act('pcjob', { obj: comp.id, arg: k, label: 'Buscar trabajo: ' + CAREERS[k].n }); };
    }
    function askName(sn) {
      if (modalOn) { setTimeout(function () { askName(sn); }, 1500); return; }
      openModal('<h2>🐣 ¡Ha nacido una cría!</h2><p>¿Cómo se va a llamar?</p><div class="lsx-row"><input class="nn" value="' + esc(sn.name) + '" maxlength="16" style="flex:1"><button class="lsx-btng" data-c="ok">¡Bienvenida!</button></div>', { enter: done, esc: done });
      function done() { var inp = card.querySelector('.nn'); var v = inp ? inp.value.trim() : ''; if (v) sn.name = v.slice(0, 16); closeModal(); buildPorts(); save(true); }
      card.onclick = function (e) { var b = e.target.closest('[data-c]'); if (b) done(); };
      setTimeout(function () { var inp = card.querySelector('.nn'); if (inp) { inp.focus(); inp.select(); } }, 50);
    }
    function createFamily() {
      var mem = [
        { name: 'Sisebuto', color: '#3498db', age: 'adulto', traits: ['gloton', 'bromista'], asp: 'fortuna' },
        { name: 'Escamila', color: '#ff6fae', age: 'adulto', traits: ['romantico', 'cocinillas'], asp: 'familia' },
        { name: 'Silvia', color: '#f1c40f', age: 'joven', traits: ['curioso', 'jugueton'], asp: 'saber' },
        { name: 'Kaa', color: '#1abc9c', age: 'bebe', traits: ['dormilon'], asp: 'popular' }
      ], fam = { name: 'Escamosa', couple: true };
      function render() {
        var h = '<h2>🐍 Crea tu familia de serpientes</h2><div class="lsx-row"><label>Apellido:</label><input class="fn" value="' + esc(fam.name) + '" maxlength="18"><label class="lsx-row" style="margin-left:auto"><input type="checkbox" class="cp"' + (fam.couple ? ' checked' : '') + '> Los dos primeros adultos son pareja</label></div>';
        mem.forEach(function (m, i) {
          h += '<div class="lsx-mem" data-i="' + i + '"><canvas width="70" height="70"></canvas><div>' +
            '<div class="lsx-row"><input data-f="name" value="' + esc(m.name) + '" maxlength="16" style="width:130px"><select data-f="age">' + Object.keys(AGES).map(function (a) { return '<option value="' + a + '"' + (m.age === a ? ' selected' : '') + '>' + AGES[a].n + '</option>'; }).join('') + '</select>' +
            '<select data-f="asp" title="Aspiración">' + Object.keys(ASP).map(function (a) { return '<option value="' + a + '"' + (m.asp === a ? ' selected' : '') + '>' + ASP[a].i + ' ' + ASP[a].n + '</option>'; }).join('') + '</select>' +
            (mem.length > 1 ? '<button data-x="' + i + '" title="Quitar" style="margin-left:auto">🗑️</button>' : '') + '</div>' +
            '<div class="lsx-row" style="flex-wrap:wrap;gap:5px">' + PALETTE.map(function (p) { return '<button class="lsx-swatch' + (m.color === p.c ? ' on' : '') + '" data-col="' + p.c + '" title="' + p.n + '" style="background:' + p.c + '"></button>'; }).join('') + '</div>' +
            '<div>' + Object.keys(TRAITS).map(function (t) { return '<button class="lsx-chip' + (m.traits.indexOf(t) >= 0 ? ' on' : '') + '" data-tr="' + t + '">' + TRAITS[t].i + ' ' + TRAITS[t].n + '</button>'; }).join('') + '</div><small style="color:#8592a0">Hasta 3 rasgos</small></div></div>';
        });
        h += '<div class="lsx-row" style="justify-content:space-between;margin-top:8px"><div class="lsx-row">' + (mem.length < 6 ? '<button data-c="add">➕ Añadir serpiente</button>' : '') + '<button data-c="rnd">🎲 Aleatoria</button></div><button class="lsx-btng" data-c="go" style="padding:9px 18px;font-size:15px">¡A vivir! ▶</button></div>';
        openModal(h, { esc: S ? function () { closeModal(); } : null });
        bindFam();
        card.querySelectorAll('.lsx-mem').forEach(function (d) { var m = mem[+d.dataset.i]; drawPortrait(d.querySelector('canvas'), { id: +d.dataset.i, age: m.age, color: m.color, pattern: 'lisa' }, 70); });
      }
      function sync() { var fn = card.querySelector('.fn'); if (fn) fam.name = fn.value.trim() || 'Escamosa'; var cp = card.querySelector('.cp'); if (cp) fam.couple = cp.checked; card.querySelectorAll('.lsx-mem').forEach(function (d) { var m = mem[+d.dataset.i]; d.querySelectorAll('[data-f]').forEach(function (inp) { m[inp.dataset.f] = inp.value; }); }); }
      function bindFam() {
      card.onclick = function (e) {
        var b = e.target.closest('button'); if (!b) return; sync(); var d = b.closest('.lsx-mem'), m = d ? mem[+d.dataset.i] : null;
        if (b.dataset.col && m) m.color = b.dataset.col;
        else if (b.dataset.tr && m) { var t = b.dataset.tr, i = m.traits.indexOf(t); if (i >= 0) m.traits.splice(i, 1); else if (m.traits.length < 3) m.traits.push(t); }
        else if (b.dataset.x != null) mem.splice(+b.dataset.x, 1);
        else if (b.dataset.c === 'add') mem.push({ name: pick(NAMES), color: pick(PALETTE).c, age: 'adulto', traits: [], asp: pick(Object.keys(ASP)) });
        else if (b.dataset.c === 'rnd') mem.forEach(function (x) { x.name = pick(NAMES); x.color = pick(PALETTE).c; var ts = Object.keys(TRAITS).sort(function () { return Math.random() - 0.5; }); x.traits = ts.slice(0, ri(1, 3)); x.asp = pick(Object.keys(ASP)); });
        else if (b.dataset.c === 'go') { closeModal(); newGame({ name: fam.name, snakes: mem, couple: fam.couple }); startGame(true); return; }
        render();
      };
      card.onchange = function (e) { sync(); if (e.target.dataset.f === 'age') render(); };
      card.oninput = function () { sync(); };
      }
      render();
    }
    function startGame(fresh) {
      S.speed = S.speed == null ? 1 : S.speed; cam.fit = true; resize(); buildBottom(); updateTop();
      if (fresh) { toast('¡Bienvenidos a casa, familia ' + S.name + '! Haz clic en objetos y serpientes para darles órdenes.', 'good'); setTimeout(function () { if (!dead && S) toast('Consejo: las serpientes son de sangre fría. Vigila la barra de ☀️ Calor.', ''); }, 4500); save(true); }
      aiCheck(); socialStart();
    }

    // ---- bucle
    var last = performance.now(), lastUi = 0, lastSave = performance.now(), lastDrawer = 0, raf = 0;
    function frame(t) {
      if (dead) return;
      var dt = Math.min(0.1, (t - last) / 1000); last = t;
      if (S) {
        if (mode === 'live' && !modalOn) advance(dt * SPEEDS[S.speed || 0]);
        try { renderScene(ctx, W, H, dpr, { hoverTiles: hoverTiles, hoverEnt: hoverEnt, ghost: ghost, ghostOk: ghostOk, selObj: selObj, moving: moving }); } catch (er) { if (!frame._err) { frame._err = 1; console.error('[Los Snakes] render', er); } }
        if (t - lastUi > 250) { lastUi = t; updateTop(); updateBottom(); updateQueue(); }
        if (drawerTab && t - lastDrawer > 1000) { lastDrawer = t; renderDrawer(true); }
        if (t - lastSave > 60000) { lastSave = t; save(false); }
        netTick(t, dt);
      }
      raf = requestAnimationFrame(frame);
    }
    resize();
    openModal('<h2>Los Snakes</h2><p>Cargando tu barrio…</p>');
    var loc = loadLocal();
    var booted = false;
    function boot(srv) {
      if (dead || booted) return; booted = true; closeModal();
      var best = loc; if (srv && (!loc || (srv.savedAt || 0) > (loc.savedAt || 0))) best = srv;
      var ok = false; try { ok = !!(best && applySave(best)); } catch (e) { console.error('[Los Snakes] partida dañada', e); ok = false; }
      if (!ok && loc && best !== loc) { try { ok = applySave(loc); } catch (e2) { ok = false; } }
      if (ok) startGame(false); else { S = null; createFamily(); }
    }
    loadServer().then(boot, function () { boot(null); });
    setTimeout(function () { boot(null); }, 6000);
    raf = requestAnimationFrame(frame);
    function onHide() { if (document.hidden) save(true); }
    document.addEventListener('visibilitychange', onHide);
    ui.destroy = function () {
      if (dead) return; dead = true; cancelAnimationFrame(raf); try { if (V) endVisit(true); } catch (e) {} try { save(true); } catch (e) {} netClose(); REMOTE = {};
      if (ro) ro.disconnect(); else global.removeEventListener('resize', resize);
      document.removeEventListener('visibilitychange', onHide);
      if (UI === ui) UI = null;
    };
    ui.setSpeed = setSpeed; ui.setMode = setMode; ui.openDrawer = toggleDrawer; ui.click = onClick; ui.root = root; ui.createFamily = createFamily; ui.startGame = startGame; ui.closeModal = closeModal;
    ui.objMenu = objMenu; ui.entMenu = entMenu; ui.startPlacing = startPlacing; ui.place = place; ui.paintAt = paintAt; ui.setTool = function (t, sw, rf) { tool = t; swatch = sw || 0; roomFill = !!rf; buildBottom(); };
    ui.ghost = function () { return ghost; }; ui.toScreen = toScreen;
    ui.openModal = openModal; ui.card = card; ui.root = root; ui.isModal = function () { return modalOn; };
    ui.relayout = function () { if (mode !== 'live') setMode('live'); hidePie(); if (drawerTab) toggleDrawer(null); renderVBar(); cam.fit = true; resize(); buildBottom(); updateTop(); };
    ui.setMailBadge = function (n) { var b = root.querySelector('.lsx-mail .bdg'); if (b) { b.textContent = n > 9 ? '9+' : String(n || ''); b.style.display = n ? 'flex' : 'none'; } };
    function renderVBar() {
      var vb = $('.lsx-vbar'); root.classList.toggle('visiting', !!(S && S.visit));
      root.querySelectorAll('.lsx-modes button').forEach(function (b) { b.classList.toggle('dis', !!(S && S.visit) && b.dataset.mode !== 'live'); });
      $('.lsx-mail').title = S && S.visit ? 'Dejar un regalo o una nota' : 'Buzón'; setHTML($('.lsx-mail .mic'), S && S.visit ? '🎁' : '📬');
      if (!S || !S.visit || !V) { vb.style.display = 'none'; setHTML(vb, ''); resize(); return; }
      setHTML(vb, '<span class="vt">🏡 De visita en casa de <b>' + esc(V.hostName) + '</b> <small>familia ' + esc(V.family) + '</small></span><span class="lv ' + (V.live ? 'on' : '') + '">' + (V.live ? '🟢 En vivo' : '⚪ Sin conexión') + '</span><span class="sp"></span><button data-v="gift">🎁<em> Regalo o nota</em></button><button data-v="home" class="lsx-btnp">🏠<em> Volver a casa</em></button>');
      vb.style.display = 'flex'; resize();
    }
    $('.lsx-vbar').addEventListener('click', function (e) { var b = e.target.closest('[data-v]'); if (!b) return; if (b.dataset.v === 'home') endVisit(false); else mailClick(); });
    ui.renderVBar = renderVBar;
    return ui;
  }

  // ---------- Visitas entre amigos (cuentas añadidas de Snake OS) ----------
  var SOCIAL = { ok: false, allow: 'friends', mail: [], kids: false, notes: [], gifts: {}, hist: [] };
  var GIFTS = {
    flores: { n: 'Ramo de flores', i: '💐', p: 30, d: 'Alegra a toda la familia' },
    raton: { n: 'Ratón gourmet', i: '🐁', p: 40, d: 'Quita el hambre a la familia' },
    planta: { n: 'Planta en maceta', i: '🪴', p: 80, obj: 'planta' },
    lampara: { n: 'Lámpara de pie', i: '💡', p: 120, obj: 'lampara' },
    arbol: { n: 'Árbol frutal', i: '🌳', p: 180, obj: 'arbol' },
    sobre: { n: 'Sobre con §200', i: '✉️', p: 200, money: 200 },
    piedra: { n: 'Piedra caliente', i: '🪨', p: 300, obj: 'piedra' },
    radio: { n: 'Equipo de música', i: '🎵', p: 300, obj: 'radio' }
  };
  var HOST_BASE = 1e12, GUEST_BASE = 2e12;
  function hostEntId(uid, sid) { return HOST_BASE + uid * 1e6 + (+sid || 0); }
  function remoteEntId(uid, sid) { return GUEST_BASE + uid * 1e6 + (+sid || 0); }
  function remoteList() { var out = []; if (S && !S.visit) for (var k in REMOTE) out.push(REMOTE[k]); return out; }
  function extraSnakes() { if (!S) return []; return S.visit ? (S.hosts || []).filter(function (h) { return !h.away; }) : remoteList(); }
  function api(url, opt) {
    opt = opt || {}; opt.credentials = 'same-origin';
    if (opt.body && typeof opt.body !== 'string') { opt.headers = { 'Content-Type': 'application/json' }; opt.body = JSON.stringify(opt.body); }
    return fetch(url, opt).then(function (r) { return r.json().catch(function () { return {}; }).then(function (j) { if (!r.ok) throw new Error((j && j.detail) || ('Error ' + r.status)); return j; }); });
  }
  function ago(ts) { var s = Math.max(0, Date.now() / 1000 - ts); return s < 90 ? 'hace un momento' : s < 3600 ? 'hace ' + Math.round(s / 60) + ' min' : s < 86400 ? 'hace ' + Math.round(s / 3600) + ' h' : 'hace ' + Math.round(s / 86400) + ' d'; }
  function uiModal(html, opt) { if (UI && UI.openModal) UI.openModal(html, opt); return UI ? UI.card : null; }
  function uiClose() { if (UI && UI.closeModal) UI.closeModal(); }

  // ---- ajustes y buzón
  function socialStart() {
    if (userKey() === 'anon') return;
    NET.closed = false; netConnect();
    refreshSocial(true);
  }
  function refreshSocial(first) {
    api('/api/los-snakes/social').then(function (j) {
      SOCIAL.ok = true; SOCIAL.allow = j.allow || 'friends'; SOCIAL.mail = j.mail || []; SOCIAL.kids = !!j.kids; SOCIAL.notes = j.notes || []; SOCIAL.gifts = j.gifts || {};
      if (UI && UI.setMailBadge) UI.setMailBadge(SOCIAL.mail.length);
      if (first && SOCIAL.mail.length && S && !S.visit) toast('📬 Tienes ' + SOCIAL.mail.length + (SOCIAL.mail.length === 1 ? ' cosa' : ' cosas') + ' en el buzón. Haz clic en el buzón de la entrada.', 'good');
    }).catch(function () {});
  }
  function setAllowVisits(on) {
    var v = on ? 'friends' : 'off';
    api('/api/los-snakes/social', { method: 'PUT', body: { allow: v } }).then(function () { SOCIAL.allow = v; toast(on ? 'Tus amigos ya pueden visitarte. 🏡' : 'Visitas desactivadas.', ''); }).catch(function (e) { toast(e.message, 'bad'); });
  }
  function mailClick() {
    if (!S) return;
    if (S.visit) { giftModal(); return; }
    if (userKey() === 'anon') { toast('Inicia sesión en Snake OS para usar el buzón.', 'warn'); return; }
    var items = SOCIAL.mail.slice();
    function show() {
      var hist = S.mail || [];
      var h = '<h2>📬 Buzón de la familia ' + esc(S.name) + '</h2>';
      if (!hist.length) h += '<p><i>El buzón está vacío. Cuando tus amigos te visiten o te dejen regalos y notas, aparecerán aquí.</i></p>';
      hist.slice().reverse().forEach(function (m) {
        var ic = m.kind === 'gift' ? (GIFTS[m.item] || {}).i || '🎁' : m.kind === 'note' ? '💌' : '🐍';
        var tx = m.kind === 'visit' ? '<b>' + esc(m.fromName) + '</b> vino de visita con ' + esc(m.snake || 'su serpiente') + '.'
          : m.kind === 'gift' ? '<b>' + esc(m.fromName) + '</b> te dejó un regalo: <b>' + esc((GIFTS[m.item] || {}).n || m.item) + '</b>' + (m.res ? ' <small>(' + esc(m.res) + ')</small>' : '')
          : '<b>' + esc(m.fromName) + '</b>' + (m.snake ? ' (' + esc(m.snake) + ')' : '') + ' escribió: «' + esc(m.text) + '»';
        h += '<div class="lsx-mailit"><span class="mi">' + ic + '</span><div style="flex:1">' + tx + '<br><small style="color:#8592a0">' + ago(m.at) + '</small></div></div>';
      });
      h += '<div class="lsx-row" style="justify-content:space-between;margin-top:10px"><button data-m="visit">🏘️ Visitar a un amigo</button><button class="lsx-btnp" data-m="close">Cerrar</button></div>';
      var card = uiModal(h, { esc: uiClose, enter: uiClose });
      card.onclick = function (e) { var b = e.target.closest('[data-m]'); if (!b) return; uiClose(); if (b.dataset.m === 'visit') visitClick(); };
    }
    if (!items.length) { show(); return; }
    api('/api/los-snakes/mail/claim', { method: 'POST', body: { ids: items.map(function (m) { return m.id; }) } }).then(function (j) {
      (j.items || []).forEach(applyMail);
      SOCIAL.mail = SOCIAL.mail.filter(function (m) { return !(j.items || []).some(function (x) { return x.id === m.id; }); });
      if (UI && UI.setMailBadge) UI.setMailBadge(SOCIAL.mail.length);
      save(true); show();
    }).catch(function (e) { toast(e.message, 'bad'); show(); });
  }
  function applyMail(m) {
    S.mail = S.mail || [];
    var g = GIFTS[m.item];
    if (m.kind === 'gift' && g) {
      if (g.obj) {
        var spot = null, cands = [[8, 11], [5, 11], [9, 11], [4, 11], [10, 11], [3, 12], [11, 12], [12, 10], [13, 11]];
        for (var i = 0; i < cands.length && !spot; i++) { var c = cands[i]; if (!occ(c[0], c[1]) && !(c[0] === EXIT[0] && c[1] === EXIT[1])) spot = c; }
        if (!spot) { var p = nearestFree(8, 11); if (!occ(p[0], p[1])) spot = p; }
        if (spot) { S.objects.push({ id: nid(), t: g.obj, x: spot[0], y: spot[1], r: 0 }); rebuildCaches(); m.res = 'colocado en el jardín'; }
        else { S.money += g.p; m.res = 'no cabía: +' + money(g.p); }
      } else if (g.money) { S.money += g.money; m.res = '+' + money(g.money); }
      else if (m.item === 'flores') { S.snakes.forEach(function (sn) { addMood(sn, 'flores', 'Flores de ' + m.fromName, 10, 24); }); m.res = '+ánimo para todos'; }
      else if (m.item === 'raton') { S.snakes.forEach(function (sn) { sn.needs.hunger = clamp(sn.needs.hunger + 30, 0, 100); }); m.res = 'merienda para todos'; }
      S.snakes.forEach(function (sn) { logEv(sn, 'recibió un regalo de ' + m.fromName); });
    } else if (m.kind === 'note') { S.snakes.forEach(function (sn) { logEv(sn, 'leyó una nota de ' + m.fromName); }); }
    S.mail.push(m); if (S.mail.length > 40) S.mail.splice(0, S.mail.length - 40);
  }

  // ---- lista de amigos
  function miniHouse(cv, w) {
    var W2 = 300, H2 = 192; cv.width = W2; cv.height = H2; var c = cv.getContext('2d'), z = 0.36;
    c.setTransform(z, 0, 0, z, W2 / 2 - (P(GW / 2, GH / 2)[0]) * z, H2 / 2 - (P(GW / 2, GH / 2)[1]) * z + 6);
    var fl = w.floor || [];
    for (var y = 0; y < GH; y++) for (var x = 0; x < GW; x++) {
      var f = fl[y * GW + x], F = FLOORS[f], col = F && F.c ? ((x + y) % 2 && F.c2 ? F.c2 : F.c) : ((x + y) % 2 ? '#7fcf5c' : '#72c252');
      poly(c, [P(x, y), P(x + 1, y), P(x + 1, y + 1), P(x, y + 1)], col);
    }
    (w.walls || []).forEach(function (k) {
      var p = String(k).split(','), d = p[0], x0 = +p[1], y0 = +p[2], a = [x0, y0], b = d === 'h' ? [x0 + 1, y0] : [x0, y0 + 1];
      var back = (d === 'h' && y0 === 1) || (d === 'v' && x0 === 1), H3 = back ? 40 : 10, wc = WALLS[(w.wallc || {})[k] || 0] || WALLS[0];
      poly(c, [P(a[0], a[1], 0), P(b[0], b[1], 0), P(b[0], b[1], H3), P(a[0], a[1], H3)], shade(wc.c, d === 'h' ? 0 : -0.12), 'rgba(0,0,0,.15)');
    });
    (w.objects || []).slice().sort(function (a, b) { return (a.x + a.y) - (b.x + b.y); }).forEach(function (o) {
      if (!CAT[o.t]) return; var f = fp(o), ht = Math.min(40, CAT[o.t].ht || 20);
      var col = { cama: '#6d8fd8', sofa: '#c95f4a', arbol: '#3f9a3a', planta: '#4caf50', tv: '#333', nevera: '#e8eef3', terrario: '#8fd4c8', ducha: '#bfe6ff' }[o.t] || '#b88d63';
      cbox(c, o.x + 0.1, o.y + 0.1, o.x + f.w - 0.1, o.y + f.h - 0.1, 0, ht, col);
    });
  }
  function visitClick() {
    if (!S) return;
    if (S.visit) { toast('Ya estás de visita. Vuelve a casa para visitar a otro amigo.', 'warn'); return; }
    if (userKey() === 'anon') { toast('Inicia sesión en Snake OS para visitar a tus amigos.', 'warn'); return; }
    var mine = S.snakes.filter(function (s) { return !s.away && s.age !== 'bebe'; });
    var card = uiModal('<h2>🏘️ Visitar a un amigo</h2><p>Buscando a tus amigos…</p>', { esc: uiClose });
    api('/api/los-snakes/friends').then(function (j) {
      if (!UI || !UI.isModal()) return;
      var fr = j.friends || [];
      var h = '<h2>🏘️ Visitar a un amigo</h2>';
      if (!mine.length) h += '<p class="why">Ahora mismo no hay ninguna serpiente disponible (las crías no salen solas y las que están fuera no pueden ir).</p>';
      else h += '<div class="lsx-row"><label>Va de visita:</label><select class="vs">' + mine.map(function (s) { return '<option value="' + s.id + '"' + (s.id === S.sel ? ' selected' : '') + '>' + esc(s.name) + ' (' + AGES[s.age].n.toLowerCase() + ')</option>'; }).join('') + '</select></div>';
      if (j.kids) h += '<p><small>🧸 Snake OS Kids: solo puedes visitar a los amigos aprobados por un adulto.</small></p>';
      if (!fr.length) h += '<p><i>Todavía no tienes amigos añadidos. Añádelos en Doganiero Chat o Teléfono (cuentas añadidas) y, cuando jueguen a Los Snakes, podrás visitarlos.</i></p>';
      fr.forEach(function (f, i) {
        var fam = f.family;
        h += '<div class="lsx-fr" data-i="' + i + '">' + (fam ? '<canvas class="hs"></canvas>' : '<div style="width:150px;height:96px;border-radius:10px;background:#e5ecf3;display:flex;align-items:center;justify-content:center;font-size:30px">🏚️</div>') +
          '<div><div class="lsx-row" style="margin:0"><b style="font-size:15px">' + esc(f.avatar) + ' ' + esc(f.name) + '</b><small><span class="dot' + (f.online ? ' on' : '') + '"></span>' + (f.online ? 'jugando ahora (visita en vivo)' : 'no está jugando') + '</small></div>' +
          (fam ? '<div>Familia <b>' + esc(fam.name) + '</b> · día ' + fam.day + ' · ' + fam.objects + ' muebles</div><div class="fm">' + fam.members.map(function () { return '<canvas></canvas>'; }).join('') + '</div><small>' + fam.members.map(function (m) { return esc(m.name); }).join(', ') + '</small>' : '') +
          (f.can ? '<div style="margin-top:6px"><button class="lsx-btnp" data-v="' + i + '"' + (mine.length ? '' : ' disabled') + '>🚪 Visitar</button></div>' : '<div class="why">' + esc(f.reason) + '</div>') + '</div></div>';
      });
      h += '<div class="lsx-row" style="justify-content:flex-end;margin-top:8px"><button data-v="x">Cerrar</button></div>';
      card = uiModal(h, { esc: uiClose });
      fr.forEach(function (f, i) {
        if (!f.family) return; var box = card.querySelector('.lsx-fr[data-i="' + i + '"]'); if (!box) return;
        var hs = box.querySelector('canvas.hs'); if (hs) try { miniHouse(hs, f.family.world); } catch (e) {}
        box.querySelectorAll('.fm canvas').forEach(function (cv, k) { var m = f.family.members[k]; drawPortrait(cv, { id: k + 1, age: m.age, color: m.color, pattern: m.pattern }, 34); });
      });
      card.onclick = function (e) {
        var b = e.target.closest('[data-v]'); if (!b || b.disabled) return;
        if (b.dataset.v === 'x') { uiClose(); return; }
        var f = fr[+b.dataset.v], vs = card.querySelector('.vs'); var sid = vs ? +vs.value : 0;
        b.disabled = true; b.textContent = 'Llamando a la puerta…';
        startVisit(f, sid);
      };
    }).catch(function (e) { uiModal('<h2>🏘️ Visitar a un amigo</h2><p>No se ha podido cargar la lista: ' + esc(e.message) + '</p><div class="lsx-row" style="justify-content:flex-end"><button class="lsx-btnp" data-v="x">Cerrar</button></div>', { esc: uiClose }).onclick = function (ev) { if (ev.target.closest('[data-v]')) uiClose(); }; });
  }

  // ---- empezar / terminar la visita
  function strip(o) { return JSON.parse(JSON.stringify(o, function (k, v) { return k.charAt(0) === '_' ? undefined : v; })); }
  function guestPub(g) { return { sid: g.id, name: g.name, color: g.color, pattern: g.pattern, age: g.age, x: g.x, y: g.y, mood: Math.round(g.mood || 60) }; }
  function makeHostSn(h, hostId, guest) {
    var needs = {}; NEEDS.forEach(function (n) { var v = h.needs && +h.needs[n.k]; needs[n.k] = isFinite(v) ? clamp(v, 5, 100) : 70; });
    var skills = {}; Object.keys(SKILLS).forEach(function (k) { skills[k] = 0; });
    var sn = { id: hostEntId(hostId, h.id), hid: h.id, hostSn: 1, name: String(h.name || 'Serpiente').slice(0, 16), color: /^#[0-9a-f]{3,8}$/i.test(h.color) ? h.color : '#3498db',
      pattern: PATTERNS[h.pattern] ? h.pattern : 'lisa', age: AGES[h.age] ? h.age : 'adulto', traits: (h.traits || []).filter(function (t) { return TRAITS[t]; }).slice(0, 3),
      needs: needs, skills: skills, rel: {}, partner: h.partner != null ? hostEntId(hostId, h.partner) : null, x: +h.x || 6.5, y: +h.y || 7.5, fx: h.fx < 0 ? -1 : 1,
      q: [], mood: +h.mood || 60, ml: [], today: { acts: {}, who: {}, ev: [] }, diary: [], idle: 0, seen: {}, patterns: [h.pattern || 'lisa'], asp: 'popular', job: null, school: { perf: 50 },
      shed: 0, shedAt: 99, shedReady: false, eggCd: 1e15, away: h.away ? { kind: 'fuera', until: 1e15 } : null };
    var r = h.relMe && h.relMe[String(guest.id)]; if (r) sn.rel[String(guest.id)] = { fr: +r.fr || 0, ro: +r.ro || 0, n: guest.name };
    return sn;
  }
  function startVisit(f, sid) {
    var g = null; S.snakes.forEach(function (s) { if (s.id === sid) g = s; }); if (!g) g = S.snakes.filter(function (s) { return !s.away && s.age !== 'bebe'; })[0];
    if (!g) { toast('No hay ninguna serpiente que pueda ir.', 'warn'); return; }
    api('/api/los-snakes/visit', { method: 'POST', body: { host: f.id, snake: g.name } }).then(function (j) {
      uiClose();
      var gs = strip(g); gs.q = []; gs.away = null; gs.x = EXIT[0] + 0.5; gs.y = EXIT[1] + 0.5; gs.fx = -1; gs.idle = 0;
      var w = j.world || {};
      var VS = { v: SAVE_VER, visit: true, name: j.family || '', money: S.money, time: S.time, snakes: [gs], hosts: [],
        objects: (w.objects || []).filter(function (o) { return CAT[o.t] && !CAT[o.t].nobuy; }).map(function (o) { return { id: +o.id, t: o.t, x: +o.x, y: +o.y, r: +o.r || 0 }; }),
        floor: (w.floor && w.floor.length === GW * GH) ? w.floor.slice() : S.floor.slice(), walls: (w.walls && w.walls.length) ? w.walls.slice() : S.walls.slice(), doors: w.doors || [], wallc: w.wallc || {},
        nid: 9e11, visitors: [], mouse: null, neighbors: [], weather: { k: S.weather.k, until: S.weather.until }, party: 0, ach: S.ach, stats: S.stats, hidden: [],
        settings: S.settings, sel: gs.id, todayEv: null, speed: S.speed || 1 };
      HOME = S;
      V = { hostId: f.id, hostName: (j.host && j.host.name) || f.name, family: j.family || '', sid: g.id, t0: S.time, money0: S.money, live: false, lastH: 0, lastG: 0, startedAt: Date.now() };
      g.q.forEach(function (a) { endSocialPartner(g, a, true); }); leaveObj(g); g.q = []; g.away = { until: 1e15, kind: 'visita' };
      S = VS; rebuildCaches();
      (j.snakes || []).forEach(function (h) { var hs = makeHostSn(h, f.id, gs); if (!hs.away) { var x = Math.floor(hs.x), y = Math.floor(hs.y); if (!inLot(x, y) || occ(x, y)) { var p = nearestFree(clamp(x, 0, GW - 1), clamp(y, 0, GH - 1)); hs.x = p[0] + 0.5; hs.y = p[1] + 0.5; } } S.hosts.push(hs); });
      var awayN = S.hosts.filter(function (h) { return h.away; }).map(function (h) { return h.name; });
      logEv(gs, 'visitó la casa de la familia ' + V.family);
      unlock('visita_amigo');
      if (UI) UI.relayout();
      toast('🚪 ' + gs.name + ' llega a casa de ' + V.hostName + ' (familia ' + V.family + ').' + (awayN.length ? ' No están en casa: ' + awayN.join(', ') + '.' : ''), 'good');
      setTimeout(function () { if (S && S.visit) toast('Puedes charlar con su familia y usar sus cosas (sin gastar ni cambiar nada suyo). Deja un 🎁 regalo o una nota en el buzón.', ''); }, 4200);
      netSend({ t: 'visit', host: f.id, snake: guestPub(gs) });
      if (j.live) V.liveSoon = true;
    }).catch(function (e) { uiClose(); toast('No se puede visitar: ' + e.message, 'bad'); });
  }
  function endVisit(silent) {
    if (!V || !HOME || !S || !S.visit) return;
    var vs = S, gs = vs.snakes[0], elapsed = Math.max(0, vs.time - V.t0), dMoney = vs.money - V.money0, hostName = V.hostName;
    netSend({ t: 'leave' });
    V = null; S = HOME; HOME = null;
    var g = null; S.snakes.forEach(function (s) { if (gs && s.id === gs.id) g = s; });
    if (g) g.away = { until: S.time + elapsed + 5, kind: 'visita' };
    QUIET = true; try { advance(elapsed); } catch (e) { console.error('[Los Snakes] vuelta de visita', e); } QUIET = false;
    if (g && gs) {
      ['needs', 'skills', 'rel', 'ml', 'mood', 'diary', 'today', 'seen', 'name', 'color', 'pattern', 'traits', 'asp', 'aspDone'].forEach(function (k) { if (gs[k] !== undefined) g[k] = gs[k]; });
      g.away = null; g.q = []; g.x = EXIT[0] + 0.5; g.y = EXIT[1] + 0.5; g.idle = 0;
    }
    S.money += dMoney; rebuildCaches();
    if (UI) UI.relayout();
    if (!silent) { toast('🏠 ' + (g ? g.name : 'Tu serpiente') + ' vuelve de casa de ' + hostName + (elapsed >= 60 ? ' tras ' + Math.round(elapsed / 60) + ' h' : '') + '.', 'good'); save(true); }
  }
  function visitHourly(h) {
    if (h === 22) writeDiaries();
    if (Math.random() < 0.22) randomThought();
    var g = S.snakes[0], sh = g && shiftFor(g);
    if (sh && weekday() < 5 && h === (sh.s + 22) % 24) toast('⏰ ' + g.name + ' tiene ' + (sh.kind === 'job' ? 'trabajo' : 'colegio') + ' a las ' + hhmm(sh.s * 60) + '. ¡Vuelve a casa a tiempo!', 'warn');
  }

  // ---- regalo o nota en el buzón del amigo
  function giftModal() {
    if (!V) return;
    var sel2 = null, kids = SOCIAL.kids, notes = SOCIAL.notes || [];
    function render() {
      var h = '<h2>🎁 Buzón de ' + esc(V.hostName) + '</h2><p>Lo verá al volver a su casa. Los regalos se pagan con tus escamoleones (tienes ' + money(S.money) + ').</p><h5 style="margin:6px 0">Regalo</h5><div class="lsx-gifts">' +
        Object.keys(GIFTS).map(function (k) { var g = GIFTS[k]; return '<button data-g="' + k + '" class="' + (sel2 === k ? 'on' : '') + '"' + (S.money < g.p ? ' disabled style="opacity:.45"' : '') + '><span class="gi">' + g.i + '</span><span>' + esc(g.n) + '</span><b>' + money(g.p) + '</b></button>'; }).join('') + '</div>' +
        '<div class="lsx-row" style="justify-content:flex-end"><button class="lsx-btng" data-a="gift"' + (sel2 ? '' : ' disabled') + '>🎁 Dejar regalo</button></div>' +
        '<h5 style="margin:10px 0 6px">Nota</h5>' + (kids ? '<select class="nt" style="width:100%">' + notes.map(function (n) { return '<option>' + esc(n) + '</option>'; }).join('') + '</select><small>🧸 Snake OS Kids: elige una nota preparada.</small>'
          : '<textarea class="nt" maxlength="200" placeholder="Escribe una nota para ' + esc(V.hostName) + '…"></textarea><div class="lsx-row" style="flex-wrap:wrap;gap:4px">' + notes.map(function (n, i) { return '<button class="lsx-chip" data-n="' + i + '">' + esc(n) + '</button>'; }).join('') + '</div>') +
        '<div class="lsx-row" style="justify-content:space-between;margin-top:8px"><button data-a="x">Cerrar</button><button class="lsx-btnp" data-a="note">💌 Dejar nota</button></div>';
      var card = uiModal(h, { esc: uiClose });
      card.onclick = function (e) {
        var b = e.target.closest('button'); if (!b || b.disabled) return;
        if (b.dataset.g) { var ta = card.querySelector('textarea.nt'), keep = ta ? ta.value : ''; sel2 = b.dataset.g; render(); var t2 = UI.card.querySelector('textarea.nt'); if (t2) t2.value = keep; return; }
        if (b.dataset.n != null) { var t3 = card.querySelector('textarea.nt'); if (t3) { t3.value = notes[+b.dataset.n]; t3.focus(); } return; }
        if (b.dataset.a === 'x') { uiClose(); return; }
        if (b.dataset.a === 'gift' && sel2) send('gift', sel2, '', b);
        if (b.dataset.a === 'note') { var nt = card.querySelector('.nt'); var txt = nt ? String(nt.value || '').trim() : ''; if (!txt) { toast('Escribe algo en la nota.', 'warn'); return; } send('note', '', txt, b); }
      };
    }
    function send(kind, item, text, btn) {
      if (!V) return; btn.disabled = true;
      var g = S.snakes[0];
      api('/api/los-snakes/mail', { method: 'POST', body: { host: V.hostId, kind: kind, item: item, text: text, snake: g ? g.name : '' } }).then(function (j) {
        if (kind === 'gift') { S.money -= GIFTS[item].p; unlock('regalo'); if (g) logEv(g, 'dejó un regalo a ' + V.hostName); }
        else if (g) logEv(g, 'dejó una nota a ' + V.hostName);
        if (g) think(g, kind === 'gift' ? '🎁' : '💌');
        uiClose(); toast(kind === 'gift' ? '🎁 Regalo dejado en el buzón de ' + V.hostName + '.' : '💌 Nota dejada en el buzón de ' + V.hostName + '.', 'good'); sfx('coin');
      }).catch(function (e) { btn.disabled = false; toast(e.message, 'bad'); });
    }
    render();
  }

  // ---- buzón dibujado en la entrada del solar
  function drawMailbox(c) {
    var b = P(8.6, 14.35), x = b[0], y = b[1], flag = !S.visit && SOCIAL.mail && SOCIAL.mail.length;
    c.save(); ell(c, x, y, 7, 3, 'rgba(0,0,0,.18)');
    c.fillStyle = '#7a5532'; c.fillRect(x - 1.5, y - 22, 3, 22);
    rr(c, x - 9, y - 34, 18, 13, 6); c.fillStyle = S.visit ? '#3a8bf0' : '#e74c3c'; c.fill(); c.strokeStyle = 'rgba(0,0,0,.3)'; c.lineWidth = 1; c.stroke();
    c.fillStyle = 'rgba(0,0,0,.35)'; c.fillRect(x - 6, y - 29, 9, 2);
    c.fillStyle = '#ffd23f'; if (flag) { c.fillRect(x + 8, y - 44, 2, 12); c.fillRect(x + 10, y - 44, 7, 5); } else c.fillRect(x + 8, y - 30, 7, 2);
    c.restore();
  }
  function hitMailbox(sx, sy) { if (!S) return false; var p = toScreen(8.6, 14.35, 26); return Math.abs(sx - p[0]) < 16 * cam.z && Math.abs(sy - p[1]) < 18 * cam.z; }

  // ---- red: presencia y visita en vivo
  var NET = { ws: null, ok: false, retry: 0, timer: 0, closed: true };
  function netConnect() {
    if (NET.closed || NET.ws || userKey() === 'anon' || typeof WebSocket === 'undefined') return;
    try {
      var ws = new WebSocket((location.protocol === 'https:' ? 'wss:' : 'ws:') + '//' + location.host + '/api/los-snakes/ws'); NET.ws = ws;
      ws.onopen = function () { NET.ok = true; NET.retry = 0; if (V && S && S.visit) netSend({ t: 'visit', host: V.hostId, snake: guestPub(S.snakes[0]) }); };
      ws.onmessage = function (e) { var m; try { m = JSON.parse(e.data); } catch (er) { return; } try { onNet(m); } catch (er2) { console.error('[Los Snakes] red', er2); } };
      ws.onclose = function () { NET.ok = false; NET.ws = null; if (V && V.live) setLive(false); REMOTE = {}; if (!NET.closed) NET.timer = setTimeout(netConnect, Math.min(30000, 2000 * Math.pow(2, NET.retry++))); };
      ws.onerror = function () {};
    } catch (e) { NET.ws = null; }
  }
  function netSend(m) { if (NET.ws && NET.ok) try { NET.ws.send(JSON.stringify(m)); } catch (e) {} }
  function netClose() { NET.closed = true; clearTimeout(NET.timer); var ws = NET.ws; NET.ws = null; NET.ok = false; if (ws) try { ws.close(); } catch (e) {} }
  function setLive(on) {
    if (!V || V.live === on) return; V.live = on;
    if (S && S.hosts) S.hosts.forEach(function (h) { h.q = []; h._tx = h._ty = null; h._sleep = 0; });
    toast(on ? '🟢 Visita en vivo: ' + V.hostName + ' está jugando y ve a tu serpiente.' : '⚪ ' + V.hostName + ' ya no está conectado: la visita sigue sin conexión.', on ? 'good' : '');
    if (UI && UI.renderVBar) UI.renderVBar();
  }
  function hostSnByHid(hid) { if (!S || !S.hosts) return null; for (var i = 0; i < S.hosts.length; i++) if (S.hosts[i].hid === hid) return S.hosts[i]; return null; }
  function onNet(m) {
    var t = m.t;
    if (t === 'visit_ok') { if (V && m.live) V.liveSoon = true; }
    else if (t === 'visit_err') { if (V && V.live) setLive(false); }
    else if (t === 'host_off') setLive(false);
    else if (t === 'h' && V && S && S.visit && m.s) {
      V.lastH = performance.now(); if (!V.live) setLive(true);
      var seen = {};
      (m.s.l || []).forEach(function (d) {
        if (!d) return; var h = hostSnByHid(d.i);
        if (!h) { h = makeHostSn({ id: d.i, name: d.n, color: d.c, pattern: d.p, age: d.g, x: d.x, y: d.y, mood: d.m }, V.hostId, S.snakes[0]); h.away = null; S.hosts.push(h); }
        seen[d.i] = 1; if (h.away) { h.away = null; h.x = +d.x; h.y = +d.y; }
        h._tx = +d.x; h._ty = +d.y; h.fx = d.f < 0 ? -1 : 1; h._sleep = d.z ? 1 : 0; h._onTile = d.o ? 1 : 0; if (isFinite(+d.m)) h.mood = +d.m;
        if (d.a && d.a !== h._a) think(h, d.a, '', 3); h._a = d.a; h.q = [];
      });
      S.hosts.forEach(function (h) { if (!seen[h.hid]) h.away = { kind: 'fuera', until: 1e15 }; });
    }
    else if (t === 'soc') applyNetSocial(m);
    else if (t === 'guest_join') {
      var sd = m.snake || {}, uid = +m.from; if (!uid) return;
      REMOTE[uid] = { id: remoteEntId(uid, sd.sid), uid: uid, sid: sd.sid, remote: 1, owner: String(m.name || 'Amigo').slice(0, 30), name: String(sd.name || 'Serpiente').slice(0, 16),
        color: /^#[0-9a-f]{3,8}$/i.test(sd.color) ? sd.color : '#3498db', pattern: PATTERNS[sd.pattern] ? sd.pattern : 'lisa', age: AGES[sd.age] ? sd.age : 'adulto',
        x: EXIT[0] + 0.5, y: EXIT[1] + 0.5, fx: -1, mood: +sd.mood || 60, _tx: EXIT[0] + 0.5, _ty: EXIT[1] + 0.5 };
      if (S && !S.visit) { toast('🔔 ¡Tienes visita! ' + REMOTE[uid].owner + ' ha venido con ' + REMOTE[uid].name + '.', 'good'); sfx('bell'); unlock('anfitrion'); }
      else toast('🔔 ' + REMOTE[uid].owner + ' ha venido a tu casa con ' + REMOTE[uid].name + ', pero tú estás de visita fuera.', '');
    }
    else if (t === 'g') { var r = REMOTE[+m.from], s = m.s || {}; if (r) { r._tx = clamp(+s.x || r.x, 0, GW); r._ty = clamp(+s.y || r.y, 0, GH); r.fx = s.f < 0 ? -1 : 1; r._sleep = s.z ? 1 : 0; r._onTile = s.o ? 1 : 0; if (isFinite(+s.m)) r.mood = +s.m; if (s.a && s.a !== r._a) think(r, s.a, '', 3); r._a = s.a; } }
    else if (t === 'guest_leave') { var rr2 = REMOTE[+m.from]; if (rr2) { delete REMOTE[+m.from]; if (S && !S.visit) toast('👋 ' + rr2.name + ' (de ' + rr2.owner + ') se despide y se va a casa.', ''); } }
    else if (t === 'mail') refreshSocial(false);
  }
  function actIcon(sn) { var a = sn.q && sn.q[0]; if (!a || a.phase !== 'do') return ''; var d = ACT[a.id] || SOC[a.id] || {}; return d.i || ''; }
  var lastNet = 0;
  function netTick(t, dt) {
    var k = Math.min(1, (dt || 0.016) * 7);
    function interp(e) { if (e._tx == null) return; var dx = e._tx - e.x, dy = e._ty - e.y; if (Math.abs(dx) + Math.abs(dy) > 0.02) { e.x += dx * k; e.y += dy * k; e._moving = performance.now(); if (Math.abs(dx - dy) > 0.05) e.fx = (dx - dy) > 0 ? 1 : -1; } }
    if (V && S && S.visit) {
      if (V.live) { S.hosts.forEach(interp); if (performance.now() - V.lastH > 7000) setLive(false); }
      if (NET.ok && t - lastNet > 250) {
        lastNet = t; var g = S.snakes[0];
        if (g) netSend({ t: 'g', s: { x: Math.round(g.x * 100) / 100, y: Math.round(g.y * 100) / 100, f: g.fx, a: actIcon(g), z: (g.q[0] && g.q[0].phase === 'do' && (ACT[g.q[0].id] || {}).sleeping) ? 1 : 0, o: g._onTile ? 1 : 0, m: Math.round(g.mood) } });
      }
    } else if (S) {
      var any = false; for (var rk in REMOTE) { any = true; interp(REMOTE[rk]); }
      if (any && NET.ok && t - lastNet > 250) {
        lastNet = t;
        netSend({ t: 'h', s: { l: S.snakes.filter(function (s) { return !s.away; }).slice(0, 8).map(function (s) {
          return { i: s.id, n: s.name, c: s.color, p: s.pattern, g: s.age, x: Math.round(s.x * 100) / 100, y: Math.round(s.y * 100) / 100, f: s.fx, a: actIcon(s), z: (s.q[0] && s.q[0].phase === 'do' && (ACT[s.q[0].id] || {}).sleeping) ? 1 : 0, o: s._onTile ? 1 : 0, m: Math.round(s.mood) }; }) } });
      }
    }
  }
  // Interacción social entre una serpiente propia y otra de un amigo: se guarda en la partida de cada uno
  function netSocial(sn, t, id, ok, r1) {
    if (t.hostSn && V) { r1.fam = V.family; r1.own = V.hostName; if (V.live) netSend({ t: 'soc', id: id, ok: ok, hs: t.hid, gs: sn.id, by: 'g' }); }
    else if (t.remote) { r1.fam = 'de visita'; r1.own = t.owner; netSend({ t: 'soc', to: t.uid, id: id, ok: ok, hs: sn.id, gs: t.sid, by: 'h' }); }
  }
  function applyNetSocial(m) {
    var def = SOC[m.id]; if (!def || def.kid || m.id === 'propose' || m.id === 'eggs') return;
    var me = null, other = null;
    if (S && S.visit && V && m.by === 'h') { me = S.snakes[0]; if (!me || me.id !== m.gs) return; other = hostSnByHid(m.hs); if (other) { other.rel = other.rel || {}; } }
    else if (S && !S.visit && m.by === 'g') { S.snakes.forEach(function (s) { if (s.id === m.hs) me = s; }); other = REMOTE[+m.from]; }
    if (!me || !other) return;
    var r = relOf(me, other), dfr = m.ok ? def.fr : (def.ff || -3);
    r.fr = clamp(r.fr + dfr, -100, 100); if (def.ro && m.ok) r.ro = clamp(r.ro + def.ro, 0, 100);
    if (other.hostSn) { r.fam = V.family; r.own = V.hostName; } else { r.fam = 'de visita'; r.own = other.owner; }
    for (var k in def.need) me.needs[k] = clamp(me.needs[k] + def.need[k] * (m.ok ? 0.8 : 0.3), 0, 100);
    if (me.today) me.today.who[other.name] = (me.today.who[other.name] || 0) + 1;
    think(me, m.ok ? (def.c === 'romance' ? '💗' : '💚') : '💢'); faceTo(me, other.x, other.y);
    if (r.fr >= 80) unlock('amigos');
  }
  global.renderLosSnakesApp = function (body) {
    if (UI && UI.destroy) UI.destroy();
    var ui = createUI(body);
    return function () { ui.destroy(); };
  };
  global.__losSnakes = {
    get S() { return S; }, advance: function (m) { advance(m); }, newGame: newGame, save: save, enqueue: enqueue, ACT: ACT, SOC: SOC, CAT: CAT,
    get V() { return V; }, get HOME() { return HOME; }, get REMOTE() { return REMOTE; }, get NET() { return NET; }, get SOCIAL() { return SOCIAL; }, endVisit: endVisit, visitClick: visitClick, mailClick: mailClick,
    get ui() { return UI; }, startEvent: startEvent, writeDiaries: writeDiaries, hatch: hatch, layEggs: layEggs, sel: sel, cam: cam
  };
})(typeof window !== 'undefined' ? window : this);
