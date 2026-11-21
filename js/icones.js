// Visuels des pages du jeu livrés par la session modélisation (modeles/interface/ et modeles/admin/vignettes/) :
// icônes en trait à la place des émojis des menus, et vignettes des cosmétiques pour la boutique et le casier.
// Rien d'obligatoire : si un fichier ne charge pas, le jeu garde ses émojis et ses miniatures faites en 3D.
const SPRITE = 'modeles/interface/icones/icones.svg?v=1';
const DOSSIER_VIGNETTES = 'modeles/admin/';

// émoji de l'interface → icône du sprite (index : modeles/interface/interface_visuels.json)
// « ✨ » n'y est pas : il sert aussi de simple décoration (seul l'onglet Esprits prend l'icône, voir activerIcones).
const PAR_EMOJI = {
  '🎮': 'jouer', '🛒': 'boutique', '🧳': 'casier', '📰': 'nouveautes', '💡': 'idees', '🏝': 'ile', '⭐': 'niveau', '🪙': 'pieces',
  '🎁': 'cadeau', '⚙': 'parametres', '⛶': 'plein_ecran', '👑': 'couronne', '👤': 'joueur', '👥': 'joueurs', '🛡': 'bouclier',
  '🎯': 'cible', '🔑': 'cle', '📜': 'regles', '✏': 'crayon', '🗓': 'calendrier', '📚': 'catalogue', '🎲': 'de', '🔥': 'feu',
  '🕘': 'horloge', '✍': 'proposer', '📋': 'copier', '🎉': 'fete', '🚀': 'fusee', '⏳': 'sablier', '📍': 'position', '⬆': 'haut',
  '💀': 'eliminations', '⏱': 'chrono', '❤': 'vie', '🪵': 'bois', '⏸': 'pause', '🗺': 'carte', '🏆': 'trophee', '💬': 'discussion',
  '💃': 'emote', '🗑': 'poubelle', '🧱': 'mur', '📐': 'rampe', '⬛': 'sol', '🔫': 'arme', '⤴': 'sauter', '🧎': 'accroupir',
  '📱': 'tourner_ecran', '✖': 'fermer', '▶': 'reprendre', '📨': 'envoyer', '✅': 'valide', '🔁': 'rejouer', '🚩': 'signaler',
  '⚠': 'avertissement', '🖼': 'image', '⌨': 'touches', '🔊': 'son', '🧭': 'ecran', '☁': 'sauvegarde', '👁': 'afficher', '📥': 'recuperer',
  '👕': 'tenue', '🎩': 'chapeau', '🎒': 'dos', '⛏': 'pioche', '🪁': 'deltaplane', '💎': 'rarete', '📦': 'cargaison', '🤖': 'robot',
};
const MOTIF = '(' + Object.keys(PAR_EMOJI).join('|') + ')\\uFE0F?';
const UN = new RegExp(MOTIF, 'u'), TOUS = new RegExp(MOTIF, 'gu');
// Là où on ne touche à rien : champs de saisie, listes (pas de dessin possible dans une <option>), textes écrits par les joueurs
// (pseudos, discussion, idées), gros émojis animés des cadeaux, et la page Esprits (chaque esprit garde son émoji à lui).
const EXCLUS = 'option, select, input, textarea, script, style, svg, [data-sans-icone], #listeJoueurs, .fil-chat, #listeIdees, #finClassement, #avisEtoiles, .cadeau-icone, .notif-icone, #grilleEsprits, #ficheEsprit';
const SVG = 'http://www.w3.org/2000/svg';

export function elementIcone(id) {
  const s = document.createElementNS(SVG, 'svg');
  s.setAttribute('class', 'ic ic-' + id); s.setAttribute('aria-hidden', 'true'); s.setAttribute('viewBox', '0 0 24 24');
  const u = document.createElementNS(SVG, 'use');
  u.setAttribute('href', SPRITE + '#i-' + id);
  s.appendChild(u);
  return s;
}
function remplacerTexte(n) {
  const p = n.parentElement;
  if (!p || !UN.test(n.nodeValue) || p.closest(EXCLUS)) return;
  const texte = n.nodeValue, morceaux = document.createDocumentFragment();
  let fin = 0;
  for (const m of texte.matchAll(TOUS)) {
    if (m.index > fin) morceaux.appendChild(document.createTextNode(texte.slice(fin, m.index)));
    morceaux.appendChild(elementIcone(PAR_EMOJI[m[1]]));
    fin = m.index + m[0].length;
  }
  if (fin < texte.length) morceaux.appendChild(document.createTextNode(texte.slice(fin)));
  n.replaceWith(morceaux);
}
export function iconifier(racine) {
  if (!racine) return;
  if (racine.nodeType === 3) { remplacerTexte(racine); return; }
  if (racine.nodeType !== 1 || racine.closest(EXCLUS)) return;
  const marcheur = document.createTreeWalker(racine, NodeFilter.SHOW_TEXT);
  const textes = [];
  while (marcheur.nextNode()) if (UN.test(marcheur.currentNode.nodeValue)) textes.push(marcheur.currentNode);
  for (const n of textes) remplacerTexte(n);
}

// Menus et fenêtres (pas l'affichage en partie, qui change à chaque image) : les émojis connus deviennent des icônes,
// y compris dans ce que le jeu écrit plus tard (cartes de la boutique, prix, boutons…).
export async function activerIcones() {
  try {
    const r = await fetch(SPRITE);
    if (!r.ok || !(await r.text()).includes('id="i-jouer"')) return false;
  } catch (e) { return false; }
  const racines = [...document.querySelectorAll('.ecran, #demarrage')];
  const onglet = document.querySelector('.onglets [data-page="esprits"]');
  if (onglet && onglet.firstChild && onglet.firstChild.nodeType === 3) onglet.firstChild.nodeValue = onglet.firstChild.nodeValue.replace('✨', '');
  if (onglet && !onglet.querySelector('.ic')) onglet.prepend(elementIcone('esprits'));
  for (const r of racines) iconifier(r);
  const veille = new MutationObserver(liste => {
    for (const m of liste) {
      if (m.type === 'characterData') remplacerTexte(m.target);
      else for (const n of m.addedNodes) iconifier(n);
    }
  });
  for (const r of racines) veille.observe(r, { childList: true, subtree: true, characterData: true });
  document.documentElement.classList.add('icones');
  return true;
}

// ---------- Vignettes des cosmétiques (rendus des vrais modèles, 256 px, fond transparent) ----------
let parCle = null;
// les tenues « à ta couleur » gardent leur miniature faite en 3D (la vignette livrée est toujours bleue)
const SANS_VIGNETTE = new Set(['tenue:classique', 'tenue:sportif']);
export const vignettesPretes = fetch(DOSSIER_VIGNETTES + 'vignettes.json?v=1')
  .then(r => (r.ok ? r.json() : null)).then(d => { parCle = (d && d.par_cle) || {}; }).catch(() => { parCle = {}; });
export const vignette = cle => (parCle && parCle[cle] && !SANS_VIGNETTE.has(cle) ? DOSSIER_VIGNETTES + parCle[cle] + '?v=1' : null);
