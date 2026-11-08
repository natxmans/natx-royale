// Armes, objets et raretés + modèles 3D (faits dans Blender, ou en cubes si le fichier ne charge pas).
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';

export const RARETES = [
  { nom: 'Commun', couleur: '#a7adb5', mult: 1 },
  { nom: 'Peu commun', couleur: '#46c24a', mult: 1.07 },
  { nom: 'Rare', couleur: '#3d8dff', mult: 1.14 },
  { nom: 'Épique', couleur: '#b552ff', mult: 1.21 },
  { nom: 'Légendaire', couleur: '#ffad1f', mult: 1.3 },
];

export const OBJETS = {
  pioche:   { nom: 'Pioche', type: 'melee', degats: 20, cadence: 2.2, portee: 3.8, icone: '⛏️' },
  pistolet: { nom: 'Pistolet', type: 'arme', degats: 24, cadence: 6, chargeur: 12, recharge: 1.3, disp: 0.03, dispVisee: 0.012, portee: 180, icone: '🔫', son: 'pistolet' },
  smg:      { nom: 'Mitraillette', type: 'arme', degats: 15, cadence: 11, chargeur: 30, recharge: 2.0, disp: 0.055, dispVisee: 0.035, portee: 120, icone: '💨', son: 'smg' },
  fusil:    { nom: "Fusil d'assaut", type: 'arme', degats: 28, cadence: 5.5, chargeur: 30, recharge: 2.3, disp: 0.04, dispVisee: 0.008, portee: 260, icone: '🎯', son: 'fusil' },
  pompe:    { nom: 'Fusil à pompe', type: 'arme', degats: 11, plombs: 9, cadence: 1.1, chargeur: 5, recharge: 3.2, disp: 0.09, dispVisee: 0.075, portee: 45, icone: '💥', son: 'pompe' },
  sniper:   { nom: 'Fusil de précision', type: 'arme', degats: 100, cadence: 0.7, chargeur: 1, recharge: 2.4, disp: 0.12, dispVisee: 0, portee: 420, zoom: true, multTete: 2.5, icone: '🔭', son: 'sniper' },
  roquettes:{ nom: 'Lance-roquettes', type: 'arme', explosif: true, degats: 80, rayon: 4.5, cadence: 0.75, chargeur: 1, recharge: 2.6, disp: 0.02, dispVisee: 0.004, portee: 320, vitesse: 48, icone: '🚀', son: 'roquette' },
  grenade:  { nom: 'Grenade', type: 'lancer', degats: 70, rayon: 4.2, max: 6, delai: 2.4, icone: '💣' },
  soin:     { nom: 'Trousse de soin', type: 'conso', duree: 3, pv: 40, max: 3, icone: '❤️' },
  pansements:{ nom: 'Pansements', type: 'conso', duree: 2, pv: 15, plafond: 75, max: 10, icone: '🩹' },
  bouclier: { nom: 'Gourde bouclier', type: 'conso', duree: 2, bouclier: 50, max: 2, icone: '🛡️' },
  minigourde:{ nom: 'Mini-gourde', type: 'conso', duree: 1, bouclier: 25, plafond: 50, max: 6, icone: '🧪' },
  munitions:{ nom: 'Munitions', type: 'munitions', icone: '📦' },
  materiaux:{ nom: 'Matériaux', type: 'materiaux', icone: '🪵' },
};

// Armes que les bots savent utiliser (pas d'explosifs)
export const LISTE_ARMES = ['pistolet', 'smg', 'fusil', 'pompe', 'sniper'];
export const ID_OBJET = Object.keys(OBJETS);

// Tirage au sort d'un objet de butin (utilisé par l'hôte). fete = plus de légendaires.
export function tirerButin(r, coffre, fete = false) {
  const x = r();
  let rarete = 0;
  const y = r() + (coffre ? 0.25 : 0) + (fete ? 0.3 : 0);
  if (y > 1.17) rarete = 4; else if (y > 1.0) rarete = 3; else if (y > 0.8) rarete = 2; else if (y > 0.5) rarete = 1;
  if (x < 0.6) {
    const poids = [['pistolet', 3], ['smg', 2.5], ['fusil', 3], ['pompe', 2.5], ['sniper', 1], ['roquettes', coffre ? 0.8 : 0.4]];
    let tot = 0; for (const p of poids) tot += p[1];
    let v = r() * tot, obj = 'pistolet';
    for (const p of poids) { v -= p[1]; if (v <= 0) { obj = p[0]; break; } }
    if (obj === 'roquettes') rarete = Math.max(3, rarete);
    return { objet: obj, rarete, mun: OBJETS[obj].chargeur };
  }
  if (x < 0.67) return { objet: 'grenade', rarete: 1, qte: 2 + (r() < 0.4 ? 1 : 0) };
  if (x < 0.75) return { objet: 'soin', rarete: 1, qte: 1 + (r() < 0.3 ? 1 : 0) };
  if (x < 0.81) return { objet: 'pansements', rarete: 0, qte: 3 + Math.floor(r() * 3) };
  if (x < 0.87) return { objet: 'minigourde', rarete: 2, qte: 2 + (r() < 0.4 ? 1 : 0) };
  if (x < 0.92) return { objet: 'bouclier', rarete: 2, qte: 1 };
  return { objet: 'munitions', rarete: 0, qte: 30 + Math.floor(r() * 30) };
}

// Butin des ravitaillements : que du très bon
export function butinRavitaillement(r) {
  const armes = ['fusil', 'pompe', 'sniper', 'roquettes', 'smg'];
  const obj = armes[Math.floor(r() * armes.length)];
  return [
    { objet: obj, rarete: r() < 0.5 ? 4 : 3, mun: OBJETS[obj].chargeur },
    r() < 0.5 ? { objet: 'minigourde', rarete: 2, qte: 4 } : { objet: 'bouclier', rarete: 2, qte: 2 },
    { objet: 'munitions', qte: 60 }, { objet: 'materiaux', qte: 60 },
  ];
}

export function degatsArme(objet, rarete) {
  return OBJETS[objet].degats * RARETES[rarete || 0].mult;
}

// ---------- Modèles 3D faits dans Blender (modeles/objets.glb) ----------
// Chaque objet du fichier porte le nom de l'objet du jeu (pistolet, smg, ..., coffre).
// Matériaux spéciaux : « rarete » prend la couleur de la rareté, « lueur » devient une bande lumineuse.
const BLENDER = {};
export const modelesPrets = new Promise(resolve => {
  new GLTFLoader().load('modeles/objets.glb?v=2', gltf => {
    for (const o of [...gltf.scene.children]) {
      o.position.set(0, 0, 0);
      BLENDER[o.userData.name || o.name] = o;
    }
    resolve(true);
  }, undefined, err => { console.warn('Modèles Blender pas chargés, on garde les cubes', err); resolve(false); });
});
export function modeleBlender(nom) { return BLENDER[nom] || null; }

const matsSpeciaux = new Map();
function materiauSpecial(mat, rarete) {
  if (mat.name !== 'rarete' && mat.name !== 'lueur') return mat;
  const cle = mat.name + rarete;
  if (!matsSpeciaux.has(cle)) {
    const coul = new THREE.Color(RARETES[rarete].couleur);
    let m;
    if (mat.name === 'rarete') { m = mat.clone(); m.color.copy(coul); }
    else if (rarete >= 1) m = new THREE.MeshBasicMaterial({ color: coul.multiplyScalar(1.4), toneMapped: false });
    else { m = mat.clone(); m.color.set('#3a3d44'); m.emissive.set('#000000'); }
    matsSpeciaux.set(cle, m);
  }
  return matsSpeciaux.get(cle);
}

function cloneBlender(objet, rarete) {
  const g = new THREE.Group();
  const m = BLENDER[objet].clone();
  m.traverse(o => { if (o.isMesh) o.material = materiauSpecial(o.material, rarete); });
  g.add(m);
  return g;
}

// ---------- Modèles 3D en cubes (secours si le fichier Blender ne charge pas) ----------
function cube(w, h, d, couleur, x = 0, y = 0, z = 0) {
  const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), new THREE.MeshLambertMaterial({ color: couleur }));
  m.position.set(x, y, z);
  return m;
}

// L'arme pointe vers -z (devant le personnage)
export function modeleObjet(objet, rarete = 0) {
  if (BLENDER[objet]) return cloneBlender(objet, rarete);
  const g = new THREE.Group();
  const coul = RARETES[rarete].couleur;
  const noir = '#2b2d33';
  switch (objet) {
    case 'pioche':
      g.add(cube(0.08, 0.08, 0.9, '#8a5a2b', 0, 0, -0.3));
      g.add(cube(0.7, 0.12, 0.12, '#c9ced6', 0, 0, -0.75));
      g.add(cube(0.12, 0.14, 0.14, '#9aa', 0.38, -0.04, -0.75));
      break;
    case 'pistolet':
      g.add(cube(0.12, 0.14, 0.42, noir, 0, 0.04, -0.18));
      g.add(cube(0.1, 0.22, 0.12, coul, 0, -0.1, 0));
      break;
    case 'smg':
      g.add(cube(0.14, 0.16, 0.6, noir, 0, 0.04, -0.25));
      g.add(cube(0.1, 0.28, 0.1, coul, 0, -0.14, -0.2));
      g.add(cube(0.1, 0.18, 0.1, noir, 0, -0.08, 0.02));
      break;
    case 'fusil':
      g.add(cube(0.14, 0.18, 0.95, noir, 0, 0.04, -0.35));
      g.add(cube(0.12, 0.26, 0.12, coul, 0, -0.13, -0.3));
      g.add(cube(0.12, 0.2, 0.3, coul, 0, -0.02, 0.2));
      g.add(cube(0.08, 0.08, 0.2, '#555', 0, 0.16, -0.3));
      break;
    case 'pompe':
      g.add(cube(0.16, 0.16, 0.9, '#5a3a1e', 0, 0.02, -0.3));
      g.add(cube(0.12, 0.12, 0.6, noir, 0, 0.12, -0.5));
      g.add(cube(0.17, 0.1, 0.25, coul, 0, -0.06, -0.45));
      break;
    case 'sniper':
      g.add(cube(0.12, 0.14, 1.35, noir, 0, 0.04, -0.5));
      g.add(cube(0.1, 0.1, 0.4, '#333', 0, 0.2, -0.35));
      g.add(cube(0.14, 0.22, 0.35, coul, 0, -0.04, 0.2));
      break;
    case 'soin':
      g.add(cube(0.45, 0.32, 0.25, '#f2f2f2'));
      g.add(cube(0.08, 0.22, 0.26, '#e53935'));
      g.add(cube(0.22, 0.08, 0.26, '#e53935'));
      break;
    case 'bouclier':
      g.add(cube(0.22, 0.38, 0.22, '#3aa0ff'));
      g.add(cube(0.12, 0.1, 0.12, '#dfe9f5', 0, 0.24, 0));
      break;
    case 'munitions':
      g.add(cube(0.5, 0.28, 0.32, '#5f7d3a'));
      g.add(cube(0.52, 0.06, 0.34, '#d8b23a', 0, 0.06, 0));
      break;
    case 'materiaux':
      g.add(cube(0.6, 0.18, 0.18, '#c8955a', 0, 0, -0.1));
      g.add(cube(0.6, 0.18, 0.18, '#b98448', 0, 0.18, 0.05));
      break;
    case 'roquettes': {
      const tube = new THREE.Mesh(new THREE.CylinderGeometry(0.11, 0.11, 1.3, 12), new THREE.MeshLambertMaterial({ color: '#4d5a3a' }));
      tube.rotation.x = Math.PI / 2; tube.position.set(0, 0.1, -0.35); g.add(tube);
      const bouche = new THREE.Mesh(new THREE.CylinderGeometry(0.14, 0.12, 0.16, 12), new THREE.MeshLambertMaterial({ color: coul }));
      bouche.rotation.x = Math.PI / 2; bouche.position.set(0, 0.1, -1.0); g.add(bouche);
      const ogive = new THREE.Mesh(new THREE.ConeGeometry(0.09, 0.22, 10), new THREE.MeshLambertMaterial({ color: '#e74c3c' }));
      ogive.rotation.x = -Math.PI / 2; ogive.position.set(0, 0.1, -1.12); g.add(ogive);
      g.add(cube(0.1, 0.24, 0.12, noir, 0, -0.1, -0.15));
      g.add(cube(0.1, 0.2, 0.1, noir, 0, -0.08, 0.15));
      g.add(cube(0.08, 0.12, 0.2, coul, 0.12, 0.2, -0.3));
      break;
    }
    case 'grenade': {
      const boule = new THREE.Mesh(new THREE.SphereGeometry(0.14, 14, 10), new THREE.MeshLambertMaterial({ color: '#4f7a3a' }));
      boule.scale.y = 1.15; g.add(boule);
      g.add(cube(0.08, 0.08, 0.08, '#2b2d33', 0, 0.17, 0));
      const anneau = new THREE.Mesh(new THREE.TorusGeometry(0.05, 0.012, 6, 12), new THREE.MeshLambertMaterial({ color: '#d4a017' }));
      anneau.position.set(0.07, 0.2, 0); g.add(anneau);
      g.add(cube(0.04, 0.14, 0.03, '#c9ced6', -0.06, 0.12, 0));
      break;
    }
    case 'minigourde': {
      const fiole = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.11, 0.24, 12), new THREE.MeshLambertMaterial({ color: '#4fc3ff', emissive: '#0b4a7a' }));
      g.add(fiole);
      const col = new THREE.Mesh(new THREE.CylinderGeometry(0.045, 0.06, 0.08, 10), new THREE.MeshLambertMaterial({ color: '#dfe9f5' }));
      col.position.y = 0.16; g.add(col);
      g.add(cube(0.07, 0.04, 0.07, '#3d8dff', 0, 0.22, 0));
      break;
    }
    case 'pansements':
      g.add(cube(0.36, 0.1, 0.22, '#f4d7b5'));
      g.add(cube(0.12, 0.11, 0.23, '#e8bf96'));
      g.add(cube(0.05, 0.115, 0.05, '#e53935', -0.12, 0, 0));
      break;
    case 'ravitaillement': {
      g.add(cube(1.6, 1.2, 1.6, '#3d8dff', 0, 0.6, 0));
      g.add(cube(1.66, 0.16, 1.66, '#ffd23f', 0, 0.1, 0));
      g.add(cube(1.66, 0.16, 1.66, '#ffd23f', 0, 1.1, 0));
      g.add(cube(0.16, 1.24, 1.66, '#ffd23f', 0, 0.6, 0));
      g.add(cube(1.66, 1.24, 0.16, '#ffd23f', 0, 0.6, 0));
      const para = new THREE.Group(); para.name = 'parachute';
      const toile = new THREE.Mesh(new THREE.SphereGeometry(2.6, 16, 8, 0, Math.PI * 2, 0, Math.PI / 2.4), new THREE.MeshLambertMaterial({ color: '#ff5d8f', side: THREE.DoubleSide }));
      toile.position.y = 4.2; toile.scale.y = 0.6; para.add(toile);
      for (const [x, z] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) {
        const fil = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.02, 3.4, 4), new THREE.MeshLambertMaterial({ color: '#eeeeee' }));
        fil.position.set(x * 1.1, 2.9, z * 1.1); fil.rotation.set(z * 0.28, 0, -x * 0.28); para.add(fil);
      }
      g.add(para);
      break;
    }
  }
  // Bande lumineuse de la couleur de la rareté
  if (OBJETS[objet] && OBJETS[objet].type === 'arme' && rarete >= 1) {
    const s = new THREE.Mesh(new THREE.BoxGeometry(0.155, 0.035, 0.32), new THREE.MeshBasicMaterial({ color: new THREE.Color(coul).multiplyScalar(1.4), toneMapped: false }));
    s.position.set(0, 0.13, -0.22);
    g.add(s);
  }
  return g;
}
