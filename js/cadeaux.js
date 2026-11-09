// Cadeaux de l'admin (skins, pièces), codes cadeaux, annonce et bonus de pièces.
// Tout vient du serveur NATX ROYALE (espace admin) ; sans serveur joignable, rien ne change dans le jeu.
import { objet, sauverProfil, RARETES_COSM, CATEGORIES } from './boutique.js';
import { URL_API, chargerEtatJeu, recupererCadeaux, utiliserCodeCadeau, codeJoueur } from './retours.js';

const $ = s => document.querySelector(s);
let etatJeu = { annonce: null, bonus: null };
let ctx = null;
const aMontrer = []; // les cadeaux s'affichent un par un

// Bonus de pièces lancé par l'admin (null s'il n'y en a pas ou s'il est fini)
export function bonusActif() {
  const b = etatJeu.bonus;
  return b && b.multiplicateur > 1 && b.fin * 1000 > Date.now() ? b : null;
}
export const texteMultiplicateur = m => '× ' + String(m).replace('.', ',');

// Ajoute un cadeau au profil : seulement des objets qui existent dans le jeu, jamais deux fois le même
export function appliquerCadeau(profil, c) {
  const pieces = Math.max(0, Math.min(100000, Math.floor(+c.pieces || 0)));
  profil.pieces += pieces;
  const nouveaux = [];
  for (const cle of Array.isArray(c.objets) ? c.objets : []) {
    if (typeof cle !== 'string') continue;
    const [cat, id] = cle.split(':');
    const o = objet(cat, id);
    if (!o || profil.possedes.includes(cle)) continue;
    profil.possedes.push(cle);
    profil.nouveautes.push(cle);
    nouveaux.push(o);
  }
  sauverProfil(profil);
  return { pieces, nouveaux };
}

function afficherAnnonce() {
  const barre = $('#annonceJeu');
  if (!barre) return;
  const a = etatJeu.annonce, b = bonusActif();
  $('#annonceTexte').textContent = a ? a.texte : '';
  $('#annonceTexte').classList.toggle('cache', !a);
  if (b) {
    const fin = new Date(b.fin * 1000).toLocaleString('fr-FR', { weekday: 'long', hour: '2-digit', minute: '2-digit' });
    $('#bonusTexte').textContent = `⚡ ${b.texte} : pièces ${texteMultiplicateur(b.multiplicateur)} jusqu'à ${fin}`;
  }
  $('#bonusTexte').classList.toggle('cache', !b);
  barre.className = 'annonce-jeu ' + (a ? a.style : 'evenement') + (a || b ? '' : ' cache');
}

function ligne(icone, texte, couleur) {
  const li = document.createElement('li');
  const i = document.createElement('span'); i.textContent = icone;
  const t = document.createElement('b'); t.textContent = texte;
  if (couleur) t.style.color = couleur;
  li.append(i, t);
  return li;
}

function montrerSuivant() {
  const f = $('#fenetreCadeau');
  if (!f || !f.classList.contains('cache') || !aMontrer.length) return;
  const { c, res } = aMontrer.shift();
  $('#cadeauTitre').textContent = c.titre || 'Cadeau';
  $('#cadeauMessage').textContent = c.message || '';
  $('#cadeauMessage').classList.toggle('cache', !c.message);
  const liste = $('#cadeauContenu');
  liste.replaceChildren();
  if (res.pieces) liste.append(ligne('🪙', res.pieces + ' pièces', '#ffd23f'));
  for (const o of res.nouveaux) liste.append(ligne((CATEGORIES.find(x => x.id === o.cat) || {}).icone || '🎁', o.nom, (RARETES_COSM[o.rarete] || {}).couleur));
  if (!res.pieces && !res.nouveaux.length) liste.append(ligne('✔', 'Tu avais déjà tout ce qu\'il y a dans ce cadeau !'));
  $('#voirCasier').classList.toggle('cache', !res.nouveaux.length);
  f.classList.remove('cache');
  ctx.son('niveau');
}

function recevoir(c) {
  if (!c || typeof c !== 'object') return;
  const res = appliquerCadeau(ctx.profil, c);
  ctx.menus.majPieces(true);
  aMontrer.push({ c, res });
  montrerSuivant();
}

// Annonce, bonus et cadeaux qui attendent ce joueur
async function verifier() {
  try { etatJeu = await chargerEtatJeu(); } catch (e) { /* serveur injoignable : rien à afficher */ }
  afficherAnnonce();
  try {
    const d = await recupererCadeaux();
    for (const c of d.cadeaux || []) recevoir(c);
  } catch (e) { /* serveur injoignable : on réessaiera plus tard */ }
}

export async function initCadeaux({ profil, menus, son }) {
  ctx = { profil, menus, son: son || (() => {}) };
  if (!URL_API) { $('#blocCodeCadeau')?.classList.add('cache'); return; }

  const fermer = () => { $('#fenetreCadeau').classList.add('cache'); setTimeout(montrerSuivant, 250); };
  $('#fermerCadeau').onclick = fermer;
  $('#voirCasier').onclick = () => { fermer(); menus.montrerPage('casier'); };

  // Code cadeau (Boutique)
  const champ = $('#codeCadeau'), bouton = $('#btnCodeCadeau'), msg = $('#msgCodeCadeau');
  const valider = async () => {
    const code = champ.value.trim();
    if (!code) { msg.textContent = 'Tape un code cadeau.'; msg.className = 'msg-code erreur'; return; }
    bouton.disabled = true;
    msg.textContent = 'Vérification…'; msg.className = 'msg-code';
    try {
      const d = await utiliserCodeCadeau(code);
      champ.value = '';
      msg.textContent = '🎉 Code accepté !'; msg.className = 'msg-code ok';
      recevoir(d.cadeau);
    } catch (e) { msg.textContent = e.message; msg.className = 'msg-code erreur'; }
    bouton.disabled = false;
  };
  bouton.onclick = valider;
  champ.addEventListener('keydown', e => { if (e.key === 'Enter') valider(); });

  codeJoueur().then(code => { $('#codeJoueur').textContent = code || '—'; })
    .catch(() => { $('#codeJoueur').textContent = 'indisponible pour l\'instant'; });

  await verifier();
  // nouveaux cadeaux pendant que le jeu est ouvert : on regarde de temps en temps, seulement dans le menu
  setInterval(() => { if (document.visibilityState === 'visible' && !$('#menu').classList.contains('cache')) verifier(); }, 180000);
}
