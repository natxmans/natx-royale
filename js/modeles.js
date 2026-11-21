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
export const INTEGRATION = { maisons: [], armes: [], esprits: [], socles: [], lod: [], mannequins: [], cosmetiques250: [], cargaisons: [], tenuesHD: false, vegetation: false, ensembleStaff: false, decors: false };
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
    // un fichier peut contenir plusieurs maisons (maisons_carte_v001.glb) : il n'est lu qu'une fois, chaque maison garde son nom « maison:<id>:<objet> »
    let scene = null;
    if (m.fichier && m.objet) {
      scene = await chargerFichier(m.fichier, 'maison::');
      if (scene && BIBLIO['maison::' + m.objet]) BIBLIO['maison:' + m.id + ':' + m.objet] = BIBLIO['maison::' + m.objet];
      else scene = null;
    } else if (m.fichier) scene = await chargerFichier(m.fichier, 'maison:' + m.id + ':');
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
        const f = { ...parSlug.get(sl), fichier: e.fichier, cases: doc.cases, atlas: doc.atlas, colonnes: doc.colonnes, texture: null };
        FICHES[e.categorie].set(sl, e.categorie === 'tenue' ? preparerFicheTenue(f) : f);
      }
    } else if (!CATEGORIES_MODELE.has(e.categorie)) continue;
    INTEGRATION.cosmetiques250.push(e);
    for (const sl of slugs) fichierDe.set(e.categorie + ':' + sl, e.fichier);
    activerCosmetiques(slugs.map(sl => e.categorie + ':' + sl));
  }
  // Tenues en version réaliste HD : UN index pour les 20 tenues de base, la Tenue Staff et les 50 du catalogue.
  // Une tenue du catalogue n'y entre que si elle est déjà en vente (entrée « tenue » de cosmetiques250 active).
  const hd = man.tenues_hd;
  if (hd && hd.actif && hd.fiche) {
    let doc = null;
    try { const r = await fetch(`modeles/${hd.fiche}?v=${VERSION}`); if (r.ok) doc = await r.json(); } catch (err) { doc = null; }
    if (doc && Array.isArray(doc.tenues) && doc.cases) {
      for (const t of doc.tenues) {
        if (!t || !t.slug || !t.image || !t.fichier) continue;
        if (t.origine === 'catalogue_250' && !FICHES.tenue.has(t.slug)) continue;
        FICHES.tenue.set(t.slug, preparerFicheTenue({ ...t, cases: doc.cases, taille: doc.taille_image || 512, hd: true }));
      }
      INTEGRATION.tenuesHD = true;
    } else console.warn('Index des tenues HD illisible :', hd.fiche);
  }
  // Ensemble Staff livré (casquette, sac radio, pioche, deltaplane, salut, traînée) : chargé à la demande comme les 250,
  // mais JAMAIS mis en vente (pas d'activerCosmetiques) : ces pièces restent réservées au staff (js/boutique.js).
  const es = man.ensemble_staff;
  if (es && es.actif && es.fiche) {
    let doc = null;
    try { const r = await fetch(`modeles/${es.fiche}?v=${VERSION}`); if (r.ok) doc = await r.json(); } catch (err) { doc = null; }
    if (doc && Array.isArray(doc.objets)) {
      for (const o of doc.objets) if (o && CATEGORIES_MODELE.has(o.categorie) && o.objet === o.categorie + '_staff') fichierDe.set(o.categorie + ':staff', doc.fichier || es.fichier);
      if (doc.emote && doc.emote.clip && doc.emote.fichier) { FICHES.emote.set('staff', { ...doc.emote, slug: 'staff', texture: null }); fichierDe.set('emote:staff', doc.emote.fichier); }
      if (doc.trainee && doc.trainee.atlas) {
        const modele = FICHES.trainee.values().next().value; // même atlas que les traînées des 250 : même nombre de colonnes
        FICHES.trainee.set('staff', { ...doc.trainee, slug: 'staff', fichier: doc.trainee.atlas, atlas: doc.trainee.atlas, colonnes: (modele && modele.colonnes) || 8, texture: null });
        fichierDe.set('trainee:staff', doc.trainee.atlas);
      }
      INTEGRATION.ensembleStaff = true;
    } else console.warn('Fiche de l’ensemble Staff illisible :', es.fiche);
  }
  // Formes de la végétation (inst_tronc, inst_sapin, inst_rocher_1…) : js/monde.js les met dans ses InstancedMesh
  if (man.vegetation && man.vegetation.actif && man.vegetation.fichier) INTEGRATION.vegetation = !!(await chargerFichier(man.vegetation.fichier));
  // Décors des passages secrets et de la nature (trappe, salle au trésor, tour, ruines, campement) : js/monde.js les fond dans le décor
  if (man.decors_secrets && man.decors_secrets.actif && man.decors_secrets.fichier) INTEGRATION.decors = !!(await chargerFichier(man.decors_secrets.fichier, 'decor:'));
  // Animations du personnage (attente, présentation, pioche, deltaplane) : clips « perso_<nom> », lus par js/personnage.js
  if (man.animations_perso && man.animations_perso.actif && man.animations_perso.fichier) await chargerFichier(man.animations_perso.fichier, 'anim:');
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
// L'objet livré lui-même (lecture seule : ne pas le déplacer ni le modifier)
export const objetLivre = nom => BIBLIO[nom] || null;
// Géométrie d'un objet livré (pour les InstancedMesh du décor) ; null s'il n'est pas chargé
export function geometrieGlb(nom) {
  let g = null;
  if (BIBLIO[nom]) BIBLIO[nom].traverse(o => { if (o.isMesh && !g) g = o.geometry; });
  return g;
}

// ---------- Cosmétiques chargés à la demande ----------
// chapeau, dos, pioche, deltaplane : un objet <categorie>_<slug> dans un .glb, affiché tel quel
const CATEGORIES_MODELE = new Set(['chapeau', 'dos', 'pioche', 'deltaplane']);
// tenue (image + pièces 3D ; voir « Tenues : deux niveaux d'image »), emote (clip d'animation), trainee (case d'un atlas + réglages) : fiche JSON
const FICHES = { tenue: new Map(), emote: new Map(), trainee: new Map() };
const fichierDe = new Map(); // « chapeau:capuche_nuageuse » → « cosm250_chapeaux_v001.glb »
const textures = new Map();
const chargeurTex = new THREE.TextureLoader();
function chargerTexture(chemin, lineaire = false) {
  if (!textures.has(chemin)) {
    textures.set(chemin, chargeurTex.loadAsync(`modeles/${chemin}?v=${VERSION}`)
      .then(t => { t.colorSpace = lineaire ? THREE.NoColorSpace : THREE.SRGBColorSpace; t.anisotropy = 4; return t; })
      .catch(err => { console.warn('Image pas chargée :', chemin, err?.message || err); return null; }));
  }
  return textures.get(chemin);
}
const ficheDe = cle => { const [c, s] = cle.split(':'); return FICHES[c] ? FICHES[c].get(s) : null; };
// ---------- Tenues : deux niveaux d'image ----------
// « hd » = image 512 px + carte de relief + carte de lueur (ton personnage, le salon, le casier) ;
// « leger » = image 256 px sans relief (les autres joueurs, les miniatures, la qualité basse).
// En qualité basse (téléphones) : pas de HD, et les 20 tenues de base gardent leur dessin fait en code (rien à télécharger).
export const QUALITE_TENUES = { hd: true, base: true };
const enCode = f => f.origine === 'base' && !QUALITE_TENUES.base;
function preparerFicheTenue(f) {
  const leger = f.image_256
    ? { couleur: f.image_256, lueur: f.image_lueur_256, ombrage: f.image_ombrage_256 }
    : { couleur: f.image, lueur: f.image_lueur, ombrage: f.image_ombrage };
  const hd = f.hd ? { couleur: f.image, relief: f.image_relief, lueur: f.image_lueur, ombrage: f.image_ombrage } : null;
  return { ...f, taille: f.taille || 256, images: { leger, hd }, tex: { leger: null, hd: null }, attente: { leger: null, hd: null } };
}
const niveauTenue = (f, hd) => (hd && QUALITE_TENUES.hd && f.images.hd ? 'hd' : 'leger');
const piecesPretes = f => (f.pieces || []).every(p => BIBLIO[p.objet]);
function chargerTenue(f, hd) {
  if (enCode(f)) return Promise.resolve();
  const n = niveauTenue(f, hd);
  if (!f.attente[n]) {
    const im = f.images[n];
    const une = (chemin, lineaire) => (chemin ? chargerTexture(chemin, lineaire) : Promise.resolve(null));
    f.attente[n] = Promise.all([une(im.couleur), une(im.relief, true), une(im.lueur), une(im.ombrage)])
      .then(([couleur, relief, lueur, ombrage]) => { if (couleur && (!f.teinte || ombrage)) f.tex[n] = { couleur, relief, lueur, ombrage }; });
  }
  return Promise.all([(f.pieces || []).length ? chargerFichier(f.fichier) : null, f.attente[n]]);
}
function fichePrete(cat, f, hd = false) {
  if (cat === 'tenue') return enCode(f) || (!!f.tex[niveauTenue(f, hd)] && piecesPretes(f));
  if (cat === 'emote') return !!ANIMATIONS[f.clip];
  return !!f.texture;
}
export function cosmetiquePret(cle, hd = false) {
  const f = ficheDe(cle);
  if (f) return fichePrete(cle.split(':')[0], f, hd);
  return !fichierDe.has(cle) || !!BIBLIO[cle.replace(':', '_')];
}
// Fiches prêtes à l'emploi (null tant que l'image / le clip n'est pas chargé : le jeu garde l'objet de base)
// Tenue prête : { f, tex, niveau }. Si le niveau demandé n'est pas (encore) chargé, on prend l'autre plutôt que rien.
export function ficheTenue(slug, hd = false) {
  const f = FICHES.tenue.get(slug);
  if (!f || enCode(f) || !piecesPretes(f)) return null;
  const voulu = niveauTenue(f, hd);
  const niveau = f.tex[voulu] ? voulu : f.tex.leger ? 'leger' : f.tex.hd ? 'hd' : null;
  return niveau ? { f, tex: f.tex[niveau], niveau } : null;
}
export const ficheEmote = slug => { const f = FICHES.emote.get(slug); return f && fichePrete('emote', f) ? f : null; };
export const ficheTrainee = slug => { const f = FICHES.trainee.get(slug); return f && fichePrete('trainee', f) ? f : null; };
function chargerFiche(cat, f, hd = false) {
  if (cat === 'tenue') return chargerTenue(f, hd);
  if (cat === 'emote') return chargerFichier(f.fichier);
  return chargerTexture(f.atlas || f.fichier).then(t => { f.texture = t; });
}
export function chargerCosmetiques(cles, hd = false) {
  const taches = new Map();
  for (const cle of cles) {
    if (cosmetiquePret(cle, hd)) continue;
    const f = ficheDe(cle);
    if (f) taches.set(cle, chargerFiche(cle.split(':')[0], f, hd));
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
// (les tenues de base et la Tenue Staff ont aussi une fiche : on les ajoute, en images légères)
export function prechargerCosmetiques() {
  const cles = [...new Set([...fichierDe.keys(), ...[...FICHES.tenue.keys()].map(s => 'tenue:' + s)])];
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
