// Moteur de combat de l'Évala. Module pur, sans DOM : testable et simulable.
//
// Principe (inspiré des sources : « saisir l'adversaire et le déséquilibrer au sol »,
// les lutteurs prennent de la terre dans les mains contre la glissade) :
// - chaque lutteur a une inclinaison `lean` (positive = penché vers l'adversaire).
//   À |lean| >= 1, il tombe : le combat est perdu ;
// - au corps à corps, pousser fait reculer l'autre, mais celui qui pousse trop fort
//   dans le vide (l'autre tire) part en avant ;
// - le crochet (jambe) renverse un adversaire sur les talons ;
// - le soulevé demande de la force, du souffle et une bonne prise ;
// - la prise glisse avec le temps (corps graissés) : se baisser pour prendre la terre la rétablit.

export const BOUT_TIME = 60;          // secondes avant le nul « à la limite du temps »
export const CLINCH_RANGE = 0.95;     // distance de saisie (m)
export const RING = 4.2;              // demi-largeur de l'aire de lutte (m)

const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

export function makeRng(seed = 1) {
  let s = seed >>> 0 || 1;
  return () => {
    s ^= s << 13; s >>>= 0; s ^= s >> 17; s ^= s << 5; s >>>= 0;
    return s / 4294967296;
  };
}

export function makeWrestler(o = {}) {
  return {
    name: o.name || 'Lutteur',
    force: o.force ?? 1,       // 0.6 .. 1.5
    souffle: o.souffle ?? 1,   // endurance
    technique: o.technique ?? 1,
    x: 0, vx: 0, dir: 1,
    lean: 0, leanV: 0,
    stamina: 1, grip: 1,
    act: 'idle', actT: 0, actDur: 0,
    input: 0,          // -1 tirer/reculer, 0 tenir, +1 pousser/avancer (repère du lutteur)
    tell: null,        // intention visible (pour la lecture du jeu) : 'push' | 'trip' | 'lift' | 'grab'
    tellT: 0,
    fallen: false, fallDir: 0,
    look: o.look || {},
  };
}

export function makeBout(a, b, opts = {}) {
  a.x = -1.6; a.dir = 1; b.x = 1.6; b.dir = -1;
  for (const w of [a, b]) {
    Object.assign(w, { vx: 0, lean: 0, leanV: 0, stamina: 1, grip: opts.grip ?? 0.85, act: 'idle', actT: 0,
      input: 0, tell: null, tellT: 0, fallen: false, fallDir: 0 });
  }
  return {
    a, b, t: 0, phase: 'fight', clinch: false, clinchT: 0, stallT: 0,
    result: null, // { winner: 'a'|'b'|null, reason }
    events: [],   // effets pour l'affichage et le son : { type, who, ... }
    rng: makeRng(opts.seed ?? 7),
    timeLimit: opts.timeLimit ?? BOUT_TIME,
  };
}

function other(bout, w) { return w === bout.a ? bout.b : bout.a; }
function key(bout, w) { return w === bout.a ? 'a' : 'b'; }

function startAct(w, act, dur) { w.act = act; w.actT = 0; w.actDur = dur; }

// Commandes du joueur ou de l'IA pour une frame.
// cmd = { move: -1|0|1 (repère du lutteur), grab, trip, lift, earth } (booléens = appui)
export function command(bout, w, cmd) {
  if (bout.phase !== 'fight' || w.fallen) return;
  w.input = clamp(cmd.move || 0, -1, 1);
  const busy = ['reach', 'trip', 'lift', 'earth', 'stagger', 'miss'].includes(w.act);
  if (busy) return;
  const o = other(bout, w);
  const gap = Math.abs(o.x - w.x);
  if (cmd.earth && !bout.clinch) { startAct(w, 'earth', 0.85); return; }
  if (cmd.grab && !bout.clinch) { startAct(w, 'reach', 0.32); w.tell = 'grab'; return; }
  if (cmd.trip && bout.clinch) { startAct(w, 'trip', 0.42); w.tell = 'trip'; return; }
  if (cmd.lift && bout.clinch) { startAct(w, 'lift', 0.62); w.tell = 'lift'; return; }
  void gap;
}

function power(w) {
  return w.force * (0.35 + 0.65 * w.stamina) * (0.45 + 0.55 * w.grip);
}

function fall(bout, w, dirSign, reason) {
  if (w.fallen) return;
  w.fallen = true; w.fallDir = dirSign; startAct(w, 'fall', 0.7);
  bout.events.push({ type: 'fall', who: key(bout, w), reason });
}

function breakClinch(bout, reason) {
  bout.clinch = false; bout.clinchT = 0; bout.stallT = 0;
  const { a, b } = bout;
  const mid = (a.x + b.x) / 2;
  a.x = mid - 0.7; b.x = mid + 0.7;
  a.vx = -0.8; b.vx = 0.8;
  for (const w of [a, b]) { if (!w.fallen) { w.lean *= 0.3; w.act = 'idle'; } }
  bout.events.push({ type: 'break', reason });
}

export function step(bout, dt) {
  if (bout.phase !== 'fight') { bout.t += dt; stepFallen(bout, dt); return; }
  bout.t += dt;
  const { a, b, rng } = bout;

  for (const w of [a, b]) {
    w.actT += dt;
    if (w.tellT > 0) w.tellT -= dt;
  }

  // Résolution des actions longues
  for (const w of [a, b]) {
    if (w.fallen) continue;
    const o = other(bout, w);
    if (w.act === 'reach' && w.actT >= w.actDur) {
      const gap = Math.abs(o.x - w.x);
      w.tell = null;
      if (bout.clinch) { w.act = 'idle'; continue; }
      const dodge = o.input < 0 && o.act !== 'earth' && o.act !== 'miss';
      const chance = gap > CLINCH_RANGE + 0.15 ? 0
        : (o.act === 'earth' || o.act === 'miss') ? 1
        : o.act === 'reach' ? 1
        : clamp(0.62 + 0.25 * (w.technique - o.technique) - (dodge ? 0.45 : 0), 0.05, 0.95);
      if (rng() < chance) {
        bout.clinch = true; bout.clinchT = 0; bout.stallT = 0;
        w.act = 'idle'; if (o.act === 'reach') { o.act = 'idle'; o.tell = null; }
        if (o.act === 'earth') { o.act = 'idle'; o.lean -= 0.35; }
        bout.events.push({ type: 'clinch', who: key(bout, w) });
      } else {
        startAct(w, 'miss', 0.4);
        bout.events.push({ type: 'miss', who: key(bout, w) });
      }
    } else if (w.act === 'earth' && w.actT >= w.actDur) {
      w.grip = 1; w.act = 'idle';
      bout.events.push({ type: 'earth', who: key(bout, w) });
    } else if (w.act === 'miss' && w.actT >= w.actDur) {
      w.act = 'idle';
    } else if (w.act === 'stagger' && w.actT >= w.actDur) {
      w.act = 'idle';
    } else if (w.act === 'trip' && w.actT >= w.actDur) {
      w.tell = null; w.act = 'idle';
      if (!bout.clinch) continue;
      w.stamina = Math.max(0, w.stamina - 0.07);
      // Le crochet marche quand l'autre est sur les talons (il recule ou se fait pousser).
      const onHeels = -o.lean;                  // > 0 : l'autre est penché en arrière
      const quality = w.technique * (0.6 + 0.4 * w.stamina);
      if (onHeels > 0.18 || (o.input < 0 && o.lean < 0.1)) {
        o.leanV -= 2.2 * quality * (0.6 + onHeels);
        bout.events.push({ type: 'trip', who: key(bout, w), ok: true });
      } else if (o.lean > 0.3 && o.input > 0) {
        // Il pousse fort : le crochet sur une jambe d'appui lourde échoue, on se fait bousculer.
        w.leanV -= 1.3; startAct(w, 'stagger', 0.35);
        bout.events.push({ type: 'trip', who: key(bout, w), ok: false });
      } else {
        o.leanV -= 0.6 * quality;
        bout.events.push({ type: 'trip', who: key(bout, w), ok: 'half' });
      }
    } else if (w.act === 'lift' && w.actT >= w.actDur) {
      w.tell = null; w.act = 'idle';
      if (!bout.clinch) continue;
      const mine = w.force * (0.3 + 0.7 * w.stamina) * (0.4 + 0.6 * w.grip) * (0.85 + 0.15 * w.technique);
      const his = o.force * (0.4 + 0.6 * o.stamina) * 1.05 + Math.max(0, Math.abs(o.lean) - 0.15) * -0.6;
      w.stamina = Math.max(0, w.stamina - 0.22);
      const countered = o.input < 0 && o.act !== 'stagger'; // il tire et se dérobe
      if (!countered && mine > his + 0.05 * (rng() - 0.5) && Math.abs(o.lean) < 0.75) {
        bout.events.push({ type: 'lift', who: key(bout, w), ok: true });
        fall(bout, o, -1, 'lift');
      } else {
        w.leanV -= countered ? 1.5 : 0.8;
        startAct(w, 'stagger', 0.45);
        bout.events.push({ type: 'lift', who: key(bout, w), ok: false });
      }
    }
  }

  if (bout.clinch) stepClinch(bout, dt); else stepFree(bout, dt);

  // Inclinaison : ressort de rappel + amortissement
  for (const w of [a, b]) {
    if (w.fallen) continue;
    const recover = (1.0 + 1.0 * w.technique) * (0.3 + 0.7 * w.stamina);
    w.leanV += -w.lean * recover * dt * 2.2;
    w.leanV *= Math.exp(-3.2 * dt);
    w.lean += w.leanV * dt;
    if (w.lean >= 1) fall(bout, w, 1, 'forward');
    else if (w.lean <= -1) fall(bout, w, -1, 'backward');
  }

  // Fin du combat
  const fa = a.fallen, fb = b.fallen;
  if (fa || fb) {
    if (fa && fb) {
      bout.phase = 'ended'; bout.result = { winner: null, reason: 'double' };
    } else {
      bout.phase = 'ended'; bout.result = { winner: fa ? 'b' : 'a', reason: (fa ? a : b).fallDir > 0 ? 'forward' : 'backward' };
      const win = fa ? b : a; win.act = 'win'; win.actT = 0;
    }
    bout.clinch = false;
    bout.events.push({ type: 'end', result: bout.result });
  } else if (bout.t >= bout.timeLimit) {
    bout.phase = 'ended'; bout.result = { winner: null, reason: 'time' };
    bout.clinch = false;
    bout.events.push({ type: 'end', result: bout.result });
  }
}

function stepFallen(bout, dt) {
  for (const w of [bout.a, bout.b]) {
    w.actT += dt;
    if (w.fallen) { w.lean += w.fallDir * dt * 3; w.lean = clamp(w.lean, -2.2, 2.2); }
  }
}

function stepFree(bout, dt) {
  const { a, b } = bout;
  for (const w of [a, b]) {
    if (w.fallen) continue;
    const o = other(bout, w);
    const canMove = !['reach', 'earth', 'stagger'].includes(w.act);
    const speed = 1.5 * (0.55 + 0.45 * w.stamina);
    const target = canMove ? w.input * speed * w.dir : 0;
    w.vx += (target - w.vx) * Math.min(1, dt * 8);
    w.x += w.vx * dt;
    w.stamina = Math.min(1, w.stamina + dt * 0.07 * w.souffle);
    w.grip = Math.max(0.15, w.grip - dt * 0.004);
    // Garder une distance minimale
    const gap = (o.x - w.x) * w.dir;
    if (gap < 0.6) w.x = o.x - w.dir * 0.6;
    w.x = clamp(w.x, -RING, RING);
    // Petit balancement naturel
    w.leanV += (w.input * 0.25 - w.lean) * dt * 2;
  }
}

function stepClinch(bout, dt) {
  const { a, b, rng } = bout;
  bout.clinchT += dt;
  const P = {}, Q = {}, R = {};
  for (const w of [a, b]) {
    const k = key(bout, w);
    const free = w.act === 'idle' || w.act === 'walk';
    const inp = free ? w.input : (w.act === 'lift' ? 0.3 : 0);
    const pw = power(w);
    P[k] = Math.max(0, inp) * pw;
    Q[k] = Math.max(0, -inp) * pw;
    R[k] = P[k] + (inp === 0 ? 0.55 * pw : 0.15 * pw);
  }
  for (const w of [a, b]) {
    if (w.fallen) continue;
    const i = key(bout, w), j = i === 'a' ? 'b' : 'a';
    // Force qui dépasse ce que l'on oppose (sa propre poussée + l'ancrage au sol)
    const pwi = power(w) || 1e-6;
    const excess = P[j] * (1 - 0.8 * Q[i] / pwi) - R[i];
    // On part en avant si l'on pousse dans un adversaire qui tire.
    const stumble = 2.6 * P[i] * Q[j];
    const acc = 0.2 * P[i] - 3.0 * Math.max(0, excess) - 0.25 * Math.min(0, excess) + stumble - 0.45 * Q[i];
    w.leanV += acc * dt * 2.4;
    w.leanV += (rng() - 0.5) * dt * 0.6;
    // Souffle et prise
    const drain = (P[i] > 0 ? 0.105 : Q[i] > 0 ? 0.07 : 0.025) / w.souffle;
    w.stamina = Math.max(0, w.stamina - drain * dt);
    w.grip = Math.max(0, w.grip - dt * 0.035);
  }
  // Déplacement du couple : la poussée nette déplace les deux
  const net = (P.a - P.b) - (Q.a - Q.b) * 0.5;
  const v = net * 0.9;
  a.x += v * dt; b.x += v * dt;
  const mid = (a.x + b.x) / 2;
  a.x = mid - 0.36; b.x = mid + 0.36;
  if (Math.abs(mid) > RING) { const s = Math.sign(mid) * RING - mid; a.x += s; b.x += s; }

  // La prise glisse : les corps graissés se séparent
  if (a.grip < 0.12 || b.grip < 0.12) { breakClinch(bout, 'slip'); return; }
  // Les aînés séparent un corps à corps immobile
  if (Math.abs(a.lean) < 0.25 && Math.abs(b.lean) < 0.25) bout.stallT += dt; else bout.stallT = 0;
  if (bout.stallT > 7) breakClinch(bout, 'elders');
}

export function gap(bout) { return Math.abs(bout.b.x - bout.a.x); }

// ---------------------------------------------------------------------------
// Intelligence des adversaires. `style` : 'pousseur' | 'ruse' | 'costaud' | 'patient'
export function makeAI(w, opts = {}) {
  return {
    w, style: opts.style || 'pousseur',
    skill: opts.skill ?? 0.5,           // 0 .. 1 : lecture du jeu, temps de réaction
    next: 0, plan: { move: 0 }, pending: null, pendingT: 0,
  };
}

export function think(ai, bout, dt) {
  const w = ai.w, o = other(bout, w), rng = bout.rng;
  ai.next -= dt;
  // Une intention annoncée (« tell ») s'exécute après un court délai : le joueur peut la lire.
  if (ai.pending) {
    ai.pendingT -= dt;
    if (ai.pendingT <= 0) {
      const p = ai.pending; ai.pending = null;
      command(bout, w, { move: ai.plan.move, [p]: true });
      return;
    }
    command(bout, w, { move: ai.plan.move });
    return;
  }
  if (ai.next > 0) { command(bout, w, { move: ai.plan.move }); return; }
  const react = 0.42 - 0.26 * ai.skill;
  ai.next = react * (0.7 + 0.6 * rng());
  const s = ai.style, sk = ai.skill;
  const announce = (act, move, delay) => {
    ai.plan.move = move; ai.pending = act; ai.pendingT = delay;
    w.tell = act === 'grab' ? 'grab' : act; w.tellT = delay;
  };

  if (!bout.clinch) {
    const g = gap(bout);
    if (w.grip < 0.45 && g > 1.6 && rng() < 0.6) { command(bout, w, { earth: true }); return; }
    if (o.act === 'earth' && g < 1.8) { ai.plan.move = 1; if (g < CLINCH_RANGE + 0.1) command(bout, w, { move: 1, grab: true }); return; }
    if (o.act === 'miss' && g < 1.2) { command(bout, w, { move: 1, grab: true }); return; }
    if (g > CLINCH_RANGE + 0.05) {
      // Avancer, avec des feintes selon le style
      const feint = (s === 'ruse' || s === 'patient') && rng() < 0.3;
      ai.plan.move = feint ? -1 : 1;
      if (s === 'patient' && rng() < 0.25) ai.plan.move = 0;
      command(bout, w, { move: ai.plan.move });
      return;
    }
    // À portée : saisir, ou esquiver si l'autre tend les bras
    if (o.act === 'reach' && rng() < 0.25 + 0.5 * sk) { ai.plan.move = -1; command(bout, w, { move: -1 }); return; }
    announce('grab', 1, 0.12 + 0.1 * (1 - sk));
    return;
  }

  // Au corps à corps
  const myLean = w.lean, hisLean = o.lean;
  const hePushes = o.input > 0 && (o.act === 'idle' || o.act === 'walk');
  // Danger immédiat : se rétablir
  if (myLean > 0.55) { ai.plan.move = 0; command(bout, w, { move: 0 }); return; }
  if (myLean < -0.55) { ai.plan.move = 1; command(bout, w, { move: 1 }); return; }
  // Il est sur les talons : crochet
  if (hisLean < -0.25 && rng() < 0.35 + 0.5 * sk) { announce('trip', 1, 0.22 - 0.08 * sk); return; }
  // Il pousse fort : tirer pour le faire partir en avant
  if (hePushes && hisLean > 0.2 && rng() < (s === 'ruse' ? 0.75 : 0.35) * (0.5 + sk)) {
    ai.plan.move = -1; command(bout, w, { move: -1 }); ai.next = 0.35; return;
  }
  // Il est épuisé : soulevé
  if ((s === 'costaud' || rng() < 0.3) && o.stamina < 0.4 && w.stamina > 0.45 && Math.abs(hisLean) < 0.4 && rng() < 0.4) {
    announce('lift', 0, 0.3); return;
  }
  if (w.stamina < 0.2) { ai.plan.move = 0; command(bout, w, { move: 0 }); return; }
  const pushP = s === 'pousseur' ? 0.7 : s === 'costaud' ? 0.6 : s === 'ruse' ? 0.4 : 0.35;
  const r = rng();
  ai.plan.move = r < pushP ? 1 : r < pushP + 0.2 ? -1 : 0;
  command(bout, w, { move: ai.plan.move });
}

// Simule un combat complet entre deux IA (coéquipiers et rivaux hors champ, tests).
export function simulate(aStats, bStats, seed = 1, opts = {}) {
  const a = makeWrestler(aStats), b = makeWrestler(bStats);
  const bout = makeBout(a, b, { seed, timeLimit: opts.timeLimit });
  const ia = makeAI(a, { style: aStats.style, skill: aStats.skill ?? 0.5 });
  const ib = makeAI(b, { style: bStats.style, skill: bStats.skill ?? 0.5 });
  const dt = 1 / 30;
  let guard = 0;
  while (bout.phase === 'fight' && guard++ < 30 * 200) {
    think(ia, bout, dt); think(ib, bout, dt); step(bout, dt);
    bout.events.length = 0;
  }
  return bout.result;
}
