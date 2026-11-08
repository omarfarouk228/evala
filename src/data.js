// Données du jeu. Sources principales (voir CLAUDE.md) :
// - cantons de la Kozah : Wikipédia, « Préfecture de la Kozah » (15 cantons) ;
// - Évala du 2e au 3e samedi de juillet, arènes sur des terrains de football,
//   aînés arbitres, équipes de villages, victoire ou nul à la limite du temps :
//   Wikipédia « Evala », L-FRII (2019), Voyages Modestes ;
// - terre prise dans les mains contre la glissade des corps graissés : ATOP (2022) ;
// - décompte des victoires par rencontre (ex. 19 à 16) : Lomé Express (2025).

export const CANTONS = ['Pya', 'Tchitchao', 'Yadé', 'Bohou', 'Tcharè', 'Kouméa', 'Landa', 'Soumdina', 'Lassa', 'Lama', 'Djamdè', 'Atchangbadè', 'Awandjélo', 'Kpinzindè', 'Sara-Kawa'];

export const HOME = 'Landa';

// Couleurs de ceinture par canton : convention du jeu, pas une tradition attestée.
export const BANDS = {
  Landa: '#d98a1f', Pya: '#2f5fa8', Tcharè: '#b8322a', Soumdina: '#2f8a57', Lama: '#7d3c98',
  Tchitchao: '#e0c33a', Kouméa: '#2aa3b8', Bohou: '#c25b8a', Yadé: '#5a6b2e', Lassa: '#a0522d',
};

// Prénoms kabyè courants (à faire relire par un locuteur)
export const NAMES = ['Essowè', 'Pyabalo', 'Tchilabalo', 'Kpatcha', 'Abalo', 'Pidalatan', 'Essozimna', 'Bawoubadi', 'Hodabalo', 'Kodjo', 'Essotina', 'Akizou', 'Tchaa', 'Batchassi', 'Essohana', 'Malibida', 'Pakindame', 'Tchédré', 'Simféitchéou', 'Awizou'];

export const SKINS = ['#6e3d23', '#5e321d', '#7a4529', '#53301c', '#683a22'];

export const PLAYER = { name: 'Essowè', canton: HOME };

// L'Évala va du 2e au 3e samedi de juillet (Wikipédia). La préparation occupe les dix jours d'avant.
export const WEEKDAYS = ['dimanche', 'lundi', 'mardi', 'mercredi', 'jeudi', 'vendredi', 'samedi'];
export const FIRST_YEAR = 2026;
export function secondSaturday(y) {
  const first = new Date(y, 6, 1).getDay();           // 0 = dimanche
  return 1 + ((6 - first + 7) % 7) + 7;               // jour du mois
}
export function dateOf(y, offset) {
  // offset 0 = 2e samedi de juillet ; négatif = jours de préparation
  return new Date(y, 6, secondSaturday(y) + offset);
}
export function fmt(d) {
  const m = d.getMonth() === 5 ? 'juin' : 'juillet';
  return `${WEEKDAYS[d.getDay()]} ${d.getDate() === 1 ? '1er' : d.getDate()} ${m}`;
}
// jour de préparation n (1..10) de l'année y
export function dateLabel(day, y = FIRST_YEAR) { return fmt(dateOf(y, day - 11)); }

export const ACTIVITIES = {
  champ: {
    label: 'Aux champs', icon: 'houe', desc: 'Sarcler le sorgho et buter les ignames avec la famille. La houe forge les épaules.',
    effect: { force: 0.03, fatigue: 0.22, famille: 1 },
  },
  colline: {
    label: 'Courir les collines', icon: 'colline', desc: 'Monter et descendre les terrasses de pierre jusqu\'au sommet. Le souffle vient d\'en haut.',
    effect: { souffle: 0.04, fatigue: 0.28 },
  },
  lutte: {
    label: 'Lutter avec les aînés', icon: 'lutte', desc: 'Un combat d\'entraînement sur la place du village. Ce que tu y apprends compte double.',
    effect: { technique: 0.03, fatigue: 0.25 }, fight: true,
  },
  conseil: {
    label: 'Écouter un ancien', icon: 'ancien', desc: 'Sous le grand néré, un ancien lutteur raconte ses combats et montre une prise.',
    effect: { technique: 0.02, moral: 1, fatigue: 0.02 },
  },
  repos: {
    label: 'Se reposer', icon: 'natte', desc: 'Dormir à l\'ombre, manger la pâte de sorgho de ta mère. Le corps se refait.',
    effect: { fatigue: -0.45 },
  },
};

// Coéquipiers de Landa (le joueur est le 5e) et rivaux, par force
export function makeTeam(canton, seed, level = 1) {
  let s = seed;
  const r = () => { s = (s * 16807) % 2147483647; return s / 2147483647; };
  const used = new Set();
  return Array.from({ length: 5 }, () => {
    let n; do { n = NAMES[Math.floor(r() * NAMES.length)]; } while (used.has(n)); used.add(n);
    const styles = ['pousseur', 'ruse', 'costaud', 'patient'];
    return {
      name: n, canton,
      force: +(0.85 + r() * 0.35) * level, souffle: +(0.85 + r() * 0.35) * level, technique: +(0.85 + r() * 0.35) * level,
      style: styles[Math.floor(r() * 4)], skill: Math.min(0.9, 0.3 + r() * 0.35 + (level - 1) * 0.8),
      look: { skin: SKINS[Math.floor(r() * SKINS.length)], cloth: ['#2a2422', '#3a2c22', '#1f2a3a', '#3b1f1f'][Math.floor(r() * 4)], band: BANDS[canton] || '#888', knot: r() < 0.4,
        body: { build: 0.88 + r() * 0.34, height: 0.94 + r() * 0.12, head: 0.96 + r() * 0.08 },
        face: { nose: 0.85 + r() * 0.35, jaw: 0.9 + r() * 0.25, brow: 0.8 + r() * 0.5, lips: 0.85 + r() * 0.35 },
        hair: ['ras', 'ras', 'bald', 'twists', 'flat'][Math.floor(r() * 5)], beard: r() < 0.3, scar: r() < 0.2 },
    };
  });
}

// Programme du tournoi (dates réelles : Évala 2026, du 2e au 3e samedi de juillet)
// Les rivaux changent selon l'année ; offset = jours après le 2e samedi
const RIVALS = [
  ['Pya', 'Tcharè', 'Soumdina', 'Lama'],
  ['Kouméa', 'Pya', 'Bohou', 'Tcharè'],
  ['Tchitchao', 'Lama', 'Yadé', 'Pya'],
];
export function schedule(year) {
  const y = FIRST_YEAR + year - 1, R = RIVALS[(year - 1) % 3];
  const base = [
    { offset: 0, level: 0.96, mood: 'aprem', place: 'Terrain de Landa' },
    { offset: 2, level: 1.02, mood: 'orage', place: `Terrain de ${R[1]}` },
    { offset: 4, level: 1.06, mood: 'matin', place: `Terrain de ${R[2]}` },
    { offset: 7, level: 1.12, mood: 'aprem', place: 'Grand terrain de Kara', final: true },
  ];
  return base.map((m, i) => ({ ...m, rival: R[i], label: fmt(dateOf(y, m.offset)) }));
}
export const SCHEDULE = schedule(1);

// Tableau à élimination directe : 8 cantons, quarts, demi-finales, finale.
// (Lomé Express mentionne des demi-finales à Tchitchao en 2025 ; le tableau à 8 est une simplification.)
export const ROUNDS = [
  { key: 'quart', name: 'Quart de finale', offset: 0, mood: 'aprem' },
  { key: 'demi', name: 'Demi-finale', offset: 4, mood: 'orage' },
  { key: 'finale', name: 'Finale', offset: 7, mood: 'aprem' },
];
export function roundLabel(year, r) { return fmt(dateOf(FIRST_YEAR + year - 1, ROUNDS[r].offset)); }
export function bracketFor(year) {
  let s = 1234 + year * 97;
  const rnd = () => { s = (s * 16807) % 2147483647; return s / 2147483647; };
  const pool = CANTONS.filter(c => c !== HOME && c !== 'Sara-Kawa');
  const pick = [];
  while (pick.length < 7) { const c = pool[Math.floor(rnd() * pool.length)]; if (!pick.includes(c)) pick.push(c); }
  const lv = (k) => +(0.94 + rnd() * 0.16 + (year - 1) * 0.07).toFixed(3);
  return [{ c: HOME, level: 1 }, ...pick.map(c => ({ c, level: lv() }))];
}

// Arcade : la tournée des cantons, adversaires de plus en plus forts
export const ARCADE = [
  { canton: 'Lassa', level: 0.88, style: 'pousseur', mood: 'matin' },
  { canton: 'Djamdè', level: 0.94, style: 'patient', mood: 'aprem' },
  { canton: 'Bohou', level: 1.0, style: 'ruse', mood: 'orage' },
  { canton: 'Kouméa', level: 1.05, style: 'costaud', mood: 'matin' },
  { canton: 'Soumdina', level: 1.1, style: 'pousseur', mood: 'aprem' },
  { canton: 'Tcharè', level: 1.15, style: 'ruse', mood: 'orage' },
  { canton: 'Pya', level: 1.2, style: 'patient', mood: 'aprem' },
  { canton: 'Lama', level: 1.28, style: 'costaud', mood: 'aprem' },
];
