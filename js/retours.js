// Retours des joueurs (avis, bugs, idées) et votes : on parle au serveur NATX ROYALE (dossier serveur/).
// Rien n'est gardé ici à la place du serveur : sans serveur joignable, l'envoi échoue proprement.
// Le seul élément enregistré dans le navigateur est l'identifiant anonyme du joueur (pour voter une seule fois).

// Adresse du serveur en ligne (alwaysdata, mis en ligne le 8 nov. 2026 — voir serveur/LISEZMOI.md).
// En local (localhost), le jeu parle au serveur de test http://localhost:8799 à la place.
const URL_PRODUCTION = 'https://chrysalide.alwaysdata.net/natx/api';
export const URL_API = ['localhost', '127.0.0.1'].includes(location.hostname) ? `http://${location.hostname}:8799/api` : URL_PRODUCTION;
export const VERSION_JEU = '0.9';

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

// ---------- Cadeaux de l'admin, annonce, bonus de pièces ----------
export const chargerEtatJeu = () => appel('GET', '/jeu');
export const recupererCadeaux = () => avecJeton(jeton => appel('POST', '/cadeaux', { jeton }));
export const utiliserCodeCadeau = code => avecJeton(jeton => appel('POST', '/cadeaux/code', { jeton, code }));
// Code joueur à donner à l'admin pour recevoir un cadeau perso (8 premiers caractères de l'identité anonyme)
export async function codeJoueur() {
  await jetonJoueur();
  const j = JSON.parse(localStorage.getItem(CLE_JOUEUR) || 'null');
  return j && /^[0-9a-f]{24}$/.test(j.id) ? (j.id.slice(0, 4) + '-' + j.id.slice(4, 8)).toUpperCase() : null;
}

export function voter(id, oui) {
  return avecJeton(jeton => appel(oui ? 'POST' : 'DELETE', `/suggestions/${id | 0}/vote`, oui ? { jeton } : null, jeton));
}
