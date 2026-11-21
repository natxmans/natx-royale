// Compte du joueur : sauvegarde en ligne du profil + code de sauvegarde.
// Le profil (pièces, objets, niveau, esprits…) reste dans le navigateur, mais une copie part sur le serveur
// quelques secondes après chaque changement. Le serveur garde la version la plus récente (numéro « rev ») :
// au démarrage, si un autre appareil a joué plus récemment avec le même compte, on récupère sa version.
// Le code de sauvegarde (Paramètres → Compte) permet de retrouver le compte sur un autre navigateur ou téléphone.
import { surSauvegardeProfil } from './boutique.js';
import { URL_API, chargerCompte, sauvegarderCompte, nouveauCodeSauvegarde, codeSauvegardeLocal, recupererCompte, codeJoueur } from './retours.js';

const $ = s => document.querySelector(s);
const CLE_PROFIL = 'natx-royale-profil', CLE_REGLAGES = 'natx-royale', CLE_RECHARGE = 'natx-compte-recharge';
let ctx = null, minuteur = null, enCours = false, derniereSauvegarde = null, etat = 'inconnu';

// ce qui part sur le serveur : tout le profil + pseudo, couleur, peau et touches (pour les retrouver sur l'autre appareil)
const paquet = p => ({ ...p, _reglages: { pseudo: ctx.reglages.pseudo || '', couleur: ctx.reglages.couleur || '', peau: ctx.reglages.peau || '', touches: ctx.reglages.touches || {} } });

function remplacerProfil(sauvegarde, message) {
  const prof = { ...sauvegarde };
  const r = prof._reglages;
  delete prof._reglages;
  try {
    localStorage.setItem(CLE_PROFIL, JSON.stringify(prof));
    if (r && typeof r === 'object') {
      const reg = JSON.parse(localStorage.getItem(CLE_REGLAGES) || '{}');
      if (typeof r.pseudo === 'string' && r.pseudo) reg.pseudo = r.pseudo.slice(0, 16);
      if (/^#[0-9a-f]{6}$/i.test(r.couleur || '')) reg.couleur = r.couleur;
      if (/^#[0-9a-f]{6}$/i.test(r.peau || '')) reg.peau = r.peau;
      if (r.touches && typeof r.touches === 'object' && !Array.isArray(r.touches)) reg.touches = r.touches; // revérifiées au démarrage (touches.js)
      localStorage.setItem(CLE_REGLAGES, JSON.stringify(reg));
    }
    sessionStorage.setItem(CLE_RECHARGE, message);
  } catch (e) { ctx.toast('☁️ Impossible d\'écrire dans ce navigateur (stockage bloqué ?)', 5000); return; }
  location.reload();
}

async function envoyer() {
  minuteur = null;
  if (!ctx) return;
  if (enCours) { planifier(); return; }
  enCours = true;
  const p = ctx.profil;
  if (!(p.rev > 0)) { p.rev = 1; try { localStorage.setItem(CLE_PROFIL, JSON.stringify(p)); } catch (e) { /* stockage bloqué */ } }
  try {
    await sauvegarderCompte(p.rev, paquet(p));
    derniereSauvegarde = Date.now(); etat = 'ok';
  } catch (e) {
    etat = 'hors-ligne';
    if (/plus récente/i.test(e.message)) {
      try {
        const d = await chargerCompte();
        // un autre appareil a joué entre-temps avec ce compte : on prend sa version (la plus récente gagne)
        if (d.profil && d.rev > (p.rev || 0)) { remplacerProfil(d.profil, '☁️ Ton compte a avancé sur un autre appareil : voici sa version la plus récente.'); return; }
        if (d.rev === p.rev) { etat = 'ok'; derniereSauvegarde = d.maj_le ? d.maj_le * 1000 : Date.now(); } // déjà sauvegardé
      } catch (er) { /* on réessaiera */ }
    }
  }
  enCours = false;
  majAffichage();
}
function planifier() { if (!minuteur) minuteur = setTimeout(envoyer, 4000); }

function majAffichage() {
  const e = $('#compteEtat');
  if (!e) return;
  e.textContent = etat === 'ok' ? `☁️ Sauvegardé en ligne${derniereSauvegarde ? ' à ' + new Date(derniereSauvegarde).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' }) : ''}.`
    : etat === 'hors-ligne' ? '☁️ Pas de connexion au serveur : ton compte sera sauvegardé dès qu\'il répondra.' : '☁️ Sauvegarde en ligne…';
  const code = codeSauvegardeLocal();
  const champ = $('#compteCode');
  champ.dataset.code = code || '';
  champ.textContent = code ? (champ.dataset.visible === '1' ? code : '••••-••••-••••-••••') : 'Pas encore de code';
  $('#compteVoir').classList.toggle('cache', !code);
  $('#compteCopier').classList.toggle('cache', !code);
  $('#compteNouveau').textContent = code ? '🔄 Nouveau code' : '🔑 Créer mon code';
}

function brancherInterface() {
  codeJoueur().then(c => { if (c) $('#compteCodeJoueur').textContent = c; }).catch(() => {});
  $('#compteVoir').onclick = () => { const c = $('#compteCode'); c.dataset.visible = c.dataset.visible === '1' ? '0' : '1'; majAffichage(); };
  $('#compteCopier').onclick = () => navigator.clipboard?.writeText($('#compteCode').dataset.code).then(() => ctx.toast('📋 Code copié. Garde-le pour toi !', 3000));
  $('#compteNouveau').onclick = async () => {
    if (codeSauvegardeLocal() && !confirm('Faire un nouveau code ? L\'ancien ne marchera plus.')) return;
    const b = $('#compteNouveau'); b.disabled = true;
    try {
      await nouveauCodeSauvegarde();
      $('#compteCode').dataset.visible = '1';
      $('#compteMsg').textContent = '✅ Voici ton code. Note-le ou prends-le en photo, et ne le donne à personne.';
      if (minuteur) { clearTimeout(minuteur); }
      await envoyer(); // la sauvegarde part tout de suite, pour qu'il y ait quelque chose à récupérer
    } catch (e) { $('#compteMsg').textContent = e.message; }
    b.disabled = false;
    majAffichage();
  };
  $('#compteRecuperer').onclick = async () => {
    const code = $('#compteSaisie').value.trim();
    if (!code) { $('#compteMsg').textContent = 'Tape ton code de sauvegarde.'; return; }
    if (!confirm('Le compte de ce navigateur va être remplacé par celui du code. (Il reste sauvegardé en ligne.) Continuer ?')) return;
    const b = $('#compteRecuperer'); b.disabled = true;
    $('#compteMsg').textContent = 'Récupération…';
    try {
      if (minuteur) clearTimeout(minuteur);
      await envoyer().catch(() => {}); // le compte actuel part d'abord en ligne
      const d = await recupererCompte(code);
      if (d.profil) remplacerProfil(d.profil, `☁️ Compte ${d.code_joueur} récupéré !`);
      else {
        // ce compte n'avait pas encore de sauvegarde : le profil de ce navigateur continue avec ce compte
        sessionStorage.setItem(CLE_RECHARGE, `☁️ Compte ${d.code_joueur} récupéré (il n'avait pas encore de sauvegarde : ton profil actuel continue avec lui).`);
        location.reload();
      }
    } catch (e) { $('#compteMsg').textContent = '❌ ' + e.message; b.disabled = false; }
  };
  $('#compteSaisie').addEventListener('input', e => {
    const v = e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 16);
    e.target.value = v.replace(/(.{4})(?=.)/g, '$1-');
  });
}

export async function initCompte({ profil, reglages, toast }) {
  ctx = { profil, reglages, toast };
  if (!URL_API) { $('#ongletCompte')?.classList.add('cache'); return; }
  brancherInterface();
  const message = sessionStorage.getItem(CLE_RECHARGE);
  sessionStorage.removeItem(CLE_RECHARGE);
  if (message) setTimeout(() => toast(message, 5000), 800);
  surSauvegardeProfil(planifier);
  try {
    const d = await chargerCompte();
    if (d.profil && d.rev > (profil.rev || 0)) {
      if (message) { etat = 'hors-ligne'; } // déjà rechargé une fois : pas de boucle
      else { remplacerProfil(d.profil, '☁️ Ton compte a avancé sur un autre appareil : voici sa version la plus récente.'); return; }
    } else if (!d.profil || d.rev < (profil.rev || 0)) planifier(); // pas encore de sauvegarde, ou ce navigateur est en avance
    else { etat = 'ok'; derniereSauvegarde = d.maj_le ? d.maj_le * 1000 : null; }
  } catch (e) { etat = 'hors-ligne'; }
  majAffichage();
  // on quitte la page : la dernière sauvegarde part tout de suite
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'hidden' && minuteur) { clearTimeout(minuteur); envoyer(); } });
}
