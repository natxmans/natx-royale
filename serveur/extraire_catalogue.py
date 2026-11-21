"""Fabrique serveur/catalogue.json à partir du catalogue du jeu (js/boutique.js).

Le serveur s'en sert pour savoir quels objets l'admin peut offrir (et refuser tout le reste).
Lancé tout seul par deployer.sh ; à la main :  python serveur/extraire_catalogue.py
"""
import json
import os
import re
import struct
import sys

ICI = os.path.dirname(os.path.abspath(__file__))
SOURCE = os.path.join(ICI, '..', 'js', 'boutique.js')
SORTIE = os.path.join(ICI, 'catalogue.json')
CH = r"'((?:[^'\\]|\\.)*)'"  # une chaîne JavaScript entre apostrophes


def texte(s):
    return s.replace("\\'", "'").replace('\\\\', '\\')


def extraire(js):
    raretes = {m[0]: {'nom': texte(m[1]), 'couleur': m[2], 'prix': int(m[3]) if m[3] else None}
               for m in re.findall(r"(\w+):\s*\{\s*nom:\s*" + CH + r",\s*couleur:\s*'(#[0-9a-fA-F]{3,8})'(?:,\s*prix:\s*(\d+))?", js)}
    categories = [{'id': m[0], 'nom': texte(m[1]), 'icone': texte(m[3])}
                  for m in re.findall(r"\{\s*id:\s*'(\w+)',\s*nom:\s*" + CH + r",\s*un:\s*" + CH + r",\s*icone:\s*" + CH + r"\s*\}", js)]
    raretes.pop('staff', None)  # Tenue Staff : réservée aux comptes liés au staff, jamais offrable ni vendable
    objets, vus = [], set()
    motif = r"L\(\s*'(\w+)'\s*,\s*'(\w+)'\s*,\s*" + CH + r"\s*,\s*'(\w+)'\s*,\s*" + CH + r"\s*(?:,\s*(true|false))?\s*\)"
    for id_, cat, nom, rarete, desc, gratuit in re.findall(motif, js):
        cle = cat + ':' + id_
        if cle in vus or rarete == 'staff':
            continue
        vus.add(cle)
        objets.append({'cle': cle, 'cat': cat, 'id': id_, 'nom': texte(nom), 'rarete': rarete, 'desc': texte(desc), 'gratuit': gratuit == 'true'})
    # les 250 nouveaux : tous listés (pour l'admin), mais vendables seulement si leur livraison est activée
    tous_250, collections, ressources = cosmetiques_250({o['cle'] for o in objets})
    objets += [{'cle': o['cle'], 'cat': o['cat'], 'id': o['id'], 'nom': o['nom'], 'rarete': o['rarete'], 'desc': o['desc'],
                'gratuit': False, 'nouveau250': True} for o in tous_250 if o['livre']]
    return {'source': 'js/boutique.js + js/catalogue250.js + modeles/integration.json', 'categories': categories, 'raretes': raretes,
            'objets': objets, 'tous_250': tous_250, 'collections': collections, 'ressources': ressources, 'esprits': esprits()}


def objets_glb(chemin):
    """Noms des objets racines d'un .glb (lecture du bloc JSON seulement)."""
    try:
        with open(chemin, 'rb') as f:
            if f.read(4) != b'glTF':
                return []
            f.read(8)
            long, _type = struct.unpack('<I4s', f.read(8))
            doc = json.loads(f.read(long).decode('utf-8'))
        return [doc['nodes'][i].get('name', '') for i in doc['scenes'][doc.get('scene', 0)].get('nodes', [])]
    except (OSError, ValueError, KeyError, struct.error):
        return []


def cosmetiques_250(deja):
    racine = os.path.join(ICI, '..')
    cat250 = os.path.join(racine, 'js', 'catalogue250.js')
    man_f = os.path.join(racine, 'modeles', 'integration.json')
    if not os.path.isfile(cat250):
        return [], [], []
    man = json.load(open(man_f, encoding='utf-8')) if os.path.isfile(man_f) else {}
    livres, ressources, tris = {}, [], {}
    liv_f = os.path.join(racine, 'modeles', 'cosm250_livraison.json')
    if os.path.isfile(liv_f):
        tris = {e['objet']: e.get('triangles') for e in json.load(open(liv_f, encoding='utf-8'))}
    for e in man.get('cosmetiques250', []):
        if not e.get('actif') or not isinstance(e.get('objets'), list):
            continue
        presents = set(objets_glb(os.path.join(racine, 'modeles', e['fichier'])))
        if e.get('fiche'):  # tenues, émotes, traînées : la fiche JSON de la livraison dit ce qui existe (contrôle complet : verifier_catalogue.py)
            try:
                doc = json.load(open(os.path.join(racine, 'modeles', e['fiche']), encoding='utf-8'))
                presents = {e['categorie'] + '_' + f['slug'] for f in (doc.get('tenues') or doc.get('emotes') or doc.get('trainees') or [])}
            except (OSError, ValueError, KeyError):
                presents = set()
        for o in e['objets']:
            if o in presents:
                livres[e['categorie'] + ':' + o.replace(e['categorie'] + '_', '', 1)] = (e['fichier'], o)
        if e['categorie'] in ('chapeau', 'dos', 'pioche', 'deltaplane'):
            ressources += [{'categorie': e['categorie'], 'fichier': e['fichier'], 'objet': o} for o in sorted(presents)
                           if o.startswith(e['categorie'] + '_')]
    sortie, collections = [], {}
    for ligne in open(cat250, encoding='utf-8'):
        ligne = ligne.strip().rstrip(',')
        if ligne.startswith('export const COLLECTIONS_250'):
            collections = {c['n']: c['nom'] for c in json.loads(ligne.split('=', 1)[1].strip().rstrip(';'))}
        if not ligne.startswith('{"id"'):
            continue
        e = json.loads(ligne)
        cle = e['cat'] + ':' + e['id']
        if cle in deja:
            continue
        f, o = livres.get(cle, (None, None))
        sortie.append({'cle': cle, 'cat': e['cat'], 'id': e['id'], 'nom': e['nom'], 'rarete': e['rarete'], 'desc': e['desc'], 'ref': e['ref'],
                       'serie': e['serie'], 'besoin': e['besoin'], 'livre': bool(f), 'fichier': f, 'objet': o, 'triangles': tris.get(o)})
    return sortie, [{'n': n, 'nom': nom} for n, nom in sorted(collections.items())], ressources


def esprits():
    """Les esprits de js/esprits.js (nom, rôle, pouvoirs) : l'admin les affiche, les réglages restent dans le jeu."""
    chemin = os.path.join(ICI, '..', 'js', 'esprits.js')
    if not os.path.isfile(chemin):
        return {}
    js = open(chemin, encoding='utf-8').read()
    sortie = {}
    champs = ('nom', 'role', 'icone', 'couleur', 'clair', 'passif', 'pouvoir', 'descPouvoir')
    for m in re.finditer(r"\n  (\w+): \{(.*?)\n  \},", js, re.S):
        bloc = m.group(2)
        e = {}
        for c in champs:
            v = re.search(c + r":\s*" + CH, bloc)
            if v:
                e[c] = texte(v.group(1))
        r = re.search(r'recharge:\s*(\d+)', bloc)
        if 'nom' in e and r:
            e['recharge'] = int(r.group(1))
            sortie[m.group(1)] = e
    return sortie


if __name__ == '__main__':
    if not os.path.isfile(SOURCE):
        sys.exit('js/boutique.js introuvable : catalogue.json non mis à jour.')
    with open(SOURCE, encoding='utf-8') as f:
        cat = extraire(f.read())
    noms_cat = {c['id'] for c in cat['categories']}
    if len(cat['objets']) < 30 or len(noms_cat) < 5 or any(o['cat'] not in noms_cat or o['rarete'] not in cat['raretes'] for o in cat['objets']):
        sys.exit('Catalogue illisible (boutique.js a changé de forme ?) : catalogue.json non mis à jour.')
    with open(SORTIE, 'w', encoding='utf-8') as f:
        json.dump(cat, f, ensure_ascii=False, indent=1)
    print(f'catalogue.json : {len(cat["objets"])} objets, {len(cat["categories"])} catégories')
