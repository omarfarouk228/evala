// Évala : la saison des lutteurs. Écrans, aventure sur trois ans, combats.
import { Arena } from './arena.js';
import { makeWrestler, makeBout, makeAI, think, command, step, simulate } from './combat.js';
import { makeVis, updateVis, drawPair } from './fighter.js';
import { ACTIVITIES, makeTeam, dateLabel, HOME, BANDS, PLAYER, SKINS, FIRST_YEAR, ARCADE, ROUNDS, roundLabel, bracketFor } from './data.js';
import { initAudio, setCrowd, startMusic, stopMusic, sfx, setAmbience, setMuted, muted } from './audio.js';

const cv = document.getElementById('scene');
const ctx = cv.getContext('2d');
const $ = (id) => document.getElementById(id);
const screen = $('screen');
let W = 0, H = 0, DPR = 1;

// ------------------------------------------------------------------ état
const GRADES = ['Évalou de première année', 'Évalou de deuxième année', 'Évalou de troisième année', 'Eskpa'];
const PREP_DAYS = 10;
const SAVE_KEY = 'evala.save.v1';
const CP_KEY = 'evala.checkpoints.v1';
const ARCADE_KEY = 'evala.arcade.best';
const yr = () => FIRST_YEAR + G.year - 1;

function newGame() {
  return {
    year: 1, day: 1, slot: 0, phase: 'prep', match: 0,
    stats: { force: 0.9, souffle: 0.9, technique: 0.88 },
    fatigue: 0, moral: 0, famille: 0,
    record: [],          // { year, rival, us, them, won }
    bouts: { won: 0, lost: 0, draw: 0 },
    tutoDone: false,
    yb: { won: 0, lost: 0 }, awards: [],
  };
}
let G = null;
function save() { try { localStorage.setItem(SAVE_KEY, JSON.stringify(G)); } catch { /* stockage indisponible */ } }
function checkpoints() { try { return JSON.parse(localStorage.getItem(CP_KEY) || '[]'); } catch { return []; } }
function checkpoint(id, label) {
  const list = checkpoints().filter(c => c.id !== id);
  list.push({ id, label, year: G.year, at: Date.now(), state: JSON.stringify(G) });
  try { localStorage.setItem(CP_KEY, JSON.stringify(list.slice(-24))); } catch { /* plein */ }
}
function load() { try { const s = localStorage.getItem(SAVE_KEY); return s ? JSON.parse(s) : null; } catch { return null; } }

// ------------------------------------------------------------------ rendu
const arenaCache = new Map();
function getArena(key, opts) {
  const k = `${key}|${W}x${H}`;
  if (!arenaCache.has(k)) { const a = new Arena(opts); a.build(W, H); arenaCache.set(k, a); }
  return arenaCache.get(k);
}

function resize() {
  DPR = Math.min(window.devicePixelRatio || 1, 1.5);
  const w = Math.round(window.innerWidth * DPR), h = Math.round(window.innerHeight * DPR);
  if (w === W && h === H) return;
  W = w; H = h; cv.width = W; cv.height = H;
  arenaCache.clear();
  if (scene && scene.onResize) scene.onResize();
}
window.addEventListener('resize', resize);

// Scène de fond (menus, journée au village) : caméra qui dérive lentement
function backdrop(key, opts) {
  const s = { cam: { x: 0, zoom: 1 }, t: 0, key, opts };
  s.onResize = () => { s.arena = getArena(key, opts); };
  s.onResize();
  s.amb = key === 'village' ? 'village' : key === 'title' ? 'menu' : 'arena';
  setAmbience(s.amb);
  if (s.amb === 'arena') { setCrowd(0.45, 0.15); startMusic(0.22); } else stopMusic();
  s.update = (dt) => { s.t += dt; s.cam.x = Math.sin(s.t * 0.05) * 3; s.cam.zoom = 1.02 + Math.sin(s.t * 0.07) * 0.02; };
  s.draw = () => { s.arena.drawBack(ctx, s.cam, s.t, 0.1); s.arena.drawFront(ctx, s.cam, 1 / 60, 0.1); };
  return s;
}

let scene = null, last = performance.now();
function loop(now) {
  const dt = Math.min(0.05, (now - last) / 1000); last = now;
  if (scene) { scene.update(dt); scene.draw(); }
  requestAnimationFrame(loop);
}

// ------------------------------------------------------------------ entrées
const keys = new Set();
const pressed = new Set();
const KEYMAP = { ArrowLeft: 'left', KeyA: 'left', KeyQ: 'left', ArrowRight: 'right', KeyD: 'right', Space: 'grab', KeyJ: 'grab', KeyK: 'trip', KeyL: 'lift', ArrowDown: 'earth', KeyS: 'earth' };
window.addEventListener('keydown', (e) => {
  const k = KEYMAP[e.code]; if (!k) return;
  if (!keys.has(k)) pressed.add(k);
  keys.add(k); e.preventDefault();
});
window.addEventListener('keyup', (e) => { const k = KEYMAP[e.code]; if (k) keys.delete(k); });
for (const b of document.querySelectorAll('#touch button')) {
  const k = b.dataset.k;
  const on = (e) => { e.preventDefault(); if (!keys.has(k)) pressed.add(k); keys.add(k); b.classList.add('on'); };
  const off = (e) => { e.preventDefault(); keys.delete(k); b.classList.remove('on'); };
  b.addEventListener('pointerdown', on); b.addEventListener('pointerup', off); b.addEventListener('pointercancel', off); b.addEventListener('pointerleave', off);
}
const isTouch = matchMedia('(pointer: coarse)').matches;

// ------------------------------------------------------------------ combat
function fightScene(o) {
  const arena = getArena(`fight-${o.mood}-${o.few ? 'f' : o.empty ? 'e' : 'c'}`, { mood: o.mood, few: o.few, empty: o.empty, seed: o.seed || 3 });
  const a = makeWrestler({ ...o.a, look: o.a.look });
  const b = makeWrestler({ ...o.b, look: o.b.look });
  const bout = makeBout(a, b, { seed: (Math.random() * 1e9) | 0, timeLimit: o.timeLimit || 60 });
  a.stamina = 1 - (o.fatigue || 0) * 0.45;
  bout.phase = 'intro';
  const ai = makeAI(b, { style: o.b.style, skill: o.b.skill });
  const va = makeVis(), vb = makeVis();
  const cam = { x: 0, zoom: 1, shake: 0, y: 0 };
  const s = { arena, a, b, bout, t: 0, slow: 0, endT: 0, introT: 0, exc: 0.2, tuto: o.tutorial ? tutorial() : null };
  s.onResize = () => { s.arena = getArena(`fight-${o.mood}-${o.few ? 'f' : o.empty ? 'e' : 'c'}`, { mood: o.mood, few: o.few, empty: o.empty, seed: o.seed || 3 }); };

  // HUD
  $('hud').hidden = false; $('balance').hidden = false; $('touch').hidden = !isTouch;
  $('h-name-a').textContent = a.name; $('h-canton-a').textContent = o.a.canton || HOME;
  $('h-name-b').textContent = b.name; $('h-canton-b').textContent = o.b.canton || '';
  $('h-band-a').style.background = a.look.band; $('h-band-b').style.background = b.look.band;
  $('bal-a').style.background = '#e8b04a'; $('bal-b').style.background = b.look.band;
  $('h-round').textContent = o.label || 'Combat';
  versus(o, a, b);
  setAmbience(o.empty ? 'village' : 'arena');
  setCrowd(o.empty ? 0.15 : o.few ? 0.4 : 0.8, 0.2);
  if (!o.empty) startMusic(o.few ? 0.25 : 0.45);

  s.update = (dt) => {
    s.t += dt;
    let sdt = dt;
    if (s.slow > 0) { s.slow -= dt; sdt = dt * 0.28; }
    if (bout.phase === 'intro') {
      s.introT += dt;
      if (s.introT > 2.8) { bout.phase = 'fight'; $('vs').hidden = true; callout('Luttez !'); setTimeout(hideCallout, 700); sfx('whistle'); if (s.tuto) s.tuto.show(); }
    }
    // commandes du joueur (repère : le joueur regarde vers la droite)
    if (bout.phase === 'fight') {
      const move = (keys.has('right') ? 1 : 0) - (keys.has('left') ? 1 : 0);
      command(bout, a, { move, grab: pressed.has('grab'), trip: pressed.has('trip'), lift: pressed.has('lift'), earth: pressed.has('earth') });
      if (!s.tuto || s.tuto.aiOn()) think(ai, bout, sdt); else command(bout, b, { move: s.tuto.aiMove(bout) });
    }
    pressed.clear();
    step(bout, sdt);
    for (const e of bout.events) { onEvent(s, e, cam); if (o.onEvent) o.onEvent(e); }
    if (s.tuto) s.tuto.check(bout, s);
    bout.events.length = 0;
    updateVis(va, a, b, bout, sdt); updateVis(vb, b, a, bout, sdt);
    // caméra
    const mid = (a.x + b.x) / 2;
    const gapv = Math.abs(b.x - a.x);
    const tz = bout.clinch ? 1.42 : bout.phase === 'ended' ? 1.3 : 1.12 - Math.min(0.15, (gapv - 1) * 0.06);
    cam.zoom += (tz - cam.zoom) * Math.min(1, dt * 2.2);
    cam.x += (mid - cam.x) * Math.min(1, dt * 3);
    cam.shake = Math.max(0, cam.shake - dt * 2.5);
    // excitation de la foule
    const danger = Math.max(Math.abs(a.lean), Math.abs(b.lean));
    s.exc += ((bout.clinch ? 0.45 : 0.2) + danger * 0.5 - s.exc) * Math.min(1, dt * 2);
    setCrowd(o.empty ? 0.15 : o.few ? 0.4 : 0.8, s.exc);
    // HUD
    $('h-sta-a').style.width = `${a.stamina * 100}%`; $('h-sta-b').style.width = `${b.stamina * 100}%`;
    $('h-grip-a').style.width = `${a.grip * 100}%`; $('h-grip-b').style.width = `${b.grip * 100}%`;
    $('h-time').textContent = Math.max(0, Math.ceil(bout.timeLimit - (bout.phase === 'intro' ? 0 : bout.t))).toString();
    $('bal-a').style.left = `${50 + Math.max(-1, Math.min(1, a.lean)) * 50}%`;
    $('bal-b').style.left = `${50 + Math.max(-1, Math.min(1, b.lean)) * 50}%`;
    if (bout.phase === 'ended') {
      s.endT += dt;
      if (s.endT > 3.2 && !s.done) { s.done = true; cleanupFight(); o.onEnd(bout.result, { a, b, bout }); }
    }
  };
  s.draw = () => {
    const sh = cam.shake * cam.shake * 14 * DPR;
    ctx.save();
    ctx.translate((Math.random() - 0.5) * sh, (Math.random() - 0.5) * sh);
    s.arena.drawBack(ctx, cam, s.t, s.exc);
    const light = s.arena.mood.light;
    drawPair(ctx, s.arena, cam, a, b, va, vb, bout, light);
    drawTell(s, cam, ai);
    s.arena.drawFront(ctx, cam, 1 / 60, s.exc);
    ctx.restore();
  };
  bout.phase = 'intro';
  return s;
}

// Indice visuel quand l'adversaire prépare un geste (plus discret les années suivantes)
function drawTell(s, cam, ai) {
  const b = s.b; if (!ai.pending || !b.tell) return;
  if (G && G.year >= 3 && ai.pending !== 'lift') return;
  const x = s.arena.screenX(b.x, cam), y = s.arena.groundY - 2.0 * s.arena.ppm * cam.zoom;
  const lbl = { grab: 'Il va saisir', trip: 'Crochet !', lift: 'Il va soulever' }[ai.pending];
  if (!lbl) return;
  ctx.save(); ctx.font = `700 ${Math.round(15 * DPR)}px 'Instrument Sans', sans-serif`; ctx.textAlign = 'center';
  ctx.fillStyle = 'rgba(23,17,13,0.65)';
  const tw = ctx.measureText(lbl).width + 18 * DPR;
  ctx.beginPath(); ctx.roundRect(x - tw / 2, y - 22 * DPR, tw, 28 * DPR, 14 * DPR); ctx.fill();
  ctx.fillStyle = '#f4d38a'; ctx.fillText(lbl, x, y - 3 * DPR); ctx.restore();
}

function onEvent(s, e, cam) {
  const { arena, a, b } = s;
  const W_ = e.who === 'a' ? a : b;
  if (e.type === 'clinch') { sfx('slap'); arena.puff((a.x + b.x) / 2, 8, 0.6); }
  if (e.type === 'miss') { arena.puff(W_.x, 5, 0.5); }
  if (e.type === 'earth') { sfx('earth'); arena.puff(W_.x + W_.dir * 0.4, 6, 0.4); if (e.who === 'a') flash('La terre dans les mains : la prise revient'); }
  if (e.type === 'trip') { sfx('grunt'); if (e.ok === true) { arena.puff(W_.x, 10, 1); cam.shake = 0.4; } if (e.who === 'a' && e.ok === false) flash('Il pousse trop fort : le crochet ne passe pas'); }
  if (e.type === 'lift') { sfx('grunt', 1.4); if (e.ok === false && e.who === 'a') flash('Pas assez de force ou de souffle pour le soulever'); }
  if (e.type === 'break') { sfx('whistle', 0.7); flash(e.reason === 'elders' ? 'Les aînés séparent les lutteurs' : 'Les corps graissés glissent : la prise lâche'); }
  if (e.type === 'fall') { s.slow = 0.9; cam.shake = 1; const f = e.who === 'a' ? a : b; setTimeout(() => { sfx('thud'); arena.puff(f.x - f.fallDir * f.dir * 0.8, 26, 1.6); }, 380); }
  if (e.type === 'end') {
    const r = e.result;
    if (r.winner === 'a') { sfx('cheer'); callout('Victoire', `${a.name} met ${b.name} à terre`); }
    else if (r.winner === 'b') { callout('À terre', `${b.name} l'emporte`); setTimeout(() => sfx('cheer'), 600); }
    else if (r.reason === 'time') { sfx('whistle'); callout('Match nul', 'À la limite du temps'); }
    else { callout('Les deux à terre', 'Les aînés déclarent le nul'); }
  }
}

function cleanupFight() {
  $('vs').hidden = true;
  $('hud').hidden = true; $('balance').hidden = true; $('touch').hidden = true; $('coach').hidden = true; hideCallout();
  stopMusic(); setCrowd(0.2, 0);
}

// Écran de face-à-face au début de chaque combat
function versus(o, a, b) {
  const el = $('vs'); el.hidden = false;
  const bar = (v) => `<i style="width:${Math.round(Math.min(1, (v - 0.6) / 0.9) * 100)}%"></i>`;
  const card = (w, st, side) => `<div class="vs-side ${side}"><div class="vs-c">${st.canton || ''}</div><div class="vs-n">${w.name}</div>
    <div class="vs-st"><label>Force</label><div class="bar">${bar(w.force)}</div><label>Souffle</label><div class="bar">${bar(w.souffle)}</div><label>Technique</label><div class="bar">${bar(w.technique)}</div></div></div>`;
  el.innerHTML = `<div class="vs-top">${o.label || ''}</div>${card(a, o.a, 'l')}<div class="vs-x">contre</div>${card(b, o.b, 'r')}<div class="vs-sub">${o.subtitle || 'Les aînés donnent le signal'}</div>`;
  el.style.setProperty('--ca', a.look.band); el.style.setProperty('--cb', b.look.band);
  el.classList.remove('go'); void el.offsetWidth; el.classList.add('go');
}

let calloutTimer = null;
function callout(big, small) {
  const el = $('callout'); el.hidden = false;
  el.innerHTML = `${big}${small ? `<small>${small}</small>` : ''}`;
  el.style.animation = 'none'; void el.offsetWidth; el.style.animation = '';
}
function hideCallout() { $('callout').hidden = true; }
let flashTimer = null;
function flash(t) {
  const el = $('coach'); if (scene && scene.tuto && scene.tuto.active) return;
  el.hidden = false; el.innerHTML = t; clearTimeout(flashTimer); flashTimer = setTimeout(() => { el.hidden = true; }, 2200);
}

// ------------------------------------------------------------------ tutoriel
function tutorial() {
  const K = isTouch
    ? { left: '◀', right: '▶', grab: 'Saisir', trip: 'Crochet', lift: 'Soulever', earth: 'Terre' }
    : { left: '←', right: '→', grab: 'Espace', trip: 'K', lift: 'L', earth: '↓' };
  const k = (x) => `<kbd>${K[x]}</kbd>`;
  const steps = [
    { t: `Pyabalo, ton grand frère, a lutté trois ans. « Avance vers moi. » ${k('right')}`, ok: (b) => Math.abs(b.b.x - b.a.x) < 1.1 },
    { t: `« Saisis-moi à bras-le-corps. » ${k('grab')} quand tu es près`, ok: (b) => b.clinch },
    { t: `« Pousse ! Fais-moi reculer. » Maintiens ${k('right')}`, ok: (b) => b.b.lean < -0.3, ai: 'hold' },
    { t: `« Je recule sur mes talons : c'est le moment du crochet. » ${k('trip')}`, ok: (b, e) => e.some(x => x.type === 'trip' && x.who === 'a' && x.ok === true), ai: 'back' },
    { t: `« Maintenant je pousse fort. Ne résiste pas : tire-moi en avant. » Maintiens ${k('left')}`, ok: (b) => b.b.lean > 0.4, ai: 'push' },
    { t: `« Les corps sont graissés, la prise glisse. Quand on est séparés, baisse-toi pour prendre la terre. » ${k('earth')}`, ok: (b, e) => e.some(x => x.type === 'earth' && x.who === 'a'), ai: 'sep' },
    { t: `« Quand l'autre est sans souffle, soulève-le. Mais si tu n'as pas la force, tu te fatigues pour rien. » ${k('lift')} au corps à corps`, ok: (b, e) => e.some(x => x.type === 'lift' && x.who === 'a'), ai: 'hold' },
    { t: `« Bien. Maintenant, je lutte pour de vrai. Mets-moi à terre ! »`, ok: () => false, ai: 'real' },
  ];
  let i = 0; const evs = [];
  const T = {
    active: true,
    show() { $('coach').hidden = false; $('coach').innerHTML = steps[i].t; },
    aiOn() { return steps[i].ai === 'real'; },
    aiMove(bout) {
      const m = steps[i].ai;
      if (m === 'push') return 1;
      if (m === 'back') return -1;
      if (m === 'sep') return bout.clinch ? 0 : -1;
      if (m === 'hold') return 0;
      return 0;
    },
    check(bout, s) {
      if (bout.phase !== 'fight') return;
      evs.push(...bout.events);
      if (steps[i].ai === 'sep' && bout.clinch && !T.sepDone) { T.sepDone = true; bout.clinch = false; bout.a.x -= 0.8; bout.b.x += 0.8; bout.a.grip = 0.3; }
      if (steps[i].ai === 'back' && bout.clinch) { bout.b.input = -1; }
      // pas de chute pendant les exercices
      if (steps[i].ai !== 'real') { for (const w of [bout.a, bout.b]) { w.lean = Math.max(-0.9, Math.min(0.9, w.lean)); } bout.t = Math.min(bout.t, 5); }
      if (steps[i].ok(bout, evs)) {
        i++; evs.length = 0; sfx('slap', 0.5);
        if (i >= steps.length - 1) { T.active = steps[i].ai !== 'real'; bout.t = 0; }
        T.show();
        if (steps[i].ai === 'real') setTimeout(() => { $('coach').hidden = true; T.active = false; }, 3500);
      }
      void s;
    },
  };
  return T;
}

// ------------------------------------------------------------------ écrans
function show(html, dim = true) { screen.className = `screen${dim ? ' dim' : ''}`; screen.innerHTML = html; }
function clearScreen() { screen.innerHTML = ''; }

function titleScreen() {
  scene = backdrop('title', { mood: 'aprem', few: true, seed: 11 });
  const saved = load();
  const best = (() => { try { return +localStorage.getItem(ARCADE_KEY) || 0; } catch { return 0; } })();
  show(`<div class="title">
    <div class="kick">Pays kabyè · Kozah · juillet</div>
    <h1>Évala</h1>
    <p class="sub">Trois saisons pour devenir un homme. Prépare-toi aux champs et dans les collines, écoute les anciens, puis lutte pour ton canton dans les arènes.</p>
    <div class="modes">
      <button class="mode" id="m-adv"><b>Aventure</b><span>${saved ? `Reprendre : Évala ${FIRST_YEAR + saved.year - 1}, ${GRADES[saved.year - 1].toLowerCase()}` : 'Trois Évala, de 2026 à 2028'}</span></button>
      <button class="mode" id="m-arc"><b>Arcade</b><span>La tournée des cantons : huit adversaires d'affilée${best ? ` · record ${best}` : ''}</span></button>
      <button class="mode" id="m-tr"><b>Entraînement</b><span>Combat libre et leçon de Pyabalo</span></button>
    </div>
    <p class="note">Le jeu ne montre que la partie publique de l'Évala : les luttes dans les arènes, les familles et les aînés. Les rites réservés aux initiés restent hors champ.</p>
  </div>`);
  const go = (fn) => () => { initAudio(); setAmbience('menu'); fn(); };
  $('m-adv').onclick = go(adventureMenu);
  $('m-arc').onclick = go(arcade);
  $('m-tr').onclick = go(freeTraining);
  // premier geste n'importe où : lancer l'ambiance
  window.addEventListener('pointerdown', () => { initAudio(); if (scene && scene.amb) setAmbience(scene.amb); }, { once: true });
}

function adventureMenu() {
  const saved = load();
  const cps = checkpoints().sort((a, b) => a.year - b.year || a.id.localeCompare(b.id));
  show(`<div class="card"><div class="kick">Aventure</div><h2>Trois Évala</h2>
    <p>Chaque juillet, de 2026 à 2028, tu lutteras pour Landa. Ce que tu gagnes en force, en souffle et en technique te suit d'une année à l'autre.</p>
    <div class="acts-list">
      ${saved ? `<button class="act" id="a-cont">${ICONS.lutte}<div><b>Continuer</b><span>Évala ${FIRST_YEAR + saved.year - 1} · ${GRADES[saved.year - 1]}</span></div></button>` : ''}
      <button class="act" id="a-new">${ICONS.colline}<div><b>Nouvelle aventure</b><span>Commencer à l'Évala ${FIRST_YEAR}${saved ? ' (remplace la partie en cours)' : ''}</span></div></button>
    </div>
    ${cps.length ? `<h3 style="margin:22px 0 8px;font-size:12px;letter-spacing:.2em;text-transform:uppercase;color:var(--bone-dim)">Revenir à un moment de l'aventure</h3>
    <div class="acts-list">${cps.map((c, i) => `<button class="act cp" data-i="${i}">${ICONS.ancien}<div><b>${c.label}</b><span>${GRADES[c.year - 1]}</span></div></button>`).join('')}</div>` : ''}
    <div class="row" style="justify-content:flex-start;margin-top:16px"><button class="btn ghost" id="b-back">Retour</button></div></div>`);
  if (saved) $('a-cont').onclick = () => { G = saved; resume(); };
  $('a-new').onclick = () => { G = newGame(); save(); intro(); };
  for (const b of screen.querySelectorAll('.cp')) b.onclick = () => { G = JSON.parse(cps[+b.dataset.i].state); save(); resume(); };
  $('b-back').onclick = titleScreen;
}

function intro() {
  scene = backdrop('village', { mood: 'matin', empty: true, seed: 21 });
  show(`<div class="card">
    <div class="kick">Landa · ${dateLabel(1, yr())} · année 1</div>
    <h2>Le temps de l'Évala</h2>
    <p>Tu t'appelles <b>${PLAYER.name}</b>. Tu as dix-huit ans. Cette année, ton oncle maternel a donné son accord : tu entres dans l'Évala.</p>
    <p>Pendant trois ans, chaque mois de juillet, tu lutteras pour <b>Landa</b> contre les jeunes des autres cantons de la Kozah. Chaque année, tu changeras de grade. Au bout des trois ans, tu seras <b>Eskpa</b>.</p>
    <p>Les luttes commencent le samedi 11 juillet. Tu as dix jours pour te préparer.</p>
    <p class="dim">Sources : ATOP, Lomé Express, Wikipédia. Les prénoms et les détails de la vie au village sont des reconstitutions.</p>
    <div class="row" style="justify-content:flex-start;margin-top:18px"><button class="btn hot" id="b-go">Rejoindre Pyabalo sur la place</button></div>
  </div>`);
  $('b-go').onclick = () => {
    clearScreen();
    scene = fightScene({
      mood: 'matin', empty: true, tutorial: true, label: 'Entraînement', title: 'Sur la place', subtitle: 'Pyabalo t\'apprend les gestes', timeLimit: 999,
      a: playerFighter(), b: { name: 'Pyabalo', canton: HOME, force: 1.0, souffle: 1.0, technique: 1.0, style: 'patient', skill: 0.35, look: { skin: '#3a2014', cloth: '#30261f', band: BANDS[HOME] } },
      onEnd: () => { G.tutoDone = true; G.stats.technique += 0.03; save(); planDay(); },
    });
  };
}

function playerFighter() {
  return { name: PLAYER.name, canton: HOME, ...G.stats, look: { skin: SKINS[0], cloth: '#2a2422', band: BANDS[HOME], knot: true } };
}

function resume() {
  if (G.phase === 'prep') planDay();
  else if (G.phase === 'tournoi') matchIntro();
  else if (G.phase === 'ceremonie') ceremony();
  else if (G.phase === 'annee') yearEnd();
  else titleScreen();
}

const ICONS = {
  houe: '<svg viewBox="0 0 32 32" fill="none" stroke="currentColor" stroke-width="2"><path d="M8 28 22 6"/><path d="M18 8l8 4-3 3"/></svg>',
  colline: '<svg viewBox="0 0 32 32" fill="none" stroke="currentColor" stroke-width="2"><path d="M2 26l9-12 6 7 4-5 9 10z"/></svg>',
  lutte: '<svg viewBox="0 0 32 32" fill="none" stroke="currentColor" stroke-width="2"><circle cx="10" cy="7" r="3"/><circle cx="22" cy="7" r="3"/><path d="M10 11l5 6 2-6 5 0M10 11l-2 9 3 8M22 11l2 9-3 8"/></svg>',
  ancien: '<svg viewBox="0 0 32 32" fill="none" stroke="currentColor" stroke-width="2"><circle cx="16" cy="8" r="4"/><path d="M9 28c0-8 3-12 7-12s7 4 7 12M25 14v14"/></svg>',
  natte: '<svg viewBox="0 0 32 32" fill="none" stroke="currentColor" stroke-width="2"><path d="M4 22h24M6 22l2-6h16l2 6M10 16v-4h12v4"/></svg>',
};

function statBlock() {
  const st = G.stats;
  const pct = (v) => Math.round(Math.min(1, (v - 0.6) / 0.9) * 100);
  return `<div class="stats">
    <div class="stat"><label>Force</label><b>${Math.round(st.force * 100)}</b><div class="bar"><i style="width:${pct(st.force)}%"></i></div></div>
    <div class="stat"><label>Souffle</label><b>${Math.round(st.souffle * 100)}</b><div class="bar"><i style="width:${pct(st.souffle)}%"></i></div></div>
    <div class="stat"><label>Technique</label><b>${Math.round(st.technique * 100)}</b><div class="bar"><i style="width:${pct(st.technique)}%"></i></div></div>
    <div class="stat"><label>Fatigue</label><b>${Math.round(G.fatigue * 100)}</b><div class="bar grip"><i style="width:${G.fatigue * 100}%"></i></div></div>
  </div>`;
}

const EVENINGS = [
  'Le soir, ta mère sert la pâte de sorgho avec une sauce de feuilles. Tu manges deux fois.',
  'Un orage éclate dans la nuit. Au matin, les terrasses fument et les champs ont bu.',
  'Ton oncle maternel passe à la concession. Il te regarde longuement et ne dit rien : c\'est sa façon d\'être fier.',
  'Les garçons de ton âge parlent des lutteurs de Pya, réputés pour leurs crochets.',
  'Sur la place, des enfants imitent les lutteurs en se roulant dans la poussière.',
  'Le vieux qui fut champion dans sa jeunesse raconte qu\'on ne gagne pas avec les bras, mais avec les pieds.',
  'Une moto passe sur la route de Kara, chargée de sacs d\'igname pour le marché.',
  'Tes sœurs préparent les chants qu\'elles entonneront au bord de l\'arène.',
  'La nuit est fraîche. On entend des tambours au loin, du côté de Tcharè.',
  'Ton père répare la toiture de la case avant les grosses pluies d\'août.',
];

function planDay() {
  G.phase = 'prep';
  if (G.day === 1) checkpoint(`y${G.year}`, `Évala ${yr()} · début de la préparation`);
  scene = backdrop('village', { mood: G.day % 3 === 1 ? 'orage' : 'matin', empty: true, seed: 21 });
  const choice = [null, null];
  const render = () => {
    const opts = (slot) => Object.entries(ACTIVITIES).map(([id, a]) => `
      <button class="act ${choice[slot] === id ? 'sel' : ''}" data-slot="${slot}" data-id="${id}">${ICONS[a.icon]}<div><b>${a.label}</b><span>${a.desc}</span></div></button>`).join('');
    show(`<div class="card plan">
      <div class="top">
        <div><div class="kick">${GRADES[G.year - 1]} · jour ${G.day} sur ${PREP_DAYS}</div><h2>${dateLabel(G.day, yr())}</h2></div>
        <div class="dim" style="font-size:14px;color:var(--bone-dim)">Évala dans ${11 - G.day} jour${11 - G.day > 1 ? 's' : ''}</div>
      </div>
      ${statBlock()}
      <div class="slots">
        <div class="slot"><h3>Matin</h3><div class="acts-list">${opts(0)}</div></div>
        <div class="slot"><h3>Après-midi</h3><div class="acts-list">${opts(1)}</div></div>
      </div>
      <div class="log">${G.fatigue > 0.7 ? 'Tu es épuisé : sans repos, l\'entraînement profite moins et tu luttes sans souffle.' : ''}</div>
      <div class="row" style="justify-content:flex-end;margin-top:12px"><button class="btn hot" id="b-day" ${choice[0] && choice[1] ? '' : 'disabled style="opacity:.5"'}>Vivre la journée</button></div>
    </div>`);
    for (const b of screen.querySelectorAll('.act')) b.onclick = () => { choice[+b.dataset.slot] = b.dataset.id; render(); };
    const go = $('b-day'); if (choice[0] && choice[1]) go.onclick = () => runDay(choice);
  };
  render();
}

function applyActivity(id) {
  const e = ACTIVITIES[id].effect;
  const eff = G.fatigue > 0.7 ? 0.4 : 1;
  for (const k of ['force', 'souffle', 'technique']) if (e[k]) G.stats[k] = Math.min(1.6, G.stats[k] + e[k] * eff);
  G.fatigue = Math.max(0, Math.min(1, G.fatigue + (e.fatigue || 0)));
  if (e.famille) G.famille += e.famille;
  if (e.moral) G.moral += e.moral;
}

function runDay(choice) {
  const doSlot = (i) => {
    if (i > 1) { if (G.phase === 'tournoi') { save(); return matchIntro(); } return endDay(); }
    const id = choice[i];
    if (ACTIVITIES[id].fight) {
      // combat d'entraînement contre un jeune des concessions voisines
      const sp = makeTeam(HOME, 100 + G.day * 7 + i + G.year * 31, 0.9 + G.year * 0.06)[0];
      clearScreen();
      scene = fightScene({
        mood: 'matin', few: true, label: 'Entraînement', title: 'Sur la place du village', subtitle: `Contre ${sp.name}`, timeLimit: 45, fatigue: G.fatigue,
        a: playerFighter(), b: { ...sp, look: { ...sp.look, band: '#8a7a66' } },
        onEnd: (r) => {
          applyActivity(id);
          if (r.winner === 'a') G.stats.technique += 0.02;
          doSlot(i + 1);
        },
      });
      return;
    }
    applyActivity(id); doSlot(i + 1);
  };
  doSlot(0);
}

function endDay() {
  const ev = EVENINGS[(G.day * 3 + G.year * 5) % EVENINGS.length];
  G.fatigue = Math.max(0, G.fatigue - 0.18);
  G.day++;
  if (G.day > PREP_DAYS) { G.phase = 'tournoi'; save(); return veille(); }
  save();
  scene = backdrop('village', { mood: 'aprem', empty: true, seed: 21 });
  show(`<div class="card"><div class="kick">Le soir</div><h2>${dateLabel(G.day - 1, yr())}</h2><p>${ev}</p>${statBlock()}<div class="row" style="justify-content:flex-end"><button class="btn hot" id="b-next">Dormir</button></div></div>`);
  $('b-next').onclick = planDay;
}

function veille() {
  scene = backdrop('village', { mood: 'orage', empty: true, seed: 21 });
  show(`<div class="card"><div class="kick">${dateLabel(10, yr())} · la veille</div><h2>Le départ des évalous</h2>
    <p>Au soir, les évalous de Landa quittent leurs familles avec leurs maîtres pour un lieu retiré, interdit aux femmes et aux enfants. Ce qui s'y passe appartient aux initiés : le jeu ne le montre pas.</p>
    <p>Demain, l'Évala commence. Les familles iront à l'arène avec leurs chants.</p>
    <div class="row" style="justify-content:flex-end"><button class="btn hot" id="b-next">Aller à l'arène</button></div></div>`);
  $('b-next').onclick = tournamentStart;
}

// ------------------------------------------------------------------ tournoi
// Tableau à huit cantons, élimination directe. Chaque rencontre : trois tours de cinq combats,
// on compte les victoires ; en cas d'égalité, les aînés font lutter un combat décisif.

function br() {
  if (!G.br || G.br.year !== G.year) G.br = { year: G.year, teams: bracketFor(G.year), alive: [0, 1, 2, 3, 4, 5, 6, 7], round: 0, res: [], out: false, best: null };
  return G.br;
}
const teamName = (i) => br().teams[i].c;
const homeAlive = () => br().alive.includes(0);

function bracketHTML() {
  const B = br();
  const col = (r) => {
    const list = B.res[r];
    if (list) return list.map(m => `<div class="mt"><span class="${m.w === m.a ? 'win' : ''} ${m.a === 0 ? 'me' : ''}">${teamName(m.a)} <b>${m.sa}</b></span><span class="${m.w === m.b ? 'win' : ''} ${m.b === 0 ? 'me' : ''}">${teamName(m.b)} <b>${m.sb}</b></span></div>`).join('');
    if (r === B.round) { const al = B.alive; let h = ''; for (let i = 0; i < al.length; i += 2) h += `<div class="mt next"><span class="${al[i] === 0 ? 'me' : ''}">${teamName(al[i])}</span><span class="${al[i + 1] === 0 ? 'me' : ''}">${teamName(al[i + 1])}</span></div>`; return h; }
    return Array.from({ length: 4 >> r }, () => '<div class="mt"><span>·</span><span>·</span></div>').join('');
  };
  return `<div class="bracket">${ROUNDS.map((R, r) => `<div class="bcol"><h4>${R.name}<small>${roundLabel(G.year, r)}</small></h4>${col(r)}</div>`).join('')}</div>`;
}

function tournamentStart() {
  br(); G.phase = 'tournoi'; save();
  scene = backdrop('m0', { mood: 'aprem', seed: 3 });
  show(`<div class="card wide"><div class="kick">Évala ${yr()} · le tableau</div><h2>Huit cantons, un vainqueur</h2>
    <p>Les chefs de canton ont fixé les rencontres. Chaque défaite élimine : il faut gagner trois fois pour remporter l'Évala.</p>
    ${bracketHTML()}
    <div class="row" style="justify-content:flex-end"><button class="btn hot" id="b-next">Au premier tour</button></div></div>`);
  $('b-next').onclick = matchIntro;
}

function opponentIdx() { const al = br().alive; return al[al.indexOf(0) ^ 1]; }

function matchIntro() {
  const B = br();
  if (B.round >= ROUNDS.length) return ceremony();
  if (!homeAlive()) return spectate();
  const R = ROUNDS[B.round], opp = opponentIdx();
  checkpoint(`y${G.year}r${B.round}`, `Évala ${yr()} · ${R.name.toLowerCase()} contre ${teamName(opp)}`);
  scene = backdrop(`m${B.round}`, { mood: R.mood, seed: 3 + B.round });
  show(`<div class="card wide"><div class="kick">Évala ${yr()} · ${GRADES[G.year - 1]} · ${roundLabel(G.year, B.round)}</div><h2>${R.name} : Landa contre ${teamName(opp)}</h2>
    <p>${R.key === 'finale' ? 'Le grand terrain de Kara est noir de monde. Les chefs traditionnels sont sous la bâche. Les deux meilleurs cantons de l\'année.' : R.key === 'demi' ? 'Demi-finale : le vainqueur ira à Kara pour la finale. Le perdant rentre au village.' : 'Le premier tour. Les cinq lutteurs de chaque canton se rencontrent tour à tour, et l\'on compte les victoires.'}</p>
    ${bracketHTML()}
    <p class="dim">Tu luttes deux fois. Les autres combats opposent tes coéquipiers aux lutteurs de ${teamName(opp)}.</p>
    <div class="row" style="justify-content:flex-end"><button class="btn hot" id="b-next">Entrer dans l'arène</button></div></div>`);
  $('b-next').onclick = runMatch;
}

// Rencontre simulée entre deux cantons (hors du joueur)
function simTeamMatch(ia, ib, seed) {
  const B = br();
  const A = makeTeam(teamName(ia), seed, B.teams[ia].level), Bt = makeTeam(teamName(ib), seed + 1, B.teams[ib].level);
  let sa = 0, sb = 0, k = 0;
  for (let round = 0; round < 3; round++) for (let i = 0; i < 5; i++) {
    const r = simulate(A[i], Bt[(i + round * 2) % 5], seed + k++ * 13);
    if (r.winner === 'a') sa++; else if (r.winner === 'b') sb++;
  }
  while (sa === sb) { const r = simulate(A[k % 5], Bt[(k + 1) % 5], seed + k++ * 17); if (r.winner === 'a') sa++; else if (r.winner === 'b') sb++; }
  return { a: ia, b: ib, sa, sb, w: sa > sb ? ia : ib };
}

function finishRound(ourMatch) {
  const B = br(), al = B.alive, list = [];
  for (let i = 0; i < al.length; i += 2) {
    if (ourMatch && (al[i] === 0 || al[i + 1] === 0)) list.push(ourMatch);
    else list.push(simTeamMatch(al[i], al[i + 1], 3000 + G.year * 211 + B.round * 37 + i));
  }
  B.res[B.round] = list;
  B.alive = list.map(m => m.w);
  B.round++;
}

function runMatch() {
  const B = br(), R = ROUNDS[B.round], opp = opponentIdx();
  const rival = teamName(opp);
  const ours = makeTeam(HOME, 500 + G.year * 13, 1.0 + (G.year - 1) * 0.05);
  const theirs = makeTeam(rival, 900 + B.round * 17 + G.year * 29, B.teams[opp].level * (R.key === 'finale' ? 1.04 : 1));
  const pairs = [];
  for (let round = 0; round < 3; round++) for (let i = 0; i < 5; i++) pairs.push({ round, us: i === 4 ? null : ours[i], them: theirs[(i + round * 2) % 5], me: i === 4 && round !== 1 });
  const res = { us: 0, them: 0, list: [] };
  let idx = 0;
  const bg = () => { scene = backdrop(`m${B.round}`, { mood: R.mood, seed: 3 + B.round }); };
  bg();
  const draw = () => {
    show(`<div class="card"><div class="kick">${R.name} · ${roundLabel(G.year, B.round)}</div>
      <div class="board"><div class="t">Landa</div><div class="sc">${res.us} · ${res.them}</div><div class="t r">${rival}</div></div>
      <div class="bouts" id="bl">${res.list.map(x => `<div class="bout ${x.me ? 'me' : ''}"><span class="${x.w === 'a' ? 'win' : ''}">${x.an}</span><span class="m">${x.w === null ? 'nul' : x.w === 'a' ? 'à terre ▸' : '◂ à terre'}</span><span class="r ${x.w === 'b' ? 'win' : ''}">${x.bn}</span></div>`).join('')}</div>
      <div class="row" style="justify-content:flex-end" id="ctl"></div></div>`);
    const bl = $('bl'); if (bl) bl.scrollTop = bl.scrollHeight;
  };
  const myBout = (p, decisive) => {
    draw();
    $('ctl').innerHTML = `${decisive ? '<span style="margin-right:auto;align-self:center">Égalité. Les aînés désignent un combat décisif.</span>' : ''}<button class="btn hot" id="b-f">À toi : contre ${p.them.name}</button>`;
    $('b-f').onclick = () => {
      clearScreen();
      scene = fightScene({
        mood: R.mood, seed: 3 + B.round, label: `${R.name} · ${decisive ? 'combat décisif' : `tour ${p.round + 1}`}`, fatigue: G.fatigue * 0.6,
        subtitle: `Landa ${res.us} · ${res.them} ${rival}`, a: playerFighter(), b: p.them,
        onEnd: (r) => {
          const commit = () => {
            res.list.push({ an: PLAYER.name, bn: p.them.name, w: r.winner, me: true });
            if (r.winner === 'a') { res.us++; G.bouts.won++; G.yb.won++; G.moral++; } else if (r.winner === 'b') { res.them++; G.bouts.lost++; G.yb.lost++; } else G.bouts.draw++;
            G.fatigue = Math.min(1, G.fatigue + 0.12);
            bg(); next();
          };
          if (r.winner !== 'a') return retryPrompt(r, () => myBout(p, decisive), commit);
          commit();
        },
      });
    };
  };
  const next = () => {
    if (idx >= pairs.length) {
      if (res.us === res.them) { pairs.push({ round: 3, us: null, them: theirs[0], me: true, decisive: true }); }
      else return finish();
    }
    const p = pairs[idx++];
    if (p.me) return myBout(p, p.decisive);
    const r = simulate(p.us, p.them, idx * 31 + B.round * 7 + G.year * 101);
    res.list.push({ an: p.us.name, bn: p.them.name, w: r.winner });
    if (r.winner === 'a') res.us++; else if (r.winner === 'b') res.them++;
    draw();
    setTimeout(next, 380);
  };
  const finish = () => {
    const won = res.us > res.them;
    G.record.push({ year: G.year, rival, us: res.us, them: res.them, won, final: R.key === 'finale' });
    G.fatigue = Math.max(0, G.fatigue - 0.25);
    const al = B.alive, i0 = al.indexOf(0);
    const pair = i0 % 2 === 0 ? [0, opp] : [opp, 0];
    finishRound({ a: pair[0], b: pair[1], sa: pair[0] === 0 ? res.us : res.them, sb: pair[1] === 0 ? res.us : res.them, w: won ? 0 : opp });
    save();
    draw();
    const verdict = won ? `Landa l'emporte, ${res.us} victoires contre ${res.them}.` : `${rival} l'emporte, ${res.them} victoires contre ${res.us}.`;
    $('ctl').innerHTML = `<span style="margin-right:auto;align-self:center">${verdict}</span><button class="btn hot" id="b-n">Continuer</button>`;
    if (won) sfx('cheer');
    $('b-n').onclick = () => {
      if (!won) return eliminated(rival);
      if (B.round >= ROUNDS.length) return ceremony();
      restBetween();
    };
  };
  next();
}

function eliminated(rival) {
  const B = br();
  scene = backdrop('village', { mood: 'orage', empty: true, seed: 21 });
  show(`<div class="card"><div class="kick">Évala ${yr()} · ${ROUNDS[B.round - 1].name}</div><h2>Landa est éliminé</h2>
    <p>${rival} passe au tour suivant. Sur le chemin du retour, personne ne parle beaucoup. Ton père pose la main sur ton épaule : « Les sages regardent comment on lutte, pas seulement qui tombe. »</p>
    <p class="dim">Tu peux revenir avant cette rencontre depuis le menu Aventure, ou suivre la fin de l'Évala depuis la foule.</p>
    <div class="row" style="justify-content:flex-end"><button class="btn ghost" id="b-cp">Revenir avant la rencontre</button><button class="btn hot" id="b-n">Suivre la suite depuis la foule</button></div></div>`);
  $('b-n').onclick = spectate;
  $('b-cp').onclick = () => { const c = checkpoints().find(x => x.id === `y${G.year}r${B.round - 1}`); if (c) { G = JSON.parse(c.state); save(); matchIntro(); } };
}

// Le joueur est éliminé : la suite du tableau se joue sans lui
function spectate() {
  const B = br();
  if (B.round >= ROUNDS.length) return ceremony();
  const R = ROUNDS[B.round];
  finishRound(null); save();
  scene = backdrop(`m${B.round - 1}`, { mood: R.mood, seed: 3 + B.round });
  show(`<div class="card wide"><div class="kick">Depuis la foule · ${roundLabel(G.year, B.round - 1)}</div><h2>${R.name}</h2>
    <p>Tu regardes les autres cantons lutter. Tu retiens chaque prise.</p>${bracketHTML()}
    <div class="row" style="justify-content:flex-end"><button class="btn hot" id="b-n">${B.round >= ROUNDS.length ? 'La cérémonie de clôture' : 'Tour suivant'}</button></div></div>`);
  G.stats.technique = Math.min(1.6, G.stats.technique + 0.008);
  $('b-n').onclick = spectate;
}

function restBetween() {
  const B = br(), opp = opponentIdx();
  scene = backdrop('village', { mood: 'aprem', empty: true, seed: 21 });
  show(`<div class="card"><div class="kick">Entre deux tours</div><h2>Avant la ${ROUNDS[B.round].name.toLowerCase()}</h2>
    <p>Landa affrontera ${teamName(opp)}. Quelques jours de répit. Que fais-tu ?</p>
    <div class="acts-list">
      <button class="act" id="r1">${ICONS.natte}<div><b>Se reposer</b><span>Retrouver ton souffle avant la prochaine rencontre.</span></div></button>
      <button class="act" id="r2">${ICONS.lutte}<div><b>Lutter avec les aînés</b><span>Un combat d'entraînement, au prix d'un peu de fatigue.</span></div></button>
      <button class="act" id="r3">${ICONS.ancien}<div><b>Écouter un ancien</b><span>Il a vu lutter les gens de ${teamName(opp)} : il connaît leurs ruses.</span></div></button>
    </div></div>`);
  $('r1').onclick = () => { applyActivity('repos'); applyActivity('repos'); save(); matchIntro(); };
  $('r2').onclick = () => runDay(['lutte', 'repos']);
  $('r3').onclick = () => { applyActivity('conseil'); applyActivity('repos'); save(); matchIntro(); };
}

// Cérémonie de clôture : remise des prix devant les chefs traditionnels
function ceremony() {
  const B = br();
  G.phase = 'ceremonie'; save();
  const champ = B.alive[0];
  const champName = teamName(champ);
  const meChamp = champ === 0;
  const yb = G.yb;
  const meBest = meChamp && yb.won >= Math.max(3, yb.lost * 3);
  const npcBest = makeTeam(champName, 77 + G.year, 1)[1].name;
  const courage = !meBest && yb.won >= 1;
  const awards = [
    { k: `Canton vainqueur de l'Évala ${yr()}`, v: champName, me: meChamp, d: meChamp ? 'Les familles de Landa envahissent le terrain en chantant.' : `Les gens de ${champName} dansent autour de leurs lutteurs.` },
    { k: 'Meilleur lutteur · la moto du super Évala', v: meBest ? `${PLAYER.name} de Landa` : `${npcBest} de ${champName}`, me: meBest, d: meBest ? 'On te tend les clés d\'une moto neuve. Ta mère ne retient pas ses larmes.' : 'La moto neuve brille au soleil. Un jour, ce sera toi.' },
    { k: 'Prix du courage', v: courage ? `${PLAYER.name} de Landa` : `${makeTeam(HOME, 31 + G.year, 1)[2].name} de Landa`, me: courage, d: 'Les aînés saluent celui qui a lutté sans jamais reculer.' },
  ];
  G.record.awards = undefined;
  G.awards = (G.awards || []).concat(awards.filter(a => a.me).map(a => ({ year: G.year, k: a.k })));
  scene = backdrop('m2', { mood: 'aprem', seed: 5 });
  show(`<div class="card wide ceremony"><div class="kick">Évala ${yr()} · cérémonie de clôture · grand terrain de Kara</div><h2>Remise des prix</h2>
    <p class="dim">Sous la bâche, les chefs traditionnels de la Kozah et les autorités. Les sages ont arbitré huit jours de luttes.</p>
    <div class="awards">${awards.map((a, i) => `<div class="award ${a.me ? 'me' : ''}" style="animation-delay:${0.6 + i * 1.4}s"><small>${a.k}</small><b>${a.v}</b><span>${a.d}</span></div>`).join('')}</div>
    <div class="row" style="justify-content:flex-end"><button class="btn hot" id="b-n">Continuer</button></div></div>`);
  awards.forEach((a, i) => setTimeout(() => sfx(a.me ? 'cheer' : 'slap', a.me ? 1 : 0.5), 600 + i * 1400));
  $('b-n').onclick = () => { G.phase = 'annee'; save(); yearEnd(); };
}

function yearEnd() {
  const yrr = G.record.filter(r => r.year === G.year);
  const champion = yrr.some(r => r.final && r.won);
  const reached = yrr.length;
  scene = backdrop('title', { mood: 'aprem', few: true, seed: 11 });
  const next = G.year < 3 ? GRADES[G.year] : 'Eskpa';
  show(`<div class="card"><div class="kick">Fin de l'Évala ${yr()} · année ${G.year}</div><h2>${champion ? 'Landa champion' : reached >= 2 ? 'Une belle saison' : 'Une saison d\'apprentissage'}</h2>
    <p>${yrr.map(r => `${r.final ? 'Finale' : 'Rencontre'} contre ${r.rival} : ${r.us} à ${r.them}.`).join(' ')}</p>
    <p>Tes combats cette année : ${G.yb.won} victoire${G.yb.won > 1 ? 's' : ''}, ${G.yb.lost} défaite${G.yb.lost > 1 ? 's' : ''}.</p>
    <p>Après les luttes, les prêtres traditionnels font la tournée des lieux sacrés pour remercier les ancêtres. ${G.year < 3 ? `L'an prochain, tu seras <b>${next.toLowerCase()}</b>.` : 'Tes trois années d\'Évala sont accomplies.'}</p>
    <div class="row" style="justify-content:flex-end"><button class="btn hot" id="b-n">${G.year < 3 ? 'Une année passe' : 'Devenir Eskpa'}</button></div></div>`);
  $('b-n').onclick = () => (G.year < 3 ? newYear() : epilogue());
}

const INTERLUDES = [
  'Les récoltes de sorgho sont rentrées en novembre. Tu as aidé ton père à refaire les murets des terrasses. Pendant la saison sèche, l\'harmattan a couvert les collines de poussière blanche, et tu as couru chaque matin jusqu\'au sommet.',
  'Cette année, tu as accompagné ton oncle au marché de Kara et porté les sacs d\'igname. Les petits du quartier t\'appellent déjà par ton nom de lutteur. Les plus forts de Pya et de Lama ont grandi aussi.',
];

function newYear() {
  const txt = INTERLUDES[G.year - 1];
  G.year++; G.day = 1; G.phase = 'prep'; G.fatigue = 0; G.yb = { won: 0, lost: 0 }; G.br = null;
  // une année de travaux et de croissance
  G.stats.force += 0.06; G.stats.souffle += 0.04;
  save();
  scene = backdrop('village', { mood: 'matin', empty: true, seed: 21 });
  show(`<div class="card"><div class="kick">Une année passe</div><h2>${GRADES[G.year - 1]}</h2><p>${txt}</p>
    <p>Juillet revient. Les adversaires seront plus forts, et l'on attend davantage de toi.</p>${statBlock()}
    <div class="row" style="justify-content:flex-end"><button class="btn hot" id="b-n">Commencer la préparation</button></div></div>`);
  $('b-n').onclick = planDay;
}

function epilogue() {
  const titles = G.record.filter(r => r.final && r.won).length;
  scene = backdrop('title', { mood: 'aprem', few: true, seed: 11 });
  show(`<div class="title"><div class="kick">Trois Évala accomplis</div><h1 style="font-size:clamp(80px,14vw,170px)">Eskpa</h1>
    <p class="sub">${PLAYER.name} de Landa a lutté trois ans. ${G.bouts.won} victoires, ${titles} finale${titles > 1 ? 's' : ''} gagnée${titles > 1 ? 's' : ''}. Au pays kabyè, on dit que les vainqueurs prennent la parole avant les vaincus dans les assemblées, et cela pour toute leur vie.</p>
    <div class="row"><button class="btn hot" id="b-n">Revenir au début</button></div></div>`);
  try { localStorage.removeItem(SAVE_KEY); } catch { /* rien */ }
  $('b-n').onclick = titleScreen;
}

// ------------------------------------------------------------------ arcade
function arcade() {
  const A = { i: 0, score: 0, lives: 2, seed: (Math.random() * 1e6) | 0 };
  const me = () => ({ name: PLAYER.name, canton: HOME, force: 1.05 + A.i * 0.015, souffle: 1.05 + A.i * 0.015, technique: 1.05 + A.i * 0.015, look: { skin: SKINS[0], cloth: '#2a2422', band: BANDS[HOME], knot: true } });
  const ladder = () => {
    scene = backdrop('title', { mood: 'aprem', few: true, seed: 11 });
    show(`<div class="card"><div class="kick">Arcade · la tournée des cantons</div><h2>Combat ${A.i + 1} sur ${ARCADE.length}</h2>
      <div class="ladder">${ARCADE.map((s, k) => `<div class="rung ${k < A.i ? 'done' : k === A.i ? 'now' : ''}"><i style="background:${BANDS[s.canton] || '#888'}"></i>${s.canton}</div>`).join('')}</div>
      <div class="board"><div class="t">Score</div><div class="sc">${A.score}</div><div class="t r">${'◆'.repeat(A.lives)}${'◇'.repeat(2 - A.lives)}</div></div>
      <p class="dim">Une victoire rapporte des points ; renverser sur un crochet ou un soulevé, et vite, en rapporte davantage. Deux chances en tout.</p>
      <div class="row" style="justify-content:space-between"><button class="btn ghost" id="b-back">Abandonner</button><button class="btn hot" id="b-f">Combattre ${ARCADE[A.i].canton}</button></div></div>`);
    $('b-back').onclick = titleScreen;
    $('b-f').onclick = fight;
  };
  const fight = () => {
    const S = ARCADE[A.i];
    const r = makeTeam(S.canton, A.seed + A.i * 77, S.level)[0];
    r.style = S.style; r.skill = Math.min(0.92, 0.35 + A.i * 0.08);
    clearScreen();
    let lastTech = null;
    scene = fightScene({
      mood: S.mood, seed: 30 + A.i, label: `Arcade · ${A.i + 1}/${ARCADE.length}`, title: `${PLAYER.name} contre ${r.name}`, subtitle: `Landa contre ${S.canton}`,
      a: me(), b: r, vs: true,
      onEvent: (e) => { if ((e.type === 'trip' || e.type === 'lift') && e.who === 'a' && e.ok === true) lastTech = e.type; },
      onEnd: (res, { bout }) => {
        if (res.winner === 'a') {
          const quick = Math.max(0, Math.round((60 - bout.t) * 20));
          const bonus = lastTech === 'lift' ? 1500 : lastTech === 'trip' ? 800 : 0;
          A.score += 1000 + quick + bonus + A.i * 250;
          A.i++;
          if (A.i >= ARCADE.length) return arcadeEnd(true);
          ladder();
        } else {
          A.lives--;
          if (A.lives <= 0) return arcadeEnd(false);
          ladder();
        }
      },
    });
  };
  const arcadeEnd = (won) => {
    let best = 0; try { best = +localStorage.getItem(ARCADE_KEY) || 0; if (A.score > best) localStorage.setItem(ARCADE_KEY, A.score); } catch { /* rien */ }
    scene = backdrop('title', { mood: 'aprem', few: true, seed: 11 });
    show(`<div class="title"><div class="kick">Arcade</div><h1 style="font-size:clamp(70px,12vw,150px)">${won ? 'Invaincu' : 'À terre'}</h1>
      <p class="sub">${won ? 'Tu as renversé les huit cantons.' : `Tu as battu ${A.i} canton${A.i > 1 ? 's' : ''}.`} Score : <b>${A.score}</b>${A.score > best ? ' · nouveau record' : ` · record ${best}`}.</p>
      <div class="row"><button class="btn hot" id="b-re">Recommencer</button><button class="btn ghost" id="b-back">Menu</button></div></div>`);
    $('b-re').onclick = arcade; $('b-back').onclick = titleScreen;
  };
  ladder();
}

// ------------------------------------------------------------------ entraînement libre
function freeTraining() {
  G = G || newGame();
  const pick = (lv, skill) => {
    const r = makeTeam(['Pya', 'Tcharè', 'Lama', 'Soumdina'][Math.floor(Math.random() * 4)], (Math.random() * 1e6) | 0, lv)[0];
    r.skill = skill;
    clearScreen();
    scene = fightScene({
      mood: ['aprem', 'orage', 'matin'][Math.floor(Math.random() * 3)], few: true, label: 'Entraînement', title: 'Combat libre', subtitle: `Contre ${r.name} de ${r.canton}`,
      a: { name: PLAYER.name, canton: HOME, force: 1.05, souffle: 1.05, technique: 1.05, look: { skin: SKINS[0], cloth: '#2a2422', band: BANDS[HOME], knot: true } }, b: r,
      onEnd: () => freeTraining(),
    });
  };
  const lesson = () => {
    clearScreen();
    scene = fightScene({
      mood: 'matin', empty: true, tutorial: true, label: 'Leçon', title: 'Sur la place', subtitle: 'Pyabalo t\'apprend les gestes', timeLimit: 999,
      a: { name: PLAYER.name, canton: HOME, force: 1, souffle: 1, technique: 1, look: { skin: SKINS[0], cloth: '#2a2422', band: BANDS[HOME], knot: true } },
      b: { name: 'Pyabalo', canton: HOME, force: 1.0, souffle: 1.0, technique: 1.0, style: 'patient', skill: 0.35, look: { skin: '#3a2014', cloth: '#30261f', band: BANDS[HOME] } },
      onEnd: () => freeTraining(),
    });
  };
  scene = backdrop('village', { mood: 'matin', empty: true, seed: 21 });
  show(`<div class="card"><div class="kick">Entraînement</div><h2>Sur la place du village</h2>
    <p>Des combats hors aventure, sans conséquence. Idéal pour apprendre à lire les gestes de l'adversaire.</p>
    <div class="acts-list">
      <button class="act" id="l0">${ICONS.ancien}<div><b>La leçon de Pyabalo</b><span>Tous les gestes, un par un.</span></div></button>
      <button class="act" id="l1">${ICONS.lutte}<div><b>Un jeune du village</b><span>Facile : il annonce ses gestes.</span></div></button>
      <button class="act" id="l2">${ICONS.lutte}<div><b>Un lutteur de canton</b><span>Le niveau d'une rencontre de première année.</span></div></button>
      <button class="act" id="l3">${ICONS.lutte}<div><b>Un champion</b><span>Rusé et endurant, il te laissera peu d'ouvertures.</span></div></button>
    </div>
    <p class="dim" style="margin-top:14px">${isTouch ? 'Boutons à l\'écran.' : '← → : avancer, reculer, pousser ou tirer. Espace : saisir. K : crochet. L : soulever. ↓ : prendre la terre.'}</p>
    <div class="row" style="justify-content:flex-start;margin-top:10px"><button class="btn ghost" id="b-back">Retour</button></div></div>`);
  $('l0').onclick = lesson;
  $('l1').onclick = () => pick(0.85, 0.2); $('l2').onclick = () => pick(1.0, 0.5); $('l3').onclick = () => pick(1.2, 0.85);
  $('b-back').onclick = titleScreen;
}

// ------------------------------------------------------------------ son
const soundBtn = document.createElement('button');
soundBtn.id = 'sound'; soundBtn.setAttribute('aria-label', 'Couper le son'); soundBtn.title = 'Couper ou remettre le son (M)';
const ICON_ON = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M4 9v6h4l5 4V5L8 9z"/><path d="M16 9a4 4 0 0 1 0 6M18.5 6.5a8 8 0 0 1 0 11"/></svg>';
const ICON_OFF = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M4 9v6h4l5 4V5L8 9z"/><path d="M17 9l5 6M22 9l-5 6"/></svg>';
const paintSound = () => { soundBtn.innerHTML = muted ? ICON_OFF : ICON_ON; soundBtn.classList.toggle('off', muted); };
const toggleSound = () => { initAudio(); setMuted(!muted); paintSound(); };
soundBtn.onclick = toggleSound; document.body.appendChild(soundBtn); paintSound();
window.addEventListener('keydown', (e) => { if (e.code === 'KeyM') toggleSound(); });

// ------------------------------------------------------------------ démarrage
resize();
titleScreen();
requestAnimationFrame(loop);
window.__ev = { get G() { return G; }, set G(v) { G = v; }, get scene() { return scene; }, fightScene, titleScreen, planDay, matchIntro, yearEnd, ceremony, tournamentStart, newGame, arcade };
