# Rapport de la session Codage — 9 novembre 2026

Rien de tout ça n'est encore en ligne : le jeu publié (GitHub) et le serveur des avis (alwaysdata)
sont toujours ceux du 8 novembre.

## 1. Ce qui a été fait

| Demande | Fait |
|---|---|
| Panneau admin : déblocage des skins « etc. » | 🎁 **Cadeaux** (skins et pièces, pour tout le monde, pour un joueur via son code joueur, ou par **code cadeau** avec un nombre d'utilisations et une date de fin), 👥 **Joueurs** (liste anonyme, recherche, bloquer/débloquer), 📢 **Annonce** dans le menu du jeu, ⚡ **Bonus de pièces** (× 1,5 / 2 / 3, durée au choix). Le jeu reçoit les cadeaux à l'ouverture (fenêtre « Tu as reçu un cadeau ! »). Il y a une case « Code cadeau » et le **code joueur** dans la Boutique. |
| 1. Ramassage sur téléphone | **Cause trouvée** : sur téléphone, les zones invisibles du joystick et de la caméra couvraient le bouton « 👆 Ramasser » **et** les cases de l'inventaire. Le doigt bougeait la caméra au lieu de ramasser. Corrigé (ces boutons passent au-dessus). En plus : l'hôte accepte la position envoyée avec la demande (un peu de retard réseau toléré), il répond « Approche-toi encore un peu » quand il refuse, et un réglage **« Ramasser tout seul »** est activé par défaut sur téléphone (seulement dans une case libre, jamais ce qu'on vient de jeter). |
| 2. Esprits | 5 esprits avec les **modèles et animations de la session modélisation** : 🌱 Pousse (soin), ☁️ Filou (mobilité), 🛡️ Gardien (protection), 👁️ Zyeuto (vision), 🔨 Briquet (bâtisseur). Ils flottent sur des autels (◆ sur la carte) : on en capture un (E / 👆), il suit le joueur et donne un passif et un pouvoir (touche A / bouton ✨) avec une recharge. L'autel refait un esprit au bout de 75 s. L'esprit part quand le joueur est éliminé. Les bots en capturent et utilisent leur pouvoir. Tout est décidé par l'hôte et synchronisé. |
| 3. Modes de jeu | Menu à 5 modes, chacun avec ses règles : 👑 **Battle Royale** (chacun pour soi, 40 participants conseillés, jusqu'à 60), 👤 **Solo** (zone rapide, +25 PV par élimination), 👥 **Duo** et 🛡️ **Escouade** (équipes de 2 / 4, pas de tir ami, dernière équipe debout), 🎯 **Entraînement** (pas de zone, munitions et matériaux à volonté, mannequins qui ne tirent pas, on réapparaît ; le premier qui réussit les 3 défis gagne). |
| 4. 100 joueurs | Étude **mesurée** et architecture du serveur autoritaire : `docs/ARCHITECTURE-100-JOUEURS.md`. **100 joueurs ne sont pas possibles aujourd'hui** (réseau de l'hôte et rendu des personnages). Le plan est découpé en 7 étapes testées une par une. |
| 5. Collaboration | Fiche pour la session modélisation (`modeles/INTEGRATION-CODE.txt`, section 3) + message envoyé : personnage lointain (LOD) et mannequin d'entraînement demandés. Aucun fichier Blender ni source de modélisation touché. |

## 2. Fichiers modifiés ou ajoutés

- **Jeu** : `index.html`, `style.css`, `js/jeu.js`, `js/hote.js`, `js/partage.js` (règles des modes),
  `js/menus.js`, `js/modeles.js` (garde les animations, charge esprits et autels), `js/retours.js`,
  nouveaux `js/cadeaux.js` et `js/esprits.js`.
- **Modèles** : `modeles/integration.json` (esprits et autel activés, fusil en v002),
  `modeles/INTEGRATION-CODE.txt` (section 3).
- **Serveur** : `serveur/api.py` (cadeaux, codes, annonce, bonus, joueurs, blocage, nouveaux modes),
  `serveur/admin/index.html`, `admin.js`, `admin.css`, `serveur/deployer.sh` (envoie le catalogue),
  `serveur/LISEZMOI.md`, nouveaux `serveur/extraire_catalogue.py` et `serveur/catalogue.json`.
- **Docs et tests** : `docs/ARCHITECTURE-100-JOUEURS.md`, ce rapport, `.claude/tests/test_cadeaux.py`.

## 3. Tests réellement faits

- **Serveur** : 49 tests (avis, votes, admin) + 47 tests (cadeaux, codes, annonce, bonus, joueurs,
  blocage) = **96/96**, sous l'adresse `/natx` comme en ligne.
- **Panneau admin** (navigateur) : création d'un cadeau « pour tous » (14 skins légendaires + 300 pièces)
  et d'un code cadeau, annonce, bonus × 2.
- **Jeu** : fenêtre du cadeau reçu, annonce et bonus dans le menu, code joueur, code cadeau (bon, inconnu,
  déjà utilisé).
- **Téléphone** (740 × 360, toucher simulé) : bouton Ramasser et cases de l'inventaire touchables ;
  arme, soin, grenade, munitions et matériaux ramassés ; ramassage automatique ; refus de l'hôte.
- **Esprits** : les 5 modèles chargés avec leurs animations. Capture de chacun et pouvoir de chacun :
  Pousse soigne 40→80, et le coéquipier 30→70 ; Filou fait le bond ; Gardien donne +50 de bouclier ;
  Zyeuto marque l'ennemi pendant 6 s ; Briquet fait 4 murs et ses murs coûtent 5. Régénération, autel qui
  repart après 75 s, esprit qui disparaît à l'élimination, bots qui capturent et utilisent leur pouvoir.
- **Modes** : Escouade (6 équipes de 4, victoire de mon équipe), Duo (équipes de 2), Solo (+25 PV ou
  bouclier par élimination, zone rapide, 15 bots), Entraînement de bout en bout (réapparition, 3 défis,
  écran « ENTRAÎNEMENT RÉUSSI »).
- **Ensemble, en vrai réseau PeerJS** : hôte sur PC + joueur « téléphone » dans un 2ᵉ onglet, en Duo.
  Partie reçue (autels, objets, équipe). Au doigt : capture d'esprit (vue aussi par l'hôte), pouvoir ✨
  (soin appliqué par l'hôte), ramassage d'un pistolet.
- **Mesures 100 joueurs** : voir `docs/ARCHITECTURE-100-JOUEURS.md`.

## 4. Problèmes restants

- **Pas encore en ligne** : il faut mettre à jour le serveur (`sh serveur/deployer.sh`) et republier le jeu
  sur GitHub. Sans le serveur à jour, les cadeaux, l'annonce et le bonus ne marchent pas en ligne.
- **100 joueurs** : pas faisable sans le serveur autoritaire (plan dans le document). Avec PeerJS, la
  limite conseillée est d'environ 8 humains par partie. C'est à vérifier par de vrais tests à plusieurs.
- **Battle Royale à 60 participants** : l'ordinateur de l'hôte suit (calcul < 1 ms). Sur un téléphone,
  beaucoup de personnages à l'écran feront ramer (~40 appels de dessin par personnage). Le personnage
  lointain demandé à la session modélisation est la solution prévue.
- **Pendant le test à deux onglets**, une première tentative a perdu la connexion WebRTC avant le
  lancement. Ça vient sans doute des deux onglets du même navigateur bloqués par mes scripts de test. La
  2ᵉ tentative a marché. À surveiller lors d'un vrai test à plusieurs.
- **L'autel n'a pas de collision** (on peut passer à travers ; il est petit).
- La **maison cottage** (v001/v002) n'est toujours pas activée.
- Les nouveaux fichiers « _v2 / _v3 » de la session modélisation (décor, objets, personnage, cosmétiques,
  constructions) ne sont **pas** branchés : ce n'était pas dans cette mission.
