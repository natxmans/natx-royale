# Serveur des retours de NATX ROYALE

Il garde les **avis**, **bugs** et **idées** envoyés par les joueurs, les **votes**, le nombre de
**parties jouées**, et sert l'**espace administrateur** (`/admin/`).

- Python 3.9 ou plus, **aucune installation** : bibliothèque standard uniquement (WSGI + SQLite).
- La base de données est un seul fichier : `serveur/donnees/natx.db` (jamais dans Git, voir `.gitignore`).
- Le jeu lui-même (dossier `natx-royale/`) reste un site statique : GitHub Pages suffit pour lui.
  Le multijoueur PeerJS n'a pas changé.

> **État actuel (8 nov. 2026) : le serveur marche en local, aussi « comme en ligne » sous `/natx`
> (testé), mais il n'est PAS encore en ligne.** Voir la partie 2 pour les étapes.
> Tant que `URL_PRODUCTION` est vide dans `js/retours.js`, la version en ligne du jeu affiche
> « l'envoi des avis arrive bientôt » au lieu d'envoyer quoi que ce soit.

---

## 1. Essayer en local

```bash
python serveur/api.py creer-admin nathan      # demande un mot de passe (12 caractères ou plus)
python serveur/api.py serve 8799               # puis ouvrir http://localhost:8799/admin/
python serveur/api.py serve 8796 natx          # pareil, mais comme en ligne : http://localhost:8796/natx/admin/
```

Le jeu lancé sur `http://localhost:8798` parle tout seul au serveur `http://localhost:8799`.

## 2. Mettre en ligne sur alwaysdata (compte `chrysalide`, déjà utilisé pour Chrysalide)

Adresse prévue : **https://chrysalide.alwaysdata.net/natx**
(API : `…/natx/api`, espace admin : `…/natx/admin/`). Les fichiers vont dans `~/natx-serveur`
sur le serveur ; la base de données dans `~/natx-serveur/donnees/` (jamais écrasée par une mise à jour).

Tout est déjà réglé dans `reglages-alwaysdata.env` (adresse `/natx`, HTTPS, proxy, seul le jeu
`https://natxmans.github.io` peut envoyer des avis) : **aucune variable à taper dans le panneau**.
La clé secrète est créée toute seule par le serveur dans `donnees/secret.key` : elle n'apparaît
nulle part ailleurs.

### Étape A — envoyer les fichiers (Claude ou toi, depuis Git Bash)

```bash
sh serveur/deployer.sh
```

Le script vérifie les fichiers, les envoie par SSH (clé `~/.ssh/chrysalide_alwaysdata`), redémarre
l'appli et teste `…/natx/api/sante`. La première fois, ce test échoue tant que l'étape B n'est pas faite.

### Étape B — créer le site dans le panneau alwaysdata (toi seulement)

Panneau alwaysdata → **Web → Sites → Ajouter un site** :

| Champ | Valeur |
|---|---|
| Nom | `NATX ROYALE avis` |
| Adresses | `chrysalide.alwaysdata.net/natx` |
| Type | **Python WSGI** |
| Chemin de l'application | `natx-serveur/wsgi.py` |
| Répertoire de travail | `natx-serveur` |
| Version de Python | 3.13 (comme Chrysalide) |
| Variables d'environnement | rien (tout est dans `reglages.env`) |
| Onglet SSL | **Forcer le HTTPS** coché |
| Processus | 1 (la base SQLite n'aime pas plusieurs processus ; les threads suffisent) |

Le site Chrysalide (`chrysalide.alwaysdata.net`, sans chemin) n'est pas modifié : seules les adresses
qui commencent par `/natx` vont au serveur des avis.

### Étape C — créer ton compte admin (toi seulement : c'est ton mot de passe)

```bash
ssh -t -i "$HOME/.ssh/chrysalide_alwaysdata" chrysalide@ssh-chrysalide.alwaysdata.net "python3 ~/natx-serveur/api.py creer-admin nathan"
```

Il demande un mot de passe de 12 caractères ou plus, deux fois (rien ne s'affiche pendant la frappe,
c'est normal). Le mot de passe est seulement haché (scrypt) dans la base en ligne. Même commande pour
le changer plus tard.

### Étape D — vérifier, puis brancher le jeu

1. `https://chrysalide.alwaysdata.net/natx/api/sante` répond `{"ok": true, …}`.
2. `https://chrysalide.alwaysdata.net/natx/admin/` → connexion avec le compte de l'étape C.
3. Dans `js/retours.js` : `URL_PRODUCTION = 'https://chrysalide.alwaysdata.net/natx/api'`.
4. Republier le jeu (seulement avec l'accord de Nathan), puis envoyer un vrai avis depuis l'écran de fin
   de la version en ligne et le retrouver dans l'espace admin.

### Mises à jour et sauvegardes

- Après une modification du serveur : `sh serveur/deployer.sh` (les avis, votes et comptes restent).
- Sauvegarde de la base (copie propre même si le serveur tourne) :

  ```bash
  ssh -i "$HOME/.ssh/chrysalide_alwaysdata" chrysalide@ssh-chrysalide.alwaysdata.net "python3 -c \"import sqlite3; sqlite3.connect('natx-serveur/donnees/natx.db').backup(sqlite3.connect('natx-serveur/donnees/sauvegarde.db'))\"" && scp -i "$HOME/.ssh/chrysalide_alwaysdata" chrysalide@ssh-chrysalide.alwaysdata.net:natx-serveur/donnees/sauvegarde.db natx-sauvegarde.db
  ```

- Journal des erreurs : dans `~/admin/logs/` sur le serveur (comme pour Chrysalide).

### Bon à savoir

- Le serveur des avis partage le nom de site `chrysalide.alwaysdata.net` avec Chrysalide. Le cookie
  admin est limité à `/natx/`, et la page admin a une CSP stricte, mais pour séparer complètement
  les deux il faudrait un autre compte alwaysdata (par ex. `natx.alwaysdata.net`) : il suffirait alors
  de changer `COMPTE`/`ADRESSE` dans `deployer.sh` et `NATX_PREFIXE` dans `reglages-alwaysdata.env`.
- Ailleurs qu'alwaysdata : `gunicorn --chdir serveur wsgi:application`, avec les réglages du tableau
  ci-dessous (en variables d'environnement ou dans `reglages.env`).

| Variable | Valeur | Pourquoi |
|---|---|---|
| `NATX_PREFIXE` | `/natx` | si le site n'est pas à la racine de l'adresse |
| `NATX_ORIGINES` | `https://natxmans.github.io` | seuls ces sites peuvent appeler l'API publique |
| `NATX_HTTPS` | `1` | cookie admin « Secure » (le site doit être en HTTPS) |
| `NATX_PROXY` | `1` seulement si le proxy de l'hébergeur AJOUTE la vraie adresse à `X-Forwarded-For` (`0` sur alwaysdata : il la met déjà dans `REMOTE_ADDR`) | adresse du joueur pour les limites anti-abus |
| `NATX_SECRET` | (facultatif, jamais dans un fichier du projet) | sinon le serveur crée `donnees/secret.key` |
| `NATX_TURN_APP` | nom de l'appli **Metered** (compte gratuit, sans carte bancaire) | relais pour jouer entre potes en 4G : à mettre **dans le panneau**, jamais dans Git |
| `NATX_TURN_JETON` | la « Secret Key » de cette appli Metered | **secret** : seulement dans le panneau de l'hébergeur |
| `NATX_TURN_URLS`, `NATX_TURN_UTILISATEUR`, `NATX_TURN_MDP` | autre possibilité : un relais à identifiants fixes (adresses `turn:…` séparées par des virgules) | ces identifiants partent alors chez les joueurs (inévitable avec des identifiants fixes) |
| `NATX_TURN_CLE_ID` (+ `NATX_TURN_JETON`) | autre possibilité : clé TURN Cloudflare Realtime | Cloudflare demande un moyen de paiement pour l'activer |
| `NATX_DONNEES` | (facultatif) dossier de la base | si on veut la mettre ailleurs |

**Ne jamais** mettre de clé secrète ni de mot de passe dans le code du jeu, dans `reglages*.env` ou dans Git.

## 3. Ce que fait le serveur (sécurité)

- **Joueurs anonymes** : un identifiant au hasard signé par le serveur (pas de pseudo, pas d'e-mail).
  Les adresses IP ne sont jamais enregistrées en clair (empreinte HMAC avec la clé secrète).
- **Validation côté serveur** de tout : catégorie dans la liste, note 1 à 5, texte de 3 à 1 000
  caractères (ou une note seule), identifiant de partie, tailles maximales des messages.
- **Anti-abus** : limites par joueur et par connexion (6 avis / 10 min, 25 / jour par connexion,
  40 votes / heure, 10 identités / heure par connexion), doublons ignorés, champ piège pour les robots,
  messages pleins de liens classés « spam » automatiquement.
- **Votes** : un vote par joueur et par idée (clé unique en base), au plus 3 votes par idée depuis
  la même connexion, seulement sur les idées publiées.
- **Modération** : rien n'est public tant qu'un admin n'a pas coché « Publier ». L'admin peut
  réécrire le texte affiché aux joueurs. Les **notes internes** et l'historique ne sortent jamais
  par l'API publique.
- **Admin** : mots de passe hachés avec scrypt (sel unique), session dans un cookie `HttpOnly`,
  `SameSite=Strict` (et `Secure` en HTTPS), expiration après 12 h, jeton anti-CSRF exigé pour
  chaque modification, 8 essais de connexion par 15 minutes, page protégée par une CSP stricte.
  Les permissions sont vérifiées par le serveur à chaque requête.

## 4. API

| Méthode | Chemin | Rôle |
|---|---|---|
| GET | `/api/sante` | le serveur répond-il ? |
| POST | `/api/joueurs` | nouvelle identité anonyme |
| POST | `/api/parties` | une partie jouée (tableau de bord) |
| POST | `/api/retours` | un avis (note, catégorie, texte, id de partie) |
| GET | `/api/suggestions?tri=populaires\|recentes` | idées publiées + votes |
| POST / DELETE | `/api/suggestions/<id>/vote` | voter / retirer son vote |
| GET | `/api/jeu` | annonce et bonus de pièces en cours (affichés dans le menu du jeu) |
| GET | `/api/relais` | relais TURN temporaires (12 h) pour la 4G ; liste vide tant que `NATX_TURN_*` n'est pas réglé |
| POST | `/api/cadeaux` | cadeaux qui attendent ce joueur (pour tous ou rien que pour lui), donnés une seule fois |
| POST | `/api/cadeaux/code` | utiliser un code cadeau (8 essais / 10 min par joueur, 20 par connexion) |
| — | `/api/admin/…` | connexion, tableau de bord, liste filtrée, détail, statut, publication, notes, spams |
| — | `/api/admin/cadeaux…` | créer (tous / un joueur / code), arrêter, réactiver, supprimer des cadeaux (skins + pièces) |
| GET / POST | `/api/admin/jeu` | annonce du menu (texte, style, affichée ou non) et bonus de pièces (× 1,5 / 2 / 3, durée) |
| GET | `/api/admin/joueurs` · POST `/api/admin/joueurs/bloquer` | joueurs anonymes (code joueur), bloquer / débloquer |
| GET | `/api/admin/catalogue` | objets offrables, lus dans `catalogue.json` (fait par `extraire_catalogue.py` depuis `js/boutique.js`) |

Tests automatiques (serveur lancé) : `python -X utf8 .claude/tests/test_api.py` puis `.claude/tests/test_cadeaux.py`.

---

## Grande mise à jour (21 nov. 2026) — rôles, journal, sauvegardes, boîte de cadeaux, cargaisons

Fichiers : `api.py` (base, sécurité, routes d'avant) + **`gestion.py`** (tout le reste, chargé par api.py). `deployer.sh` envoie les deux.
Mise à niveau de la base : **toute seule** à la première requête (on ajoute des tables/colonnes, on ne supprime rien) ;
le premier compte admin existant devient **super administrateur**.

### Rôles (vérifiés par le serveur à chaque requête)
| Rôle | Peut |
|---|---|
| Super administrateur | tout, y compris créer des comptes, donner les rôles, restaurer une sauvegarde |
| Administrateur | tout sauf gérer les comptes admin et restaurer |
| Modérateur | joueurs, sanctions, signalements, avis |
| Gestionnaire de boutique | cadeaux, cosmétiques, boutique, promotions |
| Gestionnaire d'événements | esprits, cargaisons et événements, annonce et bonus |
La liste exacte est dans la page « Administrateurs » du panel (tableau des permissions).

### Commandes (SSH sur le serveur)
```bash
python3 ~/natx-serveur/api.py creer-admin nathan                    # change le mot de passe (garde le rôle)
python3 ~/natx-serveur/api.py creer-admin autre --role moderateur   # crée un compte avec un rôle
python3 ~/natx-serveur/api.py sauvegarder                           # sauvegarde manuelle de la base
```
Les autres comptes se créent plutôt dans le panel (« Administrateurs ») : mot de passe provisoire affiché une fois, à changer.

### Sauvegardes
Dans `~/natx-serveur/donnees/sauvegardes/` : une automatique par jour (14 gardées), les manuelles (20 gardées),
une « avant-restauration » à chaque restauration (10 gardées). Restauration : panel → Sauvegardes (super admin + mot de passe + date tapée).

### Nouvelles routes du jeu
`POST /api/boite`, `/api/boite/ouvrir`, `/api/boite/avertissement` (boîte de réception), `POST /api/profil` (profil déclaré),
`POST /api/signalements`, `POST /api/cargaison` (l'hôte), `POST /api/cargaison/reclamer` (celui qui ouvre la caisse).
`GET /api/jeu` renvoie aussi les réglages de la boutique, les promotions, les esprits disponibles et l'événement en cours.
Tests : `python -X utf8 .claude/tests/test_gestion.py [ancienne_version_api.py]` (tout en local, bases temporaires).

### Liaison staff et Tenue Staff (21 nov. 2026)
Chaque admin peut lier SON compte du jeu à son compte admin : panel → 👤 Mon compte → « 🎮 Mon compte joueur » → code joueur → « Lier ».
Le jeu de ce compte reçoit une demande (« Demande de liaison staff ») qu'il doit **accepter** : un admin ne peut donc pas lier le compte d'un autre.
Une fois lié, le compte joueur reçoit la **Tenue Staff** : jamais en vente, jamais offrable (absente de `catalogue.json`), jamais portée par les bots.
Elle repart toute seule si l'admin se délie, si un super admin le délie (page Administrateurs, mot de passe demandé), si le compte admin est désactivé ou supprimé.
Un compte joueur = au plus un compte admin. Une demande non acceptée expire après 7 jours.
L'hôte d'une partie fait vérifier la tenue par le serveur (`POST /api/staff/verifier`, preuve signée par le serveur) : un joueur qui la porterait sans être du staff la perd dans le salon.
Routes : `POST /api/admin/liaison` {joueur}, `DELETE /api/admin/liaison` ({quoi: 'demande'} pour annuler la demande seulement), `POST /api/boite/liaison` {jeton, id, accepter}, `POST /api/staff/verifier` {jeton, liste:[{ref, badge}]}.
`POST /api/boite` renvoie `staff` (rôle + preuve) et `liaison` (demande en attente, sans l'identifiant de l'admin).

### Robot modérateur et règles du jeu (21 nov. 2026)
`serveur/robot.py` passe tout seul **une fois par jour** (à la première requête après l'heure choisie, 7 h par défaut) : aucune tâche planifiée à régler chez l'hébergeur, et l'ordinateur de Nathan n'a pas besoin d'être allumé.
- **Signalements** : pour la triche il regarde les 30 dernières parties et les statistiques du joueur. Résultat logiquement impossible (plus d'éliminations que de joueurs, place plus grande que le nombre de joueurs, plus de tirs réussis que de tirs, Tenue Staff sans être du staff) → sanction. Seulement suspect (précision très haute, beaucoup de victoires…) → sanction seulement si 3 joueurs différents l'ont signalé, sinon « à vérifier par un humain ». Rien de suspect et un seul signalement → rejeté.
- **Insultes / anti-jeu** : la discussion n'est pas enregistrée, donc il compte les joueurs DIFFÉRENTS qui signalent (même adresse internet = une seule personne) : 2 pour les insultes, 3 pour l'anti-jeu.
- **Pseudo** : gros mots et faux « admin / staff ».
- **Avis** : spam caché (trop court, lien, lettres répétées, insulte seule, doublon) ; bug avec 3 votes ou idée avec 5 votes → « À étudier ».
- **Échelle** : avertissement → suspension 24 h → 3 jours. Jamais plus, jamais un compte du staff, une sanction par joueur et par passage. Un admin peut lever chaque sanction (⛔ Sanctions).
- Tout est noté au journal d'audit (catégorie `robot`) et dans un rapport (panel → 🤖 Robot modérateur, où on peut aussi l'éteindre, changer l'heure, lui retirer le droit de suspendre, ou le lancer à la main). En SSH : `python3 api.py robot`.
- **Récompense** : quand la triche est PROUVÉE par les parties (pas seulement « plusieurs signalements »), les joueurs qui l'avaient signalée reçoivent des pièces (300 par défaut, réglable, 0 = aucune) dans leur boîte de cadeaux, origine `robot`. Garde-fous : les 5 premiers, une fois par (signaleur, tricheur), 3 par semaine au plus, jamais le tricheur ni un compte de la même adresse que lui, une personne par adresse. Table `robot_recompenses`.
- Limites : les parties et statistiques sont envoyées par le jeu de chaque joueur (indices, pas preuves absolues) ; sans signalement, il ne sanctionne jamais (il prévient seulement).
- Les règles montrées aux joueurs sont dans `js/regles.js` (bouton 📜 Règles du jeu, montrées une fois au premier lancement) ; `robot.REGLES` doit garder les mêmes numéros et titres (un test le vérifie).
Routes : `GET /api/admin/robot`, `POST /api/admin/robot/reglages`, `POST /api/admin/robot/lancer`.

### Relais pour la 4G (TURN), mis à jour le 21 nov. 2026
Le serveur sait utiliser trois sortes de relais (le premier réglé gagne) : **Metered** (`NATX_TURN_APP` + `NATX_TURN_JETON`), un relais à **identifiants fixes** (`NATX_TURN_URLS` + `NATX_TURN_UTILISATEUR` + `NATX_TURN_MDP`), ou **Cloudflare Realtime** (`NATX_TURN_CLE_ID` + `NATX_TURN_JETON`).
- Cloudflare a été abandonné le 21 nov. : l'activation de Realtime passe par une page de paiement (0 $ mais carte ou PayPal obligatoires).
- Metered : le serveur crée un accès valable 12 h (`POST https://<appli>.metered.live/api/v1/turn/credential?secretKey=…`), récupère la liste des relais (`GET …/credentials?apiKey=…`) et la garde en mémoire. Un accès tout neuf n'est donné aux joueurs qu'après 150 s (il met jusqu'à 2 minutes à marcher partout) : l'ancien sert en attendant.
- Quota gratuit de Metered : leur page de tarifs dit 500 Mo par mois (« No credit card required »), leur page « Open Relay » dit 20 Go par mois. À vérifier dans leur tableau de bord. Quand le quota est fini, le relais s'arrête sans doute (pas confirmé) : le jeu continue alors comme sans relais.
- `GET /api/relais` répond `{"iceServers": [...], "configure": true}` quand c'est réglé. La clé secrète ne quitte jamais le serveur et n'est jamais écrite dans les journaux.

### Visuels du panel (21 nov. 2026)

Le logo, les icônes, les badges et cadres de rareté, les illustrations et les vignettes des cosmétiques viennent de `modeles/admin/` (session modélisation).
Le panel n'accepte que ses propres fichiers (règle CSP), donc `serveur/copier_visuels.py` les **copie** dans `serveur/admin/visuels/` :

- `deployer.sh` lance la copie tout seul avant d'envoyer `admin/` ;
- pour tester en local : `python -X utf8 serveur/copier_visuels.py` ;
- les originaux de `modeles/admin/` ne sont jamais modifiés ; `serveur/admin/visuels/` est une copie qu'on peut effacer et refaire ;
- si le dossier `visuels/` manque, le panel marche comme avant, avec ses émojis.
