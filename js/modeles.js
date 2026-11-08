// Chargement des modèles 3D faits dans Blender (dossier modeles/, conventions dans modeles/LISEZMOI.txt).
// objets.glb est chargé par armes.js et personnage.glb par personnage.js ; ici : décor, constructions,
// cosmétiques, et les modèles « en plus » listés dans modeles/integration.json (maison, arme…).
// Si un fichier manque ou ne charge pas, le jeu garde ses modèles faits en code.
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';

const VERSION = 2; // à augmenter quand un .glb change (évite le vieux cache du navigateur)
const BIBLIO = {};           // nom de l'objet → Object3D (modèle d'origine, jamais affiché)
export const INTEGRATION = { maisons: [], armes: [] };
const chargeur = new GLTFLoader();

function chargerFichier(fichier, prefixe = '') {
  return new Promise(resolve => {
    chargeur.load(`modeles/${fichier}?v=${VERSION}`, gltf => {
      gltf.scene.updateMatrixWorld(true);
      for (const o of [...gltf.scene.children]) BIBLIO[prefixe + (o.userData.name || o.name)] = o;
      resolve(gltf.scene);
    }, undefined, err => { console.warn(`Modèle ${fichier} pas chargé, on garde les modèles en code`, err?.message || err); resolve(null); });
  });
}

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
}

export const modelesDecorPrets = Promise.all([
  chargerFichier('decor.glb'),
  chargerFichier('constructions.glb'),
  chargerFichier('cosmetiques.glb'),
  chargerIntegration(),
]);

export const aModele = nom => !!BIBLIO[nom];

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
