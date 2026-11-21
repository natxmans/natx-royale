// Cadeaux (boîte de réception), codes cadeaux, annonce, bonus de pièces, avertissements de l'équipe.
// Le SERVEUR décide de ce qui est livré à qui et note chaque ouverture une seule fois ;
// le profil garde en plus la liste des cadeaux déjà ouverts (un cadeau n'est jamais donné deux fois).
// Sans serveur joignable, rien ne change dans le jeu.
import { objet, sauverProfil, RARETES_COSM, CATEGORIES, appliquerConfigBoutique, ajouterCosmetiquesAdmin, appliquerStaff } from './boutique.js';
import { enregistrerAjouts } from './modeles.js';
import { ESPRITS, reglerEspritsDisponibles } from './esprits.js';
import {
  URL_API, chargerEtatJeu, recupererBoite, ouvrirCadeauServeur, avertissementLu, utiliserCodeCadeau, codeJoueur, envoyerProfil, repondreLiaison,
} from './retours.js';

const $ = s => document.querySelector(s);
let etatJeu = { annonce: null, bonus: null };
let ctx = null;
let boite = { non_ouverts: [], historique: [], ref: null, suspension: null, avertissements: [], prive_cadeaux: false, staff: null, liaison: null };
let equiperStaff = false; // vient d'accepter la liaison : on lui met la tenue tout de suite
const aMontrer = []; // les cadeaux ouverts s'affichent un par un
const RARETES_ESPRIT = { commun: 'Commun', rare: 'Rare', epique: 'Épique', legendaire: 'Légendaire' };
const COULEURS_RARETE_ESPRIT = { commun: '#8fa3b8', rare: '#3d8dff', epique: '#b552ff', legendaire: '#ffad1f' };
const ecouteurs = new Set(); // modules qui veulent savoir quand la boîte change (ex. suspension → jeu en ligne bloqué)

export const etatBoite = () => boite;
export const surBoite = f => ecouteurs.add(f);

// Bonus de pièces lancé par l'admin (null s'il n'y en a pas ou s'il est fini)
export function bonusActif() {
  const b = etatJeu.bonus;
  return b && b.multiplicateur > 1 && b.fin * 1000 > Date.now() ? b : null;
}
export const texteMultiplicateur = m => '× ' + String(m).replace('.', ',');
export const etatServeurJeu = () => etatJeu;

// Ajoute un cadeau au profil : seulement des objets qui existent dans le jeu, jamais deux fois le même cadeau
export function appliquerCadeau(profil, c) {
  if (Number.isInteger(c.id) && profil.cadeauxOuverts.includes(c.id)) return { pieces: 0, nouveaux: [], esprit: null, deja: true };
  const pieces = Math.max(0, Math.min(100000, Math.floor(+c.pieces || 0)));
  profil.pieces += pieces;
  const nouveaux = [];
  for (const cle of Array.isArray(c.objets) ? c.objets : []) {
    if (typeof cle !== 'string') continue;
    const [cat, id] = cle.split(':');
    const o = objet(cat, id);
    if (!o || o.reserve || profil.possedes.includes(cle)) continue; // la Tenue Staff ne s'offre pas
    profil.possedes.push(cle);
    profil.nouveautes.push(cle);
    nouveaux.push(o);
  }
  let esprit = null;
  if (c.esprit && ESPRITS[c.esprit.type] && RARETES_ESPRIT[c.esprit.rarete]) {
    esprit = ajouterEsprit(profil, c.esprit.type, c.esprit.rarete);
  }
  if (Number.isInteger(c.id)) profil.cadeauxOuverts.push(c.id);
  sauverProfil(profil);
  return { pieces, nouveaux, esprit, deja: false };
}

// Collection des esprits (gagnés dans les cargaisons) : un exemplaire par type et par rareté, avec un compteur
// Récompenses de collection : +50 🪙 pour un nouvel esprit, +300 🪙 quand un esprit a ses 4 raretés
export const BONUS_NOUVEL_ESPRIT = 50, BONUS_ESPRIT_COMPLET = 300;
export function ajouterEsprit(profil, type, rarete) {
  let e = profil.collectionEsprits.find(x => x.type === type && x.rarete === rarete);
  const nouveau = !e;
  if (!e) { e = { type, rarete, n: 0, le: Date.now() }; profil.collectionEsprits.push(e); }
  e.n++;
  let bonus = 0;
  if (nouveau) {
    bonus += BONUS_NOUVEL_ESPRIT;
    if (new Set(profil.collectionEsprits.filter(x => x.type === type).map(x => x.rarete)).size === 4) bonus += BONUS_ESPRIT_COMPLET;
    profil.pieces += bonus;
  }
  return { type, rarete, nouveau, bonus };
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
const iconeCat = cat => (CATEGORIES.find(x => x.id === cat) || {}).icone || '🎁';
const nomEsprit = e => `${ESPRITS[e.type]?.icone || '✨'} ${ESPRITS[e.type]?.nom || e.type} (${RARETES_ESPRIT[e.rarete] || e.rarete})`;

// Aperçu du contenu d'un cadeau (avant de l'ouvrir) : pièces, objets avec leur rareté, esprit
function apercuContenu(c) {
  const ul = document.createElement('ul');
  ul.className = 'apercu-cadeau';
  if (c.pieces) ul.append(ligne('🪙', c.pieces + ' pièces', '#ffd23f'));
  for (const cle of c.objets || []) {
    const [cat, id] = String(cle).split(':');
    const o = objet(cat, id);
    if (o) ul.append(ligne(iconeCat(cat), o.nom, (RARETES_COSM[o.rarete] || {}).couleur));
  }
  if (c.esprit && ESPRITS[c.esprit.type]) ul.append(ligne('✨', 'Esprit ' + nomEsprit(c.esprit), COULEURS_RARETE_ESPRIT[c.esprit.rarete]));
  if (!ul.children.length) ul.append(ligne('🎁', 'Surprise'));
  return ul;
}

// ---------- Fenêtre d'ouverture (le cadeau s'ouvre, puis son contenu) ----------
function montrerSuivant() {
  const f = $('#fenetreCadeau');
  if (!f || !f.classList.contains('cache') || !aMontrer.length) return;
  const { c, res } = aMontrer.shift();
  $('#cadeauTitre').textContent = c.titre || 'Cadeau';
  $('#cadeauDe').textContent = 'De : ' + (c.expediteur || "L'équipe NATX ROYALE");
  $('#cadeauMessage').textContent = c.message || '';
  $('#cadeauMessage').classList.toggle('cache', !c.message);
  const liste = $('#cadeauContenu');
  liste.replaceChildren();
  if (res.pieces) liste.append(ligne('🪙', res.pieces + ' pièces', '#ffd23f'));
  for (const o of res.nouveaux) liste.append(ligne(iconeCat(o.cat), o.nom, (RARETES_COSM[o.rarete] || {}).couleur));
  if (res.esprit) liste.append(ligne('✨', (res.esprit.nouveau ? 'Nouvel esprit : ' : 'Esprit en plus : ') + nomEsprit(res.esprit), COULEURS_RARETE_ESPRIT[res.esprit.rarete]));
  if (res.esprit && res.esprit.bonus) liste.append(ligne('🏆', `Récompense de collection : +${res.esprit.bonus} pièces`, '#ffd23f'));
  if (res.deja) liste.append(ligne('✔', 'Ce cadeau avait déjà été ajouté à ton profil.'));
  else if (!res.pieces && !res.nouveaux.length && !res.esprit) liste.append(ligne('✔', 'Tu avais déjà tout ce qu\'il y a dans ce cadeau !'));
  $('#voirCasier').classList.toggle('cache', !res.nouveaux.length);
  $('#voirEsprits').classList.toggle('cache', !res.esprit);
  f.querySelector('.boite').classList.remove('ouvert');
  f.classList.remove('cache');
  setTimeout(() => f.querySelector('.boite').classList.add('ouvert'), 450); // le paquet s'ouvre, le contenu apparaît
  ctx.son('niveau');
}

function recevoir(c) {
  if (!c || typeof c !== 'object') return;
  const res = appliquerCadeau(ctx.profil, c);
  ctx.menus.majPieces(true);
  aMontrer.push({ c, res });
  montrerSuivant();
}

// ---------- Boîte de réception ----------
function dateCourte(s) {
  return new Date(s * 1000).toLocaleString('fr-FR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
}

function majCompteur() {
  const n = boite.non_ouverts.length;
  const b = $('#compteurCadeaux');
  if (b) { b.textContent = n > 9 ? '9+' : String(n); b.classList.toggle('cache', !n); }
  const t = $('#btnBoite');
  if (t) t.title = n ? `${n} cadeau${n > 1 ? 'x' : ''} à ouvrir` : 'Boîte de réception';
  const p = $('#pauseCadeaux');
  if (p) { p.textContent = n ? `🎁 ${n}` : ''; p.classList.toggle('cache', !n); }
}

function dessinerBoite() {
  const ouverte = !$('#fenetreBoite').classList.contains('cache');
  majCompteur();
  if (!ouverte) return;
  const onglet = $('#fenetreBoite').dataset.onglet || 'attente';
  for (const b of document.querySelectorAll('#ongletsBoite button')) b.classList.toggle('actif', b.dataset.onglet === onglet);
  const liste = $('#listeBoite');
  liste.replaceChildren();
  const elems = onglet === 'attente' ? boite.non_ouverts : boite.historique;
  $('#ouvrirTout').classList.toggle('cache', onglet !== 'attente' || boite.non_ouverts.length < 2);
  $('#infoBoite').textContent = boite.prive_cadeaux
    ? '⛔ Ton compte ne peut pas recevoir de cadeaux pour le moment.'
    : onglet === 'attente' ? (elems.length ? 'Ouvre tes cadeaux pour les ajouter à ton profil.' : 'Aucun cadeau à ouvrir pour l\'instant.')
      : (elems.length ? 'Les 30 derniers cadeaux que tu as ouverts.' : 'Tu n\'as encore ouvert aucun cadeau.');
  for (const c of elems) {
    const li = document.createElement('li');
    li.className = 'entree-boite' + (c.origine === 'cargaison' ? ' cargaison' : '');
    const tete = document.createElement('div');
    tete.className = 'tete-boite';
    const titre = document.createElement('b'); titre.textContent = (c.origine === 'cargaison' ? '📦 ' : '🎁 ') + c.titre;
    const de = document.createElement('span'); de.className = 'de'; de.textContent = 'De : ' + c.expediteur;
    const quand = document.createElement('span'); quand.className = 'quand';
    quand.textContent = onglet === 'attente' ? 'reçu le ' + dateCourte(c.recu_le) + (c.expire_le ? ' · à ouvrir avant le ' + dateCourte(c.expire_le) : '')
      : 'ouvert le ' + dateCourte(c.ouvert_le);
    tete.append(titre, de, quand);
    li.append(tete);
    if (c.message) { const m = document.createElement('p'); m.className = 'message-boite'; m.textContent = c.message; li.append(m); }
    li.append(apercuContenu(c));
    if (onglet === 'attente') {
      const bouton = document.createElement('button');
      bouton.className = 'vert';
      bouton.textContent = 'Ouvrir';
      bouton.onclick = () => ouvrir(c.id, bouton);
      li.append(bouton);
    }
    liste.append(li);
  }
}

async function ouvrir(id, bouton) {
  if (bouton) { bouton.disabled = true; bouton.textContent = '…'; }
  try {
    const d = await ouvrirCadeauServeur(id);
    boite.non_ouverts = boite.non_ouverts.filter(c => c.id !== id);
    if (!boite.historique.some(c => c.id === id)) boite.historique.unshift(d.cadeau);
    recevoir(d.cadeau);
    dessinerBoite();
    synchroniserProfil(true);
  } catch (e) {
    if (bouton) { bouton.disabled = false; bouton.textContent = 'Ouvrir'; }
    ctx.toast?.('🎁 ' + e.message, 3500);
    verifierBoite();
  }
}

// Petite notification (menu ou en partie) : expéditeur + aperçu, son discret, sans bloquer le jeu
function notifier(nouveaux) {
  const n = $('#notifCadeau');
  if (!n || !nouveaux.length) return;
  const c = nouveaux[0];
  $('#notifCadeauTitre').textContent = nouveaux.length > 1 ? `${nouveaux.length} nouveaux cadeaux !` : 'Nouveau cadeau !';
  $('#notifCadeauDe').textContent = 'De : ' + c.expediteur + (nouveaux.length > 1 ? ' et d\'autres' : '') + ' — ' + c.titre;
  const ap = $('#notifCadeauApercu');
  ap.replaceChildren(apercuContenu(c));
  n.classList.remove('cache');
  n.classList.remove('sortie');
  clearTimeout(notifier.t);
  notifier.t = setTimeout(() => { n.classList.add('sortie'); setTimeout(() => n.classList.add('cache'), 400); }, 7000);
  ctx.son('cadeau');
}

function montrerAvertissement() {
  const a = boite.avertissements[0];
  const f = $('#fenetreAvertissement');
  if (!a || !f || !f.classList.contains('cache')) return;
  $('#avertissementTexte').textContent = a.motif;
  $('#avertissementDate').textContent = 'Le ' + dateCourte(a.debut);
  f.classList.remove('cache');
  $('#avertissementCompris').onclick = () => {
    f.classList.add('cache');
    boite.avertissements.shift();
    avertissementLu(a.id).catch(() => {});
    setTimeout(montrerAvertissement, 300);
  };
}

// ---------- Liaison staff (demandée dans l'espace admin, acceptée ici) ----------
// La Tenue Staff suit ce que dit le serveur : donnée si ce compte est lié à un compte admin actif, retirée sinon.
function majStaff() {
  const p = ctx.profil;
  const r = appliquerStaff(p, !!boite.staff);
  if (!r) return;
  if (r === 'ajoutee' && equiperStaff) { p.equipe.tenue = 'staff'; equiperStaff = false; }
  sauverProfil(p);
  if (r === 'ajoutee') { ctx.son('ramasser'); ctx.toast('🛡️ Ton compte est lié au staff : tu as reçu la Tenue Staff ! (Casier → Tenues)', 6000); }
  else ctx.toast("🛡️ La Tenue Staff a été retirée : ton compte n'est plus lié au staff.", 6000);
  const m = ctx.menus;
  m.surLook();
  if (m.page === 'jouer') m.montrerPerso();
  if (m.page === 'casier') m.dessinerCasier();
}

function montrerLiaison() {
  const l = boite.liaison;
  const f = $('#fenetreLiaison');
  // seulement sur les menus (jamais en pleine partie), une demande à la fois
  if (!l || !f || !f.classList.contains('cache') || $('#menu').classList.contains('cache')) return;
  codeJoueur().then(c => { $('#liaisonCode').textContent = c || '—'; }).catch(() => {});
  $('#liaisonRole').textContent = l.role_nom;
  $('#liaisonDate').textContent = 'Demande faite le ' + dateCourte(l.demande_le);
  $('#liaisonMsg').textContent = '';
  f.classList.remove('cache');
  const repondre = async accepter => {
    for (const b of f.querySelectorAll('button')) b.disabled = true;
    try {
      await repondreLiaison(l.id, accepter);
      f.classList.add('cache');
      boite.liaison = null;
      if (accepter) { equiperStaff = true; }
      else ctx.toast('Demande de liaison refusée.', 3000);
      verifierBoite();
    } catch (e) { $('#liaisonMsg').textContent = '❌ ' + e.message; }
    for (const b of f.querySelectorAll('button')) b.disabled = false;
  };
  $('#liaisonAccepter').onclick = () => repondre(true);
  $('#liaisonRefuser').onclick = () => repondre(false);
}

function majSuspension() {
  const s = boite.suspension;
  const barre = $('#barreSuspension');
  if (barre) {
    barre.classList.toggle('cache', !s);
    if (s) {
      barre.textContent = `⛔ Ton compte est suspendu ${s.fin ? 'jusqu\'au ' + dateCourte(s.fin) : 'pour une durée indéterminée'} (motif : ${s.motif}). `
        + 'Tu peux jouer avec des bots, mais pas en ligne avec d\'autres joueurs.';
    }
  }
  for (const id of ['#btnCreer', '#btnRejoindre']) { const b = $(id); if (b) b.disabled = !!s; }
}

let verifEnCours = false;
export async function verifierBoite() {
  if (!URL_API || verifEnCours) return;
  verifEnCours = true;
  try {
    const d = await recupererBoite();
    if (!ctx.profil.boiteDepuis) { ctx.profil.boiteDepuis = d.maintenant; sauverProfil(ctx.profil); }
    // un cadeau déjà appliqué au profil mais pas noté par le serveur : on le confirme sans rien redonner
    const dejaAppliques = d.non_ouverts.filter(c => ctx.profil.cadeauxOuverts.includes(c.id));
    for (const c of dejaAppliques) ouvrirCadeauServeur(c.id).catch(() => {});
    // l'inverse : ouvert sur le serveur mais la réponse s'est perdue (coupure réseau) → on l'ajoute maintenant, une fois
    for (const c of d.historique) {
      if (c.ouvert_le >= ctx.profil.boiteDepuis && !ctx.profil.cadeauxOuverts.includes(c.id)) recevoir(c);
    }
    boite = { ...d, non_ouverts: d.non_ouverts.filter(c => !ctx.profil.cadeauxOuverts.includes(c.id)) };
    const nouveaux = boite.non_ouverts.filter(c => !ctx.profil.cadeauxNotifies.includes(c.id));
    if (nouveaux.length) {
      ctx.profil.cadeauxNotifies.push(...nouveaux.map(c => c.id));
      sauverProfil(ctx.profil);
      notifier(nouveaux);
    }
    dessinerBoite();
    montrerAvertissement();
    majSuspension();
    majStaff();
    montrerLiaison();
    for (const f of ecouteurs) f(boite);
  } catch (e) { /* serveur injoignable : on réessaiera */ }
  verifEnCours = false;
}

// Esprits disponibles (réglés dans l'espace admin) : null tant que le serveur n'a pas répondu
export function espritsDisponibles() {
  const e = etatJeu.esprits;
  if (!e || typeof e !== 'object') return null;
  const ok = Object.keys(e).filter(t => e[t] && e[t].actif && ESPRITS[t]);
  return ok.length ? ok : null;
}
export const descriptionEsprit = t => (etatJeu.esprits && etatJeu.esprits[t] && etatJeu.esprits[t].description) || null;

async function verifierJeu() {
  try { etatJeu = await chargerEtatJeu(); } catch (e) { /* serveur injoignable : rien à afficher */ }
  afficherAnnonce();
  // boutique : prix, promotions, rotation, objets retirés ou ajoutés par l'admin
  enregistrerAjouts(etatJeu.ajouts);
  ajouterCosmetiquesAdmin(etatJeu.ajouts);
  appliquerConfigBoutique(etatJeu);
  reglerEspritsDisponibles(espritsDisponibles());
  if (ctx.menus.page === 'boutique' && !$('#menu').classList.contains('cache')) ctx.menus.dessinerBoutique();
  for (const f of ecouteurs) f(boite);
}

// ---------- Profil déclaré au serveur (pour la page « joueurs » de l'admin ; le profil reste dans ce navigateur) ----------
let dernierEnvoi = 0;
export function synchroniserProfil(vite = false) {
  if (!URL_API || !ctx) return;
  const t = Date.now();
  if (!vite && t - dernierEnvoi < 10 * 60 * 1000) return;
  if (t - dernierEnvoi < 20 * 1000) return;
  dernierEnvoi = t;
  const p = ctx.profil;
  envoyerProfil({
    pseudo: ctx.reglages?.pseudo || document.querySelector('#pseudo')?.value || '', niveau: p.niveau, xp: p.xp, pieces: p.pieces, possedes: p.possedes, equipe: p.equipe,
    esprits: p.collectionEsprits.map(e => ({ type: e.type, rarete: e.rarete, n: e.n })),
    stats: { parties: p.stats.parties, victoires: p.stats.victoires, kills: p.stats.kills }, version: ctx.version || '',
  }).catch(() => {});
}

export async function initCadeaux({ profil, menus, son, toast, reglages, version }) {
  ctx = { profil, menus, son: son || (() => {}), toast, reglages, version };
  if (!URL_API) { $('#blocCodeCadeau')?.classList.add('cache'); $('#btnBoite')?.classList.add('cache'); return; }

  const fermer = () => { $('#fenetreCadeau').classList.add('cache'); setTimeout(montrerSuivant, 250); };
  $('#fermerCadeau').onclick = fermer;
  $('#voirCasier').onclick = () => { fermer(); menus.montrerPage('casier'); };
  $('#voirEsprits').onclick = () => { fermer(); menus.montrerPage('esprits'); };

  // Boîte de réception
  const ouvrirBoite = (onglet = 'attente') => {
    $('#fenetreBoite').dataset.onglet = onglet;
    $('#fenetreBoite').classList.remove('cache');
    dessinerBoite();
    verifierBoite();
  };
  $('#btnBoite').onclick = () => ouvrirBoite();
  $('#fermerBoite').onclick = () => $('#fenetreBoite').classList.add('cache');
  for (const b of document.querySelectorAll('#ongletsBoite button')) b.onclick = () => { $('#fenetreBoite').dataset.onglet = b.dataset.onglet; dessinerBoite(); };
  $('#ouvrirTout').onclick = async () => {
    for (const c of [...boite.non_ouverts]) await ouvrir(c.id);
  };
  $('#notifCadeauOuvrir').onclick = () => { $('#notifCadeau').classList.add('cache'); if (!$('#menu').classList.contains('cache')) ouvrirBoite(); };
  $('#notifCadeauFermer').onclick = () => $('#notifCadeau').classList.add('cache');

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
      verifierBoite();
    } catch (e) { msg.textContent = e.message; msg.className = 'msg-code erreur'; }
    bouton.disabled = false;
  };
  bouton.onclick = valider;
  champ.addEventListener('keydown', e => { if (e.key === 'Enter') valider(); });

  codeJoueur().then(code => { $('#codeJoueur').textContent = code || '—'; })
    .catch(() => { $('#codeJoueur').textContent = 'indisponible pour l\'instant'; });

  await Promise.all([verifierJeu(), verifierBoite()]);
  synchroniserProfil(true);
  // nouveaux cadeaux pendant que le jeu est ouvert (menu ET partie) : on regarde toutes les 30 s
  setInterval(() => { if (document.visibilityState === 'visible') verifierBoite(); }, 30000);
  setInterval(() => { if (document.visibilityState === 'visible' && !$('#menu').classList.contains('cache')) verifierJeu(); }, 180000);
  setInterval(() => synchroniserProfil(), 60000);
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') verifierBoite(); });
}
