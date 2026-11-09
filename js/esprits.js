// Esprits de NATX ROYALE (création originale, modèles de la session modélisation : modeles/esprits_v001.glb).
// De petits compagnons flottent au-dessus des autels de l'île. On en capture un (E / bouton 👆) :
// il te suit, te donne un bonus passif et un pouvoir (touche A, ou bouton ✨ sur téléphone) avec un temps de recharge.
// Un seul esprit à la fois ; il s'en va quand tu es éliminé. L'autel en fait apparaître un nouveau plus tard.
// L'hôte décide de tout (captures, pouvoirs, soins, constructions) ; les joueurs affichent et appliquent
// ce qui touche à leur propre déplacement (vitesse, double saut, bond).
import * as THREE from 'three';
import { DEMI } from './monde.js';
import { arrondi } from './outils.js';
import { modeleGlb, clipAnimation } from './modeles.js';

// ids = noms des modèles livrés (esprit_<id> dans esprits_v001.glb)
export const ESPRITS = {
  soin: {
    nom: 'Pousse', role: 'Soin', icone: '🌱', couleur: '#a8ff7a', clair: '#e6ffd6',
    passif: 'Ta vie remonte toute seule jusqu\'à 75', pouvoir: 'Bourgeon', descPouvoir: '+40 PV pour toi et tes coéquipiers proches', recharge: 30,
  },
  mobilite: {
    nom: 'Filou', role: 'Mobilité', icone: '☁️', couleur: '#5ff2ff', clair: '#e0fdff',
    passif: '+12 % de vitesse, double saut, pas de dégâts de chute', pouvoir: 'Envol', descPouvoir: 'Un grand bond vers l\'avant', recharge: 12,
  },
  protection: {
    nom: 'Gardien', role: 'Protection', icone: '🛡️', couleur: '#9ff0ff', clair: '#ffffff',
    passif: 'Ton bouclier remonte tout seul jusqu\'à 50', pouvoir: 'Carapace', descPouvoir: '+50 de bouclier d\'un coup', recharge: 30,
  },
  vision: {
    nom: 'Zyeuto', role: 'Vision', icone: '👁️', couleur: '#ff6ef0', clair: '#ffd6fb',
    passif: 'Les ennemis proches (35 m) sont sur ta mini-carte', pouvoir: 'Œil perçant', descPouvoir: 'Montre les ennemis à 70 m à travers les murs pendant 6 s', recharge: 25,
  },
  batisseur: {
    nom: 'Briquet', role: 'Bâtisseur', icone: '🔨', couleur: '#fff0a8', clair: '#ffffff',
    passif: 'Construire coûte 5 matériaux au lieu de 10', pouvoir: 'Fort express', descPouvoir: '4 murs autour de toi, gratuits', recharge: 28,
  },
};
export const TYPES_ESPRITS = Object.keys(ESPRITS);

// Réglages des effets (partagés par l'hôte et les joueurs)
export const RECHARGE_SANCTUAIRE = 75;      // secondes avant qu'un nouvel esprit apparaisse sur l'autel
export const PORTEE_CAPTURE = 3.2;          // mètres
export const VITESSE_MOBILITE = 1.12;
export const ENVOL = { haut: 15, avant: 13 };
export const REGEN = { soin: { max: 75, pas: 2 }, protection: { max: 50, pas: 3 } };
export const BOURGEON = { pv: 40, rayon: 8 };
export const CARAPACE = 50;
export const VISION = { passif: 35, pouvoir: 70, duree: 6 };
export const COUT_BATISSEUR = 5;
export const ECHELLE_AUTEL = 1.6;           // l'autel livré fait 0,94 m : un peu agrandi pour être vu de loin

// ---------- Placement des autels (fait par l'hôte, envoyé à tout le monde) ----------
// Sur la terre ferme, à plat, à ciel ouvert (pas dans une maison ni sous un arbre), loin les uns des autres.
export function placerSanctuaires(monde, r, n, centre = null) {
  const liste = [];
  const types = [];
  while (types.length < n) types.push(...TYPES_ESPRITS.slice().sort(() => r() - 0.5));
  const ecart = centre ? 12 : DEMI * 0.3;
  for (let essai = 0; liste.length < n && essai < n * 80; essai++) {
    const a = r() * Math.PI * 2;
    const d = centre ? 14 + r() * 34 : Math.sqrt(r()) * DEMI * 0.8;
    const x = (centre ? centre.x : 0) + Math.cos(a) * d, z = (centre ? centre.z : 0) + Math.sin(a) * d;
    const h = monde.hauteurTerrain(x, z);
    if (h < 2) continue;
    const pente = Math.abs(monde.hauteurTerrain(x + 2, z) - h) + Math.abs(monde.hauteurTerrain(x, z + 2) - h)
      + Math.abs(monde.hauteurTerrain(x - 2, z) - h) + Math.abs(monde.hauteurTerrain(x, z - 2) - h);
    if (pente > 2.4) continue;
    let couvert = false;
    for (const [ox, oz] of [[0, 0], [1.6, 0], [-1.6, 0], [0, 1.6], [0, -1.6]]) {
      const hit = monde.lancerRayon(x + ox, h + 30, z + oz, 0, -1, 0, 31);
      if (hit && hit.y > monde.hauteurTerrain(x + ox, z + oz) + 0.4) { couvert = true; break; }
    }
    if (couvert) continue;
    if (liste.some(s => Math.hypot(s.x - x, s.z - z) < ecart)) continue;
    liste.push({ id: liste.length, x: arrondi(x), y: arrondi(h), z: arrondi(z), type: types[liste.length] });
  }
  return liste;
}

// ---------- Modèles ----------
// Le vrai modèle (esprit_<id>, socle_esprit) quand integration.json l'active ; sinon une forme de secours faite en code.
const cacheMat = new Map();
function mat(cle, fabrique) { if (!cacheMat.has(cle)) cacheMat.set(cle, fabrique()); return cacheMat.get(cle); }
const lumineux = (couleur, k = 1.7) => mat('l' + couleur + k, () => new THREE.MeshBasicMaterial({ color: new THREE.Color(couleur).multiplyScalar(k), toneMapped: false }));
const voile = couleur => mat('v' + couleur, () => new THREE.MeshBasicMaterial({ color: couleur, transparent: true, opacity: 0.24, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false }));
const GEO = {
  coeur: new THREE.IcosahedronGeometry(0.3, 2), halo: new THREE.IcosahedronGeometry(0.48, 2), oeil: new THREE.SphereGeometry(0.052, 10, 8),
  feuille: new THREE.ConeGeometry(0.085, 0.32, 6), cristal: new THREE.OctahedronGeometry(0.11), anneau: new THREE.TorusGeometry(0.52, 0.022, 6, 40),
  cube: new THREE.BoxGeometry(0.13, 0.13, 0.13), grosOeil: new THREE.SphereGeometry(0.13, 14, 10),
};

function espritDeSecours(type, d) {
  const g = new THREE.Group();
  const coeur = new THREE.Mesh(GEO.coeur, lumineux(d.couleur));
  const halo = new THREE.Mesh(GEO.halo, voile(d.clair));
  const oeilMat = mat('oeil', () => new THREE.MeshBasicMaterial({ color: '#1b1033' }));
  if (type === 'vision') { const o = new THREE.Mesh(GEO.grosOeil, oeilMat); o.position.set(0, 0.04, -0.24); g.add(o); }
  else for (const s of [-1, 1]) { const o = new THREE.Mesh(GEO.oeil, oeilMat); o.position.set(s * 0.1, 0.05, -0.27); g.add(o); }
  const accents = new THREE.Group();
  const n = type === 'mobilite' ? 2 : type === 'batisseur' ? 3 : type === 'protection' ? 3 : 5;
  for (let i = 0; i < n; i++) {
    const a = i / n * Math.PI * 2;
    let m;
    if (type === 'soin') { m = new THREE.Mesh(GEO.feuille, lumineux(i % 2 ? d.clair : d.couleur, 1.6)); m.position.set(Math.cos(a) * 0.2, 0.28, Math.sin(a) * 0.2); m.rotation.set(Math.sin(a) * 0.5, 0, -Math.cos(a) * 0.5); }
    else if (type === 'mobilite') { m = new THREE.Mesh(GEO.anneau, lumineux(i ? d.clair : d.couleur, 1.6)); m.rotation.set(Math.PI / 2 + (i ? 0.6 : -0.4), i ? 0.5 : 0, 0); }
    else if (type === 'protection') { m = new THREE.Mesh(GEO.cristal, lumineux(d.couleur, 1.5)); m.position.set(Math.cos(a) * 0.45, 0, Math.sin(a) * 0.45); m.scale.set(1.6, 1.6, 0.4); }
    else if (type === 'batisseur') { m = new THREE.Mesh(GEO.cube, mat('cube' + i, () => new THREE.MeshStandardMaterial({ color: ['#a0703c', '#9a9ea6', '#c9ced8'][i], roughness: 0.8 }))); m.position.set(Math.cos(a) * 0.45, 0, Math.sin(a) * 0.45); }
    else { m = new THREE.Mesh(GEO.cristal, lumineux(d.couleur, 1.4)); m.position.set(Math.cos(a) * 0.42, Math.sin(i * 1.7) * 0.08, Math.sin(a) * 0.42); }
    accents.add(m);
  }
  g.add(coeur, halo, accents);
  return { g, accents, halo };
}

export function creerEsprit(type, echelle = 1) {
  const d = ESPRITS[type] || ESPRITS.soin;
  const g = new THREE.Group();
  g.userData = { esprit: type, accents: null, halo: null, t: Math.random() * 6, mixer: null, actions: {} };
  const glb = modeleGlb('esprit_' + type);
  if (glb) {
    glb.traverse(o => { if (o.isMesh) o.castShadow = false; });
    g.add(glb);
    // animations livrées : flotter en boucle, activer / apparaître une fois
    const mixer = new THREE.AnimationMixer(glb);
    for (const nom of ['flotter', 'activer', 'apparaitre']) {
      const clip = clipAnimation(type + '_' + nom);
      if (clip) g.userData.actions[nom] = mixer.clipAction(clip);
    }
    const flotter = g.userData.actions.flotter;
    if (flotter) { flotter.setLoop(THREE.LoopRepeat, Infinity); flotter.time = Math.random() * 2; flotter.play(); }
    mixer.addEventListener('finished', () => {
      const f = g.userData.actions.flotter;
      if (f) { f.reset().setEffectiveWeight(1).fadeIn(0.2).play(); }
    });
    g.userData.mixer = mixer;
  } else {
    const s = espritDeSecours(type, d);
    g.add(s.g);
    Object.assign(g.userData, { accents: s.accents, halo: s.halo });
  }
  g.scale.setScalar(echelle);
  return g;
}

// Joue une animation une fois (« activer » au pouvoir, « apparaitre » à la capture), puis reprend « flotter »
export function jouerEsprit(g, nom) {
  const u = g && g.userData;
  const a = u && u.actions && u.actions[nom];
  if (!a) return;
  a.reset().setLoop(THREE.LoopOnce, 1);
  a.clampWhenFinished = false;
  if (u.actions.flotter) { a.crossFadeFrom(u.actions.flotter, 0.2, false); }
  a.play();
}

export function animerEsprit(g, dt) {
  const u = g.userData;
  u.t += dt;
  if (u.mixer) { u.mixer.update(dt); return; }
  if (u.accents) u.accents.rotation.y += dt * (u.esprit === 'mobilite' ? 4 : u.esprit === 'batisseur' ? 1.2 : 1.6);
  if (u.halo) u.halo.scale.setScalar(1 + Math.sin(u.t * 3) * 0.08);
}

export function creerSanctuaire() {
  const g = new THREE.Group();
  const runes = new THREE.MeshBasicMaterial({ color: '#888888', toneMapped: false });
  const cercle = new THREE.MeshBasicMaterial({ color: '#888888', transparent: true, opacity: 0.55, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide, toneMapped: false });
  const glb = modeleGlb('socle_esprit');
  let mixer = null, hauteur = 2.1;
  if (glb) {
    glb.scale.setScalar(ECHELLE_AUTEL);
    glb.traverse(o => {
      if (!o.isMesh) return;
      if (/^COL[_.-]/i.test(o.userData.name || o.name || '')) { o.visible = false; return; }
      o.receiveShadow = true;
      // les parties lumineuses de l'autel prennent la couleur de l'esprit qui l'habite
      if (/^lumiere/i.test(o.material?.name || '')) o.material = runes;
    });
    g.add(glb);
    const clip = clipAnimation('socle_tourner');
    if (clip) { mixer = new THREE.AnimationMixer(glb); mixer.clipAction(clip).play(); }
    hauteur = (glb.userData.hauteur_esprit || 1.0) * ECHELLE_AUTEL - 0.1;
  } else {
    const pierre = mat('socle', () => new THREE.MeshStandardMaterial({ color: '#9a958c', roughness: 0.9, flatShading: true }));
    const socle = new THREE.Mesh(new THREE.CylinderGeometry(1.45, 1.7, 0.4, 10), pierre);
    socle.position.y = 0.2; socle.castShadow = socle.receiveShadow = true;
    const dalle = new THREE.Mesh(new THREE.CylinderGeometry(1.05, 1.15, 0.16, 10), mat('dalle', () => new THREE.MeshStandardMaterial({ color: '#c8c2b5', roughness: 0.8, flatShading: true })));
    dalle.position.y = 0.46;
    g.add(socle, dalle);
    for (let i = 0; i < 4; i++) {
      const a = i / 4 * Math.PI * 2 + Math.PI / 4;
      const pilier = new THREE.Mesh(new THREE.BoxGeometry(0.26, 1.15, 0.26), pierre);
      pilier.position.set(Math.cos(a) * 1.28, 0.95, Math.sin(a) * 1.28); pilier.rotation.y = -a; pilier.castShadow = true;
      const pierreRune = new THREE.Mesh(new THREE.OctahedronGeometry(0.15), runes);
      pierreRune.position.set(Math.cos(a) * 1.28, 1.72, Math.sin(a) * 1.28);
      g.add(pilier, pierreRune);
    }
  }
  const rond = new THREE.Mesh(new THREE.RingGeometry(0.9, 1.15, 40), cercle);
  rond.rotation.x = -Math.PI / 2; rond.position.y = 0.06;
  g.add(rond);
  g.userData = { runes, cercle, rond, mixer, hauteur };
  return g;
}

// Couleur de l'autel : celle de l'esprit qui l'habite, gris quand il est vide
export function colorerSanctuaire(g, type, dispo) {
  const d = ESPRITS[type] || ESPRITS.soin;
  g.userData.runes.color.copy(dispo ? new THREE.Color(d.couleur).multiplyScalar(1.8) : new THREE.Color('#5d5d66'));
  g.userData.cercle.color.copy(dispo ? new THREE.Color(d.clair) : new THREE.Color('#40404a'));
}
