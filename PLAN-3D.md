# Passage à la 3D (Three.js) · plan commun Évala, Assigamé, Nana Benz

Décision de l'utilisateur le 2026-11-08 : « voie 1 », des personnages 3D animés par squelette pour les trois jeux, jouables sur mobile, avec manette pour Évala.

## État
- **Socle posé dans Évala** : `src/three/arena3d.js` (renderer avec ombres douces et tonemapping ACES, ciel peint, soleil, sol de latérite, collines, arbres et foule en panneaux peints réutilisant les dessins 2D, bâche des officiels, poussière, chargement de GLB rigués avec `SkeletonUtils.clone`, mixeur d'animations avec fondu). Démo : `arene3d.html` (54 i/s sur le Mac de test).
- Modèles de test : `public/models/Soldier.glb` et `Xbot.glb`, exemples du dépôt Three.js (rigs Mixamo). **À remplacer** par les vrais personnages, puis à supprimer.
- Manette prise en charge dans le jeu 2D actuel (`readPad` dans `src/main.js`) : stick ou croix pour se déplacer, A saisir, X crochet, Y soulever, B ou bas prendre la terre ; croix et A dans les menus, B pour revenir.

## Sources obtenues le 2026-11-08 (sans compte, toutes CC0)
readyplayer.me ne répond plus et Mixamo exige un compte Adobe : abandonnés. À la place :
- **Quaternius Universal Base Characters** (version gratuite) : corps « Superhero » homme et femme, texture de peau foncée incluse, 65 os (squelette du mannequin Unreal), coiffures (ras, barbe, longs, chignons), sourcils. Copié dans `public/models/quaternius/` (textures réduites à 1024 px, 29 Mo au total).
- **Quaternius Universal Animation Library** (version gratuite, 42 clips) : Idle, Crouch_Idle, Walk, Jog, Sprint, Push_Loop, Punch_Jab et Cross, Hit_Chest et Hit_Head, Death01, Roll, Dance, Idle_Talking, Sitting… Même squelette que les corps : les clips s'appliquent directement (`Arena3D.loadClips` puis `addCharacter(url, { clips })`).
- **MakeHuman via MPFB2 2.0.18 dans Blender 5.2** (installé par Homebrew) avec le pack `makehuman_system_assets_cc0` (peaux africaines jeunes, adultes, âgées, hommes et femmes ; yeux, cheveux, vêtements). Script `assets3d/scripts/mpfb_wrestler.py` : génère un homme (âge, muscle, poids, taille, proportions aléatoires), peau africaine texturée, yeux, squelette `game_engine`, export GLB. Exemple : `public/models/mpfb/wrestler1.glb`.
- Archives et extractions dans `~/Documents/Github/TogoGame/assets3d/` (hors dépôts).

## Pipeline retenu
1. **Maintenant** : corps Quaternius + clips Quaternius pour animer le combat (prototype `arene3d.html`, 60 i/s).
2. **Ensuite** : corps MakeHuman (visages tous différents, réalisme supérieur) liés au squelette Quaternius dans Blender (parentage avec poids automatiques), pour jouer les mêmes clips. Script à écrire dans `assets3d/scripts/`.
3. Prises de lutte : pas de clips libres ; cinématique inverse (IK) sur les bras et le buste à partir des poses Crouch_Idle et Push_Loop, pilotée par la logique existante de `combat.js`.
4. Short et ceinture du canton : à peindre dans la texture de peau (zone du short) plutôt qu'en maillage séparé.

## Ce que l'utilisateur devait fournir (plus nécessaire)
1. **Animations** : compte Adobe gratuit sur mixamo.com. Télécharger en FBX « without skin », 30 i/s, sur le personnage « Y Bot » : Fight Idle, Walking, Running, Standing Taunt, Victory, Defeat, Falling Back Death, Falling Forward Death, Stumble Backwards, Push, Pulling, et tout ce qui ressemble à de la lutte ou du grappling. Déposer dans `assets-src/mixamo/`.
2. **Personnages** : deux options.
   - readyplayer.me : créer 8 à 12 avatars (hommes jeunes pour les lutteurs, corps « full body », peau foncée, cheveux ras ; pour Assigamé et Nana Benz, hommes et femmes de tous âges), exporter en GLB. Rig compatible Mixamo.
   - Mixamo : personnages fournis (moins adaptés : vêtements occidentaux).
   Déposer dans `assets-src/avatars/`.
3. Je convertis FBX → GLB (fbx2gltf ou Blender en ligne de commande si installé), je recible les animations, je fabrique les textures (wax, ceintures de canton, peau graissée) et j'intègre.

## Étapes
1. Évala : combat 3D (deux lutteurs rigués, IK pour la prise, états idle / pousser / crochet / soulever / chute à partir des clips Mixamo, caméra de combat), arène 3D, foule et cérémonie 3D. Conserver la logique de `combat.js` telle quelle.
2. Assigamé : personnages 3D posés devant les décors peints (scène mixte), portraits de dialogue rendus en 3D avec expressions par formes de mélange si les avatars en ont (Ready Player Me en a).
3. Nana Benz : même méthode qu'Assigamé (étal, clientes, marchandage).
4. Mobile : rendu à pixel ratio 1 sur petits écrans, ombres réduites, boutons tactiles ; manette conservée.

## Attentes à garder honnêtes
Résultat visé : réalisme stylisé d'un bon jeu 3D indépendant ou mobile, avec de vraies animations de capture de mouvement. Pas le niveau de GTA 5, qui demande des modèles, des visages et des budgets hors de portée.

## État au 2026-11-08 (livraison)
- **Évala** : combat en 3D en jeu (`src/three/fight3d.js`, branché dans `fightScene` de `main.js` ; `?2d` dans l'URL rend l'ancien combat 2D). Six lutteurs MakeHuman (`public/models/mpfb/lutteur_0..5.glb`, short et ceinture peints), animés par les clips Quaternius : garde, marche, poussée au corps à corps (Push_Loop, inversé pour tirer), coups encaissés, crochet (Jump_Start), soulevé (PickUp_Table), chute (Death01), victoire (Dance_Loop). Équilibre du moteur appliqué en inclinaison du corps ; poussière et secousse de caméra sur les chutes. Vérifié dans Chrome : entraînement, arcade (foule de 150 spectateurs, match nul à la limite du temps, retour au panneau), sans erreur de console. Menus, préparation, cérémonie et cinématiques restent en 2D peint (hybride).
- **Assigamé** : personnages 3D habillés par défaut (`src/stage3d.js`, huit modèles dans `public/models/`, `?2d` pour les personnages peints), gros plan de dialogue, lumière du jour. Détail dans `Assigame/CLAUDE.md`.
- **Nana Benz** : cliente en 3D dans la scène de marchandage (`src/customer3d.js`, quatre clientes en pagne wax peint et deux clients), le marché reste peint. Détail dans `NanaBenz/CLAUDE.md`.
- **Pipeline Blender** (hors dépôts, `~/Documents/Github/TogoGame/assets3d/scripts/`) : `mpfb_to_ual.py` (corps MakeHuman → T-pose → poids du corps Quaternius transférés au corps, aux vêtements et aux cheveux → textures réduites → export GLB ; options `shorts`, `belt`, `clothes`, `hair`, `pagne`), `make_wrestlers.sh`, `make_assigame.sh`, `make_nanabenz.sh`, `ual_roundtrip.py` (clips). Blender 5.2 et MPFB2 2.0.18 installés sur le Mac.
- **À faire** : ajuster les clips du crochet et du soulevé dans Évala (pas de capture de mouvement de lutte libre : envisager l'IK), foule et cérémonie en 3D, pagnes et boubous modélisés (Assigamé, Nana Benz), expressions par clés de forme, test sur un vrai téléphone (le rendu baisse le pixel ratio sous 700 px ; non vérifié) et avec une manette physique.
