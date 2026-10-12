/* Prism - lenguaje 3D programable (d1-d5).
 * El cubo SOLO se mueve con Ejecutar si el codigo incluye d2, d3 y d4.
 * Sin esos tres comandos: error y sin movimiento.
 */
(function () {
  'use strict';

  var THREE_URL = 'https://cdn.jsdelivr.net/npm/three@0.160.0/build/three.min.js';
  var threePromise = null;
  var STEP = 1.2;
  var GRID = 24;
  var STEP_MS = 300;

  var OBSTACLES = [
    { id: 'muro', label: 'Muro', icon: '#', color: 0x8d6e63, fn: 'bloquea el paso' },
    { id: 'pinchos', label: 'Pinchos', icon: '^', color: 0xff5252, fn: 'te reinicia' },
    { id: 'trampolin', label: 'Trampolin', icon: '~', color: 0x69f0ae, fn: 'rebota' },
    { id: 'moneda', label: 'Moneda', icon: 'o', color: 0xffd54f, fn: 'se recoge' },
    { id: 'cinta', label: 'Cinta', icon: '>', color: 0x4fc3f7, fn: 'empuja' },
    { id: 'portal', label: 'Portal', icon: 'O', color: 0xb388ff, fn: 'teletransporta' }
  ];

  var SKINS = [
    { id: 'clasico', label: 'Clasico', color: 0x6c5ce7, metal: 0.2, rough: 0.35, emissive: 0x6c5ce7, emi: 0.12 },
    { id: 'oro', label: 'Oro', color: 0xffc107, metal: 0.9, rough: 0.2, emissive: 0xb8860b, emi: 0.2 },
    { id: 'hielo', label: 'Hielo', color: 0xb3e5fc, metal: 0.1, rough: 0.05, emissive: 0x81d4fa, emi: 0.25 },
    { id: 'lava', label: 'Lava', color: 0xff5722, metal: 0.3, rough: 0.45, emissive: 0xff1744, emi: 0.55 },
    { id: 'cesped', label: 'Cesped', color: 0x66bb6a, metal: 0.05, rough: 0.85, emissive: 0x2e7d32, emi: 0.08 },
    { id: 'metal', label: 'Metal', color: 0xb0bec5, metal: 1.0, rough: 0.15, emissive: 0x546e7a, emi: 0.05 },
    { id: 'neon', label: 'Neon', color: 0x00e5ff, metal: 0.2, rough: 0.25, emissive: 0x00e5ff, emi: 0.7 },
    { id: 'madera', label: 'Madera', color: 0xa1887f, metal: 0.0, rough: 0.9, emissive: 0x5d4037, emi: 0.04 },
    { id: 'arcoiris', label: 'Arcoiris', color: 0xff4081, metal: 0.35, rough: 0.3, emissive: 0x7c4dff, emi: 0.45 },
    { id: 'noche', label: 'Noche', color: 0x263238, metal: 0.4, rough: 0.4, emissive: 0x90caf9, emi: 0.35 }
  ];

  var SAMPLE =
    '# Prism — OBLIGATORIO: codifica d2, d3 y d4 (los tres)\n' +
    '# d2 = adelante  d3 = atras  d4 = derecha  d5 = izquierda\n' +
    '# Sin d2+d3+d4 el cubo NO se mueve (error al Ejecutar)\n' +
    '# d1 = volver al centro (opcional)\n' +
    'd2\n' +
    'd3\n' +
    'd4\n';

  function loadThree() {
    if (window.THREE) return Promise.resolve(window.THREE);
    if (threePromise) return threePromise;
    threePromise = new Promise(function (resolve, reject) {
      var existing = document.querySelector('script[data-prism-three="1"]');
      if (existing) {
        var checks = 0;
        var timer = setInterval(function () {
          checks += 1;
          if (window.THREE) {
            clearInterval(timer);
            resolve(window.THREE);
          } else if (checks > 80) {
            clearInterval(timer);
            reject(new Error('THREE no disponible'));
          }
        }, 50);
        return;
      }
      var s = document.createElement('script');
      s.src = THREE_URL;
      s.async = true;
      s.setAttribute('data-prism-three', '1');
      s.onload = function () {
        if (window.THREE) resolve(window.THREE);
        else reject(new Error('THREE no disponible'));
      };
      s.onerror = function () { reject(new Error('No se pudo cargar Three.js')); };
      document.head.appendChild(s);
    });
    return threePromise;
  }

  function snap(v) {
    return Math.round(v / STEP) * STEP;
  }

  function findSkin(id) {
    for (var i = 0; i < SKINS.length; i++) if (SKINS[i].id === id) return SKINS[i];
    return SKINS[0];
  }

  function findObstacle(id) {
    for (var i = 0; i < OBSTACLES.length; i++) if (OBSTACLES[i].id === id) return OBSTACLES[i];
    return null;
  }

  function pushMove(cmds, op, lineNum, count) {
    var n = count || 1;
    if (n < 1) n = 1;
    if (n > 200) n = 200;
    for (var k = 0; k < n; k++) cmds.push({ op: op, line: lineNum });
  }

  function parseProgram(src) {
    var lines = String(src || '').split(/\n/);
    var cmds = [];
    for (var i = 0; i < lines.length; i++) {
      var raw = lines[i];
      var line = raw.replace(/#.*$/, '').trim();
      if (!line) continue;
      var low = line.toLowerCase();
      var moveRepeat = low.match(/^(d[2-5])\s*(?:x|\*)?\s*(\d+)\s*$/);
      if (moveRepeat) {
        pushMove(cmds, moveRepeat[1], i + 1, parseInt(moveRepeat[2], 10));
        continue;
      }
      if (low === 'd1') {
        cmds.push({ op: 'd1', line: i + 1 });
        continue;
      }
      var moveTokens = low.split(/\s+/).filter(Boolean);
      if (moveTokens.length > 1 && moveTokens.every(function (t) { return /^d[2-5]$/.test(t); })) {
        moveTokens.forEach(function (t) { cmds.push({ op: t, line: i + 1 }); });
        continue;
      }
      if (low === 'd2' || low === 'd3' || low === 'd4' || low === 'd5') {
        cmds.push({ op: low, line: i + 1 });
        continue;
      }
      var parts = line.split(/\s+/);
      var head = (parts[0] || '').toLowerCase();
      if (head === 'skin' && parts[1]) {
        cmds.push({ op: 'skin', id: parts[1].toLowerCase(), line: i + 1 });
        continue;
      }
      if ((head === 'obstaculo' || head === 'obstacle') && parts[1]) {
        var ox = parts.length > 2 ? parseFloat(parts[2]) : 0;
        var oz = parts.length > 3 ? parseFloat(parts[3]) : -STEP * 2;
        if (isNaN(ox)) ox = 0;
        if (isNaN(oz)) oz = -STEP * 2;
        cmds.push({ op: 'obstaculo', id: parts[1].toLowerCase(), x: ox, z: oz, line: i + 1 });
        continue;
      }
      if (head === 'limpiar' || head === 'clear') {
        cmds.push({ op: 'clear', line: i + 1 });
        continue;
      }
      cmds.push({ op: 'error', msg: 'linea ' + (i + 1) + ': comando desconocido "' + line + '"' });
    }
    return cmds;
  }

  function renderPrismApp(container) {
    if (!container) return function () {};

    var obstHtml = OBSTACLES.map(function (o) {
      return '<button type="button" class="prism-chip" data-tool="obstacle" data-id="' + o.id + '" title="' + o.fn + '">' +
        '<span class="prism-chip-ico">' + o.icon + '</span><span>' + o.label + '</span></button>';
    }).join('');

    var skinHtml = SKINS.map(function (s) {
      var hex = '#' + s.color.toString(16).padStart(6, '0');
      return '<button type="button" class="prism-chip skin" data-tool="skin" data-id="' + s.id + '" title="' + s.label + '">' +
        '<span class="prism-skin-swatch" style="background:' + hex + '"></span><span>' + s.label + '</span></button>';
    }).join('');

    container.innerHTML =
      '<div class="prism-wrap">' +
        '<div class="prism-side">' +
          '<div class="prism-head">' +
            '<div>' +
              '<div class="prism-title-row">' +
                '<img class="prism-title-logo" src="/static/assets/prism-logo.png?v=1" alt="Prism">' +
                '<h2 class="prism-title">Prism</h2>' +
              '</div>' +
              '<p class="prism-sub">Flechas mueven el cubo ya. Ejecutar exige d2, d3 y d4 en el codigo (si falta alguno: error).</p>' +
            '</div>' +
            '<div class="prism-badge">d2+d3+d4</div>' +
          '</div>' +
          '<div class="prism-cheats">' +
            '<span><b>↑</b> / <b>d2</b> adelante</span>' +
            '<span><b>↓</b> / <b>d3</b> atras</span>' +
            '<span><b>→</b> / <b>d4</b> der</span>' +
            '<span><b>←</b> / <b>d5</b> izq</span>' +
            '<span><b>Ejecutar</b> necesita d2+d3+d4</span>' +
            '<span><b>Flechas</b> mueven ya</span>' +
          '</div>' +
          '<div class="prism-panel">' +
            '<div class="prism-panel-title">Obstaculos (clic + clic tablero)</div>' +
            '<div class="prism-chip-row" data-prism="obstacles">' + obstHtml + '</div>' +
          '</div>' +
          '<div class="prism-panel">' +
            '<div class="prism-panel-title">Skins del cubo (clic)</div>' +
            '<div class="prism-chip-row" data-prism="skins">' + skinHtml + '</div>' +
          '</div>' +
          '<div class="prism-toolbar">' +
            '<button type="button" class="prism-btn primary" data-prism="run">Ejecutar</button>' +
            '<button type="button" class="prism-btn" data-prism="stop" disabled>Detener</button>' +
            '<button type="button" class="prism-btn" data-prism="place">Crear cubo</button>' +
            '<button type="button" class="prism-btn" data-prism="clear">Limpiar</button>' +
            '<button type="button" class="prism-btn ghost" data-prism="cancel">Cancelar tool</button>' +
          '</div>' +
          '<textarea class="prism-code" data-prism="code" spellcheck="false" autocomplete="off" autocapitalize="off" aria-label="Código Prism"></textarea>' +
          '<div class="prism-status" data-prism="status">Cargando motor 3D...</div>' +
        '</div>' +
        '<div class="prism-view" data-prism="view" tabindex="0" aria-label="Vista Prism">' +
          '<canvas data-prism="canvas"></canvas>' +
          '<div class="prism-drop-hint" data-prism="drophint">Clic para colocar</div>' +
          '<div class="prism-overlay" data-prism="overlay">Cargando 3D...</div>' +
        '</div>' +
      '</div>';

    var codeEl = container.querySelector('[data-prism="code"]');
    var statusEl = container.querySelector('[data-prism="status"]');
    var viewEl = container.querySelector('[data-prism="view"]');
    var canvas = container.querySelector('[data-prism="canvas"]');
    var overlay = container.querySelector('[data-prism="overlay"]');
    var dropHint = container.querySelector('[data-prism="drophint"]');
    var btnRun = container.querySelector('[data-prism="run"]');
    var btnStop = container.querySelector('[data-prism="stop"]');
    var btnPlace = container.querySelector('[data-prism="place"]');
    var btnClear = container.querySelector('[data-prism="clear"]');
    var btnCancel = container.querySelector('[data-prism="cancel"]');

    codeEl.value = SAMPLE;

    var stopped = false;
    var ready = false;
    var THREE = null;
    var renderer = null;
    var scene = null;
    var camera = null;
    var ground = null;
    var player = null;
    var playerSkinId = 'clasico';
    var obstacles = [];
    var score = 0;
    var animId = 0;
    var ro = null;
    var camAngle = 0.85;
    var camRadius = 12;
    var camHeight = 8;
    var orbitDrag = null;
    var raycaster = null;
    var pointer = null;
    var bounceCooldown = 0;
    var conveyorTick = 0;
    var selectedTool = null;
    var running = false;
    var runToken = 0;
    var runTimer = 0;

    function setStatus(msg, kind) {
      if (!statusEl) return;
      statusEl.textContent = msg;
      statusEl.className = 'prism-status' + (kind ? ' ' + kind : '');
    }

    function appendCmd(line) {
      if (!codeEl || running) return;
      var cur = String(codeEl.value || '');
      if (cur && cur.charAt(cur.length - 1) !== '\n') cur += '\n';
      codeEl.value = cur + line + '\n';
      try { codeEl.scrollTop = codeEl.scrollHeight; } catch (e) {}
    }

    function setRunningUI(on) {
      running = on;
      if (btnRun) btnRun.disabled = on;
      if (btnStop) btnStop.disabled = !on;
    }

    function stopProgram() {
      runToken += 1;
      if (runTimer) {
        clearTimeout(runTimer);
        runTimer = 0;
      }
      if (running) {
        setRunningUI(false);
        setStatus('Programa detenido', 'muted');
      } else {
        setRunningUI(false);
      }
    }

    function syncToolUI() {
      container.querySelectorAll('.prism-chip').forEach(function (chip) {
        var kind = chip.getAttribute('data-tool');
        var id = chip.getAttribute('data-id');
        var on = !!(selectedTool && selectedTool.kind === kind && selectedTool.id === id);
        chip.classList.toggle('active', on);
      });
      if (selectedTool && selectedTool.kind === 'obstacle') {
        viewEl.classList.add('tool-ready');
        if (dropHint) dropHint.classList.add('show');
      } else {
        viewEl.classList.remove('tool-ready');
        if (dropHint) dropHint.classList.remove('show');
      }
    }

    function clearTool() {
      selectedTool = null;
      syncToolUI();
    }

    function selectTool(kind, id) {
      if (running) return;
      if (kind === 'skin') {
        applySkin(id, true);
        clearTool();
        try { viewEl.focus(); } catch (e) {}
        return;
      }
      if (selectedTool && selectedTool.kind === kind && selectedTool.id === id) {
        clearTool();
        setStatus('Tool cancelada', 'muted');
        return;
      }
      selectedTool = { kind: kind, id: id };
      syncToolUI();
      var meta = findObstacle(id);
      setStatus('Seleccionado: ' + (meta ? meta.label : id) + ' - clic en el tablero para colocar', 'ok');
      try { viewEl.focus(); } catch (e2) {}
    }

    function applySkinToMesh(mesh, skinId) {
      var skin = findSkin(skinId);
      if (!mesh || !THREE || !skin) return;
      if (mesh.material) {
        try { mesh.material.dispose(); } catch (e) {}
      }
      mesh.material = new THREE.MeshStandardMaterial({
        color: skin.color,
        metalness: skin.metal,
        roughness: skin.rough,
        emissive: skin.emissive,
        emissiveIntensity: skin.emi
      });
      mesh.userData.skinId = skin.id;
    }

    function ensurePlayer(record) {
      if (!THREE || !scene || !ready) return null;
      if (player) return player;
      player = new THREE.Mesh(
        new THREE.BoxGeometry(1, 1, 1),
        new THREE.MeshStandardMaterial({ color: 0x6c5ce7 })
      );
      player.position.set(0, 0.5, 0);
      player.castShadow = true;
      player.receiveShadow = true;
      player.userData.kind = 'player';
      applySkinToMesh(player, playerSkinId);
      scene.add(player);
      if (record !== false) appendCmd('d1');
      setStatus('Cubo creado. Flechas para mover; Ejecutar necesita d2, d3 y d4.', 'ok');
      return player;
    }

    function occupiedByObstacle(x, z, ignoreId) {
      for (var i = 0; i < obstacles.length; i++) {
        var o = obstacles[i];
        if (ignoreId && o.id === ignoreId) continue;
        if (Math.abs(o.mesh.position.x - x) < 0.01 && Math.abs(o.mesh.position.z - z) < 0.01) {
          return o;
        }
      }
      return null;
    }

    function clearWorld() {
      if (!scene) return;
      if (player) {
        scene.remove(player);
        try {
          if (player.geometry) player.geometry.dispose();
          if (player.material) player.material.dispose();
        } catch (e) {}
        player = null;
      }
      for (var i = 0; i < obstacles.length; i++) {
        scene.remove(obstacles[i].mesh);
        try {
          if (obstacles[i].mesh.geometry) obstacles[i].mesh.geometry.dispose();
          if (obstacles[i].mesh.material) {
            if (Array.isArray(obstacles[i].mesh.material)) {
              obstacles[i].mesh.material.forEach(function (m) { try { m.dispose(); } catch (e2) {} });
            } else {
              obstacles[i].mesh.material.dispose();
            }
          }
        } catch (e3) {}
      }
      obstacles = [];
      score = 0;
      playerSkinId = 'clasico';
      bounceCooldown = 0;
      clearTool();
    }

    function makeObstacleMesh(typeId) {
      var meta = findObstacle(typeId);
      var color = meta ? meta.color : 0x888888;
      var mesh;
      if (typeId === 'pinchos') {
        mesh = new THREE.Mesh(
          new THREE.ConeGeometry(0.45, 1, 4),
          new THREE.MeshStandardMaterial({ color: color, roughness: 0.45, metalness: 0.15, emissive: color, emissiveIntensity: 0.2 })
        );
        mesh.position.y = 0.5;
      } else if (typeId === 'moneda') {
        mesh = new THREE.Mesh(
          new THREE.CylinderGeometry(0.35, 0.35, 0.12, 24),
          new THREE.MeshStandardMaterial({ color: color, metalness: 0.85, roughness: 0.25, emissive: 0xffc107, emissiveIntensity: 0.35 })
        );
        mesh.rotation.x = Math.PI / 2;
        mesh.position.y = 0.55;
      } else if (typeId === 'portal') {
        mesh = new THREE.Mesh(
          new THREE.TorusGeometry(0.45, 0.12, 10, 24),
          new THREE.MeshStandardMaterial({ color: color, emissive: color, emissiveIntensity: 0.55, metalness: 0.3, roughness: 0.35 })
        );
        mesh.rotation.x = Math.PI / 2;
        mesh.position.y = 0.55;
      } else if (typeId === 'cinta') {
        mesh = new THREE.Mesh(
          new THREE.BoxGeometry(1.05, 0.18, 1.05),
          new THREE.MeshStandardMaterial({ color: color, metalness: 0.4, roughness: 0.35, emissive: 0x0288d1, emissiveIntensity: 0.25 })
        );
        mesh.position.y = 0.09;
      } else if (typeId === 'trampolin') {
        mesh = new THREE.Mesh(
          new THREE.CylinderGeometry(0.5, 0.5, 0.2, 20),
          new THREE.MeshStandardMaterial({ color: color, metalness: 0.2, roughness: 0.4, emissive: 0x00c853, emissiveIntensity: 0.3 })
        );
        mesh.position.y = 0.1;
      } else {
        mesh = new THREE.Mesh(
          new THREE.BoxGeometry(1.05, 1.2, 1.05),
          new THREE.MeshStandardMaterial({ color: color, roughness: 0.7, metalness: 0.1 })
        );
        mesh.position.y = 0.6;
      }
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      mesh.userData.kind = 'obstacle';
      mesh.userData.typeId = typeId;
      return mesh;
    }

    function placeObstacle(typeId, x, z, record) {
      if (!THREE || !scene || !ready) return false;
      if (!findObstacle(typeId)) {
        setStatus('Obstaculo desconocido: ' + typeId, 'err');
        return false;
      }
      x = snap(x);
      z = snap(z);
      if (Math.abs(x) > GRID / 2 || Math.abs(z) > GRID / 2) {
        setStatus('Fuera del tablero', 'err');
        return false;
      }
      if (player && Math.abs(player.position.x - x) < 0.01 && Math.abs(player.position.z - z) < 0.01) {
        setStatus('No puedes poner un obstaculo encima del cubo', 'err');
        return false;
      }
      if (occupiedByObstacle(x, z)) {
        setStatus('Ya hay un obstaculo ahi', 'err');
        return false;
      }
      var mesh = makeObstacleMesh(typeId);
      mesh.position.x = x;
      mesh.position.z = z;
      scene.add(mesh);
      obstacles.push({
        id: 'obs_' + Date.now() + '_' + Math.floor(Math.random() * 9999),
        typeId: typeId,
        mesh: mesh
      });
      var meta = findObstacle(typeId);
      if (record !== false) {
        appendCmd('obstaculo ' + typeId + ' ' + x.toFixed(1) + ' ' + z.toFixed(1));
      }
      setStatus((meta ? meta.label : typeId) + ' colocado - se programa solo (' + (meta ? meta.fn : '') + ')', 'ok');
      return true;
    }

    function applySkin(skinId, record) {
      if (!ready) return;
      if (!findSkin(skinId) && skinId !== 'clasico') {
        // findSkin falls back to clasico; warn if unknown
        var known = false;
        for (var i = 0; i < SKINS.length; i++) if (SKINS[i].id === skinId) known = true;
        if (!known) {
          setStatus('Skin desconocida: ' + skinId, 'err');
          return;
        }
      }
      ensurePlayer(false);
      playerSkinId = skinId;
      applySkinToMesh(player, skinId);
      if (record !== false) appendCmd('skin ' + skinId);
      var skin = findSkin(skinId);
      setStatus('Skin "' + skin.label + '" aplicada al cubo', 'ok');
    }

    function tryMovePlayer(dx, dz, cmd, record) {
      ensurePlayer(false);
      if (!player) return;
      if (bounceCooldown > 0) return;

      var nx = snap(player.position.x + dx);
      var nz = snap(player.position.z + dz);
      if (Math.abs(nx) > GRID / 2 || Math.abs(nz) > GRID / 2) {
        setStatus('Borde del tablero', 'muted');
        return;
      }

      var hit = occupiedByObstacle(nx, nz);
      if (hit && hit.typeId === 'muro') {
        setStatus('Muro: no puedes pasar', 'err');
        return;
      }

      player.position.x = nx;
      player.position.z = nz;
      if (record !== false && cmd) appendCmd(cmd);
      updateCamera();

      hit = occupiedByObstacle(nx, nz);
      if (hit) resolveObstacle(hit, dx, dz);
      else setStatus('Cubo en (' + nx.toFixed(1) + ', ' + nz.toFixed(1) + ')', 'ok');
    }

    function resolveObstacle(hit, dx, dz) {
      var t = hit.typeId;
      if (t === 'pinchos') {
        player.position.set(0, 0.5, 0);
        setStatus('Pinchos: reinicio al origen', 'err');
        if (!running) appendCmd('# auto: pinchos reinician');
        updateCamera();
        return;
      }
      if (t === 'trampolin') {
        bounceCooldown = 8;
        var bx = snap(player.position.x - dx * 2);
        var bz = snap(player.position.z - dz * 2);
        var blocker = occupiedByObstacle(bx, bz);
        if (!blocker || blocker.typeId !== 'muro') {
          if (Math.abs(bx) <= GRID / 2 && Math.abs(bz) <= GRID / 2) {
            player.position.x = bx;
            player.position.z = bz;
          }
        }
        setStatus('Trampolin: rebote', 'ok');
        if (!running) appendCmd('# auto: trampolin rebota');
        updateCamera();
        return;
      }
      if (t === 'moneda') {
        scene.remove(hit.mesh);
        try {
          hit.mesh.geometry.dispose();
          hit.mesh.material.dispose();
        } catch (e) {}
        obstacles = obstacles.filter(function (o) { return o.id !== hit.id; });
        score += 1;
        setStatus('Moneda recogida - puntuación ' + score, 'ok');
        if (!running) appendCmd('# auto: moneda +1');
        return;
      }
      if (t === 'portal') {
        var other = null;
        for (var i = 0; i < obstacles.length; i++) {
          if (obstacles[i].typeId === 'portal' && obstacles[i].id !== hit.id) {
            other = obstacles[i];
            break;
          }
        }
        if (other) {
          player.position.x = other.mesh.position.x;
          player.position.z = other.mesh.position.z;
          setStatus('Portal: teletransporte', 'ok');
          if (!running) appendCmd('# auto: portal');
        } else {
          player.position.x = snap(player.position.x + (dx || 0) * 2);
          player.position.z = snap(player.position.z + (dz || 0) * 2);
          setStatus('Portal: salto', 'ok');
        }
        updateCamera();
        return;
      }
      if (t === 'cinta') {
        setStatus('Cinta: te empuja hacia delante', 'ok');
      }
    }

    function moveBy(cmd, record) {
      if (!ready) return;
      if (cmd === 'd2') tryMovePlayer(0, -STEP, 'd2', record);
      else if (cmd === 'd3') tryMovePlayer(0, STEP, 'd3', record);
      else if (cmd === 'd4') tryMovePlayer(STEP, 0, 'd4', record);
      else if (cmd === 'd5') tryMovePlayer(-STEP, 0, 'd5', record);
    }

    function execCmd(cmd) {
      if (!cmd) return false;
      if (cmd.op === 'error') {
        setStatus(cmd.msg, 'err');
        return false;
      }
      if (cmd.op === 'clear') {
        clearWorld();
        setStatus('Mundo limpio (programa)', 'muted');
        return true;
      }
      if (cmd.op === 'd1') {
        if (player) {
          player.position.set(0, 0.5, 0);
          updateCamera();
          setStatus('Cubo en origen', 'ok');
        } else {
          ensurePlayer(false);
        }
        return true;
      }
      if (cmd.op === 'd2' || cmd.op === 'd3' || cmd.op === 'd4' || cmd.op === 'd5') {
        moveBy(cmd.op, false);
        return true;
      }
      if (cmd.op === 'skin') {
        applySkin(cmd.id, false);
        return true;
      }
      if (cmd.op === 'obstaculo') {
        placeObstacle(cmd.id, cmd.x, cmd.z, false);
        return true;
      }
      return false;
    }

    function runProgram() {
      if (!ready || running) return;
      var cmds = parseProgram(codeEl.value);
      if (!cmds.length) {
        setStatus('Faltan comandos: hace falta codificar d2, d3 y d4', 'err');
        return;
      }
      for (var i = 0; i < cmds.length; i++) {
        if (cmds[i].op === 'error') {
          setStatus(cmds[i].msg, 'err');
          return;
        }
      }

      // Movimiento SOLO si el programa incluye d2, d3 y d4 (los tres).
      var hasD2 = false;
      var hasD3 = false;
      var hasD4 = false;
      for (var j = 0; j < cmds.length; j++) {
        if (cmds[j].op === 'd2') hasD2 = true;
        if (cmds[j].op === 'd3') hasD3 = true;
        if (cmds[j].op === 'd4') hasD4 = true;
      }
      if (!hasD2 || !hasD3 || !hasD4) {
        var missing = [];
        if (!hasD2) missing.push('d2');
        if (!hasD3) missing.push('d3');
        if (!hasD4) missing.push('d4');
        setStatus('Faltan comandos: hace falta codificar d2, d3 y d4 (falta: ' + missing.join(', ') + ')', 'err');
        return;
      }

      stopProgram();
      var token = runToken;
      setRunningUI(true);
      clearTool();
      ensurePlayer(false);
      // No resetear posicion: el cubo sigue desde donde esta.
      // Usa d1 en el codigo si quieres volver al centro.

      var idx = 0;
      function step() {
        if (stopped || token !== runToken) return;
        if (idx >= cmds.length) {
          setRunningUI(false);
          setStatus('Programa terminado (' + cmds.length + ' pasos)', 'ok');
          try { viewEl.focus(); } catch (e) {}
          return;
        }
        var cmd = cmds[idx];
        idx += 1;
        setStatus('Ejecutando ' + idx + '/' + cmds.length + ': ' + (cmd.op === 'obstaculo' ? ('obstaculo ' + cmd.id) : (cmd.op === 'skin' ? ('skin ' + cmd.id) : cmd.op)), 'ok');
        execCmd(cmd);
        runTimer = setTimeout(step, STEP_MS);
      }
      step();
    }

    function updateCamera() {
      if (!camera) return;
      var tx = player ? player.position.x * 0.45 : 0;
      var tz = player ? player.position.z * 0.45 : 0;
      camera.position.set(
        Math.cos(camAngle) * camRadius + tx,
        camHeight,
        Math.sin(camAngle) * camRadius + tz
      );
      camera.lookAt(tx, 0.5, tz);
    }

    function resize() {
      if (!renderer || !camera || !viewEl) return;
      var w = Math.max(80, viewEl.clientWidth || 0);
      var h = Math.max(80, viewEl.clientHeight || 0);
      renderer.setSize(w, h, false);
      canvas.style.width = '100%';
      canvas.style.height = '100%';
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
      if (scene) renderer.render(scene, camera);
    }

    function animate() {
      if (stopped) return;
      animId = requestAnimationFrame(animate);
      if (!renderer || !scene || !camera) return;

      if (bounceCooldown > 0) bounceCooldown -= 1;

      conveyorTick += 1;
      // Cinta solo empuja mientras corre un programa (no movimiento libre)
      if (running && player && conveyorTick % 24 === 0) {
        var under = occupiedByObstacle(snap(player.position.x), snap(player.position.z));
        if (under && under.typeId === 'cinta') {
          tryMovePlayer(0, -STEP, null, false);
        }
      }

      for (var i = 0; i < obstacles.length; i++) {
        var o = obstacles[i];
        if (o.typeId === 'moneda') o.mesh.rotation.z += 0.04;
        if (o.typeId === 'portal') o.mesh.rotation.z += 0.03;
      }
      if (player && playerSkinId === 'arcoiris') {
        var hue = (performance.now() * 0.0003) % 1;
        player.material.color.setHSL(hue, 0.85, 0.55);
        player.material.emissive.setHSL((hue + 0.2) % 1, 0.8, 0.35);
      }

      updateCamera();
      renderer.render(scene, camera);
    }

    function screenToGround(clientX, clientY) {
      if (!raycaster || !camera || !ground) return null;
      var rect = canvas.getBoundingClientRect();
      if (!rect.width || !rect.height) return null;
      pointer.x = ((clientX - rect.left) / rect.width) * 2 - 1;
      pointer.y = -((clientY - rect.top) / rect.height) * 2 + 1;
      raycaster.setFromCamera(pointer, camera);
      var hits = raycaster.intersectObject(ground);
      if (!hits.length) return null;
      return { x: hits[0].point.x, z: hits[0].point.z };
    }

    function isTypingTarget(el) {
      if (!el) return false;
      var tag = (el.tagName || '').toLowerCase();
      return tag === 'textarea' || tag === 'input' || !!el.isContentEditable;
    }

    function prismWindowActive() {
      var win = container.closest('.app-window');
      if (!win) return true;
      if (win.classList.contains('minimized')) return false;
      var z = parseInt(win.style.zIndex || '0', 10) || 0;
      var apps = document.querySelectorAll('.app-window:not(.minimized)');
      for (var i = 0; i < apps.length; i++) {
        if (apps[i] === win) continue;
        var oz = parseInt(apps[i].style.zIndex || '0', 10) || 0;
        if (oz > z) return false;
      }
      return true;
    }

    function onKeyDown(e) {
      if (stopped || !ready) return;
      if (isTypingTarget(e.target) && e.key !== 'Escape') {
        // Allow Ctrl+Enter to run from editor
        if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
          e.preventDefault();
          runProgram();
        }
        return;
      }
      if (!prismWindowActive()) return;
      var key = e.key;
      if (key === 'Escape') {
        if (running) { e.preventDefault(); stopProgram(); return; }
        if (selectedTool) {
          e.preventDefault();
          clearTool();
          setStatus('Tool cancelada', 'muted');
        }
        return;
      }
      if (running) return;
      // Movimiento manual inmediato (flechas / WASD). Ejecutar sigue exigiendo d2+d3+d4.
      if (key === 'ArrowUp' || key === 'w' || key === 'W') {
        e.preventDefault();
        moveBy('d2', true);
        return;
      }
      if (key === 'ArrowDown' || key === 's' || key === 'S') {
        e.preventDefault();
        moveBy('d3', true);
        return;
      }
      if (key === 'ArrowRight' || key === 'd' || key === 'D') {
        e.preventDefault();
        moveBy('d4', true);
        return;
      }
      if (key === 'ArrowLeft' || key === 'a' || key === 'A') {
        e.preventDefault();
        moveBy('d5', true);
        return;
      }
      if (key === 'F5' || ((e.ctrlKey || e.metaKey) && key === 'Enter')) {
        e.preventDefault();
        runProgram();
      }
      else if (key === ' ' || key === '1') {
        e.preventDefault();
        ensurePlayer(true);
        try { viewEl.focus(); } catch (err) {}
      }
    }

    container.querySelectorAll('[data-tool]').forEach(function (chip) {
      chip.addEventListener('click', function (e) {
        e.preventDefault();
        selectTool(chip.getAttribute('data-tool'), chip.getAttribute('data-id'));
      });
    });

    btnRun.addEventListener('click', function () { runProgram(); });
    btnStop.addEventListener('click', function () { stopProgram(); });
    btnPlace.addEventListener('click', function () {
      if (running) return;
      ensurePlayer(true);
      try { viewEl.focus(); } catch (e) {}
    });
    btnClear.addEventListener('click', function () {
      stopProgram();
      clearWorld();
      codeEl.value = SAMPLE;
      setStatus('Mundo limpio.', 'muted');
      updateCamera();
      try { viewEl.focus(); } catch (e) {}
    });
    btnCancel.addEventListener('click', function () {
      clearTool();
      setStatus('Tool cancelada', 'muted');
      try { viewEl.focus(); } catch (e) {}
    });

    viewEl.addEventListener('pointerdown', function (e) {
      if (e.button !== 0) return;
      try { viewEl.focus(); } catch (err0) {}
      if (running) return;

      if (selectedTool && selectedTool.kind === 'obstacle' && ready) {
        var g = screenToGround(e.clientX, e.clientY);
        if (g) {
          placeObstacle(selectedTool.id, g.x, g.z, true);
          e.preventDefault();
          return;
        }
        setStatus('Clic sobre el suelo del tablero', 'err');
        return;
      }

      orbitDrag = {
        x: e.clientX,
        y: e.clientY,
        angle: camAngle,
        id: e.pointerId,
        moved: false
      };
      try { viewEl.setPointerCapture(e.pointerId); } catch (err) {}
    });

    viewEl.addEventListener('pointermove', function (e) {
      if (!orbitDrag || e.pointerId !== orbitDrag.id) return;
      var dx = e.clientX - orbitDrag.x;
      var dy = e.clientY - orbitDrag.y;
      if (!orbitDrag.moved && (Math.abs(dx) > 3 || Math.abs(dy) > 3)) {
        orbitDrag.moved = true;
      }
      if (!orbitDrag.moved) return;
      camAngle = orbitDrag.angle - dx * 0.008;
      updateCamera();
    });

    function endOrbit(e) {
      if (!orbitDrag) return;
      if (e && orbitDrag.id != null && e.pointerId !== orbitDrag.id) return;
      orbitDrag = null;
    }
    viewEl.addEventListener('pointerup', endOrbit);
    viewEl.addEventListener('pointercancel', endOrbit);

    window.addEventListener('keydown', onKeyDown, true);

    loadThree().then(function (T) {
      if (stopped) return;
      THREE = T;
      raycaster = new THREE.Raycaster();
      pointer = new THREE.Vector2();

      scene = new THREE.Scene();
      scene.background = new THREE.Color(0x0b1020);
      scene.fog = new THREE.Fog(0x0b1020, 24, 50);

      camera = new THREE.PerspectiveCamera(50, 1, 0.1, 120);
      renderer = new THREE.WebGLRenderer({
        canvas: canvas,
        antialias: true,
        alpha: false,
        powerPreference: 'high-performance'
      });
      renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.75));
      renderer.shadowMap.enabled = true;

      scene.add(new THREE.HemisphereLight(0xb8c6ff, 0x1a2030, 0.9));
      var sun = new THREE.DirectionalLight(0xffffff, 1.05);
      sun.position.set(8, 14, 6);
      sun.castShadow = true;
      scene.add(sun);
      scene.add(new THREE.AmbientLight(0x405080, 0.35));

      scene.add(new THREE.GridHelper(GRID, GRID, 0x4a5a9a, 0x1c2438));
      ground = new THREE.Mesh(
        new THREE.PlaneGeometry(GRID, GRID),
        new THREE.MeshStandardMaterial({ color: 0x12182a, roughness: 0.92, metalness: 0.05 })
      );
      ground.rotation.x = -Math.PI / 2;
      ground.receiveShadow = true;
      scene.add(ground);

      ensurePlayer(true);
      updateCamera();

      function kickResize() {
        resize();
        requestAnimationFrame(function () {
          resize();
          requestAnimationFrame(resize);
        });
      }
      kickResize();
      if (typeof ResizeObserver === 'function') {
        ro = new ResizeObserver(function () { resize(); });
        ro.observe(viewEl);
      }
      window.addEventListener('resize', resize);

      if (overlay) overlay.classList.add('hidden');
      ready = true;
      setStatus('Listo. Flechas/WASD mueven ya. Ejecutar exige d2, d3 y d4 (si falta alguno: error).', 'ok');
      animate();
      try { viewEl.focus(); } catch (e) {}
    }).catch(function (err) {
      ready = false;
      if (overlay) overlay.textContent = 'Error 3D: ' + (err && err.message ? err.message : 'fallo');
      setStatus('No se pudo iniciar el motor 3D.', 'err');
    });

    return function cleanup() {
      stopped = true;
      ready = false;
      stopProgram();
      if (animId) cancelAnimationFrame(animId);
      try { window.removeEventListener('keydown', onKeyDown, true); } catch (e0) {}
      try { window.removeEventListener('resize', resize); } catch (e1) {}
      if (ro) try { ro.disconnect(); } catch (e2) {}
      clearWorld();
      if (renderer) {
        try { renderer.dispose(); } catch (e3) {}
        renderer = null;
      }
      scene = null;
      camera = null;
      ground = null;
      THREE = null;
    };
  }

  window.renderPrismApp = renderPrismApp;
})();
