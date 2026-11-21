// Règles de NATX ROYALE (montrées dans le jeu : bouton 📜 Règles, et une fois au premier lancement).
// Le robot modérateur du serveur (serveur/robot.py) cite les mêmes numéros : garder les deux listes pareilles
// (un test le vérifie : .claude/tests/test_robot.py).
export const VERSION_REGLES = 1;

export const REGLES = [
  { n: 1, titre: 'Respecte les autres', texte: "Pas d'insultes, de moqueries méchantes, de menaces ni de harcèlement, dans la discussion comme dans les pseudos." },
  { n: 2, titre: 'Pas de triche', texte: 'Interdit de modifier le jeu, ton navigateur ou tes données pour avoir un avantage (pièces, objets, visée automatique, vitesse…), ou d\'utiliser un programme de triche.' },
  { n: 3, titre: 'Les bugs, on les signale', texte: 'Tu trouves un bug ? Signale-le (💡 Idées → Bug). L\'utiliser exprès pour gagner, c\'est de la triche.' },
  { n: 4, titre: 'Un pseudo correct', texte: 'Pas de gros mots ni d\'insultes, et pas de pseudo qui se fait passer pour quelqu\'un d\'autre (le staff, un admin, un autre joueur).' },
  { n: 5, titre: "Pas d'anti-jeu", texte: 'Ne gâche pas la partie des autres exprès : aider l\'équipe adverse, te faire éliminer exprès en équipe, bloquer quelqu\'un toute la partie, construire en masse pour faire ramer…' },
  { n: 6, titre: 'Une discussion propre', texte: 'Pas de spam, pas de pub, pas de liens.' },
  { n: 7, titre: 'Ta vie privée', texte: 'Ne donne jamais ton vrai nom, ton adresse, ton numéro, ton école ni tes mots de passe, et ne demande pas ceux des autres.' },
  { n: 8, titre: 'Ton compte est à toi', texte: 'Ne donne pas ton code de sauvegarde et ne joue pas avec le compte de quelqu\'un d\'autre sans son accord.' },
  { n: 9, titre: 'Des signalements honnêtes', texte: 'Signale seulement ce qui s\'est vraiment passé. Signaler quelqu\'un pour rien, exprès, c\'est interdit aussi.' },
  { n: 10, titre: 'Le staff', texte: 'Ne te fais pas passer pour le staff. Le vrai staff porte la Tenue Staff 🛡️ et ne te demandera jamais ton code de sauvegarde.' },
];

export const ECHELLE = [
  '1re fois : un avertissement (un message dans le jeu).',
  '2e fois : compte suspendu 24 h (plus de parties en ligne, d\'avis ni de cadeaux).',
  'Ensuite : 3 jours, puis plus longtemps si l\'équipe le décide.',
  'Triche grave ou harcèlement : l\'équipe peut aller directement plus loin.',
];

const echapper = t => String(t).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
export function htmlRegles() {
  return `<ol class="liste-regles">${REGLES.map(r => `<li><b>${echapper(r.titre)}</b> — ${echapper(r.texte)}</li>`).join('')}</ol>
    <h3>⚖️ Si une règle n'est pas respectée</h3>
    <ul class="echelle-regles">${ECHELLE.map(e => `<li>${echapper(e)}</li>`).join('')}</ul>
    <p class="petit-texte">🤖 Un robot modérateur lit les signalements tous les jours et regarde les dernières parties des joueurs signalés.
      Un humain de l'équipe peut toujours revoir sa décision : si tu penses qu'il s'est trompé, écris-le dans 💡 Idées → Autre.</p>`;
}
