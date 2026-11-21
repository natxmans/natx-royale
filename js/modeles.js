// Chargement des modèles 3D faits dans Blender (dossier modeles/, conventions dans modeles/LISEZMOI.txt).
// objets.glb est chargé par armes.js et personnage.glb par personnage.js ; ici : décor, constructions,
// cosmétiques, et les modèles « en plus » listés dans modeles/integration.json (maison, arme…).
// Si un fichier manque ou ne charge pas, le jeu garde ses modèles faits en code.
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { activerCosmetiques } from './boutique.js';

const VERSION = 2; // à augmenter quand un .glb change (évite le vieux cache du navigateur)
const BIBLIO = {};           // nom de l'objet → Object3D (modèle d'origine, jamais affiché)
const ANIMATIONS = {};       // nom de l'animation → AnimationClip (ex. soin_flotter, socle_tourner)
export const INTEGRATION = { maisons: [], armes: [], esprits: [], socles: [], lod: [], mannequins: [], cosmetiques250: [], cargaisons: [] };
const chargeur = new GLTFLoader();
const dejaCharges = new Map(); // un fichier partagé (ex. esprits_v001.glb) n'est chargé qu'une fois

function chargerFichier(fichier, prefixe = '') {
  const cle = prefixe + '|' + fichier;
  if (dejaCharges.has(cle)) return dejaCharges.get(cle);
  const p = new Promise(resolve => {
    chargeur.load(`modeles/${fichier}?v=${VERSION}`, gltf => {
      gltf.scene.updateMatrixWorld(true);
      for (const o of [...gltf.scene.children]) BIBLIO[prefixe + (o.userData.name || o.name)] = o;
      for (const a of gltf.animations || []) ANIMATIONS[a.name] = a;
      appliquerAlias();
      resolve(gltf.scene);
    }, undefined, err => { console.warn(`Modèle ${fichier} pas chargé, on garde les modèles en code`, err?.message || err); resolve(null); });
  });
  dejaCharges.set(cle, p);
  return p;
}
export const clipAnimation = nom => ANIMATIONS[nom] || null;

// Le manifeste dit quels nouveaux modèles sont validés et comment les placer
async function chargerIntegration() {
  let man = null;
  try {
    const r = await fetch(`modeles/integration.json?v=${Date.now()}`, { cache: 'no-store' });
    if (r.ok) man = await r.json();
  } catch (e) { man = null; }
  if (!man) return;
  for (const m of man.maisons || []) {
    if (!m.actif || !Array.isArray(m.collisions) || !m.taille) continue;
    const scene = m.fichier ? await chargerFichier(m.fichier, 'maison:' + m.id + ':') : null;
    INTEGRATION.maisons.push({ ...m, scene });
  }
  for (const a of man.armes || []) {
    if (!a.actif || !a.fichier) continue;
    const scene = await chargerFichier(a.fichier, 'arme:' + a.id + ':');
    if (scene) INTEGRATION.armes.push({ ...a, scene });
  }
  // Les 250 nouveaux cosmétiques : chaque livraison validée liste ses objets (« chapeau_capuche_nuageuse »…).
  // Ils sont en vente tout de suite ; les fichiers (.glb, images) ne sont chargés qu'au moment où on en a besoin.
  // Tenues, émotes et traînées ont en plus une fiche JSON (image à plaquer, durée du clip, réglages des particules).
  for (const e of man.cosmetiques250 || []) {
    if (!e.actif || !e.fichier || !Array.isArray(e.objets)) continue;
    const pref = e.categorie + '_';
    let slugs = e.objets.map(o => (o.startsWith(pref) ? o.slice(pref.length) : o));
    if (FICHES[e.categorie]) {
      let doc = null;
      try { const r = await fetch(`modeles/${e.fiche}?v=${VERSION}`); if (r.ok) doc = await r.json(); } catch (err) { doc = null; }
      const liste = doc && (doc.tenues || doc.emotes || doc.trainees);
      if (!Array.isArray(liste)) { console.warn('Fiche illisible :', e.fiche); continue; }
      const parSlug = new Map(liste.map(f => [f.slug, f]));
      slugs = slugs.filter(sl => parSlug.has(sl));
      for (const sl of slugs) {
        FICHES[e.categorie].set(sl, { ...parSlug.get(sl), fichier: e.fichier, cases: doc.cases, atlas: doc.atlas, colonnes: doc.colonnes, texture: null });
      }
    } else if (!CATEGORIES_MODELE.has(e.categorie)) continue;
    INTEGRATION.cosmetiques250.push(e);
    for (const sl of slugs) fichierDe.set(e.categorie + ':' + sl, e.fichier);
    activerCosmetiques(slugs.map(sl => e.categorie + ':' + sl));
  }
  // Esprits et autels : les objets gardent leur nom (esprit_soin, socle_esprit…) pour modeleGlb()
  for (const cle of ['esprits', 'socles', 'lod', 'mannequins', 'cargaisons']) {
    for (const e of man[cle] || []) {
      if (!e.actif || !e.fichier) continue;
      const scene = await chargerFichier(e.fichier);
      if (scene && BIBLIO[e.objet]) INTEGRATION[cle].push(e);
    }
  }
}

export const modelesDecorPrets = Promise.all([
  chargerFichier('decor.glb'),
  chargerFichier('constructions.glb'),
  chargerFichier('cosmetiques.glb'),
  chargerIntegration(),
]);

export const aModele = nom => !!BIBLIO[nom];

// ---------- Cosmétiques chargés à la demande ----------
// chapeau, dos, pioche, deltaplane : un objet <categorie>_<slug> dans un .glb, affiché tel quel
const CATEGORIES_MODELE = new Set(['chapeau', 'dos', 'pioche', 'deltaplane']);
// tenue (image 256² + pièces 3D), emote (clip d'animation), trainee (case d'un atlas + réglages) : fiche JSON
const FICHES = { tenue: new Map(), emote: new Map(), trainee: new Map() };
const fichierDe = new Map(); // « chapeau:capuche_nuageuse » → « cosm250_chapeaux_v001.glb »
const textures = new Map();
const chargeurTex = new THREE.TextureLoader();
function chargerTexture(chemin) {
  if (!textures.has(chemin)) {
    textures.set(chemin, chargeurTex.loadAsync(`modeles/${chemin}?v=${VERSION}`)
      .then(t => { t.colorSpace = THREE.SRGBColorSpace; return t; })
      .catch(err => { console.warn('Image pas chargée :', chemin, err?.message || err); return null; }));
  }
  return textures.get(chemin);
}
const ficheDe = cle => { const [c, s] = cle.split(':'); return FICHES[c] ? FICHES[c].get(s) : null; };
function fichePrete(cat, f) {
  if (cat === 'tenue') return !!f.texture && (f.pieces || []).every(p => BIBLIO[p.objet]);
  if (cat === 'emote') return !!ANIMATIONS[f.clip];
  return !!f.texture;
}
export function cosmetiquePret(cle) {
  const f = ficheDe(cle);
  if (f) return fichePrete(cle.split(':')[0], f);
  return !fichierDe.has(cle) || !!BIBLIO[cle.replace(':', '_')];
}
// Fiches prêtes à l'emploi (null tant que l'image / le clip n'est pas chargé : le jeu garde l'objet de base)
export const ficheTenue = slug => { const f = FICHES.tenue.get(slug); return f && fichePrete('tenue', f) ? f : null; };
export const ficheEmote = slug => { const f = FICHES.emote.get(slug); return f && fichePrete('emote', f) ? f : null; };
export const ficheTrainee = slug => { const f = FICHES.trainee.get(slug); return f && fichePrete('trainee', f) ? f : null; };
function chargerFiche(cat, f) {
  if (cat === 'tenue') {
    return Promise.all([(f.pieces || []).length ? chargerFichier(f.fichier) : null,
      chargerTexture(f.image).then(t => { f.texture = t; })]);
  }
  if (cat === 'emote') return chargerFichier(f.fichier);
  return chargerTexture(f.atlas || f.fichier).then(t => { f.texture = t; });
}
export function chargerCosmetiques(cles) {
  const taches = new Map();
  for (const cle of cles) {
    if (cosmetiquePret(cle)) continue;
    const f = ficheDe(cle);
    if (f) taches.set(cle, chargerFiche(cle.split(':')[0], f));
    else if (fichierDe.has(cle)) taches.set(fichierDe.get(cle), chargerFichier(fichierDe.get(cle)));
  }
  return Promise.all(taches.values());
}
// Cosmétiques ajoutés par l'admin : un nouveau nom pour un modèle livré pas encore utilisé
const alias = new Map(); // « chapeau_nouveau » → « chapeau_objet_livre »
function appliquerAlias() { for (const [nom, obj] of alias) if (!BIBLIO[nom] && BIBLIO[obj]) BIBLIO[nom] = BIBLIO[obj]; }
export function enregistrerAjouts(liste) {
  const cles = [];
  for (const a of Array.isArray(liste) ? liste : []) {
    if (!a || !CATEGORIES_MODELE.has(a.cat) || typeof a.fichier !== 'string' || typeof a.objet !== 'string') continue;
    fichierDe.set(a.cat + ':' + a.id, a.fichier);
    alias.set(a.cat + '_' + a.id, a.objet);
    cles.push(a.cat + ':' + a.id);
  }
  appliquerAlias();
  return cles;
}
// Après le démarrage : on charge en douce tout ce qui est livré (pour les potes et les bots qui portent ces objets)
export function prechargerCosmetiques() {
  const cles = [...fichierDe.keys()];
  return chargerCosmetiques(cles);
}

// Matériaux qui doivent briller (bloom) : néons, flammes, cristal, auréole…
const LUMINEUX = /^(neon_|aureole|flamme|yeux_rouges|yeux_dragon|cristal|lumiere|taches_lumineuses|eau_soin|bouton_)/;
const cacheLumineux = new Map();
function materiauLumineux(m) {
  if (!m || !LUMINEUX.test(m.name)) return m;
  if (!cacheLumineux.has(m)) {
    const l = m.clone();
    if (l.emissive) { l.emissive.copy(m.color); l.emissiveIntensity = m.name.startsWith('bouton_') ? 0.5 : 1.6; }
    l.toneMapped = false;
    cacheLumineux.set(m, l);
  }
  return cacheLumineux.get(m);
}

// Copie d'un modèle (les géométries sont partagées, donc pas cher)
export function modeleGlb(nom, { ombres = true } = {}) {
  const o = BIBLIO[nom];
  if (!o) return null;
  const c = o.clone();
  c.position.set(0, 0, 0); c.rotation.set(0, 0, 0); c.scale.set(1, 1, 1);
  c.traverse(m => {
    if (!m.isMesh) return;
    m.material = Array.isArray(m.material) ? m.material.map(materiauLumineux) : materiauLumineux(m.material);
    m.castShadow = ombres;
  });
  return c;
}

// ---------- Armes « en plus » : mise à l'échelle, orientation, poignée, rareté ----------
// Le jeu attend : canon vers -Z (three.js), haut vers +Y, origine à la poignée, matériau « rarete ».
const ROTATIONS_AVANT = { '-z': [0, 0, 0], '+z': [0, Math.PI, 0], '+x': [0, Math.PI / 2, 0], '-x': [0, -Math.PI / 2, 0], '+y': [-Math.PI / 2, 0, 0], '-y': [Math.PI / 2, 0, 0] };
export function preparerArme(e) {
  const src = e.objet ? BIBLIO['arme:' + e.id + ':' + e.objet] : e.scene;
  if (!src) return null;
  const brut = src.clone(true);
  brut.position.set(0, 0, 0);
  const orient = new THREE.Group(); orient.add(brut);
  const [rx, ry, rz] = ROTATIONS_AVANT[e.avant || '-z'] || ROTATIONS_AVANT['-z'];
  orient.rotation.set(rx, ry, rz);
  const g = new THREE.Group(); g.add(orient);
  g.updateMatrixWorld(true);
  let b = new THREE.Box3().setFromObject(g);
  const longueur = b.max.z - b.min.z;
  const k = e.echelle || (e.longueur && longueur > 0 ? e.longueur / longueur : 1);
  orient.scale.setScalar(k);
  g.updateMatrixWorld(true);
  b = new THREE.Box3().setFromObject(g);
  // poignée : fractions de la boîte (x, y, z) ; par défaut au milieu, en bas, aux 2/3 vers l'arrière
  const [fx, fy, fz] = e.poignee || [0.5, 0.3, 0.68];
  const p = new THREE.Vector3(b.min.x + (b.max.x - b.min.x) * fx, b.min.y + (b.max.y - b.min.y) * fy, b.min.z + (b.max.z - b.min.z) * fz);
  orient.position.sub(p);
  // couleur de rareté sur le matériau choisi, bande lumineuse éventuelle
  g.traverse(o => {
    if (!o.isMesh) return;
    o.castShadow = true;
    const renommer = m => {
      if (e.materiauRarete && m.name === e.materiauRarete) { const c = m.clone(); c.name = 'rarete'; return c; }
      if (e.materiauLueur && m.name === e.materiauLueur) { const c = m.clone(); c.name = 'lueur'; return c; }
      return m;
    };
    o.material = Array.isArray(o.material) ? o.material.map(renommer) : renommer(o.material);
  });
  g.userData.triangles = compterTriangles(g);
  return g;
}

export function compterTriangles(o) {
  let n = 0;
  o.traverse(m => { if (m.isMesh && m.geometry) n += (m.geometry.index ? m.geometry.index.count : m.geometry.attributes.position.count) / 3; });
  return Math.round(n);
}

// Pour vérifier un export reçu (console : natx.inspecterModele('maison:cottage'))
export function inspecterModele(prefixe) {
  const noms = Object.keys(BIBLIO).filter(n => n.startsWith(prefixe));
  return noms.map(n => {
    const o = BIBLIO[n];
    const b = new THREE.Box3().setFromObject(o);
    const mats = new Set();
    o.traverse(m => { if (m.isMesh) for (const x of [].concat(m.material)) mats.add(x.name + (x.map ? ' (texture)' : '')); });
    return { nom: n, taille: b.getSize(new THREE.Vector3()).toArray().map(v => +v.toFixed(2)), min: b.min.toArray().map(v => +v.toFixed(2)), triangles: compterTriangles(o), materiaux: [...mats], collisions: collisionsModele(o).length };
  });
}

// Toutes les boîtes de collision d'un modèle : objets nommés COL_… (boîtes simples dans Blender)
export function collisionsModele(racine) {
  const boites = [];
  racine.updateMatrixWorld(true);
  racine.traverse(o => {
    const nom = o.userData.name || o.name || '';
    if (!o.isMesh || !/^COL[_.-]/i.test(nom)) return;
    if (!o.geometry.boundingBox) o.geometry.computeBoundingBox();
    const b = o.geometry.boundingBox.clone().applyMatrix4(o.matrixWorld);
    boites.push({ minX: b.min.x, minY: b.min.y, minZ: b.min.z, maxX: b.max.x, maxY: b.max.y, maxZ: b.max.z, nom });
  });
  return boites;
}
