"""Fabrique serveur/catalogue.json à partir du catalogue du jeu (js/boutique.js).

Le serveur s'en sert pour savoir quels objets l'admin peut offrir (et refuser tout le reste).
Lancé tout seul par deployer.sh ; à la main :  python serveur/extraire_catalogue.py
"""
import json
import os
import re
import sys

ICI = os.path.dirname(os.path.abspath(__file__))
SOURCE = os.path.join(ICI, '..', 'js', 'boutique.js')
SORTIE = os.path.join(ICI, 'catalogue.json')
CH = r"'((?:[^'\\]|\\.)*)'"  # une chaîne JavaScript entre apostrophes


def texte(s):
    return s.replace("\\'", "'").replace('\\\\', '\\')


def extraire(js):
    raretes = {m[0]: {'nom': texte(m[1]), 'couleur': m[2]}
               for m in re.findall(r"(\w+):\s*\{\s*nom:\s*" + CH + r",\s*couleur:\s*'(#[0-9a-fA-F]{3,8})'", js)}
    categories = [{'id': m[0], 'nom': texte(m[1]), 'icone': texte(m[3])}
                  for m in re.findall(r"\{\s*id:\s*'(\w+)',\s*nom:\s*" + CH + r",\s*un:\s*" + CH + r",\s*icone:\s*" + CH + r"\s*\}", js)]
    objets, vus = [], set()
    motif = r"L\(\s*'(\w+)'\s*,\s*'(\w+)'\s*,\s*" + CH + r"\s*,\s*'(\w+)'\s*,\s*" + CH + r"\s*(?:,\s*(true|false))?\s*\)"
    for id_, cat, nom, rarete, _desc, gratuit in re.findall(motif, js):
        cle = cat + ':' + id_
        if cle in vus:
            continue
        vus.add(cle)
        objets.append({'cle': cle, 'cat': cat, 'id': id_, 'nom': texte(nom), 'rarete': rarete, 'gratuit': gratuit == 'true'})
    return {'source': 'js/boutique.js', 'categories': categories, 'raretes': raretes, 'objets': objets}


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
