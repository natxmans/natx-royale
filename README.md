# NATX ROYALE

Une bataille royale cartoon à jouer entre potes, directement dans le navigateur.

**Jouer : https://natxmans.github.io/natx-royale/**

- **5 modes** : 👑 Battle Royale (chacun pour soi), 👤 Solo (partie rapide), 👥 Duo, 🛡️ Escouade (équipes de 4),
  🎯 Entraînement (mannequins, défis, on réapparaît).
- **Esprits** : de petits compagnons flottent sur des autels de l'île. Capture-en un : il te suit, te donne un
  bonus et un pouvoir (🌱 Pousse, ☁️ Filou, 🛡️ Gardien, 👁️ Zyeuto, 🔨 Briquet).
- Multijoueur sans serveur de jeu : un joueur héberge la partie, les autres rejoignent avec son code (PeerJS).
- Ordinateur et téléphone (commandes tactiles).
- À la fin de chaque partie, tu peux donner ton avis, signaler un bug ou proposer une idée. Les idées validées
  apparaissent dans l'onglet 💡 Idées, où tout le monde vote. La Boutique accepte les **codes cadeaux**.

## Dossiers

| Dossier | Contenu |
|---|---|
| `index.html`, `style.css`, `js/` | le jeu (three.js + PeerJS, aucun outil de construction) |
| `modeles/` | modèles 3D (`.glb`) ; `integration.json` dit lesquels sont activés et comment les placer |
| `serveur/` | serveur des avis, votes, cadeaux et espace admin (Python + SQLite), hébergé à part — voir `serveur/LISEZMOI.md` |
| `docs/` | étude « Battle Royale à 100 joueurs » et rapports de mise à jour |

Le serveur ne contient aucun mot de passe ni clé secrète : la clé est créée sur l'hébergeur, les comptes
admin aussi.

## Crédits et licences

- **Arme futuriste** (`modeles/weapon_futuriste_v002.glb`) : d'après « Futuristic Weapon Concept High-poly »
  de **3DHaupt**, [BlendSwap](https://blendswap.com/blend/11979), licence
  [CC BY-NC-SA](https://creativecommons.org/licenses/by-nc-sa/4.0/deed.fr).
  Modifié : converti en glTF, mis à l'échelle, réorienté, matériaux refaits. Ce fichier modifié est partagé
  sous la même licence CC BY-NC-SA (pas d'usage commercial).
- **Maison « cottage »** (`modeles/house_cottage_v001.glb`, pas encore utilisée dans le jeu) : d'après
  « Free GameReady Cottage » de **Gerhald3D** (TurboSquid) ; l'auteur autorise tout usage sauf la revente.
- [three.js](https://threejs.org/) et [PeerJS](https://peerjs.com/) : licence MIT.
- Tout le reste (code, personnages, esprits, décors, objets, cosmétiques) : créé pour NATX ROYALE.

NATX ROYALE est un jeu gratuit, sans publicité ni achat.
