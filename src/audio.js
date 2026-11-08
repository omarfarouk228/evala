// Son synthétisé : rumeur de la foule, chants et percussions des familles,
// chocs, souffles. Rien n'est échantillonné : tout est généré en Web Audio.
// Les sources parlent de « chants, percussions » sans nommer d'instruments :
// on reste sur des timbres génériques (tambour grave, cloche de fer, battements de mains).

let ac = null, master = null, crowdGain = null, crowdFilter = null, musicGain = null;
let musicTimer = null, excite = 0;

export function initAudio() {
  if (ac) { if (ac.state === 'suspended') ac.resume(); return; }
  const AC = window.AudioContext || window.webkitAudioContext;
  if (!AC) return;
  ac = new AC();
  master = ac.createGain(); master.gain.value = 0.8; master.connect(ac.destination);
  // Rumeur : bruit rose filtré et modulé
  const len = ac.sampleRate * 4, buf = ac.createBuffer(2, len, ac.sampleRate);
  for (let ch = 0; ch < 2; ch++) {
    const d = buf.getChannelData(ch); let b0 = 0, b1 = 0, b2 = 0;
    for (let i = 0; i < len; i++) {
      const w = Math.random() * 2 - 1;
      b0 = 0.997 * b0 + w * 0.029; b1 = 0.985 * b1 + w * 0.032; b2 = 0.95 * b2 + w * 0.048;
      d[i] = (b0 + b1 + b2) * 0.35 * (0.75 + 0.25 * Math.sin(i / ac.sampleRate * 2.3 + ch));
    }
  }
  const src = ac.createBufferSource(); src.buffer = buf; src.loop = true;
  crowdFilter = ac.createBiquadFilter(); crowdFilter.type = 'bandpass'; crowdFilter.frequency.value = 700; crowdFilter.Q.value = 0.6;
  crowdGain = ac.createGain(); crowdGain.gain.value = 0;
  src.connect(crowdFilter); crowdFilter.connect(crowdGain); crowdGain.connect(master); src.start();
  musicGain = ac.createGain(); musicGain.gain.value = 0.0; musicGain.connect(master);
}

export function setCrowd(level, exc = 0) {
  if (!ac) return;
  excite = exc;
  const t = ac.currentTime;
  crowdGain.gain.setTargetAtTime(level * (0.35 + exc * 0.5), t, 0.3);
  crowdFilter.frequency.setTargetAtTime(600 + exc * 700, t, 0.3);
}

function env(g, t, a, peak, d) {
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(peak, t + a);
  g.gain.exponentialRampToValueAtTime(0.0001, t + a + d);
}

function drum(t, f = 70, vol = 0.5) {
  const o = ac.createOscillator(), g = ac.createGain();
  o.frequency.setValueAtTime(f * 2.2, t); o.frequency.exponentialRampToValueAtTime(f, t + 0.08);
  env(g, t, 0.004, vol, 0.35); o.connect(g); g.connect(musicGain); o.start(t); o.stop(t + 0.5);
}
function bell(t, f = 820, vol = 0.12) {
  for (const k of [1, 2.76]) {
    const o = ac.createOscillator(), g = ac.createGain(); o.type = 'square'; o.frequency.value = f * k;
    const bp = ac.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = f * k; bp.Q.value = 9;
    env(g, t, 0.002, vol / k, 0.22); o.connect(bp); bp.connect(g); g.connect(musicGain); o.start(t); o.stop(t + 0.3);
  }
}
function clap(t, vol = 0.18) {
  const len = 0.06 * ac.sampleRate, b = ac.createBuffer(1, len, ac.sampleRate), d = b.getChannelData(0);
  for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 3);
  const s = ac.createBufferSource(); s.buffer = b; const f = ac.createBiquadFilter(); f.type = 'bandpass'; f.frequency.value = 1500; f.Q.value = 1;
  const g = ac.createGain(); g.gain.value = vol; s.connect(f); f.connect(g); g.connect(musicGain); s.start(t);
}
// Voix chantée stylisée : appel soliste et réponse du chœur, sur une gamme pentatonique
const SCALE = [0, 2, 4, 7, 9, 12];
function voice(t, midi, dur, vol, chorus) {
  const f0 = 440 * Math.pow(2, (midi - 69) / 12);
  const n = chorus ? 4 : 1;
  for (let k = 0; k < n; k++) {
    const o = ac.createOscillator(); o.type = 'sawtooth';
    o.frequency.setValueAtTime(f0 * (1 + (k - 1.5) * 0.006), t);
    o.frequency.linearRampToValueAtTime(f0 * (1 + (k - 1.5) * 0.006) * 0.985, t + dur);
    const vib = ac.createOscillator(), vg = ac.createGain(); vib.frequency.value = 5 + k * 0.3; vg.gain.value = f0 * 0.012; vib.connect(vg); vg.connect(o.frequency);
    const f1 = ac.createBiquadFilter(); f1.type = 'bandpass'; f1.frequency.value = 750; f1.Q.value = 5;
    const f2 = ac.createBiquadFilter(); f2.type = 'bandpass'; f2.frequency.value = 1150; f2.Q.value = 6;
    const g = ac.createGain();
    g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(vol / n, t + 0.05);
    g.gain.setValueAtTime(vol / n, t + dur * 0.7); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(f1); o.connect(f2); f1.connect(g); f2.connect(g); g.connect(musicGain);
    o.start(t); o.stop(t + dur + 0.05); vib.start(t); vib.stop(t + dur + 0.05);
  }
}

export function startMusic(level = 0.5) {
  if (!ac) return;
  musicGain.gain.setTargetAtTime(level, ac.currentTime, 0.5);
  if (musicTimer) return;
  let next = ac.currentTime + 0.1, beat = 0;
  const bpm = 112, sp = 60 / bpm / 2;
  const phrase = () => [0, 2, 3, 2, 4, 3, 1, 0].map(i => SCALE[i]);
  let call = phrase();
  musicTimer = setInterval(() => {
    while (next < ac.currentTime + 0.3) {
      const b = beat % 16;
      // tambour grave sur les temps, cloche en motif, mains en contretemps
      if (b % 4 === 0) drum(next, 62, 0.5);
      if (b === 6 || b === 14) drum(next, 90, 0.3);
      if ([0, 3, 6, 8, 11, 14].includes(b)) bell(next, 820, 0.08);
      if (b % 2 === 1 && excite > 0.2) clap(next, 0.1 + excite * 0.12);
      // appel / réponse toutes les deux mesures
      const bar = Math.floor(beat / 16) % 4;
      if (b % 2 === 0) {
        const i = b / 2;
        if (bar === 0 && i < 6) voice(next, 57 + call[i], sp * 1.8, 0.07, false);
        if (bar === 1 && i < 6) voice(next, 57 + call[i] - 12 + 12, sp * 1.8, 0.1, true);
        if (bar === 3 && i === 7) call = phrase().sort(() => Math.random() - 0.5);
      }
      next += sp; beat++;
    }
  }, 60);
}
export function stopMusic() {
  if (!ac) return;
  musicGain.gain.setTargetAtTime(0, ac.currentTime, 0.4);
  setTimeout(() => { if (musicTimer && musicGain.gain.value < 0.02) { clearInterval(musicTimer); musicTimer = null; } }, 2000);
}

// Effets du combat
export function sfx(type, vol = 1) {
  if (!ac) return;
  const t = ac.currentTime;
  if (type === 'thud') { // chute dans la terre
    const o = ac.createOscillator(), g = ac.createGain(); o.frequency.setValueAtTime(120, t); o.frequency.exponentialRampToValueAtTime(40, t + 0.25);
    env(g, t, 0.003, 0.7 * vol, 0.4); o.connect(g); g.connect(master); o.start(t); o.stop(t + 0.5);
    noise(t, 0.35, 400, 0.4 * vol);
  } else if (type === 'slap') { // contact des corps
    noise(t, 0.07, 1800, 0.35 * vol);
  } else if (type === 'grunt') { // souffle d'effort
    noise(t, 0.18, 500, 0.18 * vol, 'lowpass');
  } else if (type === 'earth') {
    noise(t, 0.4, 2500, 0.12 * vol);
  } else if (type === 'whistle') { // les aînés interviennent
    const o = ac.createOscillator(), g = ac.createGain(); o.frequency.value = 2100;
    const lfo = ac.createOscillator(), lg = ac.createGain(); lfo.frequency.value = 28; lg.gain.value = 120; lfo.connect(lg); lg.connect(o.frequency);
    env(g, t, 0.01, 0.12 * vol, 0.5); o.connect(g); g.connect(master); o.start(t); lfo.start(t); o.stop(t + 0.6); lfo.stop(t + 0.6);
  } else if (type === 'cheer') { // clameur
    if (crowdGain) { crowdGain.gain.cancelScheduledValues(t); crowdGain.gain.setTargetAtTime(1.1, t, 0.05); crowdGain.gain.setTargetAtTime(0.4 + excite * 0.4, t + 1.2, 0.8); }
    for (let i = 0; i < 5; i++) voice(t + i * 0.05, 64 + SCALE[i % 5], 0.9, 0.05, true);
  }
}
function noise(t, dur, freq, vol, type = 'bandpass') {
  const len = Math.floor(dur * ac.sampleRate), b = ac.createBuffer(1, len, ac.sampleRate), d = b.getChannelData(0);
  for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 2);
  const s = ac.createBufferSource(); s.buffer = b; const f = ac.createBiquadFilter(); f.type = type; f.frequency.value = freq;
  const g = ac.createGain(); g.gain.value = vol; s.connect(f); f.connect(g); g.connect(master); s.start(t);
}

// ------------------------------------------------------------------ ambiances
// 'village' : oiseaux, insectes, vent, tambours lointains · 'menu' : musique douce · 'arena' : foule
let ambTimer = null, ambKind = null, windGain = null, menuGain = null, menuTimer = null;

function bird(t, vol) {
  const o = ac.createOscillator(), g = ac.createGain();
  const f = 2200 + Math.random() * 2200, n = 2 + Math.floor(Math.random() * 4);
  o.type = 'sine';
  for (let i = 0; i < n; i++) {
    const tt = t + i * (0.09 + Math.random() * 0.05);
    o.frequency.setValueAtTime(f * (1 + Math.random() * 0.15), tt);
    o.frequency.exponentialRampToValueAtTime(f * (0.7 + Math.random() * 0.5), tt + 0.07);
  }
  g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(vol, t + 0.02);
  g.gain.setValueAtTime(vol, t + n * 0.11); g.gain.exponentialRampToValueAtTime(0.0001, t + n * 0.13);
  const p = ac.createStereoPanner ? ac.createStereoPanner() : null;
  if (p) { p.pan.value = Math.random() * 2 - 1; o.connect(g); g.connect(p); p.connect(master); } else { o.connect(g); g.connect(master); }
  o.start(t); o.stop(t + n * 0.14 + 0.05);
}
function insect(t, vol) {
  // stridulation : bruit très aigu haché
  const dur = 0.6 + Math.random() * 1.2;
  const len = Math.floor(dur * ac.sampleRate), b = ac.createBuffer(1, len, ac.sampleRate), d = b.getChannelData(0);
  const rate = 28 + Math.random() * 20;
  for (let i = 0; i < len; i++) { const ph = (i / ac.sampleRate) * rate; d[i] = (Math.random() * 2 - 1) * (ph % 1 < 0.4 ? 1 : 0.05) * Math.sin(Math.PI * i / len); }
  const s = ac.createBufferSource(); s.buffer = b; const f = ac.createBiquadFilter(); f.type = 'bandpass'; f.frequency.value = 5200 + Math.random() * 2000; f.Q.value = 6;
  const g = ac.createGain(); g.gain.value = vol; s.connect(f); f.connect(g); g.connect(master); s.start(t);
}
function pluck(t, midi, vol) {
  // corde pincée (Karplus-Strong simplifié par filtre) : timbre générique, pas un instrument précis
  const f0 = 440 * Math.pow(2, (midi - 69) / 12);
  const o = ac.createOscillator(), o2 = ac.createOscillator(), g = ac.createGain(), lp = ac.createBiquadFilter();
  o.type = 'triangle'; o2.type = 'sine'; o.frequency.value = f0; o2.frequency.value = f0 * 2.01;
  lp.type = 'lowpass'; lp.frequency.setValueAtTime(f0 * 6, t); lp.frequency.exponentialRampToValueAtTime(f0 * 1.5, t + 0.6);
  g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(vol, t + 0.005); g.gain.exponentialRampToValueAtTime(0.0001, t + 1.4);
  o.connect(lp); o2.connect(lp); lp.connect(g); g.connect(menuGain); o.start(t); o2.start(t); o.stop(t + 1.5); o2.stop(t + 1.5);
}

export function setAmbience(kind) {
  if (!ac || kind === ambKind) return;
  ambKind = kind;
  if (!windGain) {
    const len = ac.sampleRate * 3, b = ac.createBuffer(1, len, ac.sampleRate), d = b.getChannelData(0); let last = 0;
    for (let i = 0; i < len; i++) { last = 0.995 * last + (Math.random() * 2 - 1) * 0.05; d[i] = last; }
    const s = ac.createBufferSource(); s.buffer = b; s.loop = true;
    const f = ac.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = 500;
    windGain = ac.createGain(); windGain.gain.value = 0; s.connect(f); f.connect(windGain); windGain.connect(master); s.start();
    menuGain = ac.createGain(); menuGain.gain.value = 0; menuGain.connect(master);
  }
  const t = ac.currentTime;
  windGain.gain.setTargetAtTime(kind === 'village' ? 0.5 : kind === 'menu' ? 0.25 : 0.08, t, 0.8);
  menuGain.gain.setTargetAtTime(kind === 'menu' ? 0.5 : kind === 'village' ? 0.12 : 0, t, 0.8);
  if (kind !== 'arena') setCrowd(kind === 'menu' ? 0.12 : 0.03, 0);
  clearInterval(ambTimer);
  ambTimer = setInterval(() => {
    const now = ac.currentTime;
    if (ambKind === 'village' || ambKind === 'menu') {
      if (Math.random() < 0.35) bird(now + Math.random() * 0.5, 0.025 + Math.random() * 0.03);
      if (Math.random() < 0.18) insect(now + Math.random(), 0.02);
      if (ambKind === 'village' && Math.random() < 0.06) { const tt = now + Math.random(); for (let i = 0; i < 6; i++) drumFar(tt + i * 0.27 + (i % 3 === 2 ? 0.13 : 0)); }
    }
  }, 700);
  if (!menuTimer) {
    // motif lent sur une gamme pentatonique, joué en boucle à bas volume
    let step = 0, next = ac.currentTime + 0.2;
    const pat = [0, 4, 7, 9, 7, 4, 2, 4, 0, 4, 7, 12, 9, 7, 4, 2];
    menuTimer = setInterval(() => {
      while (next < ac.currentTime + 0.4) {
        const i = step % 16;
        if (menuGain.gain.value > 0.01) {
          pluck(next, 55 + pat[i], 0.09);
          if (i % 4 === 0) pluck(next, 43 + pat[(i + 8) % 16], 0.07);
        }
        next += 0.36; step++;
      }
    }, 120);
  }
}
function drumFar(t) {
  const o = ac.createOscillator(), g = ac.createGain(); o.frequency.setValueAtTime(110, t); o.frequency.exponentialRampToValueAtTime(60, t + 0.12);
  g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(0.05, t + 0.005); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.35);
  const lp = ac.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 300;
  o.connect(lp); lp.connect(g); g.connect(master); o.start(t); o.stop(t + 0.4);
}
