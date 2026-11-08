// Décor peint de l'Évala : collines kabyè en juillet (saison des pluies, tout est vert),
// terre de latérite, arène sur un terrain de football bordé par la foule.
// Les couches sont peintes une fois hors écran puis défilent en parallaxe.

import { rng, fbm1, mix, rgba, shade, canvas, grain, lerp, clamp } from './paint.js';

const FILTER_OK = (() => { try { const g = document.createElement('canvas').getContext('2d'); g.filter = 'blur(2px)'; return g.filter === 'blur(2px)'; } catch { return false; } })();

// Palettes d'heure : « aprem » (lumière dorée), « orage » (ciel chargé), « matin »
export const MOODS = {
  aprem: {
    skyTop: '#3d6fa0', skyMid: '#9cc0cf', skyLow: '#f2d6a2', sun: '#fff1c9', sunGlow: '#ffc56b',
    haze: '#e9cfa0', far: '#7d93a6', mid: '#5f7c4a', near: '#3f5e2c', soil: '#b5582f', soilDark: '#7a3a20',
    cloudLit: '#fff5e6', cloudShade: '#8d8fa6', light: 1, sunX: 0.2, sunY: 0.26,
  },
  orage: {
    skyTop: '#3a4654', skyMid: '#6f7c86', skyLow: '#c9b895', sun: '#f7ead0', sunGlow: '#e8b878',
    haze: '#b8ab92', far: '#5f6d78', mid: '#4f6b3e', near: '#344f24', soil: '#9c4a28', soilDark: '#63301b',
    cloudLit: '#d9d6d0', cloudShade: '#4a505e', light: 0.7, sunX: 0.78, sunY: 0.2,
  },
  matin: {
    skyTop: '#5c86b3', skyMid: '#b9d2dc', skyLow: '#f5e3c4', sun: '#fffbe9', sunGlow: '#ffe0a0',
    haze: '#e6e1cf', far: '#8aa0b0', mid: '#698a50', near: '#46672f', soil: '#b9603a', soilDark: '#7f4024',
    cloudLit: '#ffffff', cloudShade: '#a3abbd', light: 0.9, sunX: 0.84, sunY: 0.3,
  },
};

function soft(g, px, fn) {
  if (FILTER_OK && px > 0) { g.save(); g.filter = `blur(${px}px)`; fn(); g.restore(); }
  else fn();
}

// ---------------------------------------------------------------- éléments
function cloud(g, x, y, w, h, m, r) {
  const n = 22 + Math.floor(r() * 14);
  const puffs = [];
  for (let i = 0; i < n; i++) {
    const t = i / (n - 1);
    const px = x + (t - 0.5) * w * (0.9 + r() * 0.2);
    const bump = Math.sin(t * Math.PI);
    const pr = h * (0.22 + 0.4 * bump) * (0.6 + r() * 0.6);
    puffs.push([px + (r() - 0.5) * w * 0.08, y - pr * 0.5 * bump - r() * h * 0.35, pr]);
  }
  // corps ombré
  for (const [px, py, pr] of puffs) {
    const gr = g.createRadialGradient(px - pr * 0.35, py - pr * 0.45, pr * 0.1, px, py, pr * 1.05);
    gr.addColorStop(0, m.cloudLit); gr.addColorStop(0.55, mix(m.cloudLit, m.cloudShade, 0.35)); gr.addColorStop(1, rgba(m.cloudShade, 0.0));
    g.fillStyle = gr; g.beginPath(); g.arc(px, py, pr * 1.05, 0, Math.PI * 2); g.fill();
  }
  // base plate et sombre
  const base = g.createLinearGradient(0, y - h * 0.2, 0, y + h * 0.5);
  base.addColorStop(0, rgba(m.cloudShade, 0)); base.addColorStop(1, rgba(m.cloudShade, 0.55));
  g.fillStyle = base; g.beginPath(); g.ellipse(x, y + h * 0.15, w * 0.55, h * 0.32, 0, 0, Math.PI * 2); g.fill();
}

function tree(g, x, y, s, kind, m, r, light = 1) {
  // ombre au sol
  g.fillStyle = 'rgba(20,30,10,0.25)';
  g.beginPath(); g.ellipse(x + s * 0.5, y + s * 0.02, s * 0.9, s * 0.1, 0, 0, Math.PI * 2); g.fill();
  const trunk = kind === 'baobab' ? '#8c7a6b' : '#4a3a2c';
  g.strokeStyle = trunk; g.lineCap = 'round';
  if (kind === 'baobab') {
    g.fillStyle = trunk;
    g.beginPath(); g.moveTo(x - s * 0.22, y); g.quadraticCurveTo(x - s * 0.15, y - s * 0.7, x - s * 0.1, y - s * 0.95);
    g.lineTo(x + s * 0.1, y - s * 0.95); g.quadraticCurveTo(x + s * 0.17, y - s * 0.7, x + s * 0.24, y); g.fill();
    g.lineWidth = s * 0.07;
    for (let i = 0; i < 6; i++) {
      const a = -Math.PI / 2 + (i - 2.5) * 0.42;
      g.beginPath(); g.moveTo(x, y - s * 0.9); g.quadraticCurveTo(x + Math.cos(a) * s * 0.35, y - s * 0.95 + Math.sin(a) * s * 0.2, x + Math.cos(a) * s * 0.6, y - s * 1.0 + Math.sin(a) * s * 0.45); g.stroke();
    }
    blobs(g, x, y - s * 1.25, s * 0.75, s * 0.3, m.near, m, r, 10, light);
    return;
  }
  if (kind === 'ronier') {
    g.lineWidth = s * 0.06;
    g.beginPath(); g.moveTo(x, y); g.quadraticCurveTo(x + s * 0.05, y - s * 0.8, x + s * 0.02, y - s * 1.6); g.stroke();
    g.strokeStyle = mix(m.near, '#2b3d18', 0.3); g.lineWidth = s * 0.035;
    for (let i = 0; i < 14; i++) {
      const a = (i / 14) * Math.PI * 2;
      g.beginPath(); g.moveTo(x + s * 0.02, y - s * 1.6);
      g.quadraticCurveTo(x + Math.cos(a) * s * 0.3, y - s * 1.75 + Math.sin(a) * s * 0.1, x + Math.cos(a) * s * 0.5, y - s * 1.45 + Math.abs(Math.sin(a)) * s * 0.15);
      g.stroke();
    }
    return;
  }
  // néré, karité, manguier : tronc court, houppier en masses
  g.lineWidth = s * 0.08;
  g.beginPath(); g.moveTo(x, y); g.lineTo(x + s * 0.03, y - s * 0.55); g.stroke();
  g.lineWidth = s * 0.04;
  g.beginPath(); g.moveTo(x + s * 0.02, y - s * 0.45); g.lineTo(x - s * 0.25, y - s * 0.75); g.moveTo(x + s * 0.03, y - s * 0.5); g.lineTo(x + s * 0.3, y - s * 0.8); g.stroke();
  const wide = kind === 'nere' ? 1.25 : kind === 'manguier' ? 0.95 : 1.05;
  const tone = kind === 'manguier' ? shade(m.near, -0.25) : kind === 'karite' ? mix(m.near, m.mid, 0.4) : m.near;
  blobs(g, x, y - s * 0.95, s * 0.7 * wide, s * 0.45, tone, m, r, 14, light);
}

function blobs(g, x, y, rx, ry, col, m, r, n, light) {
  // houppier : masses principales puis des centaines de petites touffes de feuilles
  const sunLeft = m.sunX < 0.5, lx = sunLeft ? -1 : 1;
  const masses = [];
  for (let i = 0; i < Math.max(4, Math.round(n / 3)); i++) {
    const a = r() * Math.PI * 2, d = Math.sqrt(r()) * 0.6;
    masses.push([x + Math.cos(a) * rx * d, y + Math.sin(a) * ry * d * 0.8, (rx + ry) * (0.28 + r() * 0.18)]);
  }
  // fond sombre du feuillage
  for (const [px, py, pr] of masses) { g.fillStyle = shade(col, -0.45); g.beginPath(); g.arc(px, py + pr * 0.1, pr, 0, Math.PI * 2); g.fill(); }
  const tufts = Math.round(n * 9);
  for (let i = 0; i < tufts; i++) {
    const M = masses[Math.floor(r() * masses.length)];
    const a = r() * Math.PI * 2, d = Math.sqrt(r());
    const px = M[0] + Math.cos(a) * M[2] * d, py = M[1] + Math.sin(a) * M[2] * d;
    // éclairage : plus clair vers le soleil et le haut
    const k = clamp(0.5 + ((px - M[0]) * lx * -1 + (M[1] - py)) / (M[2] * 2.2), 0, 1);
    const tone = k > 0.7 ? shade(col, 0.22 * light) : k > 0.45 ? col : k > 0.25 ? shade(col, -0.2) : shade(col, -0.38);
    g.fillStyle = tone;
    const tr = M[2] * (0.08 + r() * 0.1);
    g.beginPath(); g.ellipse(px, py, tr * (1 + r() * 0.6), tr, r() * Math.PI, 0, Math.PI * 2); g.fill();
  }
  // trouées de ciel
  g.fillStyle = 'rgba(0,0,0,0.12)';
  for (let i = 0; i < n / 2; i++) { const M = masses[Math.floor(r() * masses.length)]; g.beginPath(); g.arc(M[0] + (r() - 0.5) * M[2], M[1] + (r() - 0.3) * M[2], M[2] * 0.06, 0, Math.PI * 2); g.fill(); }
}

// Case ronde kabyè en terre, toit conique de paille ; ou maison rectangulaire en tôle
function hut(g, x, y, s, m, r, tin = false) {
  const wall = mix(m.soil, '#c99a6a', 0.45);
  g.fillStyle = 'rgba(30,20,10,0.25)'; g.beginPath(); g.ellipse(x + s * 0.2, y, s * 0.7, s * 0.09, 0, 0, Math.PI * 2); g.fill();
  if (tin) {
    const w = s * 1.3, h = s * 0.6;
    const gw = g.createLinearGradient(x - w / 2, 0, x + w / 2, 0);
    gw.addColorStop(0, shade(wall, 0.15)); gw.addColorStop(1, shade(wall, -0.2));
    g.fillStyle = gw; g.fillRect(x - w / 2, y - h, w, h);
    g.fillStyle = shade(wall, -0.5); g.fillRect(x - w * 0.1, y - h * 0.7, w * 0.16, h * 0.7);
    g.fillStyle = '#2b2b2b'; g.fillRect(x + w * 0.22, y - h * 0.72, w * 0.14, h * 0.25);
    // tôle ondulée, un peu rouillée
    const roof = g.createLinearGradient(0, y - h - s * 0.25, 0, y - h);
    roof.addColorStop(0, '#c9ccc9'); roof.addColorStop(0.6, '#9a8f84'); roof.addColorStop(1, '#7c5a43');
    g.fillStyle = roof;
    g.beginPath(); g.moveTo(x - w / 2 - s * 0.1, y - h + s * 0.02); g.lineTo(x - w / 2 + s * 0.05, y - h - s * 0.22); g.lineTo(x + w / 2 + s * 0.08, y - h - s * 0.22); g.lineTo(x + w / 2 + s * 0.14, y - h + s * 0.02); g.fill();
    g.strokeStyle = 'rgba(60,40,30,0.35)'; g.lineWidth = Math.max(0.5, s * 0.01);
    for (let i = 0; i < 14; i++) { const t = i / 13; g.beginPath(); g.moveTo(lerp(x - w / 2 - s * 0.1, x + w / 2 + s * 0.14, t), y - h + s * 0.02); g.lineTo(lerp(x - w / 2 + s * 0.05, x + w / 2 + s * 0.08, t), y - h - s * 0.22); g.stroke(); }
    return;
  }
  const w = s * 0.75, h = s * 0.5;
  const gw = g.createLinearGradient(x - w / 2, 0, x + w / 2, 0);
  gw.addColorStop(0, shade(wall, 0.2)); gw.addColorStop(0.5, wall); gw.addColorStop(1, shade(wall, -0.35));
  g.fillStyle = gw;
  g.beginPath(); g.moveTo(x - w / 2, y - h); g.lineTo(x - w / 2, y); g.quadraticCurveTo(x, y + s * 0.08, x + w / 2, y); g.lineTo(x + w / 2, y - h); g.quadraticCurveTo(x, y - h + s * 0.06, x - w / 2, y - h); g.fill();
  g.fillStyle = '#2a1a10'; g.beginPath(); g.ellipse(x + w * 0.12, y - h * 0.32, w * 0.1, h * 0.32, 0, 0, Math.PI * 2); g.fill();
  // toit de paille conique, mèches
  const top = y - h - s * 0.62;
  const roof = g.createLinearGradient(x - w * 0.7, 0, x + w * 0.7, 0);
  roof.addColorStop(0, '#d9b670'); roof.addColorStop(0.5, '#b08a4b'); roof.addColorStop(1, '#6e5530');
  g.fillStyle = roof;
  g.beginPath(); g.moveTo(x, top); g.lineTo(x - w * 0.72, y - h + s * 0.06); g.quadraticCurveTo(x, y - h + s * 0.16, x + w * 0.72, y - h + s * 0.06); g.closePath(); g.fill();
  g.strokeStyle = 'rgba(70,50,20,0.4)'; g.lineWidth = Math.max(0.5, s * 0.012);
  for (let i = 0; i < 16; i++) { const t = (i / 15) * 2 - 1; g.beginPath(); g.moveTo(x, top + s * 0.03); g.lineTo(x + t * w * 0.72, y - h + s * 0.08 + (1 - t * t) * s * 0.08); g.stroke(); }
  g.fillStyle = '#5a4424'; g.beginPath(); g.arc(x, top + s * 0.02, s * 0.035, 0, Math.PI * 2); g.fill();
}

function rock(g, x, y, s, m, r) {
  const col = mix('#8e8678', m.far, 0.2);
  const gr = g.createLinearGradient(x - s, y - s, x + s, y);
  gr.addColorStop(0, shade(col, 0.3)); gr.addColorStop(1, shade(col, -0.4));
  g.fillStyle = gr;
  g.beginPath(); g.moveTo(x - s, y);
  g.quadraticCurveTo(x - s * 0.9, y - s * (0.6 + r() * 0.4), x - s * 0.2, y - s * (0.7 + r() * 0.3));
  g.quadraticCurveTo(x + s * 0.6, y - s * (0.8 + r() * 0.3), x + s, y); g.closePath(); g.fill();
}

// --------------------------------------------------------------- personnes
// Silhouettes de spectateurs (plusieurs variantes, deux images pour l'animation)
const CLOTH = ['#d4472e', '#f2b134', '#2e6fb5', '#f4efe4', '#1f8a5c', '#7b3fa0', '#e86f9a', '#2b2b30', '#e9e2cf', '#c2401f', '#3d9fd1', '#f08a24', '#6a8f2a', '#b81e4a'];
const SKIN = ['#3b2418', '#4a2c1c', '#5a3622', '#2f1c12', '#6a4128'];

function person(g, x, y, h, v, frame) {
  const r = rng(v * 13 + 5);
  const skin = SKIN[Math.floor(r() * SKIN.length)];
  const top = CLOTH[Math.floor(r() * CLOTH.length)];
  const bottom = r() < 0.5 ? CLOTH[Math.floor(r() * CLOTH.length)] : '#2c3442';
  const woman = r() < 0.48, child = r() < 0.18;
  if (child) h *= 0.62;
  const w = h * (0.28 + r() * 0.06);
  const headR = h * 0.085;
  const shoulderY = y - h * 0.78, hipY = y - h * 0.45;
  g.lineCap = 'round';
  // jambes / pagne
  g.fillStyle = bottom;
  if (woman) { g.beginPath(); g.moveTo(x - w * 0.42, hipY); g.lineTo(x - w * 0.36, y); g.lineTo(x + w * 0.36, y); g.lineTo(x + w * 0.42, hipY); g.fill(); }
  else { g.fillRect(x - w * 0.36, hipY, w * 0.32, h * 0.45); g.fillRect(x + w * 0.04, hipY, w * 0.32, h * 0.45); }
  // buste
  const gt = g.createLinearGradient(x - w / 2, 0, x + w / 2, 0);
  gt.addColorStop(0, shade(top, 0.12)); gt.addColorStop(1, shade(top, -0.3));
  g.fillStyle = gt;
  g.beginPath(); g.moveTo(x - w / 2, shoulderY + h * 0.03); g.lineTo(x - w * 0.42, hipY + h * 0.04); g.lineTo(x + w * 0.42, hipY + h * 0.04); g.lineTo(x + w / 2, shoulderY + h * 0.03); g.quadraticCurveTo(x, shoulderY - h * 0.03, x - w / 2, shoulderY + h * 0.03); g.fill();
  // bras : bas, ou levés (frame 1) pour applaudir / encourager
  g.strokeStyle = skin; g.lineWidth = h * 0.06;
  const up = frame === 1 && r() < 0.7;
  if (up) {
    g.beginPath(); g.moveTo(x - w * 0.42, shoulderY + h * 0.05); g.lineTo(x - w * 0.62, shoulderY - h * 0.18); g.lineTo(x - w * 0.5, shoulderY - h * 0.36); g.stroke();
    g.beginPath(); g.moveTo(x + w * 0.42, shoulderY + h * 0.05); g.lineTo(x + w * 0.65, shoulderY - h * 0.16); g.lineTo(x + w * 0.55, shoulderY - h * 0.34); g.stroke();
  } else {
    g.beginPath(); g.moveTo(x - w * 0.45, shoulderY + h * 0.05); g.lineTo(x - w * 0.55, hipY + h * 0.02); g.stroke();
    g.beginPath(); g.moveTo(x + w * 0.45, shoulderY + h * 0.05); g.lineTo(x + w * 0.52, hipY); g.stroke();
  }
  // tête et coiffe
  g.fillStyle = skin; g.beginPath(); g.arc(x, shoulderY - headR * 1.15, headR, 0, Math.PI * 2); g.fill();
  const hat = r();
  if (woman && hat < 0.55) { // foulard noué
    g.fillStyle = CLOTH[Math.floor(r() * CLOTH.length)];
    g.beginPath(); g.ellipse(x, shoulderY - headR * 1.7, headR * 1.15, headR * 0.75, 0, Math.PI, 0); g.fill();
  } else if (!woman && hat < 0.3) { // casquette
    g.fillStyle = CLOTH[Math.floor(r() * CLOTH.length)];
    g.beginPath(); g.arc(x, shoulderY - headR * 1.3, headR * 1.02, Math.PI, 0); g.fill();
    g.fillRect(x, shoulderY - headR * 1.4, headR * 1.3, headR * 0.25);
  } else if (!woman && hat < 0.42) { // chapeau de paille
    g.fillStyle = '#c9a463'; g.beginPath(); g.ellipse(x, shoulderY - headR * 1.75, headR * 1.9, headR * 0.35, 0, 0, Math.PI * 2); g.fill();
    g.beginPath(); g.arc(x, shoulderY - headR * 1.8, headR * 0.85, Math.PI, 0); g.fill();
  }
  // parapluie (soleil ou pluie de juillet)
  if (!child && r() < 0.06) {
    const uc = CLOTH[Math.floor(r() * CLOTH.length)];
    g.strokeStyle = '#222'; g.lineWidth = h * 0.015; g.beginPath(); g.moveTo(x + w * 0.4, shoulderY); g.lineTo(x + w * 0.4, y - h * 1.18); g.stroke();
    g.fillStyle = uc; g.beginPath(); g.ellipse(x + w * 0.4, y - h * 1.16, h * 0.42, h * 0.18, 0, Math.PI, 0); g.fill();
  }
}

// ------------------------------------------------------------------ arène
export class Arena {
  constructor(opts = {}) {
    this.mood = MOODS[opts.mood || 'aprem'];
    this.seed = opts.seed ?? 3;
    this.village = opts.village || 'Landa';
    this.empty = !!opts.empty;   // décor sans foule (village, entraînement)
    this.few = !!opts.few;       // quelques spectateurs seulement
    this.w = 0; this.h = 0;
    this.layers = [];
    this.crowd = [];
    this.dust = [];
    this.t = 0;
  }

  // ppm : pixels par mètre au zoom 1 ; groundY : ligne des pieds des lutteurs
  build(w, h) {
    this.w = w; this.h = h;
    const m = this.mood, r = rng(this.seed);
    this.horizon = h * 0.5;
    this.groundY = h * 0.8;
    this.ppm = h / 4.6;
    const PW = Math.round(w * 2.2);
    const H = this.horizon;
    this.layers = [];

    // Ciel
    const sky = canvas(w, h);
    { const g = sky.getContext('2d');
      const gr = g.createLinearGradient(0, 0, 0, H * 1.05);
      gr.addColorStop(0, m.skyTop); gr.addColorStop(0.55, m.skyMid); gr.addColorStop(1, m.skyLow);
      g.fillStyle = gr; g.fillRect(0, 0, w, h);
      const sx = w * m.sunX, sy = h * m.sunY;
      const glow = g.createRadialGradient(sx, sy, 0, sx, sy, h * 0.9);
      glow.addColorStop(0, rgba(m.sunGlow, 0.85)); glow.addColorStop(0.15, rgba(m.sunGlow, 0.35)); glow.addColorStop(1, rgba(m.sunGlow, 0));
      g.fillStyle = glow; g.fillRect(0, 0, w, h);
      g.fillStyle = m.sun; g.beginPath(); g.arc(sx, sy, h * 0.035, 0, Math.PI * 2); g.fill();
      // cumulus de saison des pluies
      soft(g, h * 0.004, () => {
        for (let i = 0; i < 9; i++) {
          const cx = r() * w, cy = H * (0.2 + r() * 0.55);
          cloud(g, cx, cy, h * (0.35 + r() * 0.6), h * (0.08 + r() * 0.1), m, r);
        }
      });
      // voiles d'altitude
      g.globalAlpha = 0.25; g.fillStyle = m.cloudLit;
      for (let i = 0; i < 6; i++) { g.beginPath(); g.ellipse(r() * w, H * (0.08 + r() * 0.2), h * (0.3 + r() * 0.4), h * 0.008, 0, 0, Math.PI * 2); g.fill(); }
      g.globalAlpha = 1;
    }
    this.sky = sky;

    // Montagnes lointaines (monts kabyè), deux crêtes dans la brume
    const far = canvas(PW, H + 4);
    { const g = far.getContext('2d');
      for (let k = 0; k < 2; k++) {
        const f = fbm1(this.seed * 7 + k * 31, 5);
        const base = H * (0.62 + k * 0.14), amp = H * (0.3 - k * 0.08);
        g.beginPath(); g.moveTo(0, H + 4);
        for (let x = 0; x <= PW; x += 4) g.lineTo(x, base - Math.pow(f(x / (h * 0.5)), 1.6) * amp * 1.6);
        g.lineTo(PW, H + 4); g.closePath();
        const col = mix(m.far, m.haze, k ? 0.25 : 0.55);
        const gr = g.createLinearGradient(0, base - amp, 0, H);
        gr.addColorStop(0, col); gr.addColorStop(1, mix(col, m.haze, 0.5));
        g.fillStyle = gr; g.fill();
        // versant éclairé
        g.save(); g.clip();
        g.globalAlpha = 0.18; g.fillStyle = m.sunGlow;
        for (let x = 0; x < PW; x += h * 0.12) { g.beginPath(); g.moveTo(x, H); g.lineTo(x + h * 0.08, base - amp); g.lineTo(x + h * 0.11, base - amp); g.lineTo(x + h * 0.05, H); g.fill(); }
        g.restore(); g.globalAlpha = 1;
      }
    }
    this.layers.push({ c: far, p: 0.06, y: 0 });

    // Collines moyennes : terrasses, rochers, bosquets, hameaux
    const mid = canvas(PW, H + h * 0.02);
    { const g = mid.getContext('2d');
      const f = fbm1(this.seed * 13 + 5, 5);
      const ridge = (x) => H * 0.86 - Math.pow(f(x / (h * 0.9)), 1.3) * H * 0.42;
      g.beginPath(); g.moveTo(0, mid.height);
      for (let x = 0; x <= PW; x += 3) g.lineTo(x, ridge(x));
      g.lineTo(PW, mid.height); g.closePath();
      const gr = g.createLinearGradient(0, H * 0.4, 0, H);
      gr.addColorStop(0, mix(m.mid, m.haze, 0.35)); gr.addColorStop(1, mix(m.mid, m.near, 0.4));
      g.fillStyle = gr; g.fill();
      g.save(); g.clip();
      // terrasses de pierres sèches (cultures en gradins du pays kabyè)
      for (let ty = H * 0.35; ty < H + 10; ty += h * 0.014) {
        g.strokeStyle = rgba('#3b3324', 0.22); g.lineWidth = 1.2;
        g.beginPath();
        for (let x = 0; x <= PW; x += 12) g.lineTo(x, ty + Math.sin(x * 0.004 + ty * 0.05) * h * 0.012);
        g.stroke();
        g.strokeStyle = rgba(m.sunGlow, 0.12); g.beginPath();
        for (let x = 0; x <= PW; x += 12) g.lineTo(x, ty - 1.5 + Math.sin(x * 0.004 + ty * 0.05) * h * 0.012);
        g.stroke();
      }
      // champs de sorgho et parcelles de couleurs variées
      for (let i = 0; i < 40; i++) {
        const px = r() * PW, py = H * (0.55 + r() * 0.4);
        if (py < ridge(px) + 6) continue;
        g.fillStyle = rgba(r() < 0.5 ? '#9fb24a' : r() < 0.5 ? '#476b22' : '#b8874a', 0.35);
        g.beginPath(); g.ellipse(px, py, h * (0.04 + r() * 0.08), h * 0.012, 0, 0, Math.PI * 2); g.fill();
      }
      // sentier de latérite
      g.strokeStyle = rgba(m.soil, 0.7); g.lineWidth = h * 0.006;
      g.beginPath(); let sx = PW * 0.3; g.moveTo(sx, H + 6);
      for (let k = 0; k < 8; k++) { sx += (r() - 0.4) * h * 0.25; g.lineTo(sx, H - k * H * 0.05); }
      g.stroke();
      g.restore();
      // rochers granitiques, arbres, hameaux
      for (let i = 0; i < 26; i++) { const x = r() * PW; rock(g, x, ridge(x) + h * (0.02 + r() * 0.12), h * (0.008 + r() * 0.012), m, r); }
      for (let i = 0; i < 70; i++) {
        const x = r() * PW, y = Math.max(ridge(x) + 4, H * (0.5 + r() * 0.48));
        tree(g, x, y, h * (0.025 + r() * 0.02), ['nere', 'karite', 'manguier', 'ronier'][Math.floor(r() * 4)], { ...m, near: mix(m.near, m.haze, 0.3) }, r, m.light * 0.6);
      }
      for (let c = 0; c < 6; c++) {
        const cx = r() * PW, cy = Math.max(ridge(cx) + h * 0.03, H * (0.68 + r() * 0.25));
        for (let i = 0; i < 4; i++) hut(g, cx + (i - 1.5) * h * 0.035 + r() * 8, cy + r() * 6, h * 0.026, { ...m, soil: mix(m.soil, m.haze, 0.35) }, r, r() < 0.3);
      }
      // brume de distance
      const hz = g.createLinearGradient(0, H * 0.3, 0, H);
      hz.addColorStop(0, rgba(m.haze, 0.25)); hz.addColorStop(1, rgba(m.haze, 0.05));
      g.fillStyle = hz; g.fillRect(0, 0, PW, mid.height);
    }
    this.layers.push({ c: mid, p: 0.16, y: 0 });

    // Lisière proche : grands arbres et concessions derrière le terrain
    const near = canvas(PW, H + h * 0.03);
    { const g = near.getContext('2d');
      const by = H + h * 0.015;
      // bande d'herbe haute et de sorgho
      g.fillStyle = m.near;
      g.beginPath(); g.moveTo(0, near.height);
      for (let x = 0; x <= PW; x += 6) g.lineTo(x, by - h * 0.01 - Math.abs(Math.sin(x * 0.03)) * h * 0.012 - r() * h * 0.008);
      g.lineTo(PW, near.height); g.fill();
      for (let i = 0; i < 9; i++) {
        const cx = r() * PW;
        for (let k = 0; k < 3; k++) hut(g, cx + k * h * 0.075, by - r() * 3, h * 0.055, m, r, r() < 0.35);
      }
      for (let i = 0; i < 26; i++) {
        const x = r() * PW;
        tree(g, x, by + r() * 4, h * (0.07 + r() * 0.06), ['nere', 'karite', 'manguier', 'baobab', 'ronier', 'nere'][Math.floor(r() * 6)], m, r, m.light);
      }
      // poteaux électriques et fils : l'Évala d'aujourd'hui
      g.strokeStyle = '#3b3128'; g.lineWidth = 2;
      let prev = null;
      for (let x = 60; x < PW; x += h * 0.55) {
        g.beginPath(); g.moveTo(x, by); g.lineTo(x, by - h * 0.16); g.moveTo(x - 8, by - h * 0.15); g.lineTo(x + 8, by - h * 0.15); g.stroke();
        if (prev) { g.lineWidth = 0.8; g.beginPath(); g.moveTo(prev, by - h * 0.15); g.quadraticCurveTo((prev + x) / 2, by - h * 0.12, x, by - h * 0.15); g.stroke(); g.lineWidth = 2; }
        prev = x;
      }
      const hz = g.createLinearGradient(0, H * 0.6, 0, by);
      hz.addColorStop(0, rgba(m.haze, 0.18)); hz.addColorStop(1, rgba(m.haze, 0));
      g.fillStyle = hz; g.fillRect(0, 0, PW, near.height);
    }
    this.layers.push({ c: near, p: 0.32, y: 0 });

    // Sol du terrain : latérite tassée, herbe usée sur les bords, traces
    const ground = canvas(PW, h - H);
    { const g = ground.getContext('2d'); const GH = h - H;
      const gr = g.createLinearGradient(0, 0, 0, GH);
      gr.addColorStop(0, mix(m.soil, m.haze, 0.35)); gr.addColorStop(0.4, m.soil); gr.addColorStop(1, m.soilDark);
      g.fillStyle = gr; g.fillRect(0, 0, PW, GH);
      // touffes d'herbe et plaques vertes (juillet)
      for (let i = 0; i < 900; i++) {
        const y = Math.pow(r(), 1.4) * GH, x = r() * PW, s = 1 + (y / GH) * 8;
        const edge = y < GH * 0.25 || r() < 0.25;
        if (!edge) continue;
        g.fillStyle = rgba(r() < 0.5 ? '#6f8a2e' : '#4d6b24', 0.5 + r() * 0.3);
        g.beginPath(); g.ellipse(x, y, s * (2 + r() * 3), s * 0.6, 0, 0, Math.PI * 2); g.fill();
      }
      // grain de la terre : cailloux, mottes, empreintes
      for (let i = 0; i < 2600; i++) {
        const y = Math.pow(r(), 0.9) * GH, x = r() * PW, s = 0.4 + (y / GH) * 3.2;
        g.fillStyle = r() < 0.5 ? rgba(m.soilDark, 0.35) : rgba('#e2a676', 0.3);
        g.beginPath(); g.ellipse(x, y, s * (0.6 + r()), s * 0.45, 0, 0, Math.PI * 2); g.fill();
      }
      // marquage blanc effacé du terrain de football
      g.strokeStyle = 'rgba(240,235,220,0.28)'; g.lineWidth = 3;
      g.beginPath(); g.moveTo(PW * 0.5 - GH * 0.1, 0); g.lineTo(PW * 0.5 + GH * 0.05, GH); g.stroke();
      g.beginPath(); g.ellipse(PW * 0.5, GH * 0.55, GH * 0.9, GH * 0.28, 0, 0, Math.PI * 2); g.stroke();
      g.drawImage(grain(), 0, 0, PW, GH);
    }
    this.ground = ground;

    // Foule : rangées derrière l'aire de lutte (parallaxe), animation par images
    this.sprites = [];
    const SH = h * 0.2;
    for (let v = 0; v < 36; v++) {
      const pair = [0, 1].map(fr => { const c = canvas(SH * 0.9, SH * 1.35); person(c.getContext('2d'), c.width / 2, c.height - 2, SH, v, fr); return c; });
      this.sprites.push(pair);
    }
    this.crowd = [];
    const rows = [
      { y: H + h * 0.03, s: 0.42, p: 0.55, n: 120, dark: 0.32 },
      { y: H + h * 0.055, s: 0.55, p: 0.65, n: 95, dark: 0.18 },
      { y: H + h * 0.09, s: 0.72, p: 0.78, n: 70, dark: 0.05 },
    ];
    for (const row of rows) {
      if (this.empty) break;
      if (this.few) row.n = Math.round(row.n * 0.12);
      const span = w / this.ppm * 2.4 + 12;
      for (let i = 0; i < row.n; i++) {
        const xm = (i / row.n - 0.5) * span + (r() - 0.5) * 0.6;
        if (Math.abs(xm) < 1.3 && row === rows[2] && r() < 0.6) continue;
        this.crowd.push({ xm, y: row.y + (r() - 0.5) * h * 0.012, s: row.s * (0.85 + r() * 0.3), p: row.p, v: Math.floor(r() * 36), ph: r() * 10, sp: 0.6 + r() * 1.4, dark: row.dark });
      }
    }
    this.crowd.sort((a, b) => a.y - b.y);
    // bâche des officiels et chaises en plastique
    this.props = { tentX: -5.5, goalX: 7.5 };

    // Premier plan : silhouettes floues
    const front = canvas(PW, h * 0.3);
    { const g = front.getContext('2d');
      soft(g, h * 0.008, () => {
        for (let i = 0; i < (this.empty ? 0 : this.few ? 5 : 28); i++) {
          const x = r() * PW; const hh = h * (0.32 + r() * 0.12);
          g.save(); g.globalAlpha = 0.92; person(g, x, front.height + hh * 0.35, hh, Math.floor(r() * 50), r() < 0.4 ? 1 : 0); g.restore();
        }
      });
      g.globalCompositeOperation = 'source-atop';
      g.fillStyle = 'rgba(20,10,5,0.55)'; g.fillRect(0, 0, PW, front.height);
      g.globalCompositeOperation = 'source-over';
    }
    this.front = front;

    // Particules de poussière en suspension
    this.dust = Array.from({ length: 70 }, () => ({ x: r() * w, y: r() * h, z: 0.3 + r(), s: 0.6 + r() * 2.2, v: 4 + r() * 12, ph: r() * 6 }));
    this.puffs = [];
    this.layersW = PW;
  }

  // Bouffée de poussière quand un pied glisse ou qu'un lutteur tombe
  puff(xm, n = 16, power = 1) {
    for (let i = 0; i < n; i++) {
      this.puffs.push({ xm: xm + (Math.random() - 0.5) * 0.6, y: 0, vx: (Math.random() - 0.5) * 2.2 * power, vy: 0.5 + Math.random() * 1.6 * power, r: 0.08 + Math.random() * 0.2, life: 0, max: 0.9 + Math.random() * 1.2 });
    }
  }

  screenX(xm, cam, p = 1) { return this.w / 2 + (xm - cam.x * p) * this.ppm * cam.zoom; }

  drawBack(ctx, cam, t, excite = 0) {
    const { w, h } = this; const m = this.mood;
    this.t = t;
    ctx.drawImage(this.sky, 0, 0);
    const z = cam.zoom;
    // Les couches de fond zooment moins que le premier plan
    for (const L of this.layers) {
      const lz = 1 + (z - 1) * L.p;
      const off = -cam.x * this.ppm * L.p;
      const lw = L.c.width * lz, lh = L.c.height * lz;
      const x = w / 2 - lw / 2 + off;
      const y = this.horizon - lh + (L.c.height - this.horizon) * 0 + (this.horizon * (lz - 1)) * 0.4 + (cam.y || 0) * L.p;
      ctx.drawImage(L.c, x, y, lw, lh);
    }
    // Sol en perspective (sans zoom vertical exagéré)
    {
      const lz = 1 + (z - 1) * 0.9;
      const gw = this.ground.width * lz;
      const x = w / 2 - gw / 2 - cam.x * this.ppm * lz;
      ctx.drawImage(this.ground, x, this.horizon, gw, h - this.horizon);
    }
    // Bâche des officiels, poteaux de but
    if (!this.empty && !this.few) this.drawProps(ctx, cam);
    // Foule
    for (const c of this.crowd) {
      const lz = 1 + (z - 1) * c.p;
      const x = w / 2 + (c.xm - cam.x * c.p) * this.ppm * lz * 0.62;
      if (x < -80 || x > w + 80) continue;
      const fr = (Math.sin(t * c.sp * (1 + excite * 2) + c.ph) > (0.55 - excite * 0.6)) ? 1 : 0;
      const sp = this.sprites[c.v][fr];
      const s = c.s * lz;
      const bob = Math.abs(Math.sin(t * c.sp * 3 + c.ph)) * 3 * excite;
      const y = c.y + (c.y - this.horizon) * (lz - 1) * 0.6;
      ctx.drawImage(sp, x - sp.width * s / 2, y - sp.height * s - bob, sp.width * s, sp.height * s);
      if (c.dark > 0) { /* la brume est appliquée globalement */ }
    }
    // voile de chaleur et de poussière sur la foule lointaine
    const hz = ctx.createLinearGradient(0, this.horizon - h * 0.1, 0, this.horizon + h * 0.12);
    hz.addColorStop(0, rgba(m.haze, 0.0)); hz.addColorStop(0.6, rgba(m.haze, 0.12)); hz.addColorStop(1, rgba(m.haze, 0));
    ctx.fillStyle = hz; ctx.fillRect(0, this.horizon - h * 0.1, w, h * 0.22);
  }

  drawProps(ctx, cam) {
    const { h } = this; const m = this.mood;
    const p = 0.62, lz = 1 + (cam.zoom - 1) * p;
    const baseY = this.horizon + h * 0.075;
    // Bâche bleue des officiels et des chefs traditionnels
    const tx = this.w / 2 + (this.props.tentX - cam.x * p) * this.ppm * lz * 0.62;
    const tw = h * 0.42 * lz, th = h * 0.15 * lz;
    ctx.fillStyle = '#e8e2d2';
    for (const k of [-0.48, 0.48]) ctx.fillRect(tx + k * tw - 2, baseY - th, 3, th);
    const gb = ctx.createLinearGradient(0, baseY - th - h * 0.03, 0, baseY - th + h * 0.02);
    gb.addColorStop(0, '#3f7fc4'); gb.addColorStop(1, '#25507f');
    ctx.fillStyle = gb;
    ctx.beginPath(); ctx.moveTo(tx - tw * 0.55, baseY - th + h * 0.012); ctx.lineTo(tx - tw * 0.5, baseY - th - h * 0.02); ctx.lineTo(tx + tw * 0.5, baseY - th - h * 0.02); ctx.lineTo(tx + tw * 0.55, baseY - th + h * 0.012); ctx.fill();
    ctx.fillStyle = 'rgba(0,0,0,0.18)'; ctx.fillRect(tx - tw * 0.5, baseY - th + h * 0.012, tw, th - h * 0.012);
    // Poteaux de but
    const gx = this.w / 2 + (this.props.goalX - cam.x * p) * this.ppm * lz * 0.62;
    const gh = h * 0.13 * lz, gw2 = h * 0.38 * lz;
    ctx.strokeStyle = '#f1ede4'; ctx.lineWidth = Math.max(2, 3 * lz);
    ctx.beginPath(); ctx.moveTo(gx, baseY + 4); ctx.lineTo(gx, baseY - gh); ctx.lineTo(gx + gw2, baseY - gh); ctx.lineTo(gx + gw2, baseY + 4); ctx.stroke();
    void m;
  }

  // Ombres, poussière soulevée, premier plan, lumière
  drawFront(ctx, cam, dt, excite = 0) {
    const { w, h } = this; const m = this.mood;
    // poussière soulevée par les lutteurs
    for (const p of this.puffs) {
      p.life += dt; p.xm += p.vx * dt; p.y += p.vy * dt; p.vx *= 0.97; p.vy *= 0.96; p.r += dt * 0.35;
      const a = Math.max(0, 1 - p.life / p.max) * 0.35;
      const x = this.screenX(p.xm, cam), y = this.groundY - p.y * this.ppm * cam.zoom;
      const rr = p.r * this.ppm * cam.zoom;
      const gr = ctx.createRadialGradient(x, y, 0, x, y, rr);
      gr.addColorStop(0, rgba('#d9a679', a)); gr.addColorStop(1, rgba('#d9a679', 0));
      ctx.fillStyle = gr; ctx.beginPath(); ctx.arc(x, y, rr, 0, Math.PI * 2); ctx.fill();
    }
    this.puffs = this.puffs.filter(p => p.life < p.max);
    // premier plan flou
    const lz = 1 + (cam.zoom - 1) * 1.2;
    const fw = this.front.width * lz;
    const fx = w / 2 - fw / 2 - cam.x * this.ppm * 1.25;
    const bob = Math.sin(this.t * 2) * 2 * excite;
    ctx.drawImage(this.front, fx, h - this.front.height * lz * 0.85 + bob, fw, this.front.height * lz);
    // particules en suspension dans la lumière
    ctx.save(); ctx.globalCompositeOperation = 'lighter';
    for (const d of this.dust) {
      d.x += (d.v * 0.3 + Math.sin(this.t + d.ph) * 2) * dt * d.z; d.y -= d.v * 0.15 * dt;
      if (d.x > w + 10) d.x = -10; if (d.y < -10) d.y = h + 10;
      ctx.fillStyle = rgba(m.sunGlow, 0.18 * d.z); ctx.beginPath(); ctx.arc(d.x, d.y, d.s * d.z, 0, Math.PI * 2); ctx.fill();
    }
    ctx.restore();
    // rayons de soleil
    ctx.save(); ctx.globalCompositeOperation = 'screen';
    const sx = w * m.sunX, sy = h * m.sunY;
    ctx.globalAlpha = 0.08 * m.light;
    for (let i = 0; i < 6; i++) {
      const a = (m.sunX < 0.5 ? 0.35 : Math.PI - 0.35 - 0.9) + i * 0.16 + Math.sin(this.t * 0.1 + i) * 0.02;
      ctx.fillStyle = m.sunGlow;
      ctx.beginPath(); ctx.moveTo(sx, sy); ctx.lineTo(sx + Math.cos(a) * h * 2, sy + Math.sin(a) * h * 2); ctx.lineTo(sx + Math.cos(a + 0.05) * h * 2, sy + Math.sin(a + 0.05) * h * 2); ctx.fill();
    }
    ctx.restore();
    // étalonnage chaud et vignette
    ctx.save();
    ctx.globalCompositeOperation = 'soft-light';
    ctx.fillStyle = rgba(m.sunGlow, 0.22); ctx.fillRect(0, 0, w, h);
    ctx.restore();
    const vg = ctx.createRadialGradient(w / 2, h * 0.55, h * 0.35, w / 2, h * 0.55, h * 1.05);
    vg.addColorStop(0, 'rgba(0,0,0,0)'); vg.addColorStop(1, 'rgba(10,5,0,0.55)');
    ctx.fillStyle = vg; ctx.fillRect(0, 0, w, h);
  }
}

export { person, hut, tree, clamp };
