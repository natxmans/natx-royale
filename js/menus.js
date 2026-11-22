// Menus : onglets Jouer / Boutique / Casier, achats, équipement, récompenses.
import { CATALOGUE, CATEGORIES, RARETES_COSM, COLLAB, objet, prixDe, possede, acheter, sauverProfil, boutiqueDuJour, cleObjet,
  defisDuJour, texteDefi, xpPourNiveau, lookPossedeAuHasard, nettoyerLook, RECOMPENSE_DEFI,
  COLLECTIONS_250, collectionDe, collectionsVisibles, estDeBase, desequiper, LOOK_DEFAUT, promoDe, prixNormal, enVente } from './boutique.js';
import { ESPRITS, TYPES_ESPRITS, PERSONNALITES, RARETES_ESPRIT, ORDRE_RARETES, meilleuresRaretes, replique, sonEsprit, PRIX_ECLATS } from './esprits.js';
import { descriptionEsprit } from './cadeaux.js';
import { chargerCosmetiques, cosmetiquePret } from './modeles.js';
import { vignette } from './icones.js';
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
    // filtres du catalogue (Boutique) et du casier
    this.filtres = { texte: '', cat: '', rarete: '', serie: '', possede: '' };
    this.filtresCasier = { texte: '', rarete: '', serie: '', mes: false };
    this.pageCatalogue = 0;
    this.initFiltres();
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
    for (const p of ['jouer', 'boutique', 'casier', 'esprits', 'nouveautes', 'idees']) $('#page' + p[0].toUpperCase() + p.slice(1)).classList.toggle('cache', p !== nom);
    if (nom === 'jouer') { this.apercu.monter($('#sceneJouer')); this.montrerPerso(); this.majStats(); }
    if (nom === 'boutique') { this.dessinerBoutique(); this.profil.vuBoutique = boutiqueDuJour().finDans; this.majPastille(); }
    if (nom === 'casier') this.dessinerCasier();
    if (nom === 'esprits') { this.apercu.monter($('#sceneEsprits')); this.dessinerEsprits(); }
    if (nom === 'nouveautes') this.dessinerNouveautes();
    if (nom === 'idees') dessinerIdees();
  }

  dessinerNouveautes() {
    let n = 0;
    $('#listeNouveautes').innerHTML = NOUVEAUTES.map(([titre, liste]) => `<h3>${titre}</h3><ol start="${n + 1}">${liste.map(t => { n++; return `<li>${echapper(t)}</li>`; }).join('')}</ol>`).join('');
  }

  montrerPerso(cadrage = 'corps', look = this.profil.equipe, emote = null) {
    this.apercu.montrer({ couleur: this.couleur, look: { ...look, ...(this.reglages.peau ? { peau: this.reglages.peau } : {}), ...(Number.isInteger(this.reglages.coiffure) ? { coiffure: this.reglages.coiffure } : {}),
      ...(this.reglages.cheveux ? { cheveux: this.reglages.cheveux } : {}) }, numero: this.reglages.numero || 0, cadrage, emote });
    $('#nomPodium').textContent = this.reglages.pseudo || 'Toi';
    // Le personnage des menus est en HD : ce qui n'est pas encore chargé (tenue en 512 px avec relief, objets des 250)
    // arrive juste après, et on le remontre une fois prêt.
    const cles = Object.entries(look).map(([c, id]) => c + ':' + id).filter(k => !cosmetiquePret(k, true));
    const jeton = this.jetonPerso = {};
    if (cles.length) chargerCosmetiques(cles, true).then(() => { if (this.jetonPerso === jeton && cles.every(k => cosmetiquePret(k, true))) this.montrerPerso(cadrage, look, emote); }).catch(() => {});
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
    const total = CATALOGUE.filter(o => !o.reserve || possede(p, o)).length, poss = CATALOGUE.filter(o => possede(p, o)).length;
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
    // l’accueil montre 4 chiffres ; tout le reste (records, dernières parties) est dans la fenêtre « Tout voir »
    $('#statsProfil').innerHTML = `<h3>📊 Tes stats <button class="petit" id="btnStats">Tout voir</button></h3>
      <div class="chiffres"><div><b>${s.parties}</b>parties</div><div><b>${s.victoires}</b>TOP 1</div><div><b>${s.kills}</b>élim.</div><div><b>${poss}/${total}</b>objets</div></div>`;
    $('#statsDetail').innerHTML = `<div class="chiffres"><div><b>${s.parties}</b>parties</div><div><b>${s.victoires}</b>TOP 1</div><div><b>${s.kills}</b>éliminations</div><div><b>${poss}/${total}</b>objets</div>
      <div><b>${precision} %</b>précision</div><div><b>${Math.round((s.temps || 0) / 60)} min</b>de jeu</div></div>
      <h3>🏅 Records</h3>
      <div class="chiffres petits"><div><b>${r.kills}</b>élim. en 1 partie</div><div><b>${r.degats}</b>dégâts</div><div><b>${r.place ? '#' + r.place : '—'}</b>meilleure place</div><div><b>${mmss(r.survie)}</b>survie</div></div>
      ${histo ? `<h3>🕘 Mes 10 dernières parties</h3><table class="histo">${histo}</table>` : ''}`;
    for (const el of document.querySelectorAll('#niveauEntete')) el.textContent = '⭐ ' + p.niveau;
  }

  // ---------- Cartes d'objets ----------
  carte(o, grand = false) {
    const r = RARETES_COSM[o.rarete];
    const d = document.createElement('button');
    d.className = 'carte r-' + o.rarete + (grand ? ' grande' : '') + (possede(this.profil, o) ? ' possede' : '');
    const cat = CATEGORIES.find(c => c.id === o.cat);
    const img = o.cat === 'trainee' ? imageTrainee(o.id) : '';
    const serie = collectionDe(o);
    d.innerHTML = `<div class="carte-img">${img ? `<img src="${img}" alt="">` : '<span class="charge">…</span>'}</div>${o.nouveau250 ? '<span class="pastille-nouv">NOUVEAU</span>' : ''}
      <div class="carte-bas"><span class="carte-cat">${cat.icone} ${cat.un}${serie ? ` · <span class="carte-serie">📦 ${echapper(serie.nom)}</span>` : ''}</span><b>${echapper(o.nom)}</b>
      ${possede(this.profil, o) ? '<span class="prix ok">✔ Possédé</span>' : !enVente(o) ? '<span class="prix">Pas en vente</span>' : this.textePrix(o)}</div>`;
    d.style.setProperty('--rarete', r.couleur);
    if (!img) this.chargerMiniature(d.querySelector('.carte-img'), o);
    return d;
  }

  // prix, avec l'ancien prix barré et la réduction quand une promotion de l'admin est en cours
  textePrix(o) {
    const p = promoDe(o);
    return p ? `<span class="prix promo"><s>${prixNormal(o)}</s> 🪙 ${prixDe(o)} <em>-${p.reduction} %</em></span>` : `<span class="prix">🪙 ${prixDe(o)}</span>`;
  }

  chargerMiniature(el, o) {
    // vignette livrée (rendu du vrai modèle) : rien à charger ni à dessiner en 3D ; si l'image manque, on revient à la miniature 3D
    const v = vignette(cleObjet(o));
    if (v && !el.dataset.sansVignette) {
      const img = new Image();
      img.alt = ''; img.loading = 'lazy'; img.className = 'vignette';
      img.onerror = () => { el.dataset.sansVignette = '1'; img.remove(); this.chargerMiniature(el, o); };
      img.src = v;
      el.replaceChildren(img);
      return;
    }
    // une miniature à la fois pour ne pas bloquer l'écran
    this.fileMini = this.fileMini || [];
    this.fileMini.push([el, o]);
    if (this.fileMini.length === 1) this.suivanteMini();
  }
  suivanteMini() {
    const [el, o] = this.fileMini[0] || [];
    if (!el) return;
    const file = this.fileMini;
    const pret = cosmetiquePret(cleObjet(o)) ? Promise.resolve() : chargerCosmetiques([cleObjet(o)]);
    pret.then(() => new Promise(r => setTimeout(r, 0))).then(() => {
      if (file !== this.fileMini) return; // la page a changé entre-temps
      try {
        const url = this.apercu.miniatureCosmetique(o, this.couleur);
        if (url) el.innerHTML = `<img src="${url}" alt="" loading="lazy">`;
      } catch (e) { console.warn(e); }
      this.fileMini.shift();
      this.suivanteMini();
    });
  }

  // Un objet des 250 : son modèle est chargé avant de l'essayer sur le personnage
  essayer(cadrage, look, emote) {
    this.montrerPerso(cadrage, look, emote);
  }

  // ---------- Collection d'esprits ----------
  dessinerEsprits() {
    const col = this.profil.collectionEsprits;
    const meilleures = meilleuresRaretes(col);
    const total = TYPES_ESPRITS.length * ORDRE_RARETES.length;
    $('#progresEsprits').textContent = `${new Set(col.map(e => e.type + ':' + e.rarete)).size} / ${total} esprits dans ta collection`;
    const g = $('#grilleEsprits');
    g.innerHTML = '';
    for (const t of TYPES_ESPRITS) {
      const d = ESPRITS[t], miens = col.filter(e => e.type === t);
      const b = document.createElement('button');
      b.className = 'carte-esprit-jeu' + (miens.length ? '' : ' inconnu') + (t === this.espritChoisi ? ' choisie' : '');
      b.style.setProperty('--couleur-esprit', d.couleur);
      if (meilleures[t]) b.style.setProperty('--couleur-rarete', RARETES_ESPRIT[meilleures[t]].couleur);
      // vignette livrée de l'esprit (rendu du vrai modèle, les 65 sont livrées) ; son émoji si l'image manque
      b.innerHTML = `<span class="ico"><img src="modeles/admin/vignettes/esprit/${t}.webp?v=1" alt="" loading="lazy"></span><b>${echapper(d.nom)}</b><small>${echapper(d.role)}</small><span class="raretes">${ORDRE_RARETES.map(r => {
        const e = miens.find(x => x.rarete === r);
        return `<i class="r-${r}${e ? ' a' : ''}" title="${RARETES_ESPRIT[r].nom}${e ? ' × ' + e.n : ' (pas encore)'}"></i>`;
      }).join('')}</span>`;
      { const img = b.querySelector('.ico img'); if (img) img.onerror = () => img.replaceWith(d.icone); }
      b.onclick = () => { this.son('clic'); this.choisirEsprit(t); };
      g.appendChild(b);
    }
    this.choisirEsprit(this.espritChoisi || TYPES_ESPRITS[0]);
  }
  choisirEsprit(t) {
    this.espritChoisi = t;
    for (const c of document.querySelectorAll('#grilleEsprits .carte-esprit-jeu')) c.classList.toggle('choisie', c.querySelector('b').textContent === ESPRITS[t].nom);
    const d = ESPRITS[t], p = PERSONNALITES[t];
    const miens = this.profil.collectionEsprits.filter(e => e.type === t);
    const meilleure = meilleuresRaretes(this.profil.collectionEsprits)[t] || null;
    this.apercu.montrerEsprit(t, meilleure);
    const perso = descriptionEsprit(t) || p.trait;
    const el = $('#ficheEsprit');
    el.innerHTML = `<span class="pastille-rarete" style="--r:${meilleure ? RARETES_ESPRIT[meilleure].couleur : '#5d6b85'}">${meilleure ? RARETES_ESPRIT[meilleure].nom : 'Pas encore dans ta collection'}</span>
      <h2>${d.icone} ${echapper(d.nom)}</h2><p class="petit-texte">Esprit de ${echapper(d.role.toLowerCase())} · <i>${echapper(perso)}</i></p>
      <p class="bulle-esprit" id="bulleEsprit">« ${echapper(replique(t, 'repos'))} »</p>
      <p><b>Passif :</b> ${echapper(d.passif)}</p><p><b>Pouvoir « ${echapper(d.pouvoir)} » :</b> ${echapper(d.descPouvoir)} <small>(recharge ${d.recharge} s)</small></p>
      <p class="petit-texte">⬆️ Pendant la partie, améliore-le sur un autel avec tes éclats d'esprit 💠 : ★★ ${PRIX_ECLATS[meilleure || 'commun'][0]} 💠 puis ★★★ ${PRIX_ECLATS[meilleure || 'commun'][1]} 💠 (prix ${meilleure ? 'd\'un esprit ' + RARETES_ESPRIT[meilleure].nom.toLowerCase() : 'd\'un esprit commun'} : plus il est rare, plus c'est cher). Ses bonus et son pouvoir deviennent plus forts, et son pouvoir recharge plus vite. Les éclats se trouvent dans les coffres et sur les joueurs éliminés, et tu les gardes d'une partie à l'autre.</p>
      <p class="petit-texte">${miens.length ? 'Dans ta collection : ' + miens.map(e => `${RARETES_ESPRIT[e.rarete].nom} × ${e.n}`).join(' · ') : 'Capture-le sur un autel pendant une partie, puis exporte-le sur un AUTRE autel (ou gagne la partie) : il arrive dans ta boîte 🎁 avec sa rareté. Les cargaisons en donnent aussi, souvent plus rares.'}</p>
      <div class="boutons-esprit"><button class="petit" data-a="obtention">🎉 Arrivée</button><button class="petit" data-a="content">😊 Caresser</button><button class="petit" data-a="activer">✨ Pouvoir</button><button class="petit" data-a="surpris">😮 Surprise</button></div>`;
    for (const b of el.querySelectorAll('[data-a]')) b.onclick = () => {
      this.apercu.animerEspritApercu(b.dataset.a);
      this.son(sonEsprit(t));
      if (b.dataset.a !== 'surpris' && meilleure && meilleure !== 'commun') setTimeout(() => this.son('esprit_rare'), 250);
      $('#bulleEsprit').textContent = '« ' + replique(t, b.dataset.a === 'activer' ? 'pouvoir' : b.dataset.a === 'content' || b.dataset.a === 'obtention' ? 'capture' : 'repos') + ' »';
    };
  }

  // ---------- Filtres (catalogue de la Boutique et Casier) ----------
  initFiltres() {
    const remplir = (sel, options) => { for (const [v, t] of options) { const o = document.createElement('option'); o.value = v; o.textContent = t; sel.appendChild(o); } };
    const series = collectionsVisibles().map(c => [String(c.n), '📦 ' + c.nom]);
    const raretes = Object.entries(RARETES_COSM).filter(([k]) => k !== 'staff').map(([k, r]) => [k, r.nom]);
    remplir($('#filtreCat'), CATEGORIES.map(c => [c.id, c.icone + ' ' + c.nom]));
    remplir($('#filtreRarete'), raretes); remplir($('#filtreSerie'), series);
    remplir($('#casierRarete'), raretes); remplir($('#casierSerie'), series);
    const surCatalogue = () => { this.pageCatalogue = 0; this.dessinerCatalogue(); };
    let attente = null;
    $('#filtreTexte').addEventListener('input', e => { clearTimeout(attente); attente = setTimeout(() => { this.filtres.texte = e.target.value.trim().toLowerCase(); surCatalogue(); }, 200); });
    for (const [id, cle] of [['#filtreCat', 'cat'], ['#filtreRarete', 'rarete'], ['#filtreSerie', 'serie'], ['#filtrePossede', 'possede']]) $(id).onchange = e => { this.filtres[cle] = e.target.value; surCatalogue(); };
    $('#catPrec').onclick = () => { this.pageCatalogue = Math.max(0, this.pageCatalogue - 1); this.dessinerCatalogue(); };
    $('#catSuiv').onclick = () => { this.pageCatalogue++; this.dessinerCatalogue(); };
    let attenteC = null;
    $('#casierTexte').addEventListener('input', e => { clearTimeout(attenteC); attenteC = setTimeout(() => { this.filtresCasier.texte = e.target.value.trim().toLowerCase(); this.dessinerCasier(); }, 200); });
    $('#casierRarete').onchange = e => { this.filtresCasier.rarete = e.target.value; this.dessinerCasier(); };
    $('#casierSerie').onchange = e => { this.filtresCasier.serie = e.target.value; this.dessinerCasier(); };
    $('#casierMes').onchange = e => { this.filtresCasier.mes = e.target.checked; this.dessinerCasier(); };
  }
  passeFiltre(o, f) {
    if (f.texte && !(o.nom.toLowerCase().includes(f.texte) || (o.desc || '').toLowerCase().includes(f.texte) || (collectionDe(o)?.nom || '').toLowerCase().includes(f.texte))) return false;
    if (f.cat && o.cat !== f.cat) return false;
    if (f.rarete && o.rarete !== f.rarete) return false;
    if (f.serie && String(o.serie || '') !== f.serie) return false;
    if (f.possede === 'oui' && !possede(this.profil, o)) return false;
    if (f.possede === 'non' && possede(this.profil, o)) return false;
    return true;
  }

  // Tout le catalogue en vente (tous les objets disponibles, filtrés, par pages de 24)
  dessinerCatalogue() {
    const ordre = { commun: 0, rare: 1, epique: 2, legendaire: 3, collab: 4, staff: 5 };
    const liste = CATALOGUE.filter(o => !o.gratuit && (enVente(o) || possede(this.profil, o)) && this.passeFiltre(o, this.filtres))
      .sort((a, b) => (b.nouveau250 ? 1 : 0) - (a.nouveau250 ? 1 : 0) || ordre[a.rarete] - ordre[b.rarete] || a.nom.localeCompare(b.nom));
    const parPage = 24, pages = Math.max(1, Math.ceil(liste.length / parPage));
    this.pageCatalogue = Math.min(this.pageCatalogue, pages - 1);
    const g = $('#grilleCatalogue');
    g.innerHTML = '';
    for (const o of liste.slice(this.pageCatalogue * parPage, (this.pageCatalogue + 1) * parPage)) { const c = this.carte(o); c.onclick = () => this.choisirBoutique(o); g.appendChild(c); }
    $('#videCatalogue').classList.toggle('cache', liste.length > 0);
    $('#infoCatalogue').textContent = `${liste.length} objet${liste.length > 1 ? 's' : ''} · page ${this.pageCatalogue + 1} / ${pages}`;
    $('#catPrec').disabled = this.pageCatalogue <= 0;
    $('#catSuiv').disabled = this.pageCatalogue + 1 >= pages;
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
    this.dessinerCatalogue();
    this.choisirBoutique(this.selection && [...COLLAB, ...b.vedettes, ...b.quotidiens].includes(this.selection) ? this.selection : COLLAB[1]);
  }

  cadragePour(o) {
    return { chapeau: 'tete', dos: 'dos', deltaplane: 'delta', pioche: 'pioche', arme: 'arme' }[o.cat] || 'corps';
  }

  choisirBoutique(o) {
    this.selection = o;
    for (const c of document.querySelectorAll('#pageBoutique .carte')) c.classList.toggle('choisie', c.querySelector('b').textContent === o.nom);
    this.apercu.monter($('#sceneBoutique'));
    const essai = { ...this.profil.equipe, [o.cat]: o.id };
    this.essayer(this.cadragePour(o), essai, o.cat === 'emote' ? o.id : null);
    this.infosObjet($('#ficheInfos'), o, true);
  }

  infosObjet(el, o, boutique) {
    const r = RARETES_COSM[o.rarete];
    const a = possede(this.profil, o);
    const equipe = this.profil.equipe[o.cat] === o.id;
    const prix = prixDe(o);
    let bouton;
    const promo = promoDe(o);
    if (a) bouton = equipe ? '<button class="gros gris" disabled>✔ Équipé</button>' : '<button class="gros bleu" id="btnEquiper">Équiper</button>';
    else if (!enVente(o)) bouton = '<button class="gros gris" disabled>Pas en vente pour le moment</button>';
    else if (this.profil.pieces >= prix) bouton = `<button class="gros jaune" id="btnAcheter">Acheter · 🪙 ${prix}${promo ? ` <small>(-${promo.reduction} % · ${echapper(promo.nom)})</small>` : ''}</button>`;
    else bouton = `<button class="gros gris" disabled>Il te manque 🪙 ${prix - this.profil.pieces}</button>`;
    const astuce = o.cat === 'emote' ? '<p class="petit-texte">En jeu, appuie sur <kbd>B</kbd> pour faire ton émote.</p>'
      : o.cat === 'trainee' ? '<p class="petit-texte">Elle apparaît derrière toi quand tu sautes du dirigeable.</p>' : '';
    const serie = collectionDe(o);
    let ligneSerie = '';
    if (serie) {
      const membres = CATALOGUE.filter(x => x.serie === serie.n);
      ligneSerie = `<p class="ligne-serie">📦 Collection <b>${echapper(serie.nom)}</b> · ${membres.filter(x => possede(this.profil, x)).length}/${membres.length} en vente possédés</p>`;
    }
    if (a && equipe && !estDeBase(o)) bouton += '<button class="gros gris" id="btnDesequiper">Déséquiper</button>';
    el.innerHTML = `<span class="badge" style="--rarete:${r.couleur}">${r.nom}</span>
      <h2>${echapper(o.nom)}</h2><p>${echapper(o.desc)}</p>${ligneSerie}${astuce}${bouton}`;
    const bd = el.querySelector('#btnDesequiper');
    if (bd) bd.onclick = () => {
      if (!desequiper(this.profil, o.cat)) return;
      this.son('clic'); toast(`${o.nom} déséquipé`); this.surLook();
      if (boutique) this.choisirBoutique(o); else this.dessinerCasier();
    };
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
    const tous = CATALOGUE.filter(o => o.cat === this.categorie && (!o.reserve || possede(this.profil, o))); // Tenue Staff : visible seulement si on l'a
    const f = this.filtresCasier;
    const liste = tous.filter(o => this.passeFiltre(o, { texte: f.texte, rarete: f.rarete, serie: f.serie, possede: f.mes ? 'oui' : '' }));
    const ordre = { commun: 0, rare: 1, epique: 2, legendaire: 3, collab: 4, staff: 5 };
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
        this.essayer(this.cadragePour(o), { ...this.profil.equipe, [o.cat]: o.id }, o.cat === 'emote' ? o.id : null);
        this.infosObjet($('#casierInfos'), o, false);
        if (possede(this.profil, o) && this.profil.equipe[o.cat] !== o.id) { this.equiper(o); if (o.cat === 'tenue') this.apercu.presenter(); c.classList.add('equipe'); for (const x of g.children) if (x !== c) x.classList.remove('equipe'); this.infosObjet($('#casierInfos'), o, false); }
      };
      g.appendChild(c);
    }
    const eq = objet(this.categorie, this.profil.equipe[this.categorie]) || objet(this.categorie, LOOK_DEFAUT[this.categorie]);
    this.apercu.monter($('#sceneCasier'));
    this.essayer(this.cadragePour(eq), this.profil.equipe, eq.cat === 'emote' ? eq.id : null);
    this.infosObjet($('#casierInfos'), eq, false);
    const poss = tous.filter(o => possede(this.profil, o)).length;
    $('#titreCasier').textContent = `${CATEGORIES.find(c => c.id === this.categorie).nom} · ${poss}/${tous.length}`;
    $('#videCasier').classList.toggle('cache', liste.length > 0);
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
