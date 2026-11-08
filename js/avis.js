// Formulaire « TON AVIS COMPTE ! » (fin de partie ou bouton « Proposer une idée ») et page des idées.
import { CATEGORIES_AVIS, NOMS_STATUTS, envoyerAvis, serveurDispo, URL_API, chargerSuggestions, voter } from './retours.js';

const $ = s => document.querySelector(s);
let note = null, debutSaisie = 0, contexte = {}, envoiEnCours = false, son = () => {};

function el(tag, attrs = {}, ...enfants) {
  const e = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (k === 'class') e.className = v; else if (k.startsWith('on')) e.addEventListener(k.slice(2), v); else if (v !== undefined && v !== null) e.setAttribute(k, v);
  }
  for (const c of enfants) if (c !== null && c !== undefined && c !== false) e.append(c instanceof Node ? c : document.createTextNode(String(c)));
  return e;
}

function majEtoiles() {
  for (const b of $('#avisEtoiles').children) {
    const n = +b.dataset.n;
    b.classList.toggle('pleine', note !== null && n <= note);
    b.setAttribute('aria-checked', String(note === n));
  }
}

function message(texte, erreur = false) {
  const m = $('#avisMessage');
  m.textContent = texte;
  m.classList.toggle('erreur', erreur);
}

export function initAvis(options = {}) {
  son = options.son || son;
  const etoiles = $('#avisEtoiles');
  for (let n = 1; n <= 5; n++) {
    etoiles.append(el('button', {
      type: 'button', class: 'etoile', 'data-n': n, role: 'radio', 'aria-checked': 'false', 'aria-label': `${n} étoile${n > 1 ? 's' : ''}`,
      onclick: () => { note = note === n ? null : n; majEtoiles(); son('clic'); },
    }, '★'));
  }
  const sel = $('#avisCategorie');
  for (const [k, nom] of CATEGORIES_AVIS) sel.append(el('option', { value: k }, nom));
  $('#avisTexte').addEventListener('input', e => { $('#avisCompteur').textContent = `${e.target.value.length} / 1000`; });
  $('#avisPasser').addEventListener('click', () => {
    const replie = !$('#avis').classList.contains('replie');
    $('#avis').classList.toggle('replie', replie);
    $('#avisPasser').textContent = replie ? '💬 Donner mon avis' : 'Passer ✕';
    if (contexte.origine === 'menu' && replie) fermerFenetreIdee();
  });
  $('#avisEnvoyer').addEventListener('click', envoyer);
  // bouton « Proposer une idée » (menu) : la même fiche, dans une fenêtre
  $('#btnProposer').addEventListener('click', () => {
    $('#emplacementAvis').append($('#avis'));
    $('#fenetreIdee').classList.remove('cache');
    preparerAvis({ partie_id: null, origine: 'menu', plateforme: options.plateforme, categorie: 'idee' });
  });
  $('#fermerIdee').addEventListener('click', fermerFenetreIdee);
  for (const b of document.querySelectorAll('.choix-tri button')) b.addEventListener('click', () => {
    for (const x of document.querySelectorAll('.choix-tri button')) x.classList.toggle('actif', x === b);
    dessinerIdees(b.dataset.tri);
  });
}

function fermerFenetreIdee() {
  $('#fenetreIdee').classList.add('cache');
  // la fiche retourne sur l'écran de fin, avant les boutons
  $('#fin .boite').insertBefore($('#avis'), $('#btnRejouer'));
  if (!$('#pageIdees').classList.contains('cache')) dessinerIdees();
}

// Remise à zéro de la fiche pour une nouvelle partie (ou une nouvelle idée)
export async function preparerAvis(ctx) {
  contexte = ctx || {};
  note = null; envoiEnCours = false;
  majEtoiles();
  $('#avisCategorie').value = contexte.categorie || 'idee';
  $('#avisTexte').value = ''; $('#avisCompteur').textContent = '0 / 1000';
  $('#avisSite').value = '';
  $('#avis').classList.remove('replie');
  $('#avisPasser').textContent = contexte.origine === 'menu' ? 'Annuler ✕' : 'Passer ✕';
  $('#avisFormulaire').classList.remove('cache');
  $('#avisMerci').classList.add('cache');
  $('#avisEnvoyer').disabled = false;
  message('');
  debutSaisie = performance.now();
  if (!URL_API) { message('ℹ️ L\'envoi des avis arrive bientôt : le serveur n\'est pas encore en ligne.'); $('#avisEnvoyer').disabled = true; return; }
  if (!(await serveurDispo())) message('⚠️ Le serveur des avis ne répond pas pour l\'instant. Tu pourras réessayer.', true);
}

async function envoyer() {
  if (envoiEnCours) return;
  const texte = $('#avisTexte').value.trim();
  if (texte.length < 3 && note === null) { message('Écris quelques mots ou donne une note avec les étoiles.', true); return; }
  envoiEnCours = true;
  const b = $('#avisEnvoyer');
  b.disabled = true; b.textContent = '⏳ Envoi…';
  try {
    const r = await envoyerAvis({
      note, categorie: $('#avisCategorie').value, texte, partie_id: contexte.partie_id || null,
      plateforme: contexte.plateforme || 'pc', site: $('#avisSite').value, duree_saisie: Math.round(performance.now() - debutSaisie),
    });
    $('#avisFormulaire').classList.add('cache');
    $('#avisMerci').classList.remove('cache');
    $('#avisNumero').textContent = r.id ? `(n° ${r.id})` : '';
    $('#avisPasser').textContent = contexte.origine === 'menu' ? 'Fermer ✕' : '';
    son('ramasser');
  } catch (e) {
    message('❌ ' + e.message, true);
    b.disabled = false;
  }
  b.textContent = '📨 Envoyer mon avis';
  envoiEnCours = false;
}

// ---------- Page des idées (votes) ----------
let triActuel = 'populaires';
export async function dessinerIdees(tri = triActuel) {
  triActuel = tri;
  const liste = $('#listeIdees');
  liste.replaceChildren(el('p', { class: 'idees-info' }, '⏳ Chargement des idées…'));
  if (!URL_API) { liste.replaceChildren(el('p', { class: 'idees-info' }, 'ℹ️ Les idées et les votes arrivent bientôt : le serveur n\'est pas encore en ligne.')); return; }
  let idees;
  try { idees = await chargerSuggestions(tri); }
  catch (e) { liste.replaceChildren(el('p', { class: 'idees-info erreur' }, '⚠️ ' + e.message)); return; }
  if (!idees.length) { liste.replaceChildren(el('p', { class: 'idees-info' }, 'Pas encore d\'idée publiée. Propose la première ! ✍️')); return; }
  const nomCat = Object.fromEntries(CATEGORIES_AVIS);
  liste.replaceChildren(...idees.map(i => {
    const bouton = el('button', { type: 'button', class: 'vote' + (i.a_vote ? ' vote-fait' : ''), 'aria-pressed': String(!!i.a_vote), title: i.a_vote ? 'Retirer mon vote' : 'Voter pour cette idée' }, '▲', el('b', {}, i.votes));
    bouton.addEventListener('click', async () => {
      bouton.disabled = true;
      try {
        const r = await voter(i.id, !i.a_vote);
        i.a_vote = r.a_vote; i.votes = r.votes;
        bouton.classList.toggle('vote-fait', !!i.a_vote); bouton.setAttribute('aria-pressed', String(!!i.a_vote));
        bouton.querySelector('b').textContent = i.votes;
        son(i.a_vote ? 'ramasser' : 'clic');
      } catch (e) { alerte(liste, e.message); }
      bouton.disabled = false;
    });
    return el('article', { class: 'idee' }, bouton, el('div', { class: 'idee-corps' },
      el('p', {}, i.texte),
      el('div', { class: 'idee-badges' }, el('span', { class: 'badge-idee' }, nomCat[i.categorie] || i.categorie), el('span', { class: 'badge-idee st-' + i.statut }, NOMS_STATUTS[i.statut] || i.statut))));
  }));
}

function alerte(liste, texte) {
  const p = el('p', { class: 'idees-info erreur' }, '⚠️ ' + texte);
  liste.prepend(p);
  setTimeout(() => p.remove(), 3500);
}
