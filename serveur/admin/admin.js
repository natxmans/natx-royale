// Espace administrateur de NATX ROYALE. Aucun secret ici : la session est un cookie HttpOnly
// posé par le serveur, et chaque modification envoie le jeton anti-CSRF reçu à la connexion.
const $ = s => document.querySelector(s);
// l'API est à côté de la page admin (…/admin/ → …/api/admin), que le site soit à la racine ou sous /natx
const BASE_API = new URL('../api/admin', location.href).pathname;
let CSRF = null;
let CATEGORIES = {}, STATUTS = [];
const NOMS_STATUTS = { nouveau: 'Nouveau', a_etudier: 'À étudier', en_cours: 'En cours', accepte: 'Accepté', refuse: 'Refusé', corrige: 'Corrigé' };
const filtres = { groupe: '', categorie: '', statut: '', public: '', q: '', tri: 'recent', page: 0, spam: '0' };
let detailId = null, lignesAffichees = [];

// ---------- Outils ----------
function el(tag, attrs = {}, ...enfants) {
  const e = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (k === 'class') e.className = v; else if (k.startsWith('on')) e.addEventListener(k.slice(2), v); else if (v !== undefined && v !== null) e.setAttribute(k, v);
  }
  for (const c of enfants.flat()) if (c !== null && c !== undefined && c !== false) e.append(c instanceof Node ? c : document.createTextNode(String(c)));
  return e;
}
const date = s => new Date(s * 1000).toLocaleString('fr-FR', { day: '2-digit', month: '2-digit', year: '2-digit', hour: '2-digit', minute: '2-digit' });
const etoiles = n => n ? '★'.repeat(n) + '☆'.repeat(5 - n) : '—';
let toastT = null;
function toast(texte, erreur = false) {
  const t = $('#toast');
  t.textContent = texte; t.classList.toggle('erreur-toast', erreur); t.classList.remove('cache');
  clearTimeout(toastT); toastT = setTimeout(() => t.classList.add('cache'), 2600);
}

async function api(methode, chemin, corps) {
  const r = await fetch(BASE_API + chemin, {
    method: methode, credentials: 'same-origin',
    headers: { 'Content-Type': 'application/json', ...(CSRF && methode !== 'GET' ? { 'X-CSRF': CSRF } : {}) },
    body: corps ? JSON.stringify(corps) : undefined,
  });
  let d = {};
  try { d = await r.json(); } catch (e) { d = {}; }
  if (r.status === 401 && chemin !== '/connexion') { montrerConnexion(d.erreur); throw new Error(d.erreur || 'Connexion nécessaire.'); }
  if (!r.ok) throw new Error(d.erreur || 'Erreur ' + r.status);
  return d;
}

// ---------- Connexion ----------
function montrerConnexion(message = '') {
  CSRF = null;
  $('#ecranAdmin').classList.add('cache');
  $('#ecranConnexion').classList.remove('cache');
  $('#erreurConnexion').textContent = message;
  $('#motDePasse').value = '';
  $('#identifiant').focus();
}
$('#formConnexion').addEventListener('submit', async e => {
  e.preventDefault();
  const b = e.submitter || $('#formConnexion button'); b.disabled = true;
  try {
    const d = await api('POST', '/connexion', { identifiant: $('#identifiant').value, mot_de_passe: $('#motDePasse').value });
    CSRF = d.csrf;
    $('#motDePasse').value = '';
    await demarrer();
  } catch (err) { $('#erreurConnexion').textContent = err.message; }
  b.disabled = false;
});
$('#btnDeconnexion').addEventListener('click', async () => { try { await api('POST', '/deconnexion'); } catch (e) { /* rien */ } montrerConnexion('Tu es déconnecté.'); });

async function demarrer() {
  const moi = await api('GET', '/moi');
  CSRF = moi.csrf; CATEGORIES = moi.categories; STATUTS = moi.statuts;
  $('#nomAdmin').textContent = '👤 ' + moi.identifiant;
  remplirSelects();
  $('#ecranConnexion').classList.add('cache');
  $('#ecranAdmin').classList.remove('cache');
  montrerVue('tableau');
}

function remplirSelects() {
  const fc = $('#filtreCategorie'), fs = $('#filtreStatut'), ds = $('#detailStatut');
  fc.length = 1; fs.length = 1; ds.length = 0;
  for (const [k, v] of Object.entries(CATEGORIES)) fc.append(el('option', { value: k }, v));
  for (const s of STATUTS) { fs.append(el('option', { value: s }, NOMS_STATUTS[s])); ds.append(el('option', { value: s }, NOMS_STATUTS[s])); }
}

// ---------- Navigation ----------
for (const b of document.querySelectorAll('#navigation button')) b.addEventListener('click', () => {
  for (const x of document.querySelectorAll('#navigation button')) x.classList.toggle('actif', x === b);
  if (b.dataset.vue === 'tableau') montrerVue('tableau');
  else {
    const g = b.dataset.groupe;
    filtres.groupe = g === 'spam' ? '' : g; filtres.spam = g === 'spam' ? '1' : '0'; filtres.page = 0;
    $('#titreRetours').textContent = b.textContent.replace(/^\S+\s/, '');
    $('#btnPurger').classList.toggle('cache', g !== 'spam');
    montrerVue('retours');
  }
});
function montrerVue(v) {
  $('#vueTableau').classList.toggle('cache', v !== 'tableau');
  $('#vueRetours').classList.toggle('cache', v !== 'retours');
  fermerDetail();
  if (v === 'tableau') chargerTableau(); else chargerListe();
}

// ---------- Tableau de bord ----------
async function chargerTableau() {
  let d;
  try { d = await api('GET', '/tableau'); } catch (e) { toast(e.message, true); return; }
  const s = d.stats;
  const cartes = [
    ['Parties jouées', s.parties, 'cyan'], ['Retours reçus', s.retours, 'jaune'], ['Bugs signalés', s.bugs, 'rouge'], ['Idées et contenus', s.idees, 'violet'],
    ['Acceptées', s.acceptees, 'vert'], ['En cours', s.en_cours, ''], ['Nouveaux à lire', s.nouveaux, 'cyan'], ['Publiées', s.publiees, ''],
    ['Votes', s.votes, ''], ['Note moyenne', s.note_moyenne ? s.note_moyenne + ' / 5' : '—', 'jaune'], ['Spams', s.spams, ''],
  ];
  $('#cartesStats').replaceChildren(...cartes.map(([t, v, c]) => el('div', { class: 'stat ' + c }, el('b', {}, v), el('span', {}, t))));
  const max = Math.max(1, ...Object.values(d.par_categorie));
  $('#parCategorie').replaceChildren(...Object.entries(CATEGORIES).map(([k, nom]) => {
    const n = d.par_categorie[k] || 0;
    const barre = el('i'); barre.style.width = Math.round(n / max * 100) + '%';
    return el('div', { class: 'barre' }, el('span', {}, nom), el('div', {}, barre), el('em', {}, n));
  }));
  const maxJ = Math.max(1, ...d.jours.map(j => j.n));
  $('#parJour').replaceChildren(...(d.jours.length ? d.jours.map(j => {
    const b = el('i'); b.style.height = Math.round(j.n / maxJ * 100) + '%';
    return el('div', { title: j.jour + ' : ' + j.n }, String(j.n), b, j.jour.slice(5));
  }) : [el('p', { class: 'vide' }, 'Pas encore de retours.')]));
  $('#populaires').replaceChildren(...(d.populaires.length ? d.populaires.map(p => el('li', {}, el('b', {}, '▲ ' + p.votes), p.texte, ' ', el('span', { class: 'badge st-' + p.statut }, NOMS_STATUTS[p.statut])))
    : [el('p', { class: 'vide' }, 'Aucune suggestion publiée pour l\'instant.')]));
}
$('#btnActualiser').addEventListener('click', chargerTableau);

// ---------- Liste ----------
async function chargerListe() {
  const p = new URLSearchParams();
  for (const k of ['groupe', 'categorie', 'statut', 'public', 'q', 'tri', 'page', 'spam']) if (filtres[k] !== '' && filtres[k] !== null) p.set(k, filtres[k]);
  let d;
  try { d = await api('GET', '/retours?' + p); } catch (e) { toast(e.message, true); return; }
  lignesAffichees = d.retours;
  $('#totalRetours').textContent = d.total + ' au total';
  $('#vide').classList.toggle('cache', d.retours.length > 0);
  $('#lignes').replaceChildren(...d.retours.map(r => {
    const tr = el('tr', { onclick: () => ouvrirDetail(r.id) },
      el('td', {}, '#' + r.id), el('td', {}, date(r.cree_le)),
      el('td', {}, el('span', { class: 'badge cat-' + r.categorie }, CATEGORIES[r.categorie] || r.categorie)),
      el('td', {}, el('span', { class: 'etoiles' }, etoiles(r.note))),
      el('td', {}, el('div', { class: 'extrait' }, r.texte || '(note seule)')),
      el('td', {}, el('span', { class: 'badge st-' + r.statut }, NOMS_STATUTS[r.statut])),
      el('td', {}, r.public ? '▲ ' + r.votes : '—'), el('td', {}, r.public ? '🌍' : '🔒'));
    if (r.id === detailId) tr.classList.add('choisi');
    return tr;
  }));
  const pages = Math.max(1, Math.ceil(d.total / 50));
  $('#infoPage').textContent = `Page ${d.page + 1} / ${pages}`;
  $('#pagePrec').disabled = d.page <= 0;
  $('#pageSuiv').disabled = d.page + 1 >= pages;
}
let rechercheT = null;
$('#recherche').addEventListener('input', e => { clearTimeout(rechercheT); rechercheT = setTimeout(() => { filtres.q = e.target.value.trim(); filtres.page = 0; chargerListe(); }, 300); });
for (const [id, cle] of [['#filtreCategorie', 'categorie'], ['#filtreStatut', 'statut'], ['#filtrePublic', 'public'], ['#filtreTri', 'tri']]) {
  $(id).addEventListener('change', e => { filtres[cle] = e.target.value; filtres.page = 0; chargerListe(); });
}
$('#pagePrec').addEventListener('click', () => { filtres.page = Math.max(0, filtres.page - 1); chargerListe(); });
$('#pageSuiv').addEventListener('click', () => { filtres.page++; chargerListe(); });
$('#btnPurger').addEventListener('click', async () => {
  if (!confirm('Supprimer définitivement tous les retours marqués comme spam ?')) return;
  try { const d = await api('POST', '/spams/purger'); toast(d.supprimes + ' spams supprimés'); chargerListe(); } catch (e) { toast(e.message, true); }
});

// ---------- Détail ----------
async function ouvrirDetail(id) {
  let r;
  try { r = await api('GET', '/retours/' + id); } catch (e) { toast(e.message, true); return; }
  detailId = id;
  afficherDetail(r);
  for (const tr of document.querySelectorAll('#lignes tr')) tr.classList.remove('choisi');
  const i = lignesAffichees.findIndex(l => l.id === id);
  if (i >= 0) document.querySelectorAll('#lignes tr')[i]?.classList.add('choisi');
}
function afficherDetail(r) {
  $('#detail').classList.remove('cache');
  $('#detailTitre').textContent = `Retour #${r.id}`;
  $('#detailMeta').replaceChildren(...[
    el('span', { class: 'badge cat-' + r.categorie }, CATEGORIES[r.categorie] || r.categorie),
    el('span', { class: 'badge' }, date(r.cree_le)),
    el('span', { class: 'badge etoiles' }, etoiles(r.note)),
    el('span', { class: 'badge' }, '▲ ' + r.votes + ' vote' + (r.votes > 1 ? 's' : '')),
    r.partie_id ? el('span', { class: 'badge', title: 'Identifiant de la partie' }, '🎮 ' + r.partie_id) : null,
    r.plateforme ? el('span', { class: 'badge' }, r.plateforme === 'tactile' ? '📱 téléphone' : '💻 ordinateur') : null,
    r.version_jeu ? el('span', { class: 'badge' }, 'v' + r.version_jeu) : null,
    r.autres_du_joueur ? el('span', { class: 'badge' }, r.autres_du_joueur + ' autre(s) retour(s) de ce joueur') : null,
    r.spam ? el('span', { class: 'badge cat-bug' }, '🚫 spam') : null,
  ].filter(Boolean));
  $('#detailTexte').textContent = r.texte || '(le joueur a seulement donné une note)';
  $('#detailStatut').value = r.statut;
  $('#detailPublic').checked = !!r.public;
  $('#detailTextePublic').value = r.texte_public || '';
  $('#btnSpam').textContent = r.spam ? 'Ce n\'est pas un spam' : 'Marquer comme spam';
  $('#btnSpam').dataset.spam = r.spam ? '1' : '0';
  $('#detailNotes').replaceChildren(...(r.notes.length ? r.notes.map(n => el('li', {}, n.texte, el('small', {}, (n.auteur || '?') + ' · ' + date(n.cree_le))))
    : [el('li', { class: 'vide' }, 'Aucune note.')]));
  $('#detailJournal').replaceChildren(...(r.journal.length ? r.journal.map(j => el('li', {}, j.action, el('small', {}, (j.auteur || '?') + ' · ' + date(j.cree_le)))) : [el('li', {}, 'Rien pour l\'instant.')]));
}
function fermerDetail() { detailId = null; $('#detail').classList.add('cache'); }
$('#fermerDetail').addEventListener('click', fermerDetail);
addEventListener('keydown', e => { if (e.key === 'Escape') fermerDetail(); });

$('#btnEnregistrer').addEventListener('click', async () => {
  try {
    const r = await api('POST', '/retours/' + detailId, { statut: $('#detailStatut').value, public: $('#detailPublic').checked, texte_public: $('#detailTextePublic').value });
    afficherDetail(r); toast('Enregistré ✔'); chargerListe();
  } catch (e) { toast(e.message, true); }
});
$('#btnSpam').addEventListener('click', async () => {
  try {
    const r = await api('POST', '/retours/' + detailId, { spam: $('#btnSpam').dataset.spam !== '1' });
    afficherDetail(r); toast(r.spam ? 'Marqué comme spam' : 'Remis dans les retours'); chargerListe();
  } catch (e) { toast(e.message, true); }
});
$('#btnSupprimer').addEventListener('click', async () => {
  if (!confirm(`Supprimer définitivement le retour #${detailId} (et ses votes, ses notes) ?`)) return;
  try { await api('DELETE', '/retours/' + detailId); fermerDetail(); toast('Supprimé'); chargerListe(); } catch (e) { toast(e.message, true); }
});
$('#btnNote').addEventListener('click', async () => {
  const texte = $('#nouvelleNote').value.trim();
  if (!texte) return;
  try { const r = await api('POST', `/retours/${detailId}/notes`, { texte }); $('#nouvelleNote').value = ''; afficherDetail(r); toast('Note ajoutée'); }
  catch (e) { toast(e.message, true); }
});

// ---------- Démarrage ----------
demarrer().catch(() => montrerConnexion());
