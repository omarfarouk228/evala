// Rendu des lutteurs : anatomie dessinée en profil.
// Chaque segment du corps est une silhouette musculaire (profil avant / arrière le long de l'os),
// éclairée en couches : lumière du soleil, ombre propre, lumière renvoyée par la latérite,
// reflets de la peau graissée, lignes de séparation des muscles.

import { shade, lerp, clamp, hex } from './paint.js';

const L0 = { thigh: 0.45, shin: 0.44, upper: 0.3, fore: 0.27, torso: 0.53, neck: 0.05, head: 0.25 };
let L = L0;
// Morphologie : body = { build (largeur 0.85..1.25), height (0.92..1.08), head (0.95..1.08) }
function bodyOf(w) { return Object.assign({ build: 1, height: 1, head: 1 }, (w.look && w.look.body) || {}); }
function lengths(body) { const h = body.height; return { thigh: L0.thigh * h, shin: L0.shin * h, upper: L0.upper * h, fore: L0.fore * h, torso: L0.torso * h, neck: L0.neck, head: L0.head * body.head }; }
const SUN = [-0.62, -0.78];     // direction de la lumière à l'écran (vient d'en haut à gauche)

function ik(ax, ay, tx, ty, l1, l2, bend) {
  let dx = tx - ax, dy = ty - ay;
  let d = Math.hypot(dx, dy);
  const maxd = l1 + l2 - 1e-4;
  if (d > maxd) { dx *= maxd / d; dy *= maxd / d; d = maxd; }
  d = Math.max(d, Math.abs(l1 - l2) + 1e-4);
  const a = Math.acos(clamp((l1 * l1 + d * d - l2 * l2) / (2 * l1 * d), -1, 1));
  const base = Math.atan2(dy, dx);
  const ang = base + a * bend;
  return [ax + Math.cos(ang) * l1, ay + Math.sin(ang) * l1, ax + dx, ay + dy];
}

// ------------------------------------------------------------ état visuel
export function makeVis() {
  return { crouch: 0.25, th: 0.5, hipX: 0, fall: 0, walk: 0, armsUp: 0, reach: 0, earth: 0, trip: 0, lift: 0, wob: 0, dustHands: 0, breath: 0 };
}
const approach = (v, t, k, dt) => v + (t - v) * Math.min(1, k * dt);

export function updateVis(vis, w, o, bout, dt) {
  const clinch = bout.clinch;
  let crouch = 0.3, th = 0.42, hipX = 0, reach = 0, earth = 0, trip = 0, lift = 0, armsUp = 0;
  if (clinch) {
    th = 0.66 + w.lean * 0.45; crouch = 0.4 + Math.max(0, w.input) * 0.1;
    hipX = -0.12 - Math.max(0, w.lean) * 0.1 + Math.min(0, w.lean) * 0.08;
  } else th = 0.38 + w.lean * 0.35 + (w.input > 0 ? 0.08 : 0);
  if (w.act === 'reach') { reach = 1; th += 0.18; }
  if (w.act === 'miss') { reach = 0.6; th += 0.3; crouch += 0.1; }
  if (w.act === 'earth') earth = 1;
  if (w.act === 'trip') trip = Math.sin(clamp(w.actT / w.actDur, 0, 1) * Math.PI);
  if (w.act === 'lift') { lift = clamp(w.actT / w.actDur, 0, 1); crouch = 0.55 - lift * 0.4; th = 0.5 - lift * 0.3; }
  if (w.act === 'win') { armsUp = 1; th = 0.04; crouch = 0.04; }
  if (w.act === 'stagger') vis.wob = 1;
  if (w.fallen) {
    // chute articulée : genoux qui plient, buste qui part, bras qui cherchent le sol
    const f = vis.fall;
    crouch = 0.25 + f * 0.15; th = (w.fallDir > 0 ? 0.6 : -0.2) * Math.min(1, f * 1.6) + 0.4 * (1 - f);
    reach = w.fallDir > 0 ? 1 : 0; armsUp = w.fallDir < 0 ? 0.8 : 0;
  }
  vis.wob = approach(vis.wob, 0, 3, dt);
  vis.crouch = approach(vis.crouch, crouch + (earth ? 0.5 : 0), 9, dt);
  vis.th = approach(vis.th, th + (earth ? 0.55 : 0), 8, dt);
  vis.hipX = approach(vis.hipX, hipX, 8, dt);
  vis.reach = approach(vis.reach, reach, 14, dt);
  vis.earth = approach(vis.earth, earth, 7, dt);
  vis.trip = approach(vis.trip, trip, 16, dt);
  vis.lift = approach(vis.lift, lift, 10, dt);
  vis.armsUp = approach(vis.armsUp, armsUp, 4, dt);
  if (w.act === 'earth' && w.actT > 0.5) vis.dustHands = 1;
  vis.dustHands = Math.max(0, vis.dustHands - dt * 0.08);
  vis.walk += Math.abs(w.vx) * dt * 5.5;
  vis.breath += dt * (2 + (1 - w.stamina) * 5);
  vis.fall = w.fallen ? Math.min(1, vis.fall + dt * 2.2) : approach(vis.fall, 0, 6, dt);
  // sable qui colle à la peau après une chute, sueur quand le souffle manque
  vis.dust = w.fallen ? Math.min(1, (vis.dust || 0) + dt * 1.5) : (vis.dust || 0);
  vis.sweat = 1 - w.stamina;
  // expression : effort (poussée, soulevé, crochet), cri (chute), joie (victoire)
  const effort = (bout.clinch && w.input !== 0) || w.act === 'lift' || w.act === 'trip' ? 1 : 0;
  vis.effort = approach(vis.effort || 0, effort, 6, dt);
  vis.cry = w.fallen ? Math.min(1, (vis.cry || 0) + dt * 6) : approach(vis.cry || 0, 0, 2, dt);
  vis.smile = approach(vis.smile || 0, w.act === 'win' ? 1 : 0, 3, dt);
  void o;
}

// ------------------------------------------------------------ squelette (repère local, mètres)
function skeleton(vis, w, o, bout) {
  L = lengths(bodyOf(w));
  const hipH = lerp(0.97 * bodyOf(w).height, 0.55 * bodyOf(w).height, clamp(vis.crouch, 0, 1));
  const breath = Math.sin(vis.breath) * 0.005;
  const wob = Math.sin(vis.breath * 7) * 0.12 * vis.wob;
  const th = vis.th + wob;
  const pelvis = [vis.hipX, hipH];
  const tx = Math.sin(th), ty = Math.cos(th);
  const shoulder = [pelvis[0] + tx * L.torso * 0.9, pelvis[1] + ty * L.torso * 0.9 + breath];
  const neckBase = [pelvis[0] + tx * L.torso, pelvis[1] + ty * L.torso + breath];
  const headTh = th * 0.45 - 0.05;
  const head = [neckBase[0] + Math.sin(th * 0.7) * L.neck + Math.sin(headTh) * L.head * 0.36, neckBase[1] + Math.cos(th * 0.7) * L.neck + Math.cos(headTh) * L.head * 0.36];

  const ph = vis.walk, step = Math.min(1, Math.abs(w.vx) * 1.2);
  let ff = [0.34 + Math.sin(ph) * 0.12 * step + vis.hipX * 0.5, Math.max(0, Math.sin(ph) * 0.07 * step)];
  let bf = [-0.36 - Math.sin(ph) * 0.12 * step + vis.hipX * 0.5, Math.max(0, -Math.sin(ph) * 0.07 * step)];
  if (bout.clinch) { ff = [0.28, 0]; bf = [-0.5 - Math.max(0, w.lean) * 0.12, 0]; }
  if (vis.trip > 0.02) ff = [lerp(ff[0], 0.8, vis.trip), lerp(0, 0.16, vis.trip)];
  if (vis.earth > 0.02) { ff = [0.38, 0]; bf = [-0.3, 0]; }

  let hn, hf;
  if (bout.clinch && !w.fallen) {
    const gap = Math.abs(o.x - w.x);
    hn = [gap + 0.02, shoulder[1] - 0.06 - vis.lift * 0.25];
    hf = [gap + 0.06, shoulder[1] - 0.3 - vis.lift * 0.2];
  } else if (vis.earth > 0.3) {
    hn = [0.46, 0.05]; hf = [0.32, 0.05];
  } else {
    const r = vis.reach;
    hn = [lerp(0.3, 0.72, r) + shoulder[0] * 0.5, lerp(shoulder[1] - 0.36, shoulder[1] - 0.04, r)];
    hf = [lerp(0.18, 0.66, r) + shoulder[0] * 0.5, lerp(shoulder[1] - 0.42, shoulder[1] - 0.1, r)];
  }
  if (vis.armsUp > 0.02) {
    hn = [lerp(hn[0], shoulder[0] + 0.14, vis.armsUp), lerp(hn[1], shoulder[1] + 0.5, vis.armsUp)];
    hf = [lerp(hf[0], shoulder[0] - 0.1, vis.armsUp), lerp(hf[1], shoulder[1] + 0.48, vis.armsUp)];
  }
  const hipN = [pelvis[0] + 0.03, pelvis[1] - 0.02], hipF = [pelvis[0] - 0.03, pelvis[1] - 0.02];
  const legN = ik(hipN[0], hipN[1], ff[0] - 0.04, ff[1] + 0.075, L.thigh, L.shin, 1);
  const legF = ik(hipF[0], hipF[1], bf[0] - 0.04, bf[1] + 0.075, L.thigh, L.shin, 1);
  const shN = [shoulder[0] + 0.02, shoulder[1] - 0.02], shF = [shoulder[0] - 0.04, shoulder[1] - 0.01];
  const armN = ik(shN[0], shN[1], hn[0], hn[1], L.upper, L.fore, -1);
  const armF = ik(shF[0], shF[1], hf[0], hf[1], L.upper, L.fore, -1);
  return { pelvis, shoulder, neckBase, head, headTh, ff, bf, legN, legF, armN, armF, hipN, hipF, shN, shF, th };
}

// ------------------------------------------------------------ peinture d'un segment musculaire
// prof : [[t, avant, arrière], ...] demi-largeurs en mètres le long de l'os (t de 0 à 1)
function outline(a, b, prof, flip) {
  const dx = b[0] - a[0], dy = b[1] - a[1], len = Math.hypot(dx, dy) || 1e-6;
  const ux = dx / len, uy = dy / len;
  let nx = -uy, ny = ux; if (flip) { nx = -nx; ny = -ny; }
  const left = [], right = [];
  for (const [t, f, k] of prof) {
    const px = a[0] + ux * len * t, py = a[1] + uy * len * t;
    left.push([px + nx * f, py + ny * f]);
    right.push([px - nx * k, py - ny * k]);
  }
  return { pts: left.concat(right.reverse()), n: [nx, ny], u: [ux, uy], len };
}

function smoothPath(ctx, pts) {
  const n = pts.length;
  ctx.beginPath();
  ctx.moveTo((pts[0][0] + pts[n - 1][0]) / 2, (pts[0][1] + pts[n - 1][1]) / 2);
  for (let i = 0; i < n; i++) {
    const p = pts[i], q = pts[(i + 1) % n];
    ctx.quadraticCurveTo(p[0], p[1], (p[0] + q[0]) / 2, (p[1] + q[1]) / 2);
  }
  ctx.closePath();
}

// Palette de peau dérivée d'une couleur de base
export function skinPalette(base, far) {
  const k = far ? -0.3 : 0;
  return {
    base: shade(base, k),
    light: shade(base, 0.32 + k * 0.5),
    hi: shade(base, 0.55 + k * 0.5),
    core: shade(base, -0.48 + k * 0.2),
    deep: shade(base, -0.62),
    bounce: mixc(shade(base, -0.15 + k), '#b5582f', 0.28),   // reflet rouge de la latérite
    spec: far ? 'rgba(255,226,196,0.10)' : 'rgba(255,230,200,0.38)',
  };
}
function mixc(c1, c2, t) {
  const a = c1.startsWith('#') ? hex(c1) : c1.match(/\d+/g).map(Number);
  const b = c2.startsWith('#') ? hex(c2) : c2.match(/\d+/g).map(Number);
  return `rgb(${a.map((v, i) => Math.round(v + (b[i] - v) * t)).join(',')})`;
}

// Peint une forme (déjà en coordonnées écran) avec l'éclairage de peau.
// n : normale (écran) du côté « avant » de la forme ; c : centre ; r : demi-largeur caractéristique
function paintSkin(ctx, pts, c, n, r, pal, gloss = 1) {
  smoothPath(ctx, pts);
  const litSide = (n[0] * SUN[0] + n[1] * SUN[1]) > 0 ? 1 : -1;  // côté de la normale tourné vers le soleil ?
  const lx = n[0] * litSide, ly = n[1] * litSide;               // vers la lumière
  const g = ctx.createLinearGradient(c[0] + lx * r * 1.1, c[1] + ly * r * 1.1, c[0] - lx * r * 1.1, c[1] - ly * r * 1.1);
  g.addColorStop(0, pal.light); g.addColorStop(0.18, pal.light); g.addColorStop(0.42, pal.base);
  g.addColorStop(0.72, pal.core); g.addColorStop(0.9, pal.core); g.addColorStop(1, pal.bounce);
  ctx.fillStyle = g; ctx.fill();
  return [lx, ly];
}

function seg(ctx, P, a, b, prof, pal, opts = {}) {
  const o = outline(a, b, prof, opts.flip);
  const pts = o.pts.map(P);
  const A = P(a), B = P(b);
  // normale à l'écran
  const n0 = P([a[0] + o.n[0] * 0.1, a[1] + o.n[1] * 0.1]);
  let nx = n0[0] - A[0], ny = n0[1] - A[1]; const nl = Math.hypot(nx, ny) || 1; nx /= nl; ny /= nl;
  const c = [(A[0] + B[0]) / 2, (A[1] + B[1]) / 2];
  const wmax = Math.max(...prof.map(p => Math.max(p[1], p[2])));
  const r = wmax * opts.ppm;
  const [lx, ly] = paintSkin(ctx, pts, c, [nx, ny], r, pal);
  // reflet de graisse : trait fin le long du bord éclairé
  ctx.save();
  smoothPath(ctx, pts); ctx.clip();
  const ox = lx * r * 0.45, oy = ly * r * 0.45;
  ctx.lineCap = 'round';
  ctx.strokeStyle = pal.spec; ctx.lineWidth = Math.max(1, r * 0.22);
  ctx.beginPath(); ctx.moveTo(A[0] + ox + (B[0] - A[0]) * 0.12, A[1] + oy + (B[1] - A[1]) * 0.12); ctx.lineTo(A[0] + ox + (B[0] - A[0]) * 0.78, A[1] + oy + (B[1] - A[1]) * 0.78); ctx.stroke();
  ctx.strokeStyle = 'rgba(255,240,220,0.08)'; ctx.lineWidth = r * 0.7;
  ctx.beginPath(); ctx.moveTo(A[0] + ox * 0.6, A[1] + oy * 0.6); ctx.lineTo(B[0] + ox * 0.6, B[1] + oy * 0.6); ctx.stroke();
  // lignes de séparation des muscles
  if (opts.lines) {
    ctx.strokeStyle = 'rgba(25,8,2,0.28)'; ctx.lineWidth = Math.max(0.8, r * 0.06);
    for (const ln of opts.lines) {
      const p0 = P(ln[0]), p1 = P(ln[1]), pc = P(ln[2]);
      ctx.beginPath(); ctx.moveTo(p0[0], p0[1]); ctx.quadraticCurveTo(pc[0], pc[1], p1[0], p1[1]); ctx.stroke();
    }
  }
  ctx.restore();
  return o;
}

// Point le long d'un os, décalé sur la normale (pour placer les lignes de muscles)
function along(a, b, t, off, flip) {
  const dx = b[0] - a[0], dy = b[1] - a[1], len = Math.hypot(dx, dy) || 1e-6;
  let nx = -dy / len, ny = dx / len; if (flip) { nx = -nx; ny = -ny; }
  return [a[0] + dx * t + nx * off, a[1] + dy * t + ny * off];
}

// ------------------------------------------------------------ membres d'un seul tenant
// Construit la silhouette d'une chaîne d'os (hanche → genou → cheville) à partir des profils
// de chaque segment, avec des normales lissées aux articulations : pas de raccord visible.
function chainSamples(bones, profs, flip) {
  const segs = [];
  for (let k = 0; k < bones.length - 1; k++) {
    const a = bones[k], b = bones[k + 1];
    const dx = b[0] - a[0], dy = b[1] - a[1], len = Math.hypot(dx, dy) || 1e-6;
    let nx = -dy / len, ny = dx / len; if (flip) { nx = -nx; ny = -ny; }
    segs.push({ a, b, ux: dx / len, uy: dy / len, nx, ny, len });
  }
  const out = [];
  segs.forEach((s, k) => {
    for (const [t, f, bk] of profs[k]) {
      if (t < 0 && k > 0) continue;
      if (t > 1 && k < segs.length - 1) continue;
      let nx = s.nx, ny = s.ny;
      if (t < 0.18 && k > 0) { const p = segs[k - 1], m = 0.5 * (1 - t / 0.18); nx = lerp(nx, p.nx, m); ny = lerp(ny, p.ny, m); }
      if (t > 0.82 && k < segs.length - 1) { const q = segs[k + 1], m = 0.5 * ((t - 0.82) / 0.18); nx = lerp(nx, q.nx, m); ny = lerp(ny, q.ny, m); }
      const nl = Math.hypot(nx, ny) || 1; nx /= nl; ny /= nl;
      out.push({ c: [s.a[0] + s.ux * s.len * t, s.a[1] + s.uy * s.len * t], n: [nx, ny], f, b: bk });
    }
  });
  return out;
}

function strokeAlong(ctx, pts) {
  ctx.beginPath(); ctx.moveTo(pts[0][0], pts[0][1]);
  for (let i = 1; i < pts.length - 1; i++) { const p = pts[i], q = pts[i + 1]; ctx.quadraticCurveTo(p[0], p[1], (p[0] + q[0]) / 2, (p[1] + q[1]) / 2); }
  const l = pts[pts.length - 1]; ctx.lineTo(l[0], l[1]); ctx.stroke();
}

// Peint une chaîne : remplissage, puis lumière et ombre en traits doux continus, coupés à la silhouette
function paintChain(ctx, P, samples, pal, ppm, extra) {
  const left = samples.map(s => P([s.c[0] + s.n[0] * s.f, s.c[1] + s.n[1] * s.f]));
  const right = samples.map(s => P([s.c[0] - s.n[0] * s.b, s.c[1] - s.n[1] * s.b])).reverse();
  const outlinePts = left.concat(right);
  smoothPath(ctx, outlinePts);
  ctx.fillStyle = pal.base; ctx.fill();
  ctx.save(); smoothPath(ctx, outlinePts); ctx.clip();
  // repère écran par échantillon
  const fr = samples.map(s => {
    const mid = [s.c[0] + s.n[0] * (s.f - s.b) / 2, s.c[1] + s.n[1] * (s.f - s.b) / 2];
    const c = P(mid), e = P([mid[0] + s.n[0] * 0.05, mid[1] + s.n[1] * 0.05]);
    let nx = e[0] - c[0], ny = e[1] - c[1]; const l = Math.hypot(nx, ny) || 1; nx /= l; ny /= l;
    const side = (nx * SUN[0] + ny * SUN[1]) >= 0 ? 1 : -1;
    return { c, lx: nx * side, ly: ny * side, hw: (s.f + s.b) / 2 * ppm };
  });
  const avg = fr.reduce((a, f) => a + f.hw, 0) / fr.length;
  const layer = (off, width, col, alpha) => {
    ctx.strokeStyle = col; ctx.globalAlpha = alpha; ctx.lineWidth = Math.max(1, width * avg); ctx.lineCap = 'round'; ctx.lineJoin = 'round';
    strokeAlong(ctx, fr.map(f => [f.c[0] + f.lx * f.hw * off, f.c[1] + f.ly * f.hw * off]));
  };
  // ombre propre (large et douce), lumière renvoyée par la terre, lumière principale, reflet gras
  // dégradés obtenus par superposition de traits très transparents (pas de bandes visibles)
  for (let k = 0; k < 7; k++) layer(-0.25 - k * 0.11, 0.55, pal.core, 0.11);
  layer(-0.97, 0.22, pal.bounce, 0.4);
  for (let k = 0; k < 6; k++) layer(0.15 + k * 0.1, 0.5, pal.light, 0.08);
  layer(0.62, 0.22, pal.hi, 0.16);
  layer(0.48, 0.12, pal.spec, 0.35); layer(0.5, 0.04, 'rgba(255,245,230,0.5)', 0.3);
  ctx.globalAlpha = 1;
  if (extra) extra();
  ctx.restore();
}

function muscleLines(ctx, P, lines, pal, w) {
  ctx.strokeStyle = 'rgba(25,8,2,0.22)'; ctx.lineWidth = Math.max(0.8, w); ctx.lineCap = 'round';
  for (const ln of lines) {
    const p0 = P(ln[0]), p1 = P(ln[1]), pc = P(ln[2]);
    ctx.beginPath(); ctx.moveTo(p0[0], p0[1]); ctx.quadraticCurveTo(pc[0], pc[1], p1[0], p1[1]); ctx.stroke();
  }
  void pal;
}

// Profils anatomiques (avant = côté de la normale)
const PROF = {
  thigh: [[-0.1, 0.06, 0.075], [0.04, 0.098, 0.112], [0.28, 0.112, 0.102], [0.52, 0.1, 0.09], [0.76, 0.08, 0.072], [0.95, 0.064, 0.058], [1.0, 0.06, 0.056]],
  shin: [[0.0, 0.06, 0.056], [0.12, 0.056, 0.07], [0.3, 0.05, 0.088], [0.5, 0.044, 0.07], [0.74, 0.037, 0.045], [0.94, 0.032, 0.035], [1.06, 0.03, 0.032]],
  upper: [[-0.14, 0.055, 0.07], [0.04, 0.078, 0.08], [0.24, 0.066, 0.072], [0.5, 0.066, 0.062], [0.76, 0.054, 0.052], [0.96, 0.046, 0.046], [1.0, 0.045, 0.045]],
  fore: [[0.0, 0.045, 0.047], [0.14, 0.056, 0.053], [0.36, 0.05, 0.045], [0.7, 0.036, 0.033], [0.95, 0.029, 0.027], [1.06, 0.026, 0.024]],
};

function scaledProf(prof, k) { return prof.map(([t, f, b]) => [t, f * k, b * k]); }
// Sable collé et gouttes de sueur, dessinés dans la silhouette d'un membre
function skinExtras(ctx, P, pts, vis, S, seed) {
  if (!vis) return;
  const dust = vis.dust || 0, sweat = vis.sweat || 0;
  if (dust > 0.02) {
    ctx.globalAlpha = dust * 0.55; ctx.fillStyle = '#c9a77a';
    let sd = Math.abs(Math.round(seed)) % 2147483646 + 1;
    for (let i = 0; i < 26; i++) { sd = (sd * 16807) % 2147483647; const a = pts[Math.floor((sd / 2147483647) * pts.length)]; sd = (sd * 16807) % 2147483647; const b = pts[Math.floor((sd / 2147483647) * pts.length)]; const q = P([(a[0] + b[0]) / 2, (a[1] + b[1]) / 2]); ctx.beginPath(); ctx.arc(q[0], q[1], S(0.006 + (sd % 7) * 0.001), 0, Math.PI * 2); ctx.fill(); }
    ctx.globalAlpha = 1;
  }
  if (sweat > 0.4) {
    ctx.globalAlpha = (sweat - 0.4) * 0.9; ctx.fillStyle = 'rgba(255,245,230,0.9)';
    let sd = (Math.abs(Math.round(seed)) * 3) % 2147483646 + 1;
    for (let i = 0; i < 8; i++) { sd = (sd * 16807) % 2147483647; const a = pts[Math.floor((sd / 2147483647) * pts.length)]; const q = P(a); ctx.beginPath(); ctx.arc(q[0], q[1], S(0.004), 0, Math.PI * 2); ctx.fill(); }
    ctx.globalAlpha = 1;
  }
}

// ------------------------------------------------------------ dessin du lutteur
export function drawFighter(ctx, arena, cam, w, o, vis, bout, layer, light = 1) {
  const sk = skeleton(vis, w, o, bout);
  const body = bodyOf(w);
  const PR = { thigh: scaledProf(PROF.thigh, body.build), shin: scaledProf(PROF.shin, body.build * 0.95), upper: scaledProf(PROF.upper, body.build), fore: scaledProf(PROF.fore, body.build * 0.95) };
  const ppm = arena.ppm * cam.zoom;
  const dir = w.dir;
  const fallA = (w.fallen || vis.fall > 0) ? (w.fallDir || -1) * vis.fall * (Math.PI / 2) * 0.96 : 0;
  const pivot = [(sk.ff[0] + sk.bf[0]) / 2, 0];
  const ca = Math.cos(-fallA), sa = Math.sin(-fallA);
  const P = (p) => {
    let x = p[0] - pivot[0], y = p[1];
    if (fallA) { const rx = x * ca - y * sa, ry = x * sa + y * ca; x = rx; y = Math.max(0.04, ry); }
    x += pivot[0];
    return [arena.screenX(w.x + dir * x, cam), arena.groundY - y * ppm];
  };
  const base = w.look.skin || '#5b3421';
  const near = skinPalette(base, false), far = skinPalette(base, true);
  const S = (m) => m * ppm;
  // les profils sont définis pour un lutteur qui regarde vers la droite : on inverse la normale sinon
  const flip = false; // le repère local regarde toujours vers +x ; P() fait le miroir

  if (layer === 'shadow') {
    const c = P([sk.pelvis[0], 0]);
    const len = vis.fall > 0.5 ? 1.15 : 0.62;
    const g = ctx.createRadialGradient(c[0] + S(0.25), c[1], 0, c[0] + S(0.25), c[1], S(len));
    g.addColorStop(0, 'rgba(45,14,4,0.5)'); g.addColorStop(1, 'rgba(45,14,4,0)');
    ctx.fillStyle = g;
    ctx.beginPath(); ctx.ellipse(c[0] + S(0.25), c[1] + S(0.01), S(len), S(0.085), 0, 0, Math.PI * 2); ctx.fill();
    // occlusion de contact sous les pieds
    for (const f of [sk.ff, sk.bf]) {
      const p = P([f[0], 0]);
      ctx.fillStyle = 'rgba(30,8,2,0.45)';
      ctx.beginPath(); ctx.ellipse(p[0] + dir * S(0.05), p[1] + S(0.005), S(0.15), S(0.025), 0, 0, Math.PI * 2); ctx.fill();
    }
    return;
  }

  const legSet = (leg, hip, pal) => {
    const knee = [leg[0], leg[1]], ankle = [leg[2], leg[3]];
    const smp = chainSamples([hip, knee, ankle], [PR.thigh, PR.shin], false);
    paintChain(ctx, P, smp, pal, ppm, () => muscleLines(ctx, P, [
      [along(hip, knee, 0.22, 0.06), along(hip, knee, 0.85, 0.04), along(hip, knee, 0.5, 0.085)],    // quadriceps
      [along(hip, knee, 0.55, 0.02), along(hip, knee, 0.95, 0.05), along(hip, knee, 0.8, 0.02)],     // vaste interne
      [along(hip, knee, 0.3, -0.05), along(hip, knee, 0.9, -0.035), along(hip, knee, 0.6, -0.075)],  // ischio-jambiers
      [along(knee, ankle, 0.1, -0.055), along(knee, ankle, 0.6, -0.035), along(knee, ankle, 0.3, -0.09)], // mollet
      [along(knee, ankle, 0.08, 0.04), along(knee, ankle, 0.75, 0.025), along(knee, ankle, 0.4, 0.045)],  // tibia
    ], pal, S(0.006)) || skinExtras(ctx, P, smp.map(q => q.c), vis, S, 11 + Math.round(hip[0] * 100)));
    const kp = P(along(hip, knee, 1.0, 0.045));
    const kg = ctx.createRadialGradient(kp[0], kp[1], 0, kp[0], kp[1], S(0.04));
    kg.addColorStop(0, 'rgba(255,220,190,0.22)'); kg.addColorStop(1, 'rgba(255,220,190,0)');
    ctx.fillStyle = kg; ctx.beginPath(); ctx.arc(kp[0], kp[1], S(0.04), 0, Math.PI * 2); ctx.fill();
    drawFoot(ctx, P, ankle, dir, pal, S, leg === sk.legN ? sk.ff : sk.bf);
  };
  const armSet = (sh, arm, pal, dusty) => {
    const elbow = [arm[0], arm[1]], wrist = [arm[2], arm[3]];
    const smp = chainSamples([sh, elbow, wrist], [PR.upper, PR.fore], false);
    paintChain(ctx, P, smp, pal, ppm, () => muscleLines(ctx, P, [
      [along(sh, elbow, -0.05, 0.05), along(sh, elbow, 0.45, -0.025), along(sh, elbow, 0.25, 0.07)], // deltoïde
      [along(sh, elbow, 0.45, 0.04), along(sh, elbow, 0.92, 0.025), along(sh, elbow, 0.7, 0.068)],  // biceps
      [along(sh, elbow, 0.3, -0.04), along(sh, elbow, 0.85, -0.03), along(sh, elbow, 0.55, -0.065)],// triceps
      [along(elbow, wrist, 0.12, 0.025), along(elbow, wrist, 0.65, 0.0), along(elbow, wrist, 0.32, 0.05)],
    ], pal, S(0.005)) || skinExtras(ctx, P, smp.map(q => q.c), vis, S, 23 + Math.round(sh[0] * 100)));
    const open = vis.reach > 0.5 || vis.armsUp > 0.5 || vis.earth > 0.3 ? 1 : (bout.clinch ? 0 : 0.5);
    drawHand(ctx, P, elbow, wrist, pal, S, dusty, open);
  };

  if (layer === 'far') {
    legSet(sk.legF, sk.hipF, far);
    armSet(sk.shF, sk.armF, far, vis.dustHands);
    return;
  }
  if (layer === 'body') {
    w.__vis = vis;
    drawTorso(ctx, P, sk, near, S, ppm, w, dir);
    drawHead(ctx, P, sk, near, S, dir, w, vis);
    legSet(sk.legN, sk.hipN, near);
    drawCloth(ctx, P, sk, S, w, dir, flip);
    return;
  }
  if (layer === 'near') {
    armSet(sk.shN, sk.armN, near, vis.dustHands);
  }
}

// Torse de profil : dos (omoplate, grand dorsal, lombaires, fessier), avant (pectoral, ventre)
function drawTorso(ctx, P, sk, pal, S, ppm, w, dir) {
  const a = [sk.pelvis[0], sk.pelvis[1] - 0.07], b = sk.neckBase;
  const neckTop = [sk.head[0] - Math.sin(sk.headTh) * L.head * 0.3, sk.head[1] - Math.cos(sk.headTh) * L.head * 0.3];
  const prof = [
    [-0.14, 0.095, 0.12], [0.0, 0.115, 0.145], [0.14, 0.12, 0.12], [0.3, 0.122, 0.1],
    [0.45, 0.13, 0.118], [0.6, 0.155, 0.135], [0.72, 0.16, 0.148], [0.84, 0.135, 0.14], [0.94, 0.085, 0.095], [1.0, 0.06, 0.065],
  ];
  const neck = [[0.0, 0.058, 0.064], [0.5, 0.05, 0.056], [1.0, 0.05, 0.06]];
  const bd = bodyOf(w);
  const smp = chainSamples([a, b, neckTop], [prof.map(([t, f, k]) => [t, f * bd.build, k * bd.build]), neck.map(([t, f, k]) => [t, f * (0.9 + bd.build * 0.1), k * (0.9 + bd.build * 0.1)])], true);
  paintChain(ctx, P, smp, pal, ppm * 0.9, () => {
    const flip = true;
    skinExtras(ctx, P, smp.map(q => q.c), w.__vis, S, 5);
    // volumes : poitrine, omoplate, fessier
    for (const [t, off, rad, al] of [[0.68, 0.09, 0.12, 0.22], [0.74, -0.09, 0.1, 0.18], [0.05, -0.1, 0.1, 0.12]]) {
      const p = P(along(a, b, t, off, flip));
      const g = ctx.createRadialGradient(p[0] + SUN[0] * S(0.04), p[1] + SUN[1] * S(0.04), 0, p[0], p[1], S(rad));
      g.addColorStop(0, `rgba(255,220,185,${al})`); g.addColorStop(1, 'rgba(255,220,185,0)');
      ctx.fillStyle = g; ctx.fillRect(p[0] - S(rad), p[1] - S(rad), S(rad) * 2, S(rad) * 2);
    }
    ctx.strokeStyle = 'rgba(25,8,2,0.26)'; ctx.lineWidth = Math.max(1, S(0.007)); ctx.lineCap = 'round';
    const curve = (t0, o0, t1, o1, tc, oc) => { const p0 = P(along(a, b, t0, o0, flip)), p1 = P(along(a, b, t1, o1, flip)), pc = P(along(a, b, tc, oc, flip)); ctx.beginPath(); ctx.moveTo(p0[0], p0[1]); ctx.quadraticCurveTo(pc[0], pc[1], p1[0], p1[1]); ctx.stroke(); };
    curve(0.55, 0.15, 0.6, 0.03, 0.52, 0.1);            // sous le pectoral
    for (const t of [0.2, 0.3, 0.4]) curve(t, 0.118, t + 0.012, 0.07, t - 0.008, 0.095); // abdominaux
    curve(0.16, 0.1, 0.46, 0.115, 0.3, 0.128);           // ligne blanche
    curve(0.47, 0.08, 0.57, 0.04, 0.5, 0.05);            // dentelé
    curve(0.88, -0.12, 0.6, -0.07, 0.75, -0.15);         // omoplate
    curve(0.62, -0.12, 0.28, -0.085, 0.45, -0.12);       // grand dorsal
    curve(0.95, -0.02, 0.85, 0.08, 0.93, 0.05);          // clavicule
  });
}

// Tête de profil : crâne, front, arcade, nez, lèvres, menton, mâchoire, oreille, œil, cheveux crépus
function drawHead(ctx, P, sk, pal, S, dir, w, vis = {}) {
  const H = L.head;
  const F = Object.assign({ nose: 1, jaw: 1, brow: 1, lips: 1 }, (w.look && w.look.face) || {});
  const hair = (w.look && w.look.hair) || 'ras';
  const effort = vis.effort || 0, cry = vis.cry || 0, smile = vis.smile || 0;
  const open = Math.max(cry * 0.9, effort * 0.35);  // bouche ouverte
  const c = sk.head, ang = sk.headTh;
  const ca = Math.cos(ang), sa = Math.sin(ang);
  // coordonnées de la tête (x vers l'avant, y vers le haut, unités = hauteur de tête)
  const hp = (x, y) => P([c[0] + (x * ca + y * sa) * H, c[1] + (-x * sa + y * ca) * H]);
  const nb = sk.neckBase;
  // muscle sterno-cléido-mastoïdien
  const m0 = hp(-0.12, -0.18), m1 = P([nb[0] + 0.04, nb[1] - 0.005]);
  ctx.strokeStyle = 'rgba(25,8,2,0.25)'; ctx.lineWidth = S(0.006); ctx.beginPath(); ctx.moveTo(m0[0], m0[1]); ctx.lineTo(m1[0], m1[1]); ctx.stroke();

  // profil du visage
  const prof = [
    [-0.36, -0.12], [-0.42, 0.06], [-0.38, 0.26], [-0.24, 0.42], [-0.04, 0.5], [0.16, 0.46], [0.3, 0.34],  // crâne
    [0.36, 0.2], [0.38, 0.12], [0.355, 0.08],          // front, arcade
    [0.37, 0.03], [0.37 + 0.06 * F.nose, -0.06], [0.37 + 0.07 * F.nose, -0.1], [0.39, -0.12],   // nez
    [0.385, -0.16], [0.385 + 0.025 * F.lips, -0.19], [0.385, -0.225 - open * 0.03], [0.385 + 0.02 * F.lips, -0.25 - open * 0.05], [0.37, -0.29 - open * 0.06], // lèvres
    [0.36, -0.33 - open * 0.06], [0.3, -0.39 - open * 0.05], [0.2 * F.jaw, -0.41 - open * 0.04], [0.02, -0.36 - open * 0.02], [-0.12, -0.3], [-0.26 * F.jaw, -0.24], // menton, mâchoire
  ];
  const pts = prof.map(([x, y]) => hp(x, y));
  const hc = hp(0, 0.05);
  const g = ctx.createRadialGradient(hc[0] + SUN[0] * S(0.06), hc[1] + SUN[1] * S(0.06), S(0.01), hc[0], hc[1], S(0.17));
  g.addColorStop(0, pal.light); g.addColorStop(0.55, pal.base); g.addColorStop(0.9, pal.core); g.addColorStop(1, pal.bounce);
  ctx.fillStyle = g;
  ctx.beginPath(); ctx.moveTo(pts[0][0], pts[0][1]);
  for (let i = 1; i < pts.length; i++) { const p = pts[i], q = pts[(i + 1) % pts.length]; ctx.quadraticCurveTo(p[0], p[1], (p[0] + q[0]) / 2, (p[1] + q[1]) / 2); }
  ctx.closePath(); ctx.fill();
  // pommette et reflet du nez
  const ck = hp(0.2, -0.05), nz = hp(0.4, -0.04), fh = hp(0.3, 0.22);
  for (const [p, r, a] of [[ck, 0.06, 0.22], [nz, 0.025, 0.35], [fh, 0.05, 0.25]]) {
    const gg = ctx.createRadialGradient(p[0], p[1], 0, p[0], p[1], S(r));
    gg.addColorStop(0, `rgba(255,225,190,${a})`); gg.addColorStop(1, 'rgba(255,225,190,0)');
    ctx.fillStyle = gg; ctx.beginPath(); ctx.arc(p[0], p[1], S(r), 0, Math.PI * 2); ctx.fill();
  }
  // bouche : lèvres, commissure ; ouverte (cri, effort), sourire, dents serrées
  ctx.fillStyle = shade(pal.base, -0.35);
  const l0 = hp(0.37, -0.165), l1 = hp(0.405, -0.19), l2 = hp(0.38, -0.235 - open * 0.04), l3 = hp(0.33, -0.2 - open * 0.02);
  ctx.beginPath(); ctx.moveTo(l0[0], l0[1]); ctx.quadraticCurveTo(l1[0], l1[1], l2[0], l2[1]); ctx.lineTo(l3[0], l3[1]); ctx.closePath(); ctx.fill();
  if (open > 0.08) {
    // intérieur sombre et dents
    const m0 = hp(0.3, -0.2), m1 = hp(0.4, -0.195), m2 = hp(0.385, -0.2 - open * 0.11), m3 = hp(0.3, -0.2 - open * 0.08);
    ctx.fillStyle = '#2a0e08'; ctx.beginPath(); ctx.moveTo(m0[0], m0[1]); ctx.lineTo(m1[0], m1[1]); ctx.quadraticCurveTo(m2[0], m2[1], m3[0], m3[1]); ctx.closePath(); ctx.fill();
    ctx.fillStyle = '#efe6da'; const d0 = hp(0.31, -0.2), d1 = hp(0.395, -0.197), d2 = hp(0.39, -0.2 - open * 0.035), d3 = hp(0.31, -0.2 - open * 0.03);
    ctx.beginPath(); ctx.moveTo(d0[0], d0[1]); ctx.lineTo(d1[0], d1[1]); ctx.lineTo(d2[0], d2[1]); ctx.lineTo(d3[0], d3[1]); ctx.closePath(); ctx.fill();
  }
  ctx.strokeStyle = 'rgba(20,6,2,0.55)'; ctx.lineWidth = Math.max(1, S(0.004));
  const lm0 = hp(0.39, -0.205), lm1 = hp(0.31, -0.2 + smile * 0.03 - effort * 0.01); ctx.beginPath(); ctx.moveTo(lm0[0], lm0[1]); ctx.quadraticCurveTo(...hp(0.35, -0.2 + smile * 0.012), lm1[0], lm1[1]); ctx.stroke();
  if (smile > 0.3) { ctx.strokeStyle = `rgba(20,6,2,${0.3 * smile})`; const s0 = hp(0.3, -0.17), s1 = hp(0.3, -0.24); ctx.beginPath(); ctx.moveTo(s0[0], s0[1]); ctx.quadraticCurveTo(...hp(0.27, -0.21), s1[0], s1[1]); ctx.stroke(); }
  // joue creusée par l'effort, plis
  if (effort > 0.2) { ctx.strokeStyle = `rgba(20,6,2,${0.3 * effort})`; ctx.lineWidth = Math.max(1, S(0.005)); const c0 = hp(0.3, -0.1), c1 = hp(0.27, -0.26); ctx.beginPath(); ctx.moveTo(c0[0], c0[1]); ctx.quadraticCurveTo(...hp(0.22, -0.18), c1[0], c1[1]); ctx.stroke(); }
  const ns = hp(0.37, -0.09); ctx.fillStyle = 'rgba(20,6,2,0.6)'; ctx.beginPath(); ctx.ellipse(ns[0], ns[1], S(0.009), S(0.005), 0, 0, Math.PI * 2); ctx.fill();
  const nf0 = hp(0.36, -0.03), nf1 = hp(0.33, -0.11); ctx.strokeStyle = 'rgba(20,6,2,0.3)'; ctx.beginPath(); ctx.moveTo(nf0[0], nf0[1]); ctx.quadraticCurveTo(...hp(0.31, -0.07), nf1[0], nf1[1]); ctx.stroke();
  // œil : paupière, blanc, iris, reflet ; sourcil
  const e = hp(0.27, 0.07);
  const sq = 1 - effort * 0.55 - smile * 0.35 + cry * 0.4;   // ouverture de l'œil
  ctx.fillStyle = shade(pal.base, -0.4);
  ctx.beginPath(); ctx.ellipse(e[0], e[1], S(0.022), S(0.012 * Math.max(0.3, sq)), -dir * ang, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = '#e9ddd0';
  ctx.beginPath(); ctx.ellipse(e[0] + dir * S(0.004), e[1] + S(0.002), S(0.014), S(0.007 * Math.max(0.25, sq)), -dir * ang, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = '#1c0e07'; ctx.beginPath(); ctx.arc(e[0] + dir * S(0.009), e[1] + S(0.002), S(0.0065), 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = 'rgba(255,255,255,0.8)'; ctx.beginPath(); ctx.arc(e[0] + dir * S(0.011), e[1], S(0.0022), 0, Math.PI * 2); ctx.fill();
  ctx.strokeStyle = '#120804'; ctx.lineWidth = S(0.009 * F.brow); ctx.lineCap = 'round';
  const bl = effort * 0.03 - cry * 0.03;
  const b0 = hp(0.2, 0.15 - bl * 0.3), b1 = hp(0.35, 0.14 - bl); ctx.beginPath(); ctx.moveTo(b0[0], b0[1]); ctx.quadraticCurveTo(...hp(0.28, 0.17 - bl * 0.6), b1[0], b1[1]); ctx.stroke();
  // barbe courte et cicatrice selon le lutteur
  if (w.look && w.look.beard) { ctx.fillStyle = 'rgba(15,8,4,0.5)'; const sd = 17; for (let i = 0; i < 90; i++) { const x = 0.05 + ((sd + i * 37) % 33) / 100, y = -0.42 + ((sd * 3 + i * 53) % 16) / 100 + (x > 0.3 ? 0.05 : 0); const q = hp(x, y); ctx.beginPath(); ctx.arc(q[0], q[1], S(0.004), 0, Math.PI * 2); ctx.fill(); } }
  if (w.look && w.look.scar) { ctx.strokeStyle = 'rgba(255,220,200,0.35)'; ctx.lineWidth = Math.max(1, S(0.004)); const s0 = hp(0.12, 0.02), s1 = hp(0.2, -0.08); ctx.beginPath(); ctx.moveTo(s0[0], s0[1]); ctx.lineTo(s1[0], s1[1]); ctx.stroke(); }
  // oreille
  const er = hp(-0.06, 0.02);
  ctx.fillStyle = pal.base; ctx.beginPath(); ctx.ellipse(er[0], er[1], S(0.025), S(0.04), -dir * ang * 0.5, 0, Math.PI * 2); ctx.fill();
  ctx.strokeStyle = 'rgba(20,6,2,0.45)'; ctx.lineWidth = Math.max(1, S(0.005));
  ctx.beginPath(); ctx.ellipse(er[0] + dir * S(0.004), er[1], S(0.014), S(0.026), -dir * ang * 0.5, -Math.PI * 0.6, Math.PI * 0.6); ctx.stroke();
  // cheveux : ras (calotte texturée), crâne rasé, petites torsades, coupe haute
  if (hair === 'bald') { const sh = hp(-0.05, 0.4); const bg = ctx.createRadialGradient(sh[0] + SUN[0] * S(0.03), sh[1] + SUN[1] * S(0.03), 0, sh[0], sh[1], S(0.09)); bg.addColorStop(0, 'rgba(255,235,210,0.45)'); bg.addColorStop(1, 'rgba(255,235,210,0)'); ctx.fillStyle = bg; ctx.fillRect(sh[0] - S(0.1), sh[1] - S(0.1), S(0.2), S(0.2)); }
  const hairPts = hair === 'flat' ? [[-0.37, -0.05], [-0.44, 0.1], [-0.42, 0.34], [-0.3, 0.56], [-0.02, 0.62], [0.2, 0.58], [0.32, 0.4], [0.34, 0.27], [0.24, 0.3], [0.08, 0.33], [-0.05, 0.28], [-0.13, 0.12], [-0.2, -0.02]] : [[-0.37, -0.05], [-0.42, 0.1], [-0.37, 0.28], [-0.22, 0.44], [-0.02, 0.52], [0.17, 0.48], [0.3, 0.37], [0.34, 0.27], [0.24, 0.3], [0.08, 0.33], [-0.05, 0.28], [-0.13, 0.12], [-0.2, -0.02]];
  const hairP = hairPts.map(([x, y]) => hp(x, y));
  if (hair !== 'bald') {
  ctx.fillStyle = '#100805';
  ctx.beginPath(); ctx.moveTo(hairP[0][0], hairP[0][1]);
  for (let i = 1; i < hairP.length; i++) { const p = hairP[i], q = hairP[(i + 1) % hairP.length]; ctx.quadraticCurveTo(p[0], p[1], (p[0] + q[0]) / 2, (p[1] + q[1]) / 2); }
  ctx.closePath(); ctx.fill();
  if (hair === 'twists') { ctx.fillStyle = '#1a100a'; for (let i = 0; i < 14; i++) { const a = -0.3 + i * 0.045, q = hp(-0.36 + i * 0.05, 0.42 + Math.sin(i * 1.3) * 0.06 + (i > 9 ? -0.06 * (i - 9) : 0)); ctx.beginPath(); ctx.arc(q[0], q[1], S(0.016), 0, Math.PI * 2); ctx.fill(); void a; } }
  ctx.save(); ctx.clip();
  const hr = hp(-0.05, 0.36);
  const hg = ctx.createRadialGradient(hr[0] + SUN[0] * S(0.04), hr[1] + SUN[1] * S(0.05), 0, hr[0], hr[1], S(0.12));
  hg.addColorStop(0, 'rgba(120,90,70,0.45)'); hg.addColorStop(1, 'rgba(120,90,70,0)');
  ctx.fillStyle = hg; ctx.fillRect(hr[0] - S(0.15), hr[1] - S(0.15), S(0.3), S(0.3));
  ctx.fillStyle = 'rgba(160,130,110,0.18)';
  const seed = (w.name.charCodeAt(0) || 7) * 31;
  for (let i = 0; i < 40; i++) {
    const x = -0.4 + ((seed + i * 37) % 70) / 100, y = 0.05 + ((seed * 3 + i * 53) % 48) / 100;
    const p = hp(x, y); ctx.beginPath(); ctx.arc(p[0], p[1], S(0.004), 0, Math.PI * 2); ctx.fill();
  }
  ctx.restore();
  }
  // contour doux de la mâchoire
  ctx.strokeStyle = 'rgba(20,6,2,0.25)'; ctx.lineWidth = Math.max(1, S(0.006));
  const j0 = hp(-0.12, -0.28), j1 = hp(0.22, -0.4); ctx.beginPath(); ctx.moveTo(j0[0], j0[1]); ctx.quadraticCurveTo(...hp(0.05, -0.38), j1[0], j1[1]); ctx.stroke();
}

function drawFoot(ctx, P, ankle, dir, pal, S, foot) {
  const ax = ankle[0], ay = ankle[1];
  const gy = Math.max(0, foot[1]);
  const pts = [[ax - 0.06, ay + 0.01], [ax - 0.075, gy + 0.03], [ax - 0.06, gy], [ax + 0.06, gy + 0.004], [ax + 0.16, gy + 0.002], [ax + 0.2, gy + 0.016], [ax + 0.17, gy + 0.04], [ax + 0.08, gy + 0.06], [ax + 0.02, ay - 0.005]].map(P);
  const c = P([ax + 0.05, gy + 0.03]);
  const g = ctx.createLinearGradient(c[0], c[1] - S(0.06), c[0], c[1] + S(0.04));
  g.addColorStop(0, pal.light); g.addColorStop(0.5, pal.base); g.addColorStop(1, pal.core);
  ctx.fillStyle = g; smoothPath(ctx, pts); ctx.fill();
  // orteils
  for (let i = 0; i < 5; i++) { const t = P([ax + 0.2 - i * 0.012, gy + 0.004 + i * 0.006]); ctx.fillStyle = i % 2 ? pal.base : pal.light; ctx.beginPath(); ctx.ellipse(t[0], t[1], S(0.012), S(0.01), 0, 0, Math.PI * 2); ctx.fill(); }
  // tendon et malléole
  ctx.strokeStyle = 'rgba(20,6,2,0.25)'; ctx.lineWidth = Math.max(1, S(0.004));
  const m0 = P([ax - 0.04, ay + 0.02]), m1 = P([ax - 0.06, gy + 0.02]); ctx.beginPath(); ctx.moveTo(m0[0], m0[1]); ctx.lineTo(m1[0], m1[1]); ctx.stroke();
  const mal = P([ax + 0.01, ay + 0.01]); ctx.fillStyle = 'rgba(255,225,195,0.25)'; ctx.beginPath(); ctx.arc(mal[0], mal[1], S(0.02), 0, Math.PI * 2); ctx.fill();
  void dir;
}

function drawHand(ctx, P, elbow, wrist, pal, S, dust, open = 0) {
  const dx = wrist[0] - elbow[0], dy = wrist[1] - elbow[1], len = Math.hypot(dx, dy) || 1;
  const ux = dx / len, uy = dy / len, nx = -uy, ny = ux;
  const at = (t, o) => P([wrist[0] + ux * t + nx * o, wrist[1] + uy * t + ny * o]);
  const tone = dust > 0.15 ? mixc(pal.base, '#c98a5e', Math.min(0.75, dust)) : pal.base;
  const light = dust > 0.15 ? mixc(pal.light, '#e2aa7c', Math.min(0.7, dust)) : pal.light;
  // paume
  const pts = [at(-0.01, 0.03), at(0.05, 0.04), at(0.1, 0.034), at(0.12, 0.012), at(0.115, -0.016), at(0.08, -0.034), at(0.03, -0.03), at(-0.01, -0.026)];
  const c = at(0.06, 0);
  const g = ctx.createRadialGradient(c[0] + SUN[0] * S(0.02), c[1] + SUN[1] * S(0.02), 0, c[0], c[1], S(0.07));
  g.addColorStop(0, light); g.addColorStop(0.6, tone); g.addColorStop(1, pal.core);
  ctx.fillStyle = g; smoothPath(ctx, pts); ctx.fill();
  // quatre doigts : ouverts (dans l'axe), ou repliés (crochetés vers la paume)
  ctx.lineCap = 'round';
  for (let i = 0; i < 4; i++) {
    const o = 0.027 - i * 0.018, L1 = 0.045 - Math.abs(i - 1.2) * 0.006;
    const base = at(0.115, o);
    const fg = ctx.createLinearGradient(base[0], base[1] - S(0.012), base[0], base[1] + S(0.012)); fg.addColorStop(0, light); fg.addColorStop(1, pal.core);
    ctx.strokeStyle = fg; ctx.lineWidth = S(0.021);
    if (open > 0.5) { const tip = at(0.115 + L1 * 1.9, o * 1.15); ctx.beginPath(); ctx.moveTo(base[0], base[1]); ctx.lineTo(tip[0], tip[1]); ctx.stroke(); }
    else { const mid = at(0.115 + L1, o - 0.02), tip = at(0.1 + L1 * 0.6, o - 0.045); ctx.beginPath(); ctx.moveTo(base[0], base[1]); ctx.lineTo(mid[0], mid[1]); ctx.lineTo(tip[0], tip[1]); ctx.stroke(); }
  }
  // pouce
  const t0 = at(0.02, 0.03), t1 = open > 0.5 ? at(0.07, 0.065) : at(0.09, 0.03);
  ctx.strokeStyle = tone; ctx.lineWidth = S(0.024); ctx.beginPath(); ctx.moveTo(t0[0], t0[1]); ctx.lineTo(t1[0], t1[1]); ctx.stroke();
  // jointures et ombre de la paume
  ctx.strokeStyle = 'rgba(20,6,2,0.3)'; ctx.lineWidth = Math.max(1, S(0.004));
  const k0 = at(0.108, 0.03), k1 = at(0.112, -0.028); ctx.beginPath(); ctx.moveTo(k0[0], k0[1]); ctx.lineTo(k1[0], k1[1]); ctx.stroke();
  if (dust > 0.1) { ctx.fillStyle = `rgba(214,150,105,${dust * 0.5})`; ctx.beginPath(); ctx.arc(c[0], c[1], S(0.05), 0, Math.PI * 2); ctx.fill(); }
}

// Cache-sexe / short de lutte et ceinture aux couleurs du canton
function drawCloth(ctx, P, sk, S, w, dir, flip) {
  const cloth = w.look.cloth || '#2c2a2a';
  const band = w.look.band || '#c7472b';
  const th = sk.th, tx = Math.sin(th), ty = Math.cos(th);
  const fx = ty, fy = -tx; // avant
  const pv = sk.pelvis;
  const waistF = [pv[0] + fx * 0.115 + tx * 0.06, pv[1] + fy * 0.115 + ty * 0.06];
  const waistB = [pv[0] - fx * 0.135 + tx * 0.06, pv[1] - fy * 0.135 + ty * 0.06];
  const kN = [sk.legN[0], sk.legN[1]], kF = [sk.legF[0], sk.legF[1]];
  const thighN = along(sk.hipN, kN, 0.24, 0.104, flip), thighNb = along(sk.hipN, kN, 0.26, -0.1, flip);
  const thighF = along(sk.hipF, kF, 0.24, -0.1, flip);
  const glute = [pv[0] - fx * 0.155 - tx * 0.04, pv[1] - fy * 0.155 - ty * 0.04];
  const pts = [waistF, waistB, glute, thighF, thighNb, thighN].map(P);
  const g = ctx.createLinearGradient(pts[0][0], pts[0][1] - S(0.05), pts[4][0], pts[4][1] + S(0.05));
  g.addColorStop(0, shade(cloth, 0.22)); g.addColorStop(0.6, cloth); g.addColorStop(1, shade(cloth, -0.45));
  ctx.fillStyle = g; smoothPath(ctx, pts); ctx.fill();
  // plis du tissu
  ctx.strokeStyle = 'rgba(0,0,0,0.3)'; ctx.lineWidth = Math.max(1, S(0.006));
  for (const t of [0.35, 0.6]) {
    const p0 = P([lerp(waistF[0], waistB[0], t), lerp(waistF[1], waistB[1], t) - 0.02]);
    const p1 = P([lerp(thighN[0], thighNb[0], t), lerp(thighN[1], thighNb[1], t)]);
    ctx.beginPath(); ctx.moveTo(p0[0], p0[1]); ctx.quadraticCurveTo((p0[0] + p1[0]) / 2 + S(0.02) * dir, (p0[1] + p1[1]) / 2, p1[0], p1[1]); ctx.stroke();
  }
  // ceinture nouée
  const b0 = P(waistF), b1 = P(waistB);
  ctx.strokeStyle = shade(band, -0.3); ctx.lineWidth = S(0.032); ctx.lineCap = 'round';
  ctx.beginPath(); ctx.moveTo(b0[0], b0[1]); ctx.lineTo(b1[0], b1[1]); ctx.stroke();
  ctx.strokeStyle = band; ctx.lineWidth = S(0.02);
  ctx.beginPath(); ctx.moveTo(b0[0], b0[1] - S(0.006)); ctx.lineTo(b1[0], b1[1] - S(0.006)); ctx.stroke();
  // bout du nœud qui pend dans le dos
  const k0 = P([waistB[0] - fx * 0.01, waistB[1]]), k1 = P([waistB[0] - fx * 0.04, waistB[1] - 0.13]);
  ctx.strokeStyle = band; ctx.lineWidth = S(0.02);
  ctx.beginPath(); ctx.moveTo(k0[0], k0[1]); ctx.quadraticCurveTo(k0[0] - S(0.03) * dir, (k0[1] + k1[1]) / 2, k1[0], k1[1]); ctx.stroke();
  // ruban noué sous le genou
  if (w.look.knot) {
    const kn = P(along(kN, [sk.legN[2], sk.legN[3]], 0.12, 0, flip));
    ctx.strokeStyle = band; ctx.lineWidth = S(0.018);
    const kn2 = P(along(kN, [sk.legN[2], sk.legN[3]], 0.12, 0.06, flip)), kn3 = P(along(kN, [sk.legN[2], sk.legN[3]], 0.12, -0.07, flip));
    ctx.beginPath(); ctx.moveTo(kn2[0], kn2[1]); ctx.lineTo(kn3[0], kn3[1]); ctx.stroke(); void kn;
  }
}

export function drawPair(ctx, arena, cam, a, b, va, vb, bout, light) {
  for (const [w, o, v] of [[a, b, va], [b, a, vb]]) drawFighter(ctx, arena, cam, w, o, v, bout, 'shadow', light);
  for (const [w, o, v] of [[a, b, va], [b, a, vb]]) drawFighter(ctx, arena, cam, w, o, v, bout, 'far', light);
  for (const [w, o, v] of [[a, b, va], [b, a, vb]]) drawFighter(ctx, arena, cam, w, o, v, bout, 'body', light);
  for (const [w, o, v] of [[a, b, va], [b, a, vb]]) drawFighter(ctx, arena, cam, w, o, v, bout, 'near', light);
}
