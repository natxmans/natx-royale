#!/usr/bin/env python3
"""NATX ROYALE — serveur des retours joueurs (avis, bugs, idées), des votes et de l'espace admin.

Uniquement la bibliothèque standard de Python (3.9 ou plus) : WSGI + SQLite.

  Lancer en local (tests) :      python serveur/api.py serve 8799 [/prefixe]
  Créer un compte admin :        python serveur/api.py creer-admin <identifiant>
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
from urllib.parse import parse_qs, urlparse
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
VERSION_API = 1
DUREE_SESSION = 12 * 3600

CATEGORIES = {
    'idee': "Idée d'amélioration", 'contenu': 'Nouveau contenu', 'gameplay': 'Gameplay',
    'bug': 'Bug rencontré', 'collision': 'Problème de collision', 'graphismes': 'Graphismes',
    'performance': 'Performance', 'interface': 'Interface', 'autre': 'Autre',
}
STATUTS = ['nouveau', 'a_etudier', 'en_cours', 'accepte', 'refuse', 'corrige']
MODES = {'solo', 'duo'}

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
"""


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
            _schema_ok = True
    return db


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

    def json(self):
        if self._corps is not None:
            return self._corps
        try:
            n = int(self.environ.get('CONTENT_LENGTH') or 0)
        except ValueError:
            n = 0
        if n > 16384:
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
    db.execute('INSERT OR IGNORE INTO parties(partie_id, joueur_id, cree_le, mode, nb_joueurs, place, kills, duree) VALUES (?,?,?,?,?,?,?,?)',
               (pid, jid, maintenant(), mode, entier('nb_joueurs', 1, 64), entier('place', 0, 64), entier('kills', 0, 200), entier('duree', 0, 7200)))
    return 201, {'ok': True}


def api_retour(req, db):
    """Un avis envoyé depuis l'écran de fin de partie (ou le menu)."""
    d = req.json()
    jid = joueur_obligatoire(req, d)
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
        if not limite(db, 'vote:' + jid, 40, 3600) or not limite(db, 'vote:ip:' + req.ip_hash, 150, 3600):
            raise Erreur(429, 'Trop de votes d\'un coup, réessaie plus tard.')
        # protection : pas plus de 3 votes depuis la même connexion pour une même idée
        n = db.execute('SELECT COUNT(*) FROM votes WHERE retour_id=? AND ip_hash=?', (rid, req.ip_hash)).fetchone()[0]
        if n >= 3 and not db.execute('SELECT 1 FROM votes WHERE retour_id=? AND joueur_id=?', (rid, jid)).fetchone():
            raise Erreur(429, 'Trop de votes depuis cette connexion pour cette idée.')
        db.execute('INSERT OR IGNORE INTO votes(retour_id, joueur_id, cree_le, ip_hash) VALUES (?,?,?,?)', (rid, jid, maintenant(), req.ip_hash))
    total = db.execute('SELECT COUNT(*) FROM votes WHERE retour_id=?', (rid,)).fetchone()[0]
    return 200, {'ok': True, 'votes': total, 'a_vote': 0 if enlever else 1}


# ---------------------------------------------------------------- espace admin
def session_admin(req, db, ecriture=False):
    jeton = req.cookie('natx_admin')
    if not jeton:
        raise Erreur(401, 'Connexion nécessaire.')
    h = hashlib.sha256(jeton.encode()).hexdigest()
    s = db.execute('SELECT s.admin_id, s.csrf, s.expire_le, a.identifiant, a.role FROM sessions s JOIN admins a ON a.id = s.admin_id WHERE s.jeton_hash=?', (h,)).fetchone()
    if not s or s['expire_le'] < maintenant():
        if s:
            db.execute('DELETE FROM sessions WHERE jeton_hash=?', (h,))
        raise Erreur(401, 'Session expirée, reconnecte-toi.')
    if s['role'] != 'admin':
        raise Erreur(403, 'Accès refusé.')
    if ecriture and not hmac.compare_digest(req.entete('X-CSRF') or '', s['csrf']):
        raise Erreur(403, 'Requête refusée (jeton de sécurité manquant).')
    return s


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
    a = db.execute('SELECT id, hash_mdp FROM admins WHERE identifiant=?', (ident,)).fetchone()
    if not _HASH_FACTICE:
        _HASH_FACTICE = hacher_mdp(secrets.token_hex(8))
    ok = verifier_mdp(mdp, a['hash_mdp'] if a else _HASH_FACTICE) and a is not None  # même durée si l'identifiant n'existe pas
    if not ok:
        raise Erreur(401, 'Identifiant ou mot de passe incorrect.')
    jeton, csrf = secrets.token_urlsafe(32), secrets.token_urlsafe(24)
    t = maintenant()
    db.execute('DELETE FROM sessions WHERE expire_le < ?', (t,))
    db.execute('INSERT INTO sessions(jeton_hash, admin_id, csrf, cree_le, expire_le) VALUES (?,?,?,?,?)',
               (hashlib.sha256(jeton.encode()).hexdigest(), a['id'], csrf, t, t + DUREE_SESSION))
    db.execute('INSERT INTO journal(admin_id, action, cree_le) VALUES (?,?,?)', (a['id'], 'connexion', t))
    return 200, {'ok': True, 'csrf': csrf, 'identifiant': ident}, [cookie_session(req, jeton, DUREE_SESSION)]


def admin_deconnexion(req, db):
    jeton = req.cookie('natx_admin')
    if jeton:
        db.execute('DELETE FROM sessions WHERE jeton_hash=?', (hashlib.sha256(jeton.encode()).hexdigest(),))
    return 200, {'ok': True}, [cookie_session(req, '', 0)]


def admin_moi(req, db):
    s = session_admin(req, db)
    return 200, {'identifiant': s['identifiant'], 'csrf': s['csrf'], 'categories': CATEGORIES, 'statuts': STATUTS}


def admin_tableau(req, db):
    session_admin(req, db)
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
    session_admin(req, db)
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
    session_admin(req, db)
    r = dict(retour_existant(db, rid))
    r.pop('ip_hash', None)
    r['votes'] = db.execute('SELECT COUNT(*) FROM votes WHERE retour_id=?', (rid,)).fetchone()[0]
    r['notes'] = [dict(n) for n in db.execute("""SELECT n.id, n.cree_le, n.texte, a.identifiant AS auteur FROM notes_internes n
        LEFT JOIN admins a ON a.id = n.admin_id WHERE n.retour_id=? ORDER BY n.cree_le""", (rid,))]
    r['journal'] = [dict(j) for j in db.execute("""SELECT j.action, j.cree_le, a.identifiant AS auteur FROM journal j
        LEFT JOIN admins a ON a.id = j.admin_id WHERE j.retour_id=? ORDER BY j.cree_le DESC LIMIT 20""", (rid,))]
    r['autres_du_joueur'] = db.execute('SELECT COUNT(*) FROM retours WHERE joueur_id=? AND id<>?', (r['joueur_id'], rid)).fetchone()[0]
    r.pop('joueur_id', None)
    return 200, r


def admin_modifier(req, db, rid):
    s = session_admin(req, db, ecriture=True)
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
        db.execute('INSERT INTO journal(admin_id, action, retour_id, cree_le) VALUES (?,?,?,?)', (s['admin_id'], a, rid, maintenant()))
    return admin_detail(req, db, rid)


def admin_note(req, db, rid):
    s = session_admin(req, db, ecriture=True)
    retour_existant(db, rid)
    texte = nettoyer(req.json().get('texte'), 2000)
    if len(texte) < 1:
        raise Erreur(400, 'Note vide.')
    db.execute('INSERT INTO notes_internes(retour_id, admin_id, cree_le, texte) VALUES (?,?,?,?)', (rid, s['admin_id'], maintenant(), texte))
    return admin_detail(req, db, rid)


def admin_supprimer(req, db, rid):
    s = session_admin(req, db, ecriture=True)
    retour_existant(db, rid)
    db.execute('DELETE FROM votes WHERE retour_id=?', (rid,))
    db.execute('DELETE FROM notes_internes WHERE retour_id=?', (rid,))
    db.execute('DELETE FROM retours WHERE id=?', (rid,))
    db.execute('INSERT INTO journal(admin_id, action, retour_id, cree_le) VALUES (?,?,?,?)', (s['admin_id'], 'supprimée', rid, maintenant()))
    return 200, {'ok': True}


def admin_purger_spams(req, db):
    s = session_admin(req, db, ecriture=True)
    ids = [r[0] for r in db.execute('SELECT id FROM retours WHERE spam=1')]
    for rid in ids:
        db.execute('DELETE FROM votes WHERE retour_id=?', (rid,))
        db.execute('DELETE FROM notes_internes WHERE retour_id=?', (rid,))
    db.execute('DELETE FROM retours WHERE spam=1')
    db.execute('INSERT INTO journal(admin_id, action, cree_le) VALUES (?,?,?)', (s['admin_id'], f'{len(ids)} spams supprimés', maintenant()))
    return 200, {'ok': True, 'supprimes': len(ids)}


# ---------------------------------------------------------------- routes
ROUTES = [
    ('GET', r'/api/sante', api_sante, True),
    ('POST', r'/api/joueurs', api_nouveau_joueur, True),
    ('POST', r'/api/parties', api_partie, True),
    ('POST', r'/api/retours', api_retour, True),
    ('GET', r'/api/suggestions', api_suggestions, True),
    ('POST', r'/api/suggestions/(\d+)/vote', api_vote, True),
    ('DELETE', r'/api/suggestions/(\d+)/vote', lambda req, db, rid: api_vote(req, db, rid, enlever=True), True),
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
]
_compteur = [0]


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
        code, entetes, corps = reponse_json(500, {'erreur': 'Erreur du serveur.'})
    raisons = {200: 'OK', 201: 'Created', 204: 'No Content', 302: 'Found', 400: 'Bad Request', 401: 'Unauthorized', 403: 'Forbidden',
               404: 'Not Found', 405: 'Method Not Allowed', 413: 'Payload Too Large', 429: 'Too Many Requests', 500: 'Internal Server Error'}
    start_response(f'{code} {raisons.get(code, "OK")}', entetes)
    return corps


def traiter(req):
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
        try:
            _compteur[0] += 1
            if _compteur[0] % 200 == 0:
                db.execute('DELETE FROM limites WHERE debut < ?', (maintenant() - 86400,))
            args = [int(g) for g in m.groups()]
            res = fonction(req, db, *args)
            code, donnees = res[0], res[1]
            extra = res[2] if len(res) > 2 else []
            return reponse_json(code, donnees, (entetes_cors(req) if public else []) + extra)
        except Erreur as e:
            return reponse_json(e.code, {'erreur': e.message}, entetes_cors(req) if public else [])
        finally:
            db.close()
    if any(re.fullmatch(motif, req.chemin) for _, motif, _, _ in ROUTES):
        return reponse_json(405, {'erreur': 'Méthode non autorisée.'}, entetes_cors(req))
    return reponse_json(404, {'erreur': 'Introuvable.'}, entetes_cors(req))


# ---------------------------------------------------------------- ligne de commande
class ServeurMultiTache(ThreadingMixIn, WSGIServer):
    daemon_threads = True


class Silencieux(WSGIRequestHandler):
    def log_message(self, fmt, *args):
        sys.stderr.write('%s %s\n' % (self.command if hasattr(self, 'command') else '', fmt % args))


def creer_admin(identifiant, mdp=None):
    identifiant = nettoyer(identifiant, 60).lower()
    if not re.fullmatch(r'[a-z0-9._-]{3,60}', identifiant):
        sys.exit('Identifiant : 3 à 60 caractères (lettres, chiffres, . _ -).')
    if mdp is None:
        mdp = getpass.getpass('Mot de passe (12 caractères ou plus) : ')
        if getpass.getpass('Encore une fois : ') != mdp:
            sys.exit('Les deux mots de passe sont différents.')
    if len(mdp) < 12:
        sys.exit('Mot de passe trop court (12 caractères au moins).')
    db = connexion()
    db.execute('INSERT INTO admins(identifiant, hash_mdp, cree_le) VALUES (?,?,?) ON CONFLICT(identifiant) DO UPDATE SET hash_mdp=excluded.hash_mdp',
               (identifiant, hacher_mdp(mdp), maintenant()))
    db.execute('DELETE FROM sessions WHERE admin_id=(SELECT id FROM admins WHERE identifiant=?)', (identifiant,))
    print(f'Compte admin « {identifiant} » prêt.')


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
        creer_admin(sys.argv[2], os.environ.get('NATX_MDP_ADMIN'))
    else:
        print(__doc__)
