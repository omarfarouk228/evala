// Outils de peinture procédurale : hasard reproductible, bruit, couleurs.

export function rng(seed = 1) {
  let s = (seed * 2654435761) >>> 0 || 1;
  return () => {
    s ^= s << 13; s >>>= 0; s ^= s >> 17; s ^= s << 5; s >>>= 0;
    return s / 4294967296;
  };
}

// Bruit de valeur 1D et fBm (lignes de crête, ondulations)
export function noise1(seed) {
  const r = rng(seed); const n = 512; const v = new Float32Array(n);
  for (let i = 0; i < n; i++) v[i] = r();
  return (x) => {
    const i = Math.floor(x), f = x - i;
    const a = v[((i % n) + n) % n], b = v[(((i + 1) % n) + n) % n];
    const u = f * f * (3 - 2 * f);
    return a + (b - a) * u;
  };
}
export function fbm1(seed, oct = 5) {
  const ns = Array.from({ length: oct }, (_, i) => noise1(seed + i * 101));
  return (x) => {
    let s = 0, amp = 0.5, fr = 1, tot = 0;
    for (let i = 0; i < oct; i++) { s += ns[i](x * fr) * amp; tot += amp; amp *= 0.5; fr *= 2.03; }
    return s / tot;
  };
}

export function hex(c) {
  const n = parseInt(c.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}
export function mix(c1, c2, t) {
  const a = hex(c1), b = hex(c2);
  const r = a.map((v, i) => Math.round(v + (b[i] - v) * t));
  return `rgb(${r[0]},${r[1]},${r[2]})`;
}
export function rgba(c, a) { const [r, g, b] = hex(c); return `rgba(${r},${g},${b},${a})`; }
export function shade(c, k) {
  // k > 0 éclaircit, k < 0 assombrit
  const a = hex(c);
  const r = a.map(v => Math.max(0, Math.min(255, Math.round(k > 0 ? v + (255 - v) * k : v * (1 + k)))));
  return `rgb(${r[0]},${r[1]},${r[2]})`;
}

export function canvas(w, h) {
  const c = document.createElement('canvas');
  c.width = Math.max(1, Math.round(w)); c.height = Math.max(1, Math.round(h));
  return c;
}

// Grain de texture (papier / poussière) en tuile
let grainTile = null;
export function grain() {
  if (grainTile) return grainTile;
  const c = canvas(256, 256), g = c.getContext('2d');
  const img = g.createImageData(256, 256); const r = rng(42);
  for (let i = 0; i < img.data.length; i += 4) {
    const v = 128 + (r() - 0.5) * 90;
    img.data[i] = img.data[i + 1] = img.data[i + 2] = v; img.data[i + 3] = 22;
  }
  g.putImageData(img, 0, 0);
  grainTile = c; return c;
}

export const lerp = (a, b, t) => a + (b - a) * t;
export const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
export const smooth = (t) => t * t * (3 - 2 * t);
