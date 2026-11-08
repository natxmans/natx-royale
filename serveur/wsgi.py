"""Point d'entrée WSGI pour l'hébergeur (alwaysdata, PythonAnywhere, gunicorn…).

Exemple avec gunicorn :  gunicorn --chdir serveur wsgi:application

Les réglages NON secrets (NATX_PREFIXE, NATX_ORIGINES, NATX_HTTPS, NATX_PROXY) peuvent être mis
dans un fichier `reglages.env` à côté de ce fichier (une ligne NOM=valeur). Le script de mise en
ligne y copie `reglages-alwaysdata.env`. Une variable réglée dans le panneau de l'hébergeur
passe avant le fichier.
La clé secrète, elle, n'est jamais dans un fichier du projet : le serveur la crée tout seul
dans donnees/secret.key (ou la lit dans NATX_SECRET).
"""
import os
import sys

ICI = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, ICI)

_reglages = os.path.join(ICI, 'reglages.env')
if os.path.isfile(_reglages):
    with open(_reglages, encoding='utf-8') as f:
        for ligne in f:
            ligne = ligne.strip()
            if ligne and not ligne.startswith('#') and '=' in ligne:
                nom, valeur = ligne.split('=', 1)
                nom = nom.strip()
                if nom.startswith('NATX_') and nom != 'NATX_SECRET':  # jamais de secret dans ce fichier
                    os.environ.setdefault(nom, valeur.strip())

from api import application  # noqa: E402,F401
