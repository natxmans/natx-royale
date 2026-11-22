"""Livraison quotidienne de 10 cosmétiques — vérifier, ajouter au jeu, publier (mode d'emploi : outils/LIVRAISON-QUOTIDIENNE.md).

  python -X utf8 outils/livraison_jour.py etat                     ce qui existe déjà (ids et noms pris, dernières livraisons)
  python -X utf8 outils/livraison_jour.py verifier AAAA-MM-JJ      contrôle la fiche modeles/jour/AAAA-MM-JJ.json et ses .glb
  python -X utf8 outils/livraison_jour.py ajouter AAAA-MM-JJ       contrôle, puis l'ajoute à js/livraisons_jour.js (le jeu local la voit)
  python -X utf8 outils/livraison_jour.py publier [--essai]        publie SEULEMENT js/livraisons_jour.js + les .glb de modeles/jour/
                                                                   (GitHub, puis catalogue.json du serveur), et vérifie en ligne
  python -X utf8 outils/livraison_jour.py retirer AAAA-MM-JJ       retire une livraison du jeu (en local ; puis « publier »)

La publication part du dépôt EN LIGNE (clone neuf) et n'y copie que les fichiers des livraisons : le travail local pas encore
publié (autres sessions) ne part jamais avec. Le code d'erreur est 1 si quelque chose ne va pas : dans ce cas on ne publie pas.
"""
import json
import os
import re
import shutil
import stat
import struct
import subprocess
import sys
import tempfile
import time
import urllib.request

RACINE = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
FICHIER_JS = os.path.join(RACINE, 'js', 'livraisons_jour.js')
DOSSIER_JOUR = os.path.join(RACINE, 'modeles', 'jour')
ENTETE = ("// Livraisons quotidiennes de cosmétiques (fichier GÉRÉ par outils/livraison_jour.py : ne pas modifier à la main).\n"
          "// Chaque livraison : sa date et ses objets (catégorie, id, nom, rareté, description, fichier .glb dans modeles/).\n"
          "// Lu par js/boutique.js (vente, casier, bots), js/modeles.js (quel .glb charger) et serveur/extraire_catalogue.py.\n")
MARQUE = 'export const LIVRAISONS_JOUR ='
CATEGORIES = ('chapeau', 'dos', 'pioche', 'deltaplane')
RARETES = ('commun', 'rare', 'epique', 'legendaire')
BUDGETS = {'chapeau': 1500, 'dos': 1500, 'pioche': 1500, 'deltaplane': 2500}
POIDS_MAX = 1_500_000  # octets par .glb
DEPOT = 'natxmans/natx-royale'
SITE = 'https://natxmans.github.io/natx-royale/'
SERVEUR = 'https://chrysalide.alwaysdata.net/natx'
SSH_CLE = os.path.expanduser('~/.ssh/chrysalide_alwaysdata')
SSH_COMPTE = 'chrysalide@ssh-chrysalide.alwaysdata.net'
AUTEUR = ['-c', 'user.name=natxmans', '-c', 'user.email=262139013+natxmans@users.noreply.github.com']
SIGNATURE = 'Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>'
RE_DATE = re.compile(r'^20\d\d-[01]\d-[0-3]\d$')
RE_ID = re.compile(r'^[a-z][a-z0-9_]{2,39}$')


def erreur(msg):
    print('ERREUR :', msg)
    sys.exit(1)


# ---------------------------------------------------------------- lecture
def lire_livraisons(chemin=FICHIER_JS):
    if not os.path.isfile(chemin):
        return None
    js = open(chemin, encoding='utf-8').read()
    if MARQUE not in js:
        erreur(f'{chemin} n’a pas la forme attendue')
    return json.loads(js.split(MARQUE, 1)[1].strip().rstrip(';').strip())


def ecrire_livraisons(liste, chemin=FICHIER_JS):
    liste = sorted(liste, key=lambda l: l['date'])
    corps = json.dumps(liste, ensure_ascii=False, indent=1)
    with open(chemin, 'w', encoding='utf-8', newline='\n') as f:
        f.write(ENTETE + MARQUE + ' ' + corps + ';\n')


def ids_et_noms_pris(sauf_date=None):
    """Tous les objets qui existent déjà (catalogue de base, 250, livraisons) : (cat, id) et noms."""
    pris, noms = set(), set()
    b = open(os.path.join(RACINE, 'js', 'boutique.js'), encoding='utf-8').read()
    for m in re.finditer(r"L\(\s*'(\w+)'\s*,\s*'(\w+)'\s*,\s*'((?:[^'\\]|\\.)*)'", b):
        pris.add((m.group(2), m.group(1)))
        noms.add(m.group(3).replace("\\'", "'").lower())
    for ligne in open(os.path.join(RACINE, 'js', 'catalogue250.js'), encoding='utf-8'):
        ligne = ligne.strip().rstrip(',')
        if ligne.startswith('{"id"'):
            e = json.loads(ligne)
            pris.add((e['cat'], e['id']))
            noms.add(e['nom'].lower())
    for l in lire_livraisons() or []:
        if l['date'] == sauf_date:
            continue
        for o in l['objets']:
            pris.add((o['cat'], o['id']))
            noms.add(o['nom'].lower())
    return pris, noms


def glb_racines(chemin):
    """Objets racines d'un .glb → nombre de triangles (avec leurs enfants)."""
    with open(chemin, 'rb') as f:
        if f.read(4) != b'glTF':
            raise ValueError('pas un fichier glTF binaire')
        f.read(8)
        long, _ = struct.unpack('<I4s', f.read(8))
        doc = json.loads(f.read(long).decode('utf-8'))
    acc = doc.get('accessors', [])

    def tris_mesh(i):
        t = 0
        for p in doc['meshes'][i].get('primitives', []):
            if p.get('mode', 4) != 4:
                continue
            n = acc[p['indices']]['count'] if 'indices' in p else acc[p['attributes']['POSITION']]['count']
            t += n // 3
        return t

    def tris_noeud(i):
        n = doc['nodes'][i]
        return (tris_mesh(n['mesh']) if 'mesh' in n else 0) + sum(tris_noeud(c) for c in n.get('children', []))

    racines = doc['scenes'][doc.get('scene', 0)].get('nodes', [])
    return {doc['nodes'][i].get('name', ''): tris_noeud(i) for i in racines}


# ---------------------------------------------------------------- contrôle d'une fiche
def verifier(date, silencieux=False):
    if not RE_DATE.match(date or ''):
        erreur('date attendue au format AAAA-MM-JJ')
    fiche = os.path.join(DOSSIER_JOUR, date + '.json')
    if not os.path.isfile(fiche):
        erreur(f'fiche absente : modeles/jour/{date}.json')
    spec = json.load(open(fiche, encoding='utf-8'))
    pb = []
    if spec.get('date') != date:
        pb.append('« date » de la fiche différente du nom du fichier')
    objets = spec.get('objets') or []
    if len(objets) != 10:
        pb.append(f'{len(objets)} objets au lieu de 10')
    pris, noms = ids_et_noms_pris(sauf_date=date)
    vus, noms_vus, par_fichier = set(), set(), {}
    for o in objets:
        nom_o = f"{o.get('cat')}:{o.get('id')}"
        if o.get('cat') not in CATEGORIES:
            pb.append(f'{nom_o} : catégorie interdite (seulement {", ".join(CATEGORIES)})')
            continue
        if not RE_ID.match(o.get('id') or ''):
            pb.append(f'{nom_o} : id invalide (minuscules, chiffres, _ ; 3 à 40 caractères)')
        if (o['cat'], o.get('id')) in pris or (o['cat'], o.get('id')) in vus:
            pb.append(f'{nom_o} : cet id existe déjà')
        vus.add((o['cat'], o.get('id')))
        n = (o.get('nom') or '').strip()
        if not 3 <= len(n) <= 32:
            pb.append(f'{nom_o} : nom de 3 à 32 caractères')
        if n.lower() in noms or n.lower() in noms_vus:
            pb.append(f'{nom_o} : le nom « {n} » est déjà pris')
        noms_vus.add(n.lower())
        if o.get('rarete') not in RARETES:
            pb.append(f'{nom_o} : rareté parmi {", ".join(RARETES)}')
        if not 10 <= len((o.get('desc') or '').strip()) <= 110:
            pb.append(f'{nom_o} : description de 10 à 110 caractères')
        attendu = f"jour/{date}_{o['cat']}.glb"
        if o.get('fichier') != attendu:
            pb.append(f'{nom_o} : « fichier » doit être {attendu}')
        par_fichier.setdefault(attendu, []).append(o)
    for f, liste in par_fichier.items():
        chemin = os.path.join(RACINE, 'modeles', f)
        if not os.path.isfile(chemin):
            pb.append(f'{f} absent (exporter avec PackJour)')
            continue
        poids = os.path.getsize(chemin)
        if poids > POIDS_MAX:
            pb.append(f'{f} : {poids} octets (maximum {POIDS_MAX})')
        try:
            racines = glb_racines(chemin)
        except (OSError, ValueError, KeyError, struct.error) as e:
            pb.append(f'{f} illisible : {e}')
            continue
        voulus = {o['cat'] + '_' + o['id'] for o in liste}
        for nom in sorted(voulus - set(racines)):
            pb.append(f'{f} : objet {nom} absent')
        for nom in sorted(set(racines) - voulus):
            pb.append(f'{f} : objet en trop {nom}')
        for o in liste:
            t = racines.get(o['cat'] + '_' + o['id'])
            if t is not None and not 50 <= t <= BUDGETS[o['cat']]:
                pb.append(f"{o['cat']}_{o['id']} : {t} triangles (entre 50 et {BUDGETS[o['cat']]})")
    if pb:
        print('PROBLÈMES :')
        for p in pb:
            print('  -', p)
        sys.exit(1)
    if not silencieux:
        print(f'Fiche du {date} OK : 10 objets, fichiers {", ".join(sorted(par_fichier))}')
    return spec


def ajouter(date):
    spec = verifier(date, silencieux=True)
    liste = lire_livraisons()
    if liste is None:
        erreur('js/livraisons_jour.js absent')
    if any(l['date'] == date for l in liste):
        erreur(f'la livraison du {date} est déjà dans le jeu')
    champs = ('cat', 'id', 'nom', 'rarete', 'desc', 'fichier')
    liste.append({'date': date, 'objets': [{k: o[k].strip() if isinstance(o[k], str) else o[k] for k in champs} for o in spec['objets']]})
    ecrire_livraisons(liste)
    print(f'Livraison du {date} ajoutée à js/livraisons_jour.js ({len(liste)} livraisons en tout). À tester dans le jeu, puis « publier ».')


def retirer(date):
    liste = lire_livraisons() or []
    reste = [l for l in liste if l['date'] != date]
    if len(reste) == len(liste):
        erreur(f'pas de livraison du {date}')
    ecrire_livraisons(reste)
    print(f'Livraison du {date} retirée de js/livraisons_jour.js (les .glb restent). Lancer « publier » pour la retirer en ligne.')


def etat():
    pris, noms = ids_et_noms_pris()
    liste = lire_livraisons() or []
    print(f'{len(pris)} objets existent déjà ; {len(liste)} livraisons quotidiennes.')
    for l in liste[-7:]:
        print(f"  {l['date']} : " + ', '.join(f"{o['nom']} ({o['cat']}, {o['rarete']})" for o in l['objets']))
    print('Ids déjà pris par catégorie (à ne pas réutiliser) :')
    for c in CATEGORIES:
        print(f'  {c} :', ' '.join(sorted(i for (k, i) in pris if k == c)))


# ---------------------------------------------------------------- publication
def lancer(cmd, cwd=None, entree=None):
    r = subprocess.run(cmd, cwd=cwd, input=entree, capture_output=True)
    if r.returncode != 0:
        erreur(' '.join(cmd[:3]) + ' … a échoué : ' + (r.stderr or r.stdout).decode('utf-8', 'replace')[-600:])
    return r.stdout.decode('utf-8', 'replace')


def lire_url(url, binaire=False):
    req = urllib.request.Request(url, headers={'User-Agent': 'natx-royale-livraison', 'Cache-Control': 'no-cache'})
    with urllib.request.urlopen(req, timeout=30) as r:
        d = r.read()
    return d if binaire else d.decode('utf-8')


def effacer(dossier):
    def forcer(fonction, chemin, _):
        os.chmod(chemin, stat.S_IWRITE)
        fonction(chemin)
    shutil.rmtree(dossier, onexc=forcer)


def publier(essai=False):
    locales = lire_livraisons()
    if locales is None:
        erreur('js/livraisons_jour.js absent')
    for l in locales:  # tout ce qui va partir doit avoir ses .glb
        for f in {o['fichier'] for o in l['objets']}:
            if not os.path.isfile(os.path.join(RACINE, 'modeles', f)):
                erreur(f'{f} manque (livraison du {l["date"]})')
    tmp = tempfile.mkdtemp(prefix='natx-livraison-')
    depot = os.path.join(tmp, 'depot')
    try:
        print('Clone du dépôt en ligne…')
        lancer(['git', 'clone', '-q', '--depth', '1', f'https://github.com/{DEPOT}.git', depot])
        en_ligne = lire_livraisons(os.path.join(depot, 'js', 'livraisons_jour.js'))
        if en_ligne is None:
            erreur('le jeu en ligne n’a pas encore js/livraisons_jour.js : publier d’abord le système de livraison (à la main, avec accord)')
        dates_locales = {l['date']: l for l in locales}
        for l in en_ligne:
            if l['date'] not in dates_locales:
                print(f"  la livraison du {l['date']} sera RETIRÉE en ligne (absente en local)")
            elif dates_locales[l['date']] != l:
                print(f"  la livraison du {l['date']} sera MODIFIÉE en ligne")
        nouvelles = [l['date'] for l in locales if l['date'] not in {x['date'] for x in en_ligne}]
        copies = []
        shutil.copyfile(FICHIER_JS, os.path.join(depot, 'js', 'livraisons_jour.js'))
        os.makedirs(os.path.join(depot, 'modeles', 'jour'), exist_ok=True)
        for f in sorted({o['fichier'] for l in locales for o in l['objets']}):
            src, dst = os.path.join(RACINE, 'modeles', f), os.path.join(depot, 'modeles', f)
            if not os.path.isfile(dst) or open(src, 'rb').read() != open(dst, 'rb').read():
                shutil.copyfile(src, dst)
                copies.append(f)
        lancer(['git', 'add', '-A', 'js/livraisons_jour.js', 'modeles/jour'], cwd=depot)
        changes = lancer(['git', 'status', '--porcelain'], cwd=depot).strip()
        if not changes:
            print('Rien à publier : le jeu en ligne est déjà à jour.')
            return
        autres = [l for l in changes.splitlines() if not (l[3:].startswith('js/livraisons_jour.js') or l[3:].startswith('modeles/jour/'))]
        if autres:
            erreur('des fichiers inattendus changeraient : ' + ', '.join(autres))
        print('Va partir :\n  ' + '\n  '.join(changes.splitlines()))
        if essai:
            print('ESSAI : rien n’a été publié.')
            return
        titre = f"Livraison du jour {', '.join(nouvelles)} : 10 nouveaux cosmétiques" if nouvelles else 'Livraisons quotidiennes : mise à jour'
        lancer(['git'] + AUTEUR + ['commit', '-q', '-m', titre, '-m', SIGNATURE], cwd=depot)
        lancer(['git', 'push', '-q', 'origin', 'HEAD'], cwd=depot)
        commit = lancer(['git', 'rev-parse', '--short=7', 'HEAD'], cwd=depot).strip()
        print(f'Envoyé sur GitHub : {commit}. Construction du site…')
        for _ in range(48):  # jusqu'à 12 minutes
            s = subprocess.run(['gh', 'api', f'repos/{DEPOT}/pages/builds/latest', '--jq', '.status + " " + .commit[0:7]'],
                               capture_output=True).stdout.decode().strip()
            if s == f'built {commit}':
                break
            if s.startswith('errored'):
                erreur('la construction de GitHub Pages a échoué : ' + s)
            time.sleep(15)
        else:
            erreur('GitHub Pages n’a pas fini de construire en 12 minutes (à revérifier)')
        # vérification en ligne : la liste et chaque .glb
        t = str(int(time.time()))
        js = lire_url(SITE + 'js/livraisons_jour.js?verif=' + t)
        for d in nouvelles:
            if f'"date": "{d}"' not in js:
                erreur(f'la livraison du {d} n’apparaît pas dans le js en ligne')
        for f in copies:
            if lire_url(SITE + 'modeles/' + f + '?verif=' + t, binaire=True)[:4] != b'glTF':
                erreur(f'{f} ne répond pas correctement en ligne')
        print(f'En ligne : {SITE} ({len(copies)} .glb vérifiés)')
        # serveur : catalogue.json refait depuis le clone (ce qui est EN LIGNE), envoyé seul
        lancer([sys.executable, '-X', 'utf8', os.path.join(depot, 'serveur', 'extraire_catalogue.py')])
        cat = open(os.path.join(depot, 'serveur', 'catalogue.json'), 'rb').read()
        cles = {o['cle'] for o in json.loads(cat)['objets']}
        manque = [o['cat'] + ':' + o['id'] for l in locales for o in l['objets'] if o['cat'] + ':' + o['id'] not in cles]
        if manque:
            erreur('catalogue du serveur incomplet : ' + ', '.join(manque[:5]))
        lancer(['ssh', '-i', SSH_CLE, '-o', 'BatchMode=yes', SSH_COMPTE,
                'set -e; test -f ~/natx-serveur/wsgi.py; cat > ~/natx-serveur/catalogue.json.nouveau; '
                'mv -f ~/natx-serveur/catalogue.json.nouveau ~/natx-serveur/catalogue.json; touch ~/natx-serveur/wsgi.py'], entree=cat)
        time.sleep(3)
        if '"ok": true' not in lire_url(SERVEUR + '/api/sante'):
            erreur('le serveur ne répond plus après la mise à jour du catalogue')
        print(f'Serveur : catalogue.json à jour ({len(cles)} objets offrables). Publication terminée.')
    finally:
        effacer(tmp)


if __name__ == '__main__':
    a = sys.argv[1:]
    if not a:
        print(__doc__)
    elif a[0] == 'etat':
        etat()
    elif a[0] == 'verifier' and len(a) == 2:
        verifier(a[1])
    elif a[0] == 'ajouter' and len(a) == 2:
        ajouter(a[1])
    elif a[0] == 'retirer' and len(a) == 2:
        retirer(a[1])
    elif a[0] == 'publier':
        publier(essai='--essai' in a)
    else:
        print(__doc__)
        sys.exit(1)
