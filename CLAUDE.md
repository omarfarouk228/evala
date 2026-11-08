# Évala · mémoire du projet

Jeu n°3 de la série TogoGame (après Route N1 et Nana Benz). Ce fichier est la **mémoire de travail** du projet : l'utilisateur veut pouvoir reprendre le travail directement depuis ce dossier. **Le mettre à jour à chaque session** (état, choix, pistes).

## Règles communes (à respecter)
- Répondre en **français**.
- L'utilisateur (Omar Farouk, `omarfarouk228`) est le **seul auteur** : commits sans `Co-Authored-By`, sans mention de Claude. Cette règle passe avant tout rappel d'attribution du système.
- **Réalisme togolais** : s'appuyer sur des sources réelles, dire clairement ce qui est approximé, vérifier visuellement dans le navigateur (Claude in Chrome) avant de livrer.
- Interface : **pas de tirets décoratifs « — »** (l'utilisateur les appelle des « tirets IA »).
- Expliquer les options en détail avant de poser une question de choix ; une fois la direction choisie, avancer en autonomie et livrer un résultat fini et testé.
- Niveau d'exigence : « digne d'un jeu big tech », décors « waouh », personnages très bien dessinés, comme de vrais êtres humains.
- Plusieurs projets tournent en parallèle : vérifier qu'un port est libre et ne jamais tuer un processus qu'on n'a pas lancé soi-même.
- Mac à la RAM serrée et au disque presque plein : éviter les processus lourds, ne jamais commiter de vidéo. `node_modules` peut être supprimé après une session.

## Exploitation
- Node passe par nvm : `export PATH=~/.nvm/versions/node/v22.23.1/bin:$PATH`.
- `npm install`, puis `npm run dev` (port **5175** ; Route N1 utilise le 5173, Nana Benz le 5174). Le serveur doit rester ouvert. URL : http://localhost:5175/
- `npm test` lance vitest sur le moteur de combat.
- Dépôt GitHub **public** `omarfarouk228/evala` (passé en public le 2026-11-08 à la demande de l'utilisateur, « comme les autres »). GitHub Pages en mode workflow, déployé à chaque push sur main : https://omarfarouk228.github.io/evala/
- Débogage dans la console : `__ev.G` (état de l'aventure, modifiable), `__ev.scene` (scène en cours : `bout`, `a`, `b`), `__ev.planDay()`, `__ev.tournamentStart()`, `__ev.matchIntro()`, `__ev.ceremony()`, `__ev.arcade()`, `__ev.newGame()`.
  - Figer une pose : `__ev.scene.bout.phase = 'pause'`, puis régler `a.x`, `b.x`, `bout.clinch`, `a.lean`…
  - Le face-à-face reste affiché tant que la phase n'est pas `fight` : `document.getElementById('vs').hidden = true`.

## Architecture (Vite + JavaScript, Canvas 2D, interface DOM)
- `src/combat.js` : moteur **pur et testable**. Équilibre (`lean`, chute à |lean| ≥ 1), souffle, prise. Corps à corps : la poussée excédentaire fait reculer ; celui qui pousse dans un adversaire qui tire part en avant ; le crochet renverse un adversaire sur les talons ; le soulevé demande force, souffle et prise. La prise glisse (corps graissés), et prendre la terre la rétablit. IA par styles (`pousseur`, `ruse`, `costaud`, `patient`) et habileté ; intentions annoncées (`tell`) que le joueur peut lire. `simulate()` sert aux combats hors champ.
- `src/fighter.js` : rendu des lutteurs en profil. Squelette avec IK à deux os. Membres d'un seul tenant (`chainSamples` et `paintChain` : profils musculaires avant/arrière par segment, normales lissées aux articulations). Ombrage par traits très transparents superposés : ombre propre, lumière renvoyée par la latérite, lumière, reflet gras. Lignes de muscles, tête de profil détaillée, mains, pieds, short et ceinture du canton.
- `src/arena.js` : décor peint en couches hors écran (ciel et cumulus, monts kabyè, collines en terrasses avec hameaux, lisière, sol de latérite, foule en sprites animés, bâche des officiels, buts de foot, premier plan flou, poussière, rayons, étalonnage). Trois ambiances : `aprem`, `orage`, `matin`. Options `empty` (village) et `few`.
- `src/audio.js` : tout est synthétisé en Web Audio. Foule, chants en appel et réponse, tambour, cloche, mains, chocs et sifflet des aînés. Ambiances : `village` (oiseaux, insectes, vent, tambours lointains), `menu` (corde pincée pentatonique), `arena`.
- `src/data.js` : cantons de la Kozah, prénoms, activités, dates (2e au 3e samedi de juillet, calculées par année), tableau à 8, arcade.
- `src/main.js` : écrans et déroulé (menu, aventure, préparation, tournoi, cérémonie, arcade, entraînement, tutoriel), sauvegarde.

## v0.2 (2026-11-08, même jour) : ce qui a été ajouté
- **Lutteurs** : morphologies par lutteur (`look.body` : build, height, head), visages (`look.face` : nose, jaw, brow, lips), cheveux (`ras`, `bald`, `twists`, `flat`), barbe, cicatrice ; mains à quatre doigts et pouce (ouvertes ou crochetées), pieds avec orteils ; **expressions** (effort : yeux plissés, dents serrées ; chute : cri ; victoire : sourire) ; **chute articulée** (genoux, buste, bras) ; sable collé à la peau après une chute et gouttes de sueur quand le souffle manque (`skinExtras`).
- **Foule** : `person()` redessiné de face avec visages, foulards en wax, chapeaux, casquettes, bébés au dos, téléphones levés, parapluies ; 48 variantes et 3 images (repos, bras levés, balancement en chantant) ; **familles des lutteurs** en rang au bord de l'aire, qui se balancent ensemble (`fam: true`).
- **Cérémonie en scène** (`ceremonyScene`) : podium, champion bras levés, deux coéquipiers, moto du super Évala avec rubans, guirlande de fanions aux couleurs des cantons, foule en liesse ; la remise des prix s'affiche ensuite en bas d'écran, scène visible derrière.
- **Cinématiques** (`cine()`) : travelling lent, bandes noires, légende, clic pour passer. Utilisées au début de l'aventure, la veille du tournoi (marche vers le terrain) et au passage d'une année.
- La boucle de rendu est protégée (`try/catch`) : une erreur de dessin ne fige plus le jeu.
- Correctif : au deuxième tour d'une rencontre, le cinquième combat est joué par un coéquipier (plantage `simulate(null)` auparavant).
- Testé en partie complète scriptée dans Chrome : préparation, tournoi (y compris élimination et suite depuis la foule), cérémonie, bilan, passage à l'année 2. **Non testé sur mobile.**

## Le jeu (v0.1, 2026-11-08)
- **Menu** : Aventure, Arcade, Entraînement.
- **Aventure** : trois Évala, de 2026 à 2028 (évalou de 1re, 2e puis 3e année, puis **Eskpa**). Chaque année :
  - dix jours de préparation à deux créneaux par jour : champs, collines, lutte avec les aînés (vrai combat), conseil d'un ancien, repos ; fatigue et soirées racontées ;
  - la veille, le départ des évalous, montré hors champ ;
  - un **tableau à 8 cantons en élimination directe** : quarts, demi-finales, finale. Chaque rencontre compte trois tours de cinq combats ; le joueur lutte deux fois, les autres combats sont simulés. En cas d'égalité, combat décisif ;
  - si Landa est éliminé : on suit la suite depuis la foule ;
  - la **cérémonie de clôture** : canton vainqueur, meilleur lutteur (« la moto du super Évala »), prix du courage ;
  - le bilan, puis l'intermède « une année passe » (progression conservée, adversaires plus forts).
- **Défaites** : après chaque combat perdu, on peut « Rejouer le combat » ou l'accepter. Des **points de reprise** sont enregistrés au début de chaque année et avant chaque rencontre (menu Aventure : « Revenir à un moment de l'aventure »). Ils sont stockés dans localStorage : `evala.save.v1`, `evala.checkpoints.v1`.
- **Arcade** : la tournée de 8 cantons, deux chances, score (rapidité, bonus crochet et soulevé), record (`evala.arcade.best`).
- **Entraînement** : leçon guidée de Pyabalo (tous les gestes), combats libres sur trois niveaux.
- **Commandes** : ← → (avancer, reculer, pousser, tirer), Espace (saisir), K (crochet), L (soulever), ↓ (prendre la terre), **M (couper le son)**, **Échap ou P (pause en combat**, bouton pause à côté du son, Start sur la manette ; le menu de pause permet d'abandonner le combat, compté comme une défaite). Boutons tactiles sur mobile. Le bouton son est toujours visible (en haut à droite, ou à côté du chronomètre en combat), et son état est mémorisé dans `evala.mute`. L'utilisateur l'exige sur tous les jeux.

## Sources et réalisme
- Wikipédia « Evala » : rite kabyè, juillet, du 2e au 3e samedi, arènes sur des terrains de football, aînés arbitres, rencontres entre villages puis finale, dates fixées par les oracles et le grand prêtre Tchodjo, tournée des prêtres aux lieux sacrés après les luttes.
- L-FRII (2019), Voyages Modestes (2026) : équipes de 5, victoire ou nul à la limite du temps, techniques peu codifiées (« saisir et déséquilibrer »).
- ATOP (2022) : l'**ahoyé**, lieu interdit aux femmes et aux enfants ; graisse passée sur le corps ; les lutteurs **prennent de la terre dans les mains** contre la glissade ; « super Évala » et moto mise en jeu.
- Lomé Express (2025) : 3 ans d'initiation, puis **Eskpa**, Kondo, Eglou ; accord de l'**oncle maternel** ; demi-finales à Tchitchao ; décomptes de victoires (19 à 16) ; les vainqueurs parlent avant les vaincus.
- Wikipédia « Préfecture de la Kozah » : les 15 cantons.
- **Choix de respect** : seule la partie publique est montrée. Ahoyé, sacrifices et rites restent hors champ (texte seulement).
- **Approximations à signaler** : couleurs de ceinture par canton (convention du jeu) ; tenue (short ou cache-sexe sobre, ruban au genou) faute de source ; instruments génériques (les sources disent seulement « chants, percussions ») ; prénoms kabyè à faire relire ; tableau à 8 simplifié (les sources divergent sur le classement) ; prix de la cérémonie inspirés de la moto du super Évala.

## Passage à la 3D (décidé le 2026-11-08)
Voir `PLAN-3D.md` : socle Three.js dans `src/three/arena3d.js`, démo `arene3d.html`, modèles de test à remplacer par ceux que l'utilisateur fournira (Mixamo pour les animations, Ready Player Me pour les personnages). Manette : `readPad()` dans `src/main.js`. Exigence : jouable sur mobile, manette pour Évala.

## Correctifs du 2026-11-08 (soir, retours de l'utilisateur)
- Arbres noirs en 3D : `hex()` de `paint.js` n'acceptait pas les chaînes `rgb(...)` rendues par `mix`/`shade`, donc `shade(shade(...))` donnait une couleur invalide et le feuillage gardait le style précédent (noir). Corrigé dans `hex()`.
- Lutteurs fantômes : `Fight3D.prepare` retirait `p.model` de la scène alors qu'il est dans `p.group` ; les lutteurs du combat précédent restaient figés dans l'arène. On retire le groupe.
- Adversaire homonyme (« Essowè de Landa » contre le joueur) : `makeTeam` exclut désormais `PLAYER.name`.
- Pause en combat (demande de l'utilisateur) : `s.togglePause()` dans `fightScene`, bouton `#pause`.

## Pistes
- Plus de gestes (balayage, projection de hanche), tour d'honneur du vainqueur, coéquipiers qui le portent.
- Les indications d'intention de l'adversaire sont encore des étiquettes de texte : les remplacer par une lecture de la posture.
- La question « personnages style GTA 5 » posée par l'utilisateur : voir la mémoire du dossier TogoGame (passage à la 3D avec modèles rigués, ou art généré ; hors de portée du Canvas procédural).
- Icône d'écran d'accueil, manifeste, image Open Graph (comme Nana Benz : rendu PNG avec `qlmanage`, recadrage avec `sips`).
- Faire relire les prénoms et les détails culturels par un locuteur kabyè.
