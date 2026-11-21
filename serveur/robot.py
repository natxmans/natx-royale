"""Robot modérateur de NATX ROYALE : il passe tout seul une fois par jour, sur le serveur (même ordinateur de Nathan éteint).

Ce qu'il fait à chaque passage :
  1. Signalements : pour chaque joueur signalé, il regarde ses dernières parties et ses statistiques
     (résultats impossibles, précision trop parfaite, profil modifié…), compte combien de joueurs DIFFÉRENTS
     l'ont signalé, puis décide : sanction selon l'échelle des règles, « à vérifier par un humain », ou rejet.
  2. Avis : il cache le spam (trop court, liens, lettres répétées, doublons, gros mots sans contenu)
     et met « À étudier » les bugs et idées qui ont beaucoup de votes.
  3. Triche PROUVÉE par les parties : les joueurs qui l'avaient signalée reçoivent des pièces (boîte de cadeaux).
  4. Il écrit un rapport (panel → 🤖 Robot) et note chaque action au journal d'audit (catégorie « robot »).

Ses limites (voulues) : il ne sanctionne jamais un compte du staff ; au plus 1 sanction par joueur et par passage ;
jamais plus de 3 jours de suspension ; rien de définitif ; un admin peut lever n'importe laquelle de ses sanctions.
La discussion des parties n'est pas enregistrée : pour les insultes, il ne peut compter que les signalements.
Les parties et statistiques sont envoyées par le jeu de chaque joueur : ce sont des indices, pas des preuves absolues.
Les règles citées sont celles du jeu (js/regles.js) : garder les mêmes numéros et titres.
"""
import json
import re
import threading
import time
import unicodedata

import api
import gestion
from api import Erreur, maintenant, code_court

REGLES = {1: 'Respecte les autres', 2: 'Pas de triche', 3: 'Les bugs, on les signale', 4: 'Un pseudo correct', 5: "Pas d'anti-jeu",
          6: 'Une discussion propre', 7: 'Ta vie privée', 8: 'Ton compte est à toi', 9: 'Des signalements honnêtes', 10: 'Le staff'}
REGLAGES_DEFAUT = {'actif': True, 'heure': 7, 'peut_suspendre': True, 'recompense': 300}  # recompense = pièces offertes (0 = aucune)
MAX_RECOMPENSES_PAR_TRICHEUR = 5  # les 5 premiers joueurs qui l'ont signalé
MAX_RECOMPENSES_PAR_SEMAINE = 3  # par joueur qui signale
P = '🤖 '  # tout ce que le robot écrit commence par ce signe
FENETRE = 14 * 86400  # on compte les signalements des 14 derniers jours
HISTORIQUE = 60 * 86400  # sanctions des 60 derniers jours pour savoir si c'est la 1re fois
_verrou = threading.Lock()

# ---------- Mots interdits (pseudos, avis) ----------
# mots entiers (pour ne pas attraper « Bacon » avec « con ») et morceaux longs sans ambiguïté
MOTS_ENTIERS = {
    'con', 'conne', 'cons', 'connard', 'connards', 'connasse', 'pute', 'putes', 'putain', 'salope', 'salopes', 'pd', 'tg', 'fdp', 'ntm',
    'nique', 'niquer', 'bite', 'bites', 'couille', 'couilles', 'merde', 'batard', 'batards', 'enfoire', 'encule', 'enculer', 'cul',
    'trouduc', 'abruti', 'debile', 'mongol', 'triso', 'nazi', 'nazis', 'hitler', 'negro', 'negre', 'bougnoule', 'youpin', 'pedale',
    'tapette', 'gouine', 'fuck', 'shit', 'bitch', 'slut', 'nigga', 'nigger', 'retard',
}
MOTS_DANS = ('connard', 'connasse', 'salope', 'encule', 'putain', 'niquetamere', 'niquetonpere', 'tamere', 'filsdepute', 'batard',
             'enfoire', 'hitler', 'bougnoule', 'nigger', 'nigga', 'fuck')
MOTS_STAFF = ('admin', 'staff', 'modo', 'moderat', 'officiel', 'natxteam')
_LEET = str.maketrans('0134578@$€', 'oieastbase')


def normaliser(t):
    t = unicodedata.normalize('NFD', str(t or '').lower())
    return ''.join(c for c in t if unicodedata.category(c) != 'Mn').translate(_LEET)


def mots_interdits(t):
    n = normaliser(t)
    trouves = {m for m in re.findall(r'[a-z]+', n) if m in MOTS_ENTIERS}
    colle = re.sub(r'[^a-z]', '', n)
    trouves |= {m for m in MOTS_DANS if m in colle}
    return sorted(trouves)


def charger(texte, defaut):
    try:
        v = json.loads(texte) if texte else defaut
        return v if isinstance(v, type(defaut)) else defaut
    except ValueError:
        return defaut


def reglages(db):
    r = dict(REGLAGES_DEFAUT)
    r.update({k: v for k, v in (api.lire_reglage(db, 'robot') or {}).items() if k in REGLAGES_DEFAUT})
    return r


def jour_txt(t):
    return time.strftime('%d/%m', time.localtime(t))


# ================================================================ enquête sur un joueur signalé pour triche
def analyser_joueur(db, jid, parties_signalees=()):
    """Regarde ses 30 dernières parties et ses statistiques.
    preuves = logiquement impossible (donc données modifiées) ; indices = seulement suspect (un très bon joueur peut le faire)."""
    preuves, indices = [], []
    parties = db.execute('SELECT * FROM parties WHERE joueur_id=? ORDER BY cree_le DESC LIMIT 30', (jid,)).fetchall()
    for p in parties:
        if p['mode'] == 'entrainement':  # mannequins : les éliminations ne veulent rien dire
            continue
        nb, k, d, pl = p['nb_joueurs'] or 0, p['kills'] or 0, p['duree'] or 0, p['place'] or 0
        q = jour_txt(p['cree_le'])
        if nb > 1 and k >= nb:
            preuves.append(f'{k} éliminations dans une partie à {nb} joueurs ({q}) : impossible')
        elif d >= 20 and k >= 8 and k / (d / 60) > 6:
            indices.append(f'{k} éliminations en {d} s ({q}) : très rapide')
        if pl and nb and pl > nb:
            preuves.append(f'{pl}e place sur {nb} joueurs ({q}) : impossible')
        if pl == 1 and p['mode'] == 'br' and nb >= 10 and 0 < d < 45:
            indices.append(f'victoire en {d} s contre {nb - 1} joueurs ({q})')
    # la partie signalée : comparer avec ce que disent les autres joueurs de la même partie
    for pid in {x for x in parties_signalees if x}:
        lignes = db.execute('SELECT joueur_id, place, kills, nb_joueurs, mode FROM parties WHERE partie_id=?', (pid,)).fetchall()
        moi = next((x for x in lignes if x['joueur_id'] == jid), None)
        if not moi or moi['mode'] == 'entrainement':
            continue
        if moi['place'] == 1 and moi['mode'] == 'br' and any(x['place'] == 1 and x['joueur_id'] != jid for x in lignes):
            indices.append('dans la partie signalée, un autre joueur dit aussi avoir gagné')
        nb = max((x['nb_joueurs'] or 0) for x in lignes)
        total = sum((x['kills'] or 0) for x in lignes)
        if nb > 1 and total > nb - 1 and (moi['kills'] or 0) * 2 > nb - 1:
            indices.append(f'dans la partie signalée, les éliminations annoncées ({total}) dépassent le nombre de joueurs ({nb})')
    pr = db.execute('SELECT * FROM profils WHERE joueur_id=?', (jid,)).fetchone()
    if pr:
        st = charger(pr['stats'], {})
        tirs, touches = int(st.get('tirs') or 0), int(st.get('touches') or 0)
        if tirs > 50 and touches > tirs:
            preuves.append('plus de tirs réussis que de tirs : statistiques modifiées')
        elif tirs >= 300 and touches / tirs > 0.75:
            indices.append(f'précision très haute : {round(100 * touches / tirs)} % sur {tirs} tirs')
        n, v = int(st.get('parties') or 0), int(st.get('victoires') or 0)
        if v > n > 0:
            preuves.append('plus de victoires que de parties : statistiques modifiées')
        elif n >= 20 and v / n >= 0.85:
            indices.append(f'{v} victoires sur {n} parties')
        possedes = charger(pr['possedes'], [])
        if 'tenue:staff' in possedes and not gestion.staff_de(db, jid) and not db.execute(
                "SELECT 1 FROM journal WHERE cible=? AND action LIKE 'liaison staff acceptée%'", ('joueur:' + jid,)).fetchone():
            preuves.append('il a la Tenue Staff sans avoir jamais été du staff : profil modifié')
        if (pr['pieces'] or 0) > 300000:
            indices.append(f"{pr['pieces']} pièces, c'est énorme")
    return {'preuves': preuves[:5], 'indices': indices[:5], 'parties': len(parties)}


# ================================================================ décisions
def nb_signaleurs(db, jid, motif):
    """Joueurs DIFFÉRENTS qui l'ont signalé pour ce motif dans les 14 derniers jours.
    On compte les signalements pas encore classés, et ceux que le robot avait rejetés depuis la dernière sanction
    (un joueur signalé plusieurs fois « pour rien » finit quand même par être regardé de près).
    Ceux qui ont déjà mené à une sanction, ou qu'un admin a rejetés, ne comptent plus.
    Même adresse internet = une seule personne (un joueur avec plusieurs navigateurs ne compte qu'une fois)."""
    t = maintenant()
    derniere = db.execute("SELECT MAX(debut) FROM sanctions WHERE joueur_id=? AND leve_le IS NULL AND type IN ('avertissement','suspension')",
                          (jid,)).fetchone()[0] or 0
    return db.execute("""SELECT COUNT(DISTINCT COALESCE(j.ip_hash, s.auteur_id)) FROM signalements s LEFT JOIN joueurs j ON j.id=s.auteur_id
        WHERE s.cible_id=? AND s.motif=? AND s.cree_le>? AND (s.statut IN ('nouveau','en_cours')
            OR (s.statut='rejete' AND s.traite_par IS NULL AND s.cree_le>?))""", (jid, motif, t - FENETRE, derniere)).fetchone()[0]


def pseudos_de(db, jid):
    """Pseudos connus par le serveur (envoyés par le jeu du joueur lui-même, jamais par celui qui signale)."""
    noms = [l['pseudo'] for l in db.execute('SELECT pseudo FROM pseudos_joueurs WHERE joueur_id=? ORDER BY dernier DESC LIMIT 5', (jid,))]
    pr = db.execute('SELECT pseudo FROM profils WHERE joueur_id=?', (jid,)).fetchone()
    if pr and pr['pseudo'] and pr['pseudo'] not in noms:
        noms.insert(0, pr['pseudo'])
    return [n for n in noms if n]


def decider(db, jid, motif, sigs, cfg):
    """→ (statut, note, sanction) ; sanction = (règle, phrase pour le joueur) ou None.
    Un 3e élément 'prouve' = triche prouvée par les parties (ceux qui l'ont signalé sont récompensés)."""
    n = nb_signaleurs(db, jid, motif)
    vieux = min(s['cree_le'] for s in sigs) < maintenant() - FENETRE
    qui = f'{n} joueur(s) différent(s) en 14 jours'
    if motif == 'triche':
        a = analyser_joueur(db, jid, [s['partie_id'] for s in sigs])
        if a['preuves']:
            return 'traite', f"Triche prouvée : {' ; '.join(a['preuves'])}. Signalé par {qui}.", \
                (2, f"tes parties montrent des résultats impossibles ({a['preuves'][0]}).", 'prouve')
        if n >= 3 and a['indices']:
            return 'traite', f"Signalé par {qui} + résultats suspects : {' ; '.join(a['indices'])}.", \
                (2, "plusieurs joueurs t'ont signalé pour triche et tes parties ont des résultats suspects.")
        if a['indices'] or n >= 2:
            return 'en_cours', f"À vérifier par un admin : signalé par {qui}" + (f" ; suspect : {' ; '.join(a['indices'])}" if a['indices'] else
                                                                                 ' ; rien de suspect dans ses parties') + '.', None
        if not a['parties']:
            return 'rejete', 'Aucune partie enregistrée à vérifier et un seul signalement.', None
        return 'rejete', f"Rien de suspect dans ses {a['parties']} dernières parties ni dans ses statistiques (1 seul signalement).", None
    if motif == 'insultes':
        if n >= 2:
            return 'traite', f'Insultes : signalé par {qui}.', (1, "plusieurs joueurs t'ont signalé pour des insultes ou du harcèlement.")
        if vieux:
            return 'rejete', "Un seul signalement en 14 jours (la discussion n'est pas enregistrée : impossible de vérifier).", None
        return 'en_cours', "1 seul signalement pour l'instant (la discussion n'est pas enregistrée) : on attend de voir si d'autres joueurs le signalent.", None
    if motif == 'pseudo':
        noms = pseudos_de(db, jid)
        for nom in noms:
            mots = mots_interdits(nom)
            if mots:
                return 'traite', f"Pseudo « {nom} » : gros mot ({', '.join(mots)}).", \
                    (4, f"ton pseudo « {nom} » n'est pas correct. Change-le dans le menu Jouer (case « Ton pseudo »).")
            if any(m in re.sub(r'[^a-z]', '', normaliser(nom)) for m in MOTS_STAFF):
                return 'traite', f"Pseudo « {nom} » : se fait passer pour le staff.", \
                    (10, f"ton pseudo « {nom} » fait croire que tu es du staff. Change-le dans le menu Jouer.")
        if n >= 3:
            return 'traite', f"Pseudo signalé par {qui} (pseudos : {', '.join(noms) or 'inconnus'}).", \
                (4, "plusieurs joueurs trouvent ton pseudo pas correct. Change-le dans le menu Jouer.")
        return 'en_cours', f"Pseudo à regarder par un admin (pseudos : {', '.join(noms) or 'inconnus'} ; aucun mot interdit trouvé).", None
    if motif == 'antijeu':
        if n >= 3:
            return 'traite', f'Anti-jeu : signalé par {qui}.', (5, "plusieurs joueurs t'ont signalé pour de l'anti-jeu (gâcher la partie des autres).")
        if vieux:
            return 'rejete', 'Pas assez de signalements en 14 jours.', None
        return 'en_cours', f"Anti-jeu signalé par {qui} : on attend d'autres signalements (3 joueurs différents) ou l'avis d'un admin.", None
    return 'en_cours', 'Motif « autre » : un admin doit lire le texte du signalement.', None


def sanctionner(db, jid, regle, phrase, cfg):
    """Échelle des règles : avertissement → suspension 24 h → suspension 3 jours (jamais plus)."""
    if api.sanction_active(db, jid, ('suspension',)):
        return None
    t = maintenant()
    av, su = db.execute("""SELECT SUM(type='avertissement'), SUM(type='suspension') FROM sanctions WHERE joueur_id=? AND leve_le IS NULL
        AND debut>?""", (jid, t - HISTORIQUE)).fetchone()
    av, su = av or 0, su or 0
    if (not av and not su) or not cfg['peut_suspendre']:
        type_, heures = 'avertissement', 0
        suite = ' Si ça continue, ton compte sera suspendu.' if cfg['peut_suspendre'] else ''
    else:
        type_, heures = 'suspension', (24 if not su else 72)
        suite = ''
    motif = f"{P}Règle {regle} ({REGLES[regle]}) : {phrase}{suite}"[:300]
    fin = t + heures * 3600 if heures else None
    cur = db.execute('INSERT INTO sanctions(joueur_id, type, motif, debut, fin, admin_id) VALUES (?,?,?,?,?,NULL)', (jid, type_, motif, t, fin))
    texte = 'avertissement' if type_ == 'avertissement' else f'suspension {heures} h'
    api.journaliser(db, None, f'{P}robot : {texte} pour {code_court(jid)} (règle {regle})', 'robot', 'joueur:' + jid,
                    {'sanction': cur.lastrowid, 'type': type_, 'fin': fin, 'motif': motif})
    return {'id': cur.lastrowid, 'type': type_, 'heures': heures, 'regle': regle, 'joueur': code_court(jid), 'qui': gestion.qui(db, jid)}


def recompenser(db, jid, sigs, cfg, rapport):
    """Triche PROUVÉE par les parties (pas seulement « plusieurs signalements ») : les joueurs qui l'avaient signalé
    reçoivent des pièces dans leur boîte de cadeaux. Garde-fous contre la triche à la récompense :
    une seule fois par (joueur qui signale, tricheur) ; pas le tricheur ni quelqu'un de la même adresse internet que lui
    (son 2e compte) ; une seule personne par adresse ; les 5 premiers seulement ; 3 récompenses par joueur et par semaine."""
    montant = cfg['recompense']
    if montant <= 0:
        return 0
    t = maintenant()
    ip_de = lambda j: (db.execute('SELECT ip_hash FROM joueurs WHERE id=?', (j,)).fetchone() or {'ip_hash': None})['ip_hash']
    ip_tricheur = ip_de(jid)
    # ceux du groupe traité maintenant + ceux que le robot avait rejetés avant d'avoir la preuve (ils avaient raison)
    auteurs = [s['auteur_id'] for s in sigs] + [l['auteur_id'] for l in db.execute(
        """SELECT auteur_id FROM signalements WHERE cible_id=? AND motif='triche' AND cree_le>? AND statut='rejete' AND traite_par IS NULL
        ORDER BY id""", (jid, t - FENETRE))]
    ips, n = set(), 0
    for a in dict.fromkeys(auteurs):
        if n >= MAX_RECOMPENSES_PAR_TRICHEUR:
            break
        ip = ip_de(a)
        if a == jid or (ip and (ip == ip_tricheur or ip in ips)):
            continue
        if db.execute('SELECT 1 FROM robot_recompenses WHERE auteur_id=? AND cible_id=?', (a, jid)).fetchone():
            continue
        if db.execute('SELECT COUNT(*) FROM robot_recompenses WHERE auteur_id=? AND cree_le>?', (a, t - 7 * 86400)).fetchone()[0] >= MAX_RECOMPENSES_PAR_SEMAINE:
            continue
        if api.sanction_active(db, a, ('suspension', 'cadeaux')):
            continue
        cur = db.execute("""INSERT INTO cadeaux(titre, message, pieces, objets, cible, joueur_id, actif, cree_le, expediteur, origine)
            VALUES (?,?,?, '[]', 'joueur', ?, 1, ?, ?, 'robot')""",
                         ('🕵️ Bien vu, merci !', "Ton signalement a aidé à attraper un vrai tricheur. Voici ta récompense. Continue à signaler seulement ce que tu vois vraiment.",
                          montant, a, t, '🤖 Robot modérateur'))
        db.execute('INSERT INTO robot_recompenses(auteur_id, cible_id, cadeau_id, pieces, cree_le) VALUES (?,?,?,?,?)', (a, jid, cur.lastrowid, montant, t))
        api.journaliser(db, None, f'{P}robot : récompense de {montant} pièces pour {code_court(a)} (signalement d\'un tricheur prouvé)', 'robot', 'joueur:' + a,
                        {'cadeau': cur.lastrowid, 'tricheur': code_court(jid)})
        rapport['recompenses'].append({'joueur': code_court(a), 'qui': gestion.qui(db, a), 'pieces': montant, 'tricheur': code_court(jid)})
        if ip:
            ips.add(ip)
        n += 1
    return n


def traiter_signalements(db, cfg, rapport):
    lignes = db.execute(f"""SELECT * FROM signalements WHERE statut='nouveau'
        OR (statut='en_cours' AND traite_par IS NULL AND note LIKE '{P}%') ORDER BY id""").fetchall()
    t = maintenant()

    def fermer(s, statut, note):
        note = (P + note)[:500]
        if s['statut'] != statut or s['note'] != note:
            db.execute('UPDATE signalements SET statut=?, note=?, traite_le=?, traite_par=NULL WHERE id=?', (statut, note, t, s['id']))
            return True
        return False

    groupes = {}
    for s in lignes:
        if not s['cible_id']:
            if fermer(s, 'rejete', 'Joueur introuvable (pas de référence valable dans le signalement).'):
                rapport['signalements'].append({'id': s['id'], 'motif': s['motif'], 'decision': 'rejete', 'note': 'joueur introuvable'})
            continue
        groupes.setdefault((s['cible_id'], s['motif']), []).append(s)
    ordre = {'triche': 0, 'insultes': 1, 'pseudo': 2, 'antijeu': 3, 'autre': 4}
    deja = set()
    for (jid, motif), sigs in sorted(groupes.items(), key=lambda kv: ordre.get(kv[0][1], 9)):
        if gestion.staff_de(db, jid):
            statut, note, sanction = 'en_cours', 'Compte du staff : le robot ne sanctionne jamais le staff, un super admin doit regarder.', None
        else:
            statut, note, sanction = decider(db, jid, motif, sigs, cfg)
        fait = None
        if sanction:
            if jid in deja:
                note += ' Déjà sanctionné aujourd\'hui pour autre chose : pas de 2e sanction.'
            else:
                fait = sanctionner(db, jid, sanction[0], sanction[1], cfg)
                if fait:
                    deja.add(jid)
                    note += ' → ' + ('avertissement' if fait['type'] == 'avertissement' else f"suspension {fait['heures']} h") + '.'
                    rapport['sanctions'].append(fait)
                    if len(sanction) > 2:  # triche prouvée : merci à ceux qui l'ont signalé
                        n_rec = recompenser(db, jid, sigs, cfg, rapport)
                        if n_rec:
                            note += f' {n_rec} joueur(s) récompensé(s) pour le signalement.'
                else:
                    note += ' Déjà suspendu en ce moment : rien de plus.'
        change = [fermer(s, statut, note) for s in sigs]
        if any(change) or fait:
            rapport['signalements'].append({'ids': [s['id'] for s in sigs], 'motif': motif, 'joueur': code_court(jid), 'qui': gestion.qui(db, jid),
                                            'decision': statut, 'note': note})
            if statut == 'en_cours':
                rapport['a_regarder'].append(f"Signalement {'#' + ', #'.join(str(s['id']) for s in sigs)} ({motif}) : {note}")
    # règle 9 : quelqu'un qui signale beaucoup pour rien
    for l in db.execute(f"""SELECT auteur_id, COUNT(*) AS n FROM signalements WHERE statut='rejete' AND traite_par IS NULL AND note LIKE '{P}%'
            AND cree_le>? GROUP BY auteur_id HAVING n>=4""", (t - 7 * 86400,)):
        rapport['a_regarder'].append(f"{code_court(l['auteur_id'])} a fait {l['n']} signalements rejetés en 7 jours (règle 9 : signalements honnêtes).")


def surveiller_parties(db, rapport):
    """Sans signalement : les joueurs dont les parties des dernières 24 h ont des résultats impossibles.
    Le robot ne sanctionne pas sans signalement : il prévient seulement les admins."""
    t = maintenant()
    for l in db.execute('SELECT DISTINCT joueur_id FROM parties WHERE cree_le>? LIMIT 500', (t - 86400,)).fetchall():
        jid = l['joueur_id']
        if gestion.staff_de(db, jid) or api.sanction_active(db, jid, ('suspension',)):
            continue
        # déjà signalé (le robot s'en occupe plus haut) ou déjà sanctionné récemment : les admins le savent déjà
        if db.execute('SELECT 1 FROM signalements WHERE cible_id=? AND cree_le>?', (jid, t - FENETRE)).fetchone() or db.execute(
                "SELECT 1 FROM sanctions WHERE joueur_id=? AND debut>? AND type IN ('avertissement','suspension')", (jid, t - FENETRE)).fetchone():
            continue
        a = analyser_joueur(db, jid)
        if a['preuves']:
            q = gestion.qui(db, jid) or {}
            rapport['a_regarder'].append(f"{code_court(jid)}{' (' + (q.get('surnom') or q.get('pseudo')) + ')' if q.get('surnom') or q.get('pseudo') else ''}"
                                         f" : résultats impossibles sans que personne l'ait signalé ({' ; '.join(a['preuves'][:2])}).")


# ================================================================ avis (bugs, idées)
def traiter_avis(db, cfg, rapport):
    t = maintenant()
    for r in db.execute("SELECT * FROM retours WHERE statut='nouveau' AND spam=0 ORDER BY id").fetchall():
        texte = r['texte'] or ''
        colle = re.sub(r'[^a-z0-9]', '', normaliser(texte))
        raison = None
        if len(colle) < 4:
            raison = 'trop court'
        elif re.search(r'https?://|www\.|discord\.(gg|com)|\.(com|fr|net|io)\b', texte, re.I):
            raison = 'lien ou pub (règle 6)'
        elif len(set(colle)) <= 2 or re.search(r'(.)\1{7,}', colle):
            raison = 'lettres répétées, pas de vrai texte'
        elif mots_interdits(texte) and len(colle) < 40:
            raison = 'gros mots sans vrai contenu (règle 1)'
        else:
            dup = db.execute('SELECT id FROM retours WHERE joueur_id=? AND id<? AND texte=? LIMIT 1', (r['joueur_id'], r['id'], texte)).fetchone()
            if dup:
                raison = f"déjà envoyé (avis #{dup['id']})"
        if raison:
            db.execute('UPDATE retours SET spam=1, maj_le=? WHERE id=?', (t, r['id']))
            rapport['avis']['spam'].append({'id': r['id'], 'raison': raison, 'texte': texte[:80]})
        elif mots_interdits(texte):
            rapport['a_regarder'].append(f"Avis #{r['id']} contient des gros mots mais aussi un vrai message : laissé visible pour un admin.")
    for r in db.execute("""SELECT r.id, r.categorie, r.texte, COUNT(v.joueur_id) AS votes FROM retours r LEFT JOIN votes v ON v.retour_id=r.id
            WHERE r.statut='nouveau' AND r.spam=0 GROUP BY r.id""").fetchall():
        seuil = 3 if r['categorie'] in ('bug', 'collision', 'performance') else 5
        if r['votes'] >= seuil:
            db.execute("UPDATE retours SET statut='a_etudier', maj_le=? WHERE id=?", (t, r['id']))
            rapport['avis']['a_etudier'].append({'id': r['id'], 'categorie': r['categorie'], 'votes': r['votes'], 'texte': r['texte'][:100]})
    depuis = t - 86400
    rapport['avis']['nouveaux'] = {l['categorie']: l['n'] for l in db.execute(
        'SELECT categorie, COUNT(*) AS n FROM retours WHERE cree_le>? AND spam=0 GROUP BY categorie', (depuis,))}
    rapport['avis']['top'] = [{'id': l['id'], 'categorie': l['categorie'], 'votes': l['votes'], 'texte': l['texte'][:100]} for l in db.execute(
        """SELECT r.id, r.categorie, r.texte, COUNT(v.joueur_id) AS votes FROM retours r LEFT JOIN votes v ON v.retour_id=r.id
        WHERE r.spam=0 AND r.statut IN ('nouveau','a_etudier','en_cours') GROUP BY r.id HAVING votes>0 ORDER BY votes DESC, r.id DESC LIMIT 5""")]


# ================================================================ un passage complet
def passer(db, declenche='auto'):
    cfg = reglages(db)
    rapport = {'signalements': [], 'sanctions': [], 'recompenses': [], 'a_regarder': [], 'avis': {'spam': [], 'a_etudier': [], 'nouveaux': {}, 'top': []}}
    db.execute('BEGIN IMMEDIATE')
    try:
        traiter_signalements(db, cfg, rapport)
        surveiller_parties(db, rapport)
        traiter_avis(db, cfg, rapport)
        nb_sig = sum(len(s.get('ids', [1])) for s in rapport['signalements'])
        resume = (f"{nb_sig} signalement(s) traité(s), {len(rapport['sanctions'])} sanction(s), {len(rapport['recompenses'])} récompense(s), "
                  f"{len(rapport['a_regarder'])} chose(s) à regarder par un humain, "
                  f"{sum(rapport['avis']['nouveaux'].values())} avis en 24 h ({len(rapport['avis']['spam'])} caché(s) comme spam, "
                  f"{len(rapport['avis']['a_etudier'])} passé(s) « À étudier »).")
        cur = db.execute('INSERT INTO robot_rapports(cree_le, declenche, resume, details) VALUES (?,?,?,?)',
                         (maintenant(), declenche[:60], resume, json.dumps(rapport, ensure_ascii=False)[:200000]))
        db.execute('DELETE FROM robot_rapports WHERE id <= ?', (cur.lastrowid - 120,))  # on garde les 120 derniers
        api.journaliser(db, None, f'{P}robot : passage ({declenche}) — {resume}', 'robot', None)
        db.execute('COMMIT')
    except Exception:
        db.execute('ROLLBACK')
        raise
    return {'id': cur.lastrowid, 'resume': resume, 'details': rapport}


_prochaine_verif = [0.0]


def passage_auto_si_besoin():
    """Une fois par jour, après l'heure choisie. Appelé à chaque requête (aucune tâche planifiée à régler sur
    l'hébergeur) : le test en mémoire ne coûte rien, la base n'est consultée qu'une fois toutes les 5 minutes.
    Il passe donc à la première visite du jeu ou du panel après l'heure choisie."""
    if time.time() < _prochaine_verif[0]:
        return None
    _prochaine_verif[0] = time.time() + 300
    try:
        lt = time.localtime()
        jour = time.strftime('%Y-%m-%d', lt)
        db = api.connexion()
        try:
            cfg = reglages(db)
            if not cfg['actif'] or lt.tm_hour < cfg['heure'] or api.lire_reglage(db, 'robot_dernier_jour') == jour:
                return None
            if not _verrou.acquire(blocking=False):
                return None
            try:
                if api.lire_reglage(db, 'robot_dernier_jour') == jour:
                    return None
                api.ecrire_reglage(db, 'robot_dernier_jour', jour)
                return passer(db, 'automatique')
            finally:
                _verrou.release()
        finally:
            db.close()
    except Exception as e:  # le robot ne doit jamais bloquer le jeu
        api.noter_erreur('/robot', e)
        return None


# ================================================================ panel admin
def admin_robot(req, db):
    api.session_admin(req, db, permission=('signalements', 'retours'))
    rapports = [{'id': l['id'], 'cree_le': l['cree_le'], 'declenche': l['declenche'], 'resume': l['resume'], 'details': charger(l['details'], {})}
                for l in db.execute('SELECT * FROM robot_rapports ORDER BY id DESC LIMIT 30')]
    return 200, {'reglages': reglages(db), 'dernier_jour': api.lire_reglage(db, 'robot_dernier_jour'), 'rapports': rapports,
                 'regles': [{'n': n, 'titre': t} for n, t in REGLES.items()]}


def admin_robot_reglages(req, db):
    s = api.session_admin(req, db, ecriture=True, permission='robot.regler')
    d = req.json()
    avant = reglages(db)
    apres = {'actif': bool(d.get('actif', avant['actif'])), 'peut_suspendre': bool(d.get('peut_suspendre', avant['peut_suspendre'])),
             'heure': gestion.entier(d.get('heure'), 0, 23, avant['heure']),
             'recompense': gestion.entier(d.get('recompense'), 0, 2000, avant['recompense'])}
    api.ecrire_reglage(db, 'robot', apres)
    api.journaliser(db, s, f'{P}réglages du robot modifiés', 'robot', None, {'avant': avant, 'apres': apres}, req=req)
    return 200, {'ok': True, 'reglages': apres}


def admin_robot_lancer(req, db):
    s = api.session_admin(req, db, ecriture=True, permission='signalements')
    if not _verrou.acquire(timeout=20):
        raise Erreur(409, 'Le robot est déjà en train de passer, réessaie dans un instant.')
    try:
        r = passer(db, 'à la main par ' + s['identifiant'])
    finally:
        _verrou.release()
    return 200, r


ROUTES = [
    ('GET', r'/api/admin/robot', admin_robot, False),
    ('POST', r'/api/admin/robot/reglages', admin_robot_reglages, False),
    ('POST', r'/api/admin/robot/lancer', admin_robot_lancer, False),
]
