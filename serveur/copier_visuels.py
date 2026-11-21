"""Copie les ressources graphiques du panel admin (modeles/admin/, session modélisation) dans serveur/admin/visuels/.

Le panel est servi par le serveur (pas par GitHub Pages) et sa règle de sécurité (CSP) n'accepte que ses propres
fichiers : les images doivent donc être À CÔTÉ de lui. Les originaux restent dans modeles/admin/ (jamais modifiés).
Lancé par deployer.sh ; à la main pour tester en local :  python -X utf8 serveur/copier_visuels.py
"""
import os
import shutil
import sys

ICI = os.path.dirname(os.path.abspath(__file__))
SOURCE = os.path.join(ICI, '..', 'modeles', 'admin')
CIBLE = os.path.join(ICI, 'admin', 'visuels')
DOSSIERS = ('logo', 'icones', 'raretes', 'cadres', 'illustrations', 'vignettes')
FICHIERS = ('admin_visuels.json', 'vignettes.json', 'vignettes_esprits.json')
EXTENSIONS = ('.svg', '.png', '.webp', '.json')


def copier():
    if not os.path.isdir(SOURCE):
        print('Pas de dossier modeles/admin : le panel garde ses émojis.')
        return 0
    if os.path.isdir(CIBLE):
        shutil.rmtree(CIBLE)
    os.makedirs(CIBLE)
    n = 0
    for d in DOSSIERS:
        for racine, _, fichiers in os.walk(os.path.join(SOURCE, d)):
            for f in fichiers:
                if not f.lower().endswith(EXTENSIONS):
                    continue
                rel = os.path.relpath(os.path.join(racine, f), SOURCE)
                os.makedirs(os.path.dirname(os.path.join(CIBLE, rel)), exist_ok=True)
                shutil.copyfile(os.path.join(racine, f), os.path.join(CIBLE, rel))
                n += 1
    for f in FICHIERS:
        if os.path.isfile(os.path.join(SOURCE, f)):
            shutil.copyfile(os.path.join(SOURCE, f), os.path.join(CIBLE, f))
            n += 1
    poids = sum(os.path.getsize(os.path.join(r, f)) for r, _, fs in os.walk(CIBLE) for f in fs)
    print(f'visuels du panel : {n} fichiers copiés ({poids // 1024} Ko) dans serveur/admin/visuels/')
    return n


if __name__ == '__main__':
    sys.exit(0 if copier() >= 0 else 1)
