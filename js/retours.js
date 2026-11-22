// Retours des joueurs (avis, bugs, idées) et votes : on parle au serveur NATX ROYALE (dossier serveur/).
// Rien n'est gardé ici à la place du serveur : sans serveur joignable, l'envoi échoue proprement.
// Le seul élément enregistré dans le navigateur est l'identifiant anonyme du joueur (pour voter une seule fois).

// Adresse du serveur en ligne (alwaysdata, mis en ligne le 8 nov. 2026 — voir serveur/LISEZMOI.md).
// En local (localhost), le jeu parle au serveur de test http://localhost:8799 à la place.
const URL_PRODUCTION = 'https://chrysalide.alwaysdata.net/natx/api';
export const URL_API = ['localhost', '127.0.0.1'].includes(location.hostname) ? `http://${location.hostname}:8799/api` : URL_PRODUCTION;
export const VERSION_JEU = '0.10';

export const CATEGORIES_AVIS = [
  ['idee', '💡 Idée d\'amélioration'], ['contenu', '✨ Nouveau contenu'], ['gameplay', '🎮 Gameplay'],
  ['bug', '🐞 Bug rencontré'], ['collision', '🧱 Problème de collision'], ['graphismes', '🎨 Graphismes'],
  ['performance', '⚡ Performance'], ['interface', '🧭 Interface'], ['autre', '💬 Autre'],
];
export const NOMS_STATUTS = { nouveau: 'Nouveau', a_etudier: 'À étudier', en_cours: 'En cours', accepte: 'Accepté', refuse: 'Refusé', corrige: 'Corrigé' };

const CLE_JOUEUR = 'natx-royale-joueur';

async function appel(methode, chemin, corps, jeton) {
  if (!URL_API) throw new Error('Le serveur des avis n\'est pas encore en ligne.');
  let r;
  try {
    r = await fetch(URL_API + chemin, {
      method: methode,
      headers: { 'Content-Type': 'application/json', ...(jeton ? { 'X-Joueur': jeton } : {}) },
      body: corps ? JSON.stringify(corps) : undefined,
    });
  } catch (e) {
    throw new Error('Impossible de joindre le serveur des avis. Vérifie ta connexion et réessaie.');
  }
  let d = {};
  try { d = await r.json(); } catch (e) { d = {}; }
  if (!r.ok) throw new Error(d.erreur || 'Le serveur a refusé la demande.');
  return d;
}

// Le serveur est-il là ? (une seule vérification toutes les 30 s)
let santeT = 0, santeOk = null;
export async function serveurDispo() {
  if (!URL_API) return false;
  if (santeOk !== null && performance.now() - santeT < 30000) return santeOk;
  try { await appel('GET', '/sante'); santeOk = true; } catch (e) { santeOk = false; }
  santeT = performance.now();
  return santeOk;
}

// Identité anonyme (id au hasard signé par le serveur) : jamais le pseudo ni d'info personnelle
let identiteEnCours = null; // une seule demande à la fois (sinon deux identités au premier lancement)
async function jetonJoueur() {
  try {
    const j = JSON.parse(localStorage.getItem(CLE_JOUEUR) || 'null');
    if (j && typeof j.jeton === 'string') return j.jeton;
  } catch (e) { /* rien */ }
  if (!identiteEnCours) {
    identiteEnCours = appel('POST', '/joueurs').then(d => {
      try { localStorage.setItem(CLE_JOUEUR, JSON.stringify({ id: d.id, jeton: d.jeton })); } catch (e) { /* stockage bloqué */ }
      return d.jeton;
    }).finally(() => { identiteEnCours = null; });
  }
  return identiteEnCours;
}
// si le serveur ne reconnaît plus l'identité (nouvelle base, clé changée), on en redemande une
async function avecJeton(f) {
  try { return await f(await jetonJoueur()); }
  catch (e) {
    if (!/invalide/i.test(e.message)) throw e;
    try { localStorage.removeItem(CLE_JOUEUR); } catch (er) { /* rien */ }
    return f(await jetonJoueur());
  }
}

export function envoyerAvis(avis) {
  return avecJeton(jeton => appel('POST', '/retours', { ...avis, jeton, version: VERSION_JEU }));
}

export function signalerPartie(partie) {
  if (!URL_API || !partie.partie_id) return Promise.resolve(null);
  return avecJeton(jeton => appel('POST', '/parties', { ...partie, jeton })).catch(() => null);
}

export async function chargerSuggestions(tri = 'populaires') {
  let jeton = null;
  try { jeton = await jetonJoueur(); } catch (e) { jeton = null; }
  const d = await appel('GET', '/suggestions?tri=' + encodeURIComponent(tri), null, jeton);
  return d.suggestions;
}

// ---------- Serveur relais (TURN) pour jouer entre potes en 4G ----------
// Le serveur garde la clé secrète et donne des accès temporaires ; sans réponse en 3 s, on fait sans.
let relaisCache = null, relaisT = 0;
export async function serveursRelais() {
  if (!URL_API) return [];
  if (relaisCache && performance.now() - relaisT < 30 * 60 * 1000) return relaisCache;
  try {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), 3000);
    const r = await fetch(URL_API + '/relais', { signal: ctrl.signal });
    clearTimeout(t);
    const d = r.ok ? await r.json() : {};
    relaisCache = Array.isArray(d.iceServers) ? d.iceServers.filter(s => s && s.urls) : [];
    relaisT = performance.now();
  } catch (e) { relaisCache = []; relaisT = performance.now() - 29 * 60 * 1000; }
  return relaisCache;
}

// ---------- Cadeaux de l'admin, annonce, bonus de pièces ----------
export const chargerEtatJeu = () => appel('GET', '/jeu');
export const recupererCadeaux = () => avecJeton(jeton => appel('POST', '/cadeaux', { jeton }));
// Boîte de réception (le serveur décide de ce qui est livré et note chaque ouverture une seule fois)
export const recupererBoite = () => avecJeton(jeton => appel('POST', '/boite', { jeton }));
export const ouvrirCadeauServeur = id => avecJeton(jeton => appel('POST', '/boite/ouvrir', { jeton, id }));
export const avertissementLu = id => avecJeton(jeton => appel('POST', '/boite/avertissement', { jeton, id }));
// liaison staff : le joueur répond à la demande d'un compte admin ; l'hôte vérifie les Tenues Staff des joueurs
export const repondreLiaison = (id, accepter) => avecJeton(jeton => appel('POST', '/boite/liaison', { jeton, id, accepter: accepter === true }));
export const verifierStaff = liste => avecJeton(jeton => appel('POST', '/staff/verifier', { jeton, liste }));
// Ce que le jeu déclare (pseudo, niveau, inventaire…) pour la page « joueurs » de l'admin
export const envoyerProfil = profil => avecJeton(jeton => appel('POST', '/profil', { jeton, profil }));
export const signalerJoueur = d => avecJeton(jeton => appel('POST', '/signalements', { jeton, ...d }));
// Cargaisons : l'hôte demande au serveur ce qu'il y a dedans ; celui qui l'ouvre réclame sa récompense
export const demanderCargaison = d => avecJeton(jeton => appel('POST', '/cargaison', { jeton, ...d }));
export const reclamerCargaison = d => avecJeton(jeton => appel('POST', '/cargaison/reclamer', { jeton, ...d }));
// Esprit exporté sur un autel : le serveur tire la rareté et le met dans la boîte du joueur
export const exporterEsprit = d => avecJeton(jeton => appel('POST', '/esprit/exporter', { jeton, ...d }));
// Éclats d'esprit : le solde est gardé sur le serveur ; le jeu annonce ce qu'il a gagné dans la partie et paie les améliorations
export const soldeEclats = () => avecJeton(jeton => appel('POST', '/eclats', { jeton }));
export const gagnerEclats = d => avecJeton(jeton => appel('POST', '/eclats/gagner', { jeton, ...d }));
export const depenserEclats = d => avecJeton(jeton => appel('POST', '/eclats/depenser', { jeton, ...d }));
export const perdreEsprit = d => avecJeton(jeton => appel('POST', '/esprit/perdre', { jeton, ...d }));       // mort avec son esprit de départ
export const recupererEsprit = d => avecJeton(jeton => appel('POST', '/esprit/recuperer', { jeton, ...d })); // le racheter avec des éclats
export const niveauxEsprits = refs => avecJeton(jeton => appel('POST', '/esprits/niveaux', { jeton, refs })); // l'hôte, au début d'une partie
export const utiliserCodeCadeau = code => avecJeton(jeton => appel('POST', '/cadeaux/code', { jeton, code }));
// Compte : sauvegarde en ligne du profil, code de sauvegarde, récupération sur un autre appareil
export const chargerCompte = () => avecJeton(jeton => appel('POST', '/compte/charger', { jeton }));
export const sauvegarderCompte = (rev, profil) => avecJeton(jeton => appel('POST', '/compte/sauvegarder', { jeton, rev, profil }));
export async function nouveauCodeSauvegarde() {
  const d = await avecJeton(jeton => appel('POST', '/compte/code', { jeton }));
  memoriserCodeSauvegarde(d.code);
  return d.code;
}
// le code de sauvegarde est gardé dans CE navigateur (pour pouvoir le relire) ; le serveur n'en garde qu'une empreinte
export function codeSauvegardeLocal() {
  try { return JSON.parse(localStorage.getItem(CLE_JOUEUR) || 'null')?.code || null; } catch (e) { return null; }
}
function memoriserCodeSauvegarde(code) {
  try { const j = JSON.parse(localStorage.getItem(CLE_JOUEUR) || 'null'); if (j) { j.code = code; localStorage.setItem(CLE_JOUEUR, JSON.stringify(j)); } } catch (e) { /* rien */ }
}
// Sur un autre navigateur : le code redonne l'identité (et la sauvegarde, renvoyée à compte.js)
export async function recupererCompte(code) {
  const d = await appel('POST', '/compte/recuperer', { code });
  localStorage.setItem(CLE_JOUEUR, JSON.stringify({ id: d.id, jeton: d.jeton, code: String(code).toUpperCase().replace(/[^A-Z0-9]/g, '').replace(/(.{4})(?=.)/g, '$1-') }));
  return d;
}

// Code joueur à donner à l'admin pour recevoir un cadeau perso (8 premiers caractères de l'identité anonyme)
export async function codeJoueur() {
  await jetonJoueur();
  const j = JSON.parse(localStorage.getItem(CLE_JOUEUR) || 'null');
  return j && /^[0-9a-f]{24}$/.test(j.id) ? (j.id.slice(0, 4) + '-' + j.id.slice(4, 8)).toUpperCase() : null;
}

export function voter(id, oui) {
  return avecJeton(jeton => appel(oui ? 'POST' : 'DELETE', `/suggestions/${id | 0}/vote`, oui ? { jeton } : null, jeton));
}
