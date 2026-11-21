"""NATX ROYALE — gestion du jeu (chargé par api.py).

- Côté jeu (public) : boîte de réception des cadeaux, profil déclaré par le jeu, signalements,
  réglages de la boutique / des esprits, cargaisons (le serveur tire la récompense et la donne une seule fois).
- Côté admin : comptes et rôles, journal d'audit, sessions, sauvegardes, tableau de bord, état du serveur,
  joueurs, sanctions, signalements, cadeaux, cosmétiques, boutique, promotions, esprits, événements.

Chaque route admin vérifie la session ET la permission du rôle (api.session_admin) ; les modifications
demandent le jeton anti-CSRF, et les actions sensibles une confirmation ou le mot de passe.
Aucune route n'exécute de commande système.
"""
import json
import os
import re
import sqlite3
import secrets
import threading
import time

import api
from api import Erreur, maintenant, nettoyer, limite, code_court, session_admin, journaliser, exiger_confirmation, exiger_mdp

_hasard = secrets.SystemRandom()
RARETES_ESPRIT = {'commun': 'Commun', 'rare': 'Rare', 'epique': 'Épique', 'legendaire': 'Légendaire'}
POIDS_RARETES_DEFAUT = {'commun': 60, 'rare': 25, 'epique': 11, 'legendaire': 4}
MOTIFS_SIGNALEMENT = {'triche': 'Triche', 'insultes': 'Insultes ou harcèlement', 'pseudo': 'Pseudo inapproprié',
                      'antijeu': 'Anti-jeu', 'autre': 'Autre'}
STATUTS_SIGNALEMENT = {'nouveau': 'Nouveau', 'en_cours': 'En cours', 'traite': 'Traité', 'rejete': 'Rejeté'}
CIBLES_PROMO = {'tout': 'Toute la boutique', 'categorie': 'Une catégorie', 'rarete': 'Une rareté',
                'collection': 'Une collection', 'objets': 'Des objets choisis'}
CATEGORIES_MODELE = ('chapeau', 'dos', 'pioche', 'deltaplane')
CONFIG_CARGAISON = {'delai_min': 90, 'delai_max': 210, 'max_par_partie': 1, 'joueurs_min': 1,
                    'pieces_min': 100, 'pieces_max': 300, 'proba_objet': 15, 'objets': [], 'raretes': None}
DUREES_SANCTION = (1, 24, 72, 168, 720)  # heures ; 0 = sans limite
RE_ID_PARTIE = re.compile(r'[0-9a-z]{8,32}')


def un(db, sql, *p):
    return db.execute(sql, p).fetchone()[0]


def entier(v, mini, maxi, defaut=0):
    try:
        return max(mini, min(maxi, int(v)))
    except (TypeError, ValueError):
        return defaut


def charger_json(texte, defaut):
    try:
        return json.loads(texte) if texte else defaut
    except ValueError:
        return defaut


def page_de(req):
    return entier(req.query.get('page'), 0, 10000)


def motif_like(t):
    return '%' + t.replace('\\', '\\\\').replace('%', '\\%').replace('_', '\\_') + '%'


def joueur_par_code(db, code):
    return api.joueur_par_code(db, code)


# ---------- Reconnaître les joueurs : code + dernier pseudo + surnom donné par les admins ----------
def qui_lot(db, jids):
    jids = [j for j in dict.fromkeys(jids) if j]
    if not jids:
        return {}
    res = {j: {'code': code_court(j), 'pseudo': None, 'surnom': None} for j in jids}
    for i in range(0, len(jids), 400):
        part = jids[i:i + 400]
        marques = ','.join('?' * len(part))
        for l in db.execute(f'SELECT joueur_id, pseudo FROM profils WHERE joueur_id IN ({marques})', part):
            res[l['joueur_id']]['pseudo'] = l['pseudo'] or None
        for l in db.execute(f'SELECT joueur_id, surnom FROM joueurs_notes WHERE joueur_id IN ({marques})', part):
            res[l['joueur_id']]['surnom'] = l['surnom'] or None
    return res


def qui(db, jid):
    return qui_lot(db, [jid]).get(jid) if jid else None


# ================================================================ sauvegardes
DOSSIER_SAUV = os.path.join(api.DONNEES, 'sauvegardes')
RE_SAUV = re.compile(r'natx-(\d{8}-\d{6})-(auto|manuelle|avant-restauration)\.db')
GARDER = {'auto': 14, 'manuelle': 20, 'avant-restauration': 10}
_verrou_sauv = threading.Lock()


def liste_sauvegardes():
    if not os.path.isdir(DOSSIER_SAUV):
        return []
    sortie = []
    for nom in os.listdir(DOSSIER_SAUV):
        m = RE_SAUV.fullmatch(nom)
        if m:
            chemin = os.path.join(DOSSIER_SAUV, nom)
            sortie.append({'nom': nom, 'motif': m.group(2), 'taille': os.path.getsize(chemin), 'cree_le': int(os.path.getmtime(chemin))})
    return sorted(sortie, key=lambda s: s['nom'][5:20], reverse=True)


def faire_sauvegarde(motif):
    """Copie cohérente de la base (API de sauvegarde de SQLite, sans arrêter le serveur)."""
    with _verrou_sauv:
        os.makedirs(DOSSIER_SAUV, exist_ok=True)
        try:
            os.chmod(DOSSIER_SAUV, 0o700)
        except OSError:
            pass
        nom = time.strftime('natx-%Y%m%d-%H%M%S', time.gmtime()) + f'-{motif}.db'
        chemin = os.path.join(DOSSIER_SAUV, nom)
        if os.path.exists(chemin):
            time.sleep(1.1)
            return faire_sauvegarde.__wrapped__(motif) if hasattr(faire_sauvegarde, '__wrapped__') else nom
        src, dst = sqlite3.connect(api.BASE, timeout=10), sqlite3.connect(chemin)
        try:
            src.backup(dst)
        finally:
            dst.close()
            src.close()
        try:
            os.chmod(chemin, 0o600)
        except OSError:
            pass
        for m, n in GARDER.items():  # on ne garde que les plus récentes de chaque sorte
            for vieille in [s for s in liste_sauvegardes() if s['motif'] == m][n:]:
                os.remove(os.path.join(DOSSIER_SAUV, vieille['nom']))
        return nom


def sauvegarde_auto_si_besoin():
    """Une sauvegarde automatique par jour (faite au passage d'une requête : pas de tâche planifiée à régler)."""
    try:
        autos = [s for s in liste_sauvegardes() if s['motif'] == 'auto']
        if not os.path.exists(api.BASE) or (autos and time.time() - autos[0]['cree_le'] < 86400):
            return None
        return faire_sauvegarde('auto')
    except Exception as e:  # une sauvegarde ratée ne doit jamais bloquer le jeu
        api.noter_erreur('/sauvegarde-auto', e)
        return None


def verifier_sauvegarde(chemin):
    c = sqlite3.connect(f'file:{chemin}?mode=ro', uri=True)
    try:
        if c.execute('PRAGMA integrity_check').fetchone()[0] != 'ok':
            raise Erreur(400, 'Cette sauvegarde est abîmée : restauration refusée.')
        tables = {r[0] for r in c.execute("SELECT name FROM sqlite_master WHERE type='table'")}
        if not {'admins', 'joueurs', 'cadeaux'} <= tables:
            raise Erreur(400, 'Ce fichier n\'est pas une base NATX ROYALE.')
        if not c.execute('SELECT COUNT(*) FROM admins').fetchone()[0]:
            raise Erreur(400, 'Cette sauvegarde n\'a aucun compte admin : restauration refusée.')
    finally:
        c.close()


# ================================================================ catalogue (fabriqué depuis le jeu par extraire_catalogue.py)
def cat():
    return api.catalogue()


def reglages_cosmetiques(db):
    return {l['cle']: dict(l) for l in db.execute('SELECT * FROM cosmetiques_reglages')}


def tous_les_cosmetiques(db):
    """Anciens + 250 nouveaux + ajouts de l'admin, avec les réglages de l'admin appliqués."""
    c = cat()
    prix_base = {k: v.get('prix') for k, v in c.get('raretes', {}).items()}
    reg = reglages_cosmetiques(db)
    sortie = []
    deja = set()
    for o in c.get('objets', []):
        if o.get('nouveau250'):
            continue
        deja.add(o['cle'])
        sortie.append({**o, 'nouveau250': False, 'livre': True, 'ressource': 'intégré au jeu', 'serie': None})
    for o in c.get('tous_250', []):
        deja.add(o['cle'])
        sortie.append({**o, 'nouveau250': True, 'gratuit': False,
                       'ressource': f"{o['fichier']} → {o['objet']}" if o.get('livre') else 'modèle pas encore livré'})
    for l in db.execute('SELECT * FROM cosmetiques_ajouts'):
        sortie.append({'cle': l['cle'], 'cat': l['cat'], 'id': l['id'], 'nom': l['nom'], 'desc': l['description'] or '',
                       'rarete': l['rarete'], 'gratuit': False, 'nouveau250': False, 'ajout': True, 'actif_ajout': bool(l['actif']),
                       'livre': True, 'fichier': l['fichier'], 'objet': l['objet'], 'ressource': f"{l['fichier']} → {l['objet']}", 'serie': None})
    for o in sortie:
        r = reg.get(o['cle'], {})
        o['nom_origine'], o['rarete_origine'] = o['nom'], o['rarete']
        o['prix_base'] = prix_base.get(o['rarete'])
        for k_r, k_o in (('nom', 'nom'), ('description', 'desc'), ('rarete', 'rarete')):
            if r.get(k_r):
                o[k_o] = r[k_r]
        o['prix'] = r['prix'] if r.get('prix') is not None else prix_base.get(o['rarete'])
        o['en_vente'] = (r['en_vente'] != 0) if r.get('en_vente') is not None else not o.get('gratuit')
        if o.get('ajout') and not o.get('actif_ajout'):
            o['en_vente'] = False
        o['collection'] = r['collection'] if r.get('collection') is not None else o.get('serie')
        o['modifie'] = bool(r)
    return sortie


def cles_vendables(db):
    """Objets qui existent VRAIMENT dans le jeu (pour les cadeaux, les cargaisons, les promotions)."""
    return {o['cle'] for o in tous_les_cosmetiques(db) if o['livre'] and (not o.get('ajout') or o.get('actif_ajout'))}


def esprits_jeu():
    return cat().get('esprits', {})


def reglages_esprits(db):
    defs = esprits_jeu()
    reg = {l['type']: dict(l) for l in db.execute('SELECT * FROM esprits_reglages')}
    return {t: {'actif': bool(reg.get(t, {}).get('actif', 1)), 'poids': reg.get(t, {}).get('poids', 10),
                'description': reg.get(t, {}).get('description')} for t in defs}


def poids_raretes(db, cfg=None):
    if cfg and isinstance(cfg.get('raretes'), dict):
        return cfg['raretes']
    return api.lire_reglage(db, 'esprits_raretes') or dict(POIDS_RARETES_DEFAUT)


def tirer(poids):
    total = sum(max(0, int(v)) for v in poids.values())
    if total <= 0:
        return None
    x = _hasard.uniform(0, total)
    for k, v in poids.items():
        x -= max(0, int(v))
        if x <= 0:
            return k
    return list(poids)[-1]


def evenement_actif(db, type_='cargaison'):
    t = maintenant()
    return db.execute('SELECT * FROM evenements WHERE type=? AND actif=1 AND debut<=? AND fin>? ORDER BY debut DESC LIMIT 1',
                      (type_, t, t)).fetchone()


# ================================================================ côté jeu (public)
def api_jeu(req, db):
    """Annonce, bonus, boutique (rotation, promotions, réglages des objets), esprits et cargaison en cours."""
    e = api.etat_jeu(db)
    t = maintenant()
    reg = reglages_cosmetiques(db)
    e['cosmetiques'] = {k: {kk: v for kk, v in (('nom', r['nom']), ('desc', r['description']), ('rarete', r['rarete']),
                                                 ('prix', r['prix']), ('en_vente', r['en_vente']), ('collection', r['collection'])) if v is not None}
                        for k, r in reg.items()}
    e['ajouts'] = [{'cle': l['cle'], 'cat': l['cat'], 'id': l['id'], 'nom': l['nom'], 'desc': l['description'] or '', 'rarete': l['rarete'],
                    'prix': l['prix'], 'fichier': l['fichier'], 'objet': l['objet']}
                   for l in db.execute('SELECT * FROM cosmetiques_ajouts WHERE actif=1')]
    e['promotions'] = [{'id': l['id'], 'nom': l['nom'], 'reduction': l['reduction'], 'cible_type': l['cible_type'],
                        'cible_valeurs': charger_json(l['cible_valeurs'], []), 'fin': l['fin']}
                       for l in db.execute('SELECT * FROM promotions WHERE actif=1 AND debut<=? AND fin>? ORDER BY reduction DESC', (t, t))]
    e['boutique'] = api.lire_reglage(db, 'boutique') or {}
    e['collections'] = api.lire_reglage(db, 'collections') or {}
    e['esprits'] = {k: {'actif': v['actif'], 'description': v['description']} for k, v in reglages_esprits(db).items()}
    ev = evenement_actif(db)
    e['cargaison'] = {'nom': ev['nom'], 'fin': ev['fin']} if ev else None
    return 200, e


def ref_publique(db, jid):
    """Référence publique du joueur (pour être signalé par les autres sans dévoiler son identité)."""
    l = db.execute('SELECT ref FROM joueurs WHERE id=?', (jid,)).fetchone()
    if l and l['ref']:
        return l['ref']
    ref = secrets.token_hex(6)
    db.execute('UPDATE joueurs SET ref=? WHERE id=?', (ref, jid))
    return ref


def entree_boite(l):
    c = api.contenu_cadeau(l)
    c.update({'recu_le': l['recu_le'], 'ouvert_le': l['ouvert_le'], 'expire_le': l['expire_le']})
    return c


def livrer_en_attente(db, jid):
    """Les cadeaux « pour tout le monde » ou « pour ce joueur » arrivent dans sa boîte (une seule fois chacun)."""
    t = maintenant()
    lignes = db.execute("""SELECT id FROM cadeaux c WHERE c.actif=1 AND (c.expire_le IS NULL OR c.expire_le > ?)
        AND (c.cible='tous' OR (c.cible='joueur' AND c.joueur_id=?))
        AND NOT EXISTS (SELECT 1 FROM cadeaux_recus r WHERE r.cadeau_id=c.id AND r.joueur_id=?) ORDER BY c.id LIMIT 50""", (t, jid, jid)).fetchall()
    for l in lignes:
        db.execute('INSERT OR IGNORE INTO cadeaux_recus(cadeau_id, joueur_id, recu_le) VALUES (?,?,?)', (l['id'], jid, t))


def api_boite(req, db):
    """Boîte de réception : cadeaux pas encore ouverts + historique. Le jeu la consulte toutes les 30 s."""
    jid = api.joueur_obligatoire(req, req.json())
    if not limite(db, 'boite:' + jid, 400, 3600):
        raise Erreur(429, 'Trop de demandes, réessaie plus tard.')
    api.joueur_vu(db, jid)
    t = maintenant()
    prive = api.sanction_active(db, jid, ('cadeaux', 'suspension'))
    if not prive:
        livrer_en_attente(db, jid)
    non_ouverts = [] if prive else [entree_boite(l) for l in db.execute("""SELECT c.*, r.recu_le, r.ouvert_le FROM cadeaux_recus r
        JOIN cadeaux c ON c.id = r.cadeau_id WHERE r.joueur_id=? AND r.ouvert_le IS NULL AND r.annule_le IS NULL AND c.actif=1
        AND (c.expire_le IS NULL OR c.expire_le > ?) ORDER BY r.recu_le, c.id LIMIT 50""", (jid, t))]
    historique = [entree_boite(l) for l in db.execute("""SELECT c.*, r.recu_le, r.ouvert_le FROM cadeaux_recus r
        JOIN cadeaux c ON c.id = r.cadeau_id WHERE r.joueur_id=? AND r.ouvert_le IS NOT NULL ORDER BY r.ouvert_le DESC LIMIT 30""", (jid,))]
    avert = [{'id': l['id'], 'motif': l['motif'], 'debut': l['debut']} for l in db.execute(
        """SELECT * FROM sanctions WHERE joueur_id=? AND type='avertissement' AND vu_le IS NULL AND leve_le IS NULL AND debut > ?
        ORDER BY debut""", (jid, t - 30 * 86400))]
    susp = api.sanction_active(db, jid, ('suspension',))
    return 200, {'non_ouverts': non_ouverts, 'historique': historique, 'ref': ref_publique(db, jid), 'avertissements': avert,
                 'suspension': {'motif': susp['motif'], 'fin': susp['fin']} if susp else None,
                 'prive_cadeaux': bool(prive), 'maintenant': t, 'staff': infos_staff(db, jid), 'liaison': demande_liaison(db, jid)}


def api_boite_ouvrir(req, db):
    """Ouvrir un cadeau : le serveur note l'ouverture UNE fois ; redemander renvoie le même contenu avec deja=true."""
    d = req.json()
    jid = api.joueur_obligatoire(req, d)
    cid = entier(d.get('id'), 1, 2 ** 31, 0)
    if not limite(db, 'ouvrir:' + jid, 200, 3600):
        raise Erreur(429, 'Trop de demandes, réessaie plus tard.')
    l = db.execute('SELECT c.*, r.recu_le, r.ouvert_le, r.annule_le FROM cadeaux_recus r JOIN cadeaux c ON c.id=r.cadeau_id WHERE r.cadeau_id=? AND r.joueur_id=?',
                   (cid, jid)).fetchone()
    if not l or l['annule_le']:
        raise Erreur(404, 'Cadeau introuvable.')
    if l['ouvert_le']:
        return 200, {'cadeau': entree_boite(l), 'deja': True}
    if api.sanction_active(db, jid, ('cadeaux', 'suspension')):
        raise Erreur(403, 'Ton compte ne peut pas recevoir de cadeaux pour le moment.')
    if not l['actif'] or (l['expire_le'] and l['expire_le'] <= maintenant()):
        raise Erreur(410, 'Ce cadeau a expiré.')
    t = maintenant()
    deja = not db.execute('UPDATE cadeaux_recus SET ouvert_le=? WHERE cadeau_id=? AND joueur_id=? AND ouvert_le IS NULL', (t, cid, jid)).rowcount
    l = db.execute('SELECT c.*, r.recu_le, r.ouvert_le FROM cadeaux_recus r JOIN cadeaux c ON c.id=r.cadeau_id WHERE r.cadeau_id=? AND r.joueur_id=?', (cid, jid)).fetchone()
    return 200, {'cadeau': entree_boite(l), 'deja': deja}


def api_avertissement_lu(req, db):
    d = req.json()
    jid = api.joueur_obligatoire(req, d)
    db.execute("UPDATE sanctions SET vu_le=? WHERE id=? AND joueur_id=? AND type='avertissement' AND vu_le IS NULL",
               (maintenant(), entier(d.get('id'), 1, 2 ** 31, 0), jid))
    return 200, {'ok': True}


RE_CLE = re.compile(r'[a-z]{2,12}:[a-z0-9_]{1,48}')


def api_profil(req, db):
    """Ce que le jeu déclare (le profil reste dans le navigateur) : pour la page « joueurs » de l'admin."""
    d = req.json()
    jid = api.joueur_obligatoire(req, d)
    if not limite(db, 'profil:' + jid, 40, 3600):
        raise Erreur(429, 'Trop de demandes.')
    p = d.get('profil') if isinstance(d.get('profil'), dict) else {}
    possedes = [c for c in (p.get('possedes') or [])[:800] if isinstance(c, str) and RE_CLE.fullmatch(c)]
    equipe = {k: v for k, v in (p.get('equipe') or {}).items() if isinstance(k, str) and isinstance(v, str) and len(k) < 13 and len(v) < 49} \
        if isinstance(p.get('equipe'), dict) else {}
    esprits = []
    for e in (p.get('esprits') or [])[:60]:
        if isinstance(e, dict) and isinstance(e.get('type'), str) and e.get('rarete') in RARETES_ESPRIT:
            esprits.append({'type': e['type'][:20], 'rarete': e['rarete'], 'n': entier(e.get('n'), 1, 999, 1)})
    stats = {k: entier(v, 0, 10 ** 7) for k, v in (p.get('stats') or {}).items() if isinstance(k, str) and len(k) < 20} \
        if isinstance(p.get('stats'), dict) else {}
    pseudo = nettoyer(p.get('pseudo'), 20)
    if pseudo:
        t = maintenant()
        db.execute("""INSERT INTO pseudos_joueurs(joueur_id, pseudo, premier, dernier) VALUES (?,?,?,?)
            ON CONFLICT(joueur_id, pseudo) DO UPDATE SET dernier=excluded.dernier""", (jid, pseudo, t, t))
    db.execute("""INSERT OR REPLACE INTO profils(joueur_id, pseudo, niveau, xp, pieces, possedes, equipe, esprits, stats, version, maj_le)
        VALUES (?,?,?,?,?,?,?,?,?,?,?)""", (jid, nettoyer(p.get('pseudo'), 20), entier(p.get('niveau'), 0, 9999), entier(p.get('xp'), 0, 10 ** 9),
                                           entier(p.get('pieces'), 0, 10 ** 8), json.dumps(possedes), json.dumps(equipe), json.dumps(esprits),
                                           json.dumps(stats), nettoyer(p.get('version'), 20), maintenant()))
    api.joueur_vu(db, jid)
    return 200, {'ok': True}


def api_signalement(req, db):
    d = req.json()
    jid = api.joueur_obligatoire(req, d)
    api.pas_bloque(db, jid)
    motif = d.get('motif')
    if motif not in MOTIFS_SIGNALEMENT:
        raise Erreur(400, 'Choisis un motif.')
    if not limite(db, 'signal:' + jid, 10, 86400):
        raise Erreur(429, 'Tu as déjà fait beaucoup de signalements aujourd\'hui.')
    ref = str(d.get('ref') or '')
    cible = None
    if re.fullmatch(r'[0-9a-f]{12}', ref):
        l = db.execute('SELECT id FROM joueurs WHERE ref=?', (ref,)).fetchone()
        cible = l['id'] if l else None
    if cible == jid:
        raise Erreur(400, 'Tu ne peux pas te signaler toi-même.')
    pid = str(d.get('partie_id') or '')
    db.execute('INSERT INTO signalements(cree_le, auteur_id, cible_id, cible_pseudo, partie_id, motif, texte) VALUES (?,?,?,?,?,?,?)',
               (maintenant(), jid, cible, nettoyer(d.get('pseudo'), 20), pid if RE_ID_PARTIE.fullmatch(pid) else None, motif, nettoyer(d.get('texte'), 300)))
    return 201, {'ok': True}


# ---------- Compte : sauvegarde en ligne du profil + code de sauvegarde pour le retrouver ailleurs ----------
# Le profil reste aussi dans le navigateur ; le serveur garde la version la plus récente (numéro « rev »).
# Le code de sauvegarde n'est gardé qu'en empreinte (sha256) : impossible de le relire, seulement de le vérifier.
ALPHABET_SAUVEGARDE = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'
TAILLE_MAX_SAUVEGARDE = 120000


def empreinte_code(code):
    return api.hmac.new(api.secret(), ('sauvegarde:' + code).encode(), 'sha256').hexdigest()


def normaliser_code_sauvegarde(code):
    return re.sub(r'[^A-Z0-9]', '', str(code or '').upper())[:32]


def formater_code_sauvegarde(code):
    return '-'.join(code[i:i + 4] for i in range(0, len(code), 4))


def nouveau_code_sauvegarde(db, jid):
    code = ''.join(secrets.choice(ALPHABET_SAUVEGARDE) for _ in range(16))
    db.execute("""INSERT INTO comptes(joueur_id, code_hash, code_cree_le) VALUES (?,?,?)
        ON CONFLICT(joueur_id) DO UPDATE SET code_hash=excluded.code_hash, code_cree_le=excluded.code_cree_le""",
               (jid, empreinte_code(code), maintenant()))
    return formater_code_sauvegarde(code)


def api_compte_charger(req, db):
    """La sauvegarde en ligne de ce joueur (pour savoir si un autre appareil a joué plus récemment)."""
    jid = api.joueur_obligatoire(req, req.json())
    if not limite(db, 'compte:' + jid, 200, 3600):
        raise Erreur(429, 'Trop de demandes.')
    l = db.execute('SELECT * FROM comptes WHERE joueur_id=?', (jid,)).fetchone()
    return 200, {'rev': l['rev'] if l else 0, 'maj_le': l['maj_le'] if l else None, 'a_un_code': bool(l and l['code_hash']),
                 'profil': charger_json(l['sauvegarde'], None) if l and l['sauvegarde'] else None}


def api_compte_sauvegarder(req, db):
    """Le jeu envoie tout son profil ; refusé (409) si le serveur a déjà une version plus récente (autre appareil)."""
    d = req.json(maxi=TAILLE_MAX_SAUVEGARDE + 4000)
    jid = api.joueur_obligatoire(req, d)
    if not limite(db, 'sauver:' + jid, 120, 3600):
        raise Erreur(429, 'Trop de sauvegardes, réessaie plus tard.')
    p = d.get('profil')
    rev = entier(d.get('rev'), 0, 10 ** 9, -1)
    if not isinstance(p, dict) or rev < 1:
        raise Erreur(400, 'Sauvegarde illisible.')
    texte = json.dumps(p, ensure_ascii=False, separators=(',', ':'))
    if len(texte) > TAILLE_MAX_SAUVEGARDE:
        raise Erreur(413, 'Profil trop gros.')
    l = db.execute('SELECT rev FROM comptes WHERE joueur_id=?', (jid,)).fetchone()
    if l and l['rev'] >= rev:
        return 409, {'erreur': 'Une version plus récente de ton compte existe déjà.', 'rev': l['rev']}
    db.execute("""INSERT INTO comptes(joueur_id, sauvegarde, rev, maj_le, taille) VALUES (?,?,?,?,?)
        ON CONFLICT(joueur_id) DO UPDATE SET sauvegarde=excluded.sauvegarde, rev=excluded.rev, maj_le=excluded.maj_le, taille=excluded.taille""",
               (jid, texte, rev, maintenant(), len(texte)))
    api.joueur_vu(db, jid)
    return 200, {'ok': True, 'rev': rev}


def api_compte_code(req, db):
    """Nouveau code de sauvegarde (l'ancien ne marche plus). Montré au joueur, jamais gardé en clair."""
    jid = api.joueur_obligatoire(req, req.json())
    if not limite(db, 'codesauv:' + jid, 10, 3600):
        raise Erreur(429, 'Trop de nouveaux codes, réessaie plus tard.')
    if api.sanction_active(db, jid, ('suspension',)):
        raise Erreur(403, 'Ton compte est suspendu.')
    return 200, {'code': nouveau_code_sauvegarde(db, jid)}


def api_compte_recuperer(req, db):
    """Sur un autre navigateur / téléphone : le code de sauvegarde redonne l'identité ET la sauvegarde du profil."""
    d = req.json()
    if not limite(db, 'recup:ip:' + req.ip_hash, 10, 3600):
        raise Erreur(429, 'Trop d\'essais. Attends une heure.')
    code = normaliser_code_sauvegarde(d.get('code'))
    if len(code) != 16:
        raise Erreur(400, 'Le code de sauvegarde a 16 lettres et chiffres (ex. ABCD-EFGH-JKLM-NPQR).')
    l = db.execute('SELECT * FROM comptes WHERE code_hash=?', (empreinte_code(code),)).fetchone()
    if not l:
        raise Erreur(404, 'Code de sauvegarde inconnu. Vérifie les lettres, ou demande un nouveau code à un admin.')
    jid = l['joueur_id']
    api.joueur_vu(db, jid)
    return 200, {'id': jid, 'jeton': jid + '.' + api.signer_joueur(jid), 'code_joueur': code_court(jid), 'rev': l['rev'],
                 'profil': charger_json(l['sauvegarde'], None) if l['sauvegarde'] else None}


# ---------- cargaisons : le serveur tire la récompense, la signe, et la donne à UN seul joueur ----------
def signer_cargaison(cid):
    return api.hmac.new(api.secret(), ('cargaison:' + cid).encode(), 'sha256').hexdigest()[:32]


def config_cargaison(ev):
    cfg = dict(CONFIG_CARGAISON)
    cfg.update(charger_json(ev['config'], {}) if ev else {})
    return cfg


def api_cargaison(req, db):
    """Demandée par l'HÔTE au début d'une partie. Réponse : la cargaison prévue (ou rien s'il n'y a pas d'événement)."""
    d = req.json()
    jid = api.joueur_obligatoire(req, d)
    pid = str(d.get('partie_id') or '')
    if not RE_ID_PARTIE.fullmatch(pid):
        raise Erreur(400, 'Identifiant de partie invalide.')
    if not limite(db, 'cargo:' + jid, 30, 3600):
        raise Erreur(429, 'Trop de demandes.')
    if api.sanction_active(db, jid, ('suspension',)):
        return 200, {'cargaison': None}
    ev = evenement_actif(db)
    if not ev:
        return 200, {'cargaison': None}
    cfg = config_cargaison(ev)
    if entier(d.get('nb_joueurs'), 0, 200) < cfg['joueurs_min']:
        return 200, {'cargaison': None}
    if un(db, 'SELECT COUNT(*) FROM cargaisons WHERE partie_id=?', pid) >= cfg['max_par_partie']:
        return 200, {'cargaison': None}
    esprits = {k: v['poids'] for k, v in reglages_esprits(db).items() if v['actif']}
    type_ = tirer(esprits)
    if not type_:
        return 200, {'cargaison': None}
    rarete = tirer({k: v for k, v in poids_raretes(db, cfg).items() if k in RARETES_ESPRIT}) or 'commun'
    pieces = _hasard.randint(cfg['pieces_min'], max(cfg['pieces_min'], cfg['pieces_max'])) // 10 * 10
    objet = None
    vendables = cles_vendables(db)
    possibles = [o for o in cfg['objets'] if o in vendables]
    if possibles and _hasard.randint(1, 100) <= cfg['proba_objet']:
        objet = _hasard.choice(possibles)
    delai = _hasard.randint(cfg['delai_min'], max(cfg['delai_min'], cfg['delai_max']))
    cid = secrets.token_hex(8)
    t = maintenant()
    recompense = {'esprit': type_, 'rarete': rarete, 'pieces': pieces, 'objet': objet}
    db.execute("""INSERT INTO cargaisons(id, evenement_id, partie_id, hote_id, cree_le, ouvrable_le, expire_le, recompense)
        VALUES (?,?,?,?,?,?,?,?)""", (cid, ev['id'], pid, jid, t, t + max(0, delai - 15), t + delai + 1800, json.dumps(recompense)))
    return 201, {'cargaison': {'id': cid, 'sig': signer_cargaison(cid), 'nom': ev['nom'], 'delai': delai, **recompense}}


def api_cargaison_reclamer(req, db):
    """Le joueur qui a ouvert la caisse. Une seule réclamation gagne ; la récompense arrive dans sa boîte."""
    d = req.json()
    jid = api.joueur_obligatoire(req, d)
    cid, sig = str(d.get('id') or ''), str(d.get('sig') or '')
    if not re.fullmatch(r'[0-9a-f]{16}', cid) or not api.hmac.compare_digest(sig, signer_cargaison(cid)):
        raise Erreur(403, 'Cargaison invalide.')
    if not limite(db, 'reclame:' + jid, 20, 3600):
        raise Erreur(429, 'Trop de demandes.')
    if api.sanction_active(db, jid, ('cadeaux', 'suspension')):
        raise Erreur(403, 'Ton compte ne peut pas recevoir de récompense pour le moment.')
    db.execute('BEGIN IMMEDIATE')
    try:
        c = db.execute('SELECT * FROM cargaisons WHERE id=?', (cid,)).fetchone()
        t = maintenant()
        if not c:
            raise Erreur(404, 'Cargaison inconnue.')
        if c['reclame_par']:
            if c['reclame_par'] != jid:
                raise Erreur(409, 'Quelqu\'un a déjà ouvert cette cargaison.')
            l = db.execute('SELECT c.*, r.recu_le, r.ouvert_le FROM cadeaux c JOIN cadeaux_recus r ON r.cadeau_id=c.id AND r.joueur_id=? WHERE c.id=?',
                           (jid, c['cadeau_id'])).fetchone()
            db.execute('COMMIT')
            return 200, {'cadeau': entree_boite(l), 'deja': True}
        if t < c['ouvrable_le']:
            raise Erreur(409, 'La cargaison n\'a pas encore atterri.')
        if t > c['expire_le']:
            raise Erreur(410, 'Cette cargaison a expiré.')
        rec = charger_json(c['recompense'], {})
        ev = db.execute('SELECT nom FROM evenements WHERE id=?', (c['evenement_id'],)).fetchone()
        nom_ev = ev['nom'] if ev else 'Cargaison céleste'
        nom_esprit = esprits_jeu().get(rec.get('esprit'), {}).get('nom', rec.get('esprit'))
        cur = db.execute("""INSERT INTO cadeaux(titre, message, pieces, objets, cible, joueur_id, actif, cree_le, expediteur, origine, esprit)
            VALUES (?,?,?,?, 'joueur', ?, 1, ?, ?, 'cargaison', ?)""",
                         (f'Cargaison : {nom_ev}'[:60], f'Tu as ouvert la cargaison ! {nom_esprit} ({RARETES_ESPRIT.get(rec.get("rarete"), "")}) rejoint ta collection.'[:200],
                          entier(rec.get('pieces'), 0, 100000), json.dumps([rec['objet']] if rec.get('objet') else []), jid, t, nom_ev[:40],
                          json.dumps({'type': rec.get('esprit'), 'rarete': rec.get('rarete')})))
        db.execute('INSERT INTO cadeaux_recus(cadeau_id, joueur_id, recu_le) VALUES (?,?,?)', (cur.lastrowid, jid, t))
        db.execute('UPDATE cargaisons SET reclame_par=?, reclame_le=?, cadeau_id=? WHERE id=?', (jid, t, cur.lastrowid, cid))
        db.execute('INSERT INTO esprits_obtenus(joueur_id, type, rarete, source, cree_le) VALUES (?,?,?,?,?)',
                   (jid, rec.get('esprit') or '?', rec.get('rarete') or 'commun', 'cargaison', t))
        l = db.execute('SELECT c.*, r.recu_le, r.ouvert_le FROM cadeaux c JOIN cadeaux_recus r ON r.cadeau_id=c.id AND r.joueur_id=? WHERE c.id=?',
                       (jid, cur.lastrowid)).fetchone()
        db.execute('COMMIT')
    except BaseException:
        db.execute('ROLLBACK')
        raise
    api.joueur_vu(db, jid)
    return 201, {'cadeau': entree_boite(l), 'deja': False}


# ================================================================ admin : mon compte, administrateurs, sessions
def regles_mdp(mdp, ident):
    if not isinstance(mdp, str) or len(mdp) < 12:
        raise Erreur(400, 'Mot de passe : 12 caractères au moins.')
    if len(mdp) > 200 or mdp.lower() == ident.lower():
        raise Erreur(400, 'Choisis un autre mot de passe.')


def sessions_de(db, admin_id, jeton_actuel=None):
    t = maintenant()
    return [{'id': 's' + l['jeton_hash'][:10], 'cree_le': l['cree_le'], 'vu_le': l['vu_le'], 'navigateur': l['navigateur'],
             'actuelle': l['jeton_hash'] == jeton_actuel}
            for l in db.execute('SELECT * FROM sessions WHERE admin_id=? AND expire_le>? ORDER BY cree_le DESC', (admin_id, t))]


def admin_compte(req, db):
    s = session_admin(req, db, libre=True)
    connexions = [dict(l) for l in db.execute('SELECT ok, navigateur, cree_le FROM connexions_admin WHERE admin_id=? ORDER BY id DESC LIMIT 20',
                                              (s['admin_id'],))]
    return 200, {'identifiant': s['identifiant'], 'role': s['role'], 'role_nom': api.ROLES[s['role']],
                 'sessions': sessions_de(db, s['admin_id'], s['jeton_hash']), 'connexions': connexions,
                 'doit_changer_mdp': bool(s['doit_changer_mdp']), 'liaison': infos_liaison(db, s['admin_id'])}


def admin_mdp(req, db):
    s = session_admin(req, db, ecriture=True, libre=True)
    d = req.json()
    a = db.execute('SELECT hash_mdp FROM admins WHERE id=?', (s['admin_id'],)).fetchone()
    if not api.verifier_mdp(d.get('ancien') if isinstance(d.get('ancien'), str) else '', a['hash_mdp']):
        raise Erreur(403, 'Mot de passe actuel incorrect.')
    regles_mdp(d.get('nouveau'), s['identifiant'])
    if d.get('nouveau') == d.get('ancien'):
        raise Erreur(400, 'Le nouveau mot de passe doit être différent.')
    db.execute('UPDATE admins SET hash_mdp=?, doit_changer_mdp=0 WHERE id=?', (api.hacher_mdp(d['nouveau']), s['admin_id']))
    db.execute('DELETE FROM sessions WHERE admin_id=? AND jeton_hash<>?', (s['admin_id'], s['jeton_hash']))  # les autres appareils sont déconnectés
    journaliser(db, s, 'mot de passe changé', 'admins', f"admin:{s['admin_id']}", req=req)
    return 200, {'ok': True}


def admin_session_fermer(req, db, sid):
    s = session_admin(req, db, ecriture=True, libre=True)
    l = db.execute('SELECT jeton_hash, admin_id FROM sessions WHERE jeton_hash LIKE ?', (sid[1:] + '%',)).fetchone()
    if not l:
        raise Erreur(404, 'Session introuvable.')
    if l['admin_id'] != s['admin_id'] and s['role'] not in api.PERMISSIONS['admins.gerer']:
        raise Erreur(403, 'Tu ne peux fermer que tes propres sessions.')
    db.execute('DELETE FROM sessions WHERE jeton_hash=?', (l['jeton_hash'],))
    journaliser(db, s, 'session fermée à distance', 'admins', f"admin:{l['admin_id']}", req=req)
    return 200, {'ok': True}


def admin_admins(req, db):
    s = session_admin(req, db, permission='admins.voir')
    t = maintenant()
    admins = []
    for l in db.execute('SELECT * FROM admins ORDER BY id'):
        admins.append({'id': l['id'], 'identifiant': l['identifiant'], 'role': l['role'], 'role_nom': api.ROLES.get(l['role'], l['role']),
                       'actif': bool(l['actif']), 'cree_le': l['cree_le'], 'derniere_connexion': l['derniere_connexion'],
                       'doit_changer_mdp': bool(l['doit_changer_mdp']), 'moi': l['id'] == s['admin_id'],
                       'sessions': un(db, 'SELECT COUNT(*) FROM sessions WHERE admin_id=? AND expire_le>?', l['id'], t),
                       'joueur': qui(db, l['joueur_id']), 'liaison_le': l['liaison_le']})
    connexions = [dict(l) for l in db.execute('SELECT identifiant, ok, navigateur, cree_le FROM connexions_admin ORDER BY id DESC LIMIT 60')]
    return 200, {'admins': admins, 'roles': api.ROLES, 'permissions': {r: api.permissions_de(r) for r in api.ROLES},
                 'connexions': connexions, 'peut_gerer': s['role'] in api.PERMISSIONS['admins.gerer']}


def nb_super_actifs(db, sauf=None):
    return un(db, "SELECT COUNT(*) FROM admins WHERE role='super_admin' AND actif=1 AND id<>?", sauf or -1)


def admin_admin_creer(req, db):
    s = session_admin(req, db, ecriture=True, permission='admins.gerer')
    d = req.json()
    exiger_mdp(db, s, d)
    ident = nettoyer(d.get('identifiant'), 60).lower()
    if not re.fullmatch(r'[a-z0-9._-]{3,60}', ident):
        raise Erreur(400, 'Identifiant : 3 à 60 caractères (lettres, chiffres, . _ -).')
    role = d.get('role')
    if role not in api.ROLES:
        raise Erreur(400, 'Rôle inconnu.')
    if db.execute('SELECT 1 FROM admins WHERE identifiant=?', (ident,)).fetchone():
        raise Erreur(409, 'Cet identifiant existe déjà.')
    provisoire = secrets.token_urlsafe(12)
    cur = db.execute('INSERT INTO admins(identifiant, hash_mdp, role, cree_le, doit_changer_mdp, cree_par) VALUES (?,?,?,?,1,?)',
                     (ident, api.hacher_mdp(provisoire), role, maintenant(), s['admin_id']))
    journaliser(db, s, f'compte admin « {ident} » créé ({api.ROLES[role]})', 'admins', f'admin:{cur.lastrowid}', {'role': role}, req=req)
    # le mot de passe provisoire n'est montré qu'une fois ; il doit être changé à la première connexion
    return 201, {'ok': True, 'id': cur.lastrowid, 'identifiant': ident, 'mot_de_passe_provisoire': provisoire}


def admin_admin_modifier(req, db, aid):
    s = session_admin(req, db, ecriture=True, permission='admins.gerer')
    d = req.json()
    exiger_mdp(db, s, d)
    a = db.execute('SELECT * FROM admins WHERE id=?', (aid,)).fetchone()
    if not a:
        raise Erreur(404, 'Compte introuvable.')
    avant = {'role': a['role'], 'actif': a['actif']}
    role, actif = d.get('role', a['role']), 1 if d.get('actif', a['actif']) else 0
    if role not in api.ROLES:
        raise Erreur(400, 'Rôle inconnu.')
    if a['role'] == 'super_admin' and (role != 'super_admin' or not actif) and not nb_super_actifs(db, sauf=aid):
        raise Erreur(409, 'Il faut garder au moins un super administrateur actif.')
    if aid == s['admin_id'] and not actif:
        raise Erreur(409, 'Tu ne peux pas désactiver ton propre compte.')
    db.execute('UPDATE admins SET role=?, actif=? WHERE id=?', (role, actif, aid))
    reponse = {'ok': True}
    if d.get('delier'):
        db.execute('UPDATE admins SET joueur_id=NULL, joueur_attente=NULL, liaison_demande_le=NULL, liaison_le=NULL WHERE id=?', (aid,))
    if d.get('reinitialiser'):
        provisoire = secrets.token_urlsafe(12)
        db.execute('UPDATE admins SET hash_mdp=?, doit_changer_mdp=1 WHERE id=?', (api.hacher_mdp(provisoire), aid))
        reponse['mot_de_passe_provisoire'] = provisoire
    if not actif or d.get('reinitialiser') or role != a['role']:
        db.execute('DELETE FROM sessions WHERE admin_id=?', (aid,))
    journaliser(db, s, f"compte admin « {a['identifiant']} » modifié" + (' (mot de passe réinitialisé)' if d.get('reinitialiser') else '')
                + (' (compte joueur délié)' if d.get('delier') and a['joueur_id'] else ''),
                'admins', f'admin:{aid}', {'avant': avant, 'apres': {'role': role, 'actif': actif}}, req=req)
    return 200, reponse


def admin_admin_supprimer(req, db, aid):
    s = session_admin(req, db, ecriture=True, permission='admins.gerer')
    d = req.json()
    exiger_mdp(db, s, d)
    a = db.execute('SELECT * FROM admins WHERE id=?', (aid,)).fetchone()
    if not a:
        raise Erreur(404, 'Compte introuvable.')
    if aid == s['admin_id']:
        raise Erreur(409, 'Tu ne peux pas supprimer ton propre compte.')
    if a['role'] == 'super_admin' and not nb_super_actifs(db, sauf=aid):
        raise Erreur(409, 'Il faut garder au moins un super administrateur actif.')
    db.execute('DELETE FROM sessions WHERE admin_id=?', (aid,))
    db.execute('DELETE FROM admins WHERE id=?', (aid,))
    journaliser(db, s, f"compte admin « {a['identifiant']} » supprimé", 'admins', f'admin:{aid}', req=req)
    return 200, {'ok': True}


# ================================================================ liaison staff : compte admin <-> compte joueur
# L'admin tape le code de SON compte joueur dans « Mon compte » ; le jeu de ce compte reçoit une demande et doit
# l'accepter (sinon un admin pourrait lier le compte d'un autre). Une fois lié, le compte joueur porte la Tenue Staff,
# tant que le compte admin existe et reste actif. Un compte joueur = au plus un compte admin.
DUREE_DEMANDE_LIAISON = 7 * 86400


def staff_de(db, jid):
    """Nom du rôle si ce joueur est le compte joueur d'un admin actif, sinon None."""
    l = db.execute('SELECT role FROM admins WHERE joueur_id=? AND actif=1', (jid,)).fetchone() if jid else None
    return api.ROLES.get(l['role'], 'Staff') if l else None


def badge_staff(ref):
    """Preuve que le joueur de cette référence publique est du staff (le serveur seul sait la fabriquer)."""
    return api.hmac.new(api.secret(), ('staff:' + ref).encode(), 'sha256').hexdigest()[:32]


def demande_liaison(db, jid):
    l = db.execute("""SELECT id, role, liaison_demande_le FROM admins WHERE joueur_attente=? AND actif=1 AND liaison_demande_le>?
        ORDER BY liaison_demande_le LIMIT 1""", (jid, maintenant() - DUREE_DEMANDE_LIAISON)).fetchone()
    return {'id': l['id'], 'role_nom': api.ROLES.get(l['role'], 'Staff'), 'demande_le': l['liaison_demande_le']} if l else None


def infos_liaison(db, aid):
    """Pour le panel : le compte joueur lié et la demande en attente."""
    a = db.execute('SELECT joueur_id, joueur_attente, liaison_demande_le, liaison_le FROM admins WHERE id=?', (aid,)).fetchone()
    if not a:
        return None
    attente = a['joueur_attente'] if a['joueur_attente'] and (a['liaison_demande_le'] or 0) > maintenant() - DUREE_DEMANDE_LIAISON else None
    return {'joueur': qui(db, a['joueur_id']), 'liaison_le': a['liaison_le'],
            'attente': qui(db, attente), 'demande_le': a['liaison_demande_le'] if attente else None}


def admin_liaison_demander(req, db):
    s = session_admin(req, db, ecriture=True)  # tous les rôles : chacun lie SON propre compte
    d = req.json()
    if not limite(db, f"liaison:{s['admin_id']}", 20, 3600):
        raise Erreur(429, 'Trop de demandes, réessaie plus tard.')
    jid = joueur_par_code(db, d.get('joueur'))
    if db.execute('SELECT 1 FROM admins WHERE joueur_id=? AND id<>?', (jid, s['admin_id'])).fetchone():
        raise Erreur(409, 'Ce compte joueur est déjà lié à un autre compte admin.')
    a = db.execute('SELECT joueur_id FROM admins WHERE id=?', (s['admin_id'],)).fetchone()
    if a['joueur_id'] == jid:
        raise Erreur(409, 'Ton compte admin est déjà lié à ce compte joueur.')
    db.execute('UPDATE admins SET joueur_attente=?, liaison_demande_le=? WHERE id=?', (jid, maintenant(), s['admin_id']))
    journaliser(db, s, f'demande de liaison staff envoyée au compte joueur {code_court(jid)}', 'admins', 'joueur:' + jid, req=req)
    return 200, {'ok': True, 'liaison': infos_liaison(db, s['admin_id'])}


def admin_liaison_retirer(req, db):
    """Annuler la demande en attente (quoi=demande) ou défaire la liaison (la Tenue Staff repart du compte joueur)."""
    s = session_admin(req, db, ecriture=True, libre=True)
    d = req.json()
    a = db.execute('SELECT joueur_id, joueur_attente FROM admins WHERE id=?', (s['admin_id'],)).fetchone()
    if d.get('quoi') == 'demande':
        db.execute('UPDATE admins SET joueur_attente=NULL, liaison_demande_le=NULL WHERE id=?', (s['admin_id'],))
        if a['joueur_attente']:
            journaliser(db, s, f"demande de liaison staff annulée ({code_court(a['joueur_attente'])})", 'admins', 'joueur:' + a['joueur_attente'], req=req)
    else:
        if not a['joueur_id']:
            raise Erreur(409, "Ton compte admin n'est lié à aucun compte joueur.")
        db.execute('UPDATE admins SET joueur_id=NULL, liaison_le=NULL WHERE id=?', (s['admin_id'],))
        journaliser(db, s, f"liaison staff retirée avec le compte joueur {code_court(a['joueur_id'])}", 'admins', 'joueur:' + a['joueur_id'], req=req)
    return 200, {'ok': True, 'liaison': infos_liaison(db, s['admin_id'])}


def api_liaison_repondre(req, db):
    """Le joueur accepte ou refuse, dans le jeu, la demande de liaison d'un compte admin."""
    d = req.json()
    jid = api.joueur_obligatoire(req, d)
    if not limite(db, 'liaison-rep:' + jid, 30, 3600):
        raise Erreur(429, 'Trop de demandes, réessaie plus tard.')
    aid = entier(d.get('id'), 1, 2 ** 31, 0)
    t = maintenant()
    a = db.execute('SELECT * FROM admins WHERE id=? AND joueur_attente=? AND actif=1 AND liaison_demande_le>?',
                   (aid, jid, t - DUREE_DEMANDE_LIAISON)).fetchone()
    if not a:
        raise Erreur(404, "Cette demande de liaison n'existe plus.")
    acteur = {'admin_id': aid}  # dans le journal, l'action apparaît sur le compte admin concerné
    if d.get('accepter') is True:
        if db.execute('SELECT 1 FROM admins WHERE joueur_id=? AND id<>?', (jid, aid)).fetchone():
            raise Erreur(409, 'Ton compte joueur est déjà lié à un autre compte du staff.')
        db.execute('UPDATE admins SET joueur_id=?, joueur_attente=NULL, liaison_demande_le=NULL, liaison_le=? WHERE id=?', (jid, t, aid))
        journaliser(db, acteur, f'liaison staff acceptée dans le jeu : compte joueur {code_court(jid)} lié', 'admins', 'joueur:' + jid, req=req)
    else:
        db.execute('UPDATE admins SET joueur_attente=NULL, liaison_demande_le=NULL WHERE id=?', (aid,))
        journaliser(db, acteur, f'demande de liaison refusée dans le jeu par {code_court(jid)}', 'admins', 'joueur:' + jid, req=req)
    return 200, {'ok': True, 'staff': infos_staff(db, jid)}


def infos_staff(db, jid):
    role = staff_de(db, jid)
    return {'role_nom': role, 'badge': badge_staff(ref_publique(db, jid))} if role else None


def api_staff_verifier(req, db):
    """L'hôte d'une partie vérifie que les joueurs qui portent la Tenue Staff sont vraiment du staff."""
    d = req.json()
    jid = api.joueur_obligatoire(req, d)
    if not limite(db, 'staff-verif:' + jid, 300, 3600):
        raise Erreur(429, 'Trop de demandes, réessaie plus tard.')
    liste = d.get('liste') if isinstance(d.get('liste'), list) else []
    ok = []
    for e in liste[:32]:
        if not isinstance(e, dict) or not isinstance(e.get('ref'), str) or not isinstance(e.get('badge'), str):
            continue
        ref = e['ref'][:24]
        if not re.fullmatch(r'[0-9a-f]{6,24}', ref) or not api.hmac.compare_digest(e['badge'][:64], badge_staff(ref)):
            continue
        l = db.execute('SELECT id FROM joueurs WHERE ref=?', (ref,)).fetchone()
        if l and staff_de(db, l['id']):
            ok.append(ref)
    return 200, {'staff': ok}


# ================================================================ admin : journal, sauvegardes, état du serveur
def admin_journal(req, db):
    session_admin(req, db, permission='journal')
    q = req.query
    conds, params = ['1=1'], []
    if q.get('categorie'):
        conds.append('j.categorie = ?'); params.append(q['categorie'][:20])
    if q.get('admin'):
        conds.append('a.identifiant = ?'); params.append(q['admin'][:60].lower())
    if q.get('q'):
        conds.append("(j.action LIKE ? ESCAPE '\\' OR j.cible LIKE ? ESCAPE '\\')"); params += [motif_like(nettoyer(q['q'], 60))] * 2
    where = ' AND '.join(conds)
    total = un(db, f'SELECT COUNT(*) FROM journal j LEFT JOIN admins a ON a.id=j.admin_id WHERE {where}', *params)
    lignes = []
    for l in db.execute(f"""SELECT j.*, a.identifiant FROM journal j LEFT JOIN admins a ON a.id=j.admin_id WHERE {where}
            ORDER BY j.id DESC LIMIT 50 OFFSET ?""", params + [page_de(req) * 50]):
        e = dict(l)
        e.pop('ip_hash', None)
        e['details'] = charger_json(e['details'], None)
        if e.get('cible', '') and str(e['cible']).startswith('joueur:'):
            e['cible_qui'] = qui(db, e['cible'][7:])
            e['cible'] = 'joueur:' + code_court(e['cible'][7:])
        lignes.append(e)
    cats = [r[0] for r in db.execute('SELECT DISTINCT categorie FROM journal WHERE categorie IS NOT NULL AND categorie<>"" ORDER BY 1')]
    return 200, {'total': total, 'page': page_de(req), 'journal': lignes, 'categories': cats}


def admin_sauvegardes(req, db):
    session_admin(req, db, permission='sauvegardes.voir')
    return 200, {'sauvegardes': liste_sauvegardes(), 'taille_base': os.path.getsize(api.BASE) if os.path.exists(api.BASE) else 0}


def admin_sauvegarde_creer(req, db):
    s = session_admin(req, db, ecriture=True, permission='sauvegardes.creer')
    nom = faire_sauvegarde('manuelle')
    journaliser(db, s, f'sauvegarde faite : {nom}', 'sauvegardes', req=req)
    return 201, {'ok': True, 'nom': nom}


def admin_sauvegarde_restaurer(req, db):
    """Restauration contrôlée : super admin, mot de passe + nom tapé, fichier vérifié, sauvegarde de l'état actuel AVANT."""
    s = session_admin(req, db, ecriture=True, permission='sauvegardes.restaurer')
    d = req.json()
    exiger_mdp(db, s, d)
    nom = str(d.get('nom') or '')
    if not RE_SAUV.fullmatch(nom) or not os.path.isfile(os.path.join(DOSSIER_SAUV, nom)):
        raise Erreur(404, 'Sauvegarde introuvable.')
    exiger_confirmation(d, nom[5:20])
    chemin = os.path.join(DOSSIER_SAUV, nom)
    verifier_sauvegarde(chemin)
    avant = faire_sauvegarde('avant-restauration')
    qui = s['identifiant']
    src = sqlite3.connect(f'file:{chemin}?mode=ro', uri=True)
    try:
        src.backup(db)  # remplace le contenu de la base ouverte, page par page, sous verrou
    finally:
        src.close()
    db.executescript(api.SCHEMA)
    api.migrer(db)
    db.execute('INSERT INTO journal(admin_id, action, cree_le, categorie, details) VALUES (NULL,?,?,?,?)',
               (f'base restaurée depuis {nom} par {qui} (état d\'avant gardé : {avant})', maintenant(), 'sauvegardes', json.dumps({'par': qui})))
    return 200, {'ok': True, 'restauree': nom, 'sauvegarde_avant': avant}


_controle = {'t': 0, 'resultat': None}


def admin_serveur(req, db):
    session_admin(req, db, permission='serveur')
    t = maintenant()
    if time.time() - _controle['t'] > 600:
        _controle['resultat'] = db.execute('PRAGMA quick_check').fetchone()[0]
        _controle['t'] = time.time()
    mesures = [dict(l) for l in db.execute('SELECT * FROM mesures ORDER BY heure DESC LIMIT 48')]
    durees = sorted(api._durees)
    p95 = durees[int(len(durees) * 0.95) - 1] if len(durees) >= 20 else (durees[-1] if durees else None)
    sauv = liste_sauvegardes()
    autos = [x for x in sauv if x['motif'] == 'auto']
    heure = time.strftime('%Y-%m-%d %H', time.gmtime())
    cette_heure = next((m for m in mesures if m['heure'] == heure), None)
    return 200, {
        'api': {'ok': True, 'version': api.VERSION_API, 'demarre_le': int(api.DEMARRE_LE), 'depuis_s': int(time.time() - api.DEMARRE_LE)},
        'base': {'taille': os.path.getsize(api.BASE) if os.path.exists(api.BASE) else 0, 'controle': _controle['resultat'],
                 'joueurs': un(db, 'SELECT COUNT(*) FROM joueurs')},
        'sauvegardes': {'nb': len(sauv), 'derniere': sauv[0] if sauv else None,
                        'derniere_auto_il_y_a_h': round((time.time() - autos[0]['cree_le']) / 3600, 1) if autos else None},
        'services': {'base': _controle['resultat'] == 'ok', 'relais_turn': bool(os.environ.get('NATX_TURN_CLE_ID') and os.environ.get('NATX_TURN_JETON')),
                     'catalogue': bool(cat().get('objets')), 'sauvegarde_auto': bool(autos and time.time() - autos[0]['cree_le'] < 2 * 86400)},
        'temps': {'p95_ms': p95, 'moyen_heure_ms': round(cette_heure['total_ms'] / cette_heure['requetes']) if cette_heure else None,
                  'max_heure_ms': cette_heure['max_ms'] if cette_heure else None, 'echantillon': len(durees)},
        'erreurs': {'dernieres_24h': un(db, 'SELECT COUNT(*) FROM erreurs WHERE cree_le>?', t - 86400),
                    'liste': [dict(l) for l in db.execute('SELECT cree_le, route, type, message FROM erreurs ORDER BY id DESC LIMIT 20')]},
        'joueurs_connectes': un(db, 'SELECT COUNT(*) FROM joueurs WHERE vu_le>?', t - 120),
        'mesures': mesures,
    }


# ================================================================ admin : tableau de bord
def admin_tableau(req, db):
    s = session_admin(req, db, permission='tableau')
    t = maintenant()
    voit_retours = s['role'] in api.PERMISSIONS['retours']
    base = api.admin_tableau(req, db)[1] if voit_retours else {'stats': {}, 'par_categorie': {}, 'populaires': [], 'jours': []}
    c250 = cat().get('tous_250', [])
    ev = [dict(id=l['id'], nom=l['nom'], fin=l['fin']) for l in db.execute(
        'SELECT * FROM evenements WHERE actif=1 AND debut<=? AND fin>? ORDER BY debut', (t, t))]
    jours = {}
    debut14 = t - 13 * 86400
    for nom, sql in (('nouveaux', "SELECT date(cree_le,'unixepoch') j, COUNT(*) n FROM joueurs WHERE cree_le>? GROUP BY j"),
                     ('actifs', "SELECT jour j, COUNT(*) n FROM connexions_joueurs WHERE jour >= date(?,'unixepoch') GROUP BY j"),
                     ('parties', "SELECT date(cree_le,'unixepoch') j, COUNT(DISTINCT partie_id) n FROM parties WHERE cree_le>? GROUP BY j"),
                     ('cadeaux_ouverts', "SELECT date(ouvert_le,'unixepoch') j, COUNT(*) n FROM cadeaux_recus WHERE ouvert_le>? GROUP BY j")):
        for l in db.execute(sql, (debut14 - 86400,)):
            jours.setdefault(l['j'], {})[nom] = l['n']
    serie = []
    for i in range(14):
        j = time.strftime('%Y-%m-%d', time.gmtime(debut14 + i * 86400))
        serie.append({'jour': j, **{k: jours.get(j, {}).get(k, 0) for k in ('nouveaux', 'actifs', 'parties', 'cadeaux_ouverts')}})
    activite = []
    for l in db.execute("SELECT cree_le, mode, nb_joueurs FROM parties GROUP BY partie_id ORDER BY cree_le DESC LIMIT 6"):
        activite.append({'quand': l['cree_le'], 'texte': f"Partie {l['mode']} à {l['nb_joueurs']} joueurs"})
    for l in db.execute('SELECT cree_le FROM joueurs ORDER BY cree_le DESC LIMIT 4'):
        activite.append({'quand': l['cree_le'], 'texte': 'Nouveau joueur'})
    for l in db.execute('SELECT r.ouvert_le, c.titre FROM cadeaux_recus r JOIN cadeaux c ON c.id=r.cadeau_id WHERE r.ouvert_le IS NOT NULL ORDER BY r.ouvert_le DESC LIMIT 4'):
        activite.append({'quand': l['ouvert_le'], 'texte': f"Cadeau ouvert : {l['titre']}"})
    for l in db.execute('SELECT reclame_le FROM cargaisons WHERE reclame_le IS NOT NULL ORDER BY reclame_le DESC LIMIT 3'):
        activite.append({'quand': l['reclame_le'], 'texte': 'Cargaison ouverte'})
    if s['role'] in api.PERMISSIONS['journal']:
        for l in db.execute('SELECT j.cree_le, j.action, a.identifiant FROM journal j LEFT JOIN admins a ON a.id=j.admin_id ORDER BY j.id DESC LIMIT 6'):
            activite.append({'quand': l['cree_le'], 'texte': f"{l['identifiant'] or 'serveur'} : {l['action']}"})
    activite.sort(key=lambda a: a['quand'], reverse=True)
    sauv = liste_sauvegardes()
    base['jeu'] = {
        'joueurs': un(db, 'SELECT COUNT(*) FROM joueurs'), 'connectes': un(db, 'SELECT COUNT(*) FROM joueurs WHERE vu_le>?', t - 120),
        'nouveaux_24h': un(db, 'SELECT COUNT(*) FROM joueurs WHERE cree_le>?', t - 86400),
        'nouveaux_7j': un(db, 'SELECT COUNT(*) FROM joueurs WHERE cree_le>?', t - 7 * 86400),
        'actifs_24h': un(db, 'SELECT COUNT(*) FROM joueurs WHERE vu_le>?', t - 86400),
        'parties_24h': un(db, 'SELECT COUNT(DISTINCT partie_id) FROM parties WHERE cree_le>?', t - 86400),
        'cadeaux_envoyes': un(db, 'SELECT COUNT(*) FROM cadeaux'), 'cadeaux_livres': un(db, 'SELECT COUNT(*) FROM cadeaux_recus'),
        'cadeaux_ouverts': un(db, 'SELECT COUNT(*) FROM cadeaux_recus WHERE ouvert_le IS NOT NULL'),
        'cadeaux_en_attente': un(db, 'SELECT COUNT(*) FROM cadeaux_recus WHERE ouvert_le IS NULL AND annule_le IS NULL'),
        'cosmetiques_anciens': len([o for o in cat().get('objets', []) if not o.get('nouveau250')]),
        'cosmetiques_250_livres': len([o for o in c250 if o.get('livre')]), 'cosmetiques_250_total': len(c250),
        'esprits_obtenus': un(db, 'SELECT COUNT(*) FROM esprits_obtenus'),
        'esprits_par_type': {l['type']: l['n'] for l in db.execute('SELECT type, COUNT(*) n FROM esprits_obtenus GROUP BY type')},
        'evenements_actifs': ev,
        'signalements_nouveaux': un(db, "SELECT COUNT(*) FROM signalements WHERE statut='nouveau'"),
        'sanctions_actives': un(db, 'SELECT COUNT(*) FROM sanctions WHERE leve_le IS NULL AND debut<=? AND (fin IS NULL OR fin>?)', t, t),
        'serveur': {'ok': True, 'depuis_s': int(time.time() - api.DEMARRE_LE), 'erreurs_24h': un(db, 'SELECT COUNT(*) FROM erreurs WHERE cree_le>?', t - 86400)},
        'sauvegardes': {'nb': len(sauv), 'derniere': sauv[0]['cree_le'] if sauv else None},
    }
    base['serie14'] = serie
    base['activite'] = activite[:15]
    return 200, base


# ================================================================ admin : joueurs, sanctions, signalements
def resume_sanctions(db, jid):
    t = maintenant()
    return [l['type'] for l in db.execute('SELECT DISTINCT type FROM sanctions WHERE joueur_id=? AND leve_le IS NULL AND debut<=? AND (fin IS NULL OR fin>?)',
                                          (jid, t, t))]


def admin_joueurs(req, db):
    session_admin(req, db, permission='joueurs.voir')
    q = nettoyer(req.query.get('q'), 40)
    t = maintenant()
    conds, params = ['1=1'], []
    if q:
        hexa = re.sub(r'[^0-9a-f]', '', q.lower())
        if len(hexa) >= 4 and re.fullmatch(r'[0-9A-Fa-f]{4}-?[0-9A-Fa-f]{0,4}', q):
            conds.append('j.id LIKE ?'); params.append(hexa[:8] + '%')
        else:
            conds.append("""(p.pseudo LIKE ? ESCAPE '\\' OR EXISTS (SELECT 1 FROM joueurs_notes n WHERE n.joueur_id=j.id AND (n.surnom LIKE ? ESCAPE '\\' OR n.note LIKE ? ESCAPE '\\'))
                OR EXISTS (SELECT 1 FROM pseudos_joueurs h WHERE h.joueur_id=j.id AND h.pseudo LIKE ? ESCAPE '\\'))""")
            params += [motif_like(q)] * 4
    filtre = req.query.get('filtre')
    if filtre == 'connectes':
        conds.append('j.vu_le > ?'); params.append(t - 120)
    elif filtre == 'nouveaux':
        conds.append('j.cree_le > ?'); params.append(t - 86400)
    elif filtre == 'sanctionnes':
        conds.append('EXISTS (SELECT 1 FROM sanctions s WHERE s.joueur_id=j.id AND s.leve_le IS NULL AND (s.fin IS NULL OR s.fin>?))'); params.append(t)
    elif filtre == 'signales':
        conds.append("EXISTS (SELECT 1 FROM signalements g WHERE g.cible_id=j.id AND g.statut IN ('nouveau','en_cours'))")
    where = ' AND '.join(conds)
    total = un(db, f'SELECT COUNT(*) FROM joueurs j LEFT JOIN profils p ON p.joueur_id=j.id WHERE {where}', *params)
    lignes = db.execute(f"""SELECT j.id, j.cree_le, j.vu_le, p.pseudo, p.niveau,
        (SELECT COUNT(*) FROM parties x WHERE x.joueur_id=j.id) AS parties,
        (SELECT COUNT(*) FROM retours r WHERE r.joueur_id=j.id) AS retours,
        (SELECT COUNT(*) FROM cadeaux_recus c WHERE c.joueur_id=j.id) AS cadeaux,
        (SELECT COUNT(*) FROM signalements g WHERE g.cible_id=j.id) AS signalements
        FROM joueurs j LEFT JOIN profils p ON p.joueur_id=j.id WHERE {where}
        ORDER BY COALESCE(j.vu_le, j.cree_le) DESC LIMIT 50 OFFSET ?""", params + [page_de(req) * 50]).fetchall()
    joueurs = []
    noms = qui_lot(db, [l['id'] for l in lignes])
    for l in lignes:
        j = dict(l)
        j['sanctions'] = resume_sanctions(db, j['id'])
        j['connecte'] = bool(j['vu_le'] and j['vu_le'] > t - 120)
        j['surnom'] = noms[j['id']]['surnom']
        j['code'] = code_court(j.pop('id'))
        joueurs.append(j)
    return 200, {'total': total, 'page': page_de(req), 'joueurs': joueurs}


def nom_objet(cles, noms):
    return [{'cle': c, 'nom': noms.get(c, c)} for c in cles]


def admin_joueur(req, db, code):
    session_admin(req, db, permission='joueurs.voir')
    jid = joueur_par_code(db, code[1:])
    j = db.execute('SELECT * FROM joueurs WHERE id=?', (jid,)).fetchone()
    p = db.execute('SELECT * FROM profils WHERE joueur_id=?', (jid,)).fetchone()
    noms = {o['cle']: o['nom'] for o in tous_les_cosmetiques(db)}
    profil = None
    if p:
        profil = {'pseudo': p['pseudo'], 'niveau': p['niveau'], 'xp': p['xp'], 'pieces': p['pieces'], 'version': p['version'], 'maj_le': p['maj_le'],
                  'possedes': nom_objet(charger_json(p['possedes'], []), noms), 'equipe': charger_json(p['equipe'], {}),
                  'esprits': charger_json(p['esprits'], []), 'stats': charger_json(p['stats'], {})}
    ids_admins = {l['id']: l['identifiant'] for l in db.execute('SELECT id, identifiant FROM admins')}
    sanctions = []
    for l in db.execute('SELECT * FROM sanctions WHERE joueur_id=? ORDER BY id DESC', (jid,)):
        e = dict(l)
        e['par'], e['leve_par_nom'] = ids_admins.get(l['admin_id']) or ('🤖 Robot' if (l['motif'] or '').startswith('🤖') else None), ids_admins.get(l['leve_par'])
        e['active'] = not l['leve_le'] and (not l['fin'] or l['fin'] > maintenant()) and l['debut'] <= maintenant()
        e.pop('joueur_id', None)
        sanctions.append(e)
    signal = lambda col: [{'id': l['id'], 'cree_le': l['cree_le'], 'motif': MOTIFS_SIGNALEMENT.get(l['motif'], l['motif']), 'texte': l['texte'],
                           'statut': l['statut'], 'pseudo': l['cible_pseudo']}
                          for l in db.execute(f'SELECT * FROM signalements WHERE {col}=? ORDER BY id DESC LIMIT 30', (jid,))]
    interventions = [{'cree_le': l['cree_le'], 'action': l['action'], 'par': ids_admins.get(l['admin_id']) or ('🤖 Robot' if l['categorie'] == 'robot' else None)}
                     for l in db.execute('SELECT * FROM journal WHERE cible=? ORDER BY id DESC LIMIT 40', ('joueur:' + jid,))]
    return 200, {
        'code': code_court(jid), 'cree_le': j['cree_le'], 'vu_le': j['vu_le'], 'connecte': bool(j['vu_le'] and j['vu_le'] > maintenant() - 120),
        'staff': (lambda l: {'admin': l['identifiant'], 'role_nom': api.ROLES.get(l['role'], l['role']), 'actif': bool(l['actif'])} if l else None)(
            db.execute('SELECT identifiant, role, actif FROM admins WHERE joueur_id=?', (jid,)).fetchone()),
        'qui': qui(db, jid), 'note': (db.execute('SELECT note FROM joueurs_notes WHERE joueur_id=?', (jid,)).fetchone() or {'note': None})['note'],
        'compte': (lambda c: {'sauvegarde': bool(c and c['sauvegarde']), 'rev': c['rev'] if c else 0, 'maj_le': c['maj_le'] if c else None,
                              'taille': c['taille'] if c else 0, 'code': bool(c and c['code_hash']), 'code_cree_le': c['code_cree_le'] if c else None})(
            db.execute('SELECT * FROM comptes WHERE joueur_id=?', (jid,)).fetchone()),
        'pseudos': [dict(l) for l in db.execute('SELECT pseudo, premier, dernier FROM pseudos_joueurs WHERE joueur_id=? ORDER BY dernier DESC LIMIT 20', (jid,))],
        'profil': profil, 'sanctions': sanctions, 'sanctions_actives': resume_sanctions(db, jid),
        'connexions': [dict(l) for l in db.execute('SELECT jour, premiere, derniere, nb FROM connexions_joueurs WHERE joueur_id=? ORDER BY jour DESC LIMIT 30', (jid,))],
        'parties': [dict(l) for l in db.execute('SELECT cree_le, mode, nb_joueurs, place, kills, duree FROM parties WHERE joueur_id=? ORDER BY cree_le DESC LIMIT 20', (jid,))],
        'cadeaux': [{'id': l['id'], 'titre': l['titre'], 'expediteur': l['expediteur'] or api.EXPEDITEUR_DEFAUT, 'origine': l['origine'],
                     'recu_le': l['recu_le'], 'ouvert_le': l['ouvert_le'], 'annule_le': l['annule_le']}
                    for l in db.execute("""SELECT c.id, c.titre, c.expediteur, c.origine, r.recu_le, r.ouvert_le, r.annule_le FROM cadeaux_recus r
                        JOIN cadeaux c ON c.id=r.cadeau_id WHERE r.joueur_id=? ORDER BY r.recu_le DESC LIMIT 40""", (jid,))],
        'esprits_obtenus': [dict(l) for l in db.execute('SELECT type, rarete, source, cree_le FROM esprits_obtenus WHERE joueur_id=? ORDER BY id DESC LIMIT 40', (jid,))],
        'signalements_recus': signal('cible_id'), 'signalements_faits': signal('auteur_id'),
        'retours': un(db, 'SELECT COUNT(*) FROM retours WHERE joueur_id=?', jid), 'interventions': interventions,
    }


def admin_joueur_surnom(req, db, code):
    """Surnom + note privée pour reconnaître un joueur (visibles seulement dans l'espace admin, jamais dans le jeu)."""
    s = session_admin(req, db, ecriture=True, permission='joueurs.sanctionner')
    jid = joueur_par_code(db, code[1:])
    d = req.json()
    surnom, note = nettoyer(d.get('surnom'), 30) or None, nettoyer(d.get('note'), 300) or None
    avant = db.execute('SELECT surnom, note FROM joueurs_notes WHERE joueur_id=?', (jid,)).fetchone()
    if surnom or note:
        db.execute('INSERT OR REPLACE INTO joueurs_notes(joueur_id, surnom, note, maj_le, maj_par) VALUES (?,?,?,?,?)', (jid, surnom, note, maintenant(), s['admin_id']))
    else:
        db.execute('DELETE FROM joueurs_notes WHERE joueur_id=?', (jid,))
    journaliser(db, s, f'surnom de {code_court(jid)} : « {surnom or "—"} »', 'joueurs', 'joueur:' + jid,
                {'avant': dict(avant) if avant else None, 'apres': {'surnom': surnom, 'note': note}}, req=req)
    return 200, {'ok': True, 'qui': qui(db, jid)}


def admin_joueur_code_sauvegarde(req, db, code):
    """Un joueur a perdu son code : l'admin en fait un nouveau (montré une fois). Donne accès au compte → super admin / admin."""
    s = session_admin(req, db, ecriture=True, permission='joueurs.compte')
    exiger_confirmation(req.json())
    jid = joueur_par_code(db, code[1:])
    nouveau = nouveau_code_sauvegarde(db, jid)
    journaliser(db, s, f'nouveau code de sauvegarde pour {code_court(jid)}', 'joueurs', 'joueur:' + jid, req=req)
    return 200, {'code': nouveau}


def admin_sanctions(req, db):
    session_admin(req, db, permission='joueurs.voir')
    t = maintenant()
    conds = ['1=1']
    params = []
    if req.query.get('actives') == '1':
        conds.append('s.leve_le IS NULL AND (s.fin IS NULL OR s.fin>?)'); params.append(t)
    ids_admins = {l['id']: l['identifiant'] for l in db.execute('SELECT id, identifiant FROM admins')}
    lignes = []
    lignes_s = db.execute(f"SELECT s.* FROM sanctions s WHERE {' AND '.join(conds)} ORDER BY s.id DESC LIMIT 100 OFFSET ?", params + [page_de(req) * 100]).fetchall()
    noms = qui_lot(db, [l['joueur_id'] for l in lignes_s])
    for l in lignes_s:
        e = dict(l)
        e['joueur_qui'] = noms.get(e['joueur_id'])
        e['joueur'] = code_court(e.pop('joueur_id'))
        e['par'], e['leve_par_nom'] = ids_admins.get(l['admin_id']) or ('🤖 Robot' if (l['motif'] or '').startswith('🤖') else None), ids_admins.get(l['leve_par'])
        e['active'] = not l['leve_le'] and (not l['fin'] or l['fin'] > t)
        lignes.append(e)
    return 200, {'sanctions': lignes, 'types': api.TYPES_SANCTIONS}


def admin_sanction_creer(req, db):
    s = session_admin(req, db, ecriture=True, permission='joueurs.sanctionner')
    d = req.json()
    jid = joueur_par_code(db, d.get('joueur'))
    type_ = d.get('type')
    if type_ not in api.TYPES_SANCTIONS:
        raise Erreur(400, 'Type de sanction inconnu.')
    motif = nettoyer(d.get('motif'), 300)
    if len(motif) < 3:
        raise Erreur(400, 'Écris le motif de la sanction.')
    heures = entier(d.get('duree_heures'), 0, 100000, -1)
    if heures != 0 and heures not in DUREES_SANCTION:
        raise Erreur(400, 'Durée inconnue.')
    if type_ == 'suspension' or (heures == 0 and type_ != 'avertissement'):
        exiger_confirmation(d)
    t = maintenant()
    fin = None if heures == 0 or type_ == 'avertissement' else t + heures * 3600
    cur = db.execute('INSERT INTO sanctions(joueur_id, type, motif, debut, fin, admin_id) VALUES (?,?,?,?,?,?)', (jid, type_, motif, t, fin, s['admin_id']))
    journaliser(db, s, f'sanction « {type_} » pour {code_court(jid)} ({api.texte_fin(fin)}) : {motif}', 'sanctions', 'joueur:' + jid,
                {'type': type_, 'fin': fin, 'motif': motif, 'sanction': cur.lastrowid}, req=req)
    return 201, {'ok': True, 'id': cur.lastrowid}


def admin_sanction_lever(req, db, sid):
    s = session_admin(req, db, ecriture=True, permission='joueurs.sanctionner')
    d = req.json()
    l = db.execute('SELECT * FROM sanctions WHERE id=?', (sid,)).fetchone()
    if not l:
        raise Erreur(404, 'Sanction introuvable.')
    if l['leve_le']:
        raise Erreur(409, 'Cette sanction est déjà levée.')
    motif = nettoyer(d.get('motif'), 200) or 'Levée par un admin'
    db.execute('UPDATE sanctions SET leve_le=?, leve_par=?, leve_motif=? WHERE id=?', (maintenant(), s['admin_id'], motif, sid))
    journaliser(db, s, f"sanction #{sid} « {l['type']} » levée pour {code_court(l['joueur_id'])} : {motif}", 'sanctions', 'joueur:' + l['joueur_id'], req=req)
    return 200, {'ok': True}


def admin_signalements(req, db):
    session_admin(req, db, permission='signalements')
    statut = req.query.get('statut')
    conds, params = ['1=1'], []
    if statut in STATUTS_SIGNALEMENT:
        conds.append('statut=?'); params.append(statut)
    where = ' AND '.join(conds)
    total = un(db, f'SELECT COUNT(*) FROM signalements WHERE {where}', *params)
    lignes = []
    brutes = db.execute(f'SELECT * FROM signalements WHERE {where} ORDER BY id DESC LIMIT 50 OFFSET ?', params + [page_de(req) * 50]).fetchall()
    noms = qui_lot(db, [l['auteur_id'] for l in brutes] + [l['cible_id'] for l in brutes])
    for l in brutes:
        e = dict(l)
        e['auteur_qui'], e['cible_qui'] = noms.get(l['auteur_id']), noms.get(l['cible_id'])
        e['auteur'] = code_court(e.pop('auteur_id'))
        cible = e.pop('cible_id')
        e['cible'] = code_court(cible) if cible else None
        e['cible_deja_signale'] = un(db, 'SELECT COUNT(*) FROM signalements WHERE cible_id=?', cible) if cible else 0
        e['motif_nom'] = MOTIFS_SIGNALEMENT.get(e['motif'], e['motif'])
        lignes.append(e)
    return 200, {'total': total, 'signalements': lignes, 'statuts': STATUTS_SIGNALEMENT, 'motifs': MOTIFS_SIGNALEMENT}


def admin_signalement_modifier(req, db, gid):
    s = session_admin(req, db, ecriture=True, permission='signalements')
    d = req.json()
    l = db.execute('SELECT * FROM signalements WHERE id=?', (gid,)).fetchone()
    if not l:
        raise Erreur(404, 'Signalement introuvable.')
    statut = d.get('statut')
    if statut not in STATUTS_SIGNALEMENT:
        raise Erreur(400, 'Statut inconnu.')
    db.execute('UPDATE signalements SET statut=?, note=?, traite_par=?, traite_le=? WHERE id=?',
               (statut, nettoyer(d.get('note'), 500) or l['note'], s['admin_id'], maintenant(), gid))
    journaliser(db, s, f'signalement #{gid} → {STATUTS_SIGNALEMENT[statut]}', 'signalements',
                ('joueur:' + l['cible_id']) if l['cible_id'] else f'signalement:{gid}', req=req)
    return 200, {'ok': True}


# ================================================================ admin : cadeaux (historique, livraisons, problèmes)
def admin_cadeaux(req, db):
    session_admin(req, db, permission='cadeaux.voir')
    q = nettoyer(req.query.get('q'), 40)
    conds, params = ['1=1'], []
    if req.query.get('origine') in ('admin', 'cargaison'):
        conds.append('c.origine=?'); params.append(req.query['origine'])
    if q:
        hexa = re.sub(r'[^0-9a-f]', '', q.lower())
        sous = ["c.titre LIKE ? ESCAPE '\\'", "c.expediteur LIKE ? ESCAPE '\\'", "c.code LIKE ? ESCAPE '\\'",
                "EXISTS (SELECT 1 FROM cadeaux_recus r JOIN profils p ON p.joueur_id=r.joueur_id WHERE r.cadeau_id=c.id AND p.pseudo LIKE ? ESCAPE '\\')"]
        params += [motif_like(q)] * 3 + [motif_like(q)]
        if re.fullmatch(r'[0-9A-Fa-f]{4}-?[0-9A-Fa-f]{4}', q):
            sous += ['c.joueur_id LIKE ?', 'EXISTS (SELECT 1 FROM cadeaux_recus r WHERE r.cadeau_id=c.id AND r.joueur_id LIKE ?)']
            params += [hexa + '%'] * 2
        conds.append('(' + ' OR '.join(sous) + ')')
    where = ' AND '.join(conds)
    total = un(db, f'SELECT COUNT(*) FROM cadeaux c WHERE {where}', *params)
    lignes = db.execute(f"""SELECT c.*, a.identifiant AS auteur,
        (SELECT COUNT(*) FROM cadeaux_recus r WHERE r.cadeau_id=c.id) AS recus,
        (SELECT COUNT(*) FROM cadeaux_recus r WHERE r.cadeau_id=c.id AND r.ouvert_le IS NOT NULL) AS ouverts,
        (SELECT COUNT(*) FROM cadeaux_recus r WHERE r.cadeau_id=c.id AND r.ouvert_le IS NULL AND r.annule_le IS NULL) AS en_attente,
        (SELECT COUNT(*) FROM cadeaux_recus r WHERE r.cadeau_id=c.id AND r.annule_le IS NOT NULL) AS annules
        FROM cadeaux c LEFT JOIN admins a ON a.id=c.admin_id WHERE {where} ORDER BY c.id DESC LIMIT 100 OFFSET ?""",
                        params + [page_de(req) * 100]).fetchall()
    sortie = []
    noms = qui_lot(db, [l['joueur_id'] for l in lignes])
    for l in lignes:
        c = api.contenu_cadeau(l)
        c['joueur_qui'] = noms.get(l['joueur_id'])
        c.update({'cible': l['cible'], 'joueur_code': code_court(l['joueur_id']), 'code': api.formater_code(l['code']),
                  'max_utilisations': l['max_utilisations'], 'actif': l['actif'], 'expire_le': l['expire_le'], 'cree_le': l['cree_le'],
                  'recus': l['recus'], 'ouverts': l['ouverts'], 'en_attente': l['en_attente'], 'annules': l['annules'], 'auteur': l['auteur']})
        sortie.append(c)
    return 200, {'cadeaux': sortie, 'total': total, 'page': page_de(req), 'joueurs': un(db, 'SELECT COUNT(*) FROM joueurs'), 'expediteur_defaut': api.EXPEDITEUR_DEFAUT}


def admin_cadeau_livraisons(req, db, cid):
    session_admin(req, db, permission='cadeaux.voir')
    api.cadeau_existant(db, cid)
    brutes = db.execute("""SELECT r.*, p.pseudo FROM cadeaux_recus r LEFT JOIN profils p ON p.joueur_id=r.joueur_id
                  WHERE r.cadeau_id=? ORDER BY r.recu_le DESC LIMIT 300""", (cid,)).fetchall()
    noms = qui_lot(db, [l['joueur_id'] for l in brutes])
    lignes = [{'joueur': code_court(l['joueur_id']), 'pseudo': l['pseudo'], 'qui': noms.get(l['joueur_id']), 'recu_le': l['recu_le'], 'ouvert_le': l['ouvert_le'],
               'annule_le': l['annule_le'], 'remplace_par': l['remplace_par']} for l in brutes]
    return 200, {'livraisons': lignes}


def admin_cadeau_annuler(req, db, cid):
    """Retirer un cadeau PAS ENCORE OUVERT de la boîte d'un joueur (erreur d'envoi)."""
    s = session_admin(req, db, ecriture=True, permission='cadeaux.reparer')
    jid = joueur_par_code(db, req.json().get('joueur'))
    n = db.execute('UPDATE cadeaux_recus SET annule_le=? WHERE cadeau_id=? AND joueur_id=? AND ouvert_le IS NULL AND annule_le IS NULL',
                   (maintenant(), cid, jid)).rowcount
    if not n:
        raise Erreur(409, 'Rien à annuler : ce joueur l\'a déjà ouvert, ou ne l\'a pas reçu.')
    journaliser(db, s, f'cadeau #{cid} retiré de la boîte de {code_court(jid)}', 'cadeaux', 'joueur:' + jid, req=req)
    return 200, {'ok': True}


def admin_cadeau_renvoyer(req, db, cid):
    """Problème de réception : on envoie une COPIE au joueur (nouveau numéro ; l'ancienne livraison non ouverte est retirée)."""
    s = session_admin(req, db, ecriture=True, permission='cadeaux.reparer')
    d = req.json()
    jid = joueur_par_code(db, d.get('joueur'))
    c = db.execute('SELECT * FROM cadeaux WHERE id=?', (cid,)).fetchone()
    if not c:
        raise Erreur(404, 'Cadeau introuvable.')
    r = db.execute('SELECT * FROM cadeaux_recus WHERE cadeau_id=? AND joueur_id=?', (cid, jid)).fetchone()
    if r and r['ouvert_le']:
        exiger_confirmation(d, 'RENVOYER')  # il l'a déjà ouvert : renvoyer = le donner une 2e fois
    vendables = cles_vendables(db)
    objets = [o for o in charger_json(c['objets'], []) if o in vendables]
    t = maintenant()
    cur = db.execute("""INSERT INTO cadeaux(titre, message, pieces, objets, cible, joueur_id, actif, cree_le, admin_id, expediteur, origine, esprit)
        VALUES (?,?,?,?, 'joueur', ?, 1, ?, ?, ?, ?, ?)""", (c['titre'], c['message'], c['pieces'], json.dumps(objets), jid, t, s['admin_id'],
                                                            c['expediteur'], c['origine'], c['esprit']))
    if r and not r['ouvert_le']:
        db.execute('UPDATE cadeaux_recus SET annule_le=?, remplace_par=? WHERE cadeau_id=? AND joueur_id=?', (t, cur.lastrowid, cid, jid))
    journaliser(db, s, f'cadeau #{cid} renvoyé à {code_court(jid)} (copie #{cur.lastrowid})', 'cadeaux', 'joueur:' + jid, req=req)
    return 201, {'ok': True, 'id': cur.lastrowid}


def admin_cadeaux_problemes(req, db):
    session_admin(req, db, permission='cadeaux.voir')
    t = maintenant()
    vendables = cles_vendables(db)
    inconnus = []
    for l in db.execute('SELECT id, titre, objets FROM cadeaux WHERE actif=1'):
        manque = [o for o in charger_json(l['objets'], []) if o not in vendables]
        if manque:
            inconnus.append({'id': l['id'], 'titre': l['titre'], 'objets': manque})
    vieux = [{'cadeau': l['cadeau_id'], 'titre': l['titre'], 'joueur': code_court(l['joueur_id']), 'qui': qui(db, l['joueur_id']), 'recu_le': l['recu_le']}
             for l in db.execute("""SELECT r.*, c.titre FROM cadeaux_recus r JOIN cadeaux c ON c.id=r.cadeau_id
                 WHERE r.ouvert_le IS NULL AND r.annule_le IS NULL AND r.recu_le < ? ORDER BY r.recu_le LIMIT 100""", (t - 7 * 86400,))]
    expires = [{'cadeau': l['cadeau_id'], 'titre': l['titre'], 'joueur': code_court(l['joueur_id'])}
               for l in db.execute("""SELECT r.*, c.titre FROM cadeaux_recus r JOIN cadeaux c ON c.id=r.cadeau_id
                   WHERE r.ouvert_le IS NULL AND r.annule_le IS NULL AND (c.actif=0 OR (c.expire_le IS NOT NULL AND c.expire_le<=?)) LIMIT 100""", (t,))]
    doubles = un(db, """SELECT COUNT(*) FROM (SELECT cadeau_id, joueur_id, COUNT(*) n FROM cadeaux_recus GROUP BY cadeau_id, joueur_id HAVING n > 1)""")
    return 200, {'objets_inconnus': inconnus, 'non_ouverts_7j': vieux, 'expires_non_ouverts': expires, 'doubles_attributions': doubles,
                 'cargaisons_perdues': un(db, 'SELECT COUNT(*) FROM cargaisons WHERE reclame_par IS NULL AND expire_le<?', t)}


# ================================================================ admin : cosmétiques, collections, boutique, promotions
def admin_cosmetiques(req, db):
    session_admin(req, db, permission='cosmetiques.voir')
    q = req.query
    tous = tous_les_cosmetiques(db)
    total = len(tous)
    sel = tous
    if q.get('cat'):
        sel = [o for o in sel if o['cat'] == q['cat']]
    if q.get('rarete'):
        sel = [o for o in sel if o['rarete'] == q['rarete']]
    if q.get('collection'):
        sel = [o for o in sel if str(o.get('collection')) == q['collection']]
    statut = q.get('statut')
    if statut == 'nouveaux':
        sel = [o for o in sel if o['nouveau250']]
    elif statut == 'anciens':
        sel = [o for o in sel if not o['nouveau250'] and not o.get('ajout')]
    elif statut == 'manquants':
        sel = [o for o in sel if not o['livre']]
    elif statut == 'livres':
        sel = [o for o in sel if o['livre']]
    elif statut == 'hors_vente':
        sel = [o for o in sel if not o['en_vente']]
    elif statut == 'modifies':
        sel = [o for o in sel if o['modifie']]
    elif statut == 'ajouts':
        sel = [o for o in sel if o.get('ajout')]
    if q.get('q'):
        m = nettoyer(q['q'], 40).lower()
        sel = [o for o in sel if m in o['nom'].lower() or m in o['id'] or m in (o.get('ref') or '').lower()]
    page = page_de(req)
    # contrôle des identifiants et des ressources
    vus, doublons = set(), []
    for o in tous:
        if o['cle'] in vus:
            doublons.append(o['cle'])
        vus.add(o['cle'])
    par_cat = {}
    for o in tous:
        c = par_cat.setdefault(o['cat'], {'total': 0, 'livres': 0, 'nouveaux': 0, 'nouveaux_livres': 0})
        c['total'] += 1
        c['livres'] += o['livre']
        c['nouveaux'] += o['nouveau250']
        c['nouveaux_livres'] += o['nouveau250'] and o['livre']
    utilises = {(o.get('fichier'), o.get('objet')) for o in tous if o.get('objet')}
    libres = [r for r in cat().get('ressources', []) if (r['fichier'], r['objet']) not in utilises]
    coll = api.lire_reglage(db, 'collections') or {}
    collections = []
    for c in cat().get('collections', []):
        membres = [o for o in tous if o.get('collection') == c['n']]
        r = coll.get(str(c['n']), {})
        collections.append({'n': c['n'], 'nom_origine': c['nom'], 'nom': r.get('nom') or c['nom'], 'visible': r.get('visible', True),
                            'objets': len(membres), 'livres': sum(1 for o in membres if o['livre'])})
    return 200, {'total': total, 'trouves': len(sel), 'page': page, 'cosmetiques': sel[page * 60:(page + 1) * 60],
                 'controle': {'doublons': doublons, 'par_categorie': par_cat, 'manquants': sum(1 for o in tous if not o['livre']),
                              'ressources_libres': libres},
                 'categories': cat().get('categories', []), 'raretes': cat().get('raretes', {}), 'collections': collections}


def admin_cosmetique_modifier(req, db):
    s = session_admin(req, db, ecriture=True, permission='cosmetiques.modifier')
    d = req.json()
    cle = str(d.get('cle') or '')
    tous = {o['cle']: o for o in tous_les_cosmetiques(db)}
    if cle not in tous:
        raise Erreur(404, 'Cosmétique inconnu.')
    o = tous[cle]
    avant = db.execute('SELECT * FROM cosmetiques_reglages WHERE cle=?', (cle,)).fetchone()
    avant = dict(avant) if avant else {}
    r = dict(avant) or {'cle': cle}
    if 'nom' in d:
        nom = nettoyer(d['nom'], 40)
        r['nom'] = nom if nom and nom != o['nom_origine'] else None
    if 'description' in d:
        r['description'] = nettoyer(d['description'], 200) or None
    if 'rarete' in d:
        if d['rarete'] and d['rarete'] not in cat().get('raretes', {}):
            raise Erreur(400, 'Rareté inconnue.')
        r['rarete'] = d['rarete'] if d['rarete'] and d['rarete'] != o['rarete_origine'] else None
    if 'prix' in d:
        r['prix'] = None if d['prix'] in (None, '') else entier(d['prix'], 0, 100000)
    if 'en_vente' in d:
        if d['en_vente'] and not o['livre']:
            raise Erreur(409, 'Ce cosmétique n\'a pas encore de modèle : il ne peut pas être mis en vente.')
        r['en_vente'] = None if d['en_vente'] is None else (1 if d['en_vente'] else 0)
    if 'collection' in d:
        r['collection'] = None if d['collection'] in (None, '') else entier(d['collection'], 1, 999)
    db.execute("""INSERT OR REPLACE INTO cosmetiques_reglages(cle, nom, description, rarete, prix, en_vente, collection, maj_le, maj_par)
        VALUES (?,?,?,?,?,?,?,?,?)""", (cle, r.get('nom'), r.get('description'), r.get('rarete'), r.get('prix'), r.get('en_vente'),
                                        r.get('collection'), maintenant(), s['admin_id']))
    journaliser(db, s, f'cosmétique {cle} modifié', 'cosmetiques', 'cosmetique:' + cle,
                {'avant': {k: avant.get(k) for k in ('nom', 'description', 'rarete', 'prix', 'en_vente', 'collection')},
                 'apres': {k: r.get(k) for k in ('nom', 'description', 'rarete', 'prix', 'en_vente', 'collection')}}, req=req)
    return 200, {'ok': True}


def slug(texte):
    import unicodedata
    t = texte.replace('œ', 'oe').replace('Œ', 'oe').replace('æ', 'ae')
    t = unicodedata.normalize('NFKD', t).encode('ascii', 'ignore').decode().lower()
    return re.sub(r'[^a-z0-9]+', '_', t).strip('_')[:40]


def admin_cosmetique_ajouter(req, db):
    """Nouvel article de boutique pour un modèle LIVRÉ et pas encore utilisé (jamais d'objet sans ressource)."""
    s = session_admin(req, db, ecriture=True, permission='cosmetiques.modifier')
    d = req.json()
    nom = nettoyer(d.get('nom'), 40)
    if len(nom) < 2:
        raise Erreur(400, 'Donne un nom.')
    rarete = d.get('rarete')
    if rarete not in cat().get('raretes', {}):
        raise Erreur(400, 'Rareté inconnue.')
    tous = tous_les_cosmetiques(db)
    utilises = {(o.get('fichier'), o.get('objet')) for o in tous if o.get('objet')}
    res = next((r for r in cat().get('ressources', []) if r['objet'] == d.get('objet') and r['fichier'] == d.get('fichier')), None)
    if not res:
        raise Erreur(400, 'Choisis un modèle livré par la session modélisation.')
    if (res['fichier'], res['objet']) in utilises:
        raise Erreur(409, 'Ce modèle est déjà utilisé par un autre cosmétique.')
    id_ = slug(nom)
    cle = res['categorie'] + ':' + id_
    if not id_ or any(o['cle'] == cle for o in tous):
        raise Erreur(409, 'Un cosmétique a déjà ce nom dans cette catégorie.')
    db.execute("""INSERT INTO cosmetiques_ajouts(cle, cat, id, nom, description, rarete, prix, fichier, objet, actif, cree_le, cree_par)
        VALUES (?,?,?,?,?,?,?,?,?,1,?,?)""", (cle, res['categorie'], id_, nom, nettoyer(d.get('description'), 200), rarete,
                                              None if d.get('prix') in (None, '') else entier(d.get('prix'), 0, 100000),
                                              res['fichier'], res['objet'], maintenant(), s['admin_id']))
    journaliser(db, s, f'cosmétique ajouté : {cle}', 'cosmetiques', 'cosmetique:' + cle, {'modele': res}, req=req)
    return 201, {'ok': True, 'cle': cle}


def admin_cosmetique_ajout_actif(req, db):
    s = session_admin(req, db, ecriture=True, permission='cosmetiques.modifier')
    d = req.json()
    n = db.execute('UPDATE cosmetiques_ajouts SET actif=? WHERE cle=?', (1 if d.get('actif') else 0, str(d.get('cle') or ''))).rowcount
    if not n:
        raise Erreur(404, 'Ajout introuvable.')
    journaliser(db, s, f"cosmétique ajouté {d.get('cle')} " + ('activé' if d.get('actif') else 'désactivé'), 'cosmetiques', 'cosmetique:' + str(d.get('cle')), req=req)
    return 200, {'ok': True}


def admin_collection(req, db):
    s = session_admin(req, db, ecriture=True, permission='cosmetiques.modifier')
    d = req.json()
    n = entier(d.get('n'), 1, 999, 0)
    if not any(c['n'] == n for c in cat().get('collections', [])):
        raise Erreur(404, 'Collection inconnue.')
    coll = api.lire_reglage(db, 'collections') or {}
    avant = coll.get(str(n), {})
    coll[str(n)] = {'nom': nettoyer(d.get('nom'), 40) or None, 'visible': bool(d.get('visible', True))}
    api.ecrire_reglage(db, 'collections', coll)
    journaliser(db, s, f'collection n°{n} modifiée', 'cosmetiques', f'collection:{n}', {'avant': avant, 'apres': coll[str(n)]}, req=req)
    return 200, {'ok': True}


def admin_boutique(req, db):
    session_admin(req, db, permission='cosmetiques.voir')
    t = maintenant()
    promos = []
    for l in db.execute('SELECT p.*, a.identifiant FROM promotions p LEFT JOIN admins a ON a.id=p.cree_par ORDER BY p.id DESC LIMIT 100'):
        e = dict(l)
        e['cible_valeurs'] = charger_json(e['cible_valeurs'], [])
        e['en_cours'] = bool(l['actif'] and l['debut'] <= t < l['fin'])
        promos.append(e)
    historique = [{'cree_le': l['cree_le'], 'action': l['action'], 'par': l['identifiant']} for l in db.execute(
        """SELECT j.*, a.identifiant FROM journal j LEFT JOIN admins a ON a.id=j.admin_id
        WHERE j.categorie IN ('boutique','cosmetiques') ORDER BY j.id DESC LIMIT 60""")]
    return 200, {'rotation': api.lire_reglage(db, 'boutique') or {}, 'promotions': promos, 'cibles': CIBLES_PROMO, 'historique': historique}


def admin_boutique_modifier(req, db):
    s = session_admin(req, db, ecriture=True, permission='boutique.modifier')
    d = req.json()
    avant = api.lire_reglage(db, 'boutique') or {}
    vendables = cles_vendables(db)
    epingles = [c for c in (d.get('epingles') or []) if isinstance(c, str) and c in vendables][:4]
    retires = [c for c in (d.get('retires') or []) if isinstance(c, str) and c in vendables][:200]
    nouveau = {'vedettes': entier(d.get('vedettes'), 1, 4, 2), 'quotidiens': entier(d.get('quotidiens'), 4, 16, 8),
               'epingles': epingles, 'retires': retires, 'melange': entier(d.get('melange'), 0, 10 ** 6, 0),
               'nouveautes_jours': entier(d.get('nouveautes_jours'), 0, 60, 14)}
    api.ecrire_reglage(db, 'boutique', nouveau)
    journaliser(db, s, 'rotation de la boutique modifiée', 'boutique', 'boutique', {'avant': avant, 'apres': nouveau}, req=req)
    return 200, {'ok': True, 'rotation': nouveau}


def lire_promo(db, d):
    nom = nettoyer(d.get('nom'), 40)
    if len(nom) < 2:
        raise Erreur(400, 'Donne un nom à la promotion.')
    reduction = entier(d.get('reduction'), 0, 100, 0)
    if not 5 <= reduction <= 90:
        raise Erreur(400, 'Réduction : entre 5 % et 90 %.')
    cible = d.get('cible_type')
    if cible not in CIBLES_PROMO:
        raise Erreur(400, 'Choisis sur quoi porte la promotion.')
    valeurs = [str(v)[:60] for v in (d.get('cible_valeurs') or [])][:100]
    if cible == 'categorie' and not all(v in {c['id'] for c in cat().get('categories', [])} for v in valeurs):
        raise Erreur(400, 'Catégorie inconnue.')
    if cible == 'rarete' and not all(v in cat().get('raretes', {}) for v in valeurs):
        raise Erreur(400, 'Rareté inconnue.')
    if cible == 'objets' and not all(v in cles_vendables(db) for v in valeurs):
        raise Erreur(400, 'Objet inconnu ou pas encore livré.')
    if cible != 'tout' and not valeurs:
        raise Erreur(400, 'Choisis au moins une valeur.')
    debut, fin = entier(d.get('debut'), 0, 2 ** 31), entier(d.get('fin'), 0, 2 ** 31)
    if not debut or fin <= debut or fin - debut > 60 * 86400:
        raise Erreur(400, 'Dates invalides (60 jours maximum).')
    return nom, reduction, cible, valeurs, debut, fin


def admin_promo_creer(req, db):
    s = session_admin(req, db, ecriture=True, permission='boutique.modifier')
    nom, reduction, cible, valeurs, debut, fin = lire_promo(db, req.json())
    cur = db.execute('INSERT INTO promotions(nom, reduction, cible_type, cible_valeurs, debut, fin, actif, cree_le, cree_par) VALUES (?,?,?,?,?,?,1,?,?)',
                     (nom, reduction, cible, json.dumps(valeurs), debut, fin, maintenant(), s['admin_id']))
    journaliser(db, s, f'promotion « {nom} » (-{reduction} %) créée', 'boutique', f'promotion:{cur.lastrowid}',
                {'cible': cible, 'valeurs': valeurs, 'debut': debut, 'fin': fin}, req=req)
    return 201, {'ok': True, 'id': cur.lastrowid}


def admin_promo_modifier(req, db, pid):
    s = session_admin(req, db, ecriture=True, permission='boutique.modifier')
    d = req.json()
    if not db.execute('SELECT 1 FROM promotions WHERE id=?', (pid,)).fetchone():
        raise Erreur(404, 'Promotion introuvable.')
    if set(d) - {'actif'}:
        nom, reduction, cible, valeurs, debut, fin = lire_promo(db, d)
        db.execute('UPDATE promotions SET nom=?, reduction=?, cible_type=?, cible_valeurs=?, debut=?, fin=? WHERE id=?',
                   (nom, reduction, cible, json.dumps(valeurs), debut, fin, pid))
    if 'actif' in d:
        db.execute('UPDATE promotions SET actif=? WHERE id=?', (1 if d['actif'] else 0, pid))
    journaliser(db, s, f'promotion #{pid} modifiée', 'boutique', f'promotion:{pid}', d, req=req)
    return 200, {'ok': True}


def admin_promo_supprimer(req, db, pid):
    s = session_admin(req, db, ecriture=True, permission='boutique.modifier')
    if not db.execute('DELETE FROM promotions WHERE id=?', (pid,)).rowcount:
        raise Erreur(404, 'Promotion introuvable.')
    journaliser(db, s, f'promotion #{pid} supprimée', 'boutique', f'promotion:{pid}', req=req)
    return 200, {'ok': True}


# ================================================================ admin : esprits
def admin_esprits(req, db):
    session_admin(req, db, permission='esprits.voir')
    reg = reglages_esprits(db)
    stats = {}
    for l in db.execute('SELECT type, rarete, COUNT(*) n FROM esprits_obtenus GROUP BY type, rarete'):
        stats.setdefault(l['type'], {})[l['rarete']] = l['n']
    joueurs = {l['type']: l['n'] for l in db.execute('SELECT type, COUNT(DISTINCT joueur_id) n FROM esprits_obtenus GROUP BY type')}
    poids = poids_raretes(db)
    total_poids = sum(poids.values()) or 1
    esprits = []
    for t, defn in esprits_jeu().items():
        r = reg.get(t, {})
        esprits.append({'type': t, **defn, 'actif': r.get('actif', True), 'poids': r.get('poids', 10), 'description_admin': r.get('description'),
                        'obtenus': stats.get(t, {}), 'joueurs': joueurs.get(t, 0)})
    total_types = sum(e['poids'] for e in esprits if e['actif']) or 1
    for e in esprits:
        e['chance_cargaison'] = round(100 * e['poids'] / total_types, 1) if e['actif'] else 0
    return 200, {'esprits': esprits, 'raretes': RARETES_ESPRIT, 'poids_raretes': poids,
                 'chances_raretes': {k: round(100 * v / total_poids, 1) for k, v in poids.items()},
                 'total_obtenus': un(db, 'SELECT COUNT(*) FROM esprits_obtenus')}


def admin_esprits_modifier(req, db):
    s = session_admin(req, db, ecriture=True, permission='esprits.modifier')
    d = req.json()
    if isinstance(d.get('poids_raretes'), dict):
        poids = {k: entier(d['poids_raretes'].get(k), 0, 1000) for k in RARETES_ESPRIT}
        if not sum(poids.values()):
            raise Erreur(400, 'Il faut au moins une rareté possible.')
        avant = poids_raretes(db)
        api.ecrire_reglage(db, 'esprits_raretes', poids)
        journaliser(db, s, 'chances des raretés d\'esprits modifiées', 'esprits', 'esprits:raretes', {'avant': avant, 'apres': poids}, req=req)
    type_ = d.get('type')
    if type_ is not None:
        if type_ not in esprits_jeu():
            raise Erreur(404, 'Esprit inconnu.')
        actuel = reglages_esprits(db)[type_]
        actif = bool(d.get('actif', actuel['actif']))
        if not actif and not any(v['actif'] for k, v in reglages_esprits(db).items() if k != type_):
            raise Erreur(409, 'Il faut garder au moins un esprit disponible.')
        nouveau = {'actif': actif, 'poids': entier(d.get('poids', actuel['poids']), 0, 1000, 10),
                   'description': nettoyer(d['description'], 300) or None if 'description' in d else actuel['description']}
        db.execute('INSERT OR REPLACE INTO esprits_reglages(type, actif, poids, description, maj_le, maj_par) VALUES (?,?,?,?,?,?)',
                   (type_, 1 if nouveau['actif'] else 0, nouveau['poids'], nouveau['description'], maintenant(), s['admin_id']))
        journaliser(db, s, f'esprit « {type_} » modifié', 'esprits', 'esprit:' + type_, {'avant': actuel, 'apres': nouveau}, req=req)
    return 200, {'ok': True}


# ================================================================ admin : événements et cargaisons
def lire_evenement(db, d):
    nom = nettoyer(d.get('nom'), 60)
    if len(nom) < 2:
        raise Erreur(400, 'Donne un nom à l\'événement.')
    debut, fin = entier(d.get('debut'), 0, 2 ** 31), entier(d.get('fin'), 0, 2 ** 31)
    if not debut or fin <= debut or fin - debut > 120 * 86400:
        raise Erreur(400, 'Dates invalides (120 jours maximum).')
    c = d.get('config') if isinstance(d.get('config'), dict) else {}
    cfg = {'delai_min': entier(c.get('delai_min'), 30, 1500, 90), 'delai_max': entier(c.get('delai_max'), 30, 1500, 210),
           'max_par_partie': entier(c.get('max_par_partie'), 1, 3, 1), 'joueurs_min': entier(c.get('joueurs_min'), 1, 100, 1),
           'pieces_min': entier(c.get('pieces_min'), 0, 5000, 100), 'pieces_max': entier(c.get('pieces_max'), 0, 5000, 300),
           'proba_objet': entier(c.get('proba_objet'), 0, 100, 15)}
    if cfg['delai_max'] < cfg['delai_min']:
        raise Erreur(400, 'La période d\'apparition doit aller du plus petit au plus grand délai.')
    if cfg['pieces_max'] < cfg['pieces_min']:
        raise Erreur(400, 'Pièces : le maximum doit être plus grand que le minimum.')
    vendables = cles_vendables(db)
    objets = [o for o in (c.get('objets') or []) if isinstance(o, str)][:100]
    if any(o not in vendables for o in objets):
        raise Erreur(400, 'Un objet de récompense n\'existe pas (ou pas encore) dans le jeu.')
    cfg['objets'] = objets
    if isinstance(c.get('raretes'), dict):
        poids = {k: entier(c['raretes'].get(k), 0, 1000) for k in RARETES_ESPRIT}
        if sum(poids.values()):
            cfg['raretes'] = poids
    return nom, nettoyer(d.get('description'), 300), debut, fin, 1 if d.get('actif', True) else 0, cfg


def admin_evenements(req, db):
    session_admin(req, db, permission='evenements.voir')
    t = maintenant()
    evs = []
    for l in db.execute('SELECT e.*, a.identifiant FROM evenements e LEFT JOIN admins a ON a.id=e.cree_par ORDER BY e.debut DESC LIMIT 100'):
        e = dict(l)
        e['config'] = config_cargaison(l)
        e['etat'] = 'en cours' if l['actif'] and l['debut'] <= t < l['fin'] else 'programmé' if l['actif'] and l['debut'] > t else \
            'terminé' if l['fin'] <= t else 'désactivé'
        e['tirages'] = un(db, 'SELECT COUNT(*) FROM cargaisons WHERE evenement_id=?', l['id'])
        e['reclames'] = un(db, 'SELECT COUNT(*) FROM cargaisons WHERE evenement_id=? AND reclame_par IS NOT NULL', l['id'])
        e['par_esprit'] = {}
        for c in db.execute('SELECT recompense FROM cargaisons WHERE evenement_id=? AND reclame_par IS NOT NULL', (l['id'],)):
            r = charger_json(c['recompense'], {})
            e['par_esprit'][r.get('esprit', '?')] = e['par_esprit'].get(r.get('esprit', '?'), 0) + 1
        evs.append(e)
    return 200, {'evenements': evs, 'config_defaut': CONFIG_CARGAISON, 'poids_raretes': poids_raretes(db), 'raretes': RARETES_ESPRIT}


def admin_evenement_creer(req, db):
    s = session_admin(req, db, ecriture=True, permission='evenements.modifier')
    nom, desc, debut, fin, actif, cfg = lire_evenement(db, req.json())
    cur = db.execute("""INSERT INTO evenements(type, nom, description, debut, fin, actif, config, cree_le, cree_par, maj_le)
        VALUES ('cargaison',?,?,?,?,?,?,?,?,?)""", (nom, desc, debut, fin, actif, json.dumps(cfg), maintenant(), s['admin_id'], maintenant()))
    journaliser(db, s, f'événement « {nom} » créé', 'evenements', f'evenement:{cur.lastrowid}', {'debut': debut, 'fin': fin, 'config': cfg}, req=req)
    return 201, {'ok': True, 'id': cur.lastrowid}


def admin_evenement_modifier(req, db, eid):
    s = session_admin(req, db, ecriture=True, permission='evenements.modifier')
    d = req.json()
    l = db.execute('SELECT * FROM evenements WHERE id=?', (eid,)).fetchone()
    if not l:
        raise Erreur(404, 'Événement introuvable.')
    if set(d) == {'actif'}:
        db.execute('UPDATE evenements SET actif=?, maj_le=? WHERE id=?', (1 if d['actif'] else 0, maintenant(), eid))
        journaliser(db, s, f"événement « {l['nom']} » " + ('activé' if d['actif'] else 'désactivé'), 'evenements', f'evenement:{eid}', req=req)
        return 200, {'ok': True}
    nom, desc, debut, fin, actif, cfg = lire_evenement(db, d)
    db.execute('UPDATE evenements SET nom=?, description=?, debut=?, fin=?, actif=?, config=?, maj_le=? WHERE id=?',
               (nom, desc, debut, fin, actif, json.dumps(cfg), maintenant(), eid))
    journaliser(db, s, f'événement « {nom} » modifié', 'evenements', f'evenement:{eid}',
                {'avant': {'debut': l['debut'], 'fin': l['fin'], 'config': charger_json(l['config'], {})}, 'apres': {'debut': debut, 'fin': fin, 'config': cfg}}, req=req)
    return 200, {'ok': True}


def admin_evenement_supprimer(req, db, eid):
    s = session_admin(req, db, ecriture=True, permission='evenements.modifier')
    exiger_confirmation(req.json())
    l = db.execute('SELECT * FROM evenements WHERE id=?', (eid,)).fetchone()
    if not l:
        raise Erreur(404, 'Événement introuvable.')
    if un(db, 'SELECT COUNT(*) FROM cargaisons WHERE evenement_id=?', eid):
        raise Erreur(409, 'Cet événement a déjà un historique de cargaisons : désactive-le au lieu de le supprimer.')
    db.execute('DELETE FROM evenements WHERE id=?', (eid,))
    journaliser(db, s, f"événement « {l['nom']} » supprimé", 'evenements', f'evenement:{eid}', req=req)
    return 200, {'ok': True}


def admin_cargaisons(req, db):
    session_admin(req, db, permission='evenements.voir')
    conds, params = ['1=1'], []
    if req.query.get('evenement'):
        conds.append('evenement_id=?'); params.append(entier(req.query['evenement'], 0, 2 ** 31))
    lignes = []
    for l in db.execute(f"SELECT * FROM cargaisons WHERE {' AND '.join(conds)} ORDER BY cree_le DESC LIMIT 100 OFFSET ?", params + [page_de(req) * 100]):
        lignes.append({'id': l['id'], 'evenement_id': l['evenement_id'], 'partie_id': l['partie_id'], 'hote': code_court(l['hote_id']),
                       'hote_qui': qui(db, l['hote_id']), 'reclame_qui': qui(db, l['reclame_par']) if l['reclame_par'] else None,
                       'cree_le': l['cree_le'], 'recompense': charger_json(l['recompense'], {}),
                       'reclame_par': code_court(l['reclame_par']) if l['reclame_par'] else None, 'reclame_le': l['reclame_le'],
                       'etat': 'ouverte' if l['reclame_par'] else ('perdue' if l['expire_le'] < maintenant() else 'en jeu')})
    return 200, {'cargaisons': lignes}


# ================================================================ routes (passent avant celles d'api.py)
ROUTES = [
    ('GET', r'/api/jeu', api_jeu, True),
    ('POST', r'/api/boite', api_boite, True),
    ('POST', r'/api/boite/ouvrir', api_boite_ouvrir, True),
    ('POST', r'/api/boite/avertissement', api_avertissement_lu, True),
    ('POST', r'/api/profil', api_profil, True),
    ('POST', r'/api/signalements', api_signalement, True),
    ('POST', r'/api/cargaison', api_cargaison, True),
    ('POST', r'/api/compte/charger', api_compte_charger, True),
    ('POST', r'/api/compte/sauvegarder', api_compte_sauvegarder, True),
    ('POST', r'/api/compte/code', api_compte_code, True),
    ('POST', r'/api/compte/recuperer', api_compte_recuperer, True),
    ('POST', r'/api/cargaison/reclamer', api_cargaison_reclamer, True),
    ('POST', r'/api/boite/liaison', api_liaison_repondre, True),
    ('POST', r'/api/staff/verifier', api_staff_verifier, True),
    ('GET', r'/api/admin/tableau', admin_tableau, False),
    ('GET', r'/api/admin/serveur', admin_serveur, False),
    ('GET', r'/api/admin/compte', admin_compte, False),
    ('POST', r'/api/admin/mdp', admin_mdp, False),
    ('POST', r'/api/admin/liaison', admin_liaison_demander, False),
    ('DELETE', r'/api/admin/liaison', admin_liaison_retirer, False),
    ('DELETE', r'/api/admin/sessions/(s[0-9a-f]{10})', admin_session_fermer, False),
    ('GET', r'/api/admin/admins', admin_admins, False),
    ('POST', r'/api/admin/admins', admin_admin_creer, False),
    ('POST', r'/api/admin/admins/(\d+)', admin_admin_modifier, False),
    ('DELETE', r'/api/admin/admins/(\d+)', admin_admin_supprimer, False),
    ('GET', r'/api/admin/journal', admin_journal, False),
    ('GET', r'/api/admin/sauvegardes', admin_sauvegardes, False),
    ('POST', r'/api/admin/sauvegardes', admin_sauvegarde_creer, False),
    ('POST', r'/api/admin/sauvegardes/restaurer', admin_sauvegarde_restaurer, False),
    ('GET', r'/api/admin/joueurs', admin_joueurs, False),
    ('GET', r'/api/admin/joueurs/(j[0-9a-fA-F]{8})', admin_joueur, False),
    ('POST', r'/api/admin/joueurs/(j[0-9a-fA-F]{8})/surnom', admin_joueur_surnom, False),
    ('POST', r'/api/admin/joueurs/(j[0-9a-fA-F]{8})/code-sauvegarde', admin_joueur_code_sauvegarde, False),
    ('GET', r'/api/admin/sanctions', admin_sanctions, False),
    ('POST', r'/api/admin/sanctions', admin_sanction_creer, False),
    ('POST', r'/api/admin/sanctions/(\d+)/lever', admin_sanction_lever, False),
    ('GET', r'/api/admin/signalements', admin_signalements, False),
    ('POST', r'/api/admin/signalements/(\d+)', admin_signalement_modifier, False),
    ('GET', r'/api/admin/cadeaux', admin_cadeaux, False),
    ('GET', r'/api/admin/cadeaux/problemes', admin_cadeaux_problemes, False),
    ('GET', r'/api/admin/cadeaux/(\d+)/livraisons', admin_cadeau_livraisons, False),
    ('POST', r'/api/admin/cadeaux/(\d+)/annuler', admin_cadeau_annuler, False),
    ('POST', r'/api/admin/cadeaux/(\d+)/renvoyer', admin_cadeau_renvoyer, False),
    ('GET', r'/api/admin/cosmetiques', admin_cosmetiques, False),
    ('POST', r'/api/admin/cosmetiques', admin_cosmetique_modifier, False),
    ('POST', r'/api/admin/cosmetiques/ajouts', admin_cosmetique_ajouter, False),
    ('POST', r'/api/admin/cosmetiques/ajouts/actif', admin_cosmetique_ajout_actif, False),
    ('POST', r'/api/admin/collections', admin_collection, False),
    ('GET', r'/api/admin/boutique', admin_boutique, False),
    ('POST', r'/api/admin/boutique', admin_boutique_modifier, False),
    ('POST', r'/api/admin/promotions', admin_promo_creer, False),
    ('POST', r'/api/admin/promotions/(\d+)', admin_promo_modifier, False),
    ('DELETE', r'/api/admin/promotions/(\d+)', admin_promo_supprimer, False),
    ('GET', r'/api/admin/esprits', admin_esprits, False),
    ('POST', r'/api/admin/esprits', admin_esprits_modifier, False),
    ('GET', r'/api/admin/evenements', admin_evenements, False),
    ('POST', r'/api/admin/evenements', admin_evenement_creer, False),
    ('POST', r'/api/admin/evenements/(\d+)', admin_evenement_modifier, False),
    ('DELETE', r'/api/admin/evenements/(\d+)', admin_evenement_supprimer, False),
    ('GET', r'/api/admin/cargaisons', admin_cargaisons, False),
]
