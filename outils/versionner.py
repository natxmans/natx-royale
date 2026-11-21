"""Donne le même numéro de version à TOUS les fichiers du jeu dans index.html.

Pourquoi : jeu.js est chargé avec « ?v=N », mais il importe les autres fichiers (personnage.js, modeles.js…) sans
numéro. Après une mise à jour, un navigateur pouvait donc mélanger le nouveau jeu.js avec un ancien personnage.js
resté dans son cache (GitHub Pages les garde 10 minutes) : le jeu ne démarrait plus (« does not provide an export »).

Comment : la carte des imports d'index.html (importmap) redirige chaque fichier js/x.js vers js/x.js?v=N.
Un nouveau numéro = de nouvelles adresses pour tous les fichiers, donc plus aucun mélange.

Usage, avant chaque publication du jeu :   python -X utf8 outils/versionner.py 18
(sans numéro : le numéro actuel de jeu.js + 1)
"""
import os
import re
import sys

ICI = os.path.dirname(os.path.abspath(__file__))
RACINE = os.path.join(ICI, '..')
INDEX = os.path.join(RACINE, 'index.html')
DEBUT, FIN = '<script type="importmap">', '</script>'
TROIS = ('  "three": "https://cdn.jsdelivr.net/npm/three@0.170.0/build/three.module.js",\n'
         '  "three/addons/": "https://cdn.jsdelivr.net/npm/three@0.170.0/examples/jsm/"')


def versionner(numero=None):
    html = open(INDEX, encoding='utf-8', newline='').read()
    actuel = re.search(r'js/jeu\.js\?v=(\d+)', html)
    if not actuel:
        sys.exit('index.html : « js/jeu.js?v=N » introuvable.')
    n = int(numero) if numero else int(actuel.group(1)) + 1
    fichiers = sorted(f for f in os.listdir(os.path.join(RACINE, 'js')) if f.endswith('.js'))
    lignes = ',\n'.join(f'  "./js/{f}": "./js/{f}?v={n}"' for f in fichiers)
    carte = DEBUT + '{ "imports": {\n' + TROIS + ',\n' + lignes + '\n} }' + FIN
    i = html.index(DEBUT)
    j = html.index(FIN, i) + len(FIN)
    html = html[:i] + carte.replace('\n', '\r\n' if '\r\n' in html else '\n') + html[j:]
    html = re.sub(r'js/jeu\.js\?v=\d+', f'js/jeu.js?v={n}', html)
    open(INDEX, 'w', encoding='utf-8', newline='').write(html)
    print(f'index.html : version {n} pour jeu.js et {len(fichiers)} fichiers dans la carte des imports')
    return n


if __name__ == '__main__':
    versionner(sys.argv[1] if len(sys.argv) > 1 else None)
