# Passage à la 3D (Three.js) · plan commun Évala, Assigamé, Nana Benz

Décision de l'utilisateur le 2026-11-08 : « voie 1 », des personnages 3D animés par squelette pour les trois jeux, jouables sur mobile, avec manette pour Évala.

## État
- **Socle posé dans Évala** : `src/three/arena3d.js` (renderer avec ombres douces et tonemapping ACES, ciel peint, soleil, sol de latérite, collines, arbres et foule en panneaux peints réutilisant les dessins 2D, bâche des officiels, poussière, chargement de GLB rigués avec `SkeletonUtils.clone`, mixeur d'animations avec fondu). Démo : `arene3d.html` (54 i/s sur le Mac de test).
- Modèles de test : `public/models/Soldier.glb` et `Xbot.glb`, exemples du dépôt Three.js (rigs Mixamo). **À remplacer** par les vrais personnages, puis à supprimer.
- Manette prise en charge dans le jeu 2D actuel (`readPad` dans `src/main.js`) : stick ou croix pour se déplacer, A saisir, X crochet, Y soulever, B ou bas prendre la terre ; croix et A dans les menus, B pour revenir.

## Ce que l'utilisateur doit fournir (sources légales, comptes personnels)
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
