#!/bin/sh
# Met en ligne (ou met à jour) le serveur des avis de NATX ROYALE sur alwaysdata, puis le redémarre.
# Lancer depuis Git Bash :  sh serveur/deployer.sh
#
# Ce qui part : api.py, wsgi.py, admin/, LISEZMOI.md et les réglages (non secrets).
# Ce qui n'est JAMAIS touché en ligne : ~/natx-serveur/donnees/ (avis, votes, comptes admin,
# clé secrète créée par le serveur lui-même).
set -e
cd "$(dirname "$0")"

CLE="$HOME/.ssh/chrysalide_alwaysdata"
COMPTE="chrysalide@ssh-chrysalide.alwaysdata.net"
DOSSIER="natx-serveur"
ADRESSE="https://chrysalide.alwaysdata.net/natx"

# 1. pas de mise en ligne d'un fichier cassé
python -c "import ast; [ast.parse(open(f, encoding='utf-8').read()) for f in ('api.py', 'wsgi.py')]"
for f in admin/index.html admin/admin.js admin/admin.css reglages-alwaysdata.env; do
  [ -f "$f" ] || { echo "Fichier manquant : $f"; exit 1; }
done

# 2. envoi des fichiers (sans donnees/ ni __pycache__/) et redémarrage de l'appli
tar -cf - --exclude=donnees --exclude=__pycache__ api.py wsgi.py reglages-alwaysdata.env LISEZMOI.md admin |
  ssh -i "$CLE" -o BatchMode=yes "$COMPTE" "
    set -e
    mkdir -p ~/$DOSSIER/donnees
    chmod 700 ~/$DOSSIER/donnees
    tar -x -C ~/$DOSSIER
    mv -f ~/$DOSSIER/reglages-alwaysdata.env ~/$DOSSIER/reglages.env
    touch ~/$DOSSIER/wsgi.py
    echo 'Fichiers du serveur des avis à jour dans ~/$DOSSIER'"

# 3. vérification
sleep 3
echo "Vérification : $ADRESSE/api/sante"
if curl -fsS "$ADRESSE/api/sante"; then
  echo
  echo "Le serveur des avis répond. Espace admin : $ADRESSE/admin/"
else
  echo "Pas de réponse : le site « natx » est-il bien créé dans le panneau alwaysdata ? (voir LISEZMOI.md)"
  exit 1
fi
