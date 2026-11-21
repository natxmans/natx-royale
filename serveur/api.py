#!/usr/bin/env python3
"""NATX ROYALE — serveur des retours joueurs (avis, bugs, idées), des votes et de l'espace admin.

Uniquement la bibliothèque standard de Python (3.9 ou plus) : WSGI + SQLite.

  Lancer en local (tests) :      python serveur/api.py serve 8799 [/prefixe]
  Créer un compte admin :        python serveur/api.py creer-admin <identifiant> [--role super_admin|admin|moderateur|boutique|evenements]
  Sauvegarder la base :          python serveur/api.py sauvegarder
  Passage du robot modérateur :  python serveur/api.py robot   (sinon il passe tout seul une fois par jour)
  En ligne (hébergeur Python) :  serveur/wsgi.py expose « application »

Variables d'environnement (voir serveur/LISEZMOI.md) :
  NATX_SECRET     clé secrète (sinon créée dans donnees/secret.key, jamais envoyée au navigateur)
  NATX_ORIGINES   sites autorisés à appeler l'API publique (séparés par des virgules)
  NATX_HTTPS=1    cookies « Secure » (obligatoire en ligne, le site doit être en HTTPS)
  NATX_PROXY=1    l'hébergeur passe par un proxy : adresse IP lue dans X-Forwarded-For
  NATX_DONNEES    dossier de la base de données (par défaut serveur/donnees)
  NATX_PREFIXE    chemin du site s'il n'est pas à la racine (ex. /natx pour chrysalide.alwaysdata.net/natx)
"""
import os
import sys
import re
import json
import time
import hmac
import sqlite3
import hashlib
import secrets
import getpass
import mimetypes
import threading
from socketserver import ThreadingMixIn
from urllib.parse import parse_qs, quote, urlparse
from wsgiref.simple_server import make_server, WSGIServer, WSGIRequestHandler

ICI = os.path.dirname(os.path.abspath(__file__))
DONNEES = os.environ.get('NATX_DONNEES', os.path.join(ICI, 'donnees'))
BASE = os.path.join(DONNEES, 'natx.db')
ADMIN_STATIQUE = os.path.join(ICI, 'admin')
ORIGINES = {o.strip().rstrip('/') for o in os.environ.get(
    'NATX_ORIGINES', 'http://localhost:8798,http://127.0.0.1:8798,https://natxmans.github.io').split(',') if o.strip()}
DERRIERE_PROXY = os.environ.get('NATX_PROXY') == '1'
PREFIXE = os.environ.get('NATX_PREFIXE', '').strip().rstrip('/')
if PREFIXE and not PREFIXE.startswith('/'):
    PREFIXE = '/' + PREFIXE
COOKIE_SECURE = os.environ.get('NATX_HTTPS') == '1'
VERSION_API = 3
DUREE_SESSION = 12 * 3600

CATEGORIES = {
    'idee': "Idée d'amélioration", 'contenu': 'Nouveau contenu', 'gameplay': 'Gameplay',
    'bug': 'Bug rencontré', 'collision': 'Problème de collision', 'graphismes': 'Graphismes',
    'performance': 'Performance', 'interface': 'Interface', 'autre': 'Autre',
}
STATUTS = ['nouveau', 'a_etudier', 'en_cours', 'accepte', 'refuse', 'corrige']
MODES = {'br', 'solo', 'duo', 'escouade', 'entrainement'}

SCHEMA = """
CREATE TABLE IF NOT EXISTS joueurs (id TEXT PRIMARY KEY, cree_le INTEGER NOT NULL, ip_hash TEXT);
CREATE TABLE IF NOT EXISTS parties (
  partie_id TEXT NOT NULL, joueur_id TEXT NOT NULL, cree_le INTEGER NOT NULL, mode TEXT, nb_joueurs INTEGER,
  place INTEGER, kills INTEGER, duree INTEGER, PRIMARY KEY (partie_id, joueur_id));
CREATE TABLE IF NOT EXISTS retours (
  id INTEGER PRIMARY KEY AUTOINCREMENT, partie_id TEXT, joueur_id TEXT NOT NULL, cree_le INTEGER NOT NULL,
  note INTEGER, categorie TEXT NOT NULL, texte TEXT NOT NULL, statut TEXT NOT NULL DEFAULT 'nouveau',
  public INTEGER NOT NULL DEFAULT 0, texte_public TEXT, spam INTEGER NOT NULL DEFAULT 0,
  ip_hash TEXT, plateforme TEXT, version_jeu TEXT, maj_le INTEGER);
CREATE INDEX IF NOT EXISTS retours_cat ON retours(categorie);
CREATE INDEX IF NOT EXISTS retours_public ON retours(public, spam);
CREATE TABLE IF NOT EXISTS votes (
  retour_id INTEGER NOT NULL, joueur_id TEXT NOT NULL, cree_le INTEGER NOT NULL, ip_hash TEXT,
  PRIMARY KEY (retour_id, joueur_id));
CREATE INDEX IF NOT EXISTS votes_ip ON votes(retour_id, ip_hash);
CREATE TABLE IF NOT EXISTS notes_internes (
  id INTEGER PRIMARY KEY AUTOINCREMENT, retour_id INTEGER NOT NULL, admin_id INTEGER NOT NULL,
  cree_le INTEGER NOT NULL, texte TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS admins (
  id INTEGER PRIMARY KEY AUTOINCREMENT, identifiant TEXT UNIQUE NOT NULL, hash_mdp TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'admin', cree_le INTEGER NOT NULL);
CREATE TABLE IF NOT EXISTS sessions (
  jeton_hash TEXT PRIMARY KEY, admin_id INTEGER NOT NULL, csrf TEXT NOT NULL, cree_le INTEGER NOT NULL, expire_le INTEGER NOT NULL);
CREATE TABLE IF NOT EXISTS limites (cle TEXT PRIMARY KEY, debut INTEGER NOT NULL, compte INTEGER NOT NULL);
CREATE TABLE IF NOT EXISTS journal (
  id INTEGER PRIMARY KEY AUTOINCREMENT, admin_id INTEGER, action TEXT NOT NULL, retour_id INTEGER, cree_le INTEGER NOT NULL);
CREATE TABLE IF NOT EXISTS cadeaux (
  id INTEGER PRIMARY KEY AUTOINCREMENT, titre TEXT NOT NULL, message TEXT, pieces INTEGER NOT NULL DEFAULT 0,
  objets TEXT NOT NULL DEFAULT '[]', cible TEXT NOT NULL, joueur_id TEXT, code TEXT UNIQUE, max_utilisations INTEGER,
  actif INTEGER NOT NULL DEFAULT 1, expire_le INTEGER, cree_le INTEGER NOT NULL, admin_id INTEGER);
CREATE TABLE IF NOT EXISTS cadeaux_recus (
  cadeau_id INTEGER NOT NULL, joueur_id TEXT NOT NULL, recu_le INTEGER NOT NULL, PRIMARY KEY (cadeau_id, joueur_id));
CREATE TABLE IF NOT EXISTS reglages_jeu (cle TEXT PRIMARY KEY, valeur TEXT NOT NULL, maj_le INTEGER NOT NULL);
CREATE TABLE IF NOT EXISTS connexions_admin (
  id INTEGER PRIMARY KEY AUTOINCREMENT, admin_id INTEGER, identifiant TEXT, ok INTEGER NOT NULL, ip_hash TEXT,
  navigateur TEXT, cree_le INTEGER NOT NULL);
CREATE TABLE IF NOT EXISTS actions_faites (cle TEXT PRIMARY KEY, cree_le INTEGER NOT NULL);
CREATE TABLE IF NOT EXISTS mesures (
  heure TEXT PRIMARY KEY, requetes INTEGER NOT NULL DEFAULT 0, erreurs INTEGER NOT NULL DEFAULT 0,
  refus INTEGER NOT NULL DEFAULT 0, total_ms INTEGER NOT NULL DEFAULT 0, max_ms INTEGER NOT NULL DEFAULT 0);
CREATE TABLE IF NOT EXISTS erreurs (id INTEGER PRIMARY KEY AUTOINCREMENT, cree_le INTEGER NOT NULL, route TEXT, type TEXT, message TEXT);
CREATE TABLE IF NOT EXISTS connexions_joueurs (
  joueur_id TEXT NOT NULL, jour TEXT NOT NULL, premiere INTEGER NOT NULL, derniere INTEGER NOT NULL, nb INTEGER NOT NULL DEFAULT 1,
  PRIMARY KEY (joueur_id, jour));
CREATE TABLE IF NOT EXISTS profils (
  joueur_id TEXT PRIMARY KEY, pseudo TEXT, niveau INTEGER, xp INTEGER, pieces INTEGER, possedes TEXT, equipe TEXT,
  esprits TEXT, stats TEXT, version TEXT, maj_le INTEGER NOT NULL);
CREATE INDEX IF NOT EXISTS profils_pseudo ON profils(pseudo);
CREATE TABLE IF NOT EXISTS sanctions (
  id INTEGER PRIMARY KEY AUTOINCREMENT, joueur_id TEXT NOT NULL, type TEXT NOT NULL, motif TEXT NOT NULL,
  debut INTEGER NOT NULL, fin INTEGER, admin_id INTEGER, leve_le INTEGER, leve_par INTEGER, leve_motif TEXT, vu_le INTEGER);
CREATE INDEX IF NOT EXISTS sanctions_joueur ON sanctions(joueur_id);
CREATE TABLE IF NOT EXISTS signalements (
  id INTEGER PRIMARY KEY AUTOINCREMENT, cree_le INTEGER NOT NULL, auteur_id TEXT NOT NULL, cible_id TEXT, cible_pseudo TEXT,
  partie_id TEXT, motif TEXT NOT NULL, texte TEXT, statut TEXT NOT NULL DEFAULT 'nouveau', traite_par INTEGER, traite_le INTEGER, note TEXT);
CREATE TABLE IF NOT EXISTS cosmetiques_reglages (
  cle TEXT PRIMARY KEY, nom TEXT, description TEXT, rarete TEXT, prix INTEGER, en_vente INTEGER, collection INTEGER,
  maj_le INTEGER NOT NULL, maj_par INTEGER);
CREATE TABLE IF NOT EXISTS cosmetiques_ajouts (
  cle TEXT PRIMARY KEY, cat TEXT NOT NULL, id TEXT NOT NULL, nom TEXT NOT NULL, description TEXT, rarete TEXT NOT NULL,
  prix INTEGER, fichier TEXT NOT NULL, objet TEXT NOT NULL, actif INTEGER NOT NULL DEFAULT 1, cree_le INTEGER NOT NULL, cree_par INTEGER);
CREATE TABLE IF NOT EXISTS promotions (
  id INTEGER PRIMARY KEY AUTOINCREMENT, nom TEXT NOT NULL, reduction INTEGER NOT NULL, cible_type TEXT NOT NULL,
  cible_valeurs TEXT NOT NULL DEFAULT '[]', debut INTEGER NOT NULL, fin INTEGER NOT NULL, actif INTEGER NOT NULL DEFAULT 1,
  cree_le INTEGER NOT NULL, cree_par INTEGER);
CREATE TABLE IF NOT EXISTS esprits_reglages (
  type TEXT PRIMARY KEY, actif INTEGER NOT NULL DEFAULT 1, poids INTEGER NOT NULL DEFAULT 10, description TEXT,
  maj_le INTEGER NOT NULL, maj_par INTEGER);
CREATE TABLE IF NOT EXISTS esprits_obtenus (
  id INTEGER PRIMARY KEY AUTOINCREMENT, joueur_id TEXT NOT NULL, type TEXT NOT NULL, rarete TEXT NOT NULL,
  source TEXT NOT NULL, cree_le INTEGER NOT NULL);
CREATE TABLE IF NOT EXISTS evenements (
  id INTEGER PRIMARY KEY AUTOINCREMENT, type TEXT NOT NULL DEFAULT 'cargaison', nom TEXT NOT NULL, description TEXT,
  debut INTEGER NOT NULL, fin INTEGER NOT NULL, actif INTEGER NOT NULL DEFAULT 1, config TEXT NOT NULL DEFAULT '{}',
  cree_le INTEGER NOT NULL, cree_par INTEGER, maj_le INTEGER);
CREATE TABLE IF NOT EXISTS cargaisons (
  id TEXT PRIMARY KEY, evenement_id INTEGER, partie_id TEXT NOT NULL, hote_id TEXT NOT NULL, cree_le INTEGER NOT NULL,
  ouvrable_le INTEGER NOT NULL, expire_le INTEGER NOT NULL, recompense TEXT NOT NULL, reclame_par TEXT, reclame_le INTEGER, cadeau_id INTEGER);
CREATE INDEX IF NOT EXISTS cargaisons_partie ON cargaisons(partie_id);
CREATE TABLE IF NOT EXISTS joueurs_notes (
  joueur_id TEXT PRIMARY KEY, surnom TEXT, note TEXT, maj_le INTEGER NOT NULL, maj_par INTEGER);
CREATE TABLE IF NOT EXISTS pseudos_joueurs (
  joueur_id TEXT NOT NULL, pseudo TEXT NOT NULL, premier INTEGER NOT NULL, dernier INTEGER NOT NULL, PRIMARY KEY (joueur_id, pseudo));
CREATE INDEX IF NOT EXISTS pseudos_recherche ON pseudos_joueurs(pseudo);
CREATE TABLE IF NOT EXISTS comptes (
  joueur_id TEXT PRIMARY KEY, code_hash TEXT UNIQUE, code_cree_le INTEGER, sauvegarde TEXT, rev INTEGER NOT NULL DEFAULT 0,
  maj_le INTEGER, taille INTEGER NOT NULL DEFAULT 0);
CREATE TABLE IF NOT EXISTS robot_rapports (
  id INTEGER PRIMARY KEY AUTOINCREMENT, cree_le INTEGER NOT NULL, declenche TEXT, resume TEXT NOT NULL, details TEXT);
CREATE TABLE IF NOT EXISTS robot_recompenses (
  auteur_id TEXT NOT NULL, cible_id TEXT NOT NULL, cadeau_id INTEGER, pieces INTEGER NOT NULL, cree_le INTEGER NOT NULL,
  PRIMARY KEY (auteur_id, cible_id));
"""
CIBLES = {'tous', 'joueur', 'code'}
STYLES_ANNONCE = {'info', 'evenement', 'alerte'}
ALPHABET_CODE = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'  # sans 0/O ni 1/I : faciles à recopier
CATALOGUE_FICHIER = os.path.join(ICI, 'catalogue.json')


# ---------------------------------------------------------------- outils
def maintenant():
    return int(time.time())


_secret = None


def secret():
    """Clé du serveur : signe les identifiants des joueurs et masque les adresses IP."""
    global _secret
    if _secret:
        return _secret
    s = os.environ.get('NATX_SECRET')
    if not s:
        chemin = os.path.join(DONNEES, 'secret.key')
        os.makedirs(DONNEES, exist_ok=True)
        if not os.path.exists(chemin):
            with open(chemin, 'w', encoding='ascii') as f:
                f.write(secrets.token_hex(32))
            try:
                os.chmod(chemin, 0o600)
            except OSError:
                pass
        with open(chemin, encoding='ascii') as f:
            s = f.read().strip()
    _secret = s.encode()
    return _secret


_verrou_schema = threading.Lock()
_schema_ok = False


def connexion():
    global _schema_ok
    os.makedirs(DONNEES, exist_ok=True)
    db = sqlite3.connect(BASE, timeout=10, isolation_level=None)
    db.row_factory = sqlite3.Row
    db.execute('PRAGMA journal_mode=WAL')
    db.execute('PRAGMA foreign_keys=ON')
    db.execute('PRAGMA busy_timeout=5000')
    if not _schema_ok:
        with _verrou_schema:
            db.executescript(SCHEMA)
            colonnes = {r[1] for r in db.execute('PRAGMA table_info(joueurs)')}
            if 'bloque' not in colonnes:
                db.execute('ALTER TABLE joueurs ADD COLUMN bloque INTEGER NOT NULL DEFAULT 0')
            if 'vu_le' not in colonnes:
                db.execute('ALTER TABLE joueurs ADD COLUMN vu_le INTEGER')
            if 'ref' not in colonnes:
                db.execute('ALTER TABLE joueurs ADD COLUMN ref TEXT')
            migrer(db)
            _schema_ok = True
    return db


def colonnes_de(db, table):
    return {r[1] for r in db.execute(f'PRAGMA table_info({table})')}


def ajouter_colonnes(db, table, colonnes):
    deja = colonnes_de(db, table)
    nouvelles = [c for c in colonnes if c.split()[0] not in deja]
    for c in nouvelles:
        db.execute(f'ALTER TABLE {table} ADD COLUMN {c}')
    return [c.split()[0] for c in nouvelles]


def migrer(db):
    """Mise à niveau d'une base existante : on ajoute, on ne supprime jamais rien."""
    nouvelles = ajouter_colonnes(db, 'cadeaux_recus', ['ouvert_le INTEGER', 'annule_le INTEGER', 'remplace_par INTEGER'])
    if 'ouvert_le' in nouvelles:
        # avant la boîte de réception, un cadeau livré était ouvert tout de suite par le jeu
        db.execute('UPDATE cadeaux_recus SET ouvert_le = recu_le WHERE ouvert_le IS NULL')
    ajouter_colonnes(db, 'cadeaux', ["expediteur TEXT", "origine TEXT NOT NULL DEFAULT 'admin'", 'esprit TEXT'])
    ajouter_colonnes(db, 'admins', ['actif INTEGER NOT NULL DEFAULT 1', 'doit_changer_mdp INTEGER NOT NULL DEFAULT 0',
                                    'cree_par INTEGER', 'derniere_connexion INTEGER',
                                    # liaison staff : le compte joueur de l'admin (joueur_id) et la demande en attente
                                    'joueur_id TEXT', 'joueur_attente TEXT', 'liaison_demande_le INTEGER', 'liaison_le INTEGER'])
    ajouter_colonnes(db, 'sessions', ['ip_hash TEXT', 'navigateur TEXT', 'vu_le INTEGER'])
    ajouter_colonnes(db, 'journal', ['categorie TEXT', 'cible TEXT', 'details TEXT', 'ip_hash TEXT'])
    # rôles : le tout premier compte (celui de Nathan) devient super administrateur s'il n'y en a pas encore
    if not db.execute("SELECT 1 FROM admins WHERE role='super_admin'").fetchone():
        premier = db.execute('SELECT id FROM admins ORDER BY id LIMIT 1').fetchone()
        if premier:
            db.execute("UPDATE admins SET role='super_admin' WHERE id=?", (premier['id'],))
    # ancien « joueur bloqué » → sanctions muet + cadeaux (mêmes effets qu'avant), sans limite de durée
    for l in db.execute('SELECT id FROM joueurs WHERE bloque=1').fetchall():
        for type_ in ('muet', 'cadeaux'):
            db.execute('INSERT INTO sanctions(joueur_id, type, motif, debut) VALUES (?,?,?,?)',
                       (l['id'], type_, "Blocage fait avec l'ancien panel", maintenant()))
        db.execute('UPDATE joueurs SET bloque=0 WHERE id=?', (l['id'],))


def hacher_ip(ip):
    return hmac.new(secret(), ('ip:' + (ip or '?')).encode(), 'sha256').hexdigest()[:24]


def signer_joueur(id_):
    return hmac.new(secret(), ('joueur:' + id_).encode(), 'sha256').hexdigest()[:32]


def joueur_du_jeton(jeton):
    """« id.signature » → id du joueur, ou None si la signature est fausse."""
    if not isinstance(jeton, str) or len(jeton) > 80 or '.' not in jeton:
        return None
    id_, sig = jeton.split('.', 1)
    if not re.fullmatch(r'[0-9a-f]{24}', id_):
        return None
    return id_ if hmac.compare_digest(sig, signer_joueur(id_)) else None


def nettoyer(texte, maxi):
    """Texte propre : sans caractères de contrôle, espaces resserrés, longueur limitée."""
    if not isinstance(texte, str):
        return ''
    texte = re.sub(r'[\u0000-\u0008\u000b-\u001f\u007f​-‏ -‮﻿]', '', texte)
    texte = re.sub(r'[ \t]+', ' ', texte)
    texte = re.sub(r'\n{3,}', '\n\n', texte).strip()
    return texte[:maxi]


def hacher_mdp(mdp):
    sel = secrets.token_bytes(16)
    h = hashlib.scrypt(mdp.encode(), salt=sel, n=2 ** 14, r=8, p=1, dklen=32)
    return f'scrypt$16384$8$1${sel.hex()}${h.hex()}'


def verifier_mdp(mdp, stocke):
    try:
        algo, n, r, p, sel, h = stocke.split('$')
        calcul = hashlib.scrypt(mdp.encode(), salt=bytes.fromhex(sel), n=int(n), r=int(r), p=int(p), dklen=len(h) // 2)
        return algo == 'scrypt' and hmac.compare_digest(calcul.hex(), h)
    except (ValueError, TypeError):
        return False


_HASH_FACTICE = None
_catalogue = None


def catalogue():
    """Objets du jeu que l'admin peut offrir (fabriqué depuis js/boutique.js par extraire_catalogue.py)."""
    global _catalogue
    if _catalogue is None:
        try:
            with open(CATALOGUE_FICHIER, encoding='utf-8') as f:
                _catalogue = json.load(f)
        except (OSError, ValueError):
            _catalogue = {'categories': [], 'raretes': {}, 'objets': []}
    return _catalogue


def code_court(jid):
    """Ce que le joueur voit dans le jeu : les 8 premiers caractères de son id, ex. 80FD-FB83."""
    return (jid[:4] + '-' + jid[4:8]).upper() if jid else ''


def joueur_par_code(db, code):
    c = re.sub(r'[^0-9a-f]', '', str(code or '').lower())
    if len(c) != 8:
        raise Erreur(400, 'Code joueur invalide (8 caractères, ex. 80FD-FB83).')
    lignes = db.execute('SELECT id FROM joueurs WHERE id LIKE ?', (c + '%',)).fetchall()
    if len(lignes) != 1:
        raise Erreur(404, 'Aucun joueur avec ce code.' if not lignes else 'Plusieurs joueurs ont ce code : impossible de choisir.')
    return lignes[0]['id']


def normaliser_code(code):
    return re.sub(r'[^A-Z0-9]', '', str(code or '').upper())[:24]


def formater_code(code):
    """Codes tirés au hasard : NATX-ABCD-EFGH ; codes choisis par l'admin : tels quels (NOEL2026)."""
    if code and re.fullmatch(r'NATX[A-Z2-9]{8}', code):
        return code[:4] + '-' + code[4:8] + '-' + code[8:]
    return code or None


def joueur_vu(db, jid):
    t = maintenant()
    db.execute('UPDATE joueurs SET vu_le=? WHERE id=?', (t, jid))
    # historique des connexions : une ligne par jour et par joueur
    db.execute("""INSERT INTO connexions_joueurs(joueur_id, jour, premiere, derniere, nb) VALUES (?, date(?, 'unixepoch'), ?, ?, 1)
        ON CONFLICT(joueur_id, jour) DO UPDATE SET derniere=excluded.derniere,
        nb = nb + CASE WHEN excluded.derniere - derniere > 1800 THEN 1 ELSE 0 END""", (jid, t, t, t))


TYPES_SANCTIONS = {
    'avertissement': 'Avertissement (message au joueur)',
    'muet': "Muet : plus d'avis, de votes ni de signalements",
    'cadeaux': 'Privé de cadeaux, de codes et de cargaisons',
    'suspension': 'Compte suspendu : tout le serveur + parties en ligne',
}


def sanction_active(db, jid, types):
    t = maintenant()
    marques = ','.join('?' * len(types))
    return db.execute(f"""SELECT * FROM sanctions WHERE joueur_id=? AND type IN ({marques}) AND leve_le IS NULL AND debut <= ?
        AND (fin IS NULL OR fin > ?) ORDER BY COALESCE(fin, 9999999999) DESC LIMIT 1""", (jid, *types, t, t)).fetchone()


def texte_fin(fin):
    return 'sans limite de durée' if not fin else 'jusqu\'au ' + time.strftime('%d/%m/%Y %H:%M', time.localtime(fin))


def pas_bloque(db, jid):
    l = db.execute('SELECT bloque FROM joueurs WHERE id=?', (jid,)).fetchone()
    if l and l['bloque']:
        raise Erreur(403, 'Ce compte ne peut plus envoyer d\'avis ni voter.')
    s = sanction_active(db, jid, ('muet', 'suspension'))
    if s:
        raise Erreur(403, f"Ton compte ne peut plus envoyer d'avis ni voter ({texte_fin(s['fin'])}). Motif : {s['motif']}")


def lire_reglage(db, cle):
    l = db.execute('SELECT valeur FROM reglages_jeu WHERE cle=?', (cle,)).fetchone()
    try:
        return json.loads(l['valeur']) if l else None
    except ValueError:
        return None


def ecrire_reglage(db, cle, valeur):
    db.execute('INSERT OR REPLACE INTO reglages_jeu(cle, valeur, maj_le) VALUES (?,?,?)', (cle, json.dumps(valeur, ensure_ascii=False), maintenant()))


EXPEDITEUR_DEFAUT = "L'équipe NATX ROYALE"


def contenu_cadeau(l):
    try:
        objets = json.loads(l['objets'] or '[]')
    except ValueError:
        objets = []
    cles = l.keys()
    esprit = None
    if 'esprit' in cles and l['esprit']:
        try:
            esprit = json.loads(l['esprit'])
        except ValueError:
            esprit = None
    return {'id': l['id'], 'titre': l['titre'], 'message': l['message'] or '', 'pieces': l['pieces'], 'objets': objets,
            'expediteur': (l['expediteur'] if 'expediteur' in cles else None) or EXPEDITEUR_DEFAUT,
            'origine': (l['origine'] if 'origine' in cles else None) or 'admin', 'esprit': esprit}


def limite(db, cle, maxi, fenetre):
    """Pas plus de « maxi » actions par « fenetre » secondes pour cette clé."""
    t = maintenant()
    ligne = db.execute('SELECT debut, compte FROM limites WHERE cle=?', (cle,)).fetchone()
    if not ligne or t - ligne['debut'] >= fenetre:
        db.execute('INSERT OR REPLACE INTO limites(cle, debut, compte) VALUES (?,?,1)', (cle, t))
        return True
    if ligne['compte'] >= maxi:
        return False
    db.execute('UPDATE limites SET compte = compte + 1 WHERE cle=?', (cle,))
    return True


class Erreur(Exception):
    def __init__(self, code, message):
        super().__init__(message)
        self.code, self.message = code, message


# ---------------------------------------------------------------- requête / réponse
class Requete:
    def __init__(self, environ):
        self.environ = environ
        self.methode = environ.get('REQUEST_METHOD', 'GET').upper()
        self.chemin = environ.get('PATH_INFO', '/') or '/'
        # le site peut être monté sous un chemin (ex. /natx) : l'hébergeur le retire (SCRIPT_NAME) ou pas
        self.base = (environ.get('SCRIPT_NAME') or '').rstrip('/') or PREFIXE
        if PREFIXE and (self.chemin == PREFIXE or self.chemin.startswith(PREFIXE + '/')):
            self.chemin = self.chemin[len(PREFIXE):] or '/'
        self.query = {k: v[0] for k, v in parse_qs(environ.get('QUERY_STRING', '')).items()}
        self.origine = (environ.get('HTTP_ORIGIN') or '').rstrip('/')
        ip = environ.get('REMOTE_ADDR', '')
        if DERRIERE_PROXY and environ.get('HTTP_X_FORWARDED_FOR'):
            ip = environ['HTTP_X_FORWARDED_FOR'].split(',')[-1].strip()
        self.ip_hash = hacher_ip(ip)
        self._corps = None

    def json(self, maxi=16384):
        if self._corps is not None:
            return self._corps
        try:
            n = int(self.environ.get('CONTENT_LENGTH') or 0)
        except ValueError:
            n = 0
        if n > maxi:
            raise Erreur(413, 'Message trop long.')
        brut = self.environ['wsgi.input'].read(n) if n else b''
        try:
            self._corps = json.loads(brut.decode('utf-8')) if brut else {}
        except (ValueError, UnicodeDecodeError):
            raise Erreur(400, 'Données illisibles.')
        if not isinstance(self._corps, dict):
            raise Erreur(400, 'Données illisibles.')
        return self._corps

    def cookie(self, nom):
        for morceau in (self.environ.get('HTTP_COOKIE') or '').split(';'):
            k, _, v = morceau.strip().partition('=')
            if k == nom:
                return v
        return None

    def entete(self, nom):
        return self.environ.get('HTTP_' + nom.upper().replace('-', '_'))


def entetes_securite(statique=False):
    h = [('X-Content-Type-Options', 'nosniff'), ('Referrer-Policy', 'no-referrer'),
         ('X-Frame-Options', 'DENY'), ('Cache-Control', 'no-store')]
    if statique:
        h.append(('Content-Security-Policy', "default-src 'self'; img-src 'self' data:; style-src 'self' https://fonts.googleapis.com; "
                  "font-src https://fonts.gstatic.com; script-src 'self'; connect-src 'self'; frame-ancestors 'none'; base-uri 'none'; form-action 'self'"))
    return h


def reponse_json(code, donnees, extra=()):
    corps = json.dumps(donnees, ensure_ascii=False).encode('utf-8')
    return code, [('Content-Type', 'application/json; charset=utf-8'), ('Content-Length', str(len(corps)))] + entetes_securite() + list(extra), [corps]


def entetes_cors(req):
    if req.origine and req.origine in ORIGINES:
        return [('Access-Control-Allow-Origin', req.origine), ('Vary', 'Origin'),
                ('Access-Control-Allow-Methods', 'GET, POST, DELETE, OPTIONS'),
                ('Access-Control-Allow-Headers', 'Content-Type, X-Joueur'), ('Access-Control-Max-Age', '600')]
    return []


# ---------------------------------------------------------------- API publique (le jeu)
def api_sante(req, db):
    return 200, {'ok': True, 'version': VERSION_API, 'categories': CATEGORIES}


def api_nouveau_joueur(req, db):
    """Identité anonyme : un id au hasard + une signature (pour les votes et les retours)."""
    if not limite(db, 'joueur:ip:' + req.ip_hash, 10, 3600):
        raise Erreur(429, 'Trop de demandes, réessaie plus tard.')
    id_ = secrets.token_hex(12)
    db.execute('INSERT INTO joueurs(id, cree_le, ip_hash) VALUES (?,?,?)', (id_, maintenant(), req.ip_hash))
    return 201, {'id': id_, 'jeton': id_ + '.' + signer_joueur(id_)}


def joueur_obligatoire(req, d):
    jid = joueur_du_jeton(d.get('jeton') or req.entete('X-Joueur'))
    if not jid:
        raise Erreur(401, 'Identifiant de joueur invalide.')
    return jid


def api_partie(req, db):
    """Une partie jouée (pour le tableau de bord). Anonyme."""
    d = req.json()
    jid = joueur_obligatoire(req, d)
    pid = str(d.get('partie_id') or '')
    if not re.fullmatch(r'[0-9a-z]{8,32}', pid):
        raise Erreur(400, 'Identifiant de partie invalide.')
    if not limite(db, 'partie:' + jid, 40, 3600):
        raise Erreur(429, 'Trop de parties envoyées.')
    def entier(k, mini, maxi):
        try:
            return max(mini, min(maxi, int(d.get(k) or 0)))
        except (TypeError, ValueError):
            return 0
    mode = d.get('mode') if d.get('mode') in MODES else 'solo'
    joueur_vu(db, jid)
    db.execute('INSERT OR IGNORE INTO parties(partie_id, joueur_id, cree_le, mode, nb_joueurs, place, kills, duree) VALUES (?,?,?,?,?,?,?,?)',
               (pid, jid, maintenant(), mode, entier('nb_joueurs', 1, 64), entier('place', 0, 64), entier('kills', 0, 200), entier('duree', 0, 7200)))
    return 201, {'ok': True}


def api_retour(req, db):
    """Un avis envoyé depuis l'écran de fin de partie (ou le menu)."""
    d = req.json()
    jid = joueur_obligatoire(req, d)
    pas_bloque(db, jid)
    categorie = d.get('categorie')
    if categorie not in CATEGORIES:
        raise Erreur(400, 'Choisis une catégorie.')
    texte = nettoyer(d.get('texte'), 1000)
    note = d.get('note')
    if note is not None:
        try:
            note = int(note)
        except (TypeError, ValueError):
            raise Erreur(400, 'Note invalide.')
        if not 1 <= note <= 5:
            raise Erreur(400, 'La note va de 1 à 5 étoiles.')
    if len(texte) < 3 and note is None:
        raise Erreur(400, 'Écris quelques mots ou donne une note.')
    pid = str(d.get('partie_id') or '')
    pid = pid if re.fullmatch(r'[0-9a-z]{8,32}', pid) else None
    if not limite(db, 'retour:' + jid, 6, 600) or not limite(db, 'retour:ip:' + req.ip_hash, 25, 86400):
        raise Erreur(429, 'Tu as déjà envoyé beaucoup d\'avis. Merci ! Réessaie un peu plus tard.')
    # même texte déjà envoyé aujourd'hui par ce joueur : on ne le garde pas deux fois
    if texte and db.execute('SELECT 1 FROM retours WHERE joueur_id=? AND texte=? AND cree_le>?', (jid, texte, maintenant() - 86400)).fetchone():
        return 200, {'ok': True, 'doublon': True}
    # pièges à robots : champ caché rempli, ou formulaire rempli en moins d'une seconde
    spam = 1 if (d.get('site') or (isinstance(d.get('duree_saisie'), (int, float)) and d['duree_saisie'] < 1000)) else 0
    if len(re.findall(r'https?://|www\.', texte, re.I)) >= 2:
        spam = 1
    cur = db.execute('INSERT INTO retours(partie_id, joueur_id, cree_le, note, categorie, texte, ip_hash, plateforme, version_jeu, spam) VALUES (?,?,?,?,?,?,?,?,?,?)',
                     (pid, jid, maintenant(), note, categorie, texte, req.ip_hash, nettoyer(d.get('plateforme'), 20), nettoyer(d.get('version'), 20), spam))
    return 201, {'ok': True, 'id': cur.lastrowid}


def api_suggestions(req, db):
    """Suggestions publiées par l'admin (jamais les notes internes ni qui les a écrites)."""
    jid = joueur_du_jeton(req.entete('X-Joueur'))
    tri = 'votes DESC, r.cree_le DESC' if req.query.get('tri') != 'recentes' else 'r.cree_le DESC'
    lignes = db.execute(f"""SELECT r.id, r.categorie, r.statut, COALESCE(r.texte_public, r.texte) AS texte, r.cree_le,
        (SELECT COUNT(*) FROM votes v WHERE v.retour_id = r.id) AS votes,
        (SELECT COUNT(*) FROM votes v WHERE v.retour_id = r.id AND v.joueur_id = ?) AS a_vote
        FROM retours r WHERE r.public = 1 AND r.spam = 0 ORDER BY {tri} LIMIT 100""", (jid or '',)).fetchall()
    return 200, {'suggestions': [dict(l) for l in lignes]}


def api_vote(req, db, rid, enlever=False):
    d = req.json() if req.methode == 'POST' else {}
    jid = joueur_obligatoire(req, d)
    if not db.execute('SELECT 1 FROM retours WHERE id=? AND public=1 AND spam=0', (rid,)).fetchone():
        raise Erreur(404, 'Suggestion introuvable.')
    if enlever:
        db.execute('DELETE FROM votes WHERE retour_id=? AND joueur_id=?', (rid, jid))
    else:
        pas_bloque(db, jid)
        if not limite(db, 'vote:' + jid, 40, 3600) or not limite(db, 'vote:ip:' + req.ip_hash, 150, 3600):
            raise Erreur(429, 'Trop de votes d\'un coup, réessaie plus tard.')
        # protection : pas plus de 3 votes depuis la même connexion pour une même idée
        n = db.execute('SELECT COUNT(*) FROM votes WHERE retour_id=? AND ip_hash=?', (rid, req.ip_hash)).fetchone()[0]
        if n >= 3 and not db.execute('SELECT 1 FROM votes WHERE retour_id=? AND joueur_id=?', (rid, jid)).fetchone():
            raise Erreur(429, 'Trop de votes depuis cette connexion pour cette idée.')
        db.execute('INSERT OR IGNORE INTO votes(retour_id, joueur_id, cree_le, ip_hash) VALUES (?,?,?,?)', (rid, jid, maintenant(), req.ip_hash))
    total = db.execute('SELECT COUNT(*) FROM votes WHERE retour_id=?', (rid,)).fetchone()[0]
    return 200, {'ok': True, 'votes': total, 'a_vote': 0 if enlever else 1}


def etat_jeu(db):
    """Ce que le menu du jeu affiche : l'annonce de l'admin et le bonus de pièces en cours."""
    a = lire_reglage(db, 'annonce') or {}
    b = lire_reglage(db, 'bonus') or {}
    annonce = {'texte': a['texte'], 'style': a.get('style', 'info')} if a.get('active') and a.get('texte') else None
    bonus = None
    if b.get('multiplicateur', 1) > 1 and b.get('fin', 0) > maintenant():
        bonus = {'multiplicateur': b['multiplicateur'], 'fin': b['fin'], 'texte': b.get('texte') or 'Bonus de pièces'}
    return {'annonce': annonce, 'bonus': bonus}


def api_jeu(req, db):
    return 200, etat_jeu(db)


# Relais TURN : pour jouer entre potes en 4G ou derrière une box stricte. La clé reste ici, sur le serveur ;
# le jeu ne reçoit que des accès temporaires. À régler dans le panneau de l'hébergeur (jamais dans Git).
# Trois réglages possibles, le premier trouvé est utilisé :
#   Metered (compte gratuit sans carte bancaire) : NATX_TURN_APP (nom de l'appli Metered) + NATX_TURN_JETON (sa « Secret Key »)
#   Relais à identifiants fixes                  : NATX_TURN_URLS (séparées par des virgules) + NATX_TURN_UTILISATEUR + NATX_TURN_MDP
#   Cloudflare Realtime (demande une carte)      : NATX_TURN_CLE_ID + NATX_TURN_JETON
TURN_API = os.environ.get('NATX_TURN_API', 'https://rtc.live.cloudflare.com/v1/turn/keys')
TURN_API_METERED = os.environ.get('NATX_TURN_API_METERED', 'https://{app}.metered.live/api/v1/turn')
DUREE_RELAIS = 12 * 3600
# un accès Metered tout neuf met jusqu'à 2 minutes à marcher partout : on le prépare à l'avance et on attend avant de le donner
ATTENTE_RELAIS = {'metered': 150}
_relais = {'serveurs': None, 'fin': 0, 'suivants': None, 'suivants_le': 0, 'suivants_fin': 0, 'echec_le': 0}
_verrou_relais = threading.Lock()


def nettoyer_relais(brut):
    liste = brut if isinstance(brut, list) else [brut] if isinstance(brut, dict) else []
    propres = []
    for s in liste:
        if not isinstance(s, dict):
            continue
        urls = s.get('urls')
        urls = [urls] if isinstance(urls, str) else urls if isinstance(urls, list) else []
        urls = [u for u in urls if isinstance(u, str) and re.match(r'^(stun|turns?):', u)][:8]
        if not urls:
            continue
        e = {'urls': urls}
        if isinstance(s.get('username'), str) and isinstance(s.get('credential'), str) and s['username'] and s['credential']:
            e['username'], e['credential'] = s['username'][:200], s['credential'][:200]
        propres.append(e)
    return propres[:12]


def fournisseur_relais():
    """Quel relais est réglé : 'metered', 'fixe', 'cloudflare' ou None."""
    e = os.environ
    if e.get('NATX_TURN_APP') and e.get('NATX_TURN_JETON'):
        return 'metered'
    if e.get('NATX_TURN_URLS') and e.get('NATX_TURN_UTILISATEUR') and e.get('NATX_TURN_MDP'):
        return 'fixe'
    if e.get('NATX_TURN_CLE_ID') and e.get('NATX_TURN_JETON'):
        return 'cloudflare'
    return None


def appel_json(url, methode='GET', corps=None, entetes=None):
    """Petit appel HTTPS vers le fournisseur du relais (remplacé par un faux dans les tests)."""
    import urllib.request
    demande = urllib.request.Request(url, data=json.dumps(corps).encode() if corps is not None else None,
                                     headers={'Content-Type': 'application/json', **(entetes or {})}, method=methode)
    with urllib.request.urlopen(demande, timeout=6) as r:
        return json.loads(r.read().decode('utf-8'))


def acces_relais(fournisseur):
    """Demande au fournisseur des accès valables DUREE_RELAIS secondes → liste propre de serveurs (jamais la clé)."""
    jeton = os.environ.get('NATX_TURN_JETON', '')
    if fournisseur == 'metered':
        app = os.environ.get('NATX_TURN_APP', '').strip().lower()
        if not re.fullmatch(r'[a-z0-9][a-z0-9-]{0,60}', app):
            raise ValueError('NATX_TURN_APP : nom d\'appli Metered invalide')
        base = TURN_API_METERED.format(app=app)
        acces = appel_json(base + '/credential?secretKey=' + quote(jeton, safe=''), 'POST', {'expiryInSeconds': DUREE_RELAIS, 'label': 'natx-royale'})
        cle = acces.get('apiKey') if isinstance(acces, dict) else None
        if not isinstance(cle, str) or not cle:
            raise ValueError('Metered : pas de clé d\'accès dans la réponse')
        serveurs = nettoyer_relais(appel_json(base + '/credentials?apiKey=' + quote(cle, safe='')))
    else:
        d = appel_json(f"{TURN_API}/{os.environ.get('NATX_TURN_CLE_ID', '')}/credentials/generate-ice-servers", 'POST', {'ttl': DUREE_RELAIS},
                       {'Authorization': 'Bearer ' + jeton})
        serveurs = nettoyer_relais(d.get('iceServers') if isinstance(d, dict) else None)
    if not any('username' in x for x in serveurs):
        raise ValueError('le fournisseur n\'a renvoyé aucun relais utilisable')
    return serveurs


def serveurs_relais():
    f = fournisseur_relais()
    if not f:
        return None
    if f == 'fixe':  # identifiants fixes : rien à demander (ils sont alors visibles par les joueurs, c'est inévitable)
        urls = [u.strip() for u in os.environ.get('NATX_TURN_URLS', '').split(',') if u.strip()]
        return nettoyer_relais([{'urls': urls, 'username': os.environ.get('NATX_TURN_UTILISATEUR', ''), 'credential': os.environ.get('NATX_TURN_MDP', '')}])
    t = maintenant()
    with _verrou_relais:
        r = _relais
        valables = lambda: r['serveurs'] if r['serveurs'] is not None and r['fin'] > t else None
        # l'accès préparé à l'avance devient l'accès courant quand il a eu le temps de marcher partout
        if r['suivants'] is not None and t - r['suivants_le'] >= ATTENTE_RELAIS.get(f, 0):
            r['serveurs'], r['fin'], r['suivants'] = r['suivants'], r['suivants_fin'], None
        if r['serveurs'] is not None and r['fin'] - t > 2 * 3600:
            return r['serveurs']
        if r['suivants'] is not None:
            return valables() or r['suivants']
        if t - r['echec_le'] < 60:  # le fournisseur vient de refuser : on ne le rappelle pas à chaque joueur
            return valables() or []
        try:
            nouveaux = acces_relais(f)
        except Exception as e:  # le jeu se débrouillera sans relais (on n'écrit jamais l'adresse appelée : elle contient la clé)
            print('Relais TURN indisponible :', type(e).__name__, getattr(e, 'code', ''), file=sys.stderr)
            r['echec_le'] = t
            return valables() or []
        if valables() and ATTENTE_RELAIS.get(f):
            r['suivants'], r['suivants_le'], r['suivants_fin'] = nouveaux, t, t + DUREE_RELAIS
        else:
            r['serveurs'], r['fin'] = nouveaux, t + DUREE_RELAIS
        return r['serveurs']


def api_relais(req, db):
    if not limite(db, 'relais:ip:' + req.ip_hash, 60, 3600):
        raise Erreur(429, 'Trop de demandes.')
    s = serveurs_relais()
    return 200, {'iceServers': s or [], 'configure': s is not None}


def api_cadeaux(req, db):
    """Les cadeaux qui attendent ce joueur (pour tout le monde ou rien que pour lui). Chacun n'est donné qu'une fois."""
    jid = joueur_obligatoire(req, req.json())
    if not limite(db, 'cadeaux:' + jid, 30, 3600):
        raise Erreur(429, 'Trop de demandes, réessaie plus tard.')
    joueur_vu(db, jid)
    l = db.execute('SELECT bloque FROM joueurs WHERE id=?', (jid,)).fetchone()
    if (l and l['bloque']) or sanction_active(db, jid, ('cadeaux', 'suspension')):
        return 200, {'cadeaux': []}
    t = maintenant()
    lignes = db.execute("""SELECT * FROM cadeaux c WHERE c.actif=1 AND (c.expire_le IS NULL OR c.expire_le > ?)
        AND (c.cible='tous' OR (c.cible='joueur' AND c.joueur_id=?))
        AND NOT EXISTS (SELECT 1 FROM cadeaux_recus r WHERE r.cadeau_id=c.id AND r.joueur_id=?) ORDER BY c.id LIMIT 20""", (t, jid, jid)).fetchall()
    donnes = []
    for l in lignes:
        # INSERT OR IGNORE : si le jeu est ouvert deux fois en même temps, le cadeau n'est donné qu'une fois
        if db.execute('INSERT OR IGNORE INTO cadeaux_recus(cadeau_id, joueur_id, recu_le, ouvert_le) VALUES (?,?,?,?)', (l['id'], jid, t, t)).rowcount:
            donnes.append(contenu_cadeau(l))
    return 200, {'cadeaux': donnes}


def api_code_cadeau(req, db):
    """Un code cadeau tapé dans la boutique du jeu."""
    d = req.json()
    jid = joueur_obligatoire(req, d)
    pas_bloque(db, jid)
    s = sanction_active(db, jid, ('cadeaux',))
    if s:
        raise Erreur(403, f"Ton compte ne peut plus recevoir de cadeaux ({texte_fin(s['fin'])}).")
    # contre ceux qui essaient des codes au hasard
    if not limite(db, 'code:' + jid, 8, 600) or not limite(db, 'code:ip:' + req.ip_hash, 20, 600):
        raise Erreur(429, 'Trop d\'essais. Attends 10 minutes.')
    code = normaliser_code(d.get('code'))
    if len(code) < 4:
        raise Erreur(400, 'Tape un code cadeau.')
    db.execute('BEGIN IMMEDIATE')
    try:
        l = db.execute("SELECT * FROM cadeaux WHERE code=? AND cible='code' AND actif=1 AND (expire_le IS NULL OR expire_le > ?)", (code, maintenant())).fetchone()
        if not l:
            raise Erreur(404, 'Code inconnu ou expiré.')
        if db.execute('SELECT 1 FROM cadeaux_recus WHERE cadeau_id=? AND joueur_id=?', (l['id'], jid)).fetchone():
            raise Erreur(409, 'Tu as déjà utilisé ce code !')
        if l['max_utilisations'] and db.execute('SELECT COUNT(*) FROM cadeaux_recus WHERE cadeau_id=?', (l['id'],)).fetchone()[0] >= l['max_utilisations']:
            raise Erreur(410, 'Ce code a déjà été utilisé le nombre de fois prévu.')
        t = maintenant()
        db.execute('INSERT INTO cadeaux_recus(cadeau_id, joueur_id, recu_le, ouvert_le) VALUES (?,?,?,?)', (l['id'], jid, t, t))
        db.execute('COMMIT')
    except BaseException:
        db.execute('ROLLBACK')
        raise
    joueur_vu(db, jid)
    return 200, {'cadeau': contenu_cadeau(l)}


# ---------------------------------------------------------------- espace admin
ROLES = {
    'super_admin': 'Super administrateur', 'admin': 'Administrateur', 'moderateur': 'Modérateur',
    'boutique': 'Gestionnaire de boutique', 'evenements': "Gestionnaire d'événements",
}
_TOUS = set(ROLES)
_S, _A, _M, _B, _E = 'super_admin', 'admin', 'moderateur', 'boutique', 'evenements'
PERMISSIONS = {
    'tableau': _TOUS,
    'retours': {_S, _A, _M},
    'joueurs.voir': {_S, _A, _M},
    'joueurs.sanctionner': {_S, _A, _M},
    'joueurs.compte': {_S, _A},  # nouveau code de sauvegarde d'un joueur = accès à son compte
    'signalements': {_S, _A, _M},
    'cadeaux.voir': {_S, _A, _B},
    'cadeaux.creer': {_S, _A, _B},
    'cadeaux.reparer': {_S, _A},
    'cadeaux.supprimer': {_S, _A},
    'cosmetiques.voir': {_S, _A, _B, _E},
    'cosmetiques.modifier': {_S, _A, _B},
    'boutique.modifier': {_S, _A, _B},
    'annonce': {_S, _A, _E},
    'esprits.voir': {_S, _A, _E},
    'esprits.modifier': {_S, _A, _E},
    'evenements.voir': {_S, _A, _E},
    'evenements.modifier': {_S, _A, _E},
    'journal': {_S, _A},
    'robot.regler': {_S, _A},  # robot modérateur : marche/arrêt, heure, droit de suspendre
    'admins.voir': {_S, _A},
    'admins.gerer': {_S},
    'sauvegardes.voir': {_S, _A},
    'sauvegardes.creer': {_S, _A},
    'sauvegardes.restaurer': {_S},
    'serveur': {_S, _A},
}
INACTIVITE_SESSION = 2 * 3600  # sans rien faire pendant 2 h : déconnecté


def permissions_de(role):
    return sorted(p for p, roles in PERMISSIONS.items() if role in roles)


def session_admin(req, db, ecriture=False, permission=None, libre=False):
    """Vérifie la session ET le droit demandé (permission = nom ou tuple de noms : un seul suffit)."""
    jeton = req.cookie('natx_admin')
    if not jeton:
        raise Erreur(401, 'Connexion nécessaire.')
    h = hashlib.sha256(jeton.encode()).hexdigest()
    s = db.execute("""SELECT s.jeton_hash, s.admin_id, s.csrf, s.expire_le, s.vu_le, a.identifiant, a.role, a.actif, a.doit_changer_mdp
        FROM sessions s JOIN admins a ON a.id = s.admin_id WHERE s.jeton_hash=?""", (h,)).fetchone()
    t = maintenant()
    if not s or s['expire_le'] < t or (s['vu_le'] and t - s['vu_le'] > INACTIVITE_SESSION) or not s['actif']:
        if s:
            db.execute('DELETE FROM sessions WHERE jeton_hash=?', (h,))
        raise Erreur(401, 'Session expirée, reconnecte-toi.')
    if s['role'] not in ROLES:
        raise Erreur(403, 'Accès refusé.')
    if ecriture and not hmac.compare_digest(req.entete('X-CSRF') or '', s['csrf']):
        raise Erreur(403, 'Requête refusée (jeton de sécurité manquant).')
    if s['doit_changer_mdp'] and not libre:
        raise Erreur(403, 'Change d\'abord ton mot de passe provisoire (menu « Mon compte »).')
    if permission:
        demandees = (permission,) if isinstance(permission, str) else permission
        if not any(s['role'] in PERMISSIONS[p] for p in demandees):
            raise Erreur(403, f"Ton rôle ({ROLES[s['role']]}) ne permet pas de faire ça.")
    if not s['vu_le'] or t - s['vu_le'] >= 60:
        db.execute('UPDATE sessions SET vu_le=? WHERE jeton_hash=?', (t, h))
    return s


def journaliser(db, s, action, categorie='', cible=None, details=None, retour_id=None, req=None):
    """Journal d'audit : qui a fait quoi, quand, sur quoi (et avant / après quand c'est utile)."""
    db.execute('INSERT INTO journal(admin_id, action, retour_id, cree_le, categorie, cible, details, ip_hash) VALUES (?,?,?,?,?,?,?,?)',
               (s['admin_id'] if s else None, action[:300], retour_id, maintenant(), categorie, cible,
                json.dumps(details, ensure_ascii=False)[:4000] if details is not None else None, req.ip_hash if req else None))


def exiger_confirmation(d, mot='CONFIRMER'):
    if str(d.get('confirmation') or '').strip().upper() != mot.upper():
        raise Erreur(428, f'Action sensible : tape « {mot} » pour confirmer.')


def exiger_mdp(db, s, d):
    """Pour les actions les plus graves, on redemande le mot de passe de l'admin connecté."""
    a = db.execute('SELECT hash_mdp FROM admins WHERE id=?', (s['admin_id'],)).fetchone()
    mdp = d.get('mot_de_passe') if isinstance(d.get('mot_de_passe'), str) else ''
    if not a or not verifier_mdp(mdp, a['hash_mdp']):
        raise Erreur(403, 'Mot de passe incorrect.')


def cookie_session(req, valeur, age):
    # le cookie ne sert que pour ce site (pas pour les autres applis du même domaine)
    c = f'natx_admin={valeur}; Path={req.base or ""}/; HttpOnly; SameSite=Strict; Max-Age={age}'
    return ('Set-Cookie', c + ('; Secure' if COOKIE_SECURE else ''))


def admin_connexion(req, db):
    global _HASH_FACTICE
    d = req.json()
    ident = nettoyer(d.get('identifiant'), 60).lower()
    mdp = d.get('mot_de_passe') if isinstance(d.get('mot_de_passe'), str) else ''
    if not limite(db, 'login:ip:' + req.ip_hash, 8, 900) or not limite(db, 'login:id:' + hashlib.sha256(ident.encode()).hexdigest()[:16], 8, 900):
        raise Erreur(429, 'Trop d\'essais. Attends 15 minutes.')
    a = db.execute('SELECT id, hash_mdp, actif, doit_changer_mdp FROM admins WHERE identifiant=?', (ident,)).fetchone()
    if not _HASH_FACTICE:
        _HASH_FACTICE = hacher_mdp(secrets.token_hex(8))
    ok = verifier_mdp(mdp, a['hash_mdp'] if a else _HASH_FACTICE) and a is not None  # même durée si l'identifiant n'existe pas
    t = maintenant()
    navigateur = nettoyer(req.environ.get('HTTP_USER_AGENT'), 160)
    db.execute('INSERT INTO connexions_admin(admin_id, identifiant, ok, ip_hash, navigateur, cree_le) VALUES (?,?,?,?,?,?)',
               (a['id'] if a else None, ident[:60], 1 if ok and a['actif'] else 0, req.ip_hash, navigateur, t))
    if not ok:
        raise Erreur(401, 'Identifiant ou mot de passe incorrect.')
    if not a['actif']:
        raise Erreur(403, 'Ce compte administrateur est désactivé.')
    jeton, csrf = secrets.token_urlsafe(32), secrets.token_urlsafe(24)
    db.execute('DELETE FROM sessions WHERE expire_le < ? OR vu_le < ?', (t, t - INACTIVITE_SESSION))
    db.execute('INSERT INTO sessions(jeton_hash, admin_id, csrf, cree_le, expire_le, ip_hash, navigateur, vu_le) VALUES (?,?,?,?,?,?,?,?)',
               (hashlib.sha256(jeton.encode()).hexdigest(), a['id'], csrf, t, t + DUREE_SESSION, req.ip_hash, navigateur, t))
    db.execute('UPDATE admins SET derniere_connexion=? WHERE id=?', (t, a['id']))
    db.execute('INSERT INTO journal(admin_id, action, cree_le, categorie, ip_hash) VALUES (?,?,?,?,?)', (a['id'], 'connexion', t, 'connexion', req.ip_hash))
    return 200, {'ok': True, 'csrf': csrf, 'identifiant': ident, 'doit_changer_mdp': bool(a['doit_changer_mdp'])}, [cookie_session(req, jeton, DUREE_SESSION)]


def admin_deconnexion(req, db):
    jeton = req.cookie('natx_admin')
    if jeton:
        db.execute('DELETE FROM sessions WHERE jeton_hash=?', (hashlib.sha256(jeton.encode()).hexdigest(),))
    return 200, {'ok': True}, [cookie_session(req, '', 0)]


def admin_moi(req, db):
    s = session_admin(req, db, libre=True)
    return 200, {'identifiant': s['identifiant'], 'csrf': s['csrf'], 'categories': CATEGORIES, 'statuts': STATUTS,
                 'role': s['role'], 'role_nom': ROLES[s['role']], 'roles': ROLES, 'permissions': permissions_de(s['role']),
                 'doit_changer_mdp': bool(s['doit_changer_mdp']), 'types_sanctions': TYPES_SANCTIONS}


def admin_tableau(req, db):
    session_admin(req, db, permission='tableau')
    un = lambda sql, *p: db.execute(sql, p).fetchone()[0]
    stats = {
        'parties': un('SELECT COUNT(DISTINCT partie_id) FROM parties'),
        'parties_joueurs': un('SELECT COUNT(*) FROM parties'),
        'retours': un('SELECT COUNT(*) FROM retours WHERE spam=0'),
        'bugs': un("SELECT COUNT(*) FROM retours WHERE spam=0 AND categorie IN ('bug','collision')"),
        'idees': un("SELECT COUNT(*) FROM retours WHERE spam=0 AND categorie IN ('idee','contenu')"),
        'acceptees': un("SELECT COUNT(*) FROM retours WHERE spam=0 AND statut='accepte'"),
        'en_cours': un("SELECT COUNT(*) FROM retours WHERE spam=0 AND statut='en_cours'"),
        'nouveaux': un("SELECT COUNT(*) FROM retours WHERE spam=0 AND statut='nouveau'"),
        'publiees': un('SELECT COUNT(*) FROM retours WHERE spam=0 AND public=1'),
        'spams': un('SELECT COUNT(*) FROM retours WHERE spam=1'),
        'votes': un('SELECT COUNT(*) FROM votes'),
        'joueurs': un('SELECT COUNT(*) FROM joueurs'),
        'actifs_7j': un('SELECT COUNT(*) FROM joueurs WHERE COALESCE(vu_le, cree_le) > ?', maintenant() - 7 * 86400),
        'cadeaux_recus': un('SELECT COUNT(*) FROM cadeaux_recus'),
        'note_moyenne': db.execute('SELECT ROUND(AVG(note), 2) FROM retours WHERE spam=0 AND note IS NOT NULL').fetchone()[0],
    }
    par_cat = {r['categorie']: r['n'] for r in db.execute('SELECT categorie, COUNT(*) AS n FROM retours WHERE spam=0 GROUP BY categorie')}
    populaires = [dict(r) for r in db.execute("""SELECT r.id, r.categorie, r.statut, COALESCE(r.texte_public, r.texte) AS texte,
        (SELECT COUNT(*) FROM votes v WHERE v.retour_id = r.id) AS votes FROM retours r
        WHERE r.public=1 AND r.spam=0 ORDER BY votes DESC, r.cree_le DESC LIMIT 6""")]
    jours = [dict(r) for r in db.execute("""SELECT date(cree_le, 'unixepoch') AS jour, COUNT(*) AS n FROM retours
        WHERE spam=0 AND cree_le > ? GROUP BY jour ORDER BY jour""", (maintenant() - 14 * 86400,))]
    return 200, {'stats': stats, 'par_categorie': par_cat, 'populaires': populaires, 'jours': jours}


def admin_liste(req, db):
    session_admin(req, db, permission='retours')
    q = req.query
    conds, params = [], []
    if q.get('categorie') in CATEGORIES:
        conds.append('r.categorie = ?'); params.append(q['categorie'])
    if q.get('groupe') == 'bugs':
        conds.append("r.categorie IN ('bug','collision')")
    elif q.get('groupe') == 'idees':
        conds.append("r.categorie NOT IN ('bug','collision')")
    if q.get('statut') in STATUTS:
        conds.append('r.statut = ?'); params.append(q['statut'])
    if q.get('public') in ('0', '1'):
        conds.append('r.public = ?'); params.append(int(q['public']))
    conds.append('r.spam = ?'); params.append(1 if q.get('spam') == '1' else 0)
    recherche = nettoyer(q.get('q'), 80)
    if recherche:
        conds.append("(r.texte LIKE ? ESCAPE '\\' OR r.texte_public LIKE ? ESCAPE '\\' OR CAST(r.id AS TEXT) = ?)")
        motif = '%' + recherche.replace('\\', '\\\\').replace('%', '\\%').replace('_', '\\_') + '%'
        params += [motif, motif, recherche]
    tri = {'ancien': 'r.cree_le ASC', 'votes': 'votes DESC, r.cree_le DESC', 'note': 'r.note DESC NULLS LAST, r.cree_le DESC'}.get(q.get('tri'), 'r.cree_le DESC')
    try:
        page = max(0, int(q.get('page') or 0))
    except ValueError:
        page = 0
    where = ' AND '.join(conds)
    total = db.execute(f'SELECT COUNT(*) FROM retours r WHERE {where}', params).fetchone()[0]
    lignes = db.execute(f"""SELECT r.id, r.partie_id, r.cree_le, r.note, r.categorie, r.texte, r.statut, r.public, r.texte_public, r.spam,
        r.plateforme, r.version_jeu, (SELECT COUNT(*) FROM votes v WHERE v.retour_id = r.id) AS votes,
        (SELECT COUNT(*) FROM notes_internes n WHERE n.retour_id = r.id) AS nb_notes
        FROM retours r WHERE {where} ORDER BY {tri} LIMIT 50 OFFSET ?""", params + [page * 50]).fetchall()
    return 200, {'total': total, 'page': page, 'retours': [dict(l) for l in lignes]}


def retour_existant(db, rid):
    r = db.execute('SELECT * FROM retours WHERE id=?', (rid,)).fetchone()
    if not r:
        raise Erreur(404, 'Retour introuvable.')
    return r


def admin_detail(req, db, rid):
    session_admin(req, db, permission='retours')
    r = dict(retour_existant(db, rid))
    r.pop('ip_hash', None)
    r['votes'] = db.execute('SELECT COUNT(*) FROM votes WHERE retour_id=?', (rid,)).fetchone()[0]
    r['notes'] = [dict(n) for n in db.execute("""SELECT n.id, n.cree_le, n.texte, a.identifiant AS auteur FROM notes_internes n
        LEFT JOIN admins a ON a.id = n.admin_id WHERE n.retour_id=? ORDER BY n.cree_le""", (rid,))]
    r['journal'] = [dict(j) for j in db.execute("""SELECT j.action, j.cree_le, a.identifiant AS auteur FROM journal j
        LEFT JOIN admins a ON a.id = j.admin_id WHERE j.retour_id=? ORDER BY j.cree_le DESC LIMIT 20""", (rid,))]
    r['autres_du_joueur'] = db.execute('SELECT COUNT(*) FROM retours WHERE joueur_id=? AND id<>?', (r['joueur_id'], rid)).fetchone()[0]
    r['joueur_code'] = code_court(r['joueur_id'])
    r['joueur_qui'] = gestion.qui(db, r['joueur_id'])
    r.pop('joueur_id', None)
    return 200, r


def admin_modifier(req, db, rid):
    s = session_admin(req, db, ecriture=True, permission='retours')
    retour_existant(db, rid)
    d = req.json()
    champs, params, actions = [], [], []
    if 'statut' in d:
        if d['statut'] not in STATUTS:
            raise Erreur(400, 'Statut inconnu.')
        champs.append('statut=?'); params.append(d['statut']); actions.append('statut → ' + d['statut'])
    if 'public' in d:
        champs.append('public=?'); params.append(1 if d['public'] else 0); actions.append('publiée' if d['public'] else 'masquée')
    if 'texte_public' in d:
        tp = nettoyer(d['texte_public'], 300) or None
        champs.append('texte_public=?'); params.append(tp); actions.append('texte public modifié')
    if 'spam' in d:
        champs.append('spam=?'); params.append(1 if d['spam'] else 0); actions.append('marquée spam' if d['spam'] else 'pas un spam')
        if d['spam']:
            champs.append('public=0')
    if not champs:
        raise Erreur(400, 'Rien à modifier.')
    champs.append('maj_le=?'); params.append(maintenant())
    db.execute(f'UPDATE retours SET {", ".join(champs)} WHERE id=?', params + [rid])
    for a in actions:
        journaliser(db, s, a, 'retours', f'retour:{rid}', retour_id=rid, req=req)
    return admin_detail(req, db, rid)


def admin_note(req, db, rid):
    s = session_admin(req, db, ecriture=True, permission='retours')
    retour_existant(db, rid)
    texte = nettoyer(req.json().get('texte'), 2000)
    if len(texte) < 1:
        raise Erreur(400, 'Note vide.')
    db.execute('INSERT INTO notes_internes(retour_id, admin_id, cree_le, texte) VALUES (?,?,?,?)', (rid, s['admin_id'], maintenant(), texte))
    return admin_detail(req, db, rid)


def admin_supprimer(req, db, rid):
    s = session_admin(req, db, ecriture=True, permission='retours')
    retour_existant(db, rid)
    db.execute('DELETE FROM votes WHERE retour_id=?', (rid,))
    db.execute('DELETE FROM notes_internes WHERE retour_id=?', (rid,))
    db.execute('DELETE FROM retours WHERE id=?', (rid,))
    journaliser(db, s, 'supprimée', 'retours', f'retour:{rid}', retour_id=rid, req=req)
    return 200, {'ok': True}


def admin_purger_spams(req, db):
    s = session_admin(req, db, ecriture=True, permission='retours')
    ids = [r[0] for r in db.execute('SELECT id FROM retours WHERE spam=1')]
    for rid in ids:
        db.execute('DELETE FROM votes WHERE retour_id=?', (rid,))
        db.execute('DELETE FROM notes_internes WHERE retour_id=?', (rid,))
    db.execute('DELETE FROM retours WHERE spam=1')
    journaliser(db, s, f'{len(ids)} spams supprimés', 'retours', req=req)
    return 200, {'ok': True, 'supprimes': len(ids)}


def admin_catalogue(req, db):
    session_admin(req, db, permission=('cosmetiques.voir', 'cadeaux.voir', 'evenements.voir'))
    return 200, catalogue()


def admin_cadeaux(req, db):
    session_admin(req, db, permission='cadeaux.voir')
    lignes = db.execute("""SELECT c.*, (SELECT COUNT(*) FROM cadeaux_recus r WHERE r.cadeau_id=c.id) AS recus,
        a.identifiant AS auteur FROM cadeaux c LEFT JOIN admins a ON a.id=c.admin_id ORDER BY c.id DESC LIMIT 200""").fetchall()
    sortie = []
    for l in lignes:
        c = contenu_cadeau(l)
        c.update({'cible': l['cible'], 'joueur_code': code_court(l['joueur_id']), 'code': formater_code(l['code']),
                  'max_utilisations': l['max_utilisations'], 'actif': l['actif'], 'expire_le': l['expire_le'],
                  'cree_le': l['cree_le'], 'recus': l['recus'], 'auteur': l['auteur']})
        sortie.append(c)
    return 200, {'cadeaux': sortie, 'joueurs': db.execute('SELECT COUNT(*) FROM joueurs').fetchone()[0]}


def admin_cadeau_creer(req, db):
    s = session_admin(req, db, ecriture=True, permission='cadeaux.creer')
    d = req.json()
    titre = nettoyer(d.get('titre'), 60)
    if len(titre) < 2:
        raise Erreur(400, 'Donne un nom au cadeau.')
    message = nettoyer(d.get('message'), 200) or None
    try:
        pieces = int(d.get('pieces') or 0)
    except (TypeError, ValueError):
        raise Erreur(400, 'Nombre de pièces invalide.')
    if not 0 <= pieces <= 100000:
        raise Erreur(400, 'Entre 0 et 100 000 pièces.')
    connus = {o['cle'] for o in catalogue()['objets']}
    objets = d.get('objets') or []
    if not isinstance(objets, list) or len(objets) > 1000 or any(not isinstance(o, str) or o not in connus for o in objets):
        raise Erreur(400, 'Objet inconnu dans la liste (catalogue pas à jour ?).')
    objets = list(dict.fromkeys(objets))
    if not pieces and not objets:
        raise Erreur(400, 'Ajoute des pièces ou au moins un objet.')
    cible = d.get('cible')
    if cible not in CIBLES:
        raise Erreur(400, 'Choisis pour qui est le cadeau.')
    joueur_id = code = maxi = None
    if cible == 'joueur':
        joueur_id = joueur_par_code(db, d.get('joueur'))
    if cible == 'code':
        code = normaliser_code(d.get('code'))
        if code and len(code) < 4:
            raise Erreur(400, 'Le code doit faire au moins 4 lettres ou chiffres.')
        if not code:
            code = 'NATX' + ''.join(secrets.choice(ALPHABET_CODE) for _ in range(8))
        if db.execute('SELECT 1 FROM cadeaux WHERE code=?', (code,)).fetchone():
            raise Erreur(409, 'Ce code existe déjà, choisis-en un autre.')
        if d.get('max_utilisations') not in (None, '', 0):
            try:
                maxi = int(d['max_utilisations'])
            except (TypeError, ValueError):
                raise Erreur(400, 'Nombre d\'utilisations invalide.')
            if not 1 <= maxi <= 100000:
                raise Erreur(400, 'Entre 1 et 100 000 utilisations.')
    try:
        jours = int(d.get('duree_jours') or 0)
    except (TypeError, ValueError):
        jours = 0
    expire = maintenant() + jours * 86400 if 0 < jours <= 365 else None
    expediteur = nettoyer(d.get('expediteur'), 40) or EXPEDITEUR_DEFAUT
    cur = db.execute("""INSERT INTO cadeaux(titre, message, pieces, objets, cible, joueur_id, code, max_utilisations, actif, expire_le, cree_le, admin_id, expediteur, origine)
        VALUES (?,?,?,?,?,?,?,?,1,?,?,?,?,'admin')""", (titre, message, pieces, json.dumps(objets), cible, joueur_id, code, maxi, expire, maintenant(), s['admin_id'], expediteur))
    journaliser(db, s, f'cadeau #{cur.lastrowid} créé ({cible})', 'cadeaux', f'cadeau:{cur.lastrowid}',
                {'titre': titre, 'pieces': pieces, 'objets': objets, 'cible': cible, 'expediteur': expediteur}, req=req)
    return 201, {'ok': True, 'id': cur.lastrowid, 'code': formater_code(code)}


def cadeau_existant(db, cid):
    if not db.execute('SELECT 1 FROM cadeaux WHERE id=?', (cid,)).fetchone():
        raise Erreur(404, 'Cadeau introuvable.')


def admin_cadeau_modifier(req, db, cid):
    s = session_admin(req, db, ecriture=True, permission='cadeaux.creer')
    cadeau_existant(db, cid)
    actif = 1 if req.json().get('actif') else 0
    db.execute('UPDATE cadeaux SET actif=? WHERE id=?', (actif, cid))
    journaliser(db, s, f'cadeau #{cid} ' + ('réactivé' if actif else 'arrêté'), 'cadeaux', f'cadeau:{cid}', req=req)
    return 200, {'ok': True, 'actif': actif}


def admin_cadeau_supprimer(req, db, cid):
    s = session_admin(req, db, ecriture=True, permission='cadeaux.supprimer')
    exiger_confirmation(req.json())
    cadeau_existant(db, cid)
    db.execute('DELETE FROM cadeaux_recus WHERE cadeau_id=?', (cid,))
    db.execute('DELETE FROM cadeaux WHERE id=?', (cid,))
    journaliser(db, s, f'cadeau #{cid} supprimé', 'cadeaux', f'cadeau:{cid}', req=req)
    return 200, {'ok': True}


def admin_jeu(req, db):
    session_admin(req, db, permission='annonce')
    return 200, {'annonce': lire_reglage(db, 'annonce') or {}, 'bonus': lire_reglage(db, 'bonus') or {}, 'en_ligne': etat_jeu(db), 'maintenant': maintenant()}


def admin_jeu_modifier(req, db):
    s = session_admin(req, db, ecriture=True, permission='annonce')
    d = req.json()
    if isinstance(d.get('annonce'), dict):
        a = d['annonce']
        texte = nettoyer(a.get('texte'), 200)
        style = a.get('style') if a.get('style') in STYLES_ANNONCE else 'info'
        ecrire_reglage(db, 'annonce', {'texte': texte, 'style': style, 'active': bool(a.get('active')) and bool(texte)})
        journaliser(db, s, 'annonce ' + ('affichée' if a.get('active') and texte else 'cachée'), 'jeu', 'annonce', {'texte': texte, 'style': style}, req=req)
    if isinstance(d.get('bonus'), dict):
        b = d['bonus']
        try:
            mult = float(b.get('multiplicateur') or 1)
            heures = int(b.get('heures') or 0)
        except (TypeError, ValueError):
            raise Erreur(400, 'Bonus invalide.')
        if mult not in (1, 1.5, 2, 3):
            raise Erreur(400, 'Multiplicateur : 1, 1,5, 2 ou 3.')
        if mult > 1 and not 1 <= heures <= 24 * 14:
            raise Erreur(400, 'Durée du bonus : entre 1 heure et 14 jours.')
        bonus = {'multiplicateur': mult, 'fin': maintenant() + heures * 3600 if mult > 1 else 0, 'texte': nettoyer(b.get('texte'), 40)}
        ecrire_reglage(db, 'bonus', bonus)
        journaliser(db, s, f'bonus pièces x{mult:g}' if mult > 1 else 'bonus arrêté', 'jeu', 'bonus', bonus, req=req)
    return admin_jeu(req, db)


def admin_joueurs(req, db):
    session_admin(req, db, permission='joueurs.voir')
    q = re.sub(r'[^0-9a-f]', '', (req.query.get('q') or '').lower())[:8]
    try:
        page = max(0, int(req.query.get('page') or 0))
    except ValueError:
        page = 0
    where, params = ('WHERE j.id LIKE ?', [q + '%']) if q else ('', [])
    total = db.execute(f'SELECT COUNT(*) FROM joueurs j {where}', params).fetchone()[0]
    lignes = db.execute(f"""SELECT j.id, j.cree_le, j.vu_le, j.bloque,
        (SELECT COUNT(*) FROM parties p WHERE p.joueur_id=j.id) AS parties,
        (SELECT COUNT(*) FROM retours r WHERE r.joueur_id=j.id) AS retours,
        (SELECT COUNT(*) FROM cadeaux_recus c WHERE c.joueur_id=j.id) AS cadeaux
        FROM joueurs j {where} ORDER BY COALESCE(j.vu_le, j.cree_le) DESC LIMIT 50 OFFSET ?""", params + [page * 50]).fetchall()
    joueurs = []
    for l in lignes:
        j = dict(l)
        j['code'] = code_court(j.pop('id'))
        joueurs.append(j)
    return 200, {'total': total, 'page': page, 'joueurs': joueurs}


def admin_joueur_bloquer(req, db):
    """Ancien bouton « bloquer » : muet + privé de cadeaux, sans limite (ou levée de ces sanctions)."""
    s = session_admin(req, db, ecriture=True, permission='joueurs.sanctionner')
    d = req.json()
    jid = joueur_par_code(db, d.get('joueur'))
    bloque = 1 if d.get('bloque') else 0
    t = maintenant()
    if bloque:
        for type_ in ('muet', 'cadeaux'):
            if not sanction_active(db, jid, (type_,)):
                db.execute('INSERT INTO sanctions(joueur_id, type, motif, debut, admin_id) VALUES (?,?,?,?,?)', (jid, type_, 'Bloqué', t, s['admin_id']))
    else:
        db.execute("""UPDATE sanctions SET leve_le=?, leve_par=?, leve_motif='Débloqué' WHERE joueur_id=? AND leve_le IS NULL
            AND type IN ('muet','cadeaux','suspension')""", (t, s['admin_id'], jid))
    journaliser(db, s, f'joueur {code_court(jid)} ' + ('bloqué' if bloque else 'débloqué'), 'sanctions', 'joueur:' + jid, req=req)
    return 200, {'ok': True, 'bloque': bloque}


# ---------------------------------------------------------------- routes
ROUTES = [
    ('GET', r'/api/sante', api_sante, True),
    ('POST', r'/api/joueurs', api_nouveau_joueur, True),
    ('POST', r'/api/parties', api_partie, True),
    ('POST', r'/api/retours', api_retour, True),
    ('GET', r'/api/suggestions', api_suggestions, True),
    ('POST', r'/api/suggestions/(\d+)/vote', api_vote, True),
    ('DELETE', r'/api/suggestions/(\d+)/vote', lambda req, db, rid: api_vote(req, db, rid, enlever=True), True),
    ('GET', r'/api/jeu', api_jeu, True),
    ('GET', r'/api/relais', api_relais, True),
    ('POST', r'/api/cadeaux', api_cadeaux, True),
    ('POST', r'/api/cadeaux/code', api_code_cadeau, True),
    ('POST', r'/api/admin/connexion', admin_connexion, False),
    ('POST', r'/api/admin/deconnexion', admin_deconnexion, False),
    ('GET', r'/api/admin/moi', admin_moi, False),
    ('GET', r'/api/admin/tableau', admin_tableau, False),
    ('GET', r'/api/admin/retours', admin_liste, False),
    ('GET', r'/api/admin/retours/(\d+)', admin_detail, False),
    ('POST', r'/api/admin/retours/(\d+)', admin_modifier, False),
    ('POST', r'/api/admin/retours/(\d+)/notes', admin_note, False),
    ('DELETE', r'/api/admin/retours/(\d+)', admin_supprimer, False),
    ('POST', r'/api/admin/spams/purger', admin_purger_spams, False),
    ('GET', r'/api/admin/catalogue', admin_catalogue, False),
    ('GET', r'/api/admin/cadeaux', admin_cadeaux, False),
    ('POST', r'/api/admin/cadeaux', admin_cadeau_creer, False),
    ('POST', r'/api/admin/cadeaux/(\d+)', admin_cadeau_modifier, False),
    ('DELETE', r'/api/admin/cadeaux/(\d+)', admin_cadeau_supprimer, False),
    ('GET', r'/api/admin/jeu', admin_jeu, False),
    ('POST', r'/api/admin/jeu', admin_jeu_modifier, False),
    ('GET', r'/api/admin/joueurs', admin_joueurs, False),
    ('POST', r'/api/admin/joueurs/bloquer', admin_joueur_bloquer, False),
]
_compteur = [0]
DEMARRE_LE = time.time()
_durees = []  # dernières durées de réponse (ms), pour le 95e centile de la page « État du serveur »


def servir_admin(req):
    """Les fichiers de l'espace admin (page à part du jeu)."""
    rel = req.chemin[len('/admin'):].lstrip('/') or 'index.html'
    chemin = os.path.normpath(os.path.join(ADMIN_STATIQUE, rel))
    if not chemin.startswith(ADMIN_STATIQUE + os.sep) or not os.path.isfile(chemin):
        return reponse_json(404, {'erreur': 'Page introuvable.'})
    with open(chemin, 'rb') as f:
        corps = f.read()
    type_ = mimetypes.guess_type(chemin)[0] or 'application/octet-stream'
    if type_.startswith('text/') or type_ in ('application/javascript', 'text/javascript'):
        type_ += '; charset=utf-8'
    return 200, [('Content-Type', type_), ('Content-Length', str(len(corps)))] + entetes_securite(statique=True), [corps]


def application(environ, start_response):
    req = Requete(environ)
    try:
        if req.chemin in ('/admin', '/'):
            code, entetes, corps = 302, [('Location', req.base + '/admin/')], [b'']
        elif req.chemin.startswith('/admin/'):
            code, entetes, corps = servir_admin(req)
        elif req.methode == 'OPTIONS':
            code, entetes, corps = 204, entetes_cors(req) + entetes_securite(), [b'']
        else:
            code, entetes, corps = traiter(req)
    except Exception as e:  # jamais de détails techniques vers le navigateur
        print('Erreur serveur :', repr(e), file=sys.stderr)
        noter_erreur(req.chemin, e)
        code, entetes, corps = reponse_json(500, {'erreur': 'Erreur du serveur.'})
    raisons = {200: 'OK', 201: 'Created', 204: 'No Content', 302: 'Found', 400: 'Bad Request', 401: 'Unauthorized', 403: 'Forbidden',
               404: 'Not Found', 405: 'Method Not Allowed', 409: 'Conflict', 410: 'Gone', 413: 'Payload Too Large', 428: 'Precondition Required',
               429: 'Too Many Requests', 500: 'Internal Server Error'}
    start_response(f'{code} {raisons.get(code, "OK")}', entetes)
    return corps


def noter_erreur(route, e):
    """Garde la trace d'une erreur (type + début du message, jamais de secret) pour la page « État du serveur »."""
    try:
        db = connexion()
        try:
            db.execute('INSERT INTO erreurs(cree_le, route, type, message) VALUES (?,?,?,?)',
                       (maintenant(), re.sub(r'/\d+', '/N', route)[:80], type(e).__name__, str(e)[:160]))
            db.execute('DELETE FROM erreurs WHERE id <= (SELECT MAX(id) - 500 FROM erreurs)')
        finally:
            db.close()
    except Exception:
        pass


def mesurer(db, code, debut):
    ms = int((time.perf_counter() - debut) * 1000)
    _durees.append(ms)
    del _durees[:-400]
    heure = time.strftime('%Y-%m-%d %H', time.gmtime())
    db.execute("""INSERT INTO mesures(heure, requetes, erreurs, refus, total_ms, max_ms) VALUES (?, 1, ?, ?, ?, ?)
        ON CONFLICT(heure) DO UPDATE SET requetes = requetes + 1, erreurs = erreurs + excluded.erreurs, refus = refus + excluded.refus,
        total_ms = total_ms + excluded.total_ms, max_ms = MAX(max_ms, excluded.max_ms)""",
               (heure, 1 if code >= 500 else 0, 1 if 400 <= code < 500 else 0, ms, ms))


def traiter(req):
    debut = time.perf_counter()
    for methode, motif, fonction, public in ROUTES:
        m = re.fullmatch(motif, req.chemin)
        if not m:
            continue
        if methode != req.methode:
            continue
        # l'API admin n'accepte que les requêtes venant de sa propre page (pas d'autre site)
        if not public and req.origine and urlparse(req.origine).netloc.lower() != (req.environ.get('HTTP_HOST') or '').lower():
            return reponse_json(403, {'erreur': 'Origine refusée.'})
        db = connexion()
        code = 500
        cle_action = None
        try:
            _compteur[0] += 1
            if _compteur[0] % 200 == 0:
                db.execute('DELETE FROM limites WHERE debut < ?', (maintenant() - 86400,))
                db.execute('DELETE FROM actions_faites WHERE cree_le < ?', (maintenant() - 86400,))
            if _compteur[0] % 50 == 1:
                gestion.sauvegarde_auto_si_besoin()
            robot.passage_auto_si_besoin()  # robot modérateur : une fois par jour (test en mémoire, voir robot.py)
            # protection contre les doubles actions : un même clic (X-Action) n'est jamais exécuté deux fois
            if not public and req.methode != 'GET':
                cle_action = req.entete('X-Action')
                if cle_action:
                    if not re.fullmatch(r'[A-Za-z0-9-]{8,64}', cle_action):
                        raise Erreur(400, 'Identifiant d\'action invalide.')
                    if not db.execute('INSERT OR IGNORE INTO actions_faites(cle, cree_le) VALUES (?,?)', (cle_action, maintenant())).rowcount:
                        cle_action = None
                        raise Erreur(409, 'Cette action a déjà été faite (double clic ?). Actualise la page pour voir le résultat.')
            args = [int(g) if g.isdigit() else g for g in m.groups()]
            res = fonction(req, db, *args)
            code, donnees = res[0], res[1]
            extra = res[2] if len(res) > 2 else []
            return reponse_json(code, donnees, (entetes_cors(req) if public else []) + extra)
        except Erreur as e:
            code = e.code
            if cle_action:  # l'action a échoué : on pourra la refaire
                db.execute('DELETE FROM actions_faites WHERE cle=?', (cle_action,))
            return reponse_json(e.code, {'erreur': e.message}, entetes_cors(req) if public else [])
        finally:
            try:
                mesurer(db, code, debut)
            except sqlite3.Error:
                pass
            db.close()
    if any(re.fullmatch(motif, req.chemin) for _, motif, _, _ in ROUTES):
        return reponse_json(405, {'erreur': 'Méthode non autorisée.'}, entetes_cors(req))
    return reponse_json(404, {'erreur': 'Introuvable.'}, entetes_cors(req))


# Le module gestion.py (rôles, journal, sauvegardes, joueurs, cadeaux, boutique, esprits, événements…)
sys.modules.setdefault('api', sys.modules[__name__])  # « python api.py serve » : gestion.py retrouve ce module-ci
import gestion  # noqa: E402
ROUTES[:0] = gestion.ROUTES
import robot  # noqa: E402  (robot modérateur quotidien : signalements, avis)
ROUTES[:0] = robot.ROUTES


# ---------------------------------------------------------------- ligne de commande
class ServeurMultiTache(ThreadingMixIn, WSGIServer):
    daemon_threads = True


class Silencieux(WSGIRequestHandler):
    def log_message(self, fmt, *args):
        sys.stderr.write('%s %s\n' % (self.command if hasattr(self, 'command') else '', fmt % args))


def creer_admin(identifiant, mdp=None, role=None):
    identifiant = nettoyer(identifiant, 60).lower()
    if not re.fullmatch(r'[a-z0-9._-]{3,60}', identifiant):
        sys.exit('Identifiant : 3 à 60 caractères (lettres, chiffres, . _ -).')
    if mdp is None:
        mdp = getpass.getpass('Mot de passe (12 caractères ou plus) : ')
        if getpass.getpass('Encore une fois : ') != mdp:
            sys.exit('Les deux mots de passe sont différents.')
    if len(mdp) < 12:
        sys.exit('Mot de passe trop court (12 caractères au moins).')
    if role is not None and role not in ROLES:
        sys.exit('Rôle inconnu : ' + ', '.join(ROLES))
    db = connexion()
    premier = not db.execute('SELECT 1 FROM admins').fetchone()
    role = role or ('super_admin' if premier else 'admin')
    # compte existant : nouveau mot de passe, rôle gardé (sauf --role), compte réactivé
    db.execute("""INSERT INTO admins(identifiant, hash_mdp, cree_le, role) VALUES (?,?,?,?) ON CONFLICT(identifiant)
        DO UPDATE SET hash_mdp=excluded.hash_mdp, actif=1, doit_changer_mdp=0""", (identifiant, hacher_mdp(mdp), maintenant(), role))
    if '--role' in sys.argv:
        db.execute('UPDATE admins SET role=? WHERE identifiant=?', (role, identifiant))
    db.execute('DELETE FROM sessions WHERE admin_id=(SELECT id FROM admins WHERE identifiant=?)', (identifiant,))
    r = db.execute('SELECT role FROM admins WHERE identifiant=?', (identifiant,)).fetchone()['role']
    print(f'Compte admin « {identifiant} » prêt ({ROLES.get(r, r)}).')


if __name__ == '__main__':
    commande = sys.argv[1] if len(sys.argv) > 1 else 'serve'
    if commande == 'serve':
        port = int(sys.argv[2]) if len(sys.argv) > 2 else 8799
        if len(sys.argv) > 3:  # pour essayer en local comme en ligne : serve 8799 /natx
            PREFIXE = '/' + sys.argv[3].strip('/')
        secret()
        connexion().close()
        with make_server('127.0.0.1', port, application, server_class=ServeurMultiTache, handler_class=Silencieux) as s:
            print(f'Serveur des retours NATX ROYALE : http://localhost:{port}{PREFIXE}/admin/  (API : {PREFIXE}/api/…)')
            s.serve_forever()
    elif commande == 'creer-admin' and len(sys.argv) > 2:
        # mot de passe lu au clavier, ou depuis NATX_MDP_ADMIN (tests automatiques uniquement)
        role = sys.argv[sys.argv.index('--role') + 1] if '--role' in sys.argv and sys.argv.index('--role') + 1 < len(sys.argv) else None
        creer_admin(sys.argv[2], os.environ.get('NATX_MDP_ADMIN'), role)
    elif commande == 'sauvegarder':
        connexion().close()
        print('Sauvegarde :', gestion.faire_sauvegarde('manuelle'))
    elif commande == 'robot':
        db = connexion()
        print('Robot modérateur :', robot.passer(db, 'ligne de commande')['resume'])
        db.close()
    else:
        print(__doc__)
