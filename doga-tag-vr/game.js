// Doga Tag VR — gorilla-style tag in the Doganiero forest (WebXR + desktop).
import * as THREE from 'three';
import { VRButton } from './lib/VRButton.js';

const params = new URLSearchParams(location.search);
const AUTOSTART = params.has('autostart');
const VIEW = params.get('view') || '';
const FREEZE = params.has('freeze');

// ---------- seeded random ----------
let seed = Number(params.get('seed') || 1234);
const rand = () => { seed = (seed * 16807) % 2147483647; return (seed - 1) / 2147483646; };

// ---------- renderer / scene ----------
const renderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true });
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.setSize(innerWidth, innerHeight);
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.xr.enabled = true;
document.body.appendChild(renderer.domElement);

const scene = new THREE.Scene();
const SKY = new THREE.Color(0x9fd3e6);
scene.background = SKY;
scene.fog = new THREE.Fog(0xa9d6c4, 25, 95);

const camera = new THREE.PerspectiveCamera(75, innerWidth / innerHeight, 0.05, 300);
const rig = new THREE.Group();              // player body (feet position)
rig.add(camera);
scene.add(rig);
const EYE = 1.35;
camera.position.set(0, EYE, 0);

scene.add(new THREE.HemisphereLight(0xdff4ff, 0x3a5a2a, 1.1));
const sun = new THREE.DirectionalLight(0xfff2d6, 2.2);
sun.position.set(30, 50, 20);
sun.castShadow = true;
sun.shadow.mapSize.set(2048, 2048);
Object.assign(sun.shadow.camera, { left: -45, right: 45, top: 45, bottom: -45, near: 1, far: 140 });
scene.add(sun);

// ---------- terrain ----------
const WORLD_R = 58;
const AREA_R = 15; // Doganiero clearing radius
// Ciudad Doganiero (north of the clearing) — flat concrete zone
const CITY = { minX: -15, maxX: 15, minZ: -52, maxZ: -23 };
function inCity(x, z) { return x > CITY.minX && x < CITY.maxX && z > CITY.minZ && z < CITY.maxZ; }
function heightAt(x, z) {
  if (inCity(x, z) || (Math.abs(x) < 3.2 && z < -15 && z > CITY.maxZ)) return 0; // plaza + north path
  const d = Math.hypot(x, z);
  const hills = 0.9 * Math.sin(x * 0.11) * Math.cos(z * 0.09) + 0.5 * Math.sin((x + z) * 0.21);
  const blend = THREE.MathUtils.smoothstep(d, AREA_R, AREA_R + 8);
  const rim = THREE.MathUtils.smoothstep(d, WORLD_R - 6, WORLD_R + 4) * 9;
  return hills * blend + rim;
}
{
  const g = new THREE.PlaneGeometry(140, 140, 140, 140);
  g.rotateX(-Math.PI / 2);
  const pos = g.attributes.position, col = [];
  const c1 = new THREE.Color(0x4f8a3a), c2 = new THREE.Color(0x6aa548), c3 = new THREE.Color(0x8a7a52), tmp = new THREE.Color();
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i), z = pos.getZ(i);
    pos.setY(i, heightAt(x, z));
    const d = Math.hypot(x, z);
    tmp.copy(c1).lerp(c2, 0.5 + 0.5 * Math.sin(x * 0.7 + z * 0.4) * Math.cos(z * 0.5));
    if (d < AREA_R - 2) tmp.lerp(c3, 0.35 * (1 - d / AREA_R));  // trodden ground in the clearing
    if (inCity(x, z) || (Math.abs(x) < 3.2 && z < -15 && z > CITY.maxZ)) tmp.setHex(0x6e7378);
    col.push(tmp.r, tmp.g, tmp.b);
  }
  g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  g.computeVertexNormals();
  const ground = new THREE.Mesh(g, new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.95 }));
  ground.receiveShadow = true;
  scene.add(ground);
}

// ---------- colliders ----------
const boxes = [];      // {min:Vector3,max:Vector3}
const trunks = [];     // {x,z,r,h}
function addBox(mesh, surface = 'rock') {
  mesh.updateMatrixWorld(true);
  const b = new THREE.Box3().setFromObject(mesh);
  boxes.push({ min: b.min.clone(), max: b.max.clone(), surface });
  mesh.castShadow = mesh.receiveShadow = true;
}

// ---------- forest ----------
const treeData = [];
while (treeData.length < 170) {
  const a = rand() * Math.PI * 2, d = AREA_R + 3 + rand() * (WORLD_R - AREA_R - 3);
  const x = Math.cos(a) * d, z = Math.sin(a) * d;
  if (treeData.some(t => Math.hypot(t.x - x, t.z - z) < 3.2)) continue;
  // keep a path open toward the spawn (south)
  if (z > AREA_R && Math.abs(x) < 3) continue;
  if (inCity(x, z) || (Math.abs(x) < 4 && z < -14 && z > CITY.minZ)) continue;
  treeData.push({ x, z, s: 0.8 + rand() * 0.8, t: rand() });
}
{
  const trunkGeo = new THREE.CylinderGeometry(0.28, 0.42, 1, 8); trunkGeo.translate(0, 0.5, 0);
  const coneGeo = new THREE.ConeGeometry(1, 1, 9); coneGeo.translate(0, 0.5, 0);
  const trunkMat = new THREE.MeshStandardMaterial({ color: 0x6b4a2e, roughness: 1 });
  const leafMat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.9, flatShading: true });
  const trunkIM = new THREE.InstancedMesh(trunkGeo, trunkMat, treeData.length);
  const leafIM = new THREE.InstancedMesh(coneGeo, leafMat, treeData.length * 3);
  const m = new THREE.Matrix4(), q = new THREE.Quaternion(), s = new THREE.Vector3(), p = new THREE.Vector3(), c = new THREE.Color();
  let li = 0;
  treeData.forEach((t, i) => {
    const y = heightAt(t.x, t.z) - 0.2, h = 4.5 * t.s;
    m.compose(p.set(t.x, y, t.z), q.identity(), s.set(t.s, h, t.s)); trunkIM.setMatrixAt(i, m);
    trunks.push({ x: t.x, z: t.z, r: 0.38 * t.s, h: y + h });
    for (let k = 0; k < 3; k++) {
      const r = (2.4 - k * 0.6) * t.s, ch = 2.6 * t.s;
      q.setFromAxisAngle(new THREE.Vector3(0, 1, 0), t.t * 6 + k);
      m.compose(p.set(t.x, y + h * 0.45 + k * 1.35 * t.s, t.z), q, s.set(r, ch, r));
      leafIM.setMatrixAt(li, m);
      leafIM.setColorAt(li++, c.setHSL(0.30 + t.t * 0.07, 0.45, 0.22 + k * 0.05 + t.t * 0.05));
    }
  });
  trunkIM.castShadow = leafIM.castShadow = true; trunkIM.receiveShadow = true;
  scene.add(trunkIM, leafIM);
  // rocks & logs to climb on
  const rockMat = new THREE.MeshStandardMaterial({ color: 0x8b8f86, roughness: 1, flatShading: true });
  for (let i = 0; i < 26; i++) {
    const a = rand() * Math.PI * 2, d = AREA_R + 4 + rand() * 34;
    const x = Math.cos(a) * d, z = Math.sin(a) * d;
    if (treeData.some(t => Math.hypot(t.x - x, t.z - z) < 2.2)) continue;
    if (inCity(x, z) || (Math.abs(x) < 4 && z < -14 && z > CITY.minZ)) continue;
    const w = 1.2 + rand() * 1.8, h = 0.6 + rand() * 1.4;
    const rock = new THREE.Mesh(new THREE.BoxGeometry(w, h, w * (0.7 + rand() * 0.5)), rockMat);
    rock.position.set(x, heightAt(x, z) + h / 2 - 0.15, z);
    rock.rotation.y = rand() * 3;
    scene.add(rock); addBox(rock);
  }
  // fireflies / pollen
  const fp = [];
  for (let i = 0; i < 300; i++) fp.push((rand() - 0.5) * 110, 0.5 + rand() * 6, (rand() - 0.5) * 110);
  const fg = new THREE.BufferGeometry(); fg.setAttribute('position', new THREE.Float32BufferAttribute(fp, 3));
  scene.add(new THREE.Points(fg, new THREE.PointsMaterial({ color: 0xf8ffb0, size: 0.08, transparent: true, opacity: 0.8 })));
}

// ---------- canvas text helper ----------
function textTexture(lines, { w = 512, h = 256, bg = '#2a6b3f', fg = '#fffdf9', font = 'bold 64px system-ui', border = '#c8ec6b' } = {}) {
  const cv = document.createElement('canvas'); cv.width = w; cv.height = h;
  const ctx = cv.getContext('2d');
  const draw = (ls) => {
    ctx.clearRect(0, 0, w, h);
    if (bg) { ctx.fillStyle = bg; ctx.beginPath(); ctx.roundRect(4, 4, w - 8, h - 8, 28); ctx.fill(); }
    if (border) { ctx.lineWidth = 8; ctx.strokeStyle = border; ctx.stroke(); }
    ctx.fillStyle = fg; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    const lh = h / (ls.length + 0.6);
    ls.forEach((l, i) => {
      ctx.font = typeof l === 'object' ? l.font : font;
      ctx.fillStyle = typeof l === 'object' && l.color ? l.color : fg;
      ctx.fillText(typeof l === 'object' ? l.text : l, w / 2, lh * (i + 0.8));
    });
  };
  draw(lines);
  const tex = new THREE.CanvasTexture(cv); tex.colorSpace = THREE.SRGBColorSpace; tex.anisotropy = 4;
  tex.redraw = (ls) => { draw(ls); tex.needsUpdate = true; };
  return tex;
}

// ---------- Doganiero area ----------
const DOGA_GREEN = 0x2a6b3f, DOGA_LIME = 0xc8ec6b, DOGA_CREAM = 0xf6f3ec, DOGA_CORAL = 0xef5b3a;
let scoreboardTex;
{
  const wood = new THREE.MeshStandardMaterial({ color: 0x9a6b41, roughness: 0.9 });
  const green = new THREE.MeshStandardMaterial({ color: DOGA_GREEN, roughness: 0.8 });
  const lime = new THREE.MeshStandardMaterial({ color: DOGA_LIME, roughness: 0.7 });
  const cream = new THREE.MeshStandardMaterial({ color: DOGA_CREAM, roughness: 0.8 });
  const coral = new THREE.MeshStandardMaterial({ color: DOGA_CORAL, roughness: 0.7 });

  // central treehouse platform on four posts + stairs
  const plat = new THREE.Mesh(new THREE.BoxGeometry(9, 0.4, 9), wood); plat.position.set(0, 3.2, -4); scene.add(plat); addBox(plat, 'wood');
  for (const [x, z] of [[-4, -8], [4, -8], [-4, 0], [4, 0]]) {
    const post = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.35, 3.2, 8), wood);
    post.position.set(x, 1.6, z); scene.add(post); post.castShadow = true;
    trunks.push({ x, z, r: 0.35, h: 3.2 });
  }
  for (let i = 0; i < 6; i++) {
    const st = new THREE.Mesh(new THREE.BoxGeometry(2.2, 0.5, 0.9), i % 2 ? lime : green);
    st.position.set(5.6 + i * 0.0, 0.25 + i * 0.5, 2.0 - i * 0.9);
    st.scale.y = 1; st.position.x = 5.6; st.position.z = 1.6 - i * 0.95; st.position.y = 0.25 + i * 0.5;
    scene.add(st); addBox(st, 'wood');
  }
  // railing on the platform (low, gorilla-climbable)
  for (const [x, z, w, d] of [[0, -8.4, 9, 0.25], [-4.4, -4, 0.25, 9]]) {
    const r = new THREE.Mesh(new THREE.BoxGeometry(w, 0.7, d), green); r.position.set(x, 3.75, z); scene.add(r); addBox(r, 'wood');
  }
  // hut on the platform
  const hut = new THREE.Mesh(new THREE.BoxGeometry(4, 2.4, 3.4), cream); hut.position.set(-1.4, 4.6, -5.8); scene.add(hut); addBox(hut, 'wood');
  const roof = new THREE.Mesh(new THREE.ConeGeometry(3.3, 1.6, 4), coral); roof.position.set(-1.4, 6.6, -5.8); roof.rotation.y = Math.PI / 4; roof.castShadow = true; scene.add(roof);
  // big sign arch at the entrance (south)
  for (const x of [-3.2, 3.2]) {
    const p = new THREE.Mesh(new THREE.BoxGeometry(0.5, 4.6, 0.5), green); p.position.set(x, 2.3, 11); scene.add(p); addBox(p);
  }
  const signTex = textTexture([{ text: 'DOGANIERO', font: 'bold 92px system-ui' }, { text: 'Ideas que dejan huella', font: 'italic 40px system-ui', color: '#c8ec6b' }], { w: 1024, h: 256 });
  const sign = new THREE.Mesh(new THREE.BoxGeometry(7.4, 1.6, 0.3), [green, green, green, green, new THREE.MeshStandardMaterial({ map: signTex }), new THREE.MeshStandardMaterial({ map: signTex })]);
  sign.position.set(0, 4.9, 11); scene.add(sign); sign.castShadow = true;
  // Doganiero logo billboards (hut + entrance arch)
  new THREE.TextureLoader().load('./assets/doganiero-logo.png', (t) => {
    t.colorSpace = THREE.SRGBColorSpace;
    const mat = new THREE.MeshBasicMaterial({ map: t, transparent: true, side: THREE.DoubleSide, alphaTest: 0.05, depthWrite: false });
    // full logo aspect ~966x696
    const logo = new THREE.Mesh(new THREE.PlaneGeometry(3.6, 2.6), mat);
    logo.position.set(-1.4, 4.75, -4.05); scene.add(logo); // hut front
    const logo2 = logo.clone(); logo2.position.set(0, 7.05, 11); logo2.scale.setScalar(0.85); scene.add(logo2); // above arch
  });
  // scoreboard
  scoreboardTex = textTexture(['Doga Tag'], { w: 512, h: 512, font: 'bold 40px system-ui' });
  const board = new THREE.Mesh(new THREE.PlaneGeometry(3.2, 3.2), new THREE.MeshBasicMaterial({ map: scoreboardTex }));
  board.position.set(-8.5, 2.6, 2); board.rotation.y = Math.PI / 3; scene.add(board);
  const boardPost = new THREE.Mesh(new THREE.BoxGeometry(0.25, 2.6, 0.25), wood); boardPost.position.set(-8.6, 0.6, 1.9); scene.add(boardPost);
  // climbing blocks around the clearing (Doganiero colours)
  const blockMats = [green, lime, coral, cream];
  [[-9, -6, 1.2], [-11, -2, 2.0], [9, -9, 1.5], [11, -4, 2.6], [8, 7, 1.0], [-7, 8, 1.4], [0, -12, 2.2]].forEach(([x, z, h], i) => {
    const b = new THREE.Mesh(new THREE.BoxGeometry(2, h, 2), blockMats[i % 4]); b.position.set(x, h / 2, z); scene.add(b); addBox(b);
  });
  // ring of lime stones marking the area
  const stoneGeo = new THREE.DodecahedronGeometry(0.35);
  for (let i = 0; i < 40; i++) {
    const a = i / 40 * Math.PI * 2; if (Math.abs(Math.sin(a) - 1) < 0.02) continue;
    const st = new THREE.Mesh(stoneGeo, i % 2 ? lime : cream);
    st.position.set(Math.cos(a) * AREA_R, 0.15, Math.sin(a) * AREA_R); st.castShadow = true; scene.add(st);
  }
}

// ---------- Ciudad Doganiero (original low-poly town) ----------
const CITY_SPOTS = []; // collectible / bot landmarks (rooftops + plaza)
{
  const concrete = new THREE.MeshStandardMaterial({ color: 0x7a8088, roughness: 0.92, flatShading: true });
  const asphalt = new THREE.MeshStandardMaterial({ color: 0x3a3e44, roughness: 0.95, flatShading: true });
  const brick = new THREE.MeshStandardMaterial({ color: 0x8a5a48, roughness: 0.9, flatShading: true });
  const plaster = new THREE.MeshStandardMaterial({ color: 0xc9c3b4, roughness: 0.88, flatShading: true });
  const plaster2 = new THREE.MeshStandardMaterial({ color: 0xa8b4c0, roughness: 0.88, flatShading: true });
  const roofMat = new THREE.MeshStandardMaterial({ color: 0x4a5560, roughness: 0.85, flatShading: true });
  const awningR = new THREE.MeshStandardMaterial({ color: 0xef5b3a, roughness: 0.7 });
  const awningG = new THREE.MeshStandardMaterial({ color: 0x2a6b3f, roughness: 0.7 });
  const awningB = new THREE.MeshStandardMaterial({ color: 0x2a6aa8, roughness: 0.7 });
  const metalM = new THREE.MeshStandardMaterial({ color: 0x6e7780, metalness: 0.55, roughness: 0.45, flatShading: true });
  const glassM = new THREE.MeshStandardMaterial({ color: 0x87b8d8, roughness: 0.35, metalness: 0.2, flatShading: true });
  const lampM = new THREE.MeshStandardMaterial({ color: 0x2a2e34, roughness: 0.8, flatShading: true });
  const glowM = new THREE.MeshStandardMaterial({ color: 0xfff2c4, emissive: 0xffe08a, emissiveIntensity: 0.85, flatShading: true });
  const crateM = new THREE.MeshStandardMaterial({ color: 0x9a6b41, roughness: 0.9, flatShading: true });
  const dumpM = new THREE.MeshStandardMaterial({ color: 0x3d6b3a, metalness: 0.4, roughness: 0.55, flatShading: true });

  // Plaza slab + ring road
  const plaza = new THREE.Mesh(new THREE.BoxGeometry(26, 0.25, 24), concrete);
  plaza.position.set(0, -0.12, -37); scene.add(plaza); addBox(plaza, 'concrete');
  const road = new THREE.Mesh(new THREE.BoxGeometry(8, 0.12, 28), asphalt);
  road.position.set(0, 0.02, -36); scene.add(road); addBox(road, 'concrete');

  // Path / tunnel from clearing to city (south gate of city)
  const path = new THREE.Mesh(new THREE.BoxGeometry(5.2, 0.18, 10), concrete);
  path.position.set(0, -0.05, -18.5); scene.add(path); addBox(path, 'concrete');
  for (const x of [-2.7, 2.7]) {
    const wall = new THREE.Mesh(new THREE.BoxGeometry(0.7, 3.2, 9), plaster); wall.position.set(x, 1.5, -18.5); scene.add(wall); addBox(wall, 'concrete');
  }
  const tunnelRoof = new THREE.Mesh(new THREE.BoxGeometry(6.2, 0.5, 9), concrete); tunnelRoof.position.set(0, 3.3, -18.5); scene.add(tunnelRoof); addBox(tunnelRoof, 'concrete');
  // Portal sign
  const gatePosts = [-3.4, 3.4].map(x => { const p = new THREE.Mesh(new THREE.BoxGeometry(0.55, 5.2, 0.55), brick); p.position.set(x, 2.5, -23.2); scene.add(p); addBox(p, 'concrete'); return p; });
  const gateBeam = new THREE.Mesh(new THREE.BoxGeometry(7.6, 1.3, 0.5), brick); gateBeam.position.set(0, 5.0, -23.2); scene.add(gateBeam); addBox(gateBeam, 'concrete');
  const gateTex = textTexture([{ text: 'CIUDAD DOGANIERO', font: 'bold 54px system-ui' }, { text: 'Techos · Plaza · Parkour', font: '32px system-ui', color: '#c8ec6b' }], { w: 1024, h: 220 });
  const gateSign = new THREE.Mesh(new THREE.PlaneGeometry(6.8, 1.15), new THREE.MeshBasicMaterial({ map: gateTex }));
  gateSign.position.set(0, 5.0, -22.9); scene.add(gateSign);
  new THREE.TextureLoader().load('./assets/doganiero-logo.png', (t) => {
    t.colorSpace = THREE.SRGBColorSpace;
    const logo = new THREE.Mesh(new THREE.PlaneGeometry(2.2, 1.6), new THREE.MeshBasicMaterial({ map: t, transparent: true, alphaTest: 0.05, depthWrite: false }));
    logo.position.set(0, 6.5, -22.9); scene.add(logo);
  });

  function building(x, z, w, d, floors, mat, roofH = 0.35) {
    const h = floors * 2.6;
    const body = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
    body.position.set(x, h / 2, z); scene.add(body); addBox(body, 'concrete');
    // climbable ledge belt mid-floor
    if (floors >= 2) {
      const ledge = new THREE.Mesh(new THREE.BoxGeometry(w + 0.5, 0.28, d + 0.5), concrete);
      ledge.position.set(x, 2.55, z); scene.add(ledge); addBox(ledge, 'concrete');
    }
    if (floors >= 3) {
      const ledge2 = new THREE.Mesh(new THREE.BoxGeometry(w + 0.45, 0.28, d + 0.45), concrete);
      ledge2.position.set(x, 5.15, z); scene.add(ledge2); addBox(ledge2, 'concrete');
    }
    const roof = new THREE.Mesh(new THREE.BoxGeometry(w + 0.35, roofH, d + 0.35), roofMat);
    roof.position.set(x, h + roofH / 2, z); scene.add(roof); addBox(roof, 'concrete');
    // parapet for parkour
    for (const [dx, dz, ww, dd] of [[0, d / 2 + 0.12, w + 0.3, 0.22], [0, -d / 2 - 0.12, w + 0.3, 0.22], [w / 2 + 0.12, 0, 0.22, d + 0.3], [-w / 2 - 0.12, 0, 0.22, d + 0.3]]) {
      const para = new THREE.Mesh(new THREE.BoxGeometry(ww, 0.55, dd), roofMat);
      para.position.set(x + dx, h + roofH + 0.2, z + dz); scene.add(para); addBox(para, 'concrete');
    }
    CITY_SPOTS.push(new THREE.Vector3(x, h + roofH, z));
    // simple window strips (visual only, cheap)
    for (let f = 0; f < floors; f++) {
      for (const sx of [-1, 1]) {
        const win = new THREE.Mesh(new THREE.BoxGeometry(w * 0.55, 0.7, 0.08), glassM);
        win.position.set(x, 1.2 + f * 2.6, z + sx * (d / 2 + 0.04)); scene.add(win);
      }
    }
    return h + roofH;
  }

  // Ring of buildings around plaza
  building(-9.5, -30, 5.5, 5.2, 2, plaster);
  building(9.2, -30.5, 5.2, 4.8, 3, plaster2);
  building(-10, -43, 6, 5, 2, brick);
  building(9.5, -44, 5.5, 5.5, 2, plaster);
  building(-9, -37, 4.5, 4.2, 3, plaster2);
  building(10.2, -37, 4.8, 4.5, 2, brick);
  // North row
  building(-4, -48, 5, 4.2, 2, plaster);
  building(4.5, -48.2, 5.2, 4, 3, plaster2);

  // Clock tower (climbable landmark)
  const towerH = building(0, -37, 3.6, 3.6, 4, brick, 0.5);
  const clockFace = textTexture([{ text: '🕒', font: '72px system-ui' }, { text: '12:00', font: 'bold 48px system-ui', color: '#c8ec6b' }], { w: 256, h: 256, bg: '#2a6b3f' });
  for (const [dx, dz, ry] of [[0, 1.85, 0], [0, -1.85, Math.PI], [1.85, 0, Math.PI / 2], [-1.85, 0, -Math.PI / 2]]) {
    const face = new THREE.Mesh(new THREE.PlaneGeometry(1.6, 1.6), new THREE.MeshBasicMaterial({ map: clockFace }));
    face.position.set(dx, 9.2, -37 + dz); face.rotation.y = ry; scene.add(face);
  }
  const spire = new THREE.Mesh(new THREE.ConeGeometry(1.2, 2.2, 4), roofMat);
  spire.position.set(0, towerH + 1.2, -37); spire.rotation.y = Math.PI / 4; scene.add(spire);

  // Shops with awnings along plaza east/west
  function shopFront(x, z, awningMat, withLogo = false) {
    const base = new THREE.Mesh(new THREE.BoxGeometry(4.2, 2.4, 3.2), plaster); base.position.set(x, 1.2, z); scene.add(base); addBox(base, 'concrete');
    const aw = new THREE.Mesh(new THREE.BoxGeometry(4.4, 0.12, 1.5), awningMat); aw.position.set(x, 2.55, z + 1.3); aw.rotation.x = 0.25; scene.add(aw);
    const roof = new THREE.Mesh(new THREE.BoxGeometry(4.4, 0.3, 3.4), roofMat); roof.position.set(x, 2.7, z); scene.add(roof); addBox(roof, 'concrete');
    CITY_SPOTS.push(new THREE.Vector3(x, 2.85, z));
    if (withLogo) {
      new THREE.TextureLoader().load('./assets/doganiero-logo.png', (t) => {
        t.colorSpace = THREE.SRGBColorSpace;
        const logo = new THREE.Mesh(new THREE.PlaneGeometry(1.8, 1.3), new THREE.MeshBasicMaterial({ map: t, transparent: true, alphaTest: 0.05, depthWrite: false }));
        logo.position.set(x, 3.6, z + 1.65); scene.add(logo);
      });
      const sign = new THREE.Mesh(new THREE.PlaneGeometry(3.2, 0.5), new THREE.MeshBasicMaterial({ map: textTexture([{ text: 'DOGANIERO', font: 'bold 56px system-ui' }], { w: 512, h: 128 }) }));
      sign.position.set(x, 2.2, z + 1.62); scene.add(sign);
    }
  }
  shopFront(-6.5, -33.5, awningR, true);
  shopFront(6.5, -33.5, awningG, false);
  shopFront(-6.5, -40.5, awningB, false);

  // Street lamps (shared geo via InstancedMesh)
  const poleGeo = new THREE.CylinderGeometry(0.08, 0.1, 3.2, 6); poleGeo.translate(0, 1.6, 0);
  const headGeo = new THREE.BoxGeometry(0.55, 0.15, 0.35);
  const bulbGeo = new THREE.SphereGeometry(0.12, 6, 6);
  const lampPts = [[-4, -28], [4, -28], [-4, -37], [4, -37], [-4, -46], [4, -46], [-12, -34], [12, -34], [0, -25]];
  const poleIM = new THREE.InstancedMesh(poleGeo, lampM, lampPts.length);
  const headIM = new THREE.InstancedMesh(headGeo, metalM, lampPts.length);
  const bulbIM = new THREE.InstancedMesh(bulbGeo, glowM, lampPts.length);
  const m4 = new THREE.Matrix4(), q0 = new THREE.Quaternion(), s1 = new THREE.Vector3(1, 1, 1), pp = new THREE.Vector3();
  lampPts.forEach(([lx, lz], i) => {
    m4.compose(pp.set(lx, 0, lz), q0, s1); poleIM.setMatrixAt(i, m4);
    m4.compose(pp.set(lx, 3.25, lz), q0, s1); headIM.setMatrixAt(i, m4);
    m4.compose(pp.set(lx, 3.05, lz + 0.05), q0, s1); bulbIM.setMatrixAt(i, m4);
    // thin collision for poles
    const hit = new THREE.Mesh(new THREE.BoxGeometry(0.35, 3.2, 0.35), lampM);
    hit.position.set(lx, 1.6, lz); hit.visible = false; scene.add(hit); addBox(hit, 'metal');
  });
  scene.add(poleIM, headIM, bulbIM);

  // Crates + dumpsters for parkour
  const parkour = [
    [-2.5, -26.5, 1.1, 1.1, 1.0, 'crate'], [2.2, -27, 1.2, 1.0, 1.3, 'crate'], [1.8, -26.2, 1.0, 1.0, 0.8, 'crate'],
    [-12, -31, 1.6, 1.1, 1.3, 'dump'], [12, -31.5, 1.6, 1.1, 1.3, 'dump'],
    [-3, -41, 1.1, 1.1, 1.0, 'crate'], [3.2, -41.5, 1.2, 1.0, 1.4, 'crate'], [3.0, -40.8, 1.0, 1.0, 0.7, 'crate'],
    [-11.5, -46, 1.6, 1.1, 1.3, 'dump'], [11.5, -46.5, 1.6, 1.1, 1.3, 'dump'],
    [0.5, -29.5, 1.0, 1.0, 1.1, 'crate'], [-1.2, -44, 1.1, 1.0, 1.2, 'crate'],
  ];
  for (const [x, z, w, d, h, kind] of parkour) {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), kind === 'dump' ? dumpM : crateM);
    mesh.position.set(x, h / 2, z); scene.add(mesh); addBox(mesh, kind === 'dump' ? 'metal' : 'wood');
    CITY_SPOTS.push(new THREE.Vector3(x, h, z));
  }
  // Climbable wall steps on tower base
  for (let i = 0; i < 5; i++) {
    const step = new THREE.Mesh(new THREE.BoxGeometry(1.4 - i * 0.1, 0.35, 1.1), concrete);
    step.position.set(2.4 + i * 0.15, 0.2 + i * 0.55, -35.2); scene.add(step); addBox(step, 'concrete');
  }

  // Mini "Rincón Doganiero" cosmetics corner (visual stand + uses same shopButtons via shared SHOP? keep separate deco + bones)
  const kiosk = new THREE.Mesh(new THREE.BoxGeometry(3.2, 1.1, 1.6), new THREE.MeshStandardMaterial({ color: 0x2a6b3f }));
  kiosk.position.set(0, 0.55, -29.5); scene.add(kiosk); addBox(kiosk, 'wood');
  const kioskSign = new THREE.Mesh(new THREE.PlaneGeometry(2.8, 0.55), new THREE.MeshBasicMaterial({ map: textTexture([{ text: 'RINCÓN DOGANIERO', font: 'bold 48px system-ui' }, { text: 'Visita la Tienda del claro →', font: '28px system-ui', color: '#c8ec6b' }], { w: 768, h: 160 }) }));
  kioskSign.position.set(0, 1.5, -28.65); scene.add(kioskSign);
  CITY_SPOTS.push(new THREE.Vector3(0, 1.2, -29.5));

  // Plaza fountain (low, climbable rim)
  const rim = new THREE.Mesh(new THREE.CylinderGeometry(2.4, 2.6, 0.55, 12), concrete);
  rim.position.set(0, 0.28, -37); scene.add(rim); addBox(rim, 'concrete');
  const water = new THREE.Mesh(new THREE.CylinderGeometry(1.8, 1.8, 0.2, 12), new THREE.MeshStandardMaterial({ color: 0x4aa7d8, transparent: true, opacity: 0.7 }));
  water.position.set(0, 0.35, -37); scene.add(water);
}

// ---------- physics helpers ----------
const GRAV = 13;
function supportHeight(x, z, y, rad = 0.3) {
  // highest walkable surface under (x,z) not above y + step
  let h = heightAt(x, z);
  for (const b of boxes) {
    if (x > b.min.x - rad && x < b.max.x + rad && z > b.min.z - rad && z < b.max.z + rad && b.max.y <= y + 0.55) h = Math.max(h, b.max.y);
  }
  return h;
}
function pushOut(p, rad, height) {
  // horizontal collision against trunks and boxes
  for (const t of trunks) {
    if (p.y > t.h) continue;
    const dx = p.x - t.x, dz = p.z - t.z, d = Math.hypot(dx, dz), m = t.r + rad;
    if (d < m && d > 1e-5) { p.x = t.x + dx / d * m; p.z = t.z + dz / d * m; }
  }
  for (const b of boxes) {
    if (p.y + height < b.min.y || p.y >= b.max.y - 0.5) continue;
    const ex = [b.min.x - rad, b.max.x + rad, b.min.z - rad, b.max.z + rad];
    if (p.x > ex[0] && p.x < ex[1] && p.z > ex[2] && p.z < ex[3]) {
      const o = [p.x - ex[0], ex[1] - p.x, p.z - ex[2], ex[3] - p.z];
      const k = o.indexOf(Math.min(...o));
      if (k === 0) p.x = ex[0]; else if (k === 1) p.x = ex[1]; else if (k === 2) p.z = ex[2]; else p.z = ex[3];
    }
  }
  const d = Math.hypot(p.x, p.z);
  if (d > WORLD_R - 3) { p.x *= (WORLD_R - 3) / d; p.z *= (WORLD_R - 3) / d; }
}
function insideSurface(p) {
  // returns surface point if p penetrates ground/box/trunk, else null
  const gh = heightAt(p.x, p.z);
  if (p.y < gh + 0.02) return new THREE.Vector3(p.x, gh + 0.02, p.z);
  for (const b of boxes) {
    if (p.x > b.min.x && p.x < b.max.x && p.y > b.min.y && p.y < b.max.y + 0.02 && p.z > b.min.z && p.z < b.max.z) {
      const o = [p.x - b.min.x, b.max.x - p.x, p.y - b.min.y, b.max.y + 0.02 - p.y, p.z - b.min.z, b.max.z - p.z];
      const k = o.indexOf(Math.min(...o)), s = p.clone();
      [() => s.x = b.min.x, () => s.x = b.max.x, () => s.y = b.min.y, () => s.y = b.max.y + 0.02, () => s.z = b.min.z, () => s.z = b.max.z][k]();
      return s;
    }
  }
  for (const t of trunks) {
    const dx = p.x - t.x, dz = p.z - t.z, d = Math.hypot(dx, dz);
    if (d < t.r + 0.05 && p.y < t.h && d > 1e-5) return new THREE.Vector3(t.x + dx / d * (t.r + 0.05), p.y, t.z + dz / d * (t.r + 0.05));
  }
  return null;
}

// ---------- gorilla model (bots) ----------
const BOT_NAMES = ['Dogabot', 'Musgo', 'Bellota', 'Pino', 'Kiwi', 'Trufa'];
// Low-poly faceted gorilla avatar (procedural, flat-shaded).
const BOT_COLORS = [0x262c3a, 0x2f3a5c, 0x2e4a36, 0x3a2f2a, 0x3b2f4f, 0x30363f]; // dark charcoal/navy variants
const IT_COLOR = new THREE.Color(0xff3b2f);
const furTex = (() => {
  // mottled greyscale texture; the material colour tints it dark
  const cv = document.createElement('canvas'); cv.width = cv.height = 128;
  const c = cv.getContext('2d'); c.fillStyle = '#e6e6e6'; c.fillRect(0, 0, 128, 128);
  for (let i = 0; i < 260; i++) {
    const v = 170 + Math.floor(rand() * 85), r = 3 + rand() * 12;
    c.fillStyle = `rgba(${v},${v},${v + 6},0.55)`; c.beginPath(); c.arc(rand() * 128, rand() * 128, r, 0, 7); c.fill();
  }
  const t = new THREE.CanvasTexture(cv); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.colorSpace = THREE.SRGBColorSpace; return t;
})();
const badgeTex = (() => {
  // Placeholder until doganiero-icon.png loads (blue square)
  const cv = document.createElement('canvas'); cv.width = cv.height = 128;
  const c = cv.getContext('2d');
  c.clearRect(0, 0, 128, 128);
  c.fillStyle = '#1a6fd4'; c.font = 'bold 54px system-ui'; c.textAlign = 'center'; c.textBaseline = 'middle';
  c.fillText('</>', 64, 70);
  const t = new THREE.CanvasTexture(cv); t.colorSpace = THREE.SRGBColorSpace; return t;
})();
const heartGeo = (() => {
  // heart-shaped face mask (point at the bottom, two lobes over the eyes)
  const s = new THREE.Shape();
  s.moveTo(0, -0.3);
  s.bezierCurveTo(0.2, -0.17, 0.3, -0.02, 0.27, 0.1);
  s.bezierCurveTo(0.24, 0.22, 0.07, 0.24, 0, 0.12);
  s.bezierCurveTo(-0.07, 0.24, -0.24, 0.22, -0.27, 0.1);
  s.bezierCurveTo(-0.3, -0.02, -0.2, -0.17, 0, -0.3);
  return new THREE.ExtrudeGeometry(s, { depth: 0.05, bevelEnabled: true, bevelThickness: 0.02, bevelSize: 0.015, bevelSegments: 1, curveSegments: 5 });
})();
const SHARED = {
  grey: new THREE.MeshStandardMaterial({ color: 0xb9bdc4, roughness: 0.85, flatShading: true }),
  snout: new THREE.MeshStandardMaterial({ color: 0x8d929b, roughness: 0.8, flatShading: true }),
  white: new THREE.MeshBasicMaterial({ color: 0xf4f4f4 }),
  black: new THREE.MeshBasicMaterial({ color: 0x0b0b0e }),
  badge: new THREE.MeshBasicMaterial({ map: badgeTex, transparent: true, alphaTest: 0.1, depthWrite: false }),
};
new THREE.TextureLoader().load('./assets/doganiero-icon.png', (t) => {
  t.colorSpace = THREE.SRGBColorSpace;
  SHARED.badge.map = t;
  SHARED.badge.needsUpdate = true;
});
const G = {
  body: new THREE.IcosahedronGeometry(0.5, 1), head: new THREE.IcosahedronGeometry(0.33, 1), chest: new THREE.IcosahedronGeometry(0.34, 1),
  snout: new THREE.IcosahedronGeometry(0.11, 0), eyeW: new THREE.CircleGeometry(0.075, 12), eyeB: new THREE.CircleGeometry(0.04, 10),
  badge: new THREE.PlaneGeometry(0.18, 0.18), upper: new THREE.CylinderGeometry(0.13, 0.11, 0.55, 6), fore: new THREE.CylinderGeometry(0.115, 0.1, 0.55, 6),
  elbow: new THREE.IcosahedronGeometry(0.12, 0),
};
// blocky low-poly hand; fingers point along -Z (forward), knuckles down
function makeBlockyHand(mat, s = 1) {
  const h = new THREE.Group();
  const palm = new THREE.Mesh(new THREE.BoxGeometry(0.17, 0.08, 0.15), mat); h.add(palm);
  for (let i = 0; i < 4; i++) {
    const f = new THREE.Mesh(new THREE.BoxGeometry(0.036, 0.055, 0.1), mat);
    f.position.set(-0.06 + i * 0.04, -0.012, -0.115); f.rotation.x = -0.35; h.add(f);
  }
  const th = new THREE.Mesh(new THREE.BoxGeometry(0.045, 0.05, 0.085), mat); th.position.set(0.1, -0.005, -0.04); th.rotation.y = -0.6; h.add(th);
  h.scale.setScalar(s);
  return h;
}
function makeLabel(text) {
  const tex = textTexture([text], { w: 256, h: 64, font: 'bold 34px system-ui', bg: 'rgba(15,35,22,0.75)', border: null });
  const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, depthTest: false, transparent: true }));
  sp.scale.set(1.3, 0.33, 1); sp.renderOrder = 10; sp.userData.tex = tex;
  return sp;
}
function makeGorilla(color, name) {
  const g = new THREE.Group();
  const fur = new THREE.MeshStandardMaterial({ color, map: furTex, roughness: 0.9, flatShading: true });
  const torso = new THREE.Group(); g.add(torso); // children[0] → bobs while running
  const body = new THREE.Mesh(G.body, fur); body.scale.set(1.05, 1.08, 0.88); body.position.y = 0.72;
  const chest = new THREE.Mesh(G.chest, SHARED.grey); chest.scale.set(1.0, 1.05, 0.42); chest.position.set(0, 0.68, 0.3);
  const badge = new THREE.Mesh(G.badge, SHARED.badge); badge.position.set(0.14, 0.9, 0.46); badge.rotation.y = 0.18;
  const head = new THREE.Mesh(G.head, fur); head.scale.set(1.05, 1.0, 1.0); head.position.set(0, 1.33, 0.06); // hood-like dome
  const mask = new THREE.Mesh(heartGeo, SHARED.grey); mask.position.set(0, 1.33, 0.3); mask.rotation.x = -0.08;
  const snout = new THREE.Mesh(G.snout, SHARED.snout); snout.scale.set(1.25, 0.8, 0.9); snout.position.set(0, 1.2, 0.4);
  torso.add(body, chest, badge, head, mask, snout);
  for (const sx of [-1, 1]) {
    const w = new THREE.Mesh(G.eyeW, SHARED.white); w.position.set(0.1 * sx, 1.39, 0.395);
    const b = new THREE.Mesh(G.eyeB, SHARED.black); b.position.set(0.1 * sx, 1.39, 0.4);
    torso.add(w, b);
  }
  // very long, thick arms reaching the ground (no legs)
  const arms = [];
  for (const side of [-1, 1]) {
    const shoulder = new THREE.Group(); shoulder.position.set(0.5 * side, 1.08, 0.02);
    const upper = new THREE.Mesh(G.upper, fur); upper.position.y = -0.27;
    const elbow = new THREE.Mesh(G.elbow, fur); elbow.position.y = -0.55;
    const fore = new THREE.Mesh(G.fore, fur); fore.position.y = -0.82;
    const hand = makeBlockyHand(fur, 1.25); hand.position.set(0, -1.1, 0.06); hand.rotation.x = -Math.PI / 2 + 0.25; // knuckles toward the ground
    shoulder.add(upper, elbow, fore, hand); g.add(shoulder); arms.push(shoulder);
  }
  g.traverse(o => { if (o.isMesh && o.material !== SHARED.white && o.material !== SHARED.black && o.material !== SHARED.badge) o.castShadow = true; });
  const label = makeLabel(name); label.position.y = 2.0; g.add(label);
  g.userData = { fur, arms, label, torso, baseColor: color };
  return g;
}

// ---------- entities ----------
const entities = [];   // {name, isPlayer, pos, vel, onGround, it, mesh, ...}
const player = { name: 'Tú', isPlayer: true, pos: rig.position, vel: new THREE.Vector3(), onGround: false, it: false, tags: 0, safeTime: 0, cooldown: 0 };
entities.push(player);
for (let i = 0; i < BOT_NAMES.length; i++) {
  const mesh = makeGorilla(BOT_COLORS[i], BOT_NAMES[i]);
  const a = i / BOT_NAMES.length * Math.PI * 2;
  const pos = new THREE.Vector3(Math.cos(a) * 10, 0, Math.sin(a) * 10 - 2);
  pos.y = supportHeight(pos.x, pos.z, 50);
  scene.add(mesh);
  entities.push({ name: BOT_NAMES[i], isPlayer: false, pos, vel: new THREE.Vector3(), onGround: true, it: false, mesh, tags: 0, safeTime: 0, cooldown: 0,
    wander: new THREE.Vector3(), think: 0, phase: rand() * 6, speed: 4.2 + rand() * 0.9 });
}
rig.position.set(0, heightAt(0, 20), 20);
let yaw = 0, pitch = -0.08;

function setIt(ent, by) {
  for (const e of entities) e.it = false;
  ent.it = true; ent.cooldown = 2.0;
  if (by) { by.tags++; by.cooldown = 0.5; }
  for (const e of entities) if (!e.isPlayer) {
    const u = e.mesh.userData;
    u.fur.color.set(e.it ? IT_COLOR : u.baseColor);
    u.fur.emissive.set(e.it ? 0x5a0800 : 0x000000);
    u.label.userData.tex.redraw([e.it ? `${e.name} · ¡LA LLEVA!` : e.name]);
  }
  refreshPlayerLook(); if (by) tagBurst(ent.pos);
  beep(ent.isPlayer ? 220 : 520);
  flashMsg(by ? (by.isPlayer ? `¡Has pillado a ${ent.name}!` : ent.isPlayer ? `¡${by.name} te ha pillado! La llevas.` : `${by.name} pilló a ${ent.name}`) : `${ent.name} la lleva`);
}

// ---------- player arms ----------
const playerArmMat = new THREE.MeshStandardMaterial({ color: BOT_COLORS[0], map: furTex, roughness: 0.9, flatShading: true });
const palmMat = new THREE.MeshStandardMaterial({ color: 0x1d212b, map: furTex, roughness: 0.9, flatShading: true });
const hands = [-1, 1].map(side => {
  const arm = new THREE.Mesh(new THREE.CylinderGeometry(0.075, 0.11, 1, 6), playerArmMat);
  arm.geometry.translate(0, 0.5, 0); arm.geometry.rotateX(Math.PI / 2); // along +Z, length 1
  const fist = makeBlockyHand(palmMat, 0.82); // dark low-poly hand
  if (side > 0) fist.scale.x *= -1; // mirror for the right hand (thumb inward)
  arm.castShadow = true; fist.traverse(o => { o.castShadow = true; o.frustumCulled = false; });
  arm.frustumCulled = false;
  scene.add(arm, fist);
  return { side, arm, fist, world: new THREE.Vector3(), anchor: null, prev: new THREE.Vector3(), swipe: 0 };
});

// ---------- XR controllers ----------
const grips = [0, 1].map(i => { const g = renderer.xr.getControllerGrip(i); rig.add(g); return g; });
const ctrlHand = ['left', 'right'];
const gripOf = (h) => { const k = ctrlHand.indexOf(h.side < 0 ? 'left' : 'right'); return grips[k >= 0 ? k : (h.side < 0 ? 0 : 1)]; };
grips.forEach((g, i) => g.addEventListener('connected', e => { ctrlHand[i] = e.data.handedness; }));
let inVR = false;
renderer.xr.addEventListener('sessionstart', () => { inVR = true; started = true; startEl.style.display = 'none'; camera.position.set(0, 0, 0); });
renderer.xr.addEventListener('sessionend', () => { inVR = false; camera.position.set(0, EYE, 0); });

// ---------- input (desktop) ----------
const keys = {};
addEventListener('keydown', e => { keys[e.code] = true; if (e.code === 'Space') e.preventDefault(); });
addEventListener('keyup', e => { keys[e.code] = false; });
let swipeSide = 1;
renderer.domElement.addEventListener('mousedown', (e) => {
  if (!started) return;
  if (document.pointerLockElement !== renderer.domElement) renderer.domElement.requestPointerLock?.();
  const locked = document.pointerLockElement === renderer.domElement;
  if (shopRaycast(locked ? 0 : (e.clientX / innerWidth) * 2 - 1, locked ? 0 : -(e.clientY / innerHeight) * 2 + 1)) return;
  hands[swipeSide > 0 ? 1 : 0].swipe = 1; swipeSide *= -1;
});
addEventListener('mousemove', e => {
  if (document.pointerLockElement === renderer.domElement) {
    yaw -= e.movementX * 0.0022; pitch = THREE.MathUtils.clamp(pitch - e.movementY * 0.0022, -1.4, 1.4);
  }
});
// touch: left half = move stick, right half = look
let touchMove = null, touchLook = null; const touchVec = new THREE.Vector2();
renderer.domElement.addEventListener('touchstart', e => { for (const t of e.changedTouches) { if (t.clientX < innerWidth / 2) touchMove = { id: t.identifier, x: t.clientX, y: t.clientY }; else { touchLook = { id: t.identifier, x: t.clientX, y: t.clientY }; if (!shopRaycast((t.clientX / innerWidth) * 2 - 1, -(t.clientY / innerHeight) * 2 + 1)) hands[1].swipe = 1; } } }, { passive: true });
renderer.domElement.addEventListener('touchmove', e => { for (const t of e.changedTouches) {
  if (touchMove && t.identifier === touchMove.id) touchVec.set((t.clientX - touchMove.x) / 60, (t.clientY - touchMove.y) / 60).clampLength(0, 1);
  if (touchLook && t.identifier === touchLook.id) { yaw -= (t.clientX - touchLook.x) * 0.005; pitch = THREE.MathUtils.clamp(pitch - (t.clientY - touchLook.y) * 0.005, -1.4, 1.4); touchLook.x = t.clientX; touchLook.y = t.clientY; }
} }, { passive: true });
renderer.domElement.addEventListener('touchend', e => { for (const t of e.changedTouches) { if (touchMove && t.identifier === touchMove.id) { touchMove = null; touchVec.set(0, 0); } if (touchLook && t.identifier === touchLook.id) touchLook = null; } });

// ---------- UI ----------
const startEl = document.getElementById('start'), statusEl = document.getElementById('status'), scoreEl = document.getElementById('score');
let started = false;
document.getElementById('vrslot').appendChild(VRButton.createButton(renderer));
let msg = '', msgT = 0;
function flashMsg(m) { msg = m; msgT = 2.5; }
let actx = null, masterGain = null, musicGain = null;
function initAudio() {
  try {
    actx = actx || new (window.AudioContext || window.webkitAudioContext)();
    if (actx.state === 'suspended') actx.resume();
    if (!masterGain) {
      masterGain = actx.createGain();
      masterGain.gain.value = 0.9;
      masterGain.connect(actx.destination);
    }
    if (!musicGain) {
      musicGain = actx.createGain();
      musicGain.gain.value = 0.0001;
      musicGain.connect(actx.destination);
    }
  } catch { }
}
function ensureAudio() { initAudio(); if (actx?.state === 'suspended') actx.resume(); }

const SURFACE_FX = {
  grass:     { tone: 95,  type: 'triangle', decay: 0.09, lp: 420,  click: 0.00 },
  wood:      { tone: 210, type: 'square',   decay: 0.07, lp: 950,  click: 0.18 },
  rock:      { tone: 520, type: 'sine',     decay: 0.05, lp: 1700, click: 0.32 },
  concrete:  { tone: 155, type: 'square',   decay: 0.06, lp: 1050, click: 0.22 },
  metal:     { tone: 680, type: 'triangle', decay: 0.04, lp: 2800, click: 0.42 },
};
function noiseBuf(sec) {
  const n = Math.max(1, Math.floor(actx.sampleRate * sec));
  const buf = actx.createBuffer(1, n, actx.sampleRate);
  const d = buf.getChannelData(0);
  for (let i = 0; i < n; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / n, 0.6);
  return buf;
}
function surfaceAt(x, z, y) {
  let h = heightAt(x, z), surf = (inCity(x, z) || (Math.abs(x) < 3.2 && z < -15 && z > CITY.maxZ)) ? 'concrete' : 'grass';
  for (const b of boxes) {
    if (x > b.min.x - 0.35 && x < b.max.x + 0.35 && z > b.min.z - 0.35 && z < b.max.z + 0.35 && b.max.y <= y + 0.6 && b.max.y + 0.02 >= h) {
      h = b.max.y; surf = b.surface || 'rock';
    }
  }
  return surf;
}
function playImpact({ surface = 'grass', vol = 0.25, pitch = 1, pos = null, land = false } = {}) {
  if (!actx || !masterGain) return;
  const s = SURFACE_FX[surface] || SURFACE_FX.grass;
  const t0 = actx.currentTime;
  const out = actx.createGain();
  out.gain.value = 0.0001;
  if (pos) {
    const panner = actx.createPanner();
    panner.panningModel = 'HRTF';
    panner.distanceModel = 'inverse';
    panner.refDistance = 2.5; panner.maxDistance = 45; panner.rolloffFactor = 1.5;
    panner.positionX.value = pos.x; panner.positionY.value = (pos.y || 0) + 0.2; panner.positionZ.value = pos.z;
    out.connect(panner); panner.connect(masterGain);
  } else out.connect(masterGain);

  const v = Math.min(0.7, vol * (land ? 1.7 : 1) * (0.82 + Math.random() * 0.36));
  const dur = (land ? 0.18 : s.decay) * (0.88 + Math.random() * 0.25);
  const pit = pitch * (0.9 + Math.random() * 0.2);
  out.gain.setValueAtTime(0.0001, t0);
  out.gain.exponentialRampToValueAtTime(Math.max(0.001, v), t0 + 0.006);
  out.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);

  const src = actx.createBufferSource();
  src.buffer = noiseBuf(land ? 0.2 : 0.1);
  src.playbackRate.value = pit * (surface === 'grass' ? 0.85 : surface === 'wood' ? 1.0 : 1.25);
  const bp = actx.createBiquadFilter();
  bp.type = 'lowpass'; bp.frequency.value = s.lp * pit * (land ? 0.7 : 1);
  src.connect(bp).connect(out);
  src.start(t0); src.stop(t0 + dur + 0.03);

  const o = actx.createOscillator();
  o.type = s.type; o.frequency.value = s.tone * pit;
  const og = actx.createGain();
  og.gain.setValueAtTime(v * (land ? 0.45 : 0.28), t0);
  og.gain.exponentialRampToValueAtTime(0.0001, t0 + dur * 0.85);
  o.connect(og).connect(out); o.start(t0); o.stop(t0 + dur);

  if (s.click > 0) {
    const c = actx.createOscillator(); c.type = 'sine';
    c.frequency.value = (surface === 'rock' ? 1400 : 780) * pit;
    const cg = actx.createGain();
    cg.gain.setValueAtTime(v * s.click, t0);
    cg.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.028);
    c.connect(cg).connect(out); c.start(t0); c.stop(t0 + 0.03);
  }
}
function beep(f) {
  if (!actx || !masterGain) return;
  const o = actx.createOscillator(), g = actx.createGain();
  o.frequency.value = f; o.type = 'triangle';
  g.gain.setValueAtTime(0.18, actx.currentTime);
  g.gain.exponentialRampToValueAtTime(0.001, actx.currentTime + 0.35);
  o.connect(g).connect(masterGain); o.start(); o.stop(actx.currentTime + 0.4);
}
function updateListener() {
  if (!actx?.listener) return;
  const l = actx.listener, p = rig.position;
  if (l.positionX) {
    l.positionX.value = p.x; l.positionY.value = p.y + EYE; l.positionZ.value = p.z;
    l.forwardX.value = -Math.sin(yaw); l.forwardY.value = 0; l.forwardZ.value = -Math.cos(yaw);
    l.upX.value = 0; l.upY.value = 1; l.upZ.value = 0;
  }
}

// ---------- title-screen music (procedural, original) ----------
const MUSIC_MUTE_KEY = 'dogaTag.musicMuted';
const musicToggleEl = document.getElementById('musicToggle');
const musicHintEl = document.getElementById('musicHint');
let musicMuted = false;
try { musicMuted = localStorage.getItem(MUSIC_MUTE_KEY) === '1'; } catch { }
let musicStarted = false, musicPlaying = false, musicSource = null, musicBuf = null, musicBuilding = null;
const MUSIC_BPM = 116;
const MUSIC_BARS = 16; // ~33 s seamless loop
const MUSIC_LEVEL = 0.42;

function midiToHz(m) { return 440 * Math.pow(2, (m - 69) / 12); }

function scheduleTone(ctx, dest, { type = 'sine', midi, t, dur = 0.25, vol = 0.2, attack = 0.01, release = 0.08, detune = 0, filter }) {
  const o = ctx.createOscillator();
  o.type = type;
  o.frequency.value = midiToHz(midi);
  if (detune) o.detune.value = detune;
  const g = ctx.createGain();
  const peak = Math.max(0.0001, vol);
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(peak, t + attack);
  g.gain.exponentialRampToValueAtTime(0.0001, t + Math.max(attack + 0.02, dur));
  let node = o;
  if (filter) {
    const f = ctx.createBiquadFilter();
    f.type = filter.type || 'lowpass';
    f.frequency.value = filter.freq || 1200;
    f.Q.value = filter.q || 0.7;
    o.connect(f); node = f;
  }
  node.connect(g); g.connect(dest);
  o.start(t); o.stop(t + dur + release + 0.05);
}

function scheduleNoiseHit(ctx, dest, { t, dur = 0.05, vol = 0.2, freq = 4000, type = 'highpass' }) {
  const n = Math.max(1, Math.floor(ctx.sampleRate * Math.max(dur, 0.03)));
  const buf = ctx.createBuffer(1, n, ctx.sampleRate);
  const d = buf.getChannelData(0);
  for (let i = 0; i < n; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / n, 1.4);
  const src = ctx.createBufferSource(); src.buffer = buf;
  const f = ctx.createBiquadFilter(); f.type = type; f.frequency.value = freq;
  const g = ctx.createGain();
  g.gain.setValueAtTime(Math.max(0.0001, vol), t);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  src.connect(f); f.connect(g); g.connect(dest);
  src.start(t); src.stop(t + dur + 0.02);
}

function composeTitleMusic(ctx) {
  const bpm = MUSIC_BPM, bars = MUSIC_BARS;
  const spb = 60 / bpm;
  const totalBeats = bars * 4;
  const dur = totalBeats * spb;
  const master = ctx.createGain(); master.gain.value = 1; master.connect(ctx.destination);

  // Buses
  const leadBus = ctx.createGain(); leadBus.gain.value = 0.55; leadBus.connect(master);
  const bassBus = ctx.createGain(); bassBus.gain.value = 0.7; bassBus.connect(master);
  const chordBus = ctx.createGain(); chordBus.gain.value = 0.28; chordBus.connect(master);
  const percBus = ctx.createGain(); percBus.gain.value = 0.55; percBus.connect(master);
  const woodBus = ctx.createGain(); woodBus.gain.value = 0.4; woodBus.connect(master);

  // Original playful jungle motif in C major / A minor (I–vi–IV–V), pentatonic lead
  // Chord roots per bar (midi): C3 Am3 F3 G3  x4 for 16 bars with variations
  const prog = [48, 45, 41, 43, 48, 45, 41, 43, 48, 45, 53, 43, 48, 45, 41, 43]; // last 4: C Am F G, with bar11 = F4 colour
  // Lead melody phrases (scale degrees relative, then mapped) — original hook
  const phraseA = [76, 79, 81, 79, 76, 74, 72, 74, 76, 79, 81, 83, 81, 79, 76, 72]; // 16 eighths over 2 bars
  const phraseB = [79, 81, 83, 81, 79, 76, 74, 72, 74, 76, 79, 81, 79, 76, 74, 72];
  const phraseC = [81, 83, 84, 83, 81, 79, 76, 79, 81, 79, 76, 74, 72, 74, 76, 79];
  const phraseD = [76, 74, 72, 69, 72, 74, 76, 79, 81, 79, 76, 74, 72, 71, 72, 74];

  for (let bar = 0; bar < bars; bar++) {
    const tBar = bar * 4 * spb;
    const root = prog[bar % prog.length];
    // Bass: root on 1, fifth on 3, octave bounce
    scheduleTone(ctx, bassBus, { type: 'triangle', midi: root, t: tBar, dur: spb * 1.1, vol: 0.34, attack: 0.01, filter: { freq: 280 } });
    scheduleTone(ctx, bassBus, { type: 'triangle', midi: root + 7, t: tBar + 2 * spb, dur: spb * 0.9, vol: 0.26, attack: 0.01, filter: { freq: 320 } });
    if (bar % 2 === 1) scheduleTone(ctx, bassBus, { type: 'triangle', midi: root + 12, t: tBar + 3 * spb, dur: spb * 0.45, vol: 0.18, attack: 0.005, filter: { freq: 360 } });

    // Soft chord pad (root, third, fifth) — major/minor by prog
    const isMinor = [45].includes(root) || (root === 45);
    const third = root + ([45].includes(root % 12 === 9 ? 9 : root) ? 0 : 0);
    // Am=45 (A), others major-ish: C=48 major, F=41 major, G=43 major, F4=53 major
    const minorRoots = new Set([45]);
    const thirdInt = minorRoots.has(root) ? 3 : 4;
    const chordT = tBar + 0.02;
    for (const off of [0, thirdInt, 7]) {
      scheduleTone(ctx, chordBus, { type: 'sine', midi: root + 12 + off, t: chordT, dur: spb * 3.6, vol: 0.11, attack: 0.08, release: 0.3, detune: (off - 3) * 2, filter: { freq: 1800, q: 0.4 } });
      scheduleTone(ctx, chordBus, { type: 'triangle', midi: root + 12 + off, t: chordT, dur: spb * 3.6, vol: 0.05, attack: 0.1, detune: -6, filter: { freq: 1400 } });
    }

    // Percussion: kick + hi-hat + wood blocks
    for (let b = 0; b < 4; b++) {
      const tb = tBar + b * spb;
      if (b % 2 === 0) {
        // kick
        scheduleTone(ctx, percBus, { type: 'sine', midi: 36, t: tb, dur: 0.18, vol: 0.45, attack: 0.002, filter: { freq: 140 } });
        scheduleNoiseHit(ctx, percBus, { t: tb, dur: 0.06, vol: 0.18, freq: 120, type: 'lowpass' });
      }
      // hi-hat 8ths
      scheduleNoiseHit(ctx, percBus, { t: tb, dur: 0.035, vol: b === 1 || b === 3 ? 0.12 : 0.07, freq: 7000, type: 'highpass' });
      scheduleNoiseHit(ctx, percBus, { t: tb + spb * 0.5, dur: 0.028, vol: 0.06, freq: 8000, type: 'highpass' });
      // wood / marimba offbeats
      if (b === 1 || b === 3) {
        scheduleTone(ctx, woodBus, { type: 'triangle', midi: 76 + (b === 3 ? 3 : 0) + (bar % 4), t: tb + spb * 0.25, dur: 0.09, vol: 0.14, attack: 0.002, filter: { freq: 2400 } });
        scheduleTone(ctx, woodBus, { type: 'sine', midi: 81 + (bar % 3), t: tb + spb * 0.75, dur: 0.08, vol: 0.1, attack: 0.002, filter: { freq: 2600 } });
      }
    }

    // Melody lead — A A B A pattern over 16 bars (2 bars per phrase)
    const phrases = [phraseA, phraseA, phraseB, phraseA, phraseA, phraseC, phraseB, phraseD];
    const phrase = phrases[Math.floor(bar / 2) % phrases.length];
    if (bar % 2 === 0) {
      for (let i = 0; i < 16; i++) {
        const t = tBar + i * (spb * 0.5);
        const m = phrase[i];
        // skip rests encoded as 0 (none); short notes
        const noteDur = (i % 4 === 3) ? spb * 0.55 : spb * 0.42;
        scheduleTone(ctx, leadBus, { type: 'square', midi: m, t, dur: noteDur, vol: 0.12, attack: 0.005, filter: { freq: 2200, q: 0.8 } });
        scheduleTone(ctx, leadBus, { type: 'triangle', midi: m + 12, t, dur: noteDur * 0.85, vol: 0.045, attack: 0.008, filter: { freq: 3200 } });
      }
    }
  }

  // Gentle end overlap so loop crossfades cleanly: fade last 40ms and first will cover
  const tEnd = dur;
  master.gain.setValueAtTime(1, Math.max(0, tEnd - 0.05));
  master.gain.linearRampToValueAtTime(0.85, tEnd); // tiny dip; loop restart fills
  return dur;
}

async function buildTitleMusicBuffer() {
  ensureAudio();
  if (!actx) return null;
  const spb = 60 / MUSIC_BPM;
  const dur = MUSIC_BARS * 4 * spb;
  const offline = new OfflineAudioContext(2, Math.ceil(dur * actx.sampleRate), actx.sampleRate);
  composeTitleMusic(offline);
  return offline.startRendering();
}

function refreshMusicUI() {
  if (musicToggleEl) musicToggleEl.textContent = musicMuted ? '🔇' : '🔊';
  if (musicHintEl) {
    if (musicStarted) musicHintEl.classList.add('hidden');
    else musicHintEl.classList.remove('hidden');
  }
}

function persistMusicMute() {
  try { localStorage.setItem(MUSIC_MUTE_KEY, musicMuted ? '1' : '0'); } catch { }
}

function applyMusicGain(fade = 0.05) {
  if (!musicGain || !actx) return;
  const t = actx.currentTime;
  const target = (!musicPlaying || musicMuted) ? 0.0001 : MUSIC_LEVEL;
  musicGain.gain.cancelScheduledValues(t);
  musicGain.gain.setValueAtTime(Math.max(0.0001, musicGain.gain.value || 0.0001), t);
  musicGain.gain.linearRampToValueAtTime(target, t + fade);
}

async function startTitleMusic() {
  if (started || AUTOSTART || VIEW) return;
  ensureAudio();
  if (!actx || !musicGain) return;
  if (!musicBuf) {
    if (!musicBuilding) musicBuilding = buildTitleMusicBuffer().then(b => { musicBuf = b; musicBuilding = null; return b; });
    await musicBuilding;
  }
  if (!musicBuf || musicPlaying) {
    if (musicPlaying) applyMusicGain(0.08);
    musicStarted = true; refreshMusicUI();
    return;
  }
  if (musicSource) { try { musicSource.stop(); } catch { } musicSource = null; }
  const src = actx.createBufferSource();
  src.buffer = musicBuf;
  src.loop = true;
  src.loopStart = 0;
  src.loopEnd = musicBuf.duration;
  src.connect(musicGain);
  musicGain.gain.setValueAtTime(0.0001, actx.currentTime);
  src.start(0);
  musicSource = src;
  musicPlaying = true;
  musicStarted = true;
  applyMusicGain(0.6);
  refreshMusicUI();
}

function stopTitleMusicHard() {
  if (musicSource) { try { musicSource.stop(); } catch { } musicSource = null; }
  musicPlaying = false;
}

function fadeOutTitleMusic(sec = 1.15) {
  if (!actx || !musicGain || !musicPlaying) { stopTitleMusicHard(); return; }
  const t = actx.currentTime;
  musicGain.gain.cancelScheduledValues(t);
  musicGain.gain.setValueAtTime(Math.max(0.0001, musicGain.gain.value), t);
  musicGain.gain.linearRampToValueAtTime(0.0001, t + sec);
  const src = musicSource;
  setTimeout(() => {
    if (musicSource === src) stopTitleMusicHard();
  }, sec * 1000 + 80);
}

function beginGameFromMenu() {
  fadeOutTitleMusic(1.1);
  started = true;
  startEl.style.display = 'none';
  ensureAudio();
}

document.getElementById('play').onclick = () => {
  beginGameFromMenu();
  renderer.domElement.requestPointerLock?.();
};
renderer.xr.addEventListener('sessionstart', () => { fadeOutTitleMusic(0.9); });

function onMenuGesture() {
  if (started || AUTOSTART) return;
  startTitleMusic();
}
if (startEl && !AUTOSTART && !VIEW) {
  refreshMusicUI();
  startEl.addEventListener('pointerdown', onMenuGesture, { passive: true });
  addEventListener('keydown', onMenuGesture, { once: false });
  if (musicToggleEl) {
    musicToggleEl.addEventListener('click', (e) => {
      e.stopPropagation();
      musicMuted = !musicMuted;
      persistMusicMute();
      refreshMusicUI();
      if (!musicStarted) startTitleMusic();
      else applyMusicGain(0.12);
    });
  }
  // Prefetch buffer after a tick so first click is snappy
  setTimeout(() => { if (!started) { ensureAudio(); buildTitleMusicBuffer().then(b => { musicBuf = b; }).catch(() => {}); } }, 100);
}

if (AUTOSTART) { started = true; startEl.style.display = 'none'; }

// ---------- player update ----------
const tmpV = new THREE.Vector3(), tmpQ = new THREE.Quaternion(), fwd = new THREE.Vector3(), right = new THREE.Vector3();
let walkPhase = 0;
const handHistory = [];
let stepSign = 0, wasGrounded = true, prevVy = 0;
function updatePlayerDesktop(dt, t) {
  rig.rotation.set(0, yaw, 0); camera.rotation.set(pitch, 0, 0);
  fwd.set(-Math.sin(yaw), 0, -Math.cos(yaw)); right.set(Math.cos(yaw), 0, -Math.sin(yaw));
  let mx = (keys.KeyD || keys.ArrowRight ? 1 : 0) - (keys.KeyA || keys.ArrowLeft ? 1 : 0) + touchVec.x;
  let mz = (keys.KeyW || keys.ArrowUp ? 1 : 0) - (keys.KeyS || keys.ArrowDown ? 1 : 0) - touchVec.y;
  const running = !!(keys.ShiftLeft || keys.ShiftRight);
  const speed = (running ? 7.6 : 5.4) * powerMul().speed;
  const wish = tmpV.set(0, 0, 0).addScaledVector(fwd, mz).addScaledVector(right, mx);
  if (wish.lengthSq() > 1) wish.normalize();
  const accel = player.onGround ? 14 : 4;
  player.vel.x += (wish.x * speed - player.vel.x) * Math.min(1, accel * dt);
  player.vel.z += (wish.z * speed - player.vel.z) * Math.min(1, accel * dt);
  if ((keys.Space) && player.onGround) { player.vel.y = 6.2 * powerMul().jump; player.onGround = false; }
  integrateBody(player, dt, 0.35, 1.4);
  const moving = Math.hypot(player.vel.x, player.vel.z);
  walkPhase += dt * (2 + moving * 1.6);
  // landing thump
  if (player.onGround && !wasGrounded && prevVy < -2.2) {
    playImpact({ surface: surfaceAt(player.pos.x, player.pos.z, player.pos.y + 0.3), vol: Math.min(0.55, 0.22 + (-prevVy) * 0.04), pitch: 0.82, land: true });
  }
  // knuckle-thump footsteps (only on ground while moving)
  if (player.onGround && moving > 0.85) {
    const rate = (running ? 2.4 : 1.7) + moving * 0.35;
    const ph = walkPhase * (rate / (2 + moving * 1.6)) * 1.15;
    const sign = Math.sin(ph) >= 0 ? 1 : -1;
    if (sign !== stepSign) {
      stepSign = sign;
      playImpact({
        surface: surfaceAt(player.pos.x, player.pos.z, player.pos.y + 0.3),
        vol: (running ? 0.26 : 0.17) * (0.85 + Math.random() * 0.3),
        pitch: (running ? 1.06 : 0.94) * (0.9 + Math.random() * 0.2),
      });
    }
  } else if (!player.onGround) {
    stepSign = 0;
  }
  wasGrounded = player.onGround; prevVy = player.vel.y;
  // desktop arms: knuckle-walk swing in camera space
  camera.updateMatrixWorld(true);
  for (const h of hands) {
    h.swipe = Math.max(0, h.swipe - dt * 3.2);
    const sw = Math.sin(walkPhase + (h.side > 0 ? Math.PI : 0)) * Math.min(1, moving / 5);
    const swipeK = Math.sin(h.swipe * Math.PI);
    const local = tmpV.set(0.33 * h.side - swipeK * 0.24 * h.side, -0.3 + 0.04 * Math.sin(t * 2 + h.side) + sw * 0.07 + swipeK * 0.18, -0.62 - sw * 0.16 - swipeK * 0.4);
    h.world.copy(local).applyMatrix4(camera.matrixWorld);
    // don't let hands sink into ground
    const s = insideSurface(h.world); if (s) h.world.copy(s);
  }
}
function updatePlayerVR(dt) {
  // Gorilla-Tag style arm locomotion
  rig.updateMatrixWorld(true);
  const targets = hands.map(h => gripOf(h).position.clone().applyQuaternion(rig.quaternion).add(rig.position));
  let move = new THREE.Vector3(), n = 0;
  hands.forEach((h, i) => { if (h.anchor) { move.add(tmpV.copy(h.anchor).sub(targets[i])); n++; } });
  if (n) {
    move.divideScalar(n).clampLength(0, powerMul().move);
    rig.position.add(move);
    handHistory.push(move.clone().divideScalar(Math.max(dt, 1e-3))); if (handHistory.length > 6) handHistory.shift();
    player.vel.set(0, 0, 0); player.onGround = true;
  } else {
    player.vel.y -= GRAV * dt;
    rig.position.addScaledVector(player.vel, dt);
    player.vel.multiplyScalar(1 - 0.15 * dt);
    const head = rig.position.clone().add(camera.position);
    const gh = supportHeight(head.x, head.z, head.y) + 0.25;
    if (head.y < gh) { rig.position.y += gh - head.y; player.vel.y = Math.max(0, player.vel.y); player.vel.x *= 0.9; player.vel.z *= 0.9; }
    player.onGround = false;
  }
  pushOut(rig.position, 0.25, 1.0);
  const anyBefore = hands.some(h => h.anchor);
  hands.forEach((h, i) => {
    const target = gripOf(h).position.clone().applyQuaternion(rig.quaternion).add(rig.position);
    if (h.anchor) {
      if (target.distanceTo(h.anchor) > 0.35 || !insideSurface(target.clone().add(tmpV.set(0, -0.04, 0)))) h.anchor = null;
    } else {
      const s = insideSurface(target);
      if (s) {
        const spd = h.prev.distanceTo(target) / Math.max(dt, 1e-3);
        h.anchor = s; vibrate(i);
        playImpact({
          surface: surfaceAt(s.x, s.z, s.y + 0.25),
          vol: Math.min(0.5, 0.1 + spd * 0.035),
          pitch: 0.88 + Math.min(0.45, spd * 0.018),
        });
      }
    }
    h.prev.copy(target);
    h.world.copy(h.anchor || target);
  });
  if (anyBefore && !hands.some(h => h.anchor) && handHistory.length) {
    const v = handHistory.reduce((a, b) => a.add(b), new THREE.Vector3()).divideScalar(handHistory.length);
    player.vel.copy(v.multiplyScalar(1.15 * powerMul().fling).clampLength(0, powerMul().cap)); handHistory.length = 0;
  }
  // VR landing when falling onto a surface
  if (!anyBefore) {
    const head = rig.position.clone().add(camera.position);
    const gh = supportHeight(head.x, head.z, head.y) + 0.25;
    if (player.vel.y < -2.5 && head.y <= gh + 0.05) {
      playImpact({ surface: surfaceAt(head.x, head.z, gh), vol: Math.min(0.55, 0.2 + (-player.vel.y) * 0.035), pitch: 0.8, land: true });
    }
  }
}
function vibrate(i) {
  const src = renderer.xr.getSession()?.inputSources?.[i];
  src?.gamepad?.hapticActuators?.[0]?.pulse?.(0.4, 40);
}
function drawArms() {
  camera.getWorldPosition(tmpV);
  const camQ = camera.getWorldQuaternion(tmpQ);
  const yawOnly = new THREE.Euler().setFromQuaternion(camQ, 'YXZ'); yawOnly.x = yawOnly.z = 0;
  const yq = new THREE.Quaternion().setFromEuler(yawOnly);
  for (const h of hands) {
    const shoulder = new THREE.Vector3((inVR ? 0.22 : 0.42) * h.side, inVR ? -0.3 : -0.62, inVR ? 0.08 : -0.05).applyQuaternion(yq).add(tmpV);
    h.arm.position.copy(shoulder);
    h.arm.lookAt(h.world);
    h.arm.scale.set(1, 1, shoulder.distanceTo(h.world));
    h.fist.position.copy(h.world);
    h.fist.quaternion.copy(yq);
  }
}

function integrateBody(e, dt, rad, height) {
  e.vel.y -= GRAV * dt;
  e.pos.addScaledVector(e.vel, dt);
  pushOut(e.pos, rad, height);
  const sh = supportHeight(e.pos.x, e.pos.z, e.pos.y, rad * 0.5);
  if (e.pos.y <= sh) { e.pos.y = sh; if (e.vel.y < 0) e.vel.y = 0; e.onGround = true; }
  else if (e.pos.y - sh > 0.05) e.onGround = false;
}

// ---------- bots AI ----------
function updateBot(b, dt, t) {
  if (b.hold) { b.mesh.position.copy(b.pos); return; }
  b.think -= dt;
  const it = entities.find(e => e.it);
  let goal = null, speed = b.speed;
  if (b.it) {
    if (b.cooldown > 0) speed *= 0.4;
    let best = null, bd = 1e9;
    for (const e of entities) if (e !== b) { const d = e.pos.distanceTo(b.pos) + (e.isPlayer ? -2 : 0); if (d < bd) { bd = d; best = e; } }
    goal = best.pos.clone().addScaledVector(best.vel, 0.3);
    speed *= 1.12;
  } else if (it && it.pos.distanceTo(b.pos) < 13) {
    const away = b.pos.clone().sub(it.pos).setY(0).normalize();
    // bias toward the centre when near the edge
    away.addScaledVector(b.pos.clone().setY(0).normalize(), -Math.max(0, b.pos.length() - 40) / 10).normalize();
    goal = b.pos.clone().addScaledVector(away, 6);
  } else {
    if (b.think <= 0 || b.wander.distanceTo(b.pos) < 2) {
      if (CITY_SPOTS.length && rand() < 0.35) {
        const s = CITY_SPOTS[Math.floor(rand() * CITY_SPOTS.length)];
        b.wander.set(s.x, 0, s.z); b.think = 4 + rand() * 4;
      } else {
        const a = rand() * Math.PI * 2, d = rand() * 30;
        b.wander.set(Math.cos(a) * d, 0, Math.sin(a) * d); b.think = 3 + rand() * 4;
      }
    }
    goal = b.wander; speed *= 0.55;
  }
  const dir = goal.clone().sub(b.pos).setY(0);
  if (dir.lengthSq() > 0.01) dir.normalize();
  // steer around nearby trunks
  for (const tr of trunks) {
    const dx = b.pos.x - tr.x, dz = b.pos.z - tr.z, d = Math.hypot(dx, dz);
    if (d < 2.2) { dir.x += dx / d * (2.2 - d) * 0.6; dir.z += dz / d * (2.2 - d) * 0.6; }
  }
  dir.normalize();
  const acc = b.onGround ? 8 : 2;
  b.vel.x += (dir.x * speed - b.vel.x) * Math.min(1, acc * dt);
  b.vel.z += (dir.z * speed - b.vel.z) * Math.min(1, acc * dt);
  if (b.onGround && (rand() < dt * 0.35 || (b.it && rand() < dt * 0.8))) { b.vel.y = 5.5 + rand() * 1.5; b.onGround = false; }
  const before = b.pos.clone();
  integrateBody(b, dt, 0.4, 1.4);
  // stuck → jump
  if (b.onGround && before.distanceTo(b.pos) < speed * dt * 0.2) b.vel.y = 6.5;
  // animate
  const m = b.mesh; m.position.copy(b.pos);
  const sp = Math.hypot(b.vel.x, b.vel.z);
  if (sp > 0.3) m.rotation.y = Math.atan2(b.vel.x, b.vel.z);
  b.phase += dt * (3 + sp * 1.5);
  const [la, ra] = m.userData.arms;
  const swing = Math.min(1, sp / 4);
  la.rotation.x = -0.6 * swing + Math.sin(b.phase) * 0.9 * swing; ra.rotation.x = -0.6 * swing - Math.sin(b.phase) * 0.9 * swing;
  la.rotation.z = -0.25 - (b.onGround ? 0 : 0.9); ra.rotation.z = 0.25 + (b.onGround ? 0 : 0.9);
  m.children[0].position.y = Math.abs(Math.sin(b.phase)) * 0.08 * swing;
  if (b.onGround && sp > 0.7) {
    const sign = Math.sin(b.phase) >= 0 ? 1 : -1;
    if (sign !== (b.stepSign || 0)) {
      b.stepSign = sign;
      playImpact({
        surface: surfaceAt(b.pos.x, b.pos.z, b.pos.y + 0.3),
        vol: 0.055 * (0.8 + Math.random() * 0.35),
        pitch: 0.88 + Math.random() * 0.22,
        pos: b.pos,
      });
    }
  }
}

// ---------- tagging ----------
function checkTags() {
  const it = entities.find(e => e.it);
  if (!it || it.cooldown > 0) return;
  for (const e of entities) {
    if (e === it) continue;
    let touching = false;
    if (it.isPlayer) touching = hands.some(h => h.world.distanceTo(tmpV.copy(e.pos).setY(e.pos.y + 0.9)) < 0.75) || it.pos.distanceTo(e.pos) < 1.0;
    else if (e.isPlayer) touching = tmpV.copy(e.pos).setY(e.pos.y + 0.7).distanceTo(it.pos.clone().setY(it.pos.y + 0.8)) < 1.15;
    else touching = it.pos.distanceTo(e.pos) < 1.1;
    if (touching) { setIt(e, it); return; }
  }
}

// ---------- HUD & scoreboard ----------
let boardT = 0;
function updateHud(dt) {
  const it = entities.find(e => e.it);
  msgT -= dt;
  statusEl.className = player.it ? 'it' : '';
  statusEl.textContent = msgT > 0 ? msg : player.it ? '¡LA LLEVAS! Pilla a alguien' : `La lleva: ${it ? it.name : '—'} · ¡Huye!`;
  const ranking = entities.slice().sort((a, b) => b.safeTime - a.safeTime);
  scoreEl.textContent = ranking.map(e => `${e.it ? '🔴' : '🟢'} ${e.name.padEnd(8)} ${e.safeTime.toFixed(0).padStart(4)}s libre · ${e.tags} pilladas`).join('\n');
  boardT -= dt;
  if (boardT <= 0) {
    boardT = 1;
    scoreboardTex.redraw([{ text: 'DOGA TAG', font: 'bold 64px system-ui', color: '#c8ec6b' },
      ...ranking.slice(0, 7).map(e => ({ text: `${e.it ? '● ' : ''}${e.name}  ${e.safeTime.toFixed(0)}s`, font: 'bold 38px system-ui', color: e.it ? '#ff6b5e' : '#fffdf9' }))]);
  }
}

// ---------- Doganiero extras: save, bones, power-ups, shop, tag bursts ----------
const SAVE_KEY = 'dogaTag.v1';
const save = (() => {
  const def = { bones: 0, owned: ['carbon', 'ninguno'], hat: 'ninguno', color: 'carbon' };
  try { return Object.assign(def, JSON.parse(localStorage.getItem(SAVE_KEY) || '{}')); } catch { return def; }
})();
function persist() { if (VIEW) return; try { localStorage.setItem(SAVE_KEY, JSON.stringify(save)); } catch { } }

const COLORS = { carbon: { name: 'Carbón', hex: 0x262c3a, palm: 0x1d212b, price: 0 }, verde: { name: 'Verde Doga', hex: 0x2e5a3a, palm: 0x1f3a27, price: 3 },
  azul: { name: 'Azul noche', hex: 0x2b3a6b, palm: 0x1c2647, price: 5 }, coral: { name: 'Coral', hex: 0x8c3a2a, palm: 0x5a241a, price: 5 }, dorado: { name: 'Dorado', hex: 0x9a7a22, palm: 0x5e4a12, price: 20 } };
const HATS = { ninguno: { name: 'Sin gorro', price: 0 }, gorra: { name: 'Gorra Doga', price: 5 }, snake: { name: 'Chistera Snake', price: 10 }, hoja: { name: 'Hoja', price: 4 }, corona: { name: 'Corona', price: 15 } };

const power = { snake: 0, speed: 0 };
const powerMul = () => ({ jump: power.snake > 0 ? 1.8 : 1, fling: (power.snake > 0 ? 1.55 : 1) * (power.speed > 0 ? 1.25 : 1), cap: power.snake > 0 ? 15 : 9, speed: power.speed > 0 ? 1.55 : 1, move: power.speed > 0 ? 0.35 : 0.25 });

function refreshPlayerLook(t = 0) {
  const c = COLORS[save.color] || COLORS.carbon;
  playerArmMat.color.set(player.it ? IT_COLOR : c.hex);
  palmMat.color.set(c.palm);
  let em = player.it ? 0x5a0800 : 0x000000, k = 1;
  if (power.snake > 0) { em = 0x22ff66; k = 0.45 + 0.35 * Math.sin(t * 10); }
  else if (power.speed > 0) { em = 0x33ccff; k = 0.35 + 0.25 * Math.sin(t * 12); }
  playerArmMat.emissive.set(em); playerArmMat.emissiveIntensity = k;
  palmMat.emissive.set(power.snake > 0 ? 0x22ff66 : 0x000000); palmMat.emissiveIntensity = k;
}

// hats (shared builders for the preview avatar)
const hatMats = { green: new THREE.MeshStandardMaterial({ color: 0x2a6b3f }), lime: new THREE.MeshStandardMaterial({ color: 0xc8ec6b }),
  coral: new THREE.MeshStandardMaterial({ color: 0xef5b3a }), gold: new THREE.MeshStandardMaterial({ color: 0xf2c33a, metalness: 0.6, roughness: 0.3 }), leaf: new THREE.MeshStandardMaterial({ color: 0x4caf50, side: THREE.DoubleSide }) };
function buildHat(id) {
  const g = new THREE.Group();
  if (id === 'gorra') {
    const cap = new THREE.Mesh(new THREE.SphereGeometry(0.31, 14, 8, 0, Math.PI * 2, 0, Math.PI / 2), hatMats.green);
    const visor = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.22, 0.03, 14, 1, false, -Math.PI / 2, Math.PI), hatMats.lime); visor.position.set(0, 0.01, 0.18);
    g.add(cap, visor);
  } else if (id === 'snake') {
    const brim = new THREE.Mesh(new THREE.CylinderGeometry(0.36, 0.36, 0.04, 16), hatMats.green);
    const top = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.24, 0.42, 16), hatMats.green); top.position.y = 0.22;
    const band = new THREE.Mesh(new THREE.TorusGeometry(0.235, 0.035, 6, 20), hatMats.lime); band.rotation.x = Math.PI / 2; band.position.y = 0.08;
    g.add(brim, top, band);
  } else if (id === 'hoja') {
    const leaf = new THREE.Mesh(new THREE.SphereGeometry(0.3, 10, 6), hatMats.leaf); leaf.scale.set(0.5, 0.06, 1.2); leaf.rotation.z = 0.3; leaf.position.y = 0.2;
    const stem = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.02, 0.2), hatMats.green); stem.position.y = 0.08;
    g.add(leaf, stem);
  } else if (id === 'corona') {
    const ring = new THREE.Mesh(new THREE.CylinderGeometry(0.26, 0.26, 0.14, 12, 1, true), hatMats.gold); ring.position.y = 0.06;
    g.add(ring);
    for (let i = 0; i < 6; i++) { const sp = new THREE.Mesh(new THREE.ConeGeometry(0.06, 0.16, 4), hatMats.gold); const a = i / 6 * Math.PI * 2; sp.position.set(Math.cos(a) * 0.24, 0.2, Math.sin(a) * 0.24); g.add(sp); }
  }
  return g;
}

// ---- bones (one InstancedMesh: 1 draw call) ----
const BONE_N = 24;
const boneGeo = (() => {
  const parts = [new THREE.CylinderGeometry(0.05, 0.05, 0.42, 8).rotateZ(Math.PI / 2)];
  for (const [x, z] of [[-0.21, -0.05], [-0.21, 0.05], [0.21, -0.05], [0.21, 0.05]]) parts.push(new THREE.SphereGeometry(0.075, 8, 6).translate(x, z, 0));
  // manual merge (non-indexed)
  const pos = [], nor = [];
  for (const p of parts) { const q = p.toNonIndexed(); pos.push(...q.attributes.position.array); nor.push(...q.attributes.normal.array); }
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
  return g;
})();
const boneIM = new THREE.InstancedMesh(boneGeo, new THREE.MeshStandardMaterial({ color: 0xfff6dc, emissive: 0x6b5a2a, emissiveIntensity: 0.35, roughness: 0.6 }), BONE_N);
boneIM.instanceMatrix.setUsage(THREE.DynamicDrawUsage); boneIM.frustumCulled = false; scene.add(boneIM);
function randomSpot(minR = 4, maxR = 50) {
  if (CITY_SPOTS.length && rand() < 0.28) {
    const s = CITY_SPOTS[Math.floor(rand() * CITY_SPOTS.length)];
    return new THREE.Vector3(s.x + (rand() - 0.5) * 1.2, s.y, s.z + (rand() - 0.5) * 1.2);
  }
  for (let k = 0; k < 40; k++) {
    const a = rand() * Math.PI * 2, d = minR + rand() * (maxR - minR), x = Math.cos(a) * d, z = Math.sin(a) * d;
    if (inCity(x, z) && rand() < 0.5) { /* allow city plaza */ }
    else if (trunks.some(t => Math.hypot(t.x - x, t.z - z) < t.r + 0.8)) continue;
    if (Math.abs(x) < 3 && z < -14 && z > CITY.minZ && rand() < 0.7) continue; // keep tunnel clearer
    const y = supportHeight(x, z, 50);
    return new THREE.Vector3(x, y, z);
  }
  return new THREE.Vector3(0, 0, 8);
}
const bones = Array.from({ length: BONE_N }, (_, i) => ({ pos: randomSpot(), respawn: 0, ph: i }));
const _m4 = new THREE.Matrix4(), _q = new THREE.Quaternion(), _s = new THREE.Vector3(), _e = new THREE.Euler(), BONE_SCALE = new THREE.Vector3(1.4, 1.4, 1.4);

// ---- power-ups ----
const powerItems = [];
function makePowerItem(kind) {
  const g = new THREE.Group();
  if (kind === 'snake') {
    const orb = new THREE.Mesh(new THREE.IcosahedronGeometry(0.28, 1), new THREE.MeshStandardMaterial({ color: 0x2fd36b, emissive: 0x1aa84a, emissiveIntensity: 0.9, flatShading: true }));
    const coil = new THREE.Mesh(new THREE.TorusKnotGeometry(0.34, 0.045, 48, 6, 2, 3), new THREE.MeshStandardMaterial({ color: 0xc8ec6b, emissive: 0x3d6b10 }));
    g.add(orb, coil);
  } else {
    const orb = new THREE.Mesh(new THREE.OctahedronGeometry(0.3), new THREE.MeshStandardMaterial({ color: 0x46c8ff, emissive: 0x1a7fb0, emissiveIntensity: 0.9, flatShading: true }));
    const bolt = new THREE.Mesh(new THREE.ConeGeometry(0.1, 0.7, 4), new THREE.MeshStandardMaterial({ color: 0xffe14a, emissive: 0xaa8800 })); bolt.rotation.z = 0.5;
    g.add(orb, bolt);
  }
  const label = makeLabel(kind === 'snake' ? 'Salto Snake' : 'Turbo Doga'); label.position.y = 0.75; label.scale.set(1.1, 0.28, 1); g.add(label);
  scene.add(g);
  const it = { kind, g, pos: randomSpot(6, 45), respawn: 0 };
  powerItems.push(it);
  return it;
}
for (let i = 0; i < 4; i++) { makePowerItem('snake'); makePowerItem('speed'); }

// ---- tag bursts (pooled additive points + ring) ----
const BURST_N = 70;
const bursts = Array.from({ length: 3 }, () => {
  const geo = new THREE.BufferGeometry(); geo.setAttribute('position', new THREE.Float32BufferAttribute(new Float32Array(BURST_N * 3), 3));
  const pts = new THREE.Points(geo, new THREE.PointsMaterial({ color: 0x5dff8a, size: 0.16, transparent: true, opacity: 1, blending: THREE.AdditiveBlending, depthWrite: false }));
  const ring = new THREE.Mesh(new THREE.RingGeometry(0.5, 0.65, 32), new THREE.MeshBasicMaterial({ color: 0xc8ec6b, transparent: true, side: THREE.DoubleSide, blending: THREE.AdditiveBlending, depthWrite: false }));
  ring.rotation.x = -Math.PI / 2;
  pts.visible = ring.visible = false; pts.frustumCulled = false; scene.add(pts, ring);
  return { pts, ring, vel: new Float32Array(BURST_N * 3), life: 0 };
});
let burstIdx = 0;
function tagBurst(at) {
  const b = bursts[burstIdx++ % bursts.length], p = b.pts.geometry.attributes.position.array;
  for (let i = 0; i < BURST_N; i++) {
    p[i * 3] = at.x; p[i * 3 + 1] = at.y + 0.9; p[i * 3 + 2] = at.z;
    const v = new THREE.Vector3(rand() - 0.5, rand() * 0.9 + 0.1, rand() - 0.5).normalize().multiplyScalar(2.5 + rand() * 3.5);
    b.vel.set([v.x, v.y, v.z], i * 3);
  }
  b.pts.geometry.attributes.position.needsUpdate = true;
  b.ring.position.set(at.x, at.y + 0.08, at.z); b.life = 1; b.pts.visible = b.ring.visible = true;
}
function updateBursts(dt) {
  for (const b of bursts) {
    if (b.life <= 0) continue;
    b.life -= dt;
    const p = b.pts.geometry.attributes.position.array;
    for (let i = 0; i < BURST_N; i++) { b.vel[i * 3 + 1] -= 6 * dt; p[i * 3] += b.vel[i * 3] * dt; p[i * 3 + 1] += b.vel[i * 3 + 1] * dt; p[i * 3 + 2] += b.vel[i * 3 + 2] * dt; }
    b.pts.geometry.attributes.position.needsUpdate = true;
    b.pts.material.opacity = Math.max(0, b.life);
    b.ring.scale.setScalar(1 + (1 - b.life) * 5); b.ring.material.opacity = Math.max(0, b.life);
    if (b.life <= 0) b.pts.visible = b.ring.visible = false;
  }
}

// ---- cosmetics stand ("Tienda Doganiero") ----
const SHOP = new THREE.Vector3(10.2, 0, 2.2); // faces -X (toward the clearing centre)
const shopButtons = [];
let previewAvatar, previewHat;
{
  const g = new THREE.Group(); g.position.copy(SHOP); g.rotation.y = -Math.PI / 2; scene.add(g);
  const wood = new THREE.MeshStandardMaterial({ color: 0x9a6b41, roughness: 0.9 });
  const counter = new THREE.Mesh(new THREE.BoxGeometry(4.6, 1.0, 0.8), new THREE.MeshStandardMaterial({ color: 0x2a6b3f })); counter.position.set(0, 0.5, 0); g.add(counter);
  const back = new THREE.Mesh(new THREE.BoxGeometry(4.6, 2.6, 0.15), wood); back.position.set(0, 1.3, -0.9); g.add(back);
  for (const x of [-2.2, 2.2]) { const p = new THREE.Mesh(new THREE.BoxGeometry(0.15, 3.2, 0.15), wood); p.position.set(x, 1.6, 0.35); g.add(p); }
  const awning = new THREE.Mesh(new THREE.BoxGeometry(4.9, 0.12, 1.6), new THREE.MeshStandardMaterial({ color: 0xef5b3a })); awning.position.set(0, 3.25, -0.2); awning.rotation.x = 0.18; g.add(awning);
  const title = new THREE.Mesh(new THREE.PlaneGeometry(3.4, 0.55), new THREE.MeshBasicMaterial({ map: textTexture([{ text: 'TIENDA DOGANIERO', font: 'bold 64px system-ui' }, { text: 'Gasta tus Doga-huesos 🦴', font: '36px system-ui', color: '#c8ec6b' }], { w: 1024, h: 200 }) }));
  title.position.set(0, 2.05, -0.8); g.add(title);
  new THREE.TextureLoader().load('./assets/doganiero-logo.png', (t) => {
    t.colorSpace = THREE.SRGBColorSpace;
    const shopLogo = new THREE.Mesh(new THREE.PlaneGeometry(1.7, 1.22), new THREE.MeshBasicMaterial({ map: t, transparent: true, alphaTest: 0.05, depthWrite: false }));
    shopLogo.position.set(0, 2.85, -0.78); g.add(shopLogo);
  });
  g.traverse(o => { if (o.isMesh) { o.castShadow = o.receiveShadow = true; } });
  g.updateMatrixWorld(true);
  addBox(counter, 'wood'); // counter is climbable/solid
  // buttons: 2 rows on the counter's sloped front + back panel
  const items = [...Object.entries(HATS).map(([id, h]) => ({ type: 'hat', id, ...h })), ...Object.entries(COLORS).map(([id, c]) => ({ type: 'color', id, ...c }))];
  items.forEach((it, i) => {
    const row = it.type === 'hat' ? 0 : 1, col = row ? i - 5 : i;
    const tex = textTexture([''], { w: 256, h: 128 });
    const btn = new THREE.Mesh(new THREE.BoxGeometry(0.78, 0.4, 0.08), [hatMats.green, hatMats.green, hatMats.green, hatMats.green, new THREE.MeshBasicMaterial({ map: tex }), hatMats.green]);
    btn.position.set(-1.72 + col * 0.86, 1.62 - row * 0.5, -0.78);
    btn.userData = { item: it, tex, press: 0 };
    g.add(btn); shopButtons.push(btn);
  });
  // preview avatar wearing the current look
  previewAvatar = makeGorilla(COLORS.carbon.hex, 'Tu avatar');
  previewAvatar.position.set(-2.9, 0, 0.3); previewAvatar.rotation.y = 0.5; previewAvatar.scale.setScalar(0.9);
  g.add(previewAvatar);
  g.updateMatrixWorld(true);
}
function refreshShop() {
  for (const b of shopButtons) {
    const it = b.userData.item, owned = save.owned.includes(it.id), eq = (it.type === 'hat' ? save.hat : save.color) === it.id;
    const swatch = it.type === 'color' ? '#' + new THREE.Color(it.hex).offsetHSL(0, 0.1, 0.32).getHexString() : '#c8ec6b';
    b.userData.tex.redraw([{ text: (it.type === 'color' ? '● ' : '') + it.name, font: 'bold 34px system-ui', color: swatch },
      { text: eq ? '✔ PUESTO' : owned ? 'Ponerse' : `🦴 ${it.price}`, font: 'bold 32px system-ui', color: eq ? '#c8ec6b' : '#fffdf9' }]);
  }
  const c = COLORS[save.color] || COLORS.carbon, u = previewAvatar.userData;
  u.fur.color.set(c.hex);
  if (previewHat) previewAvatar.userData.torso.remove(previewHat);
  previewHat = buildHat(save.hat); previewHat.position.set(0, 1.6, 0.04); previewAvatar.userData.torso.add(previewHat);
  u.label.userData.tex.redraw([`Tu avatar · ${HATS[save.hat]?.name || ''}`]);
  refreshPlayerLook();
}
function pressShop(btn) {
  const it = btn.userData.item;
  if (btn.userData.press > 0) return;
  btn.userData.press = 0.6;
  if (!save.owned.includes(it.id)) {
    if (save.bones < it.price) { flashMsg(`Te faltan ${it.price - save.bones} Doga-huesos para ${it.name}`); beep(160); return; }
    save.bones -= it.price; save.owned.push(it.id); flashMsg(`¡Comprado: ${it.name}!`); beep(880);
  } else beep(660);
  if (it.type === 'hat') save.hat = it.id; else save.color = it.id;
  persist(); refreshShop();
}
const raycaster = new THREE.Raycaster();
function shopRaycast(ndcX, ndcY) {
  raycaster.setFromCamera(new THREE.Vector2(ndcX, ndcY), camera);
  raycaster.far = 6;
  const hit = raycaster.intersectObjects(shopButtons, false)[0];
  if (hit) { pressShop(hit.object); return true; }
  return false;
}
const _bw = new THREE.Vector3();
function updateShop(dt) {
  for (const b of shopButtons) {
    b.userData.press = Math.max(0, b.userData.press - dt);
    b.position.z = -0.78 - (b.userData.press > 0.4 ? 0.05 : 0);
  }
  if (rig.position.distanceTo(SHOP) > 6) return;
  // hand touch (VR, and desktop arm swipes)
  for (const h of hands) for (const b of shopButtons) {
    b.getWorldPosition(_bw);
    if (Math.abs(h.world.x - _bw.x) < 0.25 && Math.abs(h.world.y - _bw.y) < 0.24 && Math.abs(h.world.z - _bw.z) < 0.45 && h.world.distanceTo(_bw) < 0.5) pressShop(b);
  }
}

function placeItems(t) {
  bones.forEach((b, i) => { _m4.compose(_s.set(b.pos.x, b.pos.y + 0.55, b.pos.z), _q.setFromEuler(_e.set(0.3, b.ph, 0)), BONE_SCALE); boneIM.setMatrixAt(i, _m4); });
  boneIM.instanceMatrix.needsUpdate = true;
  for (const it of powerItems) it.g.position.set(it.pos.x, it.pos.y + 0.8, it.pos.z);
}
function updateCollectibles(dt, t) {
  const mul = powerMul();
  const body = tmpV.copy(rig.position); body.y += 0.7;
  bones.forEach((b, i) => {
    if (b.respawn > 0) { b.respawn -= dt; if (b.respawn <= 0) b.pos.copy(randomSpot()); _m4.makeScale(0, 0, 0); boneIM.setMatrixAt(i, _m4); return; }
    const y = b.pos.y + 0.55 + Math.sin(t * 2 + b.ph) * 0.12;
    _m4.compose(_s.set(b.pos.x, y, b.pos.z), _q.setFromEuler(_e.set(0.3, t * 1.6 + b.ph, 0)), BONE_SCALE);
    boneIM.setMatrixAt(i, _m4);
    const p = _s;
    if (body.distanceTo(p) < 1.0 || hands.some(h => h.world.distanceTo(p) < 0.45)) {
      save.bones++; b.respawn = 18 + rand() * 10; persist(); beep(990); refreshShop();
    }
  });
  boneIM.instanceMatrix.needsUpdate = true;
  for (const it of powerItems) {
    if (it.respawn > 0) { it.respawn -= dt; it.g.visible = false; if (it.respawn <= 0) it.pos.copy(randomSpot(6, 45)); continue; }
    it.g.visible = true;
    it.g.position.set(it.pos.x, it.pos.y + 0.8 + Math.sin(t * 2.5 + it.pos.x) * 0.15, it.pos.z);
    it.g.children[0].rotation.y = t * 2; it.g.children[1].rotation.y = -t * 3;
    if (body.distanceTo(it.g.position) < 1.1 || hands.some(h => h.world.distanceTo(it.g.position) < 0.55)) {
      power[it.kind] = 8; it.respawn = 25;
      flashMsg(it.kind === 'snake' ? '¡Salto Snake! Saltos y lanzamientos x2 durante 8 s' : '¡Turbo Doga! Más velocidad durante 8 s'); beep(it.kind === 'snake' ? 740 : 600);
    }
  }
  power.snake = Math.max(0, power.snake - dt); power.speed = Math.max(0, power.speed - dt);
  refreshPlayerLook(t);
  bonesEl.textContent = `🦴 Doga-huesos: ${save.bones}`;
  powerEl.textContent = [power.snake > 0 ? `🐍 Salto Snake ${power.snake.toFixed(1)}s` : '', power.speed > 0 ? `⚡ Turbo Doga ${power.speed.toFixed(1)}s` : ''].filter(Boolean).join('   ');
  powerEl.style.display = powerEl.textContent ? 'block' : 'none';
}
const bonesEl = document.getElementById('bones'), powerEl = document.getElementById('power');
refreshShop();
// bots wear cosmetics too (colour variants + hats from the Tienda)
['gorra', 'ninguno', 'hoja', 'corona', 'snake', 'ninguno'].forEach((hat, i) => {
  const b = entities[i + 1]; if (hat === 'ninguno') return;
  const h = buildHat(hat); h.position.set(0, 1.6, 0.04); b.mesh.userData.torso.add(h);
});
// Seed a few collectibles into Ciudad Doganiero rooftops/plaza
if (CITY_SPOTS.length) {
  for (let i = 0; i < 6 && i < bones.length; i++) {
    const s = CITY_SPOTS[i % CITY_SPOTS.length];
    bones[i].pos.set(s.x + (i % 3 - 1) * 0.8, s.y, s.z + ((i * 1.7) % 3 - 1) * 0.8);
    bones[i].respawn = 0;
  }
  if (powerItems[0]) { const s = CITY_SPOTS[Math.min(3, CITY_SPOTS.length - 1)]; powerItems[0].pos.set(s.x, s.y, s.z); powerItems[0].respawn = 0; }
  if (powerItems[1]) { powerItems[1].pos.set(0.8, 0.6, -29.2); powerItems[1].respawn = 0; }
}
placeItems(0);
bonesEl.textContent = `🦴 Doga-huesos: ${save.bones}`;

// ---------- screenshot / test views ----------
function applyView() {
  if (VIEW === 'forest') { rig.position.set(6, 0, 30); rig.position.y = heightAt(6, 30); yaw = 0.35; pitch = 0.05; bones[0].pos.set(5.2, heightAt(5.2, 26.5), 26.5); powerItems[1].pos.set(7.4, heightAt(7.4, 25.5), 25.5); }
  else if (VIEW === 'doganiero') { rig.position.set(2, 0, 22); rig.position.y = heightAt(2, 22); yaw = 0.05; pitch = 0.12; bones[0].pos.set(0.5, heightAt(0.5, 17), 17); powerItems[0].pos.set(4, heightAt(4, 16), 16); }
  else if (VIEW === 'arms') {
    rig.position.set(1.5, 0, 6); rig.position.y = heightAt(1.5, 6); yaw = 0.0; pitch = -0.12;
    // bring some bots into view in front of the player
    const bots = entities.filter(e => !e.isPlayer);
    [[-1.7, 2.2], [1.5, 1.2], [-3.6, -1.0], [3.4, -2.0]].forEach(([x, z], i) => { const b = bots[i]; b.pos.set(x, heightAt(x, z), z); b.hold = true; b.mesh.rotation.y = -x * 0.12; const [la, ra] = b.mesh.userData.arms; la.rotation.set(-0.5 + i * 0.2, 0, -0.35); ra.rotation.set(-0.2 - i * 0.15, 0, 0.45); });
    bones[0].pos.set(0.1, 0, 3.4); powerItems[0].pos.set(-3.2, 0, 2.6);
    setTimeout(() => tagBurst(bots[1].pos), 150);
  } else if (VIEW === 'avatar') {
    rig.position.set(-0.6, 0, 7.6); yaw = 0; pitch = -0.1;
    const bots = entities.filter(e => !e.isPlayer);
    bots.forEach((b, i) => { if (i > 1) b.pos.set(30 + i * 3, 0, -30); });
    bots[0].pos.set(-1.1, 0, 5.2); bots[0].hold = true; bots[0].mesh.rotation.y = 0.25;
    bots[3].pos.set(1.0, 0, 3.7); bots[3].hold = true; bots[3].mesh.rotation.y = -0.45;
    for (const b of [bots[0], bots[3]]) { b.pos.y = heightAt(b.pos.x, b.pos.z); const [la, ra] = b.mesh.userData.arms; la.rotation.set(-0.35, 0, -0.32); ra.rotation.set(-0.35, 0, 0.32); }
  } else if (VIEW === 'tienda') {
    rig.position.set(5.9, 0, 2.7); yaw = -Math.PI / 2 + 0.1; pitch = -0.1;
    save.bones = 42; save.owned.push('gorra', 'snake', 'verde'); save.hat = 'snake';
    bones[0].pos.set(7.9, 0, 1.6); bones[1].pos.set(8.3, 0, 2.7);
    powerItems[0].pos.set(8.4, 0, 5.0); powerItems[1].pos.set(7.7, 0, 3.9);
    for (const e of entities) if (!e.isPlayer && e.pos.distanceTo(SHOP) < 6) e.pos.x -= 8;
    refreshShop(); placeItems(0);
    bonesEl.textContent = `🦴 Doga-huesos: ${save.bones}`;
  } else if (VIEW === 'ciudad') {
    rig.position.set(0, 0, -24.5); yaw = 0; pitch = 0.08;
    const bots = entities.filter(e => !e.isPlayer);
    [[-2.5, -30], [3, -33], [-6, -37], [5, -41], [0, -45], [8, -35]].forEach(([x, z], i) => {
      const b = bots[i]; if (!b) return;
      b.pos.set(x, supportHeight(x, z, 40), z); b.hold = true;
      b.mesh.rotation.y = Math.atan2(-x, -z + 37);
    });
    if (CITY_SPOTS[0]) { bones[0].pos.copy(CITY_SPOTS[0]); bones[0].pos.y += 0.1; bones[0].respawn = 0; }
    if (CITY_SPOTS[2]) { bones[1].pos.copy(CITY_SPOTS[2]); bones[1].respawn = 0; }
    powerItems[0].pos.set(-6.5, 2.9, -33.5); powerItems[0].respawn = 0;
    powerItems[1].pos.set(0.5, 0.7, -29.2); powerItems[1].respawn = 0;
    placeItems(0);
  }
}
applyView();
setIt(entities[1 + Math.floor(rand() * BOT_NAMES.length)], null);
if (VIEW === 'avatar') setIt(entities[4], null); // show the red 'it' glow in the close-up
msgT = 0;

// ---------- main loop ----------
const clock = new THREE.Clock();
let simT = 0;
renderer.setAnimationLoop(() => {
  const dt = Math.min(clock.getDelta(), 0.05);
  const run = started && !(FREEZE && simT > 0.6);
  if (run) {
    simT += dt;
    if (inVR) updatePlayerVR(dt); else updatePlayerDesktop(dt, simT);
    for (const e of entities) {
      if (!e.isPlayer) updateBot(e, dt, simT);
      e.cooldown = Math.max(0, e.cooldown - dt);
      if (!e.it) e.safeTime += dt;
    }
    checkTags();
    updateCollectibles(dt, simT); updateShop(dt); updateBursts(dt);
    updateHud(dt);
  } else if (!inVR) {
    rig.rotation.set(0, yaw, 0); camera.rotation.set(pitch, 0, 0); camera.updateMatrixWorld(true);
    if (!run && !started) updatePlayerDesktop(0, 0);
    for (const e of entities) if (!e.isPlayer) { e.mesh.position.copy(e.pos); }
  }
  drawArms();
  updateListener();
  renderer.render(scene, camera);
});

addEventListener('resize', () => { camera.aspect = innerWidth / innerHeight; camera.updateProjectionMatrix(); renderer.setSize(innerWidth, innerHeight); });
window.__game = {
  THREE, scene, rig, camera, entities, player, hands, boxes, trunks, setIt, save, power, bones, powerItems, shopButtons, pressShop, tagBurst, CITY, CITY_SPOTS, inCity,
  keys, ensureAudio, playImpact, surfaceAt, startTitleMusic, fadeOutTitleMusic, get musicPlaying() { return musicPlaying; }, get musicMuted() { return musicMuted; },
  get yaw() { return yaw; }, get pitch() { return pitch; },
  look(y, p) { yaw = y; if (p != null) pitch = p; },
  get simT() { return simT; },
};
