# Évala · La saison des lutteurs

Jeu de lutte et d'aventure en navigateur (PC, mobile, manette), inspiré de l'Évala, la lutte initiatique kabyè de la Kozah (région de la Kara, Togo). Chaque mois de juillet, les jeunes initiés (les évalous) luttent pour leur canton sur les terrains de football des villages, sous l'arbitrage des aînés.

**Jouer : https://omarfarouk228.github.io/evala/**

## Le jeu

- **Aventure** : trois Évala, de 2026 à 2028 (évalou de première, deuxième puis troisième année, puis Eskpa). Chaque année : dix jours de préparation au village (champs, collines, lutte avec les aînés, conseil d'un ancien, repos), puis le tableau à huit cantons en élimination directe. Une rencontre se joue en trois tours de cinq combats ; tu luttes deux fois, le reste de l'équipe est simulé. Si Landa est éliminé, on suit la suite depuis la foule. Cérémonie de clôture (canton vainqueur, « super Évala » et sa moto, prix du courage), bilan, puis l'année suivante avec des adversaires plus forts.
- **Défaites** : chaque combat perdu peut être rejoué ou accepté. Des points de reprise sont enregistrés au début de chaque année et avant chaque rencontre.
- **Arcade** : la tournée des huit cantons d'affilée, deux chances, score (rapidité, bonus crochet et soulevé) et record.
- **Entraînement** : la leçon de Pyabalo, geste par geste, et des combats libres sur trois niveaux.

Le jeu ne montre que la partie publique de l'Évala. L'ahoyé, les sacrifices et les rites réservés aux initiés restent hors champ.

## Le combat

Trois jauges : l'**équilibre** (on tombe quand il part trop loin), le **souffle** et la **prise**. On avance, on saisit, puis au corps à corps on pousse ou on tire : celui qui pousse dans un adversaire qui tire part en avant. Le **crochet** renverse un adversaire sur les talons, le **soulevé** demande de la force, du souffle et une bonne prise. Les corps graissés glissent : la prise lâche, et prendre de la **terre** dans les mains la rétablit. L'adversaire annonce ses gestes ; les années suivantes, il les cache mieux. À la limite du temps, match nul.

## Commandes

| Action | Clavier | Manette | Tactile |
| --- | --- | --- | --- |
| Avancer, reculer, pousser, tirer | ← → (ou Q D) | stick gauche ou croix | ◀ ▶ |
| Saisir | Espace ou J | A | Saisir |
| Crochet | K | X | Crochet |
| Soulever | L | Y | Soulever |
| Prendre la terre | ↓ ou S | B ou croix bas | Terre |
| Pause, abandonner le combat | Échap ou P | Start | bouton pause |
| Couper le son | M | | bouton son |

Dans les menus, la croix choisit un bouton, A valide, B revient. La sauvegarde est automatique.

## Technique

- [Vite](https://vite.dev) et JavaScript, sans moteur de jeu. Interface en HTML et CSS.
- **Combat en 3D** avec [Three.js](https://threejs.org) : six lutteurs aux corps et visages différents, générés avec [MakeHuman](http://www.makehumancommunity.org) (MPFB2 dans Blender, actifs CC0), short et ceinture du canton peints dans la texture, animés par les captures de mouvement de la [Universal Animation Library de Quaternius](https://quaternius.com) (CC0) sur le squelette du mannequin Unreal : garde, marche, poussée et traction au corps à corps, coups encaissés, crochet, soulevé, chute, danse de victoire. L'équilibre du moteur incline le corps ; poussière et secousse de caméra sur les chutes. Arène 3D : sol de latérite, collines, arbres et foule de 150 spectateurs en panneaux peints, bâche des officiels, ombres portées.
- Les menus, la préparation, la cérémonie et les cinématiques sont peints en Canvas 2D (ciel, monts kabyè, hameaux, foule animée). `?2d` dans l'adresse joue aussi le combat avec les lutteurs peints.
- **Moteur de combat pur et testé** (`src/combat.js`), séparé de l'affichage ; intelligence artificielle par styles (pousseur, rusé, costaud, patient) et habileté.
- Sons et musiques synthétisés en Web Audio : foule, chants en appel et réponse, tambours, cloche, sifflet des aînés, ambiances du village.
- Mobile : boutons tactiles, résolution réduite sous 700 px. Manette par l'API Gamepad.

```bash
npm install
npm run dev      # http://localhost:5175 (laisser le terminal ouvert)
npm run build
npm test         # moteur de combat
```

Chaque push sur `main` est déployé sur GitHub Pages. Pages annexes : `arene3d.html` (démo de l'arène), `voir3d.html` (visionneuse des modèles et des clips).

| Fichier | Rôle |
| --- | --- |
| `src/main.js` | Écrans et déroulé : menu, aventure, préparation, tournoi, cérémonie, arcade, entraînement, pause, manette, sauvegarde |
| `src/combat.js` | Moteur de combat : équilibre, souffle, prise, gestes, intelligence artificielle, simulation |
| `src/three/arena3d.js` | Arène Three.js : lumière, sol, collines, arbres, foule, poussière, chargement des personnages |
| `src/three/fight3d.js` | Les deux lutteurs 3D pilotés par le moteur : choix des clips, inclinaison, caméra |
| `src/fighter.js` | Lutteurs peints (rendu 2D de repli) |
| `src/arena.js` | Décors peints : ambiances, foule, cérémonie |
| `src/audio.js` | Sons et ambiances |
| `src/data.js` | Cantons, prénoms, activités, dates, tableau, arcade |
| `public/models/mpfb/` | Six lutteurs (GLB) et la bibliothèque de clips |
| `tests/` | Tests du moteur |

## Sources et approximations

Wikipédia (« Evala », « Préfecture de la Kozah »), L-FRII, ATOP, Lomé Express, Voyages Modestes : rite de juillet du deuxième au troisième samedi, équipes de cinq, aînés arbitres, graisse sur le corps et terre dans les mains, trois ans d'initiation puis Eskpa, moto du super Évala.

Approximé pour le jeu : les couleurs de ceinture par canton, la tenue des lutteurs, les instruments, le tableau à huit cantons, les gestes de crochet et de soulevé (clips approchants, pas de capture de lutte). Les prénoms kabyè sont à faire relire.

## Crédits

Jeu original. Personnages générés avec MakeHuman (actifs CC0) ; animations Quaternius (CC0). Code © Omar Farouk. Tous droits réservés sauf mention contraire.
