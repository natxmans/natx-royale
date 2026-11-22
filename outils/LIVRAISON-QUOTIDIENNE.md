# Livraison quotidienne de 10 cosmétiques

Tous les jours à 18 h, une tâche planifiée de l'appli Claude crée **10 nouveaux cosmétiques** (modèles 3D faits dans Blender),
les branche dans le jeu, les teste, puis **les met en ligne toute seule si tout est bon** (choix du propriétaire du jeu, 22 nov. 2026).

Dans le jeu : la boutique montre une section **📦 Livraison du jour** (la dernière livraison, aujourd'hui ou hier), les objets
sont marqués **NOUVEAU** pendant 3 jours, puis restent dans le catalogue, le casier, la boutique du jour et sur les bots.

## Ce que touche une livraison (et RIEN d'autre)

| Fichier | Rôle |
|---|---|
| `modeles/jour/AAAA-MM-JJ.json` | la fiche du jour : les 10 objets (catégorie, id, nom, rareté, description, fichier) — reste sur le PC |
| `modeles/sources/construire_jour_AAAA-MM-JJ.py` | le script Blender qui fabrique les modèles — reste sur le PC |
| `modeles/jour/AAAA-MM-JJ_<catégorie>.glb` | les modèles (un fichier par catégorie présente ce jour-là) — publié |
| `js/livraisons_jour.js` | la liste de toutes les livraisons, **écrite seulement par `outils/livraison_jour.py`** — publié |
| `serveur/catalogue.json` (en ligne) | refait par `publier` pour que l'espace admin puisse offrir les nouveaux objets |

Jamais : les autres `.js`, `index.html`, `style.css`, `modeles/integration.json`, les `.glb` / `.blend` / scripts déjà existants,
le code du serveur. Jamais de `git push --force`. Jamais de mot de passe ni de clé dans un fichier.

## Les catégories possibles (modèles 3D seulement)

| Catégorie | Origine de l'objet (Blender, Z en haut, avant = +Y) | Taille | Triangles max | Modèle à imiter |
|---|---|---|---|---|
| `chapeau` | centre de la tête (le point à 1,86 m du perso) ; crâne jusqu'à z = 0,15 ; les chapeaux se posent vers z = 0,06 | tête : RX 0,128, RY 0,138 | 1 500 | `construire_cosm250_chapeaux.py` |
| `dos` | milieu du dos, SUR sa surface ; l'objet part vers -Y ; épaules z +0,25, taille z -0,25 | | 1 500 | `construire_cosm250_dos.py` |
| `pioche` | la poignée (là où la main se ferme) ; manche vers +Y ; tête vers y ≈ 0,75 ; lames vers ±Z | 0,9 à 1,3 m | 1 500 | `construire_cosm250_pioches.py` |
| `deltaplane` | les pieds du perso ; voile à 3,0–3,5 m ; barre à 2,3 m, y = 0,45 | envergure 3 à 4,4 m | 2 500 | `construire_cosm250_deltaplanes.py` |

Matériaux (comme les 250) : `K('#rrggbb')` couleurs unies (deviennent des couleurs par sommet), `L('cyan')` parties lumineuses
(`cyan rose or vert bleu violet rouge blanc orange menthe`), `V()` verre. Pas de texture d'image.

## Les étapes (dans le dossier `natx-royale`, avec Git Bash)

1. **Date du jour** : `date +%F`. Si `modeles/jour/<date>.json` existe déjà : reprendre là où ça s'est arrêté (voir l'état avec
   `python -X utf8 outils/livraison_jour.py etat`) ; si la livraison du jour est déjà en ligne, s'arrêter.
2. **Ce qui existe** : `python -X utf8 outils/livraison_jour.py etat` (ids et noms déjà pris, 7 dernières livraisons).
3. **Imaginer les 10 objets** autour d'un **thème du jour** différent des derniers jours (ex. fête foraine, grands fonds, désert
   de sel, orage, pâtisserie, cirque, jungle, robots rétro…) :
   - répartition conseillée : 3 chapeaux, 3 dos, 2 pioches, 2 deltaplanes (on peut varier) ;
   - raretés : 3 communs, 4 rares, 2 épiques, 1 légendaire (le légendaire a des parties lumineuses) ;
   - **designs originaux** : pas de marque, pas de personnage, d'objet ou de logo d'un autre jeu, film ou dessin animé, pas de
     vraie personne ; tout public (le jeu est joué par des collégiens) : pas d'arme réaliste, rien de gore ou de méchant ;
   - noms en français (3 à 32 caractères), descriptions courtes et drôles (10 à 110 caractères), ids en minuscules sans accent.
4. **Écrire la fiche** `modeles/jour/<date>.json` :
   ```json
   {"date": "2026-11-23", "theme": "Fête foraine", "objets": [
     {"cat": "chapeau", "id": "barbe_a_papa", "nom": "Barbe à Papa", "rarete": "rare",
      "desc": "Un nuage de sucre rose posé sur la tête.", "fichier": "jour/2026-11-23_chapeau.glb"}, …]}
   ```
5. **Le script Blender** `modeles/sources/construire_jour_<date>.py` : lire d'abord le haut du script `construire_cosm250_<cat>.py`
   de chaque catégorie (fonctions d'aide, mesures), puis :
   ```python
   import sys, os, math
   sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
   import outils as O
   from outils import Piece, boite, cyl, cone, sphere, ico, tore, tube, balayage, dome, anneau, etoile, plaque
   from outils_cosm import K, L, V
   from outils_jour import PackJour, controle
   import bpy
   FICHE = os.path.join(O.MODELES, 'jour', '2026-11-23.json')
   O.nouvelle_scene()
   paquets = []
   P = PackJour(FICHE, 'chapeau'); p = P.piece('barbe_a_papa'); p.ajouter(...); P.fin(p); paquets.append(P)
   …
   for P in paquets:
       O.bilan(P.objets, budget=P.budget); P.exporter()
   O.sauver('jour_2026-11-23.blend')
   if '--rendu' in sys.argv:
       for P in paquets: controle(P)
   ```
   Lancer : `"/c/Program Files/Blender Foundation/Blender 5.2/blender.exe" -b --factory-startup --python modeles/sources/construire_jour_<date>.py -- --rendu`
   (Blender en arrière-plan : ne touche pas une fenêtre Blender ouverte). Si `controle` d'une catégorie gêne la suivante (objets
   importés), faire une catégorie par lancement de Blender.
6. **Regarder les images de contrôle** `modeles/sources/rendus/jour_<date>_<cat>.png` (avec l'outil de lecture d'images) : chaque
   objet est-il bien posé (chapeau sur la tête, pas dans le crâne ni en l'air ; sac collé au dos), à la bonne taille, joli et
   reconnaissable ? Sinon corriger le script et relancer (3 essais au plus ; un objet raté peut être remplacé par un autre plus simple).
7. **Contrôle automatique** : `python -X utf8 outils/livraison_jour.py verifier <date>` (10 objets, ids et noms libres, fichiers
   présents, objets nommés `<cat>_<id>`, triangles, poids). Corriger jusqu'à « OK ».
8. **Brancher dans le jeu local** : `python -X utf8 outils/livraison_jour.py ajouter <date>`.
9. **Tester dans le jeu local** (aperçu `natx-royale` sur le port 8798, onglet Boutique) : la section « 📦 Livraison du jour »
   montre les 10 cartes avec leur image ; en JavaScript dans la page :
   ```js
   const M = await import('/js/modeles.js?v=' + document.querySelector('script[type=importmap]').textContent.match(/modeles\.js\?v=(\d+)/)[1]);
   const B = await import('/js/boutique.js?v=' + document.querySelector('script[type=importmap]').textContent.match(/boutique\.js\?v=(\d+)/)[1]);
   const cles = B.livraisonDuJour().objets.map(o => o.cat + ':' + o.id); await M.chargerCosmetiques(cles);
   cles.map(k => [k, M.cosmetiquePret(k)])   // tout doit être true
   ```
   Cliquer sur 2 ou 3 cartes et regarder le perso qui porte l'objet (capture d'écran). Pas d'erreur nouvelle dans la console
   (les « ERR_CONNECTION_REFUSED » vers localhost existaient déjà). Si l'aperçu n'est pas disponible : le dire dans le compte rendu.
10. **Publier** : `python -X utf8 outils/livraison_jour.py publier` (essai sans rien envoyer : `publier --essai`). Il part du dépôt en
    ligne, n'y copie que `js/livraisons_jour.js` et `modeles/jour/*.glb`, attend GitHub Pages, vérifie le site, puis met à jour le
    catalogue de l'espace admin sur le serveur. **S'il dit ERREUR : ne pas forcer.**
11. **Compte rendu** (en français, pour un collégien, tutoiement) : le thème, les 10 objets (nom, catégorie, rareté), en ligne ou
    pas, ce qui a raté.

## En cas de problème

- Un objet raté qu'on n'arrive pas à corriger : le remplacer par un objet plus simple de la même catégorie (il en faut 10).
- Une livraison déjà publiée qui casse quelque chose : `python -X utf8 outils/livraison_jour.py retirer <date>` puis `publier`
  (les objets disparaissent du jeu ; ceux qui les avaient achetés retrouvent l'objet de base).
- Blender absent, GitHub ou le serveur qui ne répondent pas : ne rien publier, le dire dans le compte rendu (la tâche du lendemain
  reprendra : `ajouter` refuse une date déjà présente, `publier` envoie tout ce qui manque en ligne).
