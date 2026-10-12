// Entrenamiento offline de la "IA entrenada" de Snake Racing por neuroevolución (ES simple).
// Reutiliza buildTrack/sensores del juego cargando snake-racing.js en un sandbox sin DOM y
// replica la física de stepCar (mantener sincronizado con snake-racing.js).
// Uso: node tools/train-racing-ai.js [generaciones] > snake-racing-net.js
'use strict';
const fs = require('fs'), vm = require('vm'), path = require('path');
const src = fs.readFileSync(path.join(__dirname, '..', 'snake-racing.js'), 'utf8');
const win = {};
vm.runInNewContext(src.replace('global.renderSnakeRacingApp = renderSnakeRacingApp;', 'global.__T = { buildTrack: buildTrack, nearestIdx: function(){return nearestIdx.apply(null, arguments);}, setT: function(t){TRACK=t;} };'), { window: win, Math, JSON });
const T = win.__T.buildTrack(); win.__T.setT(T);
const sensors = win.SNK_RACING_SENSORS;
const MAXV = 820, ACC = 520, BRAKE = 900, REV = 220, TW = 150;
const NI = 8, NH = 10, NO = 2;
function forward(W, x) {
  const h = [];
  for (let i = 0; i < NH; i++) { let a = W.b1[i]; for (let j = 0; j < NI; j++) a += W.w1[i][j] * x[j]; h.push(Math.tanh(a)); }
  const o = [];
  for (let i = 0; i < NO; i++) { let b = W.b2[i]; for (let j = 0; j < NH; j++) b += W.w2[i][j] * h[j]; o.push(Math.tanh(b)); }
  return o;
}
function sim(W, secs, skill) {
  const P = T.pts, N = T.N, p0 = P[N - 10];
  const c = { x: p0.x, y: p0.y, a: Math.atan2(p0.ty, p0.tx), vx: 0, vy: 0, steer: 0, idx: N - 10 };
  let prog = 0, last = c.idx, offPen = 0, dt = 1 / 30;
  for (let t = 0; t < secs * 30; t++) {
    const o = forward(W, sensors(T, c, MAXV, TW));
    const inp = { steer: Math.max(-1, Math.min(1, o[0])), up: o[1] > -0.2, down: o[1] < -0.6 };
    let fx = Math.cos(c.a), fy = Math.sin(c.a);
    let fwd = c.vx * fx + c.vy * fy, lat = -c.vx * fy + c.vy * fx;
    const near = win.__T.nearestIdx(c.x, c.y, c.idx); c.idx = near.i;
    const d = Math.sqrt(near.d2), off = d > TW / 2 + 10, grass = d > TW / 2 + 45;
    const maxv = MAXV * skill * (grass ? 0.45 : off ? 0.8 : 1);
    if (inp.up) fwd += ACC * dt * (1 - Math.max(0, fwd) / maxv);
    if (inp.down) fwd -= (fwd > 20 ? BRAKE : REV) * dt;
    if (!inp.up && !inp.down) fwd *= Math.pow(0.55, dt);
    if (fwd > maxv) fwd += (maxv - fwd) * Math.min(1, dt * 3);
    if (fwd < -REV) fwd = -REV;
    c.steer += (inp.steer - c.steer) * Math.min(1, dt * 10);
    const sp = Math.abs(fwd);
    c.a += c.steer * Math.min(1, sp / 140) * (2.9 - 1.2 * Math.min(1, sp / MAXV)) * dt * (fwd >= 0 ? 1 : -1);
    lat *= Math.exp(-(grass ? 6 : 14) * dt);
    fx = Math.cos(c.a); fy = Math.sin(c.a);
    c.vx = fx * fwd - fy * lat; c.vy = fy * fwd + fx * lat;
    c.x += c.vx * dt; c.y += c.vy * dt;
    if (d > TW / 2 + 120) return prog - 2000;          // contra el muro: descalificado
    if (off) offPen += grass ? 40 : 4;
    let di = c.idx - last; if (di < -N / 2) di += N; if (di > N / 2) di -= N; if (di > 12) return prog - 3000;               // atajo: descalificado
    prog += di; last = c.idx;
  }
  return prog - offPen * 0.05;
}
function rnd() { return (Math.random() * 2 - 1); }
function make(f) { return { w1: Array.from({ length: NH }, () => Array.from({ length: NI }, f)), b1: Array.from({ length: NH }, f), w2: Array.from({ length: NO }, () => Array.from({ length: NH }, f)), b2: Array.from({ length: NO }, f) }; }
function flat(W) { return [].concat(...W.w1, W.b1, ...W.w2, W.b2); }
function unflat(v) { let k = 0; return make(() => v[k++]); }
const GENS = +process.argv[2] || 120, POP = 60, ELITE = 8;
let pop = Array.from({ length: POP }, () => flat(make(() => rnd() * 0.8)));
let best = null, bestF = -1e9;
for (let g = 0; g < GENS; g++) {
  const scored = pop.map(v => ({ v, f: sim(unflat(v), 45, 1.0) })).sort((a, b) => b.f - a.f);
  if (scored[0].f > bestF) { bestF = scored[0].f; best = scored[0].v.slice(); }
  if (g % 10 === 0 || g === GENS - 1) process.stderr.write(`gen ${g} best ${scored[0].f.toFixed(0)} (vueltas≈${(scored[0].f / T.N).toFixed(2)} en 45 s)\n`);
  const elite = scored.slice(0, ELITE).map(s => s.v);
  const sigma = 0.25 * (1 - g / GENS) + 0.03;
  pop = [best.slice()];
  while (pop.length < POP) { const p = elite[Math.floor(Math.random() * ELITE)]; pop.push(p.map(x => x + rnd() * sigma * (Math.random() < 0.3 ? 1 : 0))); }
}
const W = unflat(best), r = x => Math.round(x * 1e4) / 1e4;
const out = { w1: W.w1.map(a => a.map(r)), b1: W.b1.map(r), w2: W.w2.map(a => a.map(r)), b2: W.b2.map(r) };
process.stderr.write(`final: ${(bestF / T.N).toFixed(2)} vueltas en 45 s (referencia IA clásica ≈ 2.0)\n`);
process.stdout.write('/* Snake Racing · red neuronal de la "IA entrenada" (neuroevolución offline, tools/train-racing-ai.js) */\nwindow.SNK_RACING_NET = ' + JSON.stringify(out) + ';\n');
