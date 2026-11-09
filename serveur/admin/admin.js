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
const VUES = { tableau: '#vueTableau', retours: '#vueRetours', cadeaux: '#vueCadeaux', joueurs: '#vueJoueurs', jeu: '#vueJeu' };
for (const b of document.querySelectorAll('#navigation button')) b.addEventListener('click', () => {
  allumerNav(b);
  if (b.dataset.vue === 'retours') {
    const g = b.dataset.groupe;
    filtres.groupe = g === 'spam' ? '' : g; filtres.spam = g === 'spam' ? '1' : '0'; filtres.page = 0;
    $('#titreRetours').textContent = b.textContent.replace(/^\S+\s/, '');
    $('#btnPurger').classList.toggle('cache', g !== 'spam');
  }
  montrerVue(b.dataset.vue);
});
function allumerNav(b) { for (const x of document.querySelectorAll('#navigation button')) x.classList.toggle('actif', x === b); }
function montrerVue(v) {
  for (const [nom, sel] of Object.entries(VUES)) $(sel).classList.toggle('cache', nom !== v);
  fermerDetail();
  ({ tableau: chargerTableau, retours: chargerListe, cadeaux: chargerCadeaux, joueurs: chargerJoueurs, jeu: chargerJeu })[v]();
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
    ['Joueurs', s.joueurs ?? 0, 'violet'], ['Actifs (7 jours)', s.actifs_7j ?? 0, 'vert'], ['Cadeaux reçus', s.cadeaux_recus ?? 0, 'jaune'],
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
    r.joueur_code ? el('span', { class: 'badge', title: 'Code joueur de l\'auteur' }, '👤 ' + r.joueur_code) : null,
    r.autres_du_joueur ? el('span', { class: 'badge' }, r.autres_du_joueur + ' autre(s) retour(s) de ce joueur') : null,
    r.spam ? el('span', { class: 'badge cat-bug' }, '🚫 spam') : null,
  ].filter(Boolean));
  $('#detailTexte').textContent = r.texte || '(le joueur a seulement donné une note)';
  $('#btnOffrir').dataset.joueur = r.joueur_code || '';
  $('#btnOffrir').classList.toggle('cache', !r.joueur_code);
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

// ---------- Cadeaux et skins ----------
let CATALOGUE = null;
const choisis = new Set();
const NOMS_RARETES = { commun: 'Commun', rare: 'Rare', epique: 'Épique', legendaire: 'Légendaire', collab: 'Collab 2K27' };
const formatCode = c => { const x = c.replace(/[^0-9a-f]/gi, '').toUpperCase().slice(0, 8); return x.length > 4 ? x.slice(0, 4) + '-' + x.slice(4) : x; };
const jusquau = t => t ? new Date(t * 1000).toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }) : 'sans limite';

async function chargerCadeaux() {
  try {
    if (!CATALOGUE) { CATALOGUE = await api('GET', '/catalogue'); dessinerObjets(); }
    const d = await api('GET', '/cadeaux');
    dessinerListeCadeaux(d.cadeaux);
  } catch (e) { toast(e.message, true); }
  majFormulaireCadeau();
}

function objetsOffrables() { return (CATALOGUE?.objets || []).filter(o => !o.gratuit); }

function dessinerObjets() {
  const filtre = $('#cRecherche').value.trim().toLowerCase();
  const groupes = (CATALOGUE.categories || []).map(cat => {
    const objets = objetsOffrables().filter(o => o.cat === cat.id && (!filtre || o.nom.toLowerCase().includes(filtre) || NOMS_RARETES[o.rarete]?.toLowerCase().includes(filtre)));
    if (!objets.length) return null;
    const tous = objets.every(o => choisis.has(o.cle));
    const entete = el('button', { class: 'cat-objets', type: 'button', title: tous ? 'Tout décocher' : 'Tout cocher', onclick: () => {
      for (const o of objets) tous ? choisis.delete(o.cle) : choisis.add(o.cle);
      dessinerObjets();
    } }, cat.icone + ' ' + cat.nom, el('small', {}, objets.filter(o => choisis.has(o.cle)).length + ' / ' + objets.length));
    return el('div', { class: 'groupe-objets' }, entete, el('div', { class: 'puces' }, ...objets.map(o => {
      const b = el('button', { type: 'button', class: 'puce r-' + o.rarete + (choisis.has(o.cle) ? ' choisie' : ''), title: NOMS_RARETES[o.rarete] || o.rarete,
        onclick: () => { choisis.has(o.cle) ? choisis.delete(o.cle) : choisis.add(o.cle); b.classList.toggle('choisie'); majFormulaireCadeau(); } }, o.nom);
      return b;
    })));
  }).filter(Boolean);
  $('#cObjets').replaceChildren(...(groupes.length ? groupes : [el('p', { class: 'vide' }, 'Aucun objet ne correspond.')]));
  majFormulaireCadeau();
}

function majFormulaireCadeau() {
  const cible = $('#cCible').value;
  $('#cBlocJoueur').classList.toggle('cache', cible !== 'joueur');
  $('#cBlocCode').classList.toggle('cache', cible !== 'code');
  $('#cBlocMax').classList.toggle('cache', cible !== 'code');
  const n = choisis.size, pieces = Math.max(0, +$('#cPieces').value || 0);
  $('#cCompteObjets').textContent = n ? n + ' objet' + (n > 1 ? 's' : '') + ' choisi' + (n > 1 ? 's' : '') : 'aucun objet choisi';
  const pour = { tous: 'pour tout le monde', joueur: 'pour le joueur ' + ($('#cJoueur').value || '…'), code: 'avec un code cadeau' }[cible];
  const contenu = [pieces ? pieces + ' 🪙' : null, n ? n + ' objet' + (n > 1 ? 's' : '') : null].filter(Boolean).join(' + ') || 'rien pour l\'instant';
  $('#cResume').textContent = contenu + ' · ' + pour;
}
$('#cCible').addEventListener('change', majFormulaireCadeau);
$('#cPieces').addEventListener('input', majFormulaireCadeau);
$('#cJoueur').addEventListener('input', e => { e.target.value = formatCode(e.target.value); majFormulaireCadeau(); });
$('#cRecherche').addEventListener('input', () => CATALOGUE && dessinerObjets());
for (const b of document.querySelectorAll('[data-choix]')) b.addEventListener('click', () => {
  const c = b.dataset.choix;
  if (c === 'rien') choisis.clear();
  else for (const o of objetsOffrables()) if (c === 'tout' || o.rarete === c) choisis.add(o.cle);
  dessinerObjets();
});

$('#btnCreerCadeau').addEventListener('click', async () => {
  const cible = $('#cCible').value;
  const corps = {
    titre: $('#cTitre').value.trim(), message: $('#cMessage').value.trim(), cible,
    pieces: +$('#cPieces').value || 0, objets: [...choisis], duree_jours: +$('#cDuree').value,
    joueur: cible === 'joueur' ? $('#cJoueur').value : undefined,
    code: cible === 'code' ? $('#cCode').value : undefined,
    max_utilisations: cible === 'code' && $('#cMax').value ? +$('#cMax').value : undefined,
  };
  if (!corps.titre) { toast('Donne un nom au cadeau.', true); $('#cTitre').focus(); return; }
  const b = $('#btnCreerCadeau'); b.disabled = true;
  try {
    const d = await api('POST', '/cadeaux', corps);
    const r = $('#cResultat');
    r.classList.remove('cache');
    r.replaceChildren(...(d.code ? ['✅ Cadeau créé ! Code à donner aux joueurs : ', el('b', { class: 'code' }, d.code)]
      : ['✅ Cadeau créé ! ' + (cible === 'tous' ? 'Tous les joueurs le recevront en ouvrant le jeu.' : 'Le joueur ' + corps.joueur + ' le recevra en ouvrant le jeu.')]));
    toast('Cadeau créé 🎁');
    $('#cTitre').value = ''; $('#cMessage').value = ''; $('#cCode').value = ''; $('#cMax').value = ''; $('#cPieces').value = 0;
    choisis.clear(); dessinerObjets();
    dessinerListeCadeaux((await api('GET', '/cadeaux')).cadeaux);
  } catch (e) { toast(e.message, true); }
  b.disabled = false;
});

function dessinerListeCadeaux(liste) {
  $('#videCadeaux').classList.toggle('cache', liste.length > 0);
  const noms = Object.fromEntries((CATALOGUE?.objets || []).map(o => [o.cle, o.nom]));
  $('#lignesCadeaux').replaceChildren(...liste.map(c => {
    const expire = c.expire_le && c.expire_le * 1000 < Date.now();
    const pour = c.cible === 'tous' ? '🌍 Tout le monde' : c.cible === 'joueur' ? '👤 ' + c.joueur_code : null;
    const contenu = [c.pieces ? c.pieces + ' 🪙' : null, ...c.objets.slice(0, 4).map(k => noms[k] || k)].filter(Boolean).join(', ') + (c.objets.length > 4 ? ` +${c.objets.length - 4} autres` : '');
    const etat = !c.actif ? el('span', { class: 'badge st-refuse' }, 'arrêté') : expire ? el('span', { class: 'badge' }, 'expiré') : el('span', { class: 'badge st-accepte' }, 'actif');
    return el('tr', { class: 'sans-clic' + (c.actif && !expire ? '' : ' eteint') },
      el('td', {}, el('b', {}, c.titre), c.message ? el('div', { class: 'petit' }, c.message) : null, el('div', { class: 'petit' }, date(c.cree_le) + (c.auteur ? ' · ' + c.auteur : ''))),
      el('td', {}, pour || ['🔑 ', el('b', { class: 'code' }, c.code)]),
      el('td', {}, el('div', { class: 'extrait' }, contenu)),
      el('td', {}, c.recus + (c.max_utilisations ? ' / ' + c.max_utilisations : '') + ' joueur' + (c.recus > 1 ? 's' : '')),
      el('td', {}, jusquau(c.expire_le), ' ', etat),
      el('td', { class: 'boutons-ligne' },
        el('button', { class: 'bouton discret petit', title: c.actif ? 'Ne plus donner ce cadeau' : 'Donner à nouveau ce cadeau', onclick: async () => {
          try { await api('POST', '/cadeaux/' + c.id, { actif: !c.actif }); chargerCadeaux(); } catch (e) { toast(e.message, true); }
        } }, c.actif ? '⏸️ Arrêter' : '▶️ Réactiver'),
        el('button', { class: 'bouton danger petit', title: 'Supprimer ce cadeau', onclick: async () => {
          if (!confirm(`Supprimer le cadeau « ${c.titre} » ? (Les joueurs qui l'ont reçu le gardent.)`)) return;
          try { await api('DELETE', '/cadeaux/' + c.id); toast('Cadeau supprimé'); chargerCadeaux(); } catch (e) { toast(e.message, true); }
        } }, '🗑️')));
  }));
}

// ouvrir le formulaire de cadeau déjà rempli pour un joueur
function offrirA(code) {
  allumerNav(document.querySelector('#navigation [data-vue="cadeaux"]'));
  montrerVue('cadeaux');
  $('#cCible').value = 'joueur'; $('#cJoueur').value = code; majFormulaireCadeau();
  $('#cTitre').focus();
}
$('#btnOffrir').addEventListener('click', () => $('#btnOffrir').dataset.joueur && offrirA($('#btnOffrir').dataset.joueur));

// ---------- Joueurs ----------
const filtreJoueurs = { q: '', page: 0 };
async function chargerJoueurs() {
  let d;
  try { d = await api('GET', `/joueurs?q=${encodeURIComponent(filtreJoueurs.q)}&page=${filtreJoueurs.page}`); } catch (e) { toast(e.message, true); return; }
  $('#totalJoueurs').textContent = d.total + ' joueur' + (d.total > 1 ? 's' : '');
  $('#videJoueurs').classList.toggle('cache', d.joueurs.length > 0);
  $('#lignesJoueurs').replaceChildren(...d.joueurs.map(j => el('tr', { class: 'sans-clic' + (j.bloque ? ' eteint' : '') },
    el('td', {}, el('b', { class: 'code' }, j.code), j.bloque ? el('span', { class: 'badge cat-bug' }, 'bloqué') : null),
    el('td', {}, date(j.cree_le)), el('td', {}, j.vu_le ? date(j.vu_le) : '—'),
    el('td', {}, j.parties), el('td', {}, j.retours), el('td', {}, j.cadeaux),
    el('td', { class: 'boutons-ligne' },
      el('button', { class: 'bouton petit', onclick: () => offrirA(j.code) }, '🎁 Offrir'),
      el('button', { class: 'bouton discret petit', onclick: async () => {
        if (!j.bloque && !confirm(`Bloquer le joueur ${j.code} ? Il ne pourra plus envoyer d'avis, voter ni utiliser de code cadeau.`)) return;
        try { await api('POST', '/joueurs/bloquer', { joueur: j.code, bloque: !j.bloque }); toast(j.bloque ? 'Joueur débloqué' : 'Joueur bloqué'); chargerJoueurs(); } catch (e) { toast(e.message, true); }
      } }, j.bloque ? '✅ Débloquer' : '🚫 Bloquer')))));
  const pages = Math.max(1, Math.ceil(d.total / 50));
  $('#infoJoueurs').textContent = `Page ${d.page + 1} / ${pages}`;
  $('#joueursPrec').disabled = d.page <= 0;
  $('#joueursSuiv').disabled = d.page + 1 >= pages;
}
let rechercheJT = null;
$('#rechercheJoueur').addEventListener('input', e => { clearTimeout(rechercheJT); rechercheJT = setTimeout(() => { filtreJoueurs.q = e.target.value.replace(/[^0-9a-f]/gi, ''); filtreJoueurs.page = 0; chargerJoueurs(); }, 300); });
$('#joueursPrec').addEventListener('click', () => { filtreJoueurs.page = Math.max(0, filtreJoueurs.page - 1); chargerJoueurs(); });
$('#joueursSuiv').addEventListener('click', () => { filtreJoueurs.page++; chargerJoueurs(); });

// ---------- Annonce et bonus ----------
function afficherJeu(d) {
  const a = d.annonce || {};
  $('#jAnnonce').value = a.texte || '';
  $('#jStyle').value = a.style || 'info';
  $('#jAnnonceActive').checked = !!a.active;
  majApercu();
  const b = d.en_ligne?.bonus;
  $('#jBonusEtat').replaceChildren(b
    ? el('span', { class: 'actif' }, `⚡ En cours : ${b.texte} × ${String(b.multiplicateur).replace('.', ',')} jusqu'au ${jusquau(b.fin)}`)
    : el('span', {}, 'Aucun bonus en cours.'));
  $('#btnStopBonus').classList.toggle('cache', !b);
  if (b) { $('#jMult').value = String(b.multiplicateur); $('#jBonusTexte').value = b.texte; }
}
function majApercu() {
  const p = $('#jApercu');
  p.className = 'apercu-annonce ' + $('#jStyle').value + ($('#jAnnonceActive').checked ? '' : ' eteint');
  p.textContent = $('#jAnnonce').value.trim() || '(message vide)';
}
async function chargerJeu() { try { afficherJeu(await api('GET', '/jeu')); } catch (e) { toast(e.message, true); } }
for (const id of ['#jAnnonce', '#jStyle', '#jAnnonceActive']) $(id).addEventListener('input', majApercu);
$('#btnAnnonce').addEventListener('click', async () => {
  try {
    afficherJeu(await api('POST', '/jeu', { annonce: { texte: $('#jAnnonce').value, style: $('#jStyle').value, active: $('#jAnnonceActive').checked } }));
    toast($('#jAnnonceActive').checked ? 'Annonce affichée dans le jeu 📢' : 'Annonce enregistrée (cachée)');
  } catch (e) { toast(e.message, true); }
});
$('#btnBonus').addEventListener('click', async () => {
  try {
    afficherJeu(await api('POST', '/jeu', { bonus: { multiplicateur: +$('#jMult').value, heures: +$('#jDuree').value, texte: $('#jBonusTexte').value || 'Bonus de pièces' } }));
    toast('Bonus lancé ⚡');
  } catch (e) { toast(e.message, true); }
});
$('#btnStopBonus').addEventListener('click', async () => {
  try { afficherJeu(await api('POST', '/jeu', { bonus: { multiplicateur: 1 } })); toast('Bonus arrêté'); } catch (e) { toast(e.message, true); }
});

// ---------- Démarrage ----------
demarrer().catch(() => montrerConnexion());
