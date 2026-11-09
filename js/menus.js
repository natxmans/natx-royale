// Menus : onglets Jouer / Boutique / Casier, achats, équipement, récompenses.
import { CATALOGUE, CATEGORIES, RARETES_COSM, COLLAB, objet, prixDe, possede, acheter, sauverProfil, boutiqueDuJour, cleObjet,
  defisDuJour, texteDefi, xpPourNiveau, lookPossedeAuHasard, nettoyerLook, RECOMPENSE_DEFI } from './boutique.js';
import { echapper } from './outils.js';
import { NOUVEAUTES } from './nouveautes.js';
import { dessinerIdees } from './avis.js';
import { MODES } from './partage.js';

const $ = s => document.querySelector(s);

const DESSIN_TRAINEE = {
  aucune: ['#ffffff00'], fumee: ['#e8eef5', '#cfd8e3'], etincelles: ['#ffd23f', '#ffae1f', '#fff6c8'],
  coeurs: ['#ff5d8f', '#ff8fb1'], etoiles: ['#ffe27a', '#ffffff'], arcenciel: ['#e74c3c', '#ff8c1a', '#f1c40f', '#2ecc71', '#3d8dff', '#8e44ad'], neon2k27: ['#22e8ff', '#ff2e88', '#b026ff'],
};
// Image d'une traînée dessinée en 2D
const cacheTrainees = new Map();
function imageTrainee(id) {
  if (cacheTrainees.has(id)) return cacheTrainees.get(id);
  const cv = document.createElement('canvas'); cv.width = cv.height = 128;
  const g = cv.getContext('2d');
  const cs = DESSIN_TRAINEE[id] || ['#fff'];
  if (id === 'aucune') { g.strokeStyle = 'rgba(255,255,255,.4)'; g.lineWidth = 6; g.beginPath(); g.arc(64, 64, 34, 0, 7); g.moveTo(40, 88); g.lineTo(88, 40); g.stroke(); }
  for (let i = 0; i < 26 && id !== 'aucune'; i++) {
    const t = i / 26, x = 18 + t * 92 + Math.sin(i * 1.7) * 8, y = 110 - t * 92 + Math.cos(i * 2.3) * 8, s = 4 + t * 12;
    g.fillStyle = cs[i % cs.length]; g.globalAlpha = 0.35 + t * 0.65;
    if (id === 'coeurs') { g.font = `${s * 2}px serif`; g.fillText('♥', x - s, y + s); }
    else if (id === 'etoiles') { g.font = `${s * 2}px serif`; g.fillText('★', x - s, y + s); }
    else if (id === 'arcenciel') { g.fillRect(x - s / 2, y - s / 2, s * 1.2, s * 1.2); }
    else { g.beginPath(); g.arc(x, y, s / (id === 'etincelles' ? 2.2 : 1), 0, 7); g.fill(); }
  }
  const url = cv.toDataURL();
  cacheTrainees.set(id, url);
  return url;
}

export class Menus {
  constructor({ apercu, profil, reglages, surLook, son }) {
    this.apercu = apercu; this.profil = profil; this.reglages = reglages;
    this.surLook = surLook || (() => {}); this.son = son || (() => {});
    this.page = 'jouer';
    this.categorie = 'tenue';
    this.selection = null;
    for (const b of document.querySelectorAll('.onglets button')) b.onclick = () => { this.son('clic'); this.montrerPage(b.dataset.page); };
    $('#btnVersCasier').onclick = () => this.montrerPage('casier');
    $('#btnHasard').onclick = () => this.styleHasard();
    $('#bandeauCollab').onclick = () => { this.son('clic'); this.montrerPage('boutique'); };
    setInterval(() => this.majCompteur(), 1000);
    this.majPieces();
    this.majPastille();
  }

  get couleur() { return this.reglages.couleur; }

  montrerPage(nom) {
    this.page = nom;
    for (const b of document.querySelectorAll('.onglets button')) b.classList.toggle('actif', b.dataset.page === nom);
    for (const p of ['jouer', 'boutique', 'casier', 'nouveautes', 'idees']) $('#page' + p[0].toUpperCase() + p.slice(1)).classList.toggle('cache', p !== nom);
    if (nom === 'jouer') { this.apercu.monter($('#sceneJouer')); this.montrerPerso(); this.majStats(); }
    if (nom === 'boutique') { this.dessinerBoutique(); this.profil.vuBoutique = boutiqueDuJour().finDans; this.majPastille(); }
    if (nom === 'casier') this.dessinerCasier();
    if (nom === 'nouveautes') this.dessinerNouveautes();
    if (nom === 'idees') dessinerIdees();
  }

  dessinerNouveautes() {
    let n = 0;
    $('#listeNouveautes').innerHTML = NOUVEAUTES.map(([titre, liste]) => `<h3>${titre}</h3><ol start="${n + 1}">${liste.map(t => { n++; return `<li>${echapper(t)}</li>`; }).join('')}</ol>`).join('');
  }

  montrerPerso(cadrage = 'corps', look = this.profil.equipe, emote = null) {
    this.apercu.montrer({ couleur: this.couleur, look, numero: this.reglages.numero || 0, cadrage, emote });
    $('#nomPodium').textContent = this.reglages.pseudo || 'Toi';
  }

  // Style au hasard (parmi ce que tu possèdes)
  styleHasard() {
    this.profil.equipe = nettoyerLook(lookPossedeAuHasard(this.profil));
    sauverProfil(this.profil);
    this.son('ramasser');
    this.surLook();
    this.dessinerCasier();
  }

  // 3 styles enregistrés
  dessinerPresets() {
    const el = $('#presets');
    el.innerHTML = '';
    this.profil.presets.forEach((l, i) => {
      const b = document.createElement('div');
      b.className = 'preset' + (l ? ' plein' : '');
      b.innerHTML = `<button class="petit charger" ${l ? '' : 'disabled'} title="Mettre ce style">${i + 1}</button><button class="petit sauver" title="Enregistrer mon style ici">💾</button>`;
      b.querySelector('.charger').onclick = () => {
        const look = nettoyerLook(l);
        // on ne met que ce qu'on possède encore
        for (const c of Object.keys(look)) if (!possede(this.profil, objet(c, look[c]))) look[c] = this.profil.equipe[c];
        this.profil.equipe = look; sauverProfil(this.profil);
        this.son('ramasser'); toast(`Style ${i + 1} équipé !`); this.surLook(); this.dessinerCasier();
      };
      b.querySelector('.sauver').onclick = () => {
        this.profil.presets[i] = { ...this.profil.equipe }; sauverProfil(this.profil);
        this.son('clic'); toast(`Style enregistré dans l'emplacement ${i + 1} 💾`); this.dessinerPresets();
      };
      el.appendChild(b);
    });
  }

  majPieces(anime = false) {
    for (const el of document.querySelectorAll('.pieces b')) {
      const fin = this.profil.pieces;
      if (!anime) { el.textContent = fin; continue; }
      const debut = +el.textContent || 0, t0 = performance.now();
      const pas = () => { const k = Math.min(1, (performance.now() - t0) / 900); el.textContent = Math.round(debut + (fin - debut) * k); if (k < 1) requestAnimationFrame(pas); };
      pas();
    }
  }

  majCompteur() {
    const b = boutiqueDuJour();
    const s = Math.floor(b.finDans / 1000);
    const t = `${String(Math.floor(s / 3600)).padStart(2, '0')}:${String(Math.floor(s / 60) % 60).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;
    const el = $('#compteBoutique'); if (el) el.textContent = '⏳ Nouveaux objets dans ' + t;
  }

  majPastille() {
    const jour = new Date().toDateString();
    $('#pastilleBoutique').classList.toggle('cache', this.profil.jourBoutiqueVu === jour);
    if (this.page === 'boutique') { this.profil.jourBoutiqueVu = jour; sauverProfil(this.profil); $('#pastilleBoutique').classList.add('cache'); }
  }

  majStats() {
    const p = this.profil, s = p.stats;
    const total = CATALOGUE.length, poss = CATALOGUE.filter(o => possede(p, o)).length;
    // niveau et XP
    const besoin = xpPourNiveau(p.niveau);
    $('#niveauProfil').innerHTML = `<div class="ligne-niveau"><span class="gros-niveau">⭐ ${p.niveau}</span><div class="barre-xp grande"><i style="width:${Math.round(p.xp / besoin * 100)}%"></i></div><small>${p.xp} / ${besoin} XP</small></div>
      <p class="petit-texte">Prochain niveau : +${(p.niveau + 1) % 5 === 0 ? 300 : 100} 🪙</p>`;
    // défis du jour
    const defis = defisDuJour(p);
    $('#defisJour').innerHTML = `<h3>🎯 Défis du jour <small>+${RECOMPENSE_DEFI.pieces} 🪙 · +${RECOMPENSE_DEFI.xp} XP chacun</small></h3>` + defis.map(d => {
      const k = d.id === 'top' ? (d.fait ? 1 : 0) : Math.min(1, d.prog / d.n);
      const prog = d.id === 'top' ? (d.fait ? '✔' : '—') : `${Math.floor(Math.min(d.prog, d.n))} / ${d.n}`;
      return `<div class="defi${d.fait ? ' fait' : ''}"><span>${d.fait ? '✅' : '▫️'} ${echapper(texteDefi(d))}</span><b>${prog}</b><div class="barre-xp"><i style="width:${Math.round(k * 100)}%"></i></div></div>`;
    }).join('');
    // stats, records et historique
    const mmss = t => `${Math.floor(t / 60)}:${String(Math.floor(t % 60)).padStart(2, '0')}`;
    const precision = s.tirs ? Math.round(s.touches / s.tirs * 100) : 0;
    const r = p.records;
    const histo = p.historique.map(h => `<tr><td>${h.gagne ? '🏆' : '#' + (h.place || '?')}</td><td>${h.kills} 💀</td><td>${h.degats} dégâts</td><td>${mmss(h.survie)}</td><td>${(MODES[h.mode] || MODES.solo).icone}</td></tr>`).join('');
    $('#statsProfil').innerHTML = `<h3>📊 Tes stats</h3>
      <div class="chiffres"><div><b>${s.parties}</b>parties</div><div><b>${s.victoires}</b>TOP 1</div><div><b>${s.kills}</b>éliminations</div><div><b>${poss}/${total}</b>objets</div>
      <div><b>${precision} %</b>précision</div><div><b>${Math.round((s.temps || 0) / 60)} min</b>de jeu</div></div>
      <h3>🏅 Records</h3>
      <div class="chiffres petits"><div><b>${r.kills}</b>élim. en 1 partie</div><div><b>${r.degats}</b>dégâts</div><div><b>${r.place ? '#' + r.place : '—'}</b>meilleure place</div><div><b>${mmss(r.survie)}</b>survie</div></div>
      ${histo ? `<details><summary>🕘 Mes 10 dernières parties</summary><table class="histo">${histo}</table></details>` : ''}`;
    for (const el of document.querySelectorAll('#niveauEntete')) el.textContent = '⭐ ' + p.niveau;
  }

  // ---------- Cartes d'objets ----------
  carte(o, grand = false) {
    const r = RARETES_COSM[o.rarete];
    const d = document.createElement('button');
    d.className = 'carte r-' + o.rarete + (grand ? ' grande' : '') + (possede(this.profil, o) ? ' possede' : '');
    const cat = CATEGORIES.find(c => c.id === o.cat);
    const img = o.cat === 'trainee' ? imageTrainee(o.id) : '';
    d.innerHTML = `<div class="carte-img">${img ? `<img src="${img}" alt="">` : '<span class="charge">…</span>'}</div>
      <div class="carte-bas"><span class="carte-cat">${cat.icone} ${cat.un}</span><b>${echapper(o.nom)}</b>
      ${possede(this.profil, o) ? '<span class="prix ok">✔ Possédé</span>' : `<span class="prix">🪙 ${prixDe(o)}</span>`}</div>`;
    d.style.setProperty('--rarete', r.couleur);
    if (!img) this.chargerMiniature(d.querySelector('.carte-img'), o);
    return d;
  }

  chargerMiniature(el, o) {
    // une miniature à la fois pour ne pas bloquer l'écran
    this.fileMini = this.fileMini || [];
    this.fileMini.push([el, o]);
    if (this.fileMini.length === 1) this.suivanteMini();
  }
  suivanteMini() {
    const [el, o] = this.fileMini[0] || [];
    if (!el) return;
    setTimeout(() => {
      try {
        const url = this.apercu.miniatureCosmetique(o, this.couleur);
        if (url) el.innerHTML = `<img src="${url}" alt="">`;
      } catch (e) { console.warn(e); }
      this.fileMini.shift();
      this.suivanteMini();
    }, 0);
  }

  // ---------- Boutique ----------
  dessinerBoutique() {
    const b = boutiqueDuJour();
    this.fileMini = [];
    const gv = $('#grilleVedettes'), gj = $('#grilleJour'), gc = $('#grilleCollab');
    gv.innerHTML = ''; gj.innerHTML = ''; gc.innerHTML = '';
    for (const o of COLLAB) { const c = this.carte(o); c.onclick = () => this.choisirBoutique(o); gc.appendChild(c); }
    for (const o of b.vedettes) { const c = this.carte(o, true); c.onclick = () => this.choisirBoutique(o); gv.appendChild(c); }
    for (const o of b.quotidiens) { const c = this.carte(o); c.onclick = () => this.choisirBoutique(o); gj.appendChild(c); }
    this.majCompteur();
    this.choisirBoutique(this.selection && [...COLLAB, ...b.vedettes, ...b.quotidiens].includes(this.selection) ? this.selection : COLLAB[1]);
  }

  cadragePour(o) {
    return { chapeau: 'tete', dos: 'dos', deltaplane: 'delta', pioche: 'pioche' }[o.cat] || 'corps';
  }

  choisirBoutique(o) {
    this.selection = o;
    for (const c of document.querySelectorAll('#pageBoutique .carte')) c.classList.toggle('choisie', c.querySelector('b').textContent === o.nom);
    this.apercu.monter($('#sceneBoutique'));
    const essai = { ...this.profil.equipe, [o.cat]: o.id };
    this.montrerPerso(this.cadragePour(o), essai, o.cat === 'emote' ? o.id : null);
    this.infosObjet($('#ficheInfos'), o, true);
  }

  infosObjet(el, o, boutique) {
    const r = RARETES_COSM[o.rarete];
    const a = possede(this.profil, o);
    const equipe = this.profil.equipe[o.cat] === o.id;
    const prix = prixDe(o);
    let bouton;
    if (a) bouton = equipe ? '<button class="gros gris" disabled>✔ Équipé</button>' : '<button class="gros bleu" id="btnEquiper">Équiper</button>';
    else if (this.profil.pieces >= prix) bouton = `<button class="gros jaune" id="btnAcheter">Acheter · 🪙 ${prix}</button>`;
    else bouton = `<button class="gros gris" disabled>Il te manque 🪙 ${prix - this.profil.pieces}</button>`;
    const astuce = o.cat === 'emote' ? '<p class="petit-texte">En jeu, appuie sur <kbd>B</kbd> pour faire ton émote.</p>'
      : o.cat === 'trainee' ? '<p class="petit-texte">Elle apparaît derrière toi quand tu sautes du dirigeable.</p>' : '';
    el.innerHTML = `<span class="badge" style="--rarete:${r.couleur}">${r.nom}</span>
      <h2>${echapper(o.nom)}</h2><p>${echapper(o.desc)}</p>${astuce}${bouton}`;
    const ba = el.querySelector('#btnAcheter');
    if (ba) ba.onclick = () => {
      const res = acheter(this.profil, o);
      if (!res.ok) { toast(res.raison); return; }
      this.son('coffre');
      toast(`🎉 ${o.nom} est à toi !`);
      this.equiper(o, true);
      this.majPieces(true);
      if (boutique) this.dessinerBoutique(); else this.dessinerCasier();
    };
    const be = el.querySelector('#btnEquiper');
    if (be) be.onclick = () => { this.equiper(o); if (boutique) this.choisirBoutique(o); else this.dessinerCasier(); };
  }

  equiper(o, silencieux) {
    this.profil.equipe[o.cat] = o.id;
    this.profil.nouveautes = this.profil.nouveautes.filter(k => k !== cleObjet(o));
    sauverProfil(this.profil);
    if (!silencieux) { this.son('ramasser'); toast(`${o.nom} équipé !`); }
    this.surLook();
  }

  // ---------- Casier ----------
  dessinerCasier() {
    this.dessinerPresets();
    const nav = $('#categoriesCasier');
    nav.innerHTML = '';
    for (const c of CATEGORIES) {
      const b = document.createElement('button');
      const eq = objet(c.id, this.profil.equipe[c.id]);
      b.className = c.id === this.categorie ? 'actif' : '';
      const nouveau = this.profil.nouveautes.some(k => k.startsWith(c.id + ':'));
      b.innerHTML = `<span class="ico">${c.icone}</span><span>${c.nom}<small>${eq ? echapper(eq.nom) : ''}</small></span>${nouveau ? '<i class="point"></i>' : ''}`;
      b.onclick = () => { this.categorie = c.id; this.son('clic'); this.dessinerCasier(); };
      nav.appendChild(b);
    }
    const g = $('#grilleCasier');
    g.innerHTML = '';
    this.fileMini = [];
    const liste = CATALOGUE.filter(o => o.cat === this.categorie);
    const ordre = { commun: 0, rare: 1, epique: 2, legendaire: 3 };
    liste.sort((a, b) => (possede(this.profil, b) - possede(this.profil, a)) || ordre[a.rarete] - ordre[b.rarete]);
    for (const o of liste) {
      const c = this.carte(o);
      if (!possede(this.profil, o)) c.classList.add('verrou');
      if (this.profil.equipe[o.cat] === o.id) c.classList.add('equipe');
      if (this.profil.nouveautes.includes(cleObjet(o))) c.classList.add('nouveau');
      c.onclick = () => {
        this.son('clic');
        for (const x of g.children) x.classList.remove('choisie');
        c.classList.add('choisie');
        this.apercu.monter($('#sceneCasier'));
        this.montrerPerso(this.cadragePour(o), { ...this.profil.equipe, [o.cat]: o.id }, o.cat === 'emote' ? o.id : null);
        this.infosObjet($('#casierInfos'), o, false);
        if (possede(this.profil, o) && this.profil.equipe[o.cat] !== o.id) { this.equiper(o); c.classList.add('equipe'); for (const x of g.children) if (x !== c) x.classList.remove('equipe'); this.infosObjet($('#casierInfos'), o, false); }
      };
      g.appendChild(c);
    }
    const eq = objet(this.categorie, this.profil.equipe[this.categorie]);
    this.apercu.monter($('#sceneCasier'));
    this.montrerPerso(this.cadragePour(eq), this.profil.equipe, eq.cat === 'emote' ? eq.id : null);
    this.infosObjet($('#casierInfos'), eq, false);
    const poss = liste.filter(o => possede(this.profil, o)).length;
    $('#titreCasier').textContent = `${CATEGORIES.find(c => c.id === this.categorie).nom} · ${poss}/${liste.length}`;
  }
}

// ---------- Petits messages ----------
export function toast(texte, duree = 2600) {
  const t = document.createElement('div');
  t.className = 'toast';
  t.textContent = texte;
  $('#toasts').appendChild(t);
  setTimeout(() => t.classList.add('part'), duree);
  setTimeout(() => t.remove(), duree + 500);
}
