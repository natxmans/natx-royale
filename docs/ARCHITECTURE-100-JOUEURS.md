# NATX ROYALE — Battle Royale à 100 joueurs : étude et architecture

> **État au 9 novembre 2026 : 100 joueurs humains ne sont PAS possibles avec le jeu actuel.**
> Ce document mesure les limites réelles, puis décrit le serveur autoritaire à construire.
> Rien ici n'a été testé avec 100 vraies personnes connectées. Les chiffres sont des mesures
> faites sur le PC de développement, avec des bots.

---

## 1. Ce qui existe aujourd'hui

- **Réseau en étoile avec PeerJS (WebRTC)** : un joueur héberge la partie (classe `Hote`, fichier
  `js/hote.js`) dans son navigateur. Chaque invité ouvre **une** connexion vers lui.
- L'hôte décide de tout : dégâts, butin, zone, constructions, esprits, bots, fin de partie.
- Chaque joueur calcule **son propre déplacement** et l'envoie 20 fois par seconde (`etat`).
  L'hôte vérifie les distances (ramasser, capturer un esprit), mais pas encore la vitesse.
- 20 fois par seconde, l'hôte envoie à **tout le monde** une « photo » (`snap`) avec la
  position de **tous** les joueurs vivants.
- Les bots tournent chez l'hôte.

## 2. Mesures (PC de développement, navigateur Chrome, 9 nov. 2026)

| Mesure | 40 participants | 100 participants |
|---|---|---|
| Calcul de l'hôte par image (`Hote.tick`) | 0,33 ms en moyenne, 95 % < 0,8 ms | 0,26 ms en moyenne, 95 % < 0,6 ms, pire 4,4 ms |
| Taille d'une « photo » `snap` (JSON) | ~1,6 Ko | **5,5 Ko** (100 vivants) |
| Débit reçu par chaque joueur | ~25 Ko/s (moyenne sur 70 s) | ~110 Ko/s au début de la partie |
| Débit que l'hôte doit **envoyer** | ~1 Mo/s (39 invités) | **~10,9 Mo/s ≈ 87 Mbit/s** (99 invités) |
| Mise à jour côté joueur (sans le rendu) | — | 2,4 ms → 3,8 ms avec 99 personnages animés |
| Rendu, 99 personnages à l'écran | — | **54 ms par image (~19 i/s)**, 3 984 appels de dessin, 1,6 M triangles |
| Rendu, île seule | 11 ms, 46 appels de dessin | — |

Comment c'est mesuré : partie Battle Royale lancée en local avec 39 puis 99 bots,
`Hote.tick` chronométré pendant 60 à 70 s de jeu simulé, messages interceptés à la sortie
de l'hôte, puis rendu en 1280×720 avec les personnages placés devant la caméra (le pire cas).

### Ce que ça veut dire

1. **Le calcul n'est pas le problème** : faire tourner une partie de 100 coûte moins d'1 ms par image.
2. **Le réseau en étoile est le mur** : l'hôte devrait envoyer ~87 Mbit/s. Une connexion maison envoie
   en général 5 à 50 Mbit/s. Il faudrait aussi 99 connexions WebRTC ouvertes dans un seul navigateur.
   Et si l'hôte quitte la partie, elle s'arrête pour tout le monde.
3. **Le rendu des personnages est le 2ᵉ mur** : chaque personnage coûte ~40 appels de dessin (corps,
   tenue, chapeau, dos, arme…). 100 personnages visibles ≈ 4 000 appels : 19 images/s sur PC, beaucoup
   moins sur un téléphone.
4. **Triche** : l'hôte croit les positions envoyées par les joueurs. Pour une vraie partie publique
   de 100 inconnus, ce n'est pas assez.

**Limite conseillée aujourd'hui** : jusqu'à ~8 humains par partie avec PeerJS (débit de l'hôte
≈ 1 Mbit/s), et jusqu'à 60 participants au total en comptant les bots (curseur du mode Battle Royale).
Ces limites restent à confirmer par de vrais tests à plusieurs.

## 3. Architecture cible : serveur de jeu autoritaire

```
 Navigateurs (PC, téléphones)                 Serveur de jeu (Node.js, 1 processus par partie)
 ┌─────────────────────────┐   WebSocket    ┌────────────────────────────────────────────┐
 │ jeu.js (rendu, sons,    │ ─ entrées ───▶ │ boucle à 30 Hz                             │
 │ prédiction de MON perso)│ ◀── photos ─── │  ├─ Hote (même logique que js/hote.js)     │
 └─────────────────────────┘  (par joueur)  │  ├─ Monde sans rendu (collisions)          │
                                            │  ├─ zone, butin, esprits, bots, équipes    │
 Salle d'attente / matchmaking (HTTP)       │  └─ intérêt : chacun reçoit ce qui est     │
 (peut vivre à côté du serveur des avis)    │      autour de lui                         │
                                            └────────────────────────────────────────────┘
```

### 3.1 Ce que le serveur fait (et plus le navigateur de l'hôte)

- **Il fait bouger tout le monde.** Le joueur n'envoie plus sa position, seulement ses **entrées**
  (touches, direction de la vue, tir, numéro d'image).
- **Prédiction + correction** : le navigateur applique tout de suite ses entrées, pour garder la
  sensation actuelle. Quand la photo du serveur arrive, il corrige en douceur s'il y a un écart.
- **Tirs** : le serveur refait le tir dans le passé, à l'instant où le joueur l'a vu (« lag
  compensation »), avec un historique de ~300 ms des positions.
- **Équipes, éliminations, zone, butin, esprits, fin de partie** : déjà dans `Hote`. Ce code est
  repris tel quel. `memeEquipe`, `MODES` et `DEFIS_ENTRAINEMENT` sont dans `js/partage.js`.

### 3.2 Les messages ne vont qu'à ceux qui en ont besoin (« intérêt »)

- La carte est découpée en cases de 64 m. Chaque joueur reçoit, à chaque photo :
  - les joueurs de sa case et des cases voisines (≈ 130 m autour) : complets, 20 à 30 fois par seconde ;
  - ses coéquipiers : toujours, même loin ;
  - les autres : seulement le nombre de vivants (déjà dans `elim`).
- Photos **binaires** (`ArrayBuffer`) au lieu de JSON, positions en entiers 16 bits, seulement ce qui
  a changé. Taille estimée par joueur visible : 12 à 16 octets au lieu de ~55 en JSON.
- Ordre de grandeur pour 100 joueurs, ~15 visibles chacun : 15 × 16 o × 25 Hz ≈ **6 Ko/s par joueur**,
  **~0,6 Mo/s** pour le serveur. C'est à la portée d'un petit serveur.

### 3.3 Téléphones

- **Moins d'appels de dessin par personnage** : fusionner les morceaux qui ont le même matériau
  (`BufferGeometryUtils.mergeGeometries`) quand le style ne change plus en cours de partie. Objectif :
  ~8 appels au lieu de ~40.
- **Niveaux de détail** : au-delà de 40 m on cache déjà les petits détails (`userData.details`). À
  ajouter : au-delà de 90 m, une silhouette simple partagée (`InstancedMesh`). Au-delà de 160 m, rien,
  ou un point sur la mini-carte.
- **Animations moins souvent** pour les personnages lointains (10 Hz au lieu de 60).
- **Plafond** de personnages complets visibles en même temps sur téléphone (ex. 20), réglable dans
  les paramètres.
- L'interface tactile est maintenant au-dessus des zones de la caméra et du joystick : ramasser et
  changer d'objet marchent au doigt (corrigé le 9 nov.).

### 3.4 Hébergement

- Le serveur des avis (alwaysdata, Python WSGI) **ne convient pas** pour le jeu en temps réel. Il faut
  un processus qui tourne en continu avec des WebSockets, et une machine proche des joueurs (France).
- Pistes, à comparer le moment venu (prix et conditions **non vérifiés ici**) : un petit serveur virtuel
  (VPS) en France avec Node.js, ou un service de « serveurs de jeu » qui démarre un processus par partie.
- PeerJS reste utile pour les **parties entre potes** jusqu'à ~8 personnes : on garde les deux.

## 4. Plan par étapes (chaque étape testée avant la suivante)

| Étape | Travail | Test qui la valide |
|---|---|---|
| 1 | Faire tourner `Hote` + `Monde` sans rendu dans Node.js (sans `three` côté écran, sans `document`) | une partie de 99 bots tourne seule sur le serveur, 30 Hz stables |
| 2 | Transport WebSocket qui remplace PeerJS (même interface que `js/reseau.js` : `diffuser`, `envoyerA`, `surMessageHote`) | 2 navigateurs jouent ensemble via le serveur |
| 3 | Entrées au lieu des positions + prédiction/correction | ping simulé de 150 ms : déplacement fluide, pas de « téléportation » |
| 4 | Intérêt par cases + photos binaires | débit mesuré < 10 Ko/s par joueur avec 60 bots |
| 5 | Personnages fusionnés + niveaux de détail | 60 personnages visibles : ≥ 30 i/s sur un téléphone moyen |
| 6 | Test de charge : 100 « faux joueurs » (scripts qui envoient des entrées) | CPU serveur, débit, ping au 95ᵉ centile |
| 7 | Vrais tests à 10, puis 30, puis 50 personnes | seulement après : annoncer une limite |

**On n'annoncera pas « 100 joueurs » avant l'étape 7 réussie avec de vraies personnes.**

## 5. Ce qui a déjà été préparé dans le code (9 nov. 2026)

- Modes **Battle Royale, Solo, Duo, Escouade, Entraînement** avec leurs règles dans `js/partage.js`
  (`MODES`) : taille des équipes, nombre de bots conseillé, vitesse de zone, conditions de victoire.
  Le serveur futur les reprend tels quels.
- Battle Royale : jusqu'à 60 participants (1 à 8 humains + bots), mesuré ci-dessus.
- Toutes les décisions sont déjà chez l'hôte (capture d'esprit, pouvoirs, ramassage), avec des
  vérifications de distance qui tolèrent un peu de retard réseau : c'est la même logique qu'un serveur.
