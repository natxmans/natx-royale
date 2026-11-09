// Le "cerveau" de la partie : tourne chez celui qui héberge (ou en solo).
// Il décide des dégâts, des constructions, du butin, de la zone et fait jouer les bots.
import { hasard, angleVers, arrondi, borner } from './outils.js';
import { OBJETS, RARETES, tirerButin, LISTE_ARMES, butinRavitaillement } from './armes.js';
import { rayonBoite, DEMI } from './monde.js';
import { creerPlanZone, etatZone, creerDirigeable, posDirigeable, cibleConstruction, PV_CONSTR, memeEquipe, posRavito } from './partage.js';
import { nettoyerLook, lookAuHasard } from './boutique.js';

const NOMS_BOTS = ['Patate', 'Croquette', 'Tartiflette', 'Grumeau', 'Moustache', 'Biscotte', 'Pépito', 'Cornichon',
  'Raclette', 'Chaussette', 'Gaufrette', 'Nougat', 'Saucisson', 'Crumble', 'Pistache', 'Bretzel', 'Kiwi', 'Radis',
  'Brioche', 'Panda', 'Flan', 'Navet', 'Clafoutis', 'Mammouth', 'Pingouin', 'Tofu', 'Cookie', 'Hérisson', 'Bigoudi', 'Pruneau'];
const COULEURS_BOTS = ['#e74c3c', '#e67e22', '#f1c40f', '#2ecc71', '#1abc9c', '#3498db', '#9b59b6', '#e84393', '#95a5a6', '#6c5ce7', '#00cec9', '#fd79a8'];
const ERREUR_BOTS = [0.1, 0.055, 0.025];
const VALEUR_ARME = { pistolet: 1, smg: 2, pompe: 2.6, fusil: 3, sniper: 2.4 };
const valeurArme = a => (VALEUR_ARME[a.objet] || 0) + (a.rarete || 0) * 0.8;
const propre = (t, max) => String(t || '').replace(/[\u0000-\u001f<>]/g, '').trim().slice(0, max);

export class Hote {
  constructor(reseau, jeu) {
    this.reseau = reseau;
    this.jeu = jeu;
    this.salon = new Map();
    this.options = { bots: 12, difficulte: 1, mode: 'solo', vitesseZone: 'normale', matsDepart: 0, fete: false, entrainement: false };
    this.chatT = new Map();
    this.enCours = false;
    this.joueurs = new Map();
    reseau.surMessageHote = (de, m) => this.recevoir(de, m);
    reseau.surDepart = id => this.depart(id);
  }

  diffuserSalon() {
    this.reseau.diffuser({
      t: 'salon', code: this.reseau.code, enCours: this.enCours, options: this.options,
      joueurs: [...this.salon.values()],
    });
  }

  depart(id) {
    const p = this.salon.get(id);
    this.salon.delete(id);
    if (this.enCours) {
      const j = this.joueurs.get(id);
      if (j && j.vivant) this.eliminer(id, null, 'deconnexion');
      if (p) this.reseau.diffuser({ t: 'info', texte: p.nom + ' a quitté la partie' });
    }
    this.diffuserSalon();
  }

  recevoir(de, m) {
    if (!m || typeof m !== 'object') return;
    if (m.t === 'bonjour') {
      let nom = propre(m.nom, 16) || 'Joueur';
      // deux joueurs avec le même pseudo : on ajoute un numéro
      const pris = new Set([...this.salon.values()].filter(p => p.id !== de).map(p => p.nom));
      if (pris.has(nom)) { let k = 2; while (pris.has(nom.slice(0, 13) + ' ' + k)) k++; nom = nom.slice(0, 13) + ' ' + k; }
      this.salon.set(de, { id: de, nom, couleur: /^#[0-9a-f]{6}$/i.test(m.couleur) ? m.couleur : '#3498db', hote: de === this.reseau.monId, look: nettoyerLook(m.look) });
      this.reseau.envoyerA(de, { t: 'bienvenue', id: de, enCours: this.enCours });
      this.diffuserSalon();
      return;
    }
    if (m.t === 'look') {
      const p = this.salon.get(de);
      if (p) { p.look = nettoyerLook(m.look); if (/^#[0-9a-f]{6}$/i.test(m.couleur)) p.couleur = m.couleur; this.diffuserSalon(); }
      return;
    }
    if (m.t === 'ping') { this.reseau.envoyerA(de, { t: 'pong', c: +m.c || 0 }); return; }
    if (m.t === 'chat') {
      const p = this.salon.get(de);
      const texte = propre(m.texte, 80);
      const maintenant = performance.now();
      if (!p || !texte || maintenant - (this.chatT.get(de) || 0) < 600) return;
      this.chatT.set(de, maintenant);
      this.reseau.diffuser({ t: 'chat', id: de, nom: p.nom, couleur: p.couleur, texte, rapide: !!m.rapide });
      return;
    }
    if (m.t === 'exclure') {
      // seul l'hôte peut exclure quelqu'un
      if (de !== this.reseau.monId || m.id === this.reseau.monId || !this.salon.has(m.id)) return;
      const p = this.salon.get(m.id);
      this.reseau.exclure(m.id);
      this.depart(m.id);
      this.reseau.diffuser({ t: 'info', texte: p.nom + ' a été exclu' });
      return;
    }
    if (!this.enCours) return;
    const j = this.joueurs.get(de);
    switch (m.t) {
      case 'etat':
        if (j && j.vivant) {
          j.x = +m.x || 0; j.y = +m.y || 0; j.z = +m.z || 0; j.ry = +m.ry || 0; j.rx = +m.rx || 0;
          j.f = m.f | 0; j.a = String(m.a || ''); j.ph = String(m.ph || 'sol'); j.em = String(m.em || '').slice(0, 20);
        }
        break;
      case 'touche':
        if (j && j.vivant) this.blesser(m.cible, borner(+m.deg || 0, 0, 260), de, m.arme, m.tete);
        break;
      case 'explosion': {
        // un explosif à la fois, pas trop loin du lanceur
        if (!j || !j.vivant || !OBJETS[m.arme] || !OBJETS[m.arme].rayon) break;
        if (this.temps - (j.boumT ?? -9) < 0.5) break;
        const x = +m.x || 0, y = +m.y || 0, z = +m.z || 0;
        if (Math.hypot(x - j.x, z - j.z) > 400) break;
        j.boumT = this.temps;
        this.exploser(de, x, y, z, m.arme);
        break;
      }
      case 'projectile':
        if (j && j.vivant && Array.isArray(m.o) && Array.isArray(m.v)) this.reseau.diffuser({ t: 'projectile', type: m.type === 'grenade' ? 'grenade' : 'roquette', o: m.o.slice(0, 3).map(Number), v: m.v.slice(0, 3).map(Number), duree: borner(+m.duree || 0, 0, 10), par: de });
        break;
      case 'chute':
        if (j && j.vivant) this.blesser(de, borner(+m.deg || 0, 0, 100), null, 'chute');
        break;
      case 'ouvrirRavito': this.ouvrirRavito(de, m.id | 0); break;
      case 'degatsConstr': this.abimer(m.cle, borner(+m.deg || 0, 0, 300)); break;
      case 'construire': if (j && j.vivant) this.construire(de, m); break;
      case 'recolte': this.recolter(m.type, m.id | 0, +m.deg || 0); break;
      case 'ramasser': {
        const b = this.butins.get(m.id);
        if (!b || !j || !j.vivant) break;
        // l'hôte vérifie que le joueur est vraiment à côté (anti-triche)
        if (Math.hypot(b.x - j.x, b.z - j.z) > 4.5 || Math.abs(b.y - j.y) > 3.5) break;
        this.butins.delete(m.id);
        this.reseau.diffuser({ t: 'butin-', id: m.id, par: de, b });
        break;
      }
      case 'ouvrir': {
        const c = this.monde.coffres[m.id | 0];
        if (j && j.vivant && c && Math.hypot(c.x - j.x, c.z - j.z) < 5 && Math.abs(c.y - j.y) < 3.5) this.ouvrirCoffre(m.id | 0);
        break;
      }
      case 'jeter':
        for (const it of (m.objets || []).slice(0, 8)) {
          if (!OBJETS[it.objet]) continue;
          const a = Math.random() * 6.28, d = m.objets.length > 1 ? 0.6 + Math.random() * 1.2 : 0.8;
          this.creerButin({ objet: it.objet, rarete: it.rarete | 0, qte: it.qte | 0, mun: it.mun | 0 }, +m.x + Math.cos(a) * d, +m.y + 0.1, +m.z + Math.sin(a) * d);
        }
        break;
      case 'soin':
        if (j && j.vivant) {
          const plafond = borner(+m.plafond || 100, 0, 100);
          if (m.pv && j.pv < plafond) j.pv = Math.min(plafond, j.pv + borner(+m.pv, 0, 100));
          if (m.b && j.bouclier < plafond) j.bouclier = Math.min(plafond, j.bouclier + borner(+m.b, 0, 100));
          this.reseau.diffuser({ t: 'pv', id: de, pv: j.pv, b: j.bouclier });
        }
        break;
      case 'tir':
        this.reseau.diffuser({ t: 'tir', o: m.o, d: m.d, a: m.a, par: de });
        break;
    }
  }

  // ---------- Début de partie ----------
  demarrer() {
    const graine = Math.floor(Math.random() * 1e9);
    // identifiant de la partie (relié aux avis envoyés à la fin)
    this.partieId = Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
    const monde = this.jeu.preparerMonde(graine);
    this.monde = monde;
    const r = hasard(graine ^ 0x5bd1e995);
    this.r = r;
    this.joueurs.clear();
    let n = 0;
    const duo = this.options.mode === 'duo';
    const equipeDe = k => (duo ? 1 + Math.floor(k / 2) : 0);
    for (const p of this.salon.values()) {
      const j = this.nouveauJoueur(p.id, p.nom, p.couleur, false, n); j.look = p.look; j.equipe = equipeDe(n); n++; this.joueurs.set(p.id, j);
    }
    const noms = NOMS_BOTS.slice().sort(() => Math.random() - 0.5);
    for (let k = 0; k < this.options.bots; k++) {
      const id = 'bot' + k;
      const b = this.nouveauJoueur(id, 'Bot ' + noms[k % noms.length], COULEURS_BOTS[k % COULEURS_BOTS.length], true, n);
      b.look = lookAuHasard(); b.equipe = equipeDe(n); n++;
      this.joueurs.set(id, b);
    }
    this.nbUnites = new Set([...this.joueurs.values()].map(j => (j.equipe ? 'e' + j.equipe : j.id))).size;
    this.butins = new Map(); this.prochainButin = 1;
    const listeButins = [];
    const fete = !!this.options.fete;
    for (const pt of monde.pointsButin) {
      if (pt.bonus || fete || r() < 0.75) listeButins.push(this.creerButin(tirerButin(r, !!pt.bonus, fete), pt.x, pt.y, pt.z, false));
    }
    this.dirigeable = creerDirigeable(r);
    this.zone = creerPlanZone(r, monde, this.options);
    this.ravitos = new Map(); this.prochainRavito = 1;
    this.planRavitos = this.options.entrainement ? [25, 90, 160] : [70, 165, 260].map(t => t * ({ lente: 1.45, rapide: 0.62 }[this.options.vitesseZone] || 1));
    this.soinT = 0;
    this.constrPV = new Map();
    this.arbresPV = new Map(); this.rochersPV = new Map();
    this.coffresOuverts = new Set();
    this.temps = 0; this.envoiT = 0; this.zoneT = 0;
    this.enCours = true; this.fini = false;
    // Les bots : où et quand ils sautent, et leur arme
    const lieux = monde.lieux;
    for (const b of this.joueurs.values()) {
      if (!b.bot) continue;
      b.sautT = 3 + r() * (this.dirigeable.duree - 6);
      const l = lieux.length && r() < 0.6 ? lieux[Math.floor(r() * lieux.length)] : null;
      b.dest = l ? { x: l.x + (r() - 0.5) * 40, z: l.z + (r() - 0.5) * 40 } : this.pointTerre(r, 0, 0, DEMI * 0.7);
      const objet = LISTE_ARMES[Math.floor(r() * LISTE_ARMES.length)];
      b.arme = { objet, rarete: Math.floor(r() * 3) };
      b.mun = OBJETS[objet].chargeur; b.mats = 120 + this.options.difficulte * 60;
      b.soins = r() < 0.5 ? 1 : 0; b.gourdes = r() < 0.4 ? 1 : 0;
    }
    const o = this.options;
    this.reseau.diffuser({
      t: 'debut', graine, partieId: this.partieId, dirigeable: this.dirigeable, zone: this.zone, difficulte: o.difficulte,
      options: { mode: o.mode, entrainement: !!o.entrainement, matsDepart: o.entrainement ? 999 : o.matsDepart | 0, fete: !!o.fete, vitesseZone: o.vitesseZone },
      joueurs: [...this.joueurs.values()].map(j => ({ id: j.id, nom: j.nom, couleur: j.couleur, bot: j.bot, n: j.n, look: j.look, equipe: j.equipe })),
      butins: listeButins,
    });
    this.diffuserSalon();
  }

  nouveauJoueur(id, nom, couleur, bot, n) {
    return {
      id, nom, couleur, bot, n, vivant: true, pv: 100, bouclier: 0, kills: 0,
      x: 0, y: 112, z: 0, ry: 0, rx: 0, f: 0, a: '', ph: 'dirigeable', em: '',
      vx: 0, vy: 0, vz: 0, auSol: false,
      tirT: 0, rechargeT: 0, vueT: Math.random(), strafe: 1, strafeT: 0, bloqueT: 0, px: 0, pz: 0, detourT: 0, coince: 0, constrT: 0, destT: 20,
    };
  }

  pointTerre(r, cx, cz, rayon) {
    for (let k = 0; k < 30; k++) {
      const a = r() * Math.PI * 2, d = Math.sqrt(r()) * rayon;
      const x = cx + Math.cos(a) * d, z = cz + Math.sin(a) * d;
      if (this.monde.hauteurTerrain(x, z) > 1.5) return { x, z };
    }
    return { x: cx, z: cz };
  }

  creerButin(item, x, y, z, envoyer = true) {
    const b = { id: this.prochainButin++, objet: item.objet, rarete: item.rarete | 0, qte: item.qte | 0, mun: item.mun | 0, x: arrondi(x), y: arrondi(y), z: arrondi(z) };
    this.butins.set(b.id, b);
    if (envoyer) this.reseau.diffuser({ t: 'butin+', b });
    return b;
  }

  ouvrirCoffre(id) {
    const c = this.monde.coffres[id];
    if (!c || this.coffresOuverts.has(id)) return;
    this.coffresOuverts.add(id);
    this.reseau.diffuser({ t: 'coffreX', id });
    const r = Math.random, fete = !!this.options.fete;
    const items = [tirerButin(r, true, fete), r() < 0.5 ? { objet: 'munitions', qte: 40 } : tirerButin(r, true, fete), { objet: 'materiaux', qte: 30 }];
    // coffre doré : une arme épique ou légendaire en plus
    if (c.dore) {
      let a = tirerButin(r, true, true);
      for (let k = 0; k < 6 && OBJETS[a.objet].type !== 'arme'; k++) a = tirerButin(r, true, true);
      if (OBJETS[a.objet].type === 'arme') a.rarete = Math.max(3, a.rarete);
      items.unshift(a);
    }
    this.eparpiller(items, c.x, c.y, c.z, c.rot);
  }

  // Les objets sortent en arc de cercle devant le coffre / la caisse
  eparpiller(items, x, y, z, rot = Math.random() * 6.28) {
    items.forEach((it, n) => {
      const a = rot + (n - (items.length - 1) / 2) * 0.75;
      this.creerButin(it, x - Math.sin(a) * 1.4, y + 0.1, z - Math.cos(a) * 1.4);
    });
  }

  // ---------- Ravitaillements ----------
  lancerRavito() {
    const z = etatZone(this.zone, this.temps);
    const p = this.pointTerre(Math.random, z.cx, z.cz, Math.max(15, Math.min(z.cr, DEMI) * 0.6));
    const h = this.monde.lancerRayon(p.x, 160, p.z, 0, -1, 0, 320);
    const sol = h ? h.y : this.monde.hauteurTerrain(p.x, p.z);
    const rv = { id: this.prochainRavito++, x: arrondi(p.x), z: arrondi(p.z), sol: arrondi(sol), y0: 150, t0: arrondi(this.temps), ouvert: false };
    this.ravitos.set(rv.id, rv);
    this.reseau.diffuser({ t: 'ravito+', r: rv });
  }
  ouvrirRavito(de, id) {
    const rv = this.ravitos.get(id);
    const j = this.joueurs.get(de);
    if (!rv || rv.ouvert || !j || !j.vivant) return;
    if (!posRavito(rv, this.temps).pose || Math.hypot(j.x - rv.x, j.z - rv.z) > 5) return;
    rv.ouvert = true;
    this.reseau.diffuser({ t: 'ravitoX', id });
    this.eparpiller(butinRavitaillement(Math.random), rv.x, rv.sol, rv.z);
  }

  // ---------- Explosions (roquettes, grenades) ----------
  exploser(auteur, x, y, z, arme) {
    const def = OBJETS[arme];
    const R = def.rayon, M = this.monde;
    const a = this.joueurs.get(auteur);
    this.reseau.diffuser({ t: 'boum', x: arrondi(x), y: arrondi(y), z: arrondi(z), r: R, a: arme, par: auteur });
    for (const j of this.joueurs.values()) {
      if (!j.vivant || j.ph === 'dirigeable' || j.id === auteur || memeEquipe(a, j)) continue;
      const cy = j.y + 0.9, d = Math.hypot(j.x - x, cy - y, j.z - z);
      if (d > R + 0.5) continue;
      // à l'abri derrière un mur ou une colline : rien
      const L = Math.max(0.01, d), dx = (j.x - x) / L, dy = (cy - y) / L, dz = (j.z - z) / L;
      const h = M.lancerRayon(x - dx * 0.2, y - dy * 0.2, z - dz * 0.2, dx, dy, dz, L);
      if (h && h.t < L - 0.6) continue;
      this.blesser(j.id, def.degats * (1 - Math.max(0, d - 1) / (R + 0.5) * 0.65), auteur, arme, false);
    }
    // les constructions proches cassent
    for (const cle of [...this.constrPV.keys()]) {
      const c = M.constructions.get(cle);
      if (!c || !c.mesh) continue;
      const q = c.mesh.position, d = Math.hypot(q.x - x, q.y - y, q.z - z);
      if (d < R + 2) this.abimer(cle, 120 + 380 * (1 - d / (R + 2)));
    }
  }

  recolter(type, id, deg) {
    if (type === 'arbre') {
      const a = this.monde.arbres[id]; if (!a || !a.vivant) return;
      const pv = (this.arbresPV.get(id) ?? 100) - deg;
      this.arbresPV.set(id, pv);
      if (pv <= 0) this.reseau.diffuser({ t: 'arbreX', id });
    } else if (type === 'rocher') {
      const ro = this.monde.rochers[id]; if (!ro || !ro.vivant) return;
      const pv = (this.rochersPV.get(id) ?? 150) - deg;
      this.rochersPV.set(id, pv);
      if (pv <= 0) this.reseau.diffuser({ t: 'rocherX', id });
    }
  }

  construire(de, m) {
    if (typeof m.cle !== 'string' || this.constrPV.has(m.cle) || !PV_CONSTR[m.type]) {
      this.reseau.envoyerA(de, { t: 'refusConstr', cle: m.cle });
      return false;
    }
    const pv = PV_CONSTR[m.type];
    this.constrPV.set(m.cle, pv);
    this.reseau.diffuser({ t: 'constr', c: { cle: m.cle, type: m.type, axe: m.axe, i: m.i | 0, j: m.j | 0, k: m.k | 0, d: m.d | 0, pv }, par: de });
    return true;
  }

  abimer(cle, deg) {
    let pv = this.constrPV.get(cle);
    if (pv === undefined) return;
    pv -= deg;
    if (pv <= 0) { this.constrPV.delete(cle); this.reseau.diffuser({ t: 'constrX', cle }); }
    else { this.constrPV.set(cle, pv); this.reseau.diffuser({ t: 'constrPV', cle, pv }); }
  }

  blesser(id, deg, auteur, arme, tete) {
    const j = this.joueurs.get(id);
    if (!j || !j.vivant || j.ph === 'dirigeable' || this.fini) return;
    // pas de tir ami entre coéquipiers
    if (auteur && auteur !== id && memeEquipe(this.joueurs.get(auteur), j)) return;
    deg = Math.round(deg);
    if (deg <= 0) return;
    let reste = deg;
    const avaitBouclier = j.bouclier > 0;
    if (j.bouclier > 0) { const a = Math.min(j.bouclier, reste); j.bouclier -= a; reste -= a; }
    j.pv -= reste;
    this.reseau.diffuser({
      t: 'pv', id, pv: Math.max(0, j.pv), b: j.bouclier, de: auteur, deg, tete: !!tete,
      x: arrondi(j.x), y: arrondi(j.y), z: arrondi(j.z), casse: avaitBouclier && j.bouclier <= 0,
    });
    if (j.bot && auteur && auteur !== id) this.reactionBot(j, auteur);
    if (j.pv <= 0) this.eliminer(id, auteur, arme);
  }

  eliminer(id, auteur, arme) {
    const j = this.joueurs.get(id);
    if (!j || !j.vivant) return;
    j.vivant = false; j.pv = 0;
    let vivants = 0;
    for (const p of this.joueurs.values()) if (p.vivant) vivants++;
    const k = auteur && auteur !== id ? this.joueurs.get(auteur) : null;
    if (k) {
      k.kills++;
      if (k.bot && Math.random() < 0.6) { k.emT = 2.5; k.em = (k.look && k.look.emote) || 'salut'; }
    }
    const dist = k ? Math.round(Math.hypot(k.x - j.x, k.y - j.y, k.z - j.z)) : 0;
    this.reseau.diffuser({ t: 'elim', v: id, k: k ? auteur : null, a: arme || '', place: vivants + 1, vivants, kills: k ? k.kills : 0, dist });
    if (j.bot) {
      const items = [{ objet: j.arme.objet, rarete: j.arme.rarete, mun: OBJETS[j.arme.objet].chargeur }, { objet: 'munitions', qte: 30 }];
      if (j.mats > 0) items.push({ objet: 'materiaux', qte: j.mats });
      if (j.soins > 0 || Math.random() < 0.4) items.push({ objet: 'soin', rarete: 1, qte: Math.max(1, j.soins || 0) });
      if (j.gourdes > 0) items.push({ objet: 'minigourde', rarete: 2, qte: j.gourdes * 2 });
      this.eparpiller(items, j.x, j.y, j.z);
    }
  }

  // ---------- Boucle (appelée à chaque image chez l'hôte) ----------
  tick(dt) {
    if (!this.enCours) return;
    dt = Math.min(dt, 0.1);
    this.temps += dt;
    for (const j of this.joueurs.values()) if (j.bot && j.vivant) this.majBot(j, dt);
    // Ravitaillements qui tombent du ciel
    while (this.planRavitos.length && this.temps >= this.planRavitos[0]) { this.planRavitos.shift(); this.lancerRavito(); }
    // Fontaines de soin : +3 PV toutes les demi-secondes
    this.soinT += dt;
    if (this.soinT >= 0.5) {
      this.soinT = 0;
      for (const j of this.joueurs.values()) {
        if (!j.vivant || j.pv >= 100 || j.ph !== 'sol') continue;
        for (const so of this.monde.sources || []) {
          if (Math.hypot(j.x - so.x, j.z - so.z) < 1.9 && Math.abs(j.y - so.y) < 1.6) {
            j.pv = Math.min(100, j.pv + 3);
            this.reseau.diffuser({ t: 'pv', id: j.id, pv: j.pv, b: j.bouclier, fontaine: true });
            break;
          }
        }
      }
    }

    // Dégâts de la zone, une fois par seconde
    this.zoneT += dt;
    if (this.zoneT >= 1) {
      this.zoneT -= 1;
      const z = etatZone(this.zone, this.temps);
      for (const j of this.joueurs.values()) {
        if (!j.vivant || j.ph === 'dirigeable') continue;
        if (Math.hypot(j.x - z.x, j.z - z.z) > z.r) this.blesser(j.id, z.deg, null, 'zone');
      }
    }

    // Victoire ?
    if (!this.fini && this.temps > 3) {
      const vivants = [...this.joueurs.values()].filter(j => j.vivant);
      const unites = new Set(vivants.map(j => (j.equipe ? 'e' + j.equipe : j.id)));
      const seuil = this.nbUnites > 1 ? 1 : 0;
      if (unites.size <= seuil) {
        this.fini = true;
        const g = vivants[0];
        this.reseau.diffuser({ t: 'fin', gagnant: g ? g.id : null, nom: g ? g.nom : null, kills: g ? g.kills : 0, equipe: g ? g.equipe : 0, gagnants: vivants.map(v => v.id) });
      }
    }

    // Photo de la partie envoyée 20 fois par seconde
    this.envoiT += dt;
    if (this.envoiT >= 0.05) {
      this.envoiT = 0;
      const liste = [];
      for (const j of this.joueurs.values()) {
        if (!j.vivant) continue;
        liste.push([j.id, arrondi(j.x), arrondi(j.y), arrondi(j.z), arrondi(j.ry), arrondi(j.rx), j.f, j.a, j.ph, j.em || '']);
      }
      this.reseau.diffuser({ t: 'snap', tm: arrondi(this.temps), j: liste });
    }
  }

  // ---------- Intelligence des bots ----------
  majBot(b, dt) {
    const M = this.monde;
    if (b.ph === 'dirigeable') {
      const p = posDirigeable(this.dirigeable, this.temps);
      b.x = p.x; b.y = p.y - 4; b.z = p.z;
      if (this.temps >= b.sautT || this.temps >= this.dirigeable.duree) { b.ph = 'chute'; b.vy = 0; }
      return;
    }
    if (b.ph === 'chute' || b.ph === 'planeur') {
      const dx = b.dest.x - b.x, dz = b.dest.z - b.z, d = Math.hypot(dx, dz) || 1;
      const vh = (b.ph === 'chute' ? 18 : 13) * Math.min(1, d / 8);
      b.vx = dx / d * vh; b.vz = dz / d * vh;
      b.ry = angleVers(b.ry, Math.atan2(-dx, -dz), Math.min(1, dt * 3));
      if (b.ph === 'chute') {
        b.vy = Math.max(b.vy - 30 * dt, -40);
        if (b.y - M.hauteurTerrain(b.x, b.z) < 42) b.ph = 'planeur';
      } else b.vy = -7;
      M.deplacer(b, dt);
      if (b.auSol) { b.ph = 'sol'; b.vx = b.vz = 0; }
      b.a = b.arme.objet + ':' + b.arme.rarete;
      b.f = b.auSol ? 1 : 0;
      return;
    }

    // Au sol : en train de se soigner (immobile)
    if (b.soinT > 0) {
      b.soinT -= dt;
      b.vx = b.vz = 0; b.vy -= 25 * dt;
      M.deplacer(b, dt);
      b.f = 1 | 8;
      if (b.soinT <= 0) {
        if (b.soinType === 'soin') { b.soins--; b.pv = Math.min(100, b.pv + 40); } else { b.gourdes--; b.bouclier = Math.min(100, b.bouclier + 50); }
        b.a = b.arme.objet + ':' + b.arme.rarete;
        this.reseau.diffuser({ t: 'pv', id: b.id, pv: b.pv, b: b.bouclier });
      }
      return;
    }
    // Au sol : petite danse après une élimination
    if (b.emT > 0) {
      b.emT -= dt;
      b.vx = b.vz = 0; b.vy -= 25 * dt;
      M.deplacer(b, dt);
      if (b.emT <= 0) b.em = '';
      b.f = 1;
      return;
    }
    b.vueT -= dt;
    if (b.vueT <= 0) { b.vueT = 0.3 + Math.random() * 0.25; this.chercherCible(b); }
    const z = etatZone(this.zone, this.temps);
    const distProchaine = Math.hypot(b.x - z.cx, b.z - z.cz);
    const distActuelle = Math.hypot(b.x - z.x, b.z - z.z);
    const fuirZone = distActuelle > z.r - 4 || (distProchaine > z.cr * 0.9 && (z.retrecit || z.dans < 40));
    let mx = 0, mz = 0;
    const t = b.cible ? this.joueurs.get(b.cible) : null;
    if (t && t.vivant && !fuirZone) {
      const dx = t.x - b.x, dz = t.z - b.z, d = Math.hypot(dx, dz) || 1;
      b.ry = angleVers(b.ry, Math.atan2(-dx, -dz), Math.min(1, dt * 7));
      b.rx = Math.atan2((t.y + 1.2) - (b.y + 1.5), d);
      const def = OBJETS[b.arme.objet];
      const ideal = b.arme.objet === 'pompe' ? 5 : b.arme.objet === 'sniper' ? 50 : b.arme.objet === 'smg' ? 10 : 20;
      const avance = !b.voit ? 1 : d > ideal + 5 ? 1 : d < ideal - 4 ? -0.7 : 0;
      b.strafeT -= dt;
      if (b.strafeT <= 0) { b.strafe = Math.random() < 0.5 ? -1 : 1; b.strafeT = 0.7 + Math.random() * 1.4; }
      mx = dx / d * avance - dz / d * b.strafe * 0.8;
      mz = dz / d * avance + dx / d * b.strafe * 0.8;
      if (b.auSol && Math.random() < dt * 0.5) b.vy = 8.5;
      this.botTire(b, t, d, def, dt);
    } else {
      // Se soigner quand il n'y a personne autour
      if (!fuirZone && b.auSol && ((b.pv < 65 && b.soins > 0) || (b.bouclier < 50 && b.gourdes > 0)) && Math.random() < dt * 2) {
        b.soinType = b.pv < 65 && b.soins > 0 ? 'soin' : 'gourde';
        b.soinT = b.soinType === 'soin' ? 3 : 2;
        b.a = (b.soinType === 'soin' ? 'soin' : 'bouclier') + ':1';
        return;
      }
      // Aller chercher un ravitaillement ou un meilleur objet
      b.butinT = (b.butinT || 0) - dt;
      if (!fuirZone && b.butinT <= 0) { b.butinT = 1; this.viserButin(b, z); }
      if (b.objectif) {
        const o = b.objectif;
        if (Math.hypot(o.x - b.x, o.z - b.z) < (o.ravito ? 3 : 1.6)) { this.prendreObjectif(b); b.objectif = null; }
        else { b.dest = { x: o.x, z: o.z }; b.destT = 8; }
      }
      if (fuirZone) { b.objectif = null; b.dest = { x: z.cx + (Math.random() - 0.5) * z.cr * 0.5, z: z.cz + (Math.random() - 0.5) * z.cr * 0.5 }; }
      b.destT -= dt;
      if (!b.dest || b.destT <= 0 || Math.hypot(b.dest.x - b.x, b.dest.z - b.z) < 4) {
        b.dest = this.pointTerre(Math.random, z.cx, z.cz, Math.max(10, z.cr * 0.75));
        b.destT = 12 + Math.random() * 12;
      }
      const dx = b.dest.x - b.x, dz = b.dest.z - b.z, d = Math.hypot(dx, dz) || 1;
      mx = dx / d; mz = dz / d;
      b.ry = angleVers(b.ry, Math.atan2(-dx, -dz), Math.min(1, dt * 5));
      b.rx *= 0.9;
      b.rechargeT = Math.max(0, b.rechargeT - dt);
      if (b.rechargeT === 0 && b.mun <= 0) b.mun = OBJETS[b.arme.objet].chargeur;
    }
    // Contourner un obstacle
    if (b.detourT > 0) { b.detourT -= dt; const ox = mx; mx = -mz * b.cote; mz = ox * b.cote; }
    const vit = b.dansEau ? 3.5 : 6.3;
    const n = Math.hypot(mx, mz);
    if (n > 0.01) { b.vx = mx / n * vit; b.vz = mz / n * vit; } else { b.vx *= 0.8; b.vz *= 0.8; }
    b.vy -= 25 * dt;
    b.bloqueT += dt;
    if (b.bloqueT > 0.6) {
      const bouge = Math.hypot(b.x - b.px, b.z - b.pz);
      if (n > 0.01 && bouge < 1.2) {
        b.coince++;
        if (b.auSol) b.vy = 9;
        if (b.coince >= 2) { b.detourT = 1.2 + Math.random(); b.cote = Math.random() < 0.5 ? -1 : 1; b.coince = 0; }
      } else b.coince = 0;
      b.px = b.x; b.pz = b.z; b.bloqueT = 0;
    }
    M.deplacer(b, dt);
    b.a = b.arme.objet + ':' + b.arme.rarete;
    b.f = (b.auSol ? 1 : 0) | (t && b.voit ? 2 : 0);
  }

  // Objectif du bot : un ravitaillement posé, ou un objet utile au sol
  viserButin(b, z) {
    let best = null, bd = 120;
    for (const rv of this.ravitos.values()) {
      if (rv.ouvert || !posRavito(rv, this.temps).pose) continue;
      const d = Math.hypot(rv.x - b.x, rv.z - b.z);
      if (d < bd && Math.hypot(rv.x - z.x, rv.z - z.z) < z.r - 5) { bd = d; best = { ravito: rv.id, x: rv.x, z: rv.z }; }
    }
    if (!best) {
      bd = 28;
      for (const it of this.butins.values()) {
        const d = Math.hypot(it.x - b.x, it.z - b.z);
        if (d > bd || Math.abs(it.y - b.y) > 5) continue;
        let utile = false;
        if (LISTE_ARMES.includes(it.objet)) utile = valeurArme(it) > valeurArme(b.arme) + 0.5;
        else if (it.objet === 'soin' || it.objet === 'pansements') utile = b.soins < 3;
        else if (it.objet === 'bouclier' || it.objet === 'minigourde') utile = b.gourdes < 2;
        if (utile) { bd = d; best = { butin: it.id, x: it.x, z: it.z }; }
      }
    }
    b.objectif = best;
  }
  prendreObjectif(b) {
    const o = b.objectif;
    if (o.ravito) { this.ouvrirRavito(b.id, o.ravito); return; }
    const it = this.butins.get(o.butin);
    if (!it) return;
    this.butins.delete(it.id);
    this.reseau.diffuser({ t: 'butin-', id: it.id, par: b.id });
    if (LISTE_ARMES.includes(it.objet)) {
      this.creerButin({ objet: b.arme.objet, rarete: b.arme.rarete, mun: OBJETS[b.arme.objet].chargeur }, b.x + 0.5, b.y + 0.1, b.z);
      b.arme = { objet: it.objet, rarete: it.rarete }; b.mun = OBJETS[it.objet].chargeur; b.rechargeT = 0;
    } else if (it.objet === 'soin' || it.objet === 'pansements') b.soins += 1;
    else b.gourdes += 1;
  }

  chercherCible(b) {
    const M = this.monde;
    let meilleur = null, md = Infinity, voit = false;
    const portee = b.arme.objet === 'sniper' ? 130 : 80;
    for (const j of this.joueurs.values()) {
      if (j === b || !j.vivant || j.ph === 'dirigeable' || j.ph === 'chute' || memeEquipe(b, j)) continue;
      let d = Math.hypot(j.x - b.x, j.y - b.y, j.z - b.z);
      if (d > portee) continue;
      if (j.id === b.agresseur) d *= 0.5;
      if (d >= md) continue;
      const ox = b.x, oy = b.y + 1.5, oz = b.z;
      let dx = j.x - ox, dy = j.y + 1.2 - oy, dz = j.z - oz;
      const L = Math.hypot(dx, dy, dz) || 1; dx /= L; dy /= L; dz /= L;
      const h = M.lancerRayon(ox, oy, oz, dx, dy, dz, L);
      const visible = !h || h.t > L - 0.6;
      if (visible || (j.id === b.agresseur && L < 50)) { meilleur = j; md = d; voit = visible; }
    }
    b.cible = meilleur ? meilleur.id : null;
    b.voit = voit;
  }

  botTire(b, t, d, def, dt) {
    b.tirT -= dt;
    if (b.rechargeT > 0) { b.rechargeT -= dt; if (b.rechargeT <= 0) b.mun = def.chargeur; return; }
    if (!b.voit || d > def.portee * 0.85 || b.tirT > 0) return;
    if (b.mun <= 0) { b.rechargeT = def.recharge; return; }
    const diff = this.options.difficulte;
    b.tirT = (1 / def.cadence) * (1.1 + Math.random() * 0.7) + (diff === 0 ? 0.35 : diff === 1 ? 0.1 : 0);
    const ox = b.x - Math.cos(b.ry) * 0.3, oy = b.y + 1.45, oz = b.z + Math.sin(b.ry) * 0.3;
    const viseTete = Math.random() < 0.15 + diff * 0.08;
    let dx = t.x - ox, dy = t.y + (viseTete ? 1.85 : 1.1) - oy, dz = t.z - oz;
    const L = Math.hypot(dx, dy, dz) || 1; dx /= L; dy /= L; dz /= L;
    const bouge = t.f & 1 ? 0.015 : 0.03;
    const err = ERREUR_BOTS[diff] + def.disp * 0.4 + bouge + Math.min(0.03, d / 3000);
    let fin = null;
    for (let p = 0; p < (def.plombs || 1); p++) {
      const ex = dx + (Math.random() - 0.5) * 2 * err, ey = dy + (Math.random() - 0.5) * 2 * err, ez = dz + (Math.random() - 0.5) * 2 * err;
      const n = Math.hypot(ex, ey, ez);
      fin = this.tirerRayon(b.id, ox, oy, oz, ex / n, ey / n, ez / n, def, b.arme);
    }
    b.mun--;
    this.reseau.diffuser({ t: 'tir', o: [arrondi(ox), arrondi(oy), arrondi(oz)], d: fin, a: b.arme.objet, par: b.id });
  }

  // Tir fait par l'hôte (pour les bots)
  tirerRayon(auteur, ox, oy, oz, dx, dy, dz, def, arme) {
    const M = this.monde;
    const portee = def.portee;
    const h = M.lancerRayon(ox, oy, oz, dx, dy, dz, portee);
    let best = h ? h.t : portee, cible = null, tete = false;
    const ix = 1 / (dx || 1e-9), iy = 1 / (dy || 1e-9), iz = 1 / (dz || 1e-9);
    for (const j of this.joueurs.values()) {
      if (j.id === auteur || !j.vivant || j.ph === 'dirigeable') continue;
      if (Math.abs(j.x - ox) > best + 2 && Math.abs(j.z - oz) > best + 2) continue;
      const hc = (j.f & 16) ? 1.15 : 1.6; // accroupi : plus petit
      const corps = { minX: j.x - 0.45, maxX: j.x + 0.45, minY: j.y, maxY: j.y + hc, minZ: j.z - 0.45, maxZ: j.z + 0.45 };
      const tt = { minX: j.x - 0.3, maxX: j.x + 0.3, minY: j.y + hc, maxY: j.y + hc + 0.55, minZ: j.z - 0.3, maxZ: j.z + 0.3 };
      const a = rayonBoite(corps, ox, oy, oz, ix, iy, iz), c = rayonBoite(tt, ox, oy, oz, ix, iy, iz);
      if (c !== null && c < best) { best = c; cible = j; tete = true; }
      if (a !== null && a < best) { best = a; cible = j; tete = false; }
    }
    if (cible) {
      let deg = def.degats * RARETES[arme.rarete || 0].mult;
      if (def.plombs) deg *= borner(1 - (best - 7) / 35, 0.25, 1);
      if (tete) deg *= def.multTete || 1.8;
      this.blesser(cible.id, deg, auteur, arme.objet, tete);
    } else if (h && h.boite && h.boite.type === 'constr') {
      this.abimer(h.boite.cle, def.degats * (def.plombs ? 0.6 : 1));
    }
    return [arrondi(ox + dx * best), arrondi(oy + dy * best), arrondi(oz + dz * best)];
  }

  reactionBot(b, auteur) {
    b.agresseur = auteur;
    b.vueT = 0;
    b.emT = 0; b.em = '';
    if (b.ph !== 'sol' || b.mats < 10 || this.temps - b.constrT < 2.5 || Math.random() > [0.25, 0.45, 0.75][this.options.difficulte]) return;
    const a = this.joueurs.get(auteur);
    if (!a) return;
    b.constrT = this.temps;
    const ry = Math.atan2(-(a.x - b.x), -(a.z - b.z));
    const c = cibleConstruction(this.monde, 'mur', b.x, b.y, b.z, ry, 0);
    if (this.construire(b.id, c)) b.mats -= 10;
    if (Math.random() < 0.4 && b.mats >= 10) {
      const r2 = cibleConstruction(this.monde, 'rampe', b.x, b.y, b.z, ry, 0);
      if (this.construire(b.id, r2)) b.mats -= 10;
    }
    // les bots difficiles s'enferment parfois dans une petite boîte
    if (this.options.difficulte === 2 && Math.random() < 0.35 && b.mats >= 30) {
      for (const dr of [Math.PI / 2, -Math.PI / 2, Math.PI]) {
        const c = cibleConstruction(this.monde, 'mur', b.x, b.y, b.z, ry + dr, 0);
        if (this.construire(b.id, c)) b.mats -= 10;
      }
    }
  }

  retourSalon() {
    this.enCours = false;
    this.reseau.diffuser({ t: 'retourSalon' });
    this.diffuserSalon();
  }
}
