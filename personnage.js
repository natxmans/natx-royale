// Personnages arrondis (style dessin animé original) : corps, visage, cheveux,
// tenues, chapeaux, objets de dos, pioches, deltaplanes et émotes de la boutique.
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { modeleObjet } from './armes.js';
import { modeleGlb } from './modeles.js';
import { LOOK_DEFAUT } from './boutique.js';

const PEAUX = ['#f6cfa6', '#e2a873', '#b07445', '#7d4b2b', '#f1c6a0', '#c98b5a'];
const CHEVEUX = ['#3b2414', '#1c1c22', '#e0b54f', '#b5491f', '#6b4423', '#d9d3c7', '#2d1a0e'];
const YEUX = ['#3b2414', '#2b6cb0', '#2f855a', '#4a3423', '#1c1c22'];
export const NEON = { cyan: '#22e8ff', rose: '#ff2e88', violet: '#b026ff', fond: '#0a0a14' };

// ---------- Matériaux et textures ----------
const cacheTex = new Map(), cacheMat = new Map(), cacheGeo = new Map();
function tex(cle, dessin, w = 64, h = 32) {
  if (cacheTex.has(cle)) return cacheTex.get(cle);
  const cv = document.createElement('canvas'); cv.width = w; cv.height = h;
  const g = cv.getContext('2d');
  dessin(g, w, h);
  const t = new THREE.CanvasTexture(cv);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  cacheTex.set(cle, t);
  return t;
}
const rect = (g, c, x, y, w, h) => { g.fillStyle = c; g.fillRect(x, y, w, h); };
const sombre = (c, k = 0.45) => '#' + new THREE.Color(c).multiplyScalar(k).getHexString();
const clair = (c, k = 0.25) => '#' + new THREE.Color(c).lerp(new THREE.Color('#ffffff'), k).getHexString();
function mat(cle, fabrique) { if (!cacheMat.has(cle)) cacheMat.set(cle, fabrique()); return cacheMat.get(cle); }
function geo(cle, fabrique) { if (!cacheGeo.has(cle)) cacheGeo.set(cle, fabrique()); return cacheGeo.get(cle); }
const M = (c, extra = {}) => mat('c' + c + JSON.stringify(extra), () => new THREE.MeshLambertMaterial({ color: c, ...extra }));
// Texture qui fait le tour du corps : le milieu de l'image = le devant
const W = (cle, dessin, extra = {}, w = 64, h = 32) => mat('w' + cle, () => new THREE.MeshLambertMaterial({ map: tex(cle, dessin, w, h), ...extra }));
const WL = (cle, dessin, lueur, w = 64, h = 32) => mat('wl' + cle, () => new THREE.MeshLambertMaterial({ map: tex(cle, dessin, w, h), emissiveMap: tex(cle + '-e', lueur, w, h), emissive: '#ffffff', emissiveIntensity: 1.5 }));
const METAL = (c, rugo = 0.35, extra = {}) => mat('m' + c + rugo + JSON.stringify(extra), () => new THREE.MeshStandardMaterial({ color: c, metalness: 0.85, roughness: rugo, ...extra }));
const LUEUR = c => mat('l' + c, () => new THREE.MeshBasicMaterial({ color: new THREE.Color(c).multiplyScalar(2.2), toneMapped: false }));

// Texte néon façon 2K27
function texte2k27(g, x, y, taille, contour = true) {
  g.font = `900 ${taille}px Orbitron, 'Lilita One', system-ui, sans-serif`;
  g.textAlign = 'center'; g.textBaseline = 'middle';
  if (contour) { g.strokeStyle = NEON.rose; g.lineWidth = Math.max(1, taille / 7); g.strokeText('2K27', x, y); }
  g.fillStyle = NEON.cyan; g.fillText('2K27', x, y);
}

// ---------- Tenues ----------
// torse / bras (haut des bras) / avantBras / bas (bassin + cuisses) / tibias / pieds / mains / ceinture
function tenue(id, c, peau) {
  const P = M(peau);
  const pant = sombre(c, 0.42);
  switch (id) {
    case 'mariniere': {
      const r = W('mar', (g, w, h) => { rect(g, '#fafafa', 0, 0, w, h); for (let y = 2; y < h; y += 5) rect(g, '#1f3c88', 0, y, w, 2); });
      return { torse: r, bras: r, avantBras: r, bas: M('#2b3550'), pieds: M('#f1f1f1'), ceinture: M('#1f3c88') };
    }
    case 'sportif': {
      const num = (g, x) => { g.fillStyle = '#ffffff'; g.font = 'bold 13px system-ui'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText('10', x, 17); };
      const t = W('sp' + c, (g, w, h) => { rect(g, c, 0, 0, w, h); rect(g, '#ffffff', 0, 0, w, 3); rect(g, '#ffffff', 0, h - 3, w, 3); num(g, w / 2); num(g, 0); num(g, w); });
      const manche = W('spm' + c, (g, w, h) => { rect(g, c, 0, 0, w, h); rect(g, '#ffffff', 0, h - 5, w, 3); }, {}, 32, 16);
      return { torse: t, bras: manche, avantBras: P, bas: M('#f4f4f4'), tibias: W('chaussette' + c, (g, w, h) => { rect(g, peau, 0, 0, w, h); rect(g, '#ffffff', 0, 9, w, 7); rect(g, c, 0, 10, w, 2); }, {}, 32, 16), pieds: M('#1c1c1c'), ceinture: M('#f4f4f4') };
    }
    case 'cuisinier': {
      const t = W('chef', (g, w, h) => { rect(g, '#fbfbfb', 0, 0, w, h); rect(g, '#e3e3e3', 31, 0, 2, h); for (let y = 6; y < h; y += 7) { rect(g, '#d4a017', 26, y, 2, 2); rect(g, '#d4a017', 36, y, 2, 2); } });
      const pant = W('chefpant', (g, w, h) => { for (let y = 0; y < h; y += 2) for (let x = 0; x < w; x += 2) rect(g, (x + y) % 4 ? '#222' : '#ddd', x, y, 2, 2); }, {}, 32, 16);
      return { torse: t, bras: M('#fbfbfb'), avantBras: M('#fbfbfb'), bas: pant, pieds: M('#1c1c1c'), ceinture: M('#fbfbfb') };
    }
    case 'fermier': {
      const plaid = (g, w, h) => { rect(g, '#d63031', 0, 0, w, h); for (let i = 0; i < w; i += 8) rect(g, 'rgba(0,0,0,.25)', i, 0, 3, h); for (let i = 0; i < h; i += 8) rect(g, 'rgba(0,0,0,.25)', 0, i, w, 3); };
      const t = W('salop', (g, w, h) => { plaid(g, w, h); rect(g, '#3a63a8', 22, 11, 20, h - 11); rect(g, '#3a63a8', 22, 0, 4, 12); rect(g, '#3a63a8', 38, 0, 4, 12); rect(g, '#3a63a8', 6, 0, 4, h); rect(g, '#3a63a8', 54, 0, 4, h); rect(g, '#f1c40f', 23, 11, 2, 2); rect(g, '#f1c40f', 39, 11, 2, 2); rect(g, '#2c4f8c', 27, 16, 10, 6); });
      const m = W('plaid', plaid, {}, 32, 16);
      return { torse: t, bras: m, avantBras: m, bas: M('#3a63a8'), pieds: M('#5a3a1e'), ceinture: M('#3a63a8') };
    }
    case 'camouflage': {
      const camo = W('camo', (g, w, h) => {
        rect(g, '#5b6b3a', 0, 0, w, h);
        const cs = ['#3f4a26', '#7d8a4e', '#2f2a1c', '#6b5a3a'];
        let s = 7; const r = () => (s = (s * 9301 + 49297) % 233280) / 233280;
        for (let i = 0; i < 40; i++) { g.fillStyle = cs[i % 4]; g.beginPath(); g.ellipse(r() * w, r() * h, 2 + r() * 5, 1.5 + r() * 3, r() * 3, 0, 7); g.fill(); }
      });
      return { torse: camo, bras: camo, avantBras: camo, bas: camo, pieds: M('#2d2a22'), ceinture: M('#3b3324') };
    }
    case 'pyjama': {
      const p = W('pyjama', (g, w, h) => { rect(g, '#253a7a', 0, 0, w, h); g.fillStyle = '#ffe066'; g.font = '8px serif'; for (const [x, y] of [[6, 6], [20, 12], [33, 5], [46, 14], [58, 7], [12, 24], [27, 27], [40, 25], [54, 28]]) g.fillText('★', x, y); });
      return { torse: p, bras: p, avantBras: p, bas: p, pieds: M('#e17055'), ceinture: M('#253a7a') };
    }
    case 'pirate': {
      const t = W('pirate', (g, w, h) => { rect(g, '#6b3f1d', 0, 0, w, h); rect(g, '#f3ecdc', 24, 0, 16, h); rect(g, '#e8dcc3', 30, 2, 4, 12); rect(g, '#d4a017', 21, 9, 2, 2); rect(g, '#d4a017', 21, 17, 2, 2); rect(g, '#c0392b', 0, h - 6, w, 6); });
      return { torse: t, bras: M('#f3ecdc'), avantBras: M('#f3ecdc'), bas: M('#2b2b33'), pieds: M('#2a1a0e'), ceinture: M('#c0392b') };
    }
    case 'ninja': {
      const t = W('ninja', (g, w, h) => { rect(g, '#17181d', 0, 0, w, h); g.strokeStyle = '#2a2c36'; g.lineWidth = 4; g.beginPath(); g.moveTo(20, 0); g.lineTo(40, h); g.moveTo(44, 0); g.lineTo(24, h); g.stroke(); });
      return { torse: t, bras: M('#17181d'), avantBras: M('#17181d'), bas: M('#17181d'), pieds: M('#101114'), ceinture: M('#d63031'), mains: M('#17181d'), masque: true };
    }
    case 'smoking': {
      const t = W('smoking', (g, w, h) => {
        rect(g, '#1b1d24', 0, 0, w, h);
        g.fillStyle = '#ffffff'; g.beginPath(); g.moveTo(25, 0); g.lineTo(39, 0); g.lineTo(32, h - 6); g.fill();
        rect(g, '#c0392b', 27, 1, 10, 3); rect(g, '#a93226', 31, 1, 2, 3);
        rect(g, '#1b1d24', 31, 10, 2, 2); rect(g, '#1b1d24', 31, 16, 2, 2);
      });
      return { torse: t, bras: M('#1b1d24'), avantBras: M('#1b1d24'), bas: M('#1b1d24'), pieds: M('#0d0d10'), ceinture: M('#0d0d10') };
    }
    case 'chevalier': {
      const a = METAL('#b8c0cc', 0.3);
      const t = mat('chev', () => new THREE.MeshStandardMaterial({ map: tex('chev', (g, w, h) => { rect(g, '#b8c0cc', 0, 0, w, h); rect(g, '#c0392b', 22, 0, 20, h); rect(g, '#f5f5f5', 30, 4, 4, 22); rect(g, '#f5f5f5', 25, 10, 14, 4); for (let x = 0; x < w; x += 8) rect(g, '#8e979f', x, h - 2, 6, 2); }), metalness: 0.6, roughness: 0.35 }));
      return { torse: t, bras: a, avantBras: a, bas: a, pieds: METAL('#7b838d'), ceinture: M('#5a3a1e'), mains: METAL('#7b838d') };
    }
    case 'robot': {
      const m = METAL('#9aa3ad', 0.35);
      const panneau = (g, w, h, lueur) => {
        if (!lueur) { rect(g, '#9aa3ad', 0, 0, w, h); rect(g, '#3d4450', 22, 6, 20, 16); for (let x = 2; x < w; x += 12) { rect(g, '#6c757d', x, 2, 2, 2); rect(g, '#6c757d', x, h - 4, 2, 2); } }
        else rect(g, '#000', 0, 0, w, h);
        for (const [x, c] of [[25, '#ff4d4d'], [30, '#4fff7a'], [35, '#4fb3ff']]) rect(g, c, x, 9, 4, 4);
        rect(g, '#ffd23f', 25, 16, 14, 2);
      };
      const t = mat('robot', () => new THREE.MeshStandardMaterial({ map: tex('robot', (g, w, h) => panneau(g, w, h, false)), emissiveMap: tex('robot-e', (g, w, h) => panneau(g, w, h, true)), emissive: '#ffffff', emissiveIntensity: 1.4, metalness: 0.8, roughness: 0.35 }));
      return { torse: t, bras: m, avantBras: METAL('#7b838d'), bas: METAL('#7b838d'), pieds: METAL('#4a5059'), ceinture: METAL('#4a5059'), mains: METAL('#4a5059'), robot: true };
    }
    case 'astronaute': {
      const t = W('astro', (g, w, h) => { rect(g, '#f4f6f8', 0, 0, w, h); rect(g, '#ff7b39', 0, h - 9, w, 3); rect(g, '#2b3a55', 24, 6, 16, 10); rect(g, '#ff4d4d', 26, 8, 3, 2); rect(g, '#4fff7a', 30, 8, 3, 2); rect(g, '#ffd23f', 34, 8, 2, 2); rect(g, '#4fb3ff', 26, 12, 12, 2); rect(g, '#3d8dff', 44, 4, 6, 4); rect(g, '#cfd6de', 0, 0, w, 2); });
      const bras = W('astro-bras', (g, w, h) => { rect(g, '#f4f6f8', 0, 0, w, h); rect(g, '#ff7b39', 0, 6, w, 3); }, {}, 32, 16);
      return { torse: t, bras, avantBras: M('#f4f6f8'), bas: M('#eef1f4'), pieds: M('#cfd6de'), ceinture: M('#c8ced6'), mains: M('#e8ebee') };
    }
    case 'lave': {
      const d = (g, w, h) => {
        rect(g, '#1d1414', 0, 0, w, h);
        g.strokeStyle = '#ff6a00'; g.lineWidth = 2;
        for (const l of [[[2, 4], [12, 11], [9, 18], [18, 30]], [[30, 0], [26, 9], [38, 15], [33, 24], [44, 31]], [[50, 2], [58, 12], [54, 22], [63, 30]], [[0, 22], [8, 20]], [[20, 2], [23, 7]]]) { g.beginPath(); g.moveTo(...l[0]); for (const p of l.slice(1)) g.lineTo(...p); g.stroke(); }
      };
      const m = WL('lave', d, d);
      return { torse: m, bras: m, avantBras: m, bas: m, pieds: M('#120d0d'), ceinture: M('#120d0d'), mains: M('#2b1b1b') };
    }
    case 'neon': {
      const d = (g, w, h, fond = true) => { rect(g, fond ? '#14121f' : '#000', 0, 0, w, h); rect(g, NEON.rose, 0, 6, w, 2); rect(g, NEON.cyan, 0, 23, w, 2); rect(g, NEON.rose, 31, 6, 2, 18); rect(g, NEON.cyan, 8, 13, 10, 2); rect(g, NEON.cyan, 46, 15, 10, 2); };
      const m = WL('neon', g => d(g, 64, 32), g => d(g, 64, 32, false));
      return { torse: m, bras: m, avantBras: m, bas: m, pieds: M('#0d0c14'), ceinture: LUEUR(NEON.cyan), mains: M('#14121f') };
    }
    case 'pompier': {
      const veste = W('pompier', (g, w, h) => { rect(g, '#b3261e', 0, 0, w, h); rect(g, '#ffd23f', 0, 18, w, 4); rect(g, '#e8ecf1', 0, 19, w, 2); rect(g, '#2b2d33', 31, 0, 2, h); for (let y = 4; y < 16; y += 5) rect(g, '#ffd23f', 27, y, 10, 1); rect(g, '#2b2d33', 0, h - 3, w, 3); });
      const manche = W('pompier-m', (g, w, h) => { rect(g, '#b3261e', 0, 0, w, h); rect(g, '#ffd23f', 0, 8, w, 3); rect(g, '#e8ecf1', 0, 9, w, 1); }, {}, 32, 16);
      const pant = W('pompier-p', (g, w, h) => { rect(g, '#2b2f3a', 0, 0, w, h); rect(g, '#ffd23f', 0, 9, w, 3); rect(g, '#e8ecf1', 0, 10, w, 1); }, {}, 32, 16);
      return { torse: veste, bras: manche, avantBras: manche, bas: M('#2b2f3a'), tibias: pant, pieds: M('#141414'), ceinture: M('#2b2d33'), mains: M('#e0b23a') };
    }
    case 'sorcier': {
      const robe = W('sorcier', (g, w, h) => {
        rect(g, '#3b1f6b', 0, 0, w, h);
        g.fillStyle = '#ffe27a'; g.font = '7px serif';
        for (const [x, y] of [[5, 8], [16, 21], [45, 9], [56, 22], [10, 29], [50, 30], [22, 6]]) g.fillText('★', x, y);
        rect(g, '#d4a017', 30, 0, 4, h); rect(g, '#d4a017', 0, h - 3, w, 3);
        g.fillStyle = '#d4a017'; g.beginPath(); g.arc(40, 15, 4, 0, 7); g.fill(); g.fillStyle = '#3b1f6b'; g.beginPath(); g.arc(42, 14, 3.5, 0, 7); g.fill();
      });
      const robeM = W('sorcier-m', (g, w, h) => { rect(g, '#3b1f6b', 0, 0, w, h); rect(g, '#d4a017', 0, h - 4, w, 3); }, {}, 32, 16);
      return { torse: robe, bras: robeM, avantBras: robeM, bas: robe, tibias: M('#3b1f6b'), pieds: M('#5a3a1e'), ceinture: M('#d4a017') };
    }
    case 'statue': {
      const o = METAL('#e8b923', 0.25);
      return { torse: o, bras: o, avantBras: o, bas: o, pieds: o, ceinture: METAL('#b8860b', 0.3), mains: o, or: true };
    }
    case 'sweat2k27': { // collab 2K27
      const d = (g, w, h, lueur) => {
        rect(g, lueur ? '#000' : '#121222', 0, 0, w, h);
        rect(g, NEON.cyan, 0, h - 8, w, 3); rect(g, NEON.rose, 0, h - 4, w, 2);
        texte2k27(g, w / 2, 26, 15);
        g.font = '900 9px Orbitron, system-ui'; g.fillStyle = NEON.rose; g.textAlign = 'center'; g.fillText('NATX', 0, 26); g.fillText('NATX', w, 26);
        if (!lueur) { rect(g, '#1d1d33', 54, 42, 20, 9); }
      };
      const t = WL('sweat2k27b', (g, w, h) => d(g, w, h, false), (g, w, h) => d(g, w, h, true), 128, 64);
      const manche = WL('sweat2k27m', (g, w, h) => { rect(g, '#121222', 0, 0, w, h); rect(g, NEON.cyan, 0, 4, w, 2); rect(g, NEON.rose, 0, 8, w, 2); }, (g, w, h) => { rect(g, '#000', 0, 0, w, h); rect(g, NEON.cyan, 0, 4, w, 2); rect(g, NEON.rose, 0, 8, w, 2); }, 32, 16);
      return { torse: t, bras: manche, avantBras: M('#121222'), bas: M('#1a1a2e'), pieds: W('basket2k27', (g, w, h) => { rect(g, '#f4f4f4', 0, 0, w, h); rect(g, NEON.rose, 0, h - 5, w, 2); rect(g, NEON.cyan, 0, h - 3, w, 2); }, {}, 32, 16), ceinture: M('#121222'), capuche: '#121222' };
    }
    case 'tee2k27': { // collab 2K27 (offert)
      const d = (g, w, h, lueur) => {
        rect(g, lueur ? '#000' : '#0a0a14', 0, 0, w, h);
        texte2k27(g, w / 2, 24, 15);
        rect(g, NEON.violet, w / 2 - 16, 36, 32, 2);
        texte2k27(g, 0, 26, 12, false); texte2k27(g, w, 26, 12, false);
      };
      return { torse: WL('tee2k27b', (g, w, h) => d(g, w, h, false), (g, w, h) => d(g, w, h, true), 128, 64), bras: M('#0a0a14'), avantBras: M(peau), bas: M('#2c3e6b'), pieds: M('#f4f4f4'), ceinture: M('#1d1d2a') };
    }
    default: { // classique : ta couleur
      const t = W('cl' + c, (g, w, h) => { rect(g, c, 0, 0, w, h); rect(g, clair(c, 0.35), 24, 0, 16, 3); rect(g, sombre(c, 0.75), 31, 3, 2, h - 3); rect(g, sombre(c, 0.8), 22, 16, 7, 7); rect(g, sombre(c, 0.85), 0, h - 3, w, 3); });
      return { torse: t, bras: M(c), avantBras: M(peau), bas: M(pant), pieds: M('#24262d'), ceinture: M('#24262d') };
    }
  }
}

// ---------- Chapeaux (par rapport au centre de la tête, rayon ≈ 0.25) ----------
// Chapeaux faits dans Blender (cosmetiques.glb) : posés sur le crâne du perso Blender
const CHAPEAUX_COUVRANTS = new Set(['casquette', 'bonnet', 'cowboy', 'toque', 'hautdeforme', 'viking', 'tricorne', 'helice', 'sorcier', 'casquepompier']);
function chapeau(id, c, blender = false) {
  if (blender) {
    const bl = modeleGlb('chapeau_' + id);
    if (bl) {
      const g = new THREE.Group(); g.add(bl);
      if (id === 'aureole') bl.userData.flotte2 = 0.001;
      return { groupe: g, cacheCheveux: id === 'heaume', couvre: CHAPEAUX_COUVRANTS.has(id), blender: true };
    }
  }
  const g = new THREE.Group();
  let cache = false, couvre = false;
  const add = (geom, m, x = 0, y = 0, z = 0, rx = 0, ry = 0, rz = 0) => { const o = new THREE.Mesh(geom, m); o.position.set(x, y, z); o.rotation.set(rx, ry, rz); g.add(o); return o; };
  const DOME = (r, k = 0.5) => new THREE.SphereGeometry(r, 20, 12, 0, Math.PI * 2, 0, Math.PI * k);
  const C = (rt, rb, h, s = 16) => new THREE.CylinderGeometry(rt, rb, h, s);
  const comp = '#' + new THREE.Color(c).offsetHSL(0.5, 0, -0.05).getHexString();
  switch (id) {
    case 'casquette':
      add(DOME(0.292), M(comp), 0, 0.08, 0.01).scale.y = 0.92;
      add(new THREE.CylinderGeometry(0.21, 0.21, 0.025, 20, 1, false, Math.PI / 2, Math.PI), M(comp), 0, 0.095, -0.2).scale.set(1.1, 1, 1);
      add(new THREE.SphereGeometry(0.035, 8, 6), M('#ffffff'), 0, 0.355, 0.01);
      couvre = true; break;
    case 'bonnet': {
      const m = W('bonnet' + c, (gg, w, h) => { rect(gg, comp, 0, 0, w, h); for (let y = 0; y < h; y += 8) rect(gg, '#ffffff', 0, y, w, 3); });
      add(DOME(0.292), m, 0, 0.09, 0.01).scale.y = 1.15;
      add(new THREE.TorusGeometry(0.29, 0.045, 8, 24), M('#ffffff'), 0, 0.1, 0.01, Math.PI / 2);
      add(new THREE.SphereGeometry(0.09, 12, 10), M('#ffffff'), 0, 0.47, 0.01);
      cache = true; break;
    }
    case 'cowboy':
      add(C(0.48, 0.48, 0.03, 24), M('#8b5a2b'), 0, 0.14, 0, 0.05);
      add(C(0.21, 0.25, 0.26, 18), M('#8b5a2b'), 0, 0.3, 0);
      add(C(0.255, 0.255, 0.05, 18), M('#3b2414'), 0, 0.19, 0);
      cache = true; break;
    case 'toque':
      add(C(0.26, 0.26, 0.12, 20), M('#ffffff'), 0, 0.2, 0);
      add(C(0.34, 0.26, 0.36, 20), M('#ffffff'), 0, 0.42, 0);
      add(DOME(0.34), M('#ffffff'), 0, 0.6, 0).scale.y = 0.6;
      cache = true; break;
    case 'bandeau': {
      const r = M('#d63031');
      add(new THREE.TorusGeometry(0.262, 0.032, 8, 28), r, 0, 0.14, 0, Math.PI / 2);
      const r1 = add(new THREE.BoxGeometry(0.05, 0.03, 0.3), r, 0.05, 0.06, 0.38, 0.3, 0.2, 0); r1.userData.flotte = 1;
      const r2 = add(new THREE.BoxGeometry(0.05, 0.03, 0.26), r, -0.05, 0.04, 0.36, 0.5, -0.2, 0); r2.userData.flotte = 1;
      break;
    }
    case 'hautdeforme':
      add(C(0.36, 0.36, 0.03, 24), M('#15161b'), 0, 0.17, 0);
      add(C(0.2, 0.2, 0.44, 20), M('#15161b'), 0, 0.4, 0);
      add(C(0.205, 0.205, 0.07, 20), M('#c0392b'), 0, 0.23, 0);
      cache = true; break;
    case 'viking':
      add(DOME(0.295), METAL('#9aa3ad'), 0, 0.08, 0.01);
      add(new THREE.TorusGeometry(0.292, 0.035, 8, 24), METAL('#b8860b'), 0, 0.09, 0.01, Math.PI / 2);
      for (const s of [-1, 1]) add(new THREE.ConeGeometry(0.06, 0.36, 10), M('#f3ecdc'), 0.31 * s, 0.28, 0, 0, 0, -0.6 * s);
      cache = true; break;
    case 'chat':
      for (const s of [-1, 1]) {
        add(new THREE.ConeGeometry(0.09, 0.18, 4), M(comp), 0.14 * s, 0.26, 0, 0, Math.PI / 4, -0.2 * s);
        add(new THREE.ConeGeometry(0.05, 0.11, 4), M('#ffb3c7'), 0.14 * s, 0.25, -0.035, 0, Math.PI / 4, -0.2 * s);
      }
      break;
    case 'tricorne':
      add(C(0.42, 0.42, 0.13, 3), M('#1b1d24'), 0, 0.22, 0, 0, Math.PI, 0);
      add(C(0.43, 0.43, 0.035, 3), M('#d4a017'), 0, 0.29, 0, 0, Math.PI, 0);
      add(C(0.21, 0.24, 0.16, 16), M('#1b1d24'), 0, 0.31, 0);
      cache = true; break;
    case 'helice': {
      const m = W('helice', (gg, w, h) => { const cs = ['#d63031', '#f1c40f', '#3d8dff', '#2ecc71']; for (let i = 0; i < 4; i++) rect(gg, cs[i], i * 16, 0, 16, h); });
      add(DOME(0.292), m, 0, 0.08, 0.01);
      add(new THREE.CylinderGeometry(0.2, 0.2, 0.02, 20, 1, false, Math.PI / 2, Math.PI), M('#d63031'), 0, 0.095, -0.2);
      add(C(0.015, 0.015, 0.12, 6), M('#555'), 0, 0.42, 0);
      const h = new THREE.Group(); h.position.y = 0.48;
      h.add(new THREE.Mesh(new THREE.BoxGeometry(0.55, 0.015, 0.08), M('#f1c40f')));
      h.add(new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.015, 0.55), M('#3d8dff')));
      h.userData.tourne = 14; g.add(h);
      cache = true; break;
    }
    case 'cornes':
      for (const s of [-1, 1]) add(new THREE.ConeGeometry(0.05, 0.18, 10), M('#c0392b', { emissive: '#3a0000' }), 0.13 * s, 0.24, -0.04, 0, 0, -0.35 * s);
      break;
    case 'heaume': {
      const a = METAL('#b8c0cc', 0.3);
      add(new THREE.SphereGeometry(0.31, 20, 16), a, 0, 0.02, 0).scale.set(1, 1.08, 1.02);
      add(new THREE.BoxGeometry(0.3, 0.04, 0.05), M('#111'), 0, 0.03, -0.3);
      add(new THREE.BoxGeometry(0.04, 0.16, 0.05), M('#111'), 0, -0.06, -0.3);
      add(new THREE.BoxGeometry(0.06, 0.22, 0.36), M('#c0392b'), 0, 0.38, 0.04);
      cache = true; break;
    }
    case 'couronne': {
      const o = METAL('#ffc72c', 0.2);
      add(new THREE.CylinderGeometry(0.22, 0.2, 0.12, 20, 1, true), o, 0, 0.25, 0);
      for (let i = 0; i < 6; i++) { const a = i / 6 * Math.PI * 2; add(new THREE.ConeGeometry(0.045, 0.13, 8), o, Math.cos(a) * 0.2, 0.37, Math.sin(a) * 0.2); }
      for (const [x, z, col] of [[0, -0.22, '#e74c3c'], [0.22, 0, '#3d8dff'], [-0.22, 0, '#2ecc71'], [0, 0.22, '#b552ff']]) add(new THREE.OctahedronGeometry(0.035), LUEUR(col), x, 0.25, z);
      break;
    }
    case 'aureole': {
      const a = add(new THREE.TorusGeometry(0.22, 0.03, 8, 28), LUEUR('#ffe27a'), 0, 0.45, 0, Math.PI / 2, 0, 0);
      a.userData.flotte2 = 0.45;
      break;
    }
    case 'bocal':
      add(new THREE.SphereGeometry(0.4, 24, 18), mat('verre', () => new THREE.MeshStandardMaterial({ color: '#cfefff', transparent: true, opacity: 0.25, roughness: 0.05, metalness: 0.1 })), 0, 0.02, 0);
      add(new THREE.TorusGeometry(0.3, 0.055, 8, 24), M('#e9edf1'), 0, -0.29, 0, Math.PI / 2, 0, 0);
      add(C(0.012, 0.012, 0.25, 6), M('#888'), 0.2, 0.42, 0.1);
      add(new THREE.SphereGeometry(0.035, 8, 6), LUEUR('#ff4d4d'), 0.2, 0.56, 0.1);
      break;
    case 'sorcier': {
      const m = W('chapsorcier', (gg, w, h) => { rect(gg, '#3b1f6b', 0, 0, w, h); gg.fillStyle = '#ffe27a'; gg.font = '8px serif'; for (const [x, y] of [[8, 10], [30, 20], [50, 8], [20, 28], [44, 27]]) gg.fillText('★', x, y); });
      add(C(0.5, 0.5, 0.03, 28), M('#3b1f6b'), 0, 0.15, 0);
      add(new THREE.ConeGeometry(0.27, 0.72, 20), m, 0, 0.5, 0.05, -0.18);
      add(new THREE.TorusGeometry(0.265, 0.03, 8, 24), M('#d4a017'), 0, 0.19, 0, Math.PI / 2);
      cache = true; break;
    }
    case 'casquepompier':
      add(DOME(0.31), M('#c0392b'), 0, 0.08, 0.02).scale.y = 0.95;
      add(C(0.36, 0.37, 0.025, 24), M('#a93226'), 0, 0.1, 0.07).scale.set(1, 1, 1.22);
      add(new THREE.BoxGeometry(0.035, 0.09, 0.56), M('#a93226'), 0, 0.37, 0.02);
      add(C(0.085, 0.085, 0.02, 6), METAL('#ffc72c', 0.25), 0, 0.22, -0.29, Math.PI / 2, 0, 0);
      cache = true; break;
    case 'casque2k27': { // collab 2K27 : casque de gamer
      const noir = M('#15151f');
      add(new THREE.TorusGeometry(0.305, 0.035, 8, 24, Math.PI), noir, 0, 0.0, 0.02);
      for (const s of [-1, 1]) {
        add(C(0.1, 0.1, 0.08, 18), noir, 0.27 * s, -0.02, 0, 0, 0, Math.PI / 2);
        add(new THREE.TorusGeometry(0.085, 0.015, 6, 20), LUEUR(s < 0 ? NEON.cyan : NEON.rose), 0.315 * s, -0.02, 0, 0, Math.PI / 2, 0);
      }
      add(C(0.012, 0.012, 0.3, 6), noir, -0.2, -0.14, -0.14, 0.9, 0, -0.5);
      add(new THREE.SphereGeometry(0.03, 8, 6), LUEUR(NEON.cyan), -0.09, -0.2, -0.26);
      break;
    }
  }
  // un chapeau qui « cache les cheveux » laisse quand même ceux de derrière
  if (cache && !['heaume', 'bocal'].includes(id)) { couvre = true; cache = false; }
  if (['couronne'].includes(id)) couvre = false;
  return { groupe: g, cacheCheveux: cache, couvre };
}

// ---------- Objets de dos (par rapport au centre du torse) ----------
function objetDos(id, c, blender = false) {
  if (blender) {
    const bl = modeleGlb('dos_' + id);
    if (bl) { const g = new THREE.Group(); g.add(bl); g.userData.blender = true; return g; }
  }
  const g = new THREE.Group();
  const add = (geom, m, x = 0, y = 0, z = 0, rx = 0, ry = 0, rz = 0) => { const o = new THREE.Mesh(geom, m); o.position.set(x, y, z); o.rotation.set(rx, ry, rz); g.add(o); return o; };
  const B = (w, h, d) => new THREE.BoxGeometry(w, h, d);
  switch (id) {
    case 'sac':
      add(new THREE.CapsuleGeometry(0.2, 0.2, 6, 12), M('#e67e22'), 0, 0, 0.32).scale.set(1.15, 1, 0.65);
      add(new THREE.CapsuleGeometry(0.12, 0.1, 4, 10), M('#d35400'), 0, -0.12, 0.47).scale.set(1.4, 0.8, 0.6);
      for (const s of [-1, 1]) add(B(0.05, 0.5, 0.04), M('#a04000'), 0.14 * s, 0.05, 0.24);
      break;
    case 'cape': {
      const pivot = new THREE.Group(); pivot.position.set(0, 0.33, 0.27);
      const cape = new THREE.Mesh(B(0.7, 1.12, 0.03), M('#c0392b', { side: THREE.DoubleSide })); cape.position.y = -0.56; pivot.add(cape);
      const doublure = new THREE.Mesh(B(0.66, 1.08, 0.02), M('#f1c40f')); doublure.position.set(0, -0.56, -0.02); pivot.add(doublure);
      pivot.userData.cape = true; g.add(pivot);
      break;
    }
    case 'carquois':
      add(new THREE.CylinderGeometry(0.11, 0.09, 0.7, 12), M('#7b4b2a'), 0.06, 0.05, 0.3, 0, 0, 0.45);
      for (let i = 0; i < 3; i++) {
        add(B(0.025, 0.3, 0.025), M('#c8a97e'), -0.1 + i * 0.05, 0.48 - i * 0.02, 0.3 + (i - 1) * 0.04, 0, 0, 0.45);
        add(B(0.07, 0.09, 0.02), M(['#e74c3c', '#ffffff', '#3d8dff'][i]), -0.17 + i * 0.05, 0.63 - i * 0.02, 0.3 + (i - 1) * 0.04, 0, 0, 0.45);
      }
      break;
    case 'guitare': {
      const gr = new THREE.Group(); gr.position.set(0, 0, 0.3); gr.rotation.z = 0.7;
      const corps = new THREE.Mesh(new THREE.CylinderGeometry(0.24, 0.24, 0.09, 20), M('#d35400')); corps.rotation.x = Math.PI / 2; corps.position.y = -0.2;
      const corps2 = new THREE.Mesh(new THREE.CylinderGeometry(0.18, 0.18, 0.09, 20), M('#d35400')); corps2.rotation.x = Math.PI / 2; corps2.position.y = 0.06;
      const trou = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, 0.1, 14), M('#2b1b10')); trou.rotation.x = Math.PI / 2; trou.position.y = -0.08;
      const manche = new THREE.Mesh(B(0.06, 0.58, 0.045), M('#5a3a1e')); manche.position.y = 0.47;
      const tete = new THREE.Mesh(B(0.1, 0.13, 0.05), M('#2b1b10')); tete.position.y = 0.8;
      gr.add(corps, corps2, trou, manche, tete); g.add(gr);
      break;
    }
    case 'bouclier': {
      const tx = W('blason', (gg) => { rect(gg, '#8b5a2b', 0, 0, 64, 64); gg.fillStyle = '#3d8dff'; gg.beginPath(); gg.arc(32, 32, 24, 0, 7); gg.fill(); gg.fillStyle = '#ffd23f'; gg.beginPath(); for (let i = 0; i < 10; i++) { const a = i / 10 * 6.283 - 1.57, r = i % 2 ? 9 : 20; gg.lineTo(32 + Math.cos(a) * r, 32 + Math.sin(a) * r); } gg.fill(); }, {}, 64, 64);
      add(new THREE.CylinderGeometry(0.38, 0.38, 0.06, 28), [METAL('#9aa3ad'), tx, tx], 0, -0.02, 0.28, Math.PI / 2, 0, 0);
      add(new THREE.TorusGeometry(0.38, 0.03, 6, 28), METAL('#b8860b'), 0, -0.02, 0.31);
      break;
    }
    case 'poisson': {
      const p = new THREE.Group(); p.position.set(0, 0, 0.34); p.rotation.z = 1.2;
      const corps = new THREE.Mesh(new THREE.SphereGeometry(0.28, 16, 12), M('#ff8c1a')); corps.scale.set(0.75, 1.6, 0.6);
      const queue = new THREE.Mesh(new THREE.ConeGeometry(0.2, 0.28, 4), M('#ff6a00')); queue.position.y = -0.55; queue.rotation.z = Math.PI;
      const oeil = new THREE.Mesh(new THREE.SphereGeometry(0.05, 10, 8), M('#ffffff')); oeil.position.set(0.11, 0.28, 0.11);
      const pup = new THREE.Mesh(new THREE.SphereGeometry(0.025, 8, 6), M('#111')); pup.position.set(0.14, 0.29, 0.14);
      p.add(corps, queue, oeil, pup); g.add(p);
      break;
    }
    case 'ailes':
      for (const s of [-1, 1]) {
        const aile = new THREE.Group(); aile.position.set(0.1 * s, 0.15, 0.24);
        for (let i = 0; i < 5; i++) {
          const plume = new THREE.Mesh(new THREE.CapsuleGeometry(0.05, 0.5 - i * 0.07, 4, 8), M('#ffffff', { emissive: '#3a3a40' }));
          plume.position.set((0.3 - i * 0.02) * s, 0.12 - i * 0.1, 0);
          plume.rotation.z = (1.3 + i * 0.12) * s;
          aile.add(plume);
        }
        aile.userData.aile = s;
        g.add(aile);
      }
      break;
    case 'fusee':
      for (const s of [-1, 1]) {
        add(new THREE.CapsuleGeometry(0.1, 0.38, 6, 14), METAL('#c8ced6'), 0.14 * s, 0, 0.32);
        add(new THREE.ConeGeometry(0.1, 0.16, 14), M('#e74c3c'), 0.14 * s, 0.36, 0.32);
        const flamme = add(new THREE.ConeGeometry(0.075, 0.3, 12), LUEUR('#ff8a1f'), 0.14 * s, -0.43, 0.32, Math.PI, 0, 0);
        flamme.userData.flamme = true;
      }
      add(B(0.2, 0.28, 0.1), METAL('#7b838d'), 0, 0, 0.25);
      break;
    case 'ballons':
      for (const [x, y, z, c] of [[-0.26, 1.12, 0.45, '#e74c3c'], [0.04, 1.34, 0.55, '#3d8dff'], [0.3, 1.08, 0.4, '#f1c40f']]) {
        const b = add(new THREE.SphereGeometry(0.2, 16, 12), M(c, { emissive: sombre(c, 0.2) }), x, y, z);
        b.scale.y = 1.2; b.userData.ballon = { y, p: x * 7 };
        const L = Math.hypot(x, y, z - 0.25);
        const fil = add(new THREE.CylinderGeometry(0.006, 0.006, L, 4), M('#eeeeee'), x / 2, y / 2, (z + 0.25) / 2);
        fil.rotation.set(Math.atan2(z - 0.25, y), 0, -Math.atan2(x, y));
      }
      break;
    case 'manette': { // collab 2K27 : manette géante
      const m = new THREE.Group(); m.position.set(0, 0.02, 0.33); m.rotation.set(0.15, 0, 0.3);
      const noir = M('#1b1b2b');
      const corps = new THREE.Mesh(new THREE.CapsuleGeometry(0.13, 0.36, 6, 14), noir); corps.rotation.z = Math.PI / 2; corps.scale.z = 0.55;
      const pg = new THREE.Mesh(new THREE.CapsuleGeometry(0.1, 0.12, 6, 12), noir); pg.position.set(-0.24, -0.12, 0); pg.rotation.z = -0.4; pg.scale.z = 0.55;
      const pd = pg.clone(); pd.position.x = 0.24; pd.rotation.z = 0.4;
      m.add(corps, pg, pd);
      for (const [x, y, c] of [[0.2, 0.05, NEON.cyan], [0.27, -0.01, NEON.rose], [0.13, -0.01, '#4fff7a'], [0.2, -0.07, '#ffd23f']]) { const b = new THREE.Mesh(new THREE.SphereGeometry(0.025, 8, 6), LUEUR(c)); b.position.set(x, y, 0.08); m.add(b); }
      for (const x of [-0.2, -0.05]) { const s = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.035, 0.05, 12), M('#33334a')); s.rotation.x = Math.PI / 2; s.position.set(x, x < -0.1 ? 0.03 : -0.07, 0.08); m.add(s); }
      const bande = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.015, 0.02), LUEUR(NEON.violet)); bande.position.set(0, 0.11, 0.06); m.add(bande);
      g.add(m);
      break;
    }
  }
  return g;
}

// ---------- Pioches (même orientation que la pioche de base) ----------
export function modelePioche(id) {
  if (!id || id === 'classique') return modeleObjet('pioche', 0);
  { const bl = modeleGlb('pioche_' + id); if (bl) { const g = new THREE.Group(); g.add(bl); return g; } }
  const g = new THREE.Group();
  const add = (geom, m, x = 0, y = 0, z = 0, rx = 0, ry = 0, rz = 0) => { const o = new THREE.Mesh(geom, m); o.position.set(x, y, z); o.rotation.set(rx, ry, rz); g.add(o); return o; };
  const B = (w, h, d) => new THREE.BoxGeometry(w, h, d);
  const manche = (c = '#8a5a2b', l = 0.9) => add(new THREE.CylinderGeometry(0.035, 0.04, l, 8), M(c), 0, 0, -0.3, Math.PI / 2, 0, 0);
  switch (id) {
    case 'pelle': manche(); add(B(0.32, 0.03, 0.42), METAL('#9aa3ad'), 0, 0, -0.9); add(B(0.2, 0.07, 0.06), M('#2b2d33'), 0, 0, 0.17); break;
    case 'cle': add(B(0.09, 0.05, 0.95), METAL('#c8ced6'), 0, 0, -0.35); add(B(0.3, 0.06, 0.16), METAL('#c8ced6'), 0.06, 0, -0.85); add(B(0.08, 0.06, 0.12), METAL('#c8ced6'), -0.06, 0, -0.98); add(B(0.11, 0.07, 0.3), M('#d63031'), 0, 0, 0.05); break;
    case 'baguette': {
      const b = W('baguette', gg => { rect(gg, '#d9a05b', 0, 0, 64, 32); for (let x = 4; x < 64; x += 12) rect(gg, '#f3d9a4', x, 4, 6, 24); });
      add(new THREE.CapsuleGeometry(0.075, 1.0, 4, 10), b, 0, 0, -0.45, Math.PI / 2, 0, 0);
      break;
    }
    case 'marteau': manche('#6b4423'); add(new THREE.CylinderGeometry(0.13, 0.13, 0.42, 16), METAL('#7b838d'), 0, 0, -0.78, 0, 0, Math.PI / 2); break;
    case 'hache': manche('#7b4b2a'); add(B(0.05, 0.36, 0.3), METAL('#c8ced6'), 0, 0.12, -0.75); add(B(0.06, 0.1, 0.32), M('#c0392b'), 0, -0.04, -0.75); break;
    case 'os': add(new THREE.CylinderGeometry(0.06, 0.06, 0.95, 10), M('#f3ecdc'), 0, 0, -0.35, Math.PI / 2, 0, 0); for (const z of [0.12, -0.82]) for (const x of [-0.07, 0.07]) add(new THREE.SphereGeometry(0.1, 12, 10), M('#f3ecdc'), x, 0, z); break;
    case 'trident': add(new THREE.CylinderGeometry(0.03, 0.03, 1.2, 8), METAL('#ffc72c', 0.25), 0, 0, -0.45, Math.PI / 2, 0, 0); add(B(0.4, 0.06, 0.06), METAL('#ffc72c', 0.25), 0, 0, -1.0); for (const x of [-0.18, 0, 0.18]) add(new THREE.ConeGeometry(0.04, 0.3, 8), METAL('#ffc72c', 0.25), x, 0, -1.18, -Math.PI / 2, 0, 0); break;
    case 'pinceau': manche('#e8dcc3', 1.0); add(B(0.16, 0.1, 0.12), METAL('#c8ced6'), 0, 0, -0.85); add(new THREE.ConeGeometry(0.12, 0.3, 12), M('#8e44ad'), 0, 0, -1.08, -Math.PI / 2, 0, 0); break;
    case 'doree': add(new THREE.CylinderGeometry(0.035, 0.04, 0.9, 8), M('#5a3a1e'), 0, 0, -0.3, Math.PI / 2, 0, 0); add(B(0.75, 0.12, 0.12), METAL('#ffc72c', 0.2), 0, 0, -0.75); for (const s of [-1, 1]) add(new THREE.ConeGeometry(0.07, 0.2, 8), METAL('#ffc72c', 0.2), 0.45 * s, 0, -0.75, 0, 0, -Math.PI / 2 * s); break;
    case 'spatule':
      manche('#e74c3c', 0.85);
      add(B(0.34, 0.03, 0.36), METAL('#c8ced6', 0.3), 0, 0, -0.88);
      for (const x of [-0.08, 0, 0.08]) add(B(0.03, 0.035, 0.2), M('#555a62'), x, 0, -0.9);
      break;
    case 'cristal': manche('#2b2d33'); add(new THREE.OctahedronGeometry(0.22, 0), mat('cristal', () => new THREE.MeshStandardMaterial({ color: '#7ff3ff', emissive: '#2bb9ff', emissiveIntensity: 1.2, metalness: 0.1, roughness: 0.1, transparent: true, opacity: 0.9 })), 0, 0, -0.85, 0, 0, Math.PI / 4).scale.set(1.6, 0.8, 0.8); break;
    case 'clavier': { // collab 2K27 : clavier-pioche
      manche('#15151f');
      const t = mat('clavier', () => new THREE.MeshLambertMaterial({
        map: tex('clavier', (gg, w, h) => { rect(gg, '#15151f', 0, 0, w, h); for (let y = 0; y < 4; y++) for (let x = 0; x < 12; x++) rect(gg, '#2b2b40', 2 + x * 5, 3 + y * 7, 4, 5); }),
        emissiveMap: tex('clavier-e', (gg, w, h) => { const d = gg.createLinearGradient(0, 0, w, 0); d.addColorStop(0, NEON.cyan); d.addColorStop(0.5, NEON.violet); d.addColorStop(1, NEON.rose); gg.fillStyle = d; gg.fillRect(0, 0, w, h); gg.fillStyle = '#000'; for (let y = 0; y < 4; y++) for (let x = 0; x < 12; x++) gg.fillRect(2 + x * 5 + 1, 3 + y * 7 + 1, 2, 3); }),
        emissive: '#ffffff', emissiveIntensity: 0.9,
      }));
      add(B(0.72, 0.06, 0.26), [M('#15151f'), M('#15151f'), t, M('#15151f'), M('#15151f'), M('#15151f')], 0, 0, -0.78);
      break;
    }
    default: return modeleObjet('pioche', 0);
  }
  return g;
}

// ---------- Deltaplanes ----------
function ecran2k27() {
  return tex('ecran2k27', (g, w, h) => {
    const d = g.createLinearGradient(0, 0, w, h); d.addColorStop(0, '#1a0830'); d.addColorStop(1, '#06121f');
    g.fillStyle = d; g.fillRect(0, 0, w, h);
    g.strokeStyle = NEON.violet; g.lineWidth = 3; g.strokeRect(3, 3, w - 6, h - 6);
    g.shadowColor = NEON.cyan; g.shadowBlur = 12;
    texte2k27(g, w / 2, h / 2 - 6, 46);
    g.shadowBlur = 0;
    g.font = '900 12px Orbitron, system-ui'; g.fillStyle = NEON.rose; g.textAlign = 'center'; g.fillText('NATX ROYALE × 2K27', w / 2, h - 16);
  }, 256, 128);
}
export function modeleDeltaplane(id, c) {
  {
    const bl = modeleGlb('deltaplane_' + (id || 'classique'));
    if (bl) { const g = new THREE.Group(); g.add(bl); if (id === 'tapis') g.userData.tapis = true; return g; }
  }
  const g = new THREE.Group();
  const add = (geom, m, x = 0, y = 0, z = 0, rx = 0, ry = 0, rz = 0) => { const o = new THREE.Mesh(geom, m); o.position.set(x, y, z); o.rotation.set(rx, ry, rz); g.add(o); return o; };
  const B = (w, h, d) => new THREE.BoxGeometry(w, h, d);
  const barre = () => { add(new THREE.CylinderGeometry(0.025, 0.025, 1.3, 6), M('#1d1f24'), 0, -0.65, 0); add(new THREE.CylinderGeometry(0.025, 0.025, 1.0, 6), M('#1d1f24'), 0, -1.25, 0, 0, 0, Math.PI / 2); };
  const forme = (pts, m, y = 0) => {
    const s = new THREE.Shape(); s.moveTo(pts[0][0], pts[0][1]); for (const p of pts.slice(1)) s.lineTo(p[0], p[1]);
    const gg = new THREE.ExtrudeGeometry(s, { depth: 0.05, bevelEnabled: false }); gg.rotateX(Math.PI / 2); gg.translate(0, y + 0.025, 0);
    return add(gg, m);
  };
  let y = 3.1;
  switch (id) {
    case 'papier': forme([[0, -1.3], [1.4, 0.8], [0.12, 0.6], [0, 0.8], [-0.12, 0.6], [-1.4, 0.8]], M('#fbfbfb', { side: THREE.DoubleSide })); add(B(0.04, 0.35, 1.9), M('#e5e5e5'), 0, -0.15, 0); barre(); break;
    case 'feuille': {
      const pts = []; for (let i = 0; i <= 24; i++) { const a = i / 24 * Math.PI * 2; pts.push([Math.cos(a) * 1.6, Math.sin(a) * 0.9 * (1 - 0.3 * Math.cos(a))]); }
      forme(pts, M('#3fa34d', { side: THREE.DoubleSide }));
      add(B(3.0, 0.07, 0.05), M('#2d7a38'), 0, 0.05, 0);
      for (let i = -2; i <= 2; i++) add(B(0.04, 0.07, 1.1), M('#2d7a38'), i * 0.5, 0.05, 0, 0, 0.4 * Math.sign(i || 1), 0);
      barre(); break;
    }
    case 'arcenciel': ['#e74c3c', '#ff8c1a', '#f1c40f', '#2ecc71', '#3d8dff', '#8e44ad'].forEach((col, i) => add(B(3.4 - i * 0.12, 0.07, 0.24), M(col), 0, 0.02 * i, -0.6 + i * 0.24)); barre(); break;
    case 'parapluie': {
      const t = W('parapluie', gg => { for (let i = 0; i < 16; i++) rect(gg, i % 2 ? '#e74c3c' : '#ffffff', i * 4, 0, 4, 32); });
      add(new THREE.SphereGeometry(1.6, 16, 6, 0, Math.PI * 2, 0, Math.PI / 2.6), mat('parap-m', () => new THREE.MeshLambertMaterial({ map: t.map, side: THREE.DoubleSide })), 0, -0.6, 0);
      add(new THREE.CylinderGeometry(0.03, 0.03, 2.2, 6), M('#2b2d33'), 0, -0.4, 0);
      add(new THREE.TorusGeometry(0.12, 0.03, 6, 10, Math.PI), M('#2b2d33'), 0.12, -1.5, 0, 0, 0, Math.PI);
      y = 3.3; break;
    }
    case 'tapis': {
      const t = W('tapis', (gg, w, h) => { rect(gg, '#8e1b3a', 0, 0, w, h); rect(gg, '#ffc72c', 2, 2, w - 4, h - 4); rect(gg, '#8e1b3a', 4, 4, w - 8, h - 8); rect(gg, '#3d8dff', 20, 10, 24, 12); rect(gg, '#ffc72c', 28, 14, 8, 4); });
      add(B(1.6, 0.06, 2.4), t, 0, 0, 0);
      for (const z of [-1.25, 1.25]) for (let i = -3; i <= 3; i++) add(B(0.04, 0.02, 0.16), M('#ffc72c'), i * 0.22, 0, z);
      y = -0.05; g.userData.tapis = true; break;
    }
    case 'pizza': {
      forme([[0, 1.4], [1.3, -1.0], [-1.3, -1.0]], M('#f7c948', { side: THREE.DoubleSide }));
      add(new THREE.CapsuleGeometry(0.12, 2.5, 4, 8), M('#d9963a'), 0, 0.04, -1.0, 0, 0, Math.PI / 2);
      for (const [x, z] of [[0, -0.1], [-0.45, 0.45], [0.45, 0.5], [0.05, 0.75], [-0.2, -0.6]]) add(new THREE.CylinderGeometry(0.17, 0.17, 0.05, 14), M('#c0392b'), x, 0.08, z);
      barre(); break;
    }
    case 'chauvesouris':
    case 'dragon': {
      const coul = id === 'dragon' ? '#a51d2d' : '#24212b', os = id === 'dragon' ? '#f1c40f' : '#111015';
      for (const s of [-1, 1]) {
        const w = forme([[0, 0.3], [1.0 * s, 0.7], [1.9 * s, 0.4], [1.6 * s, -0.1], [1.25 * s, 0.1], [0.95 * s, -0.35], [0.6 * s, -0.1], [0.25 * s, -0.4], [0, -0.2]], M(coul, { side: THREE.DoubleSide }));
        w.userData.aile = s;
        add(new THREE.CylinderGeometry(0.035, 0.035, 1.9, 6), M(os), 0.95 * s, 0.07, -0.55, 0, 0.2 * s, Math.PI / 2);
      }
      barre(); break;
    }
    case 'ecran2k27': { // collab 2K27 : écran géant volant
      const ecran = mat('ecran2k27', () => new THREE.MeshBasicMaterial({ map: ecran2k27(), toneMapped: false, color: new THREE.Color(1.3, 1.3, 1.3) }));
      const noir = M('#111118');
      add(B(3.2, 0.08, 1.6), [noir, noir, ecran, noir, noir, noir], 0, 0, 0);
      add(B(3.3, 0.1, 0.06), LUEUR(NEON.cyan), 0, 0, -0.83); add(B(3.3, 0.1, 0.06), LUEUR(NEON.rose), 0, 0, 0.83);
      barre(); break;
    }
    default:
      add(B(3.2, 0.07, 1.4), M(clair(c, 0.15)), 0, 0, 0);
      add(B(0.6, 0.09, 1.42), M('#ffffff'), 0, 0, 0);
      add(new THREE.CylinderGeometry(0.04, 0.04, 3.24, 6), M('#1d1f24'), 0, 0, -0.68, 0, 0, Math.PI / 2);
      barre();
  }
  g.position.y = y;
  return g;
}

// ---------- Corps ----------
const geoTorse = () => geo('torse', () => {
  const pts = [[0.0, 0.96], [0.24, 0.97], [0.255, 1.04], [0.25, 1.14], [0.275, 1.28], [0.305, 1.42], [0.31, 1.5], [0.27, 1.58], [0.15, 1.63], [0.0, 1.645]].map(([r, y]) => new THREE.Vector2(r, y));
  const g = new THREE.LatheGeometry(pts, 20);
  g.scale(1, 1, 0.66);
  return g;
});
const geoBassin = () => geo('bassin', () => {
  const pts = [[0.0, 0.78], [0.18, 0.8], [0.25, 0.86], [0.255, 0.94], [0.24, 1.0], [0.0, 1.01]].map(([r, y]) => new THREE.Vector2(r, y));
  const g = new THREE.LatheGeometry(pts, 20);
  g.scale(1, 1, 0.68);
  return g;
});
const capsule = (r, l) => geo('cap' + r + ':' + l, () => new THREE.CapsuleGeometry(r, l, 5, 12));
const sphere = (r, a = 14, b = 10) => geo('sph' + r + a + b, () => new THREE.SphereGeometry(r, a, b));

// Cheveux selon le numéro du joueur
function cheveux(style, couleur, sousChapeau) {
  const g = new THREE.Group();
  const m = M(couleur);
  const add = (geom, x = 0, y = 0, z = 0, sx = 1, sy = 1, sz = 1, rx = 0, rz = 0) => { const o = new THREE.Mesh(geom, m); o.position.set(x, y, z); o.scale.set(sx, sy, sz); o.rotation.set(rx, 0, rz); g.add(o); return o; };
  // arrière et côtés de la tête (jamais devant le visage)
  add(geo('cheveuxDos', () => new THREE.SphereGeometry(0.266, 20, 12, 0, Math.PI, 0, Math.PI * 0.6)), 0, 0.012, 0.01, 1.03, 1.1, 1.04);
  if (sousChapeau) {
    if (style % 5 === 2) { add(sphere(0.09), 0, -0.02, 0.29, 1, 1.3, 1); add(new THREE.CapsuleGeometry(0.06, 0.18, 4, 8), 0, -0.17, 0.3, 1, 1, 1, 0.2); }
    return g;
  }
  // dessus de la tête
  add(geo('cheveuxHaut', () => new THREE.SphereGeometry(0.268, 20, 8, 0, Math.PI * 2, 0, Math.PI * 0.36)), 0, 0.015, 0.005, 1.03, 1.12, 1.04);
  // frange au-dessus des sourcils
  add(geo('frange', () => new THREE.CapsuleGeometry(0.045, 0.24, 4, 8)), 0.02, 0.165, -0.2, 1, 1, 0.7, 0, Math.PI / 2 - 0.15);
  switch (style % 5) {
    case 1: // hérissé
      for (let i = 0; i < 7; i++) { const a = i / 7 * Math.PI * 2; const c = add(new THREE.ConeGeometry(0.06, 0.18, 6), Math.cos(a) * 0.13, 0.25, Math.sin(a) * 0.13 + 0.03); c.rotation.set(Math.sin(a) * 0.6, 0, -Math.cos(a) * 0.6); }
      break;
    case 2: // queue de cheval
      add(sphere(0.1), 0, 0.02, 0.29, 1, 1.4, 1);
      add(new THREE.CapsuleGeometry(0.07, 0.2, 4, 8), 0, -0.16, 0.31, 1, 1, 1, 0.2);
      break;
    case 3: // bouclé volumineux
      for (let i = 0; i < 9; i++) { const a = i / 9 * Math.PI * 2; if (Math.sin(a) < -0.6) continue; add(sphere(0.11), Math.cos(a) * 0.24, 0.12 + (i % 2) * 0.06, Math.sin(a) * 0.22 + 0.03); }
      add(sphere(0.15), 0, 0.24, 0.05);
      break;
    case 4: // chignon
      add(sphere(0.11), 0, 0.27, 0.12);
      break;
  }
  return g;
}

function tete(look, numero, t, peau) {
  const g = new THREE.Group();
  const coulCheveux = CHEVEUX[(numero * 3 + 1) % CHEVEUX.length];
  const crane = t.or ? METAL('#e8b923', 0.25) : t.robot ? METAL('#9aa3ad') : M(peau);
  const c = new THREE.Mesh(sphere(0.25, 18, 14), crane); c.scale.set(1, 1.07, 0.98);
  const cou = new THREE.Mesh(geo('cou', () => new THREE.CylinderGeometry(0.075, 0.085, 0.16, 10)), crane); cou.position.y = -0.24;
  g.add(c, cou);
  for (const s of [-1, 1]) { const o = new THREE.Mesh(sphere(0.055, 10, 8), crane); o.position.set(0.245 * s, -0.01, 0.01); o.scale.set(0.5, 1, 0.8); g.add(o); }
  if (t.robot) {
    const visiere = new THREE.Mesh(new THREE.CylinderGeometry(0.255, 0.255, 0.09, 20, 1, true, Math.PI * 0.7, Math.PI * 0.6), LUEUR(NEON.cyan));
    visiere.position.y = 0.02; g.add(visiere);
    const ant = new THREE.Mesh(geo('ant', () => new THREE.CylinderGeometry(0.012, 0.012, 0.18, 6)), METAL('#7b838d')); ant.position.y = 0.33; g.add(ant);
    const boule = new THREE.Mesh(sphere(0.035), LUEUR('#ff4d4d')); boule.position.y = 0.43; g.add(boule);
    return { groupe: g, couleurCheveux: coulCheveux };
  }
  const blanc = M('#ffffff'), pupille = t.or ? METAL('#8a6512') : M(YEUX[numero % YEUX.length]);
  for (const s of [-1, 1]) {
    const oeil = new THREE.Mesh(sphere(0.052, 12, 10), t.or ? crane : blanc); oeil.position.set(0.085 * s, 0.025, -0.205); oeil.scale.set(1, 1.15, 0.55);
    const p = new THREE.Mesh(sphere(0.03, 10, 8), pupille); p.position.set(0.085 * s, 0.02, -0.232); p.scale.set(1, 1.2, 0.5);
    const reflet = new THREE.Mesh(sphere(0.011, 6, 4), blanc); reflet.position.set(0.085 * s + 0.012, 0.035, -0.244);
    const sourcil = new THREE.Mesh(geo('sourcil', () => new THREE.CapsuleGeometry(0.013, 0.06, 3, 6)), t.or ? crane : M(coulCheveux));
    sourcil.position.set(0.085 * s, 0.1, -0.222); sourcil.rotation.z = Math.PI / 2 + 0.15 * s;
    g.add(oeil, p, sourcil);
    if (!t.or) g.add(reflet);
    if (!t.or && !t.masque) { const joue = new THREE.Mesh(sphere(0.03, 8, 6), M('#ff9b9b', { transparent: true, opacity: 0.45 })); joue.position.set(0.14 * s, -0.06, -0.19); joue.scale.z = 0.4; g.add(joue); }
  }
  const nez = new THREE.Mesh(sphere(0.032, 10, 8), crane); nez.position.set(0, -0.035, -0.245); nez.scale.set(1, 0.9, 0.8);
  const bouche = new THREE.Mesh(geo('bouche', () => new THREE.TorusGeometry(0.045, 0.011, 6, 12, Math.PI)), t.or ? METAL('#8a6512') : M('#8a3b2f'));
  bouche.position.set(0, -0.09, -0.228); bouche.rotation.z = Math.PI;
  g.add(nez, bouche);
  if (t.masque && look.chapeau !== 'bandeau') t.bandeau = true;
  if (t.masque) {
    const masque = new THREE.Mesh(new THREE.SphereGeometry(0.262, 20, 10, 0, Math.PI * 2, Math.PI * 0.52, Math.PI * 0.4), M('#17181d'));
    masque.scale.set(1, 1.07, 0.99); g.add(masque);
    if (t.bandeau) {
      const bandeau = new THREE.Mesh(geo('bandeauN', () => new THREE.TorusGeometry(0.262, 0.022, 6, 24)), M('#d63031'));
      bandeau.rotation.x = Math.PI / 2; bandeau.position.y = 0.14; g.add(bandeau);
    }
  }
  return { groupe: g, couleurCheveux: coulCheveux };
}

// ---------- Corps fait dans Blender (modeles/personnage.glb) ----------
// 16 morceaux, chacun avec son origine sur l'articulation. Si le fichier ne charge pas,
// on garde le personnage arrondi fait en code.
const CORPS = {};
export const corpsPret = new Promise(resolve => {
  new GLTFLoader().load('modeles/personnage.glb?v=1', gltf => {
    for (const o of [...gltf.scene.children]) CORPS[o.userData.name || o.name] = o;
    resolve(true);
  }, undefined, err => { console.warn('Personnage Blender pas chargé, on garde le perso arrondi', err); resolve(false); });
});
const corpsBlender = () => !!(CORPS.torse && CORPS.tete && CORPS.bassin && CORPS.cuisse_G && CORPS.tibia_G && CORPS.bras_G && CORPS.avantbras_G);
// coiffures qui dépassent d'un chapeau : on les cache dessous
const COIFFURES_HAUTES = new Set([0, 3, 4]);

function partieBlender(nom, mats) {
  const o = CORPS[nom].clone();
  o.position.set(0, 0, 0); o.rotation.set(0, 0, 0); o.scale.set(1, 1, 1);
  o.traverse(m => { if (m.isMesh && mats[m.material.name]) m.material = mats[m.material.name]; });
  return o;
}

function creerPersonnageBlender(couleur, nom, numero, look) {
  const peau = PEAUX[numero % PEAUX.length];
  const t = tenue(look.tenue, couleur, peau);
  const P = M(peau);
  const coulCheveux = t.or ? null : CHEVEUX[(numero * 3 + 1) % CHEVEUX.length];
  // matériaux de la tête selon la tenue (statue en or, robot en métal, ninja avec cagoule)
  const crane = t.or ? METAL('#e8b923', 0.25) : t.robot ? METAL('#9aa3ad') : t.masque ? M('#17181d') : P;
  const matCheveux = t.or ? METAL('#d4a017', 0.25) : t.masque ? M('#17181d') : M(coulCheveux);
  const commun = { peau: P, cheveux: matCheveux, ceinture: t.ceinture || M('#24262d'), boucle: METAL('#d4a017') };
  const g = new THREE.Group();
  const racine = new THREE.Group();
  g.add(racine);

  // Jambes : hanche → genou
  const jambe = s => {
    const c = s < 0 ? 'G' : 'D';
    const hanche = new THREE.Group(); hanche.position.set(0.11 * s, 1.0, 0);
    hanche.add(partieBlender('cuisse_' + c, { ...commun, bas: t.bas }));
    const genou = new THREE.Group(); genou.position.y = -0.48;
    genou.add(partieBlender('tibia_' + c, { ...commun, bas: t.tibias || t.bas, pieds: t.pieds }));
    hanche.add(genou);
    return { hanche, genou };
  };
  const JG = jambe(-1), JD = jambe(1);
  const bassin = partieBlender('bassin', { ...commun, bas: t.bas });
  const torse = partieBlender('torse', { ...commun, haut: t.torse, peau: t.or || t.robot ? crane : P });

  // Tête + coiffure + chapeau
  const teteG = new THREE.Group(); teteG.position.y = 1.86;
  teteG.add(partieBlender('tete', { ...commun, peau: crane }));
  if (t.robot) {
    const visiere = new THREE.Mesh(new THREE.CylinderGeometry(0.128, 0.128, 0.05, 20, 1, true, Math.PI * 0.7, Math.PI * 0.6), LUEUR(NEON.cyan));
    visiere.position.y = 0.02; visiere.scale.z = 1.08; teteG.add(visiere);
    const ant = new THREE.Mesh(geo('antB', () => new THREE.CylinderGeometry(0.008, 0.008, 0.12, 6)), METAL('#7b838d')); ant.position.y = 0.2; teteG.add(ant);
    const boule = new THREE.Mesh(sphere(0.022), LUEUR('#ff4d4d')); boule.position.y = 0.27; teteG.add(boule);
  }
  const ch = chapeau(look.chapeau, couleur, true);
  if (!ch.blender) ch.groupe.scale.setScalar(0.5);
  const style = numero % 5;
  const sousChapeau = ch.cacheCheveux || (ch.couvre && COIFFURES_HAUTES.has(style));
  if (!t.robot && !t.masque && !sousChapeau && CORPS['cheveux_' + style]) teteG.add(partieBlender('cheveux_' + style, { ...commun, haut: M(couleur) }));
  teteG.add(ch.groupe);
  if (t.capuche) {
    const capuche = new THREE.Mesh(new THREE.SphereGeometry(0.3, 18, 12, Math.PI * 0.1, Math.PI * 1.8, 0.3, Math.PI * 0.65), M(t.capuche, { side: THREE.DoubleSide }));
    capuche.position.set(0, 1.74, 0.06); capuche.rotation.set(-0.4, Math.PI, 0); capuche.scale.set(0.52, 0.38, 0.4);
    racine.add(capuche);
  }

  // Bras : épaule → coude → main
  const bras = s => {
    const c = s < 0 ? 'G' : 'D';
    const epaule = new THREE.Group(); epaule.position.set(0.25 * s, 1.56, 0);
    epaule.add(partieBlender('bras_' + c, { ...commun, haut: t.bras }));
    const coude = new THREE.Group(); coude.position.y = -0.32;
    coude.add(partieBlender('avantbras_' + c, { ...commun, haut: t.avantBras, mains: t.mains || P }));
    epaule.add(coude);
    return { epaule, coude };
  };
  const BG = bras(-1), BD = bras(1);
  const mainArme = new THREE.Group(); mainArme.position.set(0, -0.36, -0.02);
  BD.coude.add(mainArme);

  // Objet de dos : réduit et collé au dos du nouveau corps
  const dos = objetDos(look.dos, couleur, true);
  // modèle Blender : accroché pile sur la surface du dos (LISEZMOI : x 0 ; y -0,13 ; z 1,35)
  if (dos.userData.blender) dos.position.set(0, 1.35, 0.13);
  else { dos.scale.setScalar(0.75); dos.position.set(0, 1.42, -0.09); }

  racine.add(JG.hanche, JD.hanche, bassin, torse, teteG, BG.epaule, BD.epaule, dos);
  return finirPersonnage(g, racine, { JG, JD, BG, BD, teteG, torse, mainArme, dos, ch, look, nom, couleur });
}

// Ombre, deltaplane, détails cachés de loin, étiquette du nom
function finirPersonnage(g, racine, { JG, JD, BG, BD, teteG, torse, mainArme, dos, ch, look, nom, couleur }) {
  const delta = modeleDeltaplane(look.deltaplane, couleur);
  delta.visible = false;
  g.add(delta);
  const ombre = new THREE.Mesh(geo('ombre', () => new THREE.CircleGeometry(0.45, 20)), mat('ombre', () => new THREE.MeshBasicMaterial({ color: '#000000', transparent: true, opacity: 0.22, depthWrite: false })));
  ombre.rotation.x = -Math.PI / 2; ombre.position.y = 0.04;
  g.add(ombre);
  const details = [];
  const ech = new THREE.Vector3();
  g.updateMatrixWorld(true);
  g.traverse(o => {
    if (!o.isMesh || o === ombre) return;
    if (!o.geometry.boundingSphere) o.geometry.computeBoundingSphere();
    o.getWorldScale(ech);
    const taille = o.geometry.boundingSphere.radius * Math.max(ech.x, ech.y, ech.z);
    if (taille < 0.06 && !delta.children.includes(o)) details.push(o);
    else o.castShadow = true;
  });
  g.userData = {
    details, loin: false,
    racine, jg: JG.hanche, jd: JD.hanche, genouG: JG.genou, genouD: JD.genou, bg: BG.epaule, bd: BD.epaule, coudeG: BG.coude, coudeD: BD.coude,
    tete: teteG, torse, mainArme, delta, dos, chapeau: ch.groupe, ombre, phase: 0, objet: null, coup: 0, temps: 0, look, emote: null, emoteT: 0,
  };
  if (nom) {
    const etiquette = creerEtiquette(nom);
    etiquette.position.y = 2.55;
    g.add(etiquette);
    g.userData.etiquette = etiquette;
  }
  return g;
}

export function creerPersonnage(couleur, nom, numero = 0, lookRecu) {
  const look = { ...LOOK_DEFAUT, ...(lookRecu || {}) };
  if (corpsBlender()) return creerPersonnageBlender(couleur, nom, numero, look);
  const peau = PEAUX[numero % PEAUX.length];
  const t = tenue(look.tenue, couleur, peau);
  const P = M(peau);
  const mains = t.mains || P;
  const g = new THREE.Group();
  const racine = new THREE.Group();
  g.add(racine);

  // Jambes : hanche → genou → pied
  const jambe = (s) => {
    const hanche = new THREE.Group(); hanche.position.set(0.13 * s, 0.9, 0);
    const cuisse = new THREE.Mesh(capsule(0.11, 0.22), t.bas); cuisse.position.y = -0.2;
    const genou = new THREE.Group(); genou.position.y = -0.42;
    const tibia = new THREE.Mesh(capsule(0.092, 0.24), t.tibias || t.bas); tibia.position.y = -0.19;
    const pied = new THREE.Mesh(capsule(0.085, 0.13), t.pieds); pied.rotation.x = Math.PI / 2; pied.position.set(0, -0.4, -0.06); pied.scale.set(1.25, 1, 0.85);
    const semelle = new THREE.Mesh(geo('semelle', () => new THREE.BoxGeometry(0.2, 0.03, 0.32)), M('#f2f2f2')); semelle.position.set(0, -0.475, -0.06);
    genou.add(tibia, pied, semelle);
    hanche.add(cuisse, genou);
    return { hanche, genou };
  };
  const JG = jambe(-1), JD = jambe(1);

  const bassin = new THREE.Mesh(geoBassin(), t.bas);
  const torse = new THREE.Mesh(geoTorse(), t.torse);
  const ceinture = new THREE.Mesh(geo('ceint', () => { const gg = new THREE.TorusGeometry(0.248, 0.03, 6, 24); gg.rotateX(Math.PI / 2); gg.scale(1, 1, 0.68); return gg; }), t.ceinture || M('#24262d'));
  ceinture.position.y = 0.975;
  const boucle = new THREE.Mesh(geo('boucle', () => new THREE.BoxGeometry(0.08, 0.05, 0.02)), METAL('#d4a017')); boucle.position.set(0, 0.975, -0.18);

  // Tête
  const T = tete(look, numero, t, peau);
  const teteG = T.groupe; teteG.position.y = 1.88;
  const ch = chapeau(look.chapeau, couleur);
  if (!ch.cacheCheveux && !t.robot) teteG.add(cheveux(t.masque ? 0 : numero, t.or ? '#d4a017' : t.masque ? '#17181d' : T.couleurCheveux, ch.couvre));
  teteG.add(ch.groupe);
  if (t.capuche) {
    const capuche = new THREE.Mesh(new THREE.SphereGeometry(0.3, 18, 12, Math.PI * 0.1, Math.PI * 1.8, 0.3, Math.PI * 0.65), M(t.capuche, { side: THREE.DoubleSide }));
    capuche.position.set(0, 1.68, 0.12); capuche.rotation.set(-0.4, Math.PI, 0); capuche.scale.set(1, 0.7, 0.7);
    racine.add(capuche);
  }

  // Bras : épaule → coude → main
  const bras = (s) => {
    const epaule = new THREE.Group(); epaule.position.set(0.37 * s, 1.52, 0);
    const rond = new THREE.Mesh(sphere(0.095, 12, 10), t.torse === t.bras ? t.bras : t.bras); rond.position.y = -0.02;
    const haut = new THREE.Mesh(capsule(0.075, 0.2), t.bras); haut.position.y = -0.16;
    const coude = new THREE.Group(); coude.position.y = -0.33;
    const avant = new THREE.Mesh(capsule(0.068, 0.18), t.avantBras); avant.position.y = -0.15;
    const main = new THREE.Mesh(sphere(0.078, 12, 10), mains); main.position.y = -0.34; main.scale.set(0.9, 1.1, 0.85);
    const pouce = new THREE.Mesh(sphere(0.03, 8, 6), mains); pouce.position.set(-0.06 * s, -0.31, -0.045);
    coude.add(avant, main, pouce);
    epaule.add(rond, haut, coude);
    return { epaule, coude };
  };
  const BG = bras(-1), BD = bras(1);
  const mainArme = new THREE.Group(); mainArme.position.set(0, -0.36, 0);
  BD.coude.add(mainArme);

  const dos = objetDos(look.dos, couleur);
  dos.position.y = 1.26;

  racine.add(JG.hanche, JD.hanche, bassin, torse, ceinture, boucle, teteG, BG.epaule, BD.epaule, dos);

  const delta = modeleDeltaplane(look.deltaplane, couleur);
  delta.visible = false;
  g.add(delta);

  const ombre = new THREE.Mesh(geo('ombre', () => new THREE.CircleGeometry(0.45, 20)), mat('ombre', () => new THREE.MeshBasicMaterial({ color: '#000000', transparent: true, opacity: 0.22, depthWrite: false })));
  ombre.rotation.x = -Math.PI / 2; ombre.position.y = 0.04;
  g.add(ombre);

  // Ombres seulement pour les grosses parties ; les petits détails se cachent de loin
  const details = [];
  const ech = new THREE.Vector3();
  g.updateMatrixWorld(true);
  g.traverse(o => {
    if (!o.isMesh || o === ombre) return;
    if (!o.geometry.boundingSphere) o.geometry.computeBoundingSphere();
    o.getWorldScale(ech);
    const taille = o.geometry.boundingSphere.radius * Math.max(ech.x, ech.y, ech.z);
    if (taille < 0.075 && !delta.children.includes(o)) details.push(o);
    else o.castShadow = true;
  });
  g.userData = {
    details, loin: false,
    racine, jg: JG.hanche, jd: JD.hanche, genouG: JG.genou, genouD: JD.genou, bg: BG.epaule, bd: BD.epaule, coudeG: BG.coude, coudeD: BD.coude,
    tete: teteG, torse, mainArme, delta, dos, chapeau: ch.groupe, ombre, phase: 0, objet: null, coup: 0, temps: 0, look, emote: null, emoteT: 0,
  };

  if (nom) {
    const etiquette = creerEtiquette(nom);
    etiquette.position.y = 2.6;
    g.add(etiquette);
    g.userData.etiquette = etiquette;
  }
  return g;
}

export function creerEtiquette(texte) {
  const cv = document.createElement('canvas'); cv.width = 256; cv.height = 64;
  const c = cv.getContext('2d');
  c.font = 'bold 30px system-ui, sans-serif';
  const w = Math.min(250, c.measureText(texte).width + 28);
  c.fillStyle = 'rgba(10,16,34,0.7)';
  c.beginPath(); c.roundRect((256 - w) / 2, 10, w, 44, 14); c.fill();
  c.strokeStyle = 'rgba(255,255,255,0.35)'; c.lineWidth = 2; c.stroke();
  c.fillStyle = '#fff'; c.textAlign = 'center'; c.textBaseline = 'middle';
  c.fillText(texte, 128, 33, 236);
  const t = new THREE.CanvasTexture(cv); t.colorSpace = THREE.SRGBColorSpace;
  const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: t, transparent: true, fog: false }));
  s.scale.set(2.4, 0.6, 1);
  s.renderOrder = 10;
  return s;
}

const TENU_A_LA_MAIN = new Set(['soin', 'bouclier', 'minigourde', 'pansements', 'grenade']);
export function tenirObjet(g, objet, rarete) {
  const u = g.userData;
  const cle = objet + ':' + rarete;
  if (u.objet === cle) return;
  u.objet = cle;
  u.mainArme.clear();
  if (!objet) return;
  const m = objet === 'pioche' ? modelePioche(u.look.pioche) : modeleObjet(objet, rarete || 0);
  m.rotation.x = -Math.PI / 2;
  if (TENU_A_LA_MAIN.has(objet)) m.rotation.x = 0;
  m.traverse(o => { if (o.isMesh) o.castShadow = true; });
  u.mainArme.add(m);
}

// ---------- Émotes ----------
function poseEmote(u, id, t) {
  const r = u.racine;
  const s = Math.sin;
  switch (id) {
    case 'salut':
      u.bd.rotation.set(0, 0, 2.5 + s(t * 9) * 0.3); u.coudeD.rotation.x = 0.4 + s(t * 9) * 0.3;
      u.bg.rotation.set(0.1, 0, 0.15); u.tete.rotation.z = s(t * 4.5) * 0.08; break;
    case 'applaudir': {
      const k = Math.abs(s(t * 8));
      u.bd.rotation.set(1.1, 0, 0.35 - k * 0.25); u.bg.rotation.set(1.1, 0, -0.35 + k * 0.25);
      u.coudeD.rotation.x = 0.9; u.coudeG.rotation.x = 0.9;
      r.position.y = Math.abs(s(t * 4)) * 0.04; break;
    }
    case 'sautjoie': {
      const k = Math.abs(s(t * 5));
      r.position.y = k * 0.45;
      u.bd.rotation.set(0, 0, 0.3 + k * 2.6); u.bg.rotation.set(0, 0, -0.3 - k * 2.6);
      u.jd.rotation.set(0, 0, k * 0.35); u.jg.rotation.set(0, 0, -k * 0.35);
      u.genouD.rotation.x = -(1 - k) * 0.6; u.genouG.rotation.x = -(1 - k) * 0.6; break;
    }
    case 'robot': {
      const p = Math.floor(t * 3) % 4;
      const poses = [[1.57, 0, 0, 0], [0, 1.57, 0.4, 0], [1.57, 1.57, -0.4, 0.3], [0.8, 0.8, 0, -0.3]];
      const q = poses[p];
      u.bd.rotation.set(q[0], 0, 0); u.bg.rotation.set(q[1], 0, 0);
      u.coudeD.rotation.x = q[0] ? 1.57 : 0; u.coudeG.rotation.x = q[1] ? 1.57 : 0;
      u.tete.rotation.y = q[2]; r.rotation.y = q[3];
      r.position.y = (p % 2) * 0.05; break;
    }
    case 'toupie':
      r.rotation.y = t * 9;
      u.bd.rotation.set(0, 0, 1.57); u.bg.rotation.set(0, 0, -1.57);
      u.jd.rotation.set(0, 0, 0.2); u.jg.rotation.set(0, 0, -0.2);
      r.position.y = 0.05 + Math.abs(s(t * 6)) * 0.08; break;
    case 'victoire': {
      const k = Math.max(0, s(t * 6));
      u.bd.rotation.set(0, 0, 2.3 + k * 0.6); u.coudeD.rotation.x = 0.3 - k * 0.3;
      u.bg.rotation.set(0.2, 0, -0.3); u.coudeG.rotation.x = 1.2;
      r.position.y = k * 0.25; u.tete.rotation.x = 0.25; break;
    }
    case 'zen':
      r.position.y = 0.55 + s(t * 2) * 0.12;
      u.jd.rotation.set(1.35, 0, 0.55); u.jg.rotation.set(1.35, 0, -0.55);
      u.genouD.rotation.x = -2.3; u.genouG.rotation.x = -2.3;
      u.bd.rotation.set(0.4, 0, -0.5); u.bg.rotation.set(0.4, 0, 0.5);
      u.coudeD.rotation.x = 0.9; u.coudeG.rotation.x = 0.9;
      u.tete.rotation.x = -0.1 + s(t * 2) * 0.05; break;
    case 'pompes': { // allongé face au sol, on pousse avec les bras
      const k = (s(t * 4) + 1) / 2;
      const a = 1.28 - k * 0.17; // penché depuis les pieds, posés au sol
      r.rotation.x = -a; r.position.set(0, 0.08, 0.9);
      u.bd.rotation.set(a - (1 - k) * 0.5, 0, 0.22); u.bg.rotation.set(a - (1 - k) * 0.5, 0, -0.22);
      u.coudeD.rotation.x = (1 - k) * 1.3; u.coudeG.rotation.x = (1 - k) * 1.3;
      u.tete.rotation.x = -0.55; break;
    }
    case 'dj': { // collab 2K27
      const k = s(t * 8);
      u.bd.rotation.set(1.0, 0, 0.3 + k * 0.25); u.coudeD.rotation.x = 1.1;
      u.bg.rotation.set(0.2, 0, -2.4); u.coudeG.rotation.x = 1.9;
      u.tete.rotation.set(Math.abs(k) * 0.25, 0, 0.15);
      r.position.y = Math.abs(s(t * 4)) * 0.06;
      u.genouD.rotation.x = -Math.abs(s(t * 4)) * 0.3; u.genouG.rotation.x = -Math.abs(s(t * 4)) * 0.3;
      break;
    }
  }
}

function remettre(u) {
  u.racine.position.set(0, 0, 0); u.racine.rotation.set(0, 0, 0);
  u.tete.rotation.set(0, 0, 0);
  for (const k of ['jd', 'jg', 'bd', 'bg', 'genouD', 'genouG', 'coudeD', 'coudeG']) u[k].rotation.set(0, 0, 0);
}

// Animation : marche, saut, visée, pioche, descente, émotes, accessoires
export function animerPersonnage(g, dt, etat) {
  const u = g.userData;
  u.temps += dt;
  const vitesse = etat.vitesse || 0;
  if (vitesse > 0.5 && etat.auSol) u.phase += dt * vitesse * 1.5;
  else u.phase *= 0.85;
  const amp = Math.min(1, vitesse / 6);
  const balance = Math.sin(u.phase) * amp * 0.75;
  remettre(u);
  if (etat.emote && etat.auSol !== false) {
    if (u.emote !== etat.emote) { u.emote = etat.emote; u.emoteT = 0; u.mainArme.visible = false; }
    u.emoteT += dt;
    poseEmote(u, etat.emote, u.emoteT);
  } else {
    if (u.emote) { u.emote = null; u.mainArme.visible = true; }
    if (!etat.auSol) {
      u.jg.rotation.x = 0.5; u.jd.rotation.x = -0.2;
      u.genouG.rotation.x = -0.9; u.genouD.rotation.x = -0.4;
    } else {
      u.jg.rotation.x = balance; u.jd.rotation.x = -balance;
      u.genouG.rotation.x = -Math.max(0, -Math.sin(u.phase)) * 1.1 * amp - 0.05;
      u.genouD.rotation.x = -Math.max(0, Math.sin(u.phase)) * 1.1 * amp - 0.05;
      u.racine.position.y = -Math.abs(Math.cos(u.phase)) * amp * 0.05;
      u.racine.rotation.x = amp * 0.08;
    }
    if (etat.planeur) {
      u.bg.rotation.set(Math.PI, 0, 0.2); u.bd.rotation.set(Math.PI, 0, -0.2);
      u.coudeG.rotation.x = 0.3; u.coudeD.rotation.x = 0.3;
      u.jg.rotation.x = 0.25; u.jd.rotation.x = 0.15; u.genouG.rotation.x = -0.3; u.genouD.rotation.x = -0.2;
      if (u.delta.userData.tapis) { u.bg.rotation.set(0, 0, -0.7); u.bd.rotation.set(0, 0, 0.7); u.jg.rotation.x = 0; u.jd.rotation.x = 0; u.genouG.rotation.x = -0.4; u.genouD.rotation.x = -0.4; }
    } else if (etat.chute) {
      u.bg.rotation.set(0, 0, -1.25); u.bd.rotation.set(0, 0, 1.25);
      u.coudeG.rotation.x = 0.4; u.coudeD.rotation.x = 0.4;
      u.jg.rotation.x = 0.4; u.jd.rotation.x = -0.4; u.genouG.rotation.x = -0.8; u.genouD.rotation.x = -0.5;
      u.racine.rotation.x = 0.55;
    } else {
      u.coup = Math.max(0, u.coup - dt * 5);
      const arme = etat.arme && etat.arme !== 'pioche' && !TENU_A_LA_MAIN.has(etat.arme);
      const pitch = etat.pitch || 0;
      if (arme) {
        u.bd.rotation.set(Math.PI / 2 + pitch, 0, 0); u.coudeD.rotation.x = 0.15;
        u.bg.rotation.set(Math.PI / 2 + pitch - 0.1, 0, 0.6); u.coudeG.rotation.x = 0.55;
      } else if (etat.arme === 'pioche') {
        u.bd.rotation.set(0.45 + Math.sin(u.coup * Math.PI) * 1.4 + pitch * 0.5, 0, 0.05); u.coudeD.rotation.x = 1.35 - Math.sin(u.coup * Math.PI) * 0.9;
        u.bg.rotation.set(-balance * 0.8, 0, -0.1); u.coudeG.rotation.x = 0.35;
      } else {
        u.bd.rotation.set(0.7, 0, 0.1); u.coudeD.rotation.x = 0.6;
        u.bg.rotation.set(-balance * 0.8, 0, -0.1); u.coudeG.rotation.x = 0.35;
      }
      if (!etat.arme) { u.bd.rotation.set(balance * 0.8, 0, 0.1); u.coudeD.rotation.x = 0.35; }
      u.tete.rotation.x = pitch * 0.5;
      // Recul de l'arme quand on tire
      u.recul = Math.max(0, (u.recul || 0) - dt * 9);
      if (arme && u.recul > 0) { u.bd.rotation.x += u.recul * 0.22; u.bg.rotation.x += u.recul * 0.18; u.coudeD.rotation.x += u.recul * 0.25; }
      // Accroupi
      if (etat.accroupi && etat.auSol) {
        u.racine.position.y = -0.36; u.racine.rotation.x = 0.22;
        u.jg.rotation.x = 1.0 + balance * 0.3; u.jd.rotation.x = 1.0 - balance * 0.3;
        u.genouG.rotation.x = -1.85; u.genouD.rotation.x = -1.85;
        u.tete.rotation.x -= 0.2;
      }
    }
  }
  // respiration
  u.torse.scale.set(1, 1 + Math.sin(u.temps * 2.2) * 0.012, 1);
  u.delta.visible = !!etat.planeur;
  u.ombre.visible = etat.auSol !== false && !u.delta.visible;
  const t = u.temps;
  u.chapeau.traverse(o => {
    if (o.userData.tourne) o.rotation.y += dt * o.userData.tourne;
    if (o.userData.flotte2) o.position.y = o.userData.flotte2 + Math.sin(t * 2.5) * 0.04;
    if (o.userData.flotte) o.rotation.x = 0.4 + Math.sin(t * 8 + o.position.x * 20) * 0.25 + Math.min(0.6, vitesse * 0.05);
  });
  u.dos.traverse(o => {
    if (o.userData.cape) o.rotation.x = 0.12 + Math.min(1.0, vitesse * 0.09) + Math.sin(t * 6) * 0.04 + (etat.planeur || etat.chute ? 0.9 : 0);
    if (o.userData.aile) o.rotation.y = Math.sin(t * 3) * 0.25 * o.userData.aile;
    if (o.userData.flamme) o.scale.y = 0.7 + Math.random() * 0.6 + (etat.chute || etat.planeur ? 1 : 0);
    if (o.userData.ballon) { o.position.y = o.userData.ballon.y + Math.sin(t * 2 + o.userData.ballon.p) * 0.05; o.rotation.z = Math.sin(t * 1.4 + o.userData.ballon.p) * 0.15; }
  });
  if (u.delta.visible) u.delta.traverse(o => { if (o.userData.aile) o.rotation.z = Math.sin(t * 4) * 0.12 * o.userData.aile; });
}
