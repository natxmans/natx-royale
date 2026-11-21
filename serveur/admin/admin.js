// Espace administrateur de NATX ROYALE.
// Aucun secret ici : la session est un cookie HttpOnly posé par le serveur ; chaque modification envoie le jeton
// anti-CSRF reçu à la connexion et un identifiant d'action (X-Action) contre les doubles clics.
// Le menu ne montre que ce que le rôle permet, mais c'est le SERVEUR qui vérifie la permission à chaque requête.
// Tout le texte venant du serveur passe par textContent (jamais innerHTML).
const $ = s => document.querySelector(s);
const VRAIE_ADRESSE = 'https://chrysalide.alwaysdata.net/natx/admin/';
if (/github\.io$/i.test(location.hostname)) location.replace(VRAIE_ADRESSE);
const BASE_API = new URL('../api/admin', location.href).pathname;
const JEU = 'https://natxmans.github.io/natx-royale/';
let CSRF = null, MOI = null;
const PERM = p => !!MOI && MOI.permissions.includes(p);

// ================================================================ outils
function el(tag, attrs = {}, ...enfants) {
  const e = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs || {})) {
    if (v === undefined || v === null || v === false) continue;
    if (k === 'class') e.className = v;
    else if (k.startsWith('on')) e.addEventListener(k.slice(2), v);
    else if (k === 'value') e.value = v;
    else if (k === 'checked') e.checked = !!v;
    else e.setAttribute(k, v === true ? '' : v);
  }
  for (const c of enfants.flat()) if (c !== null && c !== undefined && c !== false) e.append(c instanceof Node ? c : document.createTextNode(String(c)));
  return e;
}
const svg = (tag, attrs = {}) => { const e = document.createElementNS('http://www.w3.org/2000/svg', tag); for (const [k, v] of Object.entries(attrs)) e.setAttribute(k, v); return e; };
const date = s => s ? new Date(s * 1000).toLocaleString('fr-FR', { day: '2-digit', month: '2-digit', year: '2-digit', hour: '2-digit', minute: '2-digit' }) : '—';
const jour = s => s ? new Date(s * 1000).toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit', year: 'numeric' }) : '—';
const duree = s => s < 60 ? s + ' s' : s < 3600 ? Math.round(s / 60) + ' min' : s < 86400 ? (s / 3600).toFixed(1) + ' h' : (s / 86400).toFixed(1) + ' j';
const taille = o => o < 1024 ? o + ' o' : o < 1048576 ? (o / 1024).toFixed(1) + ' Ko' : (o / 1048576).toFixed(2) + ' Mo';
const nombre = n => (n ?? 0).toLocaleString('fr-FR');
const versInput = s => { if (!s) return ''; const d = new Date(s * 1000); d.setMinutes(d.getMinutes() - d.getTimezoneOffset()); return d.toISOString().slice(0, 16); };
const depuisInput = v => v ? Math.round(new Date(v).getTime() / 1000) : 0;
const idAction = () => (crypto.randomUUID ? crypto.randomUUID() : Date.now().toString(36) + '-' + Math.random().toString(36).slice(2));
let toastT = null;
function toast(texte, erreur = false) {
  const t = $('#toast');
  t.textContent = texte; t.classList.toggle('erreur-toast', erreur); t.classList.remove('cache');
  clearTimeout(toastT); toastT = setTimeout(() => t.classList.add('cache'), erreur ? 4200 : 2600);
}

async function api(methode, chemin, corps) {
  const r = await fetch(BASE_API + chemin, {
    method: methode, credentials: 'same-origin',
    headers: { 'Content-Type': 'application/json', ...(CSRF && methode !== 'GET' ? { 'X-CSRF': CSRF, 'X-Action': idAction() } : {}) },
    body: corps ? JSON.stringify(corps) : undefined,
  });
  let d = {};
  try { d = await r.json(); } catch (e) { d = { erreur: `Ce n'est pas le serveur NATX ROYALE (erreur ${r.status}). Ouvre ${VRAIE_ADRESSE}` }; }
  if (r.status === 401 && chemin !== '/connexion') { montrerConnexion(d.erreur); throw new Error(d.erreur || 'Connexion nécessaire.'); }
  if (!r.ok) { const e = new Error(d.erreur || 'Erreur ' + r.status); e.code = r.status; throw e; }
  return d;
}
// bouton occupé pendant l'action (pas de double clic) + message de réussite ou d'erreur
async function action(bouton, f, ok) {
  if (bouton) bouton.disabled = true;
  try { const r = await f(); if (ok) toast(ok); return r; } catch (e) { toast(e.message, true); return null; } finally { if (bouton) bouton.disabled = false; }
}

// Fenêtre de confirmation des actions sensibles : renvoie { confirmation, mot_de_passe } ou null
function demander({ titre, texte, mot = null, mdp = false, bouton = 'Confirmer', danger = true }) {
  return new Promise(resolve => {
    $('#modaleTitre').textContent = titre;
    $('#modaleTexte').textContent = texte || '';
    $('#modaleBlocMot').classList.toggle('cache', !mot);
    $('#modaleConsigne').textContent = mot ? `Tape « ${mot} » pour confirmer` : '';
    $('#modaleMot').value = ''; $('#modaleMdp').value = '';
    $('#modaleBlocMdp').classList.toggle('cache', !mdp);
    $('#modaleOk').textContent = bouton;
    $('#modaleOk').className = 'bouton ' + (danger ? 'danger' : 'principal');
    $('#modale').classList.remove('cache');
    (mot ? $('#modaleMot') : mdp ? $('#modaleMdp') : $('#modaleOk')).focus();
    const fin = v => { $('#modale').classList.add('cache'); $('#modaleForm').onsubmit = null; $('#modaleAnnuler').onclick = null; resolve(v); };
    $('#modaleForm').onsubmit = e => {
      e.preventDefault();
      if (mot && $('#modaleMot').value.trim().toUpperCase() !== mot.toUpperCase()) { $('#modaleMot').focus(); toast(`Tape exactement « ${mot} ».`, true); return; }
      if (mdp && !$('#modaleMdp').value) { $('#modaleMdp').focus(); return; }
      fin({ confirmation: mot || undefined, mot_de_passe: mdp ? $('#modaleMdp').value : undefined });
    };
    $('#modaleAnnuler').onclick = () => fin(null);
  });
}

// petits composants
const carteStat = (titre, valeur, couleur = '', sous = '') => el('div', { class: 'stat ' + couleur }, el('b', {}, valeur), el('span', {}, titre), sous ? el('small', {}, sous) : null);
const panneau = (titre, ...contenu) => el('section', { class: 'panneau' }, titre ? el('h2', {}, titre) : null, ...contenu);
const tableau = (entetes, lignes, vide = 'Rien pour l\'instant.') => el('div', { class: 'table-cadre' },
  el('table', { class: 'table' }, el('thead', {}, el('tr', {}, entetes.map(h => el('th', {}, h)))), el('tbody', {}, lignes)),
  lignes.length ? null : el('p', { class: 'vide' }, vide));
const pastille = (texte, type = '') => el('span', { class: 'badge ' + type }, texte);
const champ = (libelle, input) => el('label', {}, libelle, input);
const choix = (options, valeur, attrs = {}) => el('select', attrs, Object.entries(options).map(([k, v]) => el('option', { value: k, selected: k === String(valeur) ? true : null }, v)));
function pages(total, page, parPage, aller) {
  const n = Math.max(1, Math.ceil(total / parPage));
  return el('div', { class: 'pages' },
    el('button', { class: 'bouton discret', disabled: page <= 0, onclick: () => aller(page - 1) }, '← Précédents'),
    el('span', {}, `Page ${page + 1} / ${n} · ${nombre(total)} au total`),
    el('button', { class: 'bouton discret', disabled: page + 1 >= n, onclick: () => aller(page + 1) }, 'Suivants →'));
}
function barres(series, couleurs) {
  // histogramme groupé (14 jours) en SVG : series = [{ nom, valeurs:[{x, y}] }]
  const w = 640, h = 180, marge = 22;
  const n = series[0].valeurs.length;
  const max = Math.max(1, ...series.flatMap(s => s.valeurs.map(v => v.y)));
  const g = svg('svg', { viewBox: `0 0 ${w} ${h + 30}`, class: 'graphe', role: 'img', 'aria-label': series.map(s => s.nom).join(', ') });
  const larg = (w - marge) / n, lb = Math.max(2, (larg - 6) / series.length);
  for (let k = 0; k <= 4; k++) {
    const y = h - (h - 10) * k / 4;
    g.append(svg('line', { x1: marge, x2: w, y1: y, y2: y, class: 'grille' }));
    const t = svg('text', { x: 0, y: y + 4, class: 'axe' }); t.textContent = Math.round(max * k / 4); g.append(t);
  }
  series.forEach((s, i) => s.valeurs.forEach((v, j) => {
    const hb = (h - 10) * v.y / max;
    const r = svg('rect', { x: marge + j * larg + 3 + i * lb, y: h - hb, width: lb - 1, height: Math.max(0, hb), rx: 2, fill: couleurs[i] });
    const titre = svg('title'); titre.textContent = `${s.nom} — ${v.x} : ${v.y}`; r.append(titre);
    g.append(r);
  }));
  const pas = Math.max(1, Math.ceil(n / 12));
  series[0].valeurs.forEach((v, j) => {
    if (j % pas) return;
    const t = svg('text', { x: marge + j * larg + 2, y: h + 16, class: 'axe' });
    t.textContent = v.x.includes('T') ? v.x.slice(11) + ' h' : v.x.slice(5).split('-').reverse().join('/');
    g.append(t);
  });
  const legende = el('div', { class: 'legende' }, series.map((s, i) => { const c = el('i'); c.style.background = couleurs[i]; return el('span', {}, c, s.nom); }));
  return el('div', {}, g, legende);
}

// ================================================================ connexion
function montrerConnexion(message = '') {
  CSRF = null; MOI = null;
  $('#ecranAdmin').classList.add('cache');
  $('#ecranConnexion').classList.remove('cache');
  $('#erreurConnexion').textContent = message;
  $('#motDePasse').value = '';
  $('#identifiant').focus();
}
$('#formConnexion').addEventListener('submit', async e => {
  e.preventDefault();
  const b = $('#formConnexion button'); b.disabled = true;
  try {
    const d = await api('POST', '/connexion', { identifiant: $('#identifiant').value, mot_de_passe: $('#motDePasse').value });
    CSRF = d.csrf;
    $('#motDePasse').value = '';
    await demarrer();
  } catch (err) { $('#erreurConnexion').textContent = err.message; }
  b.disabled = false;
});
$('#btnDeconnexion').addEventListener('click', async () => { try { await api('POST', '/deconnexion'); } catch (e) { /* rien */ } montrerConnexion('Tu es déconnecté.'); });

// ================================================================ navigation (menu selon le rôle)
const PAGES = [
  { id: 'tableau', titre: '📊 Tableau de bord', perm: 'tableau', f: vueTableau },
  { groupe: 'Joueurs' },
  { id: 'joueurs', titre: '👥 Joueurs', perm: 'joueurs.voir', f: vueJoueurs },
  { id: 'signalements', titre: '🚩 Signalements', perm: 'signalements', f: vueSignalements },
  { id: 'sanctions', titre: '⛔ Sanctions', perm: 'joueurs.voir', f: vueSanctions },
  { id: 'retours', titre: '💬 Avis et bugs', perm: 'retours', f: vueRetours },
  { groupe: 'Le jeu' },
  { id: 'cadeaux', titre: '🎁 Cadeaux', perm: 'cadeaux.voir', f: vueCadeaux },
  { id: 'cosmetiques', titre: '🎩 Cosmétiques', perm: 'cosmetiques.voir', f: vueCosmetiques },
  { id: 'boutique', titre: '🛒 Boutique et promos', perm: 'cosmetiques.voir', f: vueBoutique },
  { id: 'esprits', titre: '✨ Esprits', perm: 'esprits.voir', f: vueEsprits },
  { id: 'evenements', titre: '📦 Cargaisons et événements', perm: 'evenements.voir', f: vueEvenements },
  { id: 'annonce', titre: '📢 Annonce et bonus', perm: 'annonce', f: vueAnnonce },
  { groupe: 'Sécurité' },
  { id: 'admins', titre: '🛡️ Administrateurs', perm: 'admins.voir', f: vueAdmins },
  { id: 'journal', titre: '📜 Journal d\'audit', perm: 'journal', f: vueJournal },
  { id: 'sauvegardes', titre: '💾 Sauvegardes', perm: 'sauvegardes.voir', f: vueSauvegardes },
  { id: 'serveur', titre: '🖥️ État du serveur', perm: 'serveur', f: vueServeur },
  { id: 'compte', titre: '👤 Mon compte', perm: null, f: vueCompte },
];

function dessinerMenu() {
  const nav = $('#navigation');
  nav.replaceChildren();
  let groupe = null;
  for (const p of PAGES) {
    if (p.groupe) { groupe = el('span', { class: 'separateur' }, p.groupe); continue; }
    if (p.perm && !PERM(p.perm)) continue;
    if (groupe) { nav.append(groupe); groupe = null; }
    nav.append(el('a', { href: '#' + p.id, 'data-page': p.id }, p.titre));
  }
}
function menuMobile(ouvrir) {
  document.body.classList.toggle('menu-ouvert', ouvrir);
  $('#btnMenu').setAttribute('aria-expanded', String(ouvrir));
}
$('#btnMenu').addEventListener('click', () => menuMobile(!document.body.classList.contains('menu-ouvert')));
$('#voileMenu').addEventListener('click', () => menuMobile(false));
$('#fermerTiroir').addEventListener('click', fermerTiroir);

let vueActuelle = null;
async function router() {
  if (!MOI) return;
  menuMobile(false);
  fermerTiroir();
  let [id, ...arg] = (location.hash.slice(1) || 'tableau').split('/');
  if (MOI.doit_changer_mdp) id = 'compte';
  let p = PAGES.find(x => x.id === id && (!x.perm || PERM(x.perm)));
  if (id === 'joueur' && PERM('joueurs.voir')) p = { id: 'joueurs', titre: '👥 Joueur', f: () => vueFicheJoueur(decodeURIComponent(arg[0] || '')) };
  if (!p) p = PAGES.find(x => x.id === 'tableau');
  for (const a of document.querySelectorAll('#navigation a')) a.classList.toggle('actif', a.dataset.page === p.id);
  $('#titreMobile').textContent = p.titre.replace(/^\S+\s/, '');
  const c = $('#contenu');
  c.replaceChildren(el('p', { class: 'chargement' }, 'Chargement…'));
  vueActuelle = p.id + arg.join('/');
  const moiVue = vueActuelle;
  try {
    const contenu = await p.f(c);
    if (moiVue !== vueActuelle) return; // l'admin a changé de page entre-temps
    if (contenu) c.replaceChildren(...[].concat(contenu));
  } catch (e) {
    if (moiVue === vueActuelle) c.replaceChildren(el('p', { class: 'erreur' }, e.message));
  }
  c.focus({ preventScroll: true });
}
window.addEventListener('hashchange', router);
const recharger = () => router();

function ouvrirTiroir(titre, ...contenu) {
  $('#tiroirTitre').textContent = titre;
  $('#tiroirCorps').replaceChildren(...contenu);
  $('#tiroir').classList.remove('cache');
}
function fermerTiroir() { $('#tiroir').classList.add('cache'); }

async function demarrer() {
  MOI = await api('GET', '/moi');
  CSRF = MOI.csrf;
  $('#nomAdmin').textContent = '👤 ' + MOI.identifiant;
  $('#roleAdmin').textContent = MOI.role_nom;
  dessinerMenu();
  $('#ecranConnexion').classList.add('cache');
  $('#ecranAdmin').classList.remove('cache');
  router();
}

// ================================================================ tableau de bord
async function vueTableau() {
  const d = await api('GET', '/tableau');
  const j = d.jeu, s = d.stats || {};
  const cartes = [
    carteStat('Joueurs inscrits', nombre(j.joueurs), 'violet'),
    carteStat('Connectés maintenant', nombre(j.connectes), 'vert', 'vus il y a moins de 2 min'),
    carteStat('Nouveaux comptes', nombre(j.nouveaux_24h), 'cyan', `${nombre(j.nouveaux_7j)} sur 7 jours`),
    carteStat('Actifs (24 h)', nombre(j.actifs_24h), ''),
    carteStat('Parties (24 h)', nombre(j.parties_24h), 'jaune'),
    carteStat('Cadeaux envoyés', nombre(j.cadeaux_envoyes), 'jaune', `${nombre(j.cadeaux_livres)} livrés · ${nombre(j.cadeaux_ouverts)} ouverts`),
    carteStat('Cadeaux pas ouverts', nombre(j.cadeaux_en_attente), ''),
    carteStat('Cosmétiques', nombre(j.cosmetiques_anciens + j.cosmetiques_250_livres), 'cyan', `dont ${j.cosmetiques_250_livres} / ${j.cosmetiques_250_total} nouveaux`),
    carteStat('Esprits obtenus', nombre(j.esprits_obtenus), 'violet'),
    carteStat('Signalements à traiter', nombre(j.signalements_nouveaux), j.signalements_nouveaux ? 'rouge' : ''),
    carteStat('Sanctions en cours', nombre(j.sanctions_actives), ''),
    carteStat('Serveur', j.serveur.erreurs_24h ? `⚠️ ${j.serveur.erreurs_24h} erreur(s)` : '✅ OK', j.serveur.erreurs_24h ? 'rouge' : 'vert', 'démarré il y a ' + duree(j.serveur.depuis_s)),
    carteStat('Sauvegardes', j.sauvegardes.nb ? nombre(j.sauvegardes.nb) : 'aucune', j.sauvegardes.nb ? 'vert' : 'rouge', j.sauvegardes.derniere ? 'dernière : ' + date(j.sauvegardes.derniere) : 'pas encore faite'),
  ];
  if (PERM('retours')) cartes.push(carteStat('Avis à lire', nombre(s.nouveaux), 'cyan'), carteStat('Bugs signalés', nombre(s.bugs), 'rouge'));
  const evs = j.evenements_actifs.length
    ? el('ul', { class: 'liste-simple' }, j.evenements_actifs.map(e => el('li', {}, el('b', {}, '📦 ' + e.nom), ' — jusqu\'au ' + date(e.fin))))
    : el('p', { class: 'vide' }, 'Aucun événement en cours.');
  const serie = d.serie14.map(x => x);
  return [
    el('header', { class: 'titre' }, el('h1', {}, 'Tableau de bord'), el('button', { class: 'bouton discret', onclick: recharger }, '↻ Actualiser')),
    el('div', { class: 'cartes-stats' }, cartes),
    el('div', { class: 'grille-2' },
      panneau('Les 14 derniers jours', barres([
        { nom: 'Joueurs actifs', valeurs: serie.map(x => ({ x: x.jour, y: x.actifs })) },
        { nom: 'Nouveaux', valeurs: serie.map(x => ({ x: x.jour, y: x.nouveaux })) },
        { nom: 'Parties', valeurs: serie.map(x => ({ x: x.jour, y: x.parties })) },
      ], ['#4fd1ff', '#b552ff', '#ffd23f'])),
      panneau('Activité récente', d.activite.length ? el('ul', { class: 'journal' }, d.activite.map(a => el('li', {}, el('time', {}, date(a.quand)), ' ', a.texte)))
        : el('p', { class: 'vide' }, 'Rien pour l\'instant.'))),
    el('div', { class: 'grille-2' },
      panneau('📦 Événements actifs', evs),
      panneau('✨ Esprits obtenus', Object.keys(j.esprits_par_type).length
        ? el('ul', { class: 'liste-simple' }, Object.entries(j.esprits_par_type).map(([t, n]) => el('li', {}, `${t} : ${n}`)))
        : el('p', { class: 'vide' }, 'Aucun esprit gagné pour l\'instant (cargaisons).'))),
    PERM('retours') && d.populaires.length ? panneau('💡 Suggestions les plus populaires', el('ol', { class: 'populaires' }, d.populaires.map(p => el('li', {}, el('b', {}, '▲ ' + p.votes), ' ', p.texte)))) : null,
  ];
}

// ================================================================ joueurs
const etatJoueurs = { q: '', filtre: '', page: 0 };
const NOMS_SANCTIONS = { avertissement: '⚠️ Avertissement', muet: '🔇 Muet', cadeaux: '🎁 Privé de cadeaux', suspension: '⛔ Suspendu' };
async function vueJoueurs() {
  const p = new URLSearchParams({ q: etatJoueurs.q, filtre: etatJoueurs.filtre, page: etatJoueurs.page });
  const d = await api('GET', '/joueurs?' + p);
  const recherche = el('input', { type: 'search', placeholder: 'Pseudo ou code joueur (ex. 80FD-FB83)…', value: etatJoueurs.q, maxlength: 40 });
  let minuterie;
  recherche.addEventListener('input', () => { clearTimeout(minuterie); minuterie = setTimeout(() => { etatJoueurs.q = recherche.value; etatJoueurs.page = 0; recharger(); }, 350); });
  const filtre = choix({ '': 'Tous', connectes: '🟢 Connectés', nouveaux: '🆕 Nouveaux (24 h)', sanctionnes: '⛔ Sanctionnés', signales: '🚩 Signalés' }, etatJoueurs.filtre,
    { onchange: e => { etatJoueurs.filtre = e.target.value; etatJoueurs.page = 0; recharger(); } });
  const lignes = d.joueurs.map(j => el('tr', { class: 'cliquable', onclick: () => { location.hash = 'joueur/' + j.code; } },
    el('td', {}, el('b', { class: 'code' }, j.code)), el('td', {}, j.pseudo || '—', j.connecte ? ' 🟢' : ''), el('td', {}, j.niveau ?? '—'),
    el('td', {}, jour(j.cree_le)), el('td', {}, date(j.vu_le)), el('td', {}, j.parties), el('td', {}, j.cadeaux),
    el('td', {}, j.signalements ? pastille('🚩 ' + j.signalements, 'rouge') : '—'),
    el('td', {}, j.sanctions.map(s => pastille(NOMS_SANCTIONS[s] || s, 'rouge')))));
  setTimeout(() => recherche.focus(), 0);
  return [
    el('header', { class: 'titre' }, el('h1', {}, 'Joueurs'), el('span', { class: 'compte' }, nombre(d.total) + ' trouvé(s)')),
    el('p', { class: 'aide' }, 'Les joueurs sont anonymes : un code joueur (visible dans la Boutique du jeu) et le pseudo que leur jeu déclare. ',
      'Le profil (niveau, inventaire, esprits) est celui envoyé par leur jeu : il est indicatif, pas vérifié.'),
    el('div', { class: 'filtres' }, recherche, filtre),
    tableau(['Code', 'Pseudo', 'Niveau', 'Arrivé le', 'Vu le', 'Parties', 'Cadeaux', 'Signalé', 'Sanctions'], lignes, 'Aucun joueur.'),
    pages(d.total, d.page, 50, n => { etatJoueurs.page = n; recharger(); }),
  ];
}

async function vueFicheJoueur(code) {
  const c = code.replace(/[^0-9A-Fa-f]/g, '').toLowerCase();
  const d = await api('GET', '/joueurs/j' + c);
  const p = d.profil;
  const blocs = [];
  blocs.push(el('header', { class: 'titre' }, el('h1', {}, (p?.pseudo || 'Joueur') + ' '), el('span', { class: 'code gros' }, d.code),
    d.connecte ? pastille('🟢 connecté', 'vert') : null, el('a', { class: 'bouton discret', href: '#joueurs' }, '← Tous les joueurs')));
  blocs.push(el('div', { class: 'cartes-stats' },
    carteStat('Arrivé le', jour(d.cree_le)), carteStat('Vu le', date(d.vu_le)), carteStat('Niveau', p ? p.niveau : '—', 'jaune'),
    carteStat('Pièces (déclarées)', p ? nombre(p.pieces) : '—', 'jaune'), carteStat('Objets', p ? p.possedes.length : '—', 'cyan'),
    carteStat('Parties', p?.stats?.parties ?? d.parties.length, ''), carteStat('Avis envoyés', d.retours, ''),
    carteStat('Sanctions en cours', d.sanctions_actives.length ? d.sanctions_actives.map(s => NOMS_SANCTIONS[s] || s).join(', ') : 'aucune', d.sanctions_actives.length ? 'rouge' : 'vert')));
  const actions = el('div', { class: 'actions' });
  if (PERM('cadeaux.creer')) actions.append(el('a', { class: 'bouton', href: '#cadeaux', onclick: () => { brouillonCadeau.cible = 'joueur'; brouillonCadeau.joueur = d.code; } }, '🎁 Offrir un cadeau'));
  if (PERM('joueurs.sanctionner')) actions.append(el('button', { class: 'bouton danger', onclick: () => formSanction(d.code) }, '⛔ Sanctionner'));
  blocs.push(actions);
  if (p) {
    const parCat = {};
    for (const o of p.possedes) (parCat[o.cle.split(':')[0]] ||= []).push(o.nom);
    blocs.push(el('div', { class: 'grille-2' },
      panneau('🎒 Inventaire (déclaré par le jeu le ' + date(p.maj_le) + ')', Object.keys(parCat).length
        ? el('div', { class: 'inventaire' }, Object.entries(parCat).map(([cat, noms]) => el('details', {}, el('summary', {}, `${cat} (${noms.length})`), el('p', {}, noms.join(', ')))))
        : el('p', { class: 'vide' }, 'Rien.'),
      el('h3', {}, 'Équipé'), el('p', {}, Object.entries(p.equipe).map(([k, v]) => `${k} : ${v}`).join(' · ') || '—')),
      panneau('✨ Esprits', p.esprits.length ? el('ul', { class: 'liste-simple' }, p.esprits.map(e => el('li', {}, `${e.type} (${e.rarete}) × ${e.n}`))) : el('p', { class: 'vide' }, 'Aucun esprit dans sa collection.'),
        d.esprits_obtenus.length ? el('p', { class: 'aide' }, `${d.esprits_obtenus.length} gagné(s) dans des cargaisons (serveur).`) : null)));
  } else blocs.push(panneau('Profil', el('p', { class: 'vide' }, 'Son jeu n\'a pas encore envoyé de profil (ancienne version du jeu ?).')));
  blocs.push(el('div', { class: 'grille-2' },
    panneau('🎁 Cadeaux', tableau(['Cadeau', 'De', 'Reçu', 'Ouvert'], d.cadeaux.map(x => el('tr', {}, el('td', {}, x.titre), el('td', {}, x.expediteur), el('td', {}, date(x.recu_le)),
      el('td', {}, x.annule_le ? pastille('annulé', 'gris') : x.ouvert_le ? date(x.ouvert_le) : pastille('pas ouvert', 'jaune')))), 'Aucun cadeau.')),
    panneau('📅 Historique des connexions (30 jours)', tableau(['Jour', 'Première', 'Dernière', 'Sessions'], d.connexions.map(x => el('tr', {}, el('td', {}, x.jour),
      el('td', {}, new Date(x.premiere * 1000).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })),
      el('td', {}, new Date(x.derniere * 1000).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })), el('td', {}, x.nb))), 'Aucune connexion notée.'))));
  blocs.push(el('div', { class: 'grille-2' },
    panneau('🚩 Signalements reçus', tableau(['Date', 'Motif', 'Texte', 'Statut'], d.signalements_recus.map(x => el('tr', {}, el('td', {}, date(x.cree_le)), el('td', {}, x.motif), el('td', {}, x.texte || '—'), el('td', {}, x.statut))), 'Aucun.')),
    panneau('🎮 Dernières parties', tableau(['Date', 'Mode', 'Joueurs', 'Place', 'Élim.'], d.parties.map(x => el('tr', {}, el('td', {}, date(x.cree_le)), el('td', {}, x.mode), el('td', {}, x.nb_joueurs), el('td', {}, x.place || '—'), el('td', {}, x.kills))), 'Aucune partie envoyée.'))));
  blocs.push(panneau('⛔ Sanctions (historique complet)', tableau(['Type', 'Motif', 'Début', 'Fin', 'Par', 'État', ''], d.sanctions.map(s => el('tr', {},
    el('td', {}, NOMS_SANCTIONS[s.type] || s.type), el('td', {}, s.motif), el('td', {}, date(s.debut)), el('td', {}, s.fin ? date(s.fin) : 'sans limite'), el('td', {}, s.par || '—'),
    el('td', {}, s.active ? pastille('en cours', 'rouge') : s.leve_le ? pastille('levée le ' + jour(s.leve_le) + (s.leve_par_nom ? ' par ' + s.leve_par_nom : ''), 'gris') : pastille('terminée', 'gris')),
    el('td', {}, s.active && PERM('joueurs.sanctionner') ? el('button', { class: 'bouton discret', onclick: e => leverSanction(s.id, e.target) }, 'Lever') : null))), 'Aucune sanction.')));
  blocs.push(panneau('📜 Historique des interventions', d.interventions.length ? el('ul', { class: 'journal' }, d.interventions.map(i => el('li', {}, el('time', {}, date(i.cree_le)), ' ', el('b', {}, i.par || 'serveur'), ' : ', i.action)))
    : el('p', { class: 'vide' }, 'Aucune intervention.')));
  return blocs;
}

function formSanction(code) {
  const types = MOI.types_sanctions;
  const type = choix(types, 'avertissement');
  const motif = el('textarea', { rows: 3, maxlength: 300, placeholder: 'Ex. : insultes dans la discussion le 21/11' });
  const dureeS = choix({ 1: '1 heure', 24: '1 jour', 72: '3 jours', 168: '1 semaine', 720: '30 jours', 0: 'Sans limite de durée' }, '24');
  const b = el('button', { class: 'bouton danger' }, 'Appliquer la sanction');
  b.onclick = async () => {
    const corps = { joueur: code, type: type.value, motif: motif.value, duree_heures: +dureeS.value };
    if (type.value === 'suspension' || (+dureeS.value === 0 && type.value !== 'avertissement')) {
      const c = await demander({ titre: 'Sanction lourde', texte: `${types[type.value]} pour ${code} (${dureeS.selectedOptions[0].textContent}).`, mot: 'CONFIRMER' });
      if (!c) return;
      corps.confirmation = c.confirmation;
    }
    if (await action(b, () => api('POST', '/sanctions', corps), 'Sanction appliquée.')) { fermerTiroir(); recharger(); }
  };
  ouvrirTiroir('Sanctionner ' + code, el('div', { class: 'bloc' },
    champ('Type', type), champ('Motif (le joueur le verra)', motif), champ('Durée (sauf avertissement)', dureeS),
    el('p', { class: 'aide' }, 'Avertissement : message affiché une fois dans le jeu. Muet : plus d\'avis, de votes ni de signalements. ',
      'Privé de cadeaux : plus de cadeaux, codes ni cargaisons. Suspendu : tout le serveur + plus de parties en ligne (contrôle fait par le jeu).'),
    el('div', { class: 'actions' }, b)));
}
async function leverSanction(id, bouton) {
  const c = await demander({ titre: 'Lever la sanction', texte: 'La sanction s\'arrête tout de suite.', bouton: 'Lever', danger: false });
  if (!c) return;
  if (await action(bouton, () => api('POST', `/sanctions/${id}/lever`, { motif: 'Levée depuis le panel' }), 'Sanction levée.')) recharger();
}

async function vueSanctions() {
  const actives = location.hash.includes('toutes') ? '0' : '1';
  const d = await api('GET', '/sanctions?actives=' + actives);
  return [
    el('header', { class: 'titre' }, el('h1', {}, 'Journal des sanctions'),
      el('a', { class: 'bouton discret', href: actives === '1' ? '#sanctions/toutes' : '#sanctions' }, actives === '1' ? 'Voir aussi les anciennes' : 'Seulement celles en cours')),
    tableau(['Joueur', 'Type', 'Motif', 'Début', 'Fin', 'Par', 'État', ''], d.sanctions.map(s => el('tr', {},
      el('td', {}, el('a', { href: '#joueur/' + s.joueur, class: 'code' }, s.joueur)), el('td', {}, NOMS_SANCTIONS[s.type] || s.type), el('td', {}, s.motif),
      el('td', {}, date(s.debut)), el('td', {}, s.fin ? date(s.fin) : 'sans limite'), el('td', {}, s.par || '—'),
      el('td', {}, s.active ? pastille('en cours', 'rouge') : pastille(s.leve_le ? 'levée' : 'terminée', 'gris')),
      el('td', {}, s.active && PERM('joueurs.sanctionner') ? el('button', { class: 'bouton discret', onclick: e => leverSanction(s.id, e.target) }, 'Lever') : null))), 'Aucune sanction.'),
  ];
}

const etatSignal = { statut: 'nouveau' };
async function vueSignalements() {
  const d = await api('GET', '/signalements?statut=' + etatSignal.statut);
  const filtre = choix({ '': 'Tous', ...d.statuts }, etatSignal.statut, { onchange: e => { etatSignal.statut = e.target.value; recharger(); } });
  const lignes = d.signalements.map(s => {
    const statut = choix(d.statuts, s.statut);
    const note = el('input', { placeholder: 'Note pour l\'équipe', value: s.note || '', maxlength: 500 });
    const b = el('button', { class: 'bouton' }, 'Enregistrer');
    b.onclick = async () => { if (await action(b, () => api('POST', '/signalements/' + s.id, { statut: statut.value, note: note.value }), 'Signalement mis à jour.')) recharger(); };
    return el('tr', {}, el('td', {}, date(s.cree_le)), el('td', {}, s.motif_nom), el('td', {}, s.texte || '—'),
      el('td', {}, s.cible ? el('a', { href: '#joueur/' + s.cible, class: 'code' }, s.cible) : (s.cible_pseudo || '?'), s.cible_pseudo ? ` (${s.cible_pseudo})` : '',
        s.cible_deja_signale > 1 ? el('div', {}, pastille(`signalé ${s.cible_deja_signale} fois`, 'rouge')) : null),
      el('td', {}, el('a', { href: '#joueur/' + s.auteur, class: 'code' }, s.auteur)),
      el('td', {}, PERM('signalements') ? el('div', { class: 'ligne-form' }, statut, note, b) : s.statut));
  });
  return [
    el('header', { class: 'titre' }, el('h1', {}, 'Signalements'), el('span', { class: 'compte' }, nombre(d.total))),
    el('p', { class: 'aide' }, 'Envoyés depuis le jeu (bouton 🚩 du classement). Le joueur signalé est retrouvé par une référence anonyme.'),
    el('div', { class: 'filtres' }, filtre),
    tableau(['Date', 'Motif', 'Texte', 'Joueur signalé', 'Par', 'Traitement'], lignes, 'Aucun signalement.'),
  ];
}

// ================================================================ avis et bugs (fonctions d'avant, gardées)
const filtres = { groupe: '', categorie: '', statut: '', public: '', q: '', tri: 'recent', page: 0, spam: '0' };
const NOMS_STATUTS = { nouveau: 'Nouveau', a_etudier: 'À étudier', en_cours: 'En cours', accepte: 'Accepté', refuse: 'Refusé', corrige: 'Corrigé' };
async function vueRetours() {
  const p = new URLSearchParams();
  for (const k of Object.keys(filtres)) if (filtres[k] !== '' && filtres[k] !== null) p.set(k, filtres[k]);
  const d = await api('GET', '/retours?' + p);
  const maj = (k, v) => { filtres[k] = v; filtres.page = 0; recharger(); };
  const recherche = el('input', { type: 'search', placeholder: 'Mot ou numéro…', value: filtres.q, maxlength: 80 });
  let t; recherche.addEventListener('input', () => { clearTimeout(t); t = setTimeout(() => maj('q', recherche.value), 350); });
  const groupe = choix({ '': 'Tous les retours', bugs: '🐞 Bugs', idees: '💡 Idées et avis', spam: '🚫 Spams' }, filtres.spam === '1' ? 'spam' : filtres.groupe,
    { onchange: e => { const v = e.target.value; filtres.groupe = v === 'spam' ? '' : v; filtres.spam = v === 'spam' ? '1' : '0'; filtres.page = 0; recharger(); } });
  const cat = choix({ '': 'Toutes les catégories', ...MOI.categories }, filtres.categorie, { onchange: e => maj('categorie', e.target.value) });
  const st = choix({ '': 'Tous les statuts', ...NOMS_STATUTS }, filtres.statut, { onchange: e => maj('statut', e.target.value) });
  const tri = choix({ recent: 'Plus récents', ancien: 'Plus anciens', votes: 'Plus de votes', note: 'Meilleure note' }, filtres.tri, { onchange: e => maj('tri', e.target.value) });
  const purge = filtres.spam === '1' ? el('button', { class: 'bouton danger', onclick: async e => {
    const c = await demander({ titre: 'Supprimer tous les spams', texte: 'Ils seront effacés pour de bon.', mot: 'CONFIRMER' });
    if (c && await action(e.target, () => api('POST', '/spams/purger', c), 'Spams supprimés.')) recharger();
  } }, 'Supprimer tous les spams') : null;
  const lignes = d.retours.map(r => el('tr', { class: 'cliquable', onclick: () => ouvrirRetour(r.id) },
    el('td', {}, '#' + r.id), el('td', {}, date(r.cree_le)), el('td', {}, MOI.categories[r.categorie] || r.categorie),
    el('td', {}, r.note ? '★'.repeat(r.note) : '—'), el('td', { class: 'texte-court' }, r.texte_public || r.texte || '—'),
    el('td', {}, pastille(NOMS_STATUTS[r.statut], 'st-' + r.statut)), el('td', {}, r.votes), el('td', {}, r.public ? '👁️' : '')));
  return [
    el('header', { class: 'titre' }, el('h1', {}, 'Avis, bugs et idées'), el('span', { class: 'compte' }, nombre(d.total))),
    el('div', { class: 'filtres' }, recherche, groupe, cat, st, tri, purge),
    tableau(['N°', 'Date', 'Catégorie', 'Note', 'Message', 'Statut', 'Votes', 'Public'], lignes, 'Aucun retour ici.'),
    pages(d.total, d.page, 50, n => { filtres.page = n; recharger(); }),
  ];
}
async function ouvrirRetour(id) {
  let r;
  try { r = await api('GET', '/retours/' + id); } catch (e) { toast(e.message, true); return; }
  const statut = choix(NOMS_STATUTS, r.statut);
  const publie = el('input', { type: 'checkbox', checked: !!r.public });
  const textePublic = el('textarea', { rows: 3, maxlength: 300, value: r.texte_public || '', placeholder: 'Laisser vide pour le message d\'origine' });
  const note = el('textarea', { rows: 3, maxlength: 2000, placeholder: 'Note pour l\'équipe…' });
  const enregistrer = el('button', { class: 'bouton principal' }, 'Enregistrer');
  enregistrer.onclick = async () => { if (await action(enregistrer, () => api('POST', '/retours/' + id, { statut: statut.value, public: publie.checked, texte_public: textePublic.value }), 'Enregistré.')) { ouvrirRetour(id); recharger(); } };
  const spam = el('button', { class: 'bouton discret' }, r.spam ? 'Pas un spam' : 'Marquer comme spam');
  spam.onclick = async () => { if (await action(spam, () => api('POST', '/retours/' + id, { spam: !r.spam }), 'Fait.')) { fermerTiroir(); recharger(); } };
  const suppr = el('button', { class: 'bouton danger' }, 'Supprimer');
  suppr.onclick = async () => { const c = await demander({ titre: 'Supprimer ce retour', texte: 'Il sera effacé pour de bon.' }); if (c && await action(suppr, () => api('DELETE', '/retours/' + id), 'Supprimé.')) { fermerTiroir(); recharger(); } };
  const ajoutNote = el('button', { class: 'bouton' }, 'Ajouter la note');
  ajoutNote.onclick = async () => { if (await action(ajoutNote, () => api('POST', `/retours/${id}/notes`, { texte: note.value }), 'Note ajoutée.')) ouvrirRetour(id); };
  ouvrirTiroir(`Retour #${id}`,
    el('div', { class: 'meta' }, `${MOI.categories[r.categorie] || r.categorie} · ${date(r.cree_le)} · ${r.plateforme || '?'} · v${r.version_jeu || '?'} · joueur `,
      el('a', { href: '#joueur/' + r.joueur_code, class: 'code' }, r.joueur_code), ` · ${r.votes} vote(s) · ${r.autres_du_joueur} autre(s) avis de ce joueur`),
    el('blockquote', { class: 'texte' }, r.texte || '(pas de texte)'),
    el('div', { class: 'bloc' }, champ('Statut', statut), el('label', { class: 'ligne' }, publie, 'Publier pour que les joueurs votent'), champ('Texte affiché aux joueurs', textePublic),
      el('div', { class: 'actions' }, enregistrer, spam, suppr)),
    el('div', { class: 'bloc' }, el('h3', {}, 'Notes internes (jamais visibles par les joueurs)'),
      el('ul', { class: 'notes' }, r.notes.map(n => el('li', {}, el('b', {}, n.auteur || '?'), ' · ', date(n.cree_le), el('p', {}, n.texte)))), note, ajoutNote),
    el('div', { class: 'bloc' }, el('h3', {}, 'Historique'), el('ul', { class: 'journal' }, r.journal.map(j => el('li', {}, el('time', {}, date(j.cree_le)), ' ', j.auteur || '?', ' : ', j.action)))));
}

// ================================================================ cadeaux
const brouillonCadeau = { cible: 'tous', joueur: '', objets: new Set() };
let CATALOGUE = null;
async function catalogue() { if (!CATALOGUE) CATALOGUE = await api('GET', '/catalogue'); return CATALOGUE; }
const etatCadeaux = { q: '', origine: '', page: 0 };
async function vueCadeaux() {
  const [d, cat] = await Promise.all([api('GET', '/cadeaux?' + new URLSearchParams(etatCadeaux)), catalogue()]);
  const blocs = [el('header', { class: 'titre' }, el('h1', {}, 'Cadeaux'), el('button', { class: 'bouton discret', onclick: recharger }, '↻ Actualiser'))];
  if (PERM('cadeaux.creer')) blocs.push(formCadeau(cat, d.expediteur_defaut));
  const recherche = el('input', { type: 'search', placeholder: 'Titre, expéditeur, code cadeau, code joueur ou pseudo…', value: etatCadeaux.q, maxlength: 40 });
  let t; recherche.addEventListener('input', () => { clearTimeout(t); t = setTimeout(() => { etatCadeaux.q = recherche.value; etatCadeaux.page = 0; recharger(); }, 400); });
  const origine = choix({ '': 'Toutes les origines', admin: 'Envoyés par l\'équipe', cargaison: 'Gagnés dans une cargaison' }, etatCadeaux.origine,
    { onchange: e => { etatCadeaux.origine = e.target.value; recharger(); } });
  const lignes = d.cadeaux.map(c => {
    const pour = c.cible === 'tous' ? '🌍 Tout le monde' : c.cible === 'joueur' ? '👤 ' + c.joueur_code : `🔑 ${c.code}${c.max_utilisations ? ` (max ${c.max_utilisations})` : ''}`;
    const contenu = [c.pieces ? `🪙 ${c.pieces}` : null, c.objets.length ? `${c.objets.length} objet(s)` : null, c.esprit ? `✨ ${c.esprit.type} (${c.esprit.rarete})` : null].filter(Boolean).join(' · ');
    const boutons = el('div', { class: 'boutons-ligne' }, el('button', { class: 'bouton discret', onclick: () => livraisons(c) }, 'Livraisons'));
    if (PERM('cadeaux.creer')) boutons.append(el('button', { class: 'bouton discret', onclick: async e => { if (await action(e.target, () => api('POST', '/cadeaux/' + c.id, { actif: !c.actif }), c.actif ? 'Cadeau arrêté.' : 'Cadeau réactivé.')) recharger(); } }, c.actif ? 'Arrêter' : 'Réactiver'));
    if (PERM('cadeaux.supprimer')) boutons.append(el('button', { class: 'bouton danger', onclick: async e => {
      const conf = await demander({ titre: 'Supprimer le cadeau', texte: `« ${c.titre} » : il disparaît des boîtes de ceux qui ne l'ont pas ouvert. Ceux qui l'ont ouvert le gardent.`, mot: 'CONFIRMER' });
      if (conf && await action(e.target, () => api('DELETE', '/cadeaux/' + c.id, conf), 'Cadeau supprimé.')) recharger();
    } }, 'Supprimer'));
    return el('tr', { class: c.actif ? '' : 'eteint' }, el('td', {}, el('b', {}, c.titre), el('div', { class: 'petit' }, date(c.cree_le), ' · ', c.auteur || c.origine)),
      el('td', {}, c.expediteur), el('td', {}, pour), el('td', {}, contenu || '—'),
      el('td', {}, `${c.recus} livré(s)`, el('div', { class: 'petit' }, `${c.ouverts} ouvert(s) · ${c.en_attente} en attente${c.annules ? ` · ${c.annules} annulé(s)` : ''}`)),
      el('td', {}, c.expire_le ? jour(c.expire_le) : 'sans limite'), el('td', {}, boutons));
  });
  blocs.push(panneau('Historique des cadeaux', el('div', { class: 'filtres' }, recherche, origine),
    tableau(['Cadeau', 'Expéditeur', 'Pour', 'Contenu', 'Statut de livraison', 'Jusqu\'au', ''], lignes, 'Aucun cadeau.'),
    pages(d.total, d.page, 100, n => { etatCadeaux.page = n; recharger(); })));
  blocs.push(await panneauProblemes());
  return blocs;
}

function formCadeau(cat, expediteurDefaut) {
  const b = brouillonCadeau;
  const titre = el('input', { maxlength: 60, placeholder: 'Ex. : Merci pour ton idée !' });
  const message = el('input', { maxlength: 200, placeholder: 'Ex. : Bravo pour ton TOP 1 !' });
  const expediteur = el('input', { maxlength: 40, placeholder: expediteurDefaut });
  const cible = choix({ tous: '🌍 Tout le monde', joueur: '👤 Un seul joueur', code: '🔑 Ceux qui tapent un code cadeau' }, b.cible);
  const joueur = el('input', { maxlength: 9, placeholder: 'ABCD-1234', value: b.joueur, autocomplete: 'off' });
  const code = el('input', { maxlength: 24, placeholder: 'Vide = au hasard', autocomplete: 'off' });
  const maxi = el('input', { type: 'number', min: 1, max: 100000, placeholder: 'Illimité' });
  const pieces = el('input', { type: 'number', min: 0, max: 100000, step: 50, value: 0 });
  const dureeC = choix({ 0: 'Sans limite', 1: '1 jour', 3: '3 jours', 7: '7 jours', 30: '30 jours' }, '7');
  const blocJoueur = champ('Code joueur', joueur), blocCode = champ('Code cadeau', code), blocMax = champ('Utilisations max', maxi);
  const majCible = () => { b.cible = cible.value; blocJoueur.classList.toggle('cache', cible.value !== 'joueur'); blocCode.classList.toggle('cache', cible.value !== 'code'); blocMax.classList.toggle('cache', cible.value !== 'code'); };
  cible.onchange = majCible; majCible();
  const offrables = cat.objets.filter(o => !o.gratuit);
  const rech = el('input', { type: 'search', placeholder: 'Chercher un objet…', maxlength: 40 });
  const filtreCat = choix({ '': 'Toutes catégories', ...Object.fromEntries(cat.categories.map(c => [c.id, c.icone + ' ' + c.nom])) }, '');
  const grille = el('div', { class: 'objets' });
  const compte = el('span', { class: 'compte' });
  const dessiner = () => {
    const q = rech.value.toLowerCase();
    grille.replaceChildren(...offrables.filter(o => (!filtreCat.value || o.cat === filtreCat.value) && (!q || o.nom.toLowerCase().includes(q))).slice(0, 400).map(o => {
      const c = el('button', { class: 'objet' + (b.objets.has(o.cle) ? ' choisi' : ''), type: 'button', title: o.cle }, el('b', {}, o.nom), el('small', {}, `${o.cat} · ${cat.raretes[o.rarete]?.nom || o.rarete}${o.nouveau250 ? ' · nouveau' : ''}`));
      c.style.setProperty('--rarete', cat.raretes[o.rarete]?.couleur || '#888');
      c.onclick = () => { b.objets.has(o.cle) ? b.objets.delete(o.cle) : b.objets.add(o.cle); dessiner(); };
      return c;
    }));
    compte.textContent = `${b.objets.size} objet(s) choisi(s)`;
  };
  rech.oninput = dessiner; filtreCat.onchange = dessiner; dessiner();
  const creer = el('button', { class: 'bouton principal' }, '🎁 Envoyer le cadeau');
  const resultat = el('p', { class: 'resultat cache', role: 'status' });
  creer.onclick = async () => {
    const corps = { titre: titre.value, message: message.value, expediteur: expediteur.value, cible: cible.value, joueur: joueur.value, code: code.value,
      max_utilisations: maxi.value, pieces: +pieces.value || 0, duree_jours: +dureeC.value, objets: [...b.objets] };
    const r = await action(creer, () => api('POST', '/cadeaux', corps), 'Cadeau envoyé.');
    if (r) {
      resultat.textContent = r.code ? `Code cadeau à donner : ${r.code}` : 'Le cadeau arrive dans la boîte de réception des joueurs (≈ 30 s si le jeu est ouvert, sinon à leur prochaine connexion).';
      resultat.classList.remove('cache');
      b.objets.clear(); b.joueur = ''; titre.value = ''; message.value = ''; dessiner();
      setTimeout(recharger, 1500);
    }
  };
  return panneau('🎁 Nouveau cadeau',
    el('p', { class: 'aide' }, 'Pièces, cosmétiques : pour tout le monde, un seul joueur (son code joueur est dans la Boutique du jeu) ou ceux qui tapent un code. ',
      'Le serveur le livre une seule fois par joueur ; le joueur le voit dans sa boîte de réception avec le nom de l\'expéditeur.'),
    el('div', { class: 'form-grille' }, champ('Nom du cadeau', titre), champ('Message (facultatif)', message), champ('Expéditeur affiché', expediteur),
      champ('Pour qui ?', cible), blocJoueur, blocCode, blocMax, champ('Pièces offertes', pieces), champ('Valable', dureeC)),
    el('div', { class: 'titre-objets' }, el('h3', {}, 'Objets à offrir'), compte),
    el('div', { class: 'filtres' }, rech, filtreCat, el('button', { class: 'bouton discret', type: 'button', onclick: () => { b.objets.clear(); dessiner(); } }, 'Rien')),
    grille, el('div', { class: 'actions bas' }, creer), resultat);
}

async function livraisons(c) {
  let d;
  try { d = await api('GET', `/cadeaux/${c.id}/livraisons`); } catch (e) { toast(e.message, true); return; }
  const lignes = d.livraisons.map(l => {
    const etat = l.annule_le ? pastille('annulé' + (l.remplace_par ? ` → copie #${l.remplace_par}` : ''), 'gris') : l.ouvert_le ? pastille('ouvert le ' + date(l.ouvert_le), 'vert') : pastille('pas encore ouvert', 'jaune');
    const boutons = el('div', { class: 'boutons-ligne' });
    if (PERM('cadeaux.reparer') && !l.annule_le) {
      if (!l.ouvert_le) boutons.append(el('button', { class: 'bouton discret', onclick: async e => { if (await action(e.target, () => api('POST', `/cadeaux/${c.id}/annuler`, { joueur: l.joueur }), 'Retiré de sa boîte.')) livraisons(c); } }, 'Retirer'));
      boutons.append(el('button', { class: 'bouton discret', onclick: async e => {
        let corps = { joueur: l.joueur };
        if (l.ouvert_le) {
          const conf = await demander({ titre: 'Renvoyer un cadeau déjà ouvert', texte: `${l.joueur} l'a ouvert le ${date(l.ouvert_le)}. Le renvoyer = le lui donner une 2e fois.`, mot: 'RENVOYER' });
          if (!conf) return;
          corps = { ...corps, ...conf };
        }
        if (await action(e.target, () => api('POST', `/cadeaux/${c.id}/renvoyer`, corps), 'Copie envoyée.')) livraisons(c);
      } }, 'Renvoyer'));
    }
    return el('tr', {}, el('td', {}, el('a', { href: '#joueur/' + l.joueur, class: 'code' }, l.joueur), l.pseudo ? ' ' + l.pseudo : ''), el('td', {}, date(l.recu_le)), el('td', {}, etat), el('td', {}, boutons));
  });
  ouvrirTiroir('Livraisons : ' + c.titre,
    el('p', { class: 'aide' }, 'Un cadeau n\'est livré qu\'une fois par joueur (protection côté serveur). « Renvoyer » crée une copie avec un nouveau numéro ; « Retirer » enlève un cadeau pas encore ouvert.'),
    tableau(['Joueur', 'Livré le', 'Statut', ''], lignes, 'Personne ne l\'a encore reçu.'));
}

async function panneauProblemes() {
  const p = await api('GET', '/cadeaux/problemes');
  const items = [];
  items.push(el('li', {}, p.doubles_attributions ? pastille(`${p.doubles_attributions} double(s) attribution(s) !`, 'rouge') : pastille('Aucune double attribution', 'vert')));
  if (p.objets_inconnus.length) items.push(el('li', {}, `⚠️ ${p.objets_inconnus.length} cadeau(x) avec des objets qui n'existent plus dans le jeu : `, p.objets_inconnus.map(x => `#${x.id} ${x.titre} (${x.objets.join(', ')})`).join(' · ')));
  items.push(el('li', {}, `${p.non_ouverts_7j.length} cadeau(x) livré(s) il y a plus de 7 jours et jamais ouvert(s)`));
  items.push(el('li', {}, `${p.expires_non_ouverts.length} cadeau(x) expiré(s) ou arrêté(s) avant d'être ouvert(s) (utilise « Renvoyer » si c'est une erreur)`));
  items.push(el('li', {}, `${p.cargaisons_perdues} cargaison(s) jamais ouverte(s) (personne ne l'a atteinte, ou ouverte par un bot)`));
  return panneau('🩺 Problèmes de réception', el('ul', { class: 'liste-simple' }, items),
    p.non_ouverts_7j.length ? tableau(['Cadeau', 'Joueur', 'Livré le'], p.non_ouverts_7j.slice(0, 20).map(x => el('tr', {}, el('td', {}, '#' + x.cadeau + ' ' + x.titre), el('td', {}, el('a', { href: '#joueur/' + x.joueur, class: 'code' }, x.joueur)), el('td', {}, date(x.recu_le))))) : null);
}

// ================================================================ cosmétiques
const etatCosm = { cat: '', rarete: '', statut: '', collection: '', q: '', page: 0 };
async function vueCosmetiques() {
  const d = await api('GET', '/cosmetiques?' + new URLSearchParams(etatCosm));
  const maj = (k, v) => { etatCosm[k] = v; etatCosm.page = 0; recharger(); };
  const cats = Object.fromEntries(d.categories.map(c => [c.id, c.icone + ' ' + c.nom]));
  const recherche = el('input', { type: 'search', placeholder: 'Nom, identifiant ou référence du CSV…', value: etatCosm.q, maxlength: 40 });
  let t; recherche.addEventListener('input', () => { clearTimeout(t); t = setTimeout(() => maj('q', recherche.value), 350); });
  const filtresB = el('div', { class: 'filtres' }, recherche,
    choix({ '': 'Toutes catégories', ...cats }, etatCosm.cat, { onchange: e => maj('cat', e.target.value) }),
    choix({ '': 'Toutes raretés', ...Object.fromEntries(Object.entries(d.raretes).map(([k, v]) => [k, v.nom])) }, etatCosm.rarete, { onchange: e => maj('rarete', e.target.value) }),
    choix({ '': 'Tous', nouveaux: 'Les 250 nouveaux', anciens: 'Les anciens', livres: 'Avec ressource', manquants: '⚠️ Ressource manquante', hors_vente: 'Hors vente', modifies: 'Modifiés par l\'admin', ajouts: 'Ajoutés par l\'admin' }, etatCosm.statut, { onchange: e => maj('statut', e.target.value) }),
    choix({ '': 'Toutes collections', ...Object.fromEntries(d.collections.map(c => [c.n, `${c.n}. ${c.nom}`])) }, etatCosm.collection, { onchange: e => maj('collection', e.target.value) }));
  const lignes = d.cosmetiques.map(o => {
    const r = d.raretes[o.rarete] || {};
    const nomRar = el('span', { class: 'rarete' }, r.nom || o.rarete); nomRar.style.color = r.couleur || '';
    return el('tr', { class: 'cliquable', onclick: () => ficheCosmetique(o, d) },
      el('td', {}, el('b', {}, o.nom), el('div', { class: 'petit' }, o.cle)), el('td', {}, cats[o.cat] || o.cat), el('td', {}, nomRar),
      el('td', {}, o.prix != null ? '🪙 ' + o.prix : '—'), el('td', {}, o.collection ? (d.collections.find(c => c.n === o.collection)?.nom || o.collection) : '—'),
      el('td', {}, o.livre ? pastille('✔ ' + (o.nouveau250 ? 'livré' : 'intégré'), 'vert') : pastille('modèle manquant', 'rouge')),
      el('td', {}, o.en_vente ? pastille('en vente', 'cyan') : pastille('hors vente', 'gris'), o.modifie ? pastille('modifié', 'jaune') : null, o.nouveau250 ? pastille('nouveau', 'violet') : null));
  });
  const c = d.controle;
  const controle = panneau('🔎 Contrôle des identifiants et des ressources',
    el('ul', { class: 'liste-simple' },
      el('li', {}, c.doublons.length ? pastille('Identifiants en double : ' + c.doublons.join(', '), 'rouge') : pastille('Aucun identifiant en double', 'vert')),
      el('li', {}, c.manquants ? pastille(`${c.manquants} cosmétique(s) sans ressource (pas encore en vente)`, 'jaune') : pastille('Toutes les ressources sont là', 'vert')),
      el('li', {}, `${c.ressources_libres.length} modèle(s) livré(s) pas encore utilisé(s) par un cosmétique`)),
    tableau(['Catégorie', 'Total', 'Avec ressource', 'Nouveaux (250)', 'Nouveaux livrés'], Object.entries(c.par_categorie).map(([k, v]) => el('tr', {},
      el('td', {}, cats[k] || k), el('td', {}, v.total), el('td', {}, v.livres), el('td', {}, v.nouveaux), el('td', {}, v.nouveaux_livres)))));
  const blocs = [el('header', { class: 'titre' }, el('h1', {}, 'Cosmétiques'), el('span', { class: 'compte' }, `${d.trouves} / ${d.total}`)),
    el('p', { class: 'aide' }, 'Un cosmétique n\'est vendu dans le jeu que si sa ressource (modèle, image, animation) est livrée et activée. Clique sur une ligne pour modifier son nom, sa description, sa rareté, son prix ou sa disponibilité.'),
    filtresB, tableau(['Cosmétique', 'Catégorie', 'Rareté', 'Prix', 'Collection', 'Ressource', 'Boutique'], lignes, 'Aucun cosmétique.'),
    pages(d.trouves, d.page, 60, n => { etatCosm.page = n; recharger(); }), controle, panneauCollections(d)];
  if (PERM('cosmetiques.modifier')) blocs.push(panneauAjout(d));
  return blocs;
}

function ficheCosmetique(o, d) {
  const modif = PERM('cosmetiques.modifier');
  const nom = el('input', { maxlength: 40, value: o.nom, disabled: !modif });
  const desc = el('textarea', { rows: 3, maxlength: 200, value: o.desc || '', disabled: !modif });
  const rarete = choix(Object.fromEntries(Object.entries(d.raretes).map(([k, v]) => [k, v.nom])), o.rarete, { disabled: !modif });
  const prix = el('input', { type: 'number', min: 0, max: 100000, step: 50, value: o.prix ?? '', placeholder: 'prix de la rareté', disabled: !modif });
  const vente = el('input', { type: 'checkbox', checked: o.en_vente, disabled: !modif || !o.livre });
  const coll = choix({ '': 'Aucune', ...Object.fromEntries(d.collections.map(c => [c.n, `${c.n}. ${c.nom}`])) }, o.collection ?? '', { disabled: !modif });
  const b = el('button', { class: 'bouton principal' }, 'Enregistrer');
  b.onclick = async () => {
    const corps = { cle: o.cle, nom: nom.value, description: desc.value, rarete: rarete.value, prix: prix.value === '' || +prix.value === o.prix_base ? null : +prix.value,
      en_vente: vente.checked, collection: coll.value === '' ? null : +coll.value };
    if (await action(b, () => api('POST', '/cosmetiques', corps), 'Cosmétique modifié (le jeu le voit à sa prochaine mise à jour, ≤ 3 min).')) { fermerTiroir(); recharger(); }
  };
  const reinit = el('button', { class: 'bouton discret' }, 'Revenir aux valeurs d\'origine');
  reinit.onclick = async () => {
    if (await action(reinit, () => api('POST', '/cosmetiques', { cle: o.cle, nom: o.nom_origine, description: '', rarete: o.rarete_origine, prix: null, en_vente: null, collection: null }), 'Valeurs d\'origine.')) { fermerTiroir(); recharger(); }
  };
  ouvrirTiroir(o.nom,
    el('div', { class: 'meta' }, `${o.cle}${o.ref ? ' · CSV : ' + o.ref : ''}`),
    el('p', {}, 'Ressource : ', o.livre ? pastille(o.ressource, 'vert') : pastille(o.ressource, 'rouge'), o.triangles ? ` · ${o.triangles} triangles` : ''),
    o.livre ? el('p', {}, el('a', { class: 'bouton', href: JEU + '?essayer=' + encodeURIComponent(o.cle), target: '_blank', rel: 'noopener' }, '👁️ Prévisualiser dans le jeu')) : null,
    el('div', { class: 'bloc' }, champ('Nom', nom), champ('Description', desc), champ('Rareté', rarete), champ(`Prix (vide = ${o.prix_base ?? '?'} 🪙, prix de la rareté)`, prix),
      el('label', { class: 'ligne' }, vente, o.livre ? 'En vente dans la boutique' : 'En vente (impossible : ressource manquante)'), champ('Collection', coll),
      modif ? el('div', { class: 'actions' }, b, o.modifie ? reinit : null) : el('p', { class: 'aide' }, 'Ton rôle permet seulement de consulter.')));
}

function panneauCollections(d) {
  const modif = PERM('cosmetiques.modifier');
  return panneau('📦 Collections', el('details', {}, el('summary', {}, `${d.collections.length} collections (chaque numéro du catalogue des 250 = un thème)`),
    tableau(['N°', 'Nom', 'Objets', 'Avec ressource', 'Visible', ''], d.collections.map(c => {
      const nom = el('input', { value: c.nom, maxlength: 40, disabled: !modif });
      const vis = el('input', { type: 'checkbox', checked: c.visible, disabled: !modif });
      const b = modif ? el('button', { class: 'bouton discret' }, 'OK') : null;
      if (b) b.onclick = async () => { if (await action(b, () => api('POST', '/collections', { n: c.n, nom: nom.value === c.nom_origine ? '' : nom.value, visible: vis.checked }), 'Collection modifiée.')) recharger(); };
      return el('tr', {}, el('td', {}, c.n), el('td', {}, nom), el('td', {}, c.objets), el('td', {}, c.livres), el('td', {}, vis), el('td', {}, b));
    }))));
}

function panneauAjout(d) {
  const libres = d.controle.ressources_libres;
  if (!libres.length) return panneau('➕ Ajouter un cosmétique', el('p', { class: 'aide' }, 'Pour ajouter un cosmétique, il faut un modèle livré par la session modélisation et pas encore utilisé. ',
    'Il n\'y en a aucun pour l\'instant : chaque modèle livré a déjà son cosmétique. On ne met jamais en vente un objet sans ressource.'));
  const modele = choix(Object.fromEntries(libres.map(r => [r.fichier + '|' + r.objet, `${r.categorie} — ${r.objet} (${r.fichier})`])), '');
  const nom = el('input', { maxlength: 40 }), desc = el('input', { maxlength: 200 });
  const rarete = choix(Object.fromEntries(Object.entries(d.raretes).map(([k, v]) => [k, v.nom])), 'rare');
  const prix = el('input', { type: 'number', min: 0, max: 100000, step: 50, placeholder: 'prix de la rareté' });
  const b = el('button', { class: 'bouton principal' }, 'Ajouter');
  b.onclick = async () => {
    const [fichier, objet] = modele.value.split('|');
    if (await action(b, () => api('POST', '/cosmetiques/ajouts', { fichier, objet, nom: nom.value, description: desc.value, rarete: rarete.value, prix: prix.value }), 'Cosmétique ajouté.')) recharger();
  };
  return panneau('➕ Ajouter un cosmétique', el('div', { class: 'form-grille' }, champ('Modèle livré', modele), champ('Nom', nom), champ('Description', desc), champ('Rareté', rarete), champ('Prix', prix)), el('div', { class: 'actions' }, b));
}

// ================================================================ boutique et promotions
async function vueBoutique() {
  const [d, cat] = await Promise.all([api('GET', '/boutique'), catalogue()]);
  const modif = PERM('boutique.modifier');
  const r = d.rotation;
  const nomDe = cle => cat.objets.find(o => o.cle === cle)?.nom || cle;
  const vedettes = choix({ 1: '1', 2: '2', 3: '3', 4: '4' }, String(r.vedettes || 2), { disabled: !modif });
  const quotidiens = el('input', { type: 'number', min: 4, max: 16, value: r.quotidiens || 8, disabled: !modif });
  const melange = el('input', { type: 'number', min: 0, max: 1000000, value: r.melange || 0, disabled: !modif });
  const jours = el('input', { type: 'number', min: 0, max: 60, value: r.nouveautes_jours ?? 14, disabled: !modif });
  const epingles = new Set(r.epingles || []), retires = new Set(r.retires || []);
  const listeObj = (ensemble, nom) => {
    const zone = el('div', { class: 'puces' });
    const dessiner = () => zone.replaceChildren(...[...ensemble].map(c => el('span', { class: 'puce' }, nomDe(c), modif ? el('button', { type: 'button', onclick: () => { ensemble.delete(c); dessiner(); } }, '✕') : null)),
      modif ? ajouterObjet(cat, c => { ensemble.add(c); dessiner(); }) : null);
    dessiner();
    return champ(nom, zone);
  };
  const b = el('button', { class: 'bouton principal' }, 'Enregistrer la rotation');
  b.onclick = async () => {
    if (await action(b, () => api('POST', '/boutique', { vedettes: +vedettes.value, quotidiens: +quotidiens.value, melange: +melange.value, nouveautes_jours: +jours.value,
      epingles: [...epingles], retires: [...retires] }), 'Rotation enregistrée (le jeu la voit à sa prochaine mise à jour).')) recharger();
  };
  const blocs = [el('header', { class: 'titre' }, el('h1', {}, 'Boutique et promotions')),
    panneau('🔄 Rotation des articles', el('p', { class: 'aide' }, 'Chaque jour à minuit, le jeu tire au hasard les articles du jour parmi les objets en vente. Ici : combien, lesquels forcer « à la une », lesquels ne jamais tirer. Changer le « numéro de mélange » refait le tirage du jour.'),
      el('div', { class: 'form-grille' }, champ('Articles à la une', vedettes), champ('Articles du jour', quotidiens), champ('Numéro de mélange', melange), champ('Badge « nouveau » pendant (jours)', jours)),
      listeObj(epingles, 'Toujours à la une (4 max)'), listeObj(retires, 'Jamais tirés dans la boutique du jour'), modif ? el('div', { class: 'actions' }, b) : null)];
  blocs.push(panneauPromos(d, cat, modif));
  blocs.push(panneau('📜 Historique des modifications (boutique et cosmétiques)', d.historique.length ? el('ul', { class: 'journal' }, d.historique.map(h => el('li', {}, el('time', {}, date(h.cree_le)), ' ', el('b', {}, h.par || '?'), ' : ', h.action))) : el('p', { class: 'vide' }, 'Rien pour l\'instant.')));
  return blocs;
}
function ajouterObjet(cat, ajouter) {
  const liste = el('datalist', { id: 'objets-' + Math.random().toString(36).slice(2) }, cat.objets.filter(o => !o.gratuit).map(o => el('option', { value: o.cle }, o.nom)));
  const input = el('input', { list: liste.id, placeholder: '+ objet (tape son nom)…', class: 'petit-input' });
  input.addEventListener('change', () => {
    const v = input.value.trim();
    const o = cat.objets.find(x => x.cle === v || x.nom.toLowerCase() === v.toLowerCase());
    if (o) { ajouter(o.cle); input.value = ''; } else toast('Objet inconnu.', true);
  });
  return el('span', {}, input, liste);
}
function panneauPromos(d, cat, modif) {
  const lignes = d.promotions.map(p => el('tr', {}, el('td', {}, el('b', {}, p.nom)), el('td', {}, `-${p.reduction} %`),
    el('td', {}, d.cibles[p.cible_type] + (p.cible_valeurs.length ? ' : ' + p.cible_valeurs.join(', ') : '')), el('td', {}, date(p.debut) + ' → ' + date(p.fin)),
    el('td', {}, p.en_cours ? pastille('en cours', 'vert') : p.actif ? pastille(p.debut * 1000 > Date.now() ? 'programmée' : 'terminée', 'gris') : pastille('désactivée', 'gris')),
    el('td', {}, modif ? el('div', { class: 'boutons-ligne' },
      el('button', { class: 'bouton discret', onclick: async e => { if (await action(e.target, () => api('POST', '/promotions/' + p.id, { actif: !p.actif }), 'OK.')) recharger(); } }, p.actif ? 'Désactiver' : 'Activer'),
      el('button', { class: 'bouton danger', onclick: async e => { const c = await demander({ titre: 'Supprimer la promotion', texte: p.nom }); if (c && await action(e.target, () => api('DELETE', '/promotions/' + p.id), 'Supprimée.')) recharger(); } }, 'Supprimer')) : null)));
  const blocs = [tableau(['Promotion', 'Réduction', 'Sur', 'Période', 'État', ''], lignes, 'Aucune promotion.')];
  if (modif) {
    const nom = el('input', { maxlength: 40, placeholder: 'Ex. : Soldes d\'hiver' });
    const reduction = el('input', { type: 'number', min: 5, max: 90, value: 20 });
    const cible = choix(d.cibles, 'tout');
    const valeurs = el('div', { class: 'valeurs-promo' });
    const choisis = new Set();
    const majValeurs = () => {
      choisis.clear();
      if (cible.value === 'tout') { valeurs.replaceChildren(); return; }
      const opts = cible.value === 'categorie' ? Object.fromEntries(cat.categories.map(c => [c.id, c.nom])) : cible.value === 'rarete' ? Object.fromEntries(Object.entries(cat.raretes).map(([k, v]) => [k, v.nom]))
        : cible.value === 'collection' ? Object.fromEntries((cat.collections || []).map(c => [c.n, `${c.n}. ${c.nom}`])) : null;
      if (opts) valeurs.replaceChildren(...Object.entries(opts).map(([k, v]) => el('label', { class: 'ligne' }, el('input', { type: 'checkbox', onchange: e => (e.target.checked ? choisis.add(k) : choisis.delete(k)) }), v)));
      else { const zone = el('div', { class: 'puces' }); const dess = () => zone.replaceChildren(...[...choisis].map(c => el('span', { class: 'puce' }, cat.objets.find(o => o.cle === c)?.nom || c)), ajouterObjet(cat, c => { choisis.add(c); dess(); })); dess(); valeurs.replaceChildren(zone); }
    };
    cible.onchange = majValeurs;
    const maintenant = Math.floor(Date.now() / 1000);
    const debut = el('input', { type: 'datetime-local', value: versInput(maintenant) }), fin = el('input', { type: 'datetime-local', value: versInput(maintenant + 3 * 86400) });
    const b = el('button', { class: 'bouton principal' }, 'Créer la promotion');
    b.onclick = async () => {
      if (await action(b, () => api('POST', '/promotions', { nom: nom.value, reduction: +reduction.value, cible_type: cible.value, cible_valeurs: [...choisis].map(v => (cible.value === 'collection' ? +v : v)),
        debut: depuisInput(debut.value), fin: depuisInput(fin.value) }), 'Promotion créée.')) recharger();
    };
    blocs.push(el('h3', {}, 'Nouvelle promotion'), el('div', { class: 'form-grille' }, champ('Nom', nom), champ('Réduction (%)', reduction), champ('Sur', cible), champ('Début', debut), champ('Fin', fin)), valeurs, el('div', { class: 'actions' }, b));
  }
  return panneau('🏷️ Promotions (prix réduits dans la boutique du jeu)', ...blocs);
}

// ================================================================ esprits
async function vueEsprits() {
  const d = await api('GET', '/esprits');
  const modif = PERM('esprits.modifier');
  const cartes = d.esprits.map(e => {
    const actif = el('input', { type: 'checkbox', checked: e.actif, disabled: !modif });
    const poids = el('input', { type: 'number', min: 0, max: 1000, value: e.poids, disabled: !modif });
    const desc = el('textarea', { rows: 2, maxlength: 300, value: e.description_admin || '', placeholder: 'Phrase de personnalité affichée dans la collection (facultatif)', disabled: !modif });
    const b = modif ? el('button', { class: 'bouton' }, 'Enregistrer') : null;
    if (b) b.onclick = async () => { if (await action(b, () => api('POST', '/esprits', { type: e.type, actif: actif.checked, poids: +poids.value, description: desc.value }), 'Esprit modifié.')) recharger(); };
    const icone = el('div', { class: 'icone-esprit' }, e.icone); icone.style.background = e.couleur;
    return el('article', { class: 'carte-esprit' + (e.actif ? '' : ' eteint') },
      el('header', {}, icone, el('div', {}, el('h3', {}, e.nom), el('span', { class: 'petit' }, e.role))),
      el('p', {}, el('b', {}, 'Passif : '), e.passif), el('p', {}, el('b', {}, 'Pouvoir « ' + e.pouvoir + ' » : '), e.descPouvoir, ` (recharge ${e.recharge} s)`),
      el('p', { class: 'petit' }, 'Obtenus : ', Object.entries(e.obtenus).map(([r, n]) => `${d.raretes[r] || r} ${n}`).join(' · ') || 'aucun', ` · ${e.joueurs} joueur(s)`),
      el('label', { class: 'ligne' }, actif, 'Disponible (autels + cargaisons)'), champ(`Poids dans les cargaisons (≈ ${e.chance_cargaison} %)`, poids), champ('Personnalité', desc), b);
  });
  const poids = Object.fromEntries(Object.keys(d.raretes).map(k => [k, el('input', { type: 'number', min: 0, max: 1000, value: d.poids_raretes[k] ?? 0, disabled: !modif })]));
  const b = modif ? el('button', { class: 'bouton principal' }, 'Enregistrer les chances') : null;
  if (b) b.onclick = async () => { if (await action(b, () => api('POST', '/esprits', { poids_raretes: Object.fromEntries(Object.entries(poids).map(([k, i]) => [k, +i.value])) }), 'Chances enregistrées.')) recharger(); };
  return [
    el('header', { class: 'titre' }, el('h1', {}, 'Esprits'), el('span', { class: 'compte' }, `${nombre(d.total_obtenus)} obtenus`)),
    el('p', { class: 'aide' }, 'Les pouvoirs sont réglés dans le code du jeu pour rester équilibrés (ils ne dépendent pas de la rareté). ',
      'La rareté change l\'aura, le son et la valeur en collection. Un esprit indisponible n\'apparaît plus sur les autels ni dans les cargaisons.'),
    el('div', { class: 'grille-esprits' }, cartes),
    panneau('🎲 Chances des raretés (cargaisons)', el('div', { class: 'form-grille' }, Object.entries(poids).map(([k, i]) => champ(`${d.raretes[k]} (≈ ${d.chances_raretes[k] ?? 0} %)`, i))), b),
  ];
}

// ================================================================ événements et cargaisons
async function vueEvenements() {
  const [d, c, cat] = await Promise.all([api('GET', '/evenements'), api('GET', '/cargaisons'), catalogue()]);
  const modif = PERM('evenements.modifier');
  const lignes = d.evenements.map(e => el('tr', {},
    el('td', {}, el('b', {}, e.nom), e.description ? el('div', { class: 'petit' }, e.description) : null),
    el('td', {}, date(e.debut) + ' → ' + date(e.fin)),
    el('td', {}, pastille(e.etat, e.etat === 'en cours' ? 'vert' : e.etat === 'programmé' ? 'cyan' : 'gris')),
    el('td', {}, `délai ${e.config.delai_min}–${e.config.delai_max} s · ${e.config.max_par_partie}/partie · 🪙 ${e.config.pieces_min}–${e.config.pieces_max}${e.config.objets.length ? ` · ${e.config.proba_objet} % objet` : ''}`),
    el('td', {}, `${e.tirages} tirée(s) · ${e.reclames} ouverte(s)`, Object.keys(e.par_esprit).length ? el('div', { class: 'petit' }, Object.entries(e.par_esprit).map(([k, n]) => `${k} ${n}`).join(' · ')) : null),
    el('td', {}, modif ? el('div', { class: 'boutons-ligne' },
      el('button', { class: 'bouton discret', onclick: () => formEvenement(d, cat, e) }, 'Modifier'),
      el('button', { class: 'bouton discret', onclick: async ev => { if (await action(ev.target, () => api('POST', '/evenements/' + e.id, { actif: !e.actif }), 'OK.')) recharger(); } }, e.actif ? 'Désactiver' : 'Activer'),
      el('button', { class: 'bouton danger', onclick: async ev => { const conf = await demander({ titre: 'Supprimer l\'événement', texte: e.nom, mot: 'CONFIRMER' }); if (conf && await action(ev.target, () => api('DELETE', '/evenements/' + e.id, conf), 'Supprimé.')) recharger(); } }, 'Supprimer')) : null)));
  const lignesC = c.cargaisons.map(x => el('tr', {}, el('td', {}, date(x.cree_le)), el('td', {}, el('span', { class: 'code' }, x.partie_id)), el('td', {}, el('a', { href: '#joueur/' + x.hote, class: 'code' }, x.hote)),
    el('td', {}, `✨ ${x.recompense.esprit} (${x.recompense.rarete}) · 🪙 ${x.recompense.pieces}${x.recompense.objet ? ' · ' + x.recompense.objet : ''}`),
    el('td', {}, x.reclame_par ? el('a', { href: '#joueur/' + x.reclame_par, class: 'code' }, x.reclame_par) : '—'),
    el('td', {}, pastille(x.etat, x.etat === 'ouverte' ? 'vert' : x.etat === 'perdue' ? 'gris' : 'cyan'))));
  return [
    el('header', { class: 'titre' }, el('h1', {}, 'Cargaisons et événements'), modif ? el('button', { class: 'bouton principal', onclick: () => formEvenement(d, cat, null) }, '➕ Nouvel événement') : null),
    el('p', { class: 'aide' }, 'Pendant un événement en cours, chaque partie (si le serveur est joignable) a une cargaison : un cargo volant traverse l\'île et largue une caisse en parachute. ',
      'Le SERVEUR tire l\'esprit et la récompense au début de la partie, et ne la donne qu\'au premier joueur qui ouvre la caisse (dans sa boîte de réception).'),
    panneau('📅 Événements', tableau(['Événement', 'Période', 'État', 'Réglages', 'Statistiques', ''], lignes, 'Aucun événement. Crée-en un pour lancer les cargaisons.')),
    panneau('📦 Historique des cargaisons', tableau(['Tirée le', 'Partie', 'Hôte', 'Récompense', 'Ouverte par', 'État'], lignesC, 'Aucune cargaison pour l\'instant.')),
  ];
}
function formEvenement(d, cat, e) {
  const cfg = e ? e.config : d.config_defaut;
  const maintenant = Math.floor(Date.now() / 1000);
  const nom = el('input', { maxlength: 60, value: e?.nom || '', placeholder: 'Ex. : Pluie d\'étoiles' });
  const desc = el('input', { maxlength: 300, value: e?.description || '' });
  const debut = el('input', { type: 'datetime-local', value: versInput(e?.debut || maintenant) });
  const fin = el('input', { type: 'datetime-local', value: versInput(e?.fin || maintenant + 7 * 86400) });
  const actif = el('input', { type: 'checkbox', checked: e ? !!e.actif : true });
  const n = (k, mini, maxi) => el('input', { type: 'number', min: mini, max: maxi, value: cfg[k] });
  const ch = { delai_min: n('delai_min', 30, 1500), delai_max: n('delai_max', 30, 1500), max_par_partie: n('max_par_partie', 1, 3), joueurs_min: n('joueurs_min', 1, 100),
    pieces_min: n('pieces_min', 0, 5000), pieces_max: n('pieces_max', 0, 5000), proba_objet: n('proba_objet', 0, 100) };
  const objets = new Set(cfg.objets || []);
  const zone = el('div', { class: 'puces' });
  const dess = () => zone.replaceChildren(...[...objets].map(c => el('span', { class: 'puce' }, cat.objets.find(o => o.cle === c)?.nom || c, el('button', { type: 'button', onclick: () => { objets.delete(c); dess(); } }, '✕'))), ajouterObjet(cat, c => { objets.add(c); dess(); }));
  dess();
  const raretes = cfg.raretes || d.poids_raretes;
  const persoRar = el('input', { type: 'checkbox', checked: !!cfg.raretes });
  const rar = Object.fromEntries(Object.keys(d.raretes).map(k => [k, el('input', { type: 'number', min: 0, max: 1000, value: raretes[k] ?? 0 })]));
  const b = el('button', { class: 'bouton principal' }, e ? 'Enregistrer' : 'Créer l\'événement');
  b.onclick = async () => {
    const config = Object.fromEntries(Object.entries(ch).map(([k, i]) => [k, +i.value]));
    config.objets = [...objets];
    if (persoRar.checked) config.raretes = Object.fromEntries(Object.entries(rar).map(([k, i]) => [k, +i.value]));
    const corps = { nom: nom.value, description: desc.value, debut: depuisInput(debut.value), fin: depuisInput(fin.value), actif: actif.checked, config };
    if (await action(b, () => api('POST', e ? '/evenements/' + e.id : '/evenements', corps), e ? 'Événement modifié.' : 'Événement créé.')) { fermerTiroir(); recharger(); }
  };
  ouvrirTiroir(e ? 'Modifier : ' + e.nom : 'Nouvel événement de cargaison', el('div', { class: 'bloc' },
    champ('Nom (affiché comme expéditeur de la récompense)', nom), champ('Description', desc), champ('Début', debut), champ('Fin', fin), el('label', { class: 'ligne' }, actif, 'Activé'),
    el('h3', {}, 'Période d\'apparition (secondes après le début de la partie)'), el('div', { class: 'form-grille' }, champ('Au plus tôt', ch.delai_min), champ('Au plus tard', ch.delai_max),
      champ('Cargaisons par partie', ch.max_par_partie), champ('Joueurs minimum', ch.joueurs_min)),
    el('h3', {}, 'Récompense (tirée par le serveur)'), el('div', { class: 'form-grille' }, champ('Pièces min', ch.pieces_min), champ('Pièces max', ch.pieces_max), champ('Chance d\'un objet (%)', ch.proba_objet)),
    champ('Objets possibles (seulement ceux qui existent dans le jeu)', zone),
    el('label', { class: 'ligne' }, persoRar, 'Chances de rareté propres à cet événement (sinon celles de la page Esprits)'),
    el('div', { class: 'form-grille' }, Object.entries(rar).map(([k, i]) => champ(d.raretes[k], i))),
    el('div', { class: 'actions' }, b)));
}

// ================================================================ annonce et bonus
async function vueAnnonce() {
  const d = await api('GET', '/jeu');
  const a = d.annonce, b = d.bonus;
  const texte = el('textarea', { rows: 3, maxlength: 200, value: a.texte || '', placeholder: 'Ex. : Nouvelle carte ce week-end !' });
  const style = choix({ info: '💬 Info (bleu)', evenement: '🎉 Événement (violet)', alerte: '⚠️ Important (orange)' }, a.style || 'info');
  const active = el('input', { type: 'checkbox', checked: !!a.active });
  const apercu = el('div', { class: 'apercu-annonce ' + (a.style || 'info') }, a.texte || '');
  const majApercu = () => { apercu.textContent = texte.value; apercu.className = 'apercu-annonce ' + style.value; };
  texte.oninput = majApercu; style.onchange = majApercu;
  const bA = el('button', { class: 'bouton principal' }, 'Enregistrer l\'annonce');
  bA.onclick = async () => { if (await action(bA, () => api('POST', '/jeu', { annonce: { texte: texte.value, style: style.value, active: active.checked } }), 'Annonce enregistrée.')) recharger(); };
  const mult = choix({ 1.5: '× 1,5', 2: '× 2', 3: '× 3' }, '2');
  const dureeB = choix({ 1: '1 heure', 3: '3 heures', 12: '12 heures', 24: '1 jour', 48: '2 jours', 72: '3 jours', 168: '1 semaine' }, '24');
  const nomB = el('input', { maxlength: 40, placeholder: 'Ex. : Week-end double pièces' });
  const enCours = d.en_ligne.bonus;
  const bB = el('button', { class: 'bouton principal' }, '⚡ Lancer le bonus');
  bB.onclick = async () => { if (await action(bB, () => api('POST', '/jeu', { bonus: { multiplicateur: +mult.value, heures: +dureeB.value, texte: nomB.value } }), 'Bonus lancé.')) recharger(); };
  const bS = el('button', { class: 'bouton danger' }, 'Arrêter le bonus');
  bS.onclick = async () => { if (await action(bS, () => api('POST', '/jeu', { bonus: { multiplicateur: 1 } }), 'Bonus arrêté.')) recharger(); };
  return [
    el('header', { class: 'titre' }, el('h1', {}, 'Annonce et bonus')),
    el('div', { class: 'grille-2' },
      panneau('📢 Annonce dans le menu du jeu', champ('Message (200 caractères)', texte), champ('Style', style), el('label', { class: 'ligne' }, active, 'Afficher dans le jeu'), el('p', { class: 'aide' }, 'Aperçu :'), apercu, el('div', { class: 'actions' }, bA)),
      panneau('⚡ Bonus de pièces', el('p', { class: 'aide' }, 'Les pièces gagnées en fin de partie sont multipliées pendant la durée choisie.'),
        el('p', { class: 'etat-bonus' }, enCours ? `En cours : ${enCours.texte} × ${enCours.multiplicateur} jusqu'au ${date(enCours.fin)}` : 'Aucun bonus en cours.'),
        champ('Multiplicateur', mult), champ('Durée', dureeB), champ('Nom de l\'événement', nomB), el('div', { class: 'actions' }, bB, enCours ? bS : null))),
  ];
}

// ================================================================ administrateurs
async function vueAdmins() {
  const d = await api('GET', '/admins');
  const gerer = d.peut_gerer;
  const lignes = d.admins.map(a => {
    const role = choix(d.roles, a.role, { disabled: !gerer });
    const boutons = gerer ? el('div', { class: 'boutons-ligne' },
      el('button', { class: 'bouton discret', onclick: async e => {
        if (role.value === a.role) { toast('Choisis d\'abord un autre rôle.', true); return; }
        const conf = await demander({ titre: 'Changer le rôle', texte: `${a.identifiant} : ${d.roles[a.role]} → ${d.roles[role.value]}. Il sera déconnecté.`, mdp: true, danger: role.value === 'super_admin' });
        if (conf && await action(e.target, () => api('POST', '/admins/' + a.id, { role: role.value, ...conf }), 'Rôle changé.')) recharger();
      } }, 'Changer le rôle'),
      el('button', { class: 'bouton discret', onclick: async e => {
        const conf = await demander({ titre: a.actif ? 'Désactiver le compte' : 'Réactiver le compte', texte: a.identifiant, mdp: true });
        if (conf && await action(e.target, () => api('POST', '/admins/' + a.id, { actif: !a.actif, ...conf }), 'OK.')) recharger();
      } }, a.actif ? 'Désactiver' : 'Réactiver'),
      el('button', { class: 'bouton discret', onclick: async e => {
        const conf = await demander({ titre: 'Nouveau mot de passe provisoire', texte: `Pour ${a.identifiant}. Il devra le changer à sa prochaine connexion.`, mdp: true });
        const r = conf && await action(e.target, () => api('POST', '/admins/' + a.id, { reinitialiser: true, ...conf }));
        if (r) { await recharger(); montrerMdpProvisoire(a.identifiant, r.mot_de_passe_provisoire); }
      } }, 'Réinitialiser le mot de passe'),
      a.moi ? null : el('button', { class: 'bouton danger', onclick: async e => {
        const conf = await demander({ titre: 'Supprimer le compte', texte: a.identifiant, mdp: true });
        if (conf && await action(e.target, () => api('DELETE', '/admins/' + a.id, conf), 'Compte supprimé.')) recharger();
      } }, 'Supprimer')) : null;
    return el('tr', { class: a.actif ? '' : 'eteint' }, el('td', {}, el('b', {}, a.identifiant), a.moi ? ' (toi)' : '', a.doit_changer_mdp ? el('div', {}, pastille('mot de passe provisoire', 'jaune')) : null),
      el('td', {}, role), el('td', {}, a.actif ? pastille('actif', 'vert') : pastille('désactivé', 'gris')), el('td', {}, date(a.derniere_connexion)), el('td', {}, a.sessions), el('td', {}, boutons));
  });
  const blocs = [el('header', { class: 'titre' }, el('h1', {}, 'Administrateurs')),
    panneau('Comptes', tableau(['Identifiant', 'Rôle', 'État', 'Dernière connexion', 'Sessions', ''], lignes))];
  if (gerer) {
    const ident = el('input', { maxlength: 60, placeholder: 'ex. moderateur.lea', autocomplete: 'off' });
    const role = choix(d.roles, 'moderateur');
    const b = el('button', { class: 'bouton principal' }, 'Créer le compte');
    b.onclick = async () => {
      const conf = await demander({ titre: 'Créer un compte admin', texte: `${ident.value} (${d.roles[role.value]})`, mdp: true, danger: role.value === 'super_admin' });
      const r = conf && await action(b, () => api('POST', '/admins', { identifiant: ident.value, role: role.value, ...conf }));
      if (r) { await recharger(); montrerMdpProvisoire(r.identifiant, r.mot_de_passe_provisoire); }
    };
    blocs.push(panneau('➕ Nouveau compte', el('p', { class: 'aide' }, 'Le serveur crée un mot de passe provisoire, montré UNE seule fois ici. La personne doit le changer à sa première connexion. Seul un super administrateur peut créer des comptes et donner les rôles.'),
      el('div', { class: 'form-grille' }, champ('Identifiant', ident), champ('Rôle', role)), el('div', { class: 'actions' }, b)));
  }
  const perms = Object.keys(Object.values(d.permissions).reduce((s, l) => { l.forEach(p => { s[p] = 1; }); return s; }, {})).sort();
  blocs.push(panneau('🔐 Permissions de chaque rôle (vérifiées par le serveur)', tableau(['Permission', ...Object.values(d.roles)], perms.map(p => el('tr', {}, el('td', {}, p),
    Object.keys(d.roles).map(r => el('td', { class: 'centre' }, d.permissions[r].includes(p) ? '✅' : '—')))))));
  blocs.push(panneau('🕑 Historique des connexions admin', tableau(['Date', 'Identifiant', 'Résultat', 'Navigateur'], d.connexions.map(c => el('tr', {}, el('td', {}, date(c.cree_le)), el('td', {}, c.identifiant),
    el('td', {}, c.ok ? pastille('réussie', 'vert') : pastille('ratée', 'rouge')), el('td', { class: 'petit' }, c.navigateur || '—'))))));
  return blocs;
}
function montrerMdpProvisoire(ident, mdp) {
  const zone = el('code', { class: 'mdp-provisoire' }, mdp);
  ouvrirTiroir('Mot de passe provisoire', el('p', {}, `Compte « ${ident} ». Donne-lui ce mot de passe en main propre (pas par un message public). Il ne sera plus jamais affiché :`), zone,
    el('button', { class: 'bouton', onclick: () => navigator.clipboard?.writeText(mdp).then(() => toast('Copié.')) }, 'Copier'),
    el('p', { class: 'aide' }, 'À sa première connexion, il devra en choisir un nouveau (12 caractères ou plus).'));
}

// ================================================================ journal d'audit
const etatJournal = { categorie: '', admin: '', q: '', page: 0 };
async function vueJournal() {
  const d = await api('GET', '/journal?' + new URLSearchParams(etatJournal));
  const maj = (k, v) => { etatJournal[k] = v; etatJournal.page = 0; recharger(); };
  const q = el('input', { type: 'search', placeholder: 'Chercher une action ou une cible…', value: etatJournal.q, maxlength: 60 });
  let t; q.addEventListener('input', () => { clearTimeout(t); t = setTimeout(() => maj('q', q.value), 400); });
  const admin = el('input', { placeholder: 'Identifiant admin', value: etatJournal.admin, maxlength: 60, onchange: e => maj('admin', e.target.value) });
  const lignes = d.journal.map(j => el('tr', {}, el('td', {}, date(j.cree_le)), el('td', {}, j.identifiant || 'serveur'), el('td', {}, pastille(j.categorie || '—', 'gris')),
    el('td', {}, j.action), el('td', { class: 'petit' }, j.cible || ''),
    el('td', {}, j.details ? el('details', {}, el('summary', {}, 'voir'), el('pre', { class: 'details' }, JSON.stringify(j.details, null, 1))) : '')));
  return [
    el('header', { class: 'titre' }, el('h1', {}, 'Journal d\'audit'), el('span', { class: 'compte' }, nombre(d.total))),
    el('p', { class: 'aide' }, 'Toutes les actions des administrateurs (qui, quand, quoi, avant / après). Ce journal ne peut pas être modifié depuis le panel.'),
    el('div', { class: 'filtres' }, q, choix({ '': 'Toutes catégories', ...Object.fromEntries(d.categories.map(c => [c, c])) }, etatJournal.categorie, { onchange: e => maj('categorie', e.target.value) }), admin),
    tableau(['Date', 'Admin', 'Catégorie', 'Action', 'Cible', 'Détails'], lignes, 'Rien.'),
    pages(d.total, d.page, 50, n => { etatJournal.page = n; recharger(); }),
  ];
}

// ================================================================ sauvegardes
async function vueSauvegardes() {
  const d = await api('GET', '/sauvegardes');
  const lignes = d.sauvegardes.map(s => el('tr', {}, el('td', {}, el('span', { class: 'code' }, s.nom)), el('td', {}, date(s.cree_le)),
    el('td', {}, { auto: 'automatique', manuelle: 'manuelle', 'avant-restauration': 'avant une restauration' }[s.motif]), el('td', {}, taille(s.taille)),
    el('td', {}, PERM('sauvegardes.restaurer') ? el('button', { class: 'bouton danger', onclick: async e => {
      const mot = s.nom.slice(5, 20);
      const conf = await demander({ titre: 'Restaurer cette sauvegarde', texte: `Toute la base revient à l'état du ${date(s.cree_le)} (joueurs, cadeaux, comptes admin…). L'état actuel est sauvegardé juste avant.`, mot, mdp: true });
      const r = conf && await action(e.target, () => api('POST', '/sauvegardes/restaurer', { nom: s.nom, ...conf }));
      if (r) { toast('Base restaurée. Reconnecte-toi.'); setTimeout(() => location.reload(), 1500); }
    } }, 'Restaurer') : null)));
  const b = PERM('sauvegardes.creer') ? el('button', { class: 'bouton principal' }, '💾 Faire une sauvegarde maintenant') : null;
  if (b) b.onclick = async () => { if (await action(b, () => api('POST', '/sauvegardes', {}), 'Sauvegarde faite.')) recharger(); };
  return [
    el('header', { class: 'titre' }, el('h1', {}, 'Sauvegardes'), b),
    el('p', { class: 'aide' }, `Base actuelle : ${taille(d.taille_base)}. Une sauvegarde automatique est faite chaque jour (14 gardées), plus les manuelles (20 gardées). `,
      'Restaurer demande un super administrateur, son mot de passe et la date de la sauvegarde tapée à la main ; le fichier est vérifié avant, et l\'état actuel est sauvegardé.'),
    tableau(['Fichier', 'Date', 'Sorte', 'Taille', ''], lignes, 'Aucune sauvegarde pour l\'instant.'),
  ];
}

// ================================================================ état du serveur
async function vueServeur() {
  const t0 = performance.now();
  const d = await api('GET', '/serveur');
  const aller = Math.round(performance.now() - t0);
  const ok = v => v ? pastille('OK', 'vert') : pastille('problème', 'rouge');
  const mes = [...d.mesures].reverse();
  return [
    el('header', { class: 'titre' }, el('h1', {}, 'État du serveur'), el('button', { class: 'bouton discret', onclick: recharger }, '↻ Actualiser')),
    el('div', { class: 'cartes-stats' },
      carteStat('API', '✅ en ligne', 'vert', `version ${d.api.version} · aller-retour ${aller} ms`),
      carteStat('Démarré il y a', duree(d.api.depuis_s), ''),
      carteStat('Joueurs connectés', nombre(d.joueurs_connectes), 'vert', 'vus il y a moins de 2 min'),
      carteStat('Temps de réponse', d.temps.p95_ms != null ? d.temps.p95_ms + ' ms' : '—', 'cyan', `95 % des ${d.temps.echantillon} dernières requêtes · moyenne de l'heure ${d.temps.moyen_heure_ms ?? '—'} ms`),
      carteStat('Erreurs (24 h)', nombre(d.erreurs.dernieres_24h), d.erreurs.dernieres_24h ? 'rouge' : 'vert'),
      carteStat('Base de données', taille(d.base.taille), d.base.controle === 'ok' ? 'vert' : 'rouge', `contrôle : ${d.base.controle} · ${nombre(d.base.joueurs)} joueurs`),
      carteStat('Dernière sauvegarde', d.sauvegardes.derniere ? date(d.sauvegardes.derniere.cree_le) : 'aucune', d.sauvegardes.derniere ? 'vert' : 'rouge',
        d.sauvegardes.derniere_auto_il_y_a_h != null ? `automatique il y a ${d.sauvegardes.derniere_auto_il_y_a_h} h` : '')),
    panneau('🧩 Services', el('ul', { class: 'liste-simple' },
      el('li', {}, 'Base de données : ', ok(d.services.base)), el('li', {}, 'Catalogue des objets : ', ok(d.services.catalogue)),
      el('li', {}, 'Sauvegarde automatique (moins de 2 jours) : ', ok(d.services.sauvegarde_auto)),
      el('li', {}, 'Relais pour la 4G (TURN Cloudflare) : ', d.services.relais_turn ? pastille('configuré', 'vert') : pastille('pas configuré (compte Cloudflare à créer)', 'jaune')))),
    mes.length ? panneau('📈 Requêtes et temps de réponse (48 dernières heures)', barres([
      { nom: 'Requêtes', valeurs: mes.map(m => ({ x: m.heure.replace(' ', 'T'), y: m.requetes })) },
      { nom: 'Refusées (4xx)', valeurs: mes.map(m => ({ x: m.heure.replace(' ', 'T'), y: m.refus })) },
      { nom: 'Erreurs (5xx)', valeurs: mes.map(m => ({ x: m.heure.replace(' ', 'T'), y: m.erreurs })) },
    ], ['#4fd1ff', '#ffd23f', '#ff6b6b']), tableau(['Heure (UTC)', 'Requêtes', 'Moyenne', 'Max'], d.mesures.slice(0, 12).map(m => el('tr', {}, el('td', {}, m.heure + ' h'), el('td', {}, m.requetes),
      el('td', {}, Math.round(m.total_ms / Math.max(1, m.requetes)) + ' ms'), el('td', {}, m.max_ms + ' ms'))))) : null,
    panneau('⚠️ Dernières erreurs', tableau(['Date', 'Route', 'Type', 'Message'], d.erreurs.liste.map(e => el('tr', {}, el('td', {}, date(e.cree_le)), el('td', {}, e.route), el('td', {}, e.type), el('td', { class: 'petit' }, e.message))), 'Aucune erreur 🎉')),
  ];
}

// ================================================================ mon compte
async function vueCompte() {
  const d = await api('GET', '/compte');
  const ancien = el('input', { type: 'password', autocomplete: 'current-password' });
  const nouveau = el('input', { type: 'password', autocomplete: 'new-password', minlength: 12 });
  const encore = el('input', { type: 'password', autocomplete: 'new-password' });
  const b = el('button', { class: 'bouton principal' }, 'Changer le mot de passe');
  b.onclick = async () => {
    if (nouveau.value !== encore.value) { toast('Les deux nouveaux mots de passe sont différents.', true); return; }
    if (await action(b, () => api('POST', '/mdp', { ancien: ancien.value, nouveau: nouveau.value }), 'Mot de passe changé. Tes autres appareils sont déconnectés.')) {
      await demarrer();
    }
  };
  return [
    el('header', { class: 'titre' }, el('h1', {}, 'Mon compte')),
    d.doit_changer_mdp ? el('p', { class: 'alerte' }, '🔑 Tu utilises un mot de passe provisoire : choisis-en un nouveau pour accéder au panel.') : null,
    el('div', { class: 'grille-2' },
      panneau('👤 ' + d.identifiant, el('p', {}, 'Rôle : ', el('b', {}, d.role_nom)), el('h3', {}, 'Changer de mot de passe'),
        champ('Mot de passe actuel', ancien), champ('Nouveau (12 caractères ou plus)', nouveau), champ('Encore une fois', encore), el('div', { class: 'actions' }, b)),
      panneau('💻 Mes sessions ouvertes', tableau(['Ouverte le', 'Active le', 'Navigateur', ''], d.sessions.map(s => el('tr', {}, el('td', {}, date(s.cree_le)), el('td', {}, date(s.vu_le)),
        el('td', { class: 'petit' }, s.navigateur || '—'), el('td', {}, s.actuelle ? pastille('celle-ci', 'vert') : el('button', { class: 'bouton discret', onclick: async e => {
          if (await action(e.target, () => api('DELETE', '/sessions/' + s.id, {}), 'Session fermée.')) recharger();
        } }, 'Fermer'))))),
      el('p', { class: 'aide' }, 'Une session se ferme seule après 2 h sans rien faire, et au plus tard 12 h après la connexion.'))),
    panneau('🕑 Mes dernières connexions', tableau(['Date', 'Résultat', 'Navigateur'], d.connexions.map(c => el('tr', {}, el('td', {}, date(c.cree_le)),
      el('td', {}, c.ok ? pastille('réussie', 'vert') : pastille('ratée', 'rouge')), el('td', { class: 'petit' }, c.navigateur || '—'))))),
  ];
}

// ================================================================ démarrage
(async () => {
  try { await demarrer(); } catch (e) { montrerConnexion(''); }
})();
