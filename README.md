# NATX ROYALE

Une bataille royale cartoon à jouer entre potes, directement dans le navigateur.

**Jouer : https://natxmans.github.io/natx-royale/**

- Multijoueur sans serveur de jeu : un joueur héberge la partie, les autres rejoignent avec son code (PeerJS).
- Fonctionne sur ordinateur et sur mobile (commandes tactiles).
- À la fin de chaque partie, tu peux donner ton avis, signaler un bug ou proposer une idée ; les idées
  validées apparaissent dans l'onglet 💡 Idées, où tout le monde peut voter.

## Dossiers

| Dossier | Contenu |
|---|---|
| `index.html`, `style.css`, `js/` | le jeu (three.js + PeerJS, aucun outil de construction) |
| `modeles/` | modèles 3D au format glTF (`.glb`) et `integration.json` (réglages des modèles) |
| `serveur/` | serveur des avis, votes et espace admin (Python + SQLite), hébergé à part — voir `serveur/LISEZMOI.md` |

Le serveur ne contient aucun mot de passe ni clé secrète : la clé est créée sur l'hébergeur,
les comptes admin aussi.

## Crédits et licences

- **Arme futuriste** (`modeles/weapon_futuriste_v001.glb`) : d'après « Futuristic Weapon Concept High-poly »
  de **3DHaupt**, [BlendSwap](https://blendswap.com/blend/11979), licence
  [CC BY-NC-SA](https://creativecommons.org/licenses/by-nc-sa/4.0/deed.fr).
  Modifié : converti en glTF, mis à l'échelle, réorienté, matériaux refaits. Ce fichier modifié est partagé
  sous la même licence CC BY-NC-SA (pas d'usage commercial).
- [three.js](https://threejs.org/) et [PeerJS](https://peerjs.com/) : licence MIT.
- Tout le reste (code, personnages, décors, objets, cosmétiques) : créé pour NATX ROYALE.

NATX ROYALE est un jeu gratuit, sans publicité ni achat.
