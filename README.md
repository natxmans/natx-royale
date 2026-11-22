# NATX ROYALE

Une bataille royale cartoon à jouer entre potes, directement dans le navigateur.

**Jouer : https://natxmans.github.io/natx-royale/**

## Ce qu'il y a dans le jeu

- **10 modes de jeu**

  | Mode | En deux mots |
  |---|---|
  | 👑 Battle Royale | chacun pour soi, grande partie |
  | 👤 Solo | partie rapide contre les bots, +25 PV par élimination |
  | 👥 Duo · 🔱 Trio · 🛡️ Escouade | équipes de 2, 3 ou 4, pas de tir ami |
  | ⚡ Éclair | une partie en 3 minutes, butin rare partout |
  | 🔁 Mêlée | on réapparaît tout de suite, le premier à 10 éliminations gagne |
  | 🔭 Tireurs d'élite | une seule arme sur l'île : le fusil de précision |
  | 🌙 Lune | gravité faible, sauts géants, tomber ne fait pas mal |
  | 🎯 Entraînement | mannequins, 3 défis, munitions à volonté |

- **Une île avec ses secrets** : 9 lieux (Arène 2K27, Cité Turbo, Fort Bancal, Port Moussaillon…), des
  **passages secrets** (des trappes cachées dans les buissons qui mènent à l'autre bout de l'île), des **salles
  au trésor** dont certaines n'ont aucune porte, des tours de guet, des ruines et des campements.
- **65 esprits** : de petits compagnons flottent sur des autels. Capture-en un : il te suit, te donne un bonus
  et un pouvoir. Il y en a pour tous les goûts : attaque (météore d'Astro, souffle de Dracot, tir orbital de Bipbop),
  nuages au sol (lave, poison, orage, encre), soin et bouclier pour l'équipe, téléportation, invisibilité, échange de
  place avec un ennemi, pièges (oursin, mine), objets qui tombent du ciel… Les bots s'en servent aussi.
  Un joueur éliminé laisse son esprit sur place : le premier qui passe le prend.
  Pour **garder** un esprit dans ta collection, exporte-le sur un autre autel (ou gagne la partie avec) : il arrive
  dans ta boîte avec sa rareté. Depuis l'accueil, tu peux **améliorer** les esprits de ta collection (★★ puis ★★★) avec des
  **éclats d'esprit 💠** : en partie, l'esprit capturé a ce niveau, avec un pouvoir plus fort qui recharge plus vite. Le prix
  dépend de la rareté de l'esprit dans ta collection (de 50 à 500 💠). Les éclats se gagnent en partie (coffres, ravitaillements,
  île, joueurs éliminés, victoire) ; ils ne servent qu'à ça et sont gardés sur le serveur, comme le niveau de tes esprits.
  Tu peux aussi **partir avec un esprit** de ta collection dès le début de la partie : si tu meurs avec lui, tu le perds, et il
  faut payer des éclats pour le récupérer (de 25 à 100 💠 selon sa rareté).
- **Livraison du jour** : chaque jour, 10 nouveaux cosmétiques (chapeaux, sacs à dos, pioches, deltaplanes) arrivent dans la
  boutique, section « 📦 Livraison du jour » (voir `outils/LIVRAISON-QUOTIDIENNE.md`).
- **Ton personnage** : couleur, peau, coiffure et couleur des cheveux, plus 250 cosmétiques (tenues, chapeaux,
  sacs, pioches, deltaplanes, emotes, traînées) et des skins d'armes. Tout se gagne en jouant, avec les pièces
  du jeu.
- **Un programme du jour** : des mini-événements d'une heure, tous les jours aux mêmes heures (pièces × 2, cargaison
  surprise, butin de fête, XP × 2 dans le mode vedette). Ils commencent tout seuls et l'accueil annonce le prochain.
- **Sur l'île aussi** : construction (murs, sols, rampes), coffres dorés, ravitaillements, cargaison,
  champignons rebondissants, fontaines de soin, jour et nuit.
- **Multijoueur sans serveur de jeu** : un joueur héberge la partie, les autres rejoignent avec son code
  (PeerJS), avec un relais pour les connexions en 4G.
- **Ordinateur et téléphone** (commandes tactiles). L'accueil tient sur un seul écran.
- **Avis, idées et cadeaux** : à la fin d'une partie tu peux donner ton avis, signaler un bug ou proposer une
  idée. Les idées validées vont dans l'onglet 💡 Idées, où tout le monde vote. La Boutique accepte les
  **codes cadeaux**, et les cadeaux arrivent dans la boîte 🎁.
- **Des règles pour que tout le monde s'amuse** : 10 règles du jeu, un bouton pour signaler un joueur et un
  robot modérateur qui passe une fois par jour.

La liste complète des nouveautés est dans le jeu, onglet 📰 Nouveautés.

## Dossiers

| Dossier | Contenu |
|---|---|
| `index.html`, `style.css`, `js/` | le jeu (three.js + PeerJS, aucun outil de construction) |
| `modeles/` | modèles 3D (`.glb`) ; `integration.json` dit lesquels sont activés et comment les placer |
| `sons/` | les bruitages du jeu (`.mp3`) et leurs crédits |
| `serveur/` | serveur des avis, votes, cadeaux, modération et espace admin (Python + SQLite), hébergé à part — voir `serveur/LISEZMOI.md` |
| `outils/` | `versionner.py` : à lancer avant chaque mise à jour, pour que tous les fichiers du jeu aient le même numéro de version ; `veille_a_etudier.py` : remonte les avis passés « À étudier » dans l'espace admin |
| `docs/` | étude « Battle Royale à 100 joueurs » et rapports de mise à jour |

Le serveur ne contient aucun mot de passe ni clé secrète : les clés sont créées sur l'hébergeur, les comptes
admin aussi.

## Crédits et licences

- **Arme futuriste** (`modeles/weapon_futuriste_v002.glb`) : d'après « Futuristic Weapon Concept High-poly »
  de **3DHaupt**, [BlendSwap](https://blendswap.com/blend/11979), licence
  [CC BY-NC-SA](https://creativecommons.org/licenses/by-nc-sa/4.0/deed.fr).
  Modifié : converti en glTF, mis à l'échelle, réorienté, matériaux refaits. Ce fichier modifié est partagé
  sous la même licence CC BY-NC-SA (pas d'usage commercial).
- **Maison « cottage »** (`modeles/house_cottage_v001.glb`, pas encore utilisée dans le jeu) : d'après
  « Free GameReady Cottage » de **Gerhald3D** (TurboSquid) ; l'auteur autorise tout usage sauf la revente.
- **Bruitages** (`sons/`) : 48 sons de [Pixabay](https://pixabay.com/sound-effects/), sous la
  [licence de contenu Pixabay](https://pixabay.com/service/license-summary/). La liste des sons et de leurs auteurs est dans
  [`sons/CREDITS.md`](sons/CREDITS.md). Ils ne doivent pas être réutilisés seuls, hors du jeu.
- [three.js](https://threejs.org/) et [PeerJS](https://peerjs.com/) : licence MIT.
- Tout le reste (code, personnages, esprits, décors, objets, cosmétiques, musiques) : créé pour NATX ROYALE.

NATX ROYALE est un jeu gratuit, sans publicité ni achat.
