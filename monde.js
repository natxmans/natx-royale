// L'île : terrain avec zones (prairie, neige, désert), rivière, lac, lieux variés,
// maisons détaillées, végétation + toute la physique (collisions, rayons pour les tirs).
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { hasard, creerBruit, borner } from './outils.js';
import { construireLieu, rampe } from './lieux.js';
import { modeleBlender } from './armes.js';
import { modeleGlb, INTEGRATION } from './modeles.js';

// Version abîmée (plus sombre) d'un matériau de construction Blender
const matsAbimes = new Map();
function materiauAbime(m) {
  if (!matsAbimes.has(m)) { const a = m.clone(); a.color.multiplyScalar(0.62); matsAbimes.set(m, a); }
  return matsAbimes.get(m);
}

export const DEMI = 260;            // l'île va de -260 à +260
const N = 209;                       // points de la grille du terrain
const PAS = (DEMI * 2) / (N - 1);    // 2,5 m entre deux points
export const CASE = 4;               // taille d'une case de construction
const CH = 8;                        // taille d'une cellule de la grille de collision

// Les lieux (tous inventés)
const TYPES_LIEUX = [
  { type: 'arene', nom: 'Arène 2K27', biomes: ['prairie'], rayon: 30, sol: 'arene', distMax: 0.5 },
  { type: 'ville', nom: 'Cité Turbo', biomes: ['prairie'], rayon: 38, sol: 'ville' },
  { type: 'chalets', nom: 'Chalets Givrés', biomes: ['neige'], rayon: 28, sol: 'neige' },
  { type: 'desert', nom: 'Oasis Cactus', biomes: ['desert'], rayon: 30, sol: 'sable' },
  { type: 'chateau', nom: 'Fort Bancal', biomes: ['prairie', 'neige'], rayon: 24, sol: 'pave' },
  { type: 'usine', nom: 'Usine Grinçante', biomes: ['prairie', 'desert'], rayon: 34, sol: 'beton' },
  { type: 'ferme', nom: 'Ferme Grognon', biomes: ['prairie'], rayon: 30, sol: 'terre' },
  { type: 'quartier', nom: 'Village Biscotte', biomes: ['prairie'], rayon: 30, sol: 'pave' },
  { type: 'port', nom: 'Port Moussaillon', biomes: ['prairie', 'desert'], rayon: 26, sol: null, cote: true },
];
export const NOMS_LIEUX = TYPES_LIEUX.map(t => t.nom);

const PALETTES = {
  normal: { murs: ['#f3e6c8', '#cfe3f0', '#f5d0d6', '#fdfaf2', '#f7e7a8', '#d6efcd', '#e8d3f2', '#ffd9b3'], toits: ['#c0392b', '#2c4a8a', '#2e8b57', '#8b4a2b', '#d35400', '#6a2c86', '#b03a48', '#3d6f8f'], bords: ['#fdfaf2', '#6b4423'], volets: true, fleurs: true, barriere: true },
  chalet: { murs: ['#8b5a33', '#7a4a28', '#9b6a3f'], toits: ['#3d3a4a', '#4a3a32', '#2f3d4a'], bords: ['#5a3a1e', '#f3ecdc'], volets: true, fleurs: true, pentu: 0.95, neige: true, plat: false },
  adobe: { murs: ['#d9a066', '#e3b07a', '#c98b5a', '#e8c49a'], toits: ['#b5835a'], bords: ['#8b5a2b'], plat: true, vigas: true },
  grange: { murs: ['#b03a2e'], toits: ['#4a4f57'], bords: ['#fdfaf2'], grandePorte: true, plat: false },
  pierre: { murs: ['#9a9590'], toits: ['#7d7873'], bords: ['#6e6a66'], plat: true, creneaux: true },
  entrepot: { murs: ['#8fa3b8', '#a3b1a0', '#b0a08f'], toits: ['#5f6b77'], bords: ['#4a545e'], plat: true, grandePorte: true },
};

// ---------- Rayons ----------
export function rayonBoite(b, ox, oy, oz, ix, iy, iz) {
  let t1 = (b.minX - ox) * ix, t2 = (b.maxX - ox) * ix;
  let tmin = Math.min(t1, t2), tmax = Math.max(t1, t2);
  t1 = (b.minY - oy) * iy; t2 = (b.maxY - oy) * iy;
  tmin = Math.max(tmin, Math.min(t1, t2)); tmax = Math.min(tmax, Math.max(t1, t2));
  t1 = (b.minZ - oz) * iz; t2 = (b.maxZ - oz) * iz;
  tmin = Math.max(tmin, Math.min(t1, t2)); tmax = Math.min(tmax, Math.max(t1, t2));
  if (tmax < tmin || tmin < 0) return null;
  return tmin;
}

// Cylindre debout (troncs, rochers, colonnes) : collision ronde, plus fidèle qu'une boîte
export function rayonCylindre(c, ox, oy, oz, dx, dy, dz) {
  const fx = ox - c.cx, fz = oz - c.cz;
  const a = dx * dx + dz * dz;
  let tmin = -Infinity, tmax = Infinity;
  if (a > 1e-12) {
    const b = 2 * (fx * dx + fz * dz), cc = fx * fx + fz * fz - c.r * c.r;
    const disc = b * b - 4 * a * cc;
    if (disc < 0) return null;
    const s = Math.sqrt(disc);
    tmin = (-b - s) / (2 * a); tmax = (-b + s) / (2 * a);
  } else if (fx * fx + fz * fz > c.r * c.r) return null;
  if (Math.abs(dy) > 1e-12) {
    let t1 = (c.minY - oy) / dy, t2 = (c.maxY - oy) / dy;
    if (t1 > t2) { const t = t1; t1 = t2; t2 = t; }
    tmin = Math.max(tmin, t1); tmax = Math.min(tmax, t2);
  } else if (oy < c.minY || oy > c.maxY) return null;
  if (tmax < tmin || tmin < 0) return null;
  return tmin;
}

// Une rampe = un plan incliné y = A + gx·x + gz·z limité à un rectangle.
function planRampe(r) {
  if (r.A !== undefined) return r;
  if (!r._p) {
    const b = r.k * CASE;
    let A, gx = 0, gz = 0;
    if (r.d === 0) { A = b - r.i * CASE; gx = 1; }
    else if (r.d === 1) { A = b + r.i * CASE + CASE; gx = -1; }
    else if (r.d === 2) { A = b - r.j * CASE; gz = 1; }
    else { A = b + r.j * CASE + CASE; gz = -1; }
    r._p = { A, gx, gz, minX: r.i * CASE, maxX: r.i * CASE + CASE, minZ: r.j * CASE, maxZ: r.j * CASE + CASE };
  }
  return r._p;
}
export function hauteurRampe(r, x, z) {
  const p = planRampe(r);
  if (x < p.minX || x > p.maxX || z < p.minZ || z > p.maxZ) return null;
  return p.A + p.gx * x + p.gz * z;
}
function rayonRampe(r, ox, oy, oz, dx, dy, dz) {
  const p = planRampe(r);
  const den = dy - p.gx * dx - p.gz * dz;
  if (Math.abs(den) < 1e-6) return null;
  const t = (p.A + p.gx * ox + p.gz * oz - oy) / den;
  if (t < 0) return null;
  const x = ox + dx * t, z = oz + dz * t;
  if (x < p.minX - 0.01 || x > p.maxX + 0.01 || z < p.minZ - 0.01 || z > p.maxZ + 0.01) return null;
  return t;
}

// ---------- Géométrie : plein de boîtes colorées en un seul objet ----------
const FACES = [[0, 1, 1, 2], [0, -1, 2, 1], [1, 1, 2, 0], [1, -1, 0, 2], [2, 1, 0, 1], [2, -1, 1, 0]];
const COINS = [[-1, -1], [1, -1], [1, 1], [-1, 1]];
export function geometrieBoites(liste) {
  const pos = [], nor = [], col = [], idx = [];
  const c = new THREE.Color();
  for (const b of liste) {
    if (b.dessin === false) continue;
    c.set(b.couleur);
    if (b.nuance) c.offsetHSL(0, 0, b.nuance);
    const ctr = [(b.minX + b.maxX) / 2, (b.minY + b.maxY) / 2, (b.minZ + b.maxZ) / 2];
    const h = [(b.maxX - b.minX) / 2, (b.maxY - b.minY) / 2, (b.maxZ - b.minZ) / 2];
    for (const [na, s, ua, va] of FACES) {
      const base = pos.length / 3;
      const k = na === 1 && s < 0 ? 0.8 : 1;
      for (const [su, sv] of COINS) {
        const p = [ctr[0], ctr[1], ctr[2]];
        p[na] += s * h[na]; p[ua] += su * h[ua]; p[va] += sv * h[va];
        pos.push(p[0], p[1], p[2]);
        const n = [0, 0, 0]; n[na] = s; nor.push(n[0], n[1], n[2]);
        col.push(c.r * k, c.g * k, c.b * k);
      }
      idx.push(base, base + 1, base + 2, base, base + 2, base + 3);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
  g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  g.setIndex(idx);
  return g;
}

// Rassemble boîtes, boîtes penchées, cylindres, cônes, sphères et triangles en un seul objet 3D
class Constructeur {
  constructor() { this.boites = []; this.geos = []; this.m4 = new THREE.Matrix4(); this.q = new THREE.Quaternion(); this.e = new THREE.Euler(); }
  colorer(g, couleur) {
    if (g.attributes.uv) g.deleteAttribute('uv');
    const c = new THREE.Color(couleur);
    const n = g.attributes.position.count, a = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) { a[i * 3] = c.r; a[i * 3 + 1] = c.g; a[i * 3 + 2] = c.b; }
    g.setAttribute('color', new THREE.BufferAttribute(a, 3));
    return g;
  }
  boite(minX, minY, minZ, maxX, maxY, maxZ, couleur, nuance = 0) {
    if (maxX - minX < 0.005 || maxY - minY < 0.005 || maxZ - minZ < 0.005) return null;
    const b = { minX, minY, minZ, maxX, maxY, maxZ, couleur, nuance };
    this.boites.push(b);
    return b;
  }
  placer(g, x, y, z, rx = 0, ry = 0, rz = 0, couleur) {
    this.e.set(rx, ry, rz); this.q.setFromEuler(this.e);
    this.m4.compose(new THREE.Vector3(x, y, z), this.q, new THREE.Vector3(1, 1, 1));
    g.applyMatrix4(this.m4);
    this.geos.push(this.colorer(g, couleur));
  }
  tournee(w, h, d, x, y, z, rx, ry, rz, couleur) { this.placer(new THREE.BoxGeometry(w, h, d), x, y, z, rx, ry, rz, couleur); }
  // Cylindre : debout, du bas y0 jusqu'à y0+h ; penché (rx ou rz) : centré sur y0
  cylindre(x, y0, z, rHaut, rBas, h, couleur, seg = 12, rx = 0, ry = 0, rz = 0) {
    const g = new THREE.CylinderGeometry(rHaut, rBas, Math.max(h, 0.001), seg);
    const penche = rx || rz;
    this.placer(g, x, penche ? y0 : y0 + h / 2, z, rx, ry, rz, couleur);
  }
  cone(x, y0, z, r, h, couleur, seg = 12, rx = 0, ry = 0, rz = 0) {
    const g = new THREE.ConeGeometry(r, h, seg);
    const penche = rx || rz;
    this.placer(g, x, penche ? y0 : y0 + h / 2, z, rx, ry, rz, couleur);
  }
  sphere(x, y, z, r, couleur, sx = 1, sy = 1, sz = 1, seg = 12) {
    const g = new THREE.SphereGeometry(r, seg, Math.max(6, Math.round(seg * 0.7)));
    g.scale(sx, sy, sz);
    this.placer(g, x, y, z, 0, 0, 0, couleur);
  }
  // Roue (pneu + jante), axe le long de z si axeZ, sinon le long de x
  roue(x, y, z, r, larg, axeZ) {
    this.cylindre(x, y, z, r, r, larg, '#1d1f24', 14, axeZ ? Math.PI / 2 : 0, 0, axeZ ? 0 : Math.PI / 2);
    this.cylindre(x, y, z, r * 0.55, r * 0.55, larg + 0.02, '#c8ced6', 10, axeZ ? Math.PI / 2 : 0, 0, axeZ ? 0 : Math.PI / 2);
  }
  triangle(a, b, c, couleur) {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute([...a, ...b, ...c, ...a, ...c, ...b], 3));
    g.setIndex([0, 1, 2, 3, 4, 5]);
    g.computeVertexNormals();
    this.geos.push(this.colorer(g, couleur));
  }
  geometrie() {
    const base = geometrieBoites(this.boites);
    return this.geos.length ? mergeGeometries([base, ...this.geos]) : base;
  }
  // Un objet 3D par zone de la carte : seuls ceux qu'on voit sont dessinés
  geometriesParZone(taille = 64) {
    const zones = new Map();
    const zone = (x, z) => { const k = Math.floor(x / taille) + ',' + Math.floor(z / taille); if (!zones.has(k)) zones.set(k, { b: [], g: [] }); return zones.get(k); };
    for (const b of this.boites) if (b.dessin !== false) zone((b.minX + b.maxX) / 2, (b.minZ + b.maxZ) / 2).b.push(b);
    for (const g of this.geos) { g.computeBoundingSphere(); const c = g.boundingSphere.center; zone(c.x, c.z).g.push(g); }
    const res = [];
    for (const z of zones.values()) {
      const parts = [];
      if (z.b.length) parts.push(geometrieBoites(z.b));
      parts.push(...z.g);
      if (parts.length) res.push(parts.length > 1 ? mergeGeometries(parts) : parts[0]);
    }
    return res;
  }
}

// Textures du bois des constructions
function textureBois(teinte, abime) {
  const cv = document.createElement('canvas'); cv.width = cv.height = 64;
  const g = cv.getContext('2d');
  g.fillStyle = teinte; g.fillRect(0, 0, 64, 64);
  for (let i = 0; i < 4; i++) {
    g.fillStyle = `rgba(255,255,255,${0.04 + (i % 2) * 0.05})`; g.fillRect(0, i * 16, 64, 16);
    g.fillStyle = 'rgba(70,35,10,0.18)';
    for (let k = 0; k < 6; k++) g.fillRect((i * 17 + k * 11) % 64, i * 16 + 3 + (k % 3) * 4, 8, 1);
    g.fillStyle = 'rgba(60,30,10,0.55)'; g.fillRect(0, i * 16 + 15, 64, 1);
    g.fillRect((i * 23) % 64, i * 16, 1, 16);
    g.fillStyle = '#5a5f66'; g.fillRect(((i * 23) % 64) + 3, i * 16 + 7, 2, 2); g.fillRect(((i * 23 + 32) % 64), i * 16 + 7, 2, 2);
  }
  g.strokeStyle = 'rgba(60,30,10,0.85)'; g.lineWidth = 4; g.strokeRect(0, 0, 64, 64);
  if (abime) {
    g.strokeStyle = 'rgba(30,15,5,0.9)'; g.lineWidth = 1.5;
    for (const l of [[[8, 4], [20, 20], [16, 34], [28, 50]], [[44, 6], [38, 22], [50, 36]], [[56, 48], [44, 60]]]) {
      g.beginPath(); g.moveTo(...l[0]); for (const p of l.slice(1)) g.lineTo(...p); g.stroke();
    }
  }
  const t = new THREE.CanvasTexture(cv);
  t.magFilter = THREE.NearestFilter; t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

const lisse = (a, b, x) => { const t = borner((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };
const distSegment = (x, z, ax, az, bx, bz) => {
  const vx = bx - ax, vz = bz - az, L = vx * vx + vz * vz || 1;
  const t = borner(((x - ax) * vx + (z - az) * vz) / L, 0, 1);
  return Math.hypot(x - ax - vx * t, z - az - vz * t);
};

export class Monde {
  constructor(graine) {
    this.graine = graine;
    this.N = N; this.DEMI = DEMI;
    this.rng = hasard(graine);
    this.H = new Float32Array(N * N);
    this.cellules = new Map();
    this.tampon = 0;
    this.maisons = []; this.arbres = []; this.rochers = []; this.coffres = []; this.lieux = []; this.routes = [];
    this.pointsButin = []; this.cheminees = []; this.champs = []; this.palmiersForces = []; this.riviere = [];
    this.anim = { ecrans: [], phares: [], projecteurs: [], fumees: [], fontaines: [] };
    this.constructions = new Map();
    this.animations = []; this.secousses = []; this.chutes = [];
    this.temps = 0;
    this.groupe = new THREE.Group();
    this.C = new Constructeur(); this.V = []; this.Lum = []; this.Ecrans = [];
    this.genererTerrain();
    this.creuserRiviere();
    this.creuserLac();
    this.genererLieux();
    this.genererRoutes();
    this.calculerHMax();
    for (const m of this.maisons) this.construireMaison(m);
    this.cheminees.push(...this.anim.fumees);
    this.lieuxFontaines = this.anim.fontaines;
    this.genererArbresRochers();
    this.genererPointsButin();
    this.genererBonus();
    // chaque objet se pose sur ce qu'il y a juste en dessous (sol, plancher, rampe)
    for (const p of this.pointsButin) {
      const h = this.lancerRayon(p.x, p.y + 0.4, p.z, 0, -1, 0, 6);
      p.y = (h ? h.y : this.hauteurTerrain(p.x, p.z)) + 0.1;
    }
    this.geosMaisons = this.C.geometriesParZone(64);
    this.geoVitres = this.V.length ? geometrieBoites(this.V.map(b => ({ ...b, couleur: '#ffffff' }))) : null;
    this.geoLumieres = this.Lum.length ? geometrieBoites(this.Lum) : null;
    this.geoEcrans = this.Ecrans.length ? geometrieBoites(this.Ecrans) : null;
  }

  // ---------- Terrain et zones ----------
  facteur(zone, x, z, largeur = 35) { return lisse(0, 1, (zone.r - Math.hypot(x - zone.x, z - zone.z)) / largeur); }
  biome(x, z) {
    if (this.facteur(this.zoneNeige, x, z) > 0.5) return 'neige';
    if (this.facteur(this.zoneDesert, x, z) > 0.5) return 'desert';
    return 'prairie';
  }

  genererTerrain() {
    const r = this.rng;
    const b1 = creerBruit(r), b2 = creerBruit(r), b3 = creerBruit(r), b4 = creerBruit(r);
    const a0 = r() * Math.PI * 2;
    this.montagne = { x: Math.cos(a0) * DEMI * 0.42, z: Math.sin(a0) * DEMI * 0.42 };
    const ad = a0 + Math.PI + (r() - 0.5) * 0.8;
    this.zoneDesert = { x: Math.cos(ad) * DEMI * 0.47, z: Math.sin(ad) * DEMI * 0.47, r: DEMI * 0.36 };
    this.zoneNeige = { x: this.montagne.x * 1.08, z: this.montagne.z * 1.08, r: DEMI * 0.34 };
    for (let iz = 0; iz < N; iz++) for (let ix = 0; ix < N; ix++) {
      const x = -DEMI + ix * PAS, z = -DEMI + iz * PAS;
      const d = Math.hypot(x, z) / DEMI + (b3(x / 70 + 40, z / 70 + 40) - 0.5) * 0.3;
      const t = borner((0.93 - d) / 0.28, 0, 1);
      const masque = t * t * (3 - 2 * t);
      let h = 2 + b1(x / 95, z / 95) * 13 + b2(x / 24, z / 24) * 2.5;
      const dm = Math.hypot(x - this.montagne.x, z - this.montagne.z);
      h += Math.pow(Math.max(0, 1 - dm / 72), 2) * 30;
      const fd = this.facteur(this.zoneDesert, x, z, 40);
      if (fd > 0) h = h * (1 - fd) + (2.8 + b4(x / 28, z / 28) * 4.5 + b2(x / 9, z / 9) * 0.5) * fd;
      this.H[iz * N + ix] = h * masque - 1.8 * (1 - masque);
    }
  }

  hauteurTerrain(x, z) {
    let fx = (x + DEMI) / PAS, fz = (z + DEMI) / PAS;
    fx = borner(fx, 0, N - 1.0001); fz = borner(fz, 0, N - 1.0001);
    const ix = Math.floor(fx), iz = Math.floor(fz);
    const tx = fx - ix, tz = fz - iz;
    const H = this.H;
    const a = H[iz * N + ix], b = H[(iz + 1) * N + ix], c = H[(iz + 1) * N + ix + 1], d = H[iz * N + ix + 1];
    if (tx + tz <= 1) return a + (d - a) * tx + (b - a) * tz;
    return c + (b - c) * (1 - tx) + (d - c) * (1 - tz);
  }

  aplanir(x0, z0, x1, z1, h, marge) {
    const i0 = Math.max(0, Math.floor((x0 - marge + DEMI) / PAS)), i1 = Math.min(N - 1, Math.ceil((x1 + marge + DEMI) / PAS));
    const j0 = Math.max(0, Math.floor((z0 - marge + DEMI) / PAS)), j1 = Math.min(N - 1, Math.ceil((z1 + marge + DEMI) / PAS));
    for (let iz = j0; iz <= j1; iz++) for (let ix = i0; ix <= i1; ix++) {
      const x = -DEMI + ix * PAS, z = -DEMI + iz * PAS;
      const dx = Math.max(x0 - x, 0, x - x1), dz = Math.max(z0 - z, 0, z - z1);
      const dist = Math.hypot(dx, dz);
      const w = dist <= 1 ? 1 : borner(1 - (dist - 1) / marge, 0, 1);
      const k = iz * N + ix;
      this.H[k] = this.H[k] + (h - this.H[k]) * w;
    }
  }

  // Creuse un trou d'eau rond (oasis, lac)
  creuser(cx, cz, rayon, fond, marge) {
    const i0 = Math.max(0, Math.floor((cx - rayon - marge + DEMI) / PAS)), i1 = Math.min(N - 1, Math.ceil((cx + rayon + marge + DEMI) / PAS));
    const j0 = Math.max(0, Math.floor((cz - rayon - marge + DEMI) / PAS)), j1 = Math.min(N - 1, Math.ceil((cz + rayon + marge + DEMI) / PAS));
    for (let iz = j0; iz <= j1; iz++) for (let ix = i0; ix <= i1; ix++) {
      const x = -DEMI + ix * PAS, z = -DEMI + iz * PAS, k = iz * N + ix;
      const w = 1 - lisse(rayon - 2, rayon + marge, Math.hypot(x - cx, z - cz));
      if (this.H[k] > fond) this.H[k] += (fond - this.H[k]) * w;
    }
  }

  creuserRiviere() {
    const r = this.rng, bw = creerBruit(r);
    const a = Math.atan2(this.montagne.z, this.montagne.x), sens = r() < 0.5 ? 1 : -1;
    const cible = { x: Math.cos(a + sens * 1.35) * DEMI * 1.2, z: Math.sin(a + sens * 1.35) * DEMI * 1.2 };
    let x = this.montagne.x * 0.72, z = this.montagne.z * 0.72;
    const pts = [[x, z]];
    for (let k = 0; k < 160; k++) {
      let dx = cible.x - x, dz = cible.z - z; const L = Math.hypot(dx, dz) || 1; dx /= L; dz /= L;
      const w = (bw(k * 0.12, 3.3) - 0.5) * 1.8;
      const nx = dx - dz * w, nz = dz + dx * w, n = Math.hypot(nx, nz);
      x += nx / n * 6; z += nz / n * 6;
      pts.push([x, z]);
      if (Math.hypot(x, z) > DEMI * 0.99) break;
    }
    this.riviere = pts;
    for (let iz = 0; iz < N; iz++) for (let ix = 0; ix < N; ix++) {
      const k = iz * N + ix;
      if (this.H[k] < -1.4) continue;
      const d = this.distanceRiviere(-DEMI + ix * PAS, -DEMI + iz * PAS, 18);
      if (d >= 17) continue;
      const w = 1 - lisse(4.5, 17, d);
      this.H[k] += (-1.4 - this.H[k]) * w;
    }
  }
  distanceRiviere(x, z, limite = Infinity) {
    let best = Infinity;
    const P = this.riviere;
    for (let i = 0; i < P.length - 1; i++) {
      const [ax, az] = P[i], [bx, bz] = P[i + 1];
      if (Math.min(ax, bx) - limite > x || Math.max(ax, bx) + limite < x || Math.min(az, bz) - limite > z || Math.max(az, bz) + limite < z) continue;
      const d = distSegment(x, z, ax, az, bx, bz);
      if (d < best) best = d;
    }
    return best;
  }

  creuserLac() {
    const r = this.rng;
    for (let essai = 0; essai < 300; essai++) {
      const a = r() * Math.PI * 2, d = DEMI * (0.2 + r() * 0.45);
      const x = Math.cos(a) * d, z = Math.sin(a) * d;
      if (this.biome(x, z) !== 'prairie' || this.hauteurTerrain(x, z) < 3) continue;
      if (this.distanceRiviere(x, z) < 50 || Math.hypot(x - this.montagne.x, z - this.montagne.z) < 90) continue;
      this.lac = { x, z, r: 21 };
      this.creuser(x, z, 21, -1.8, 12);
      // petite île au milieu, avec un coffre
      for (let iz = 0; iz < N; iz++) for (let ix = 0; ix < N; ix++) {
        const px = -DEMI + ix * PAS, pz = -DEMI + iz * PAS, dd = Math.hypot(px - x, pz - z);
        if (dd < 7) { const k = iz * N + ix; this.H[k] += (1.7 - this.H[k]) * (1 - lisse(3.5, 7, dd)); }
      }
      this.coffres.push({ id: this.coffres.length, x, y: this.hauteurTerrain(x, z), z, rot: 0, ouvert: false });
      this.palmiersForces.push([x + 2.2, z + 1.2]);
      return;
    }
  }

  calculerHMax() {
    let m = -10; for (const h of this.H) if (h > m) m = h;
    this.hMax = m + 2;
  }

  // ---------- Couleur du sol ----------
  distanceRoute(x, z) {
    let best = Infinity;
    for (const [ax, az, bx, bz] of this.routes) { const d = distSegment(x, z, ax, az, bx, bz); if (d < best) best = d; }
    return best;
  }
  dansLieu(x, z, marge = 0) { return this.lieux.some(l => Math.hypot(x - l.x, z - l.z) < l.rayon + marge); }
  dansChamp(x, z) { return this.champs.some(f => x > f.x0 - 1 && x < f.x1 + 1 && z > f.z0 - 1 && z < f.z1 + 1); }
  surChemin(x, z) { return this.distanceRoute(x, z) < 3.2 || this.dansLieu(x, z, -this.lieux.length * 0); }
  couleurSol(x, z, h, n, c) {
    const T = this._tmp || (this._tmp = new THREE.Color());
    if (h < 0.35) c.set('#d8c18a');
    else if (h < 1.1) c.set('#eedca3');
    else if (h > 30) c.set('#f4f7fb');
    else if (h > 22) c.set('#8f9399').offsetHSL(0, 0, (n - 0.5) * 0.1);
    else c.setHSL(0.25 + n * 0.07, 0.52, 0.36 + n * 0.1);
    if (h >= 0.35) {
      const fd = this.facteur(this.zoneDesert, x, z, 30), fn = this.facteur(this.zoneNeige, x, z, 30);
      if (fd > 0) c.lerp(T.set(n > 0.5 ? '#efcf94' : '#e3b877'), fd);
      if (fn > 0 && h > 1.2) c.lerp(T.set(n > 0.5 ? '#f5f8fc' : '#e3ecf5'), fn * (h > 22 ? 1 : 0.95));
    }
    if (h < 1.1 || h > 28) return c;
    for (const l of this.lieux) {
      if (!l.sol) continue;
      const d = Math.hypot(x - l.x, z - l.z);
      if (d > l.rayon + 3) continue;
      const k = borner((l.rayon + 3 - d) / 3, 0, 1);
      const pave = (Math.floor(x / 1.4) + Math.floor(z / 1.4)) % 2;
      const S = {
        arene: pave ? '#262636' : '#1e1e2c', ville: d > l.rayon - 4 ? '#a7a7a7' : '#4f535c', pave: pave ? '#b9b0a2' : '#a9a093',
        beton: pave ? '#a9adb3' : '#9fa3a9', terre: n > 0.5 ? '#9c7a52' : '#8f6f48', neige: '#e8eef4', sable: n > 0.5 ? '#e6c690' : '#dfbd84',
      }[l.sol];
      c.lerp(T.set(S), k);
      return c;
    }
    for (const f of this.champs) {
      if (x > f.x0 && x < f.x1 && z > f.z0 && z < f.z1) { c.set(Math.floor((x - f.x0) / 1.8) % 2 ? '#8a6a45' : '#7d9a46'); return c; }
    }
    const dr = this.distanceRoute(x, z);
    if (dr < 3.2) {
      const b = this.biome(x, z);
      c.lerp(T.set(b === 'neige' ? '#b9b2a6' : b === 'desert' ? '#c99a62' : n > 0.5 ? '#c9a36b' : '#bf9860'), borner((3.2 - dr) / 1.2, 0, 1));
    }
    return c;
  }

  // ---------- Lieux ----------
  genererLieux() {
    const r = this.rng;
    for (const T of TYPES_LIEUX) {
      let place = null;
      for (let essai = 0; essai < 600 && !place; essai++) {
        const a = r() * Math.PI * 2, d = T.cote ? DEMI * (0.62 + r() * 0.3) : DEMI * (0.08 + r() * (T.distMax || 0.72));
        const x = Math.cos(a) * d, z = Math.sin(a) * d;
        const h = this.hauteurTerrain(x, z);
        if (T.cote) {
          if (h < 1.3 || h > 6) continue;
          const n = Math.hypot(x, z);
          if (this.hauteurTerrain(x + x / n * 22, z + z / n * 22) > -0.8) continue;
        } else if (h < 2.5 || h > 22) continue;
        if (!T.biomes.includes(this.biome(x, z))) continue;
        if (this.distanceRiviere(x, z) < T.rayon + 10) continue;
        if (this.lac && Math.hypot(x - this.lac.x, z - this.lac.z) < T.rayon + this.lac.r + 12) continue;
        if (Math.hypot(x - this.montagne.x, z - this.montagne.z) < 50) continue;
        if (this.lieux.some(l => Math.hypot(l.x - x, l.z - z) < l.rayon + T.rayon + 24)) continue;
        if (!T.cote && essai < 450) {
          let ok = true;
          for (const [ex, ez] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) if (Math.abs(this.hauteurTerrain(x + ex * T.rayon * 0.8, z + ez * T.rayon * 0.8) - h) > 8) ok = false;
          if (!ok) continue;
        }
        place = { ...T, x, z, h: Math.max(h, 2.2) };
        if (T.cote) { const n = Math.hypot(x, z); place.dx = x / n; place.dz = z / n; place.h = h; }
      }
      if (!place) continue;
      this.lieux.push(place);
      const R = place.rayon;
      if (!place.cote) this.aplanir(place.x - R, place.z - R, place.x + R, place.z + R, place.h, 12);
      this.lieuCourant = place.type;
      construireLieu(this, place);
      this.lieuCourant = null;
    }
    // Quelques maisons isolées
    for (let k = 0, essai = 0; k < 10 && essai < 400; essai++) {
      const a = r() * Math.PI * 2, d = DEMI * (0.1 + r() * 0.75);
      const x = Math.round(Math.cos(a) * d), z = Math.round(Math.sin(a) * d);
      if (this.dansLieu(x, z, 25) || this.distanceRiviere(x, z) < 22) continue;
      const b = this.biome(x, z);
      if (this.ajouterMaison(x, z, { style: b === 'neige' ? 'chalet' : b === 'desert' ? 'adobe' : 'normal' })) k++;
    }
  }

  ajouterMaison(x, z, o = {}) {
    const r = this.rng;
    const tailles = [8, 10, 12];
    const w = o.w || tailles[Math.floor(r() * 3)], d = o.d || tailles[Math.floor(r() * 3)];
    const x0 = x - w / 2, x1 = x + w / 2, z0 = z - d / 2, z1 = z + d / 2;
    const h = this.hauteurTerrain(x, z);
    if (!o.force) {
      if (h < 1.6 || h > 26) return null;
      for (const [cx, cz] of [[x0, z0], [x1, z0], [x0, z1], [x1, z1]]) if (Math.abs(this.hauteurTerrain(cx, cz) - h) > 6) return null;
    }
    for (const m of this.maisons) if (x0 - 3 < m.x1 && x1 + 3 > m.x0 && z0 - 3 < m.z1 && z1 + 3 > m.z0) return null;
    const style = o.style || 'normal', P = PALETTES[style];
    const pick = l => l[Math.floor(r() * l.length)];
    // Maison faite dans Blender (modeles/integration.json) : même tirage chez tous les joueurs
    const lieu = o.lieu || this.lieuCourant || 'isolee';
    const candidats = INTEGRATION.maisons.filter(e => (e.styles || ['normal']).includes(style) && (!e.lieux || e.lieux.includes(lieu)));
    if (candidats.length && !o.etage && !o.force && r() < (candidats[0].proportion ?? 0.35)) return this.ajouterMaisonModele(x, z, pick(candidats), o, style);
    const m = {
      x, z, w, d, x0, x1, z0, z1, h0: Math.max(h, 1.5), haut: P.grandePorte ? 5.5 : 4.5,
      porte: o.porte ?? Math.floor(r() * 4), style, P,
      mur: pick(P.murs), toit: pick(P.toits), bord: pick(P.bords),
      fenetres: [r() < 0.75, r() < 0.75, r() < 0.75, r() < 0.75],
      etage: o.etage ?? (!P.grandePorte && r() < 0.22), plat: P.plat ?? r() < 0.15, barriere: P.barriere && r() < 0.35,
    };
    this.maisons.push(m);
    this.aplanir(x0, z0, x1, z1, m.h0, 6);
    return m;
  }

  // Maison venue d'un modèle : taille, collisions et porte décrites dans le manifeste
  ajouterMaisonModele(x, z, e, o, style) {
    const r = this.rng;
    const porte = o.porte ?? Math.floor(r() * 4);
    const tourne = porte >= 2; // porte sur un côté x : la maison est tournée d'un quart de tour
    const w = tourne ? e.taille.d : e.taille.w, d = tourne ? e.taille.w : e.taille.d;
    const x0 = x - w / 2, x1 = x + w / 2, z0 = z - d / 2, z1 = z + d / 2;
    const h = this.hauteurTerrain(x, z);
    if (!o.force) {
      if (h < 1.6 || h > 26) return null;
      for (const [cx, cz] of [[x0, z0], [x1, z0], [x0, z1], [x1, z1]]) if (Math.abs(this.hauteurTerrain(cx, cz) - h) > 6) return null;
    }
    for (const m of this.maisons) if (x0 - 3 < m.x1 && x1 + 3 > m.x0 && z0 - 3 < m.z1 && z1 + 3 > m.z0) return null;
    // angle : l'avant du modèle (-Z) regarde du côté de la porte (0 : -z, 1 : +z, 2 : -x, 3 : +x)
    const angle = [0, Math.PI, Math.PI / 2, -Math.PI / 2][porte];
    const m = { x, z, w, d, x0, x1, z0, z1, h0: Math.max(h, 1.5), haut: e.taille.h || 4.5, porte, style, P: PALETTES[style], modele: e, angle,
      mur: '#d8c3a5', toit: '#8b4a2b', bord: '#6b4423', fenetres: [false, false, false, false], etage: false, plat: true, barriere: false };
    this.maisons.push(m);
    this.aplanir(x0, z0, x1, z1, m.h0, 6);
    return m;
  }

  construireMaisonModele(m) {
    const e = m.modele, c = Math.cos(m.angle), s = Math.sin(m.angle);
    // point du modèle (vx, vz) → monde (rotation d'un quart de tour, donc les boîtes restent alignées)
    const versMonde = (vx, vz) => [m.x + vx * c + vz * s, m.z - vx * s + vz * c];
    for (const b of e.collisions) {
      const [ax, az] = versMonde(b.min[0], b.min[2]), [bx, bz] = versMonde(b.max[0], b.max[2]);
      const boite = { minX: Math.min(ax, bx), maxX: Math.max(ax, bx), minZ: Math.min(az, bz), maxZ: Math.max(az, bz), minY: m.h0 + b.min[1], maxY: m.h0 + b.max[1], solide: true, type: 'maison' };
      this.ajouterBoite(boite);
      // pas de modèle chargé : on dessine les boîtes, pour que l'on voie ce qui bloque
      if (!e.scene) this.C.boite(boite.minX, boite.minY, boite.minZ, boite.maxX, boite.maxY, boite.maxZ, b.min[1] > 2 ? m.toit : m.mur);
    }
    for (const rp of e.rampes || []) {
      const [ax, az] = versMonde(rp.de[0], rp.de[2]), [bx, bz] = versMonde(rp.a[0], rp.a[2]);
      rampe(this, ax, az, m.h0 + rp.de[1], bx, bz, m.h0 + rp.a[1], rp.largeur || 1.2, '#8a5a2b');
    }
    if (e.scene) (this.maisonsModeles = this.maisonsModeles || []).push(m);
    const [cx, cz] = versMonde(...(e.coffre || [0, 0]));
    this.coffres.push({ id: this.coffres.length, x: cx, y: m.h0 + (e.coffreY || 0), z: cz, rot: m.angle, ouvert: false });
  }

  genererRoutes() {
    const L = this.lieux;
    const deja = new Set();
    for (let i = 0; i < L.length; i++) {
      const proches = L.map((l, j) => [j, Math.hypot(l.x - L[i].x, l.z - L[i].z)]).filter(p => p[0] !== i).sort((a, b) => a[1] - b[1]).slice(0, 2);
      for (const [j] of proches) {
        const cle = Math.min(i, j) + '-' + Math.max(i, j);
        if (deja.has(cle)) continue;
        deja.add(cle);
        this.routes.push([L[i].x, L[i].z, L[j].x, L[j].z]);
      }
    }
    // Ponts là où les routes croisent la rivière
    const P = this.riviere;
    for (const [ax, az, bx, bz] of this.routes) {
      for (let i = 0; i < P.length - 1; i++) {
        const [cx, cz] = P[i], [dx, dz] = P[i + 1];
        const den = (bx - ax) * (dz - cz) - (bz - az) * (dx - cx);
        if (Math.abs(den) < 1e-6) continue;
        const t = ((cx - ax) * (dz - cz) - (cz - az) * (dx - cx)) / den;
        const u = ((cx - ax) * (bz - az) - (cz - az) * (bx - ax)) / den;
        if (t < 0 || t > 1 || u < 0 || u > 1) continue;
        const px = ax + (bx - ax) * t, pz = az + (bz - az) * t;
        this.pont(px, pz, Math.abs(dx - cx) > Math.abs(dz - cz) ? 'z' : 'x');
        break;
      }
    }
  }

  pont(px, pz, axe) {
    const L = 18;
    const [xa, za, xb, zb] = axe === 'x' ? [px - L, pz, px + L, pz] : [px, pz - L, px, pz + L];
    const ha = this.hauteurTerrain(xa, za) + 0.15, hb = this.hauteurTerrain(xb, zb) + 0.15;
    if (ha < 1 || hb < 1) return;
    rampe(this, xa, za, ha, xb, zb, hb, 4.4, '#9a6b3f');
    const bois = '#6b4423';
    for (let t = 0; t <= 1.001; t += 1 / 12) {
      const y = ha + (hb - ha) * t;
      for (const s of [-2.1, 2.1]) {
        const [x, z] = axe === 'x' ? [xa + (xb - xa) * t, pz + s] : [px + s, za + (zb - za) * t];
        this.C.boite(x - 0.1, y, z - 0.1, x + 0.1, y + 1.1, z + 0.1, bois);
      }
    }
    for (const s of [-2.1, 2.1]) {
      const [cx, cz] = axe === 'x' ? [px, pz + s] : [px + s, pz];
      const long = Math.hypot(2 * L, hb - ha), ang = Math.atan((hb - ha) / (2 * L));
      if (axe === 'x') this.C.tournee(long, 0.12, 0.12, cx, (ha + hb) / 2 + 1.05, cz, 0, 0, ang, bois);
      else this.C.tournee(0.12, 0.12, long, cx, (ha + hb) / 2 + 1.05, cz, -ang, 0, 0, bois);
    }
    for (const k of [-6, 6]) {
      const [x, z] = axe === 'x' ? [px + k, pz] : [px, pz + k];
      const y = ha + (hb - ha) * ((k + L) / (2 * L));
      this.C.boite(x - 0.5, -2.5, z - 1.8, x + 0.5, y - 0.3, z + 1.8, '#8f9399');
    }
  }

  // ---------- Maisons détaillées ----------
  construireMaison(m) {
    if (m.modele) { this.construireMaisonModele(m); return; }
    const r = this.rng, C = this.C, V = this.V, Lum = this.Lum, P = m.P;
    const e = 0.4, H = m.haut * (m.etage ? 2 : 1), h0 = m.h0;
    const ajouter = (minX, minY, minZ, maxX, maxY, maxZ, couleur, solide = true) => {
      const b = C.boite(minX, minY, minZ, maxX, maxY, maxZ, couleur, (r() - 0.5) * 0.03);
      if (b && solide) { b.solide = true; b.type = 'maison'; this.ajouterBoite(b); }
      return b;
    };
    const deco = (minX, minY, minZ, maxX, maxY, maxZ, couleur) => C.boite(minX, minY, minZ, maxX, maxY, maxZ, couleur);
    const plinthe = new THREE.Color(m.mur).multiplyScalar(0.72).getStyle();
    const cotes = [
      { axe: 'x', f0: m.z0, f1: m.z0 + e, a0: m.x0, a1: m.x1, dehors: -1 },
      { axe: 'x', f0: m.z1 - e, f1: m.z1, a0: m.x0, a1: m.x1, dehors: 1 },
      { axe: 'z', f0: m.x0, f1: m.x0 + e, a0: m.z0 + e, a1: m.z1 - e, dehors: -1 },
      { axe: 'z', f0: m.x1 - e, f1: m.x1, a0: m.z0 + e, a1: m.z1 - e, dehors: 1 },
    ];
    const B = (c, a0, a1, y0, y1, f0, f1, couleur, solide = false) => c.axe === 'x'
      ? (solide ? ajouter(a0, h0 + y0, f0, a1, h0 + y1, f1, couleur) : deco(a0, h0 + y0, f0, a1, h0 + y1, f1, couleur))
      : (solide ? ajouter(f0, h0 + y0, a0, f1, h0 + y1, a1, couleur) : deco(f0, h0 + y0, a0, f1, h0 + y1, a1, couleur));
    cotes.forEach((c, i) => {
      const milieu = (c.a0 + c.a1) / 2;
      const ouv = [];
      if (i === m.porte) ouv.push(P.grandePorte ? { c: milieu, w: 4, y0: 0, y1: 4.2, porte: true } : { c: milieu, w: 2.2, y0: 0, y1: 3.1, porte: true });
      else if (m.fenetres[i]) ouv.push({ c: milieu, w: 1.8, y0: 1.3, y1: 2.9 });
      if (m.etage) ouv.push({ c: milieu, w: 1.8, y0: m.haut + 1.3, y1: m.haut + 2.9, haut: true });
      ouv.sort((a, b) => a.y0 - b.y0);
      for (const ou of ouv) ou.w = ouv[0].w;
      const o = ouv[0];
      if (!ouv.length) B(c, c.a0, c.a1, 0, H, c.f0, c.f1, m.mur, true);
      else {
        B(c, c.a0, o.c - o.w / 2, 0, H, c.f0, c.f1, m.mur, true);
        B(c, o.c + o.w / 2, c.a1, 0, H, c.f0, c.f1, m.mur, true);
        let y = 0;
        for (const ou of ouv) { B(c, ou.c - ou.w / 2, ou.c + ou.w / 2, y, ou.y0, c.f0, c.f1, m.mur, true); y = ou.y1; }
        B(c, o.c - o.w / 2, o.c + o.w / 2, y, H, c.f0, c.f1, m.mur, true);
      }
      const ext = c.dehors < 0 ? c.f0 : c.f1;
      const sort = (ep) => c.dehors < 0 ? [ext - ep, ext + 0.01] : [ext - 0.01, ext + ep];
      const [p0, p1] = sort(0.06);
      if (!o || !o.porte) B(c, c.a0, c.a1, 0, 0.5, p0, p1, plinthe);
      else { B(c, c.a0, o.c - o.w / 2 - 0.12, 0, 0.5, p0, p1, plinthe); B(c, o.c + o.w / 2 + 0.12, c.a1, 0, 0.5, p0, p1, plinthe); }
      const [q0, q1] = sort(0.08);
      B(c, c.a0 - 0.05, c.a1 + 0.05, H - 0.3, H, q0, q1, m.bord);
      if (m.etage) B(c, c.a0 - 0.05, c.a1 + 0.05, m.haut - 0.15, m.haut + 0.1, q0, q1, m.bord);
      for (const ou of ouv) {
        const g = ou.c - ou.w / 2, d = ou.c + ou.w / 2;
        const [c0, c1] = [c.f0 - 0.06, c.f1 + 0.06];
        B(c, g - 0.12, d + 0.12, ou.y1, ou.y1 + 0.14, c0, c1, m.bord);
        B(c, g - 0.12, g, ou.y0, ou.y1, c0, c1, m.bord);
        B(c, d, d + 0.12, ou.y0, ou.y1, c0, c1, m.bord);
        if (ou.porte) {
          const [t0, t1] = sort(1.0);
          B(c, g - 0.2, d + 0.2, -0.05, 0.03, t0, t1, '#8c3b2b');
          const [l0, l1] = sort(0.3);
          Lum.push(c.axe === 'x' ? { minX: d + 0.3, maxX: d + 0.55, minY: h0 + ou.y1 - 0.55, maxY: h0 + ou.y1 - 0.2, minZ: Math.min(l0, l1), maxZ: Math.max(l0, l1), couleur: '#ffd27a' }
            : { minX: Math.min(l0, l1), maxX: Math.max(l0, l1), minY: h0 + ou.y1 - 0.55, maxY: h0 + ou.y1 - 0.2, minZ: d + 0.3, maxZ: d + 0.55, couleur: '#ffd27a' });
          const fi = c.dehors < 0 ? c.f1 : c.f0, sens = -c.dehors;
          if (!P.grandePorte) B(c, g + 0.05, g + 0.13, 0, 3.0, Math.min(fi, fi + sens * 1.1), Math.max(fi, fi + sens * 1.1), '#7a4a24');
          else { // grandes portes en X (grange, entrepôt)
            const [v0, v1] = sort(0.08);
            for (const [a, b] of [[g - ou.w / 2 - 0.15, g - 0.15], [d + 0.15, d + ou.w / 2 + 0.15]]) {
              B(c, a, b, 0, ou.y1, v0, v1, new THREE.Color(m.mur).multiplyScalar(0.85).getStyle());
              B(c, a, b, ou.y1 / 2 - 0.08, ou.y1 / 2 + 0.08, v0 - 0.02, v1 + 0.02, m.bord);
            }
          }
          continue;
        }
        B(c, g - 0.15, d + 0.15, ou.y0 - 0.12, ou.y0, c0 - 0.1, c1 + 0.1, m.bord);
        if (P.fleurs) {
          const [j0, j1] = sort(0.32);
          B(c, g, d, ou.y0 - 0.42, ou.y0 - 0.12, j0, j1, '#7a4a24');
          const coulFleurs = ['#ff5d73', '#ffd23f', '#ff8c1a', '#b552ff', '#ffffff'];
          for (let k = 0; k < 4; k++) {
            const a = g + 0.2 + k * (ou.w - 0.4) / 3;
            const [f0, f1] = sort(0.22);
            B(c, a - 0.09, a + 0.09, ou.y0 - 0.12, ou.y0 + 0.08, f0 + (c.dehors < 0 ? 0.02 : 0.08), f1 - (c.dehors < 0 ? 0.08 : 0.02), coulFleurs[(k + i) % 5]);
          }
        }
        if (P.volets) {
          const [v0, v1] = sort(0.07);
          const volet = new THREE.Color(m.toit).multiplyScalar(0.9).getStyle();
          B(c, g - 0.12 - ou.w / 2, g - 0.12, ou.y0, ou.y1, v0, v1, volet);
          B(c, d + 0.12, d + 0.12 + ou.w / 2, ou.y0, ou.y1, v0, v1, volet);
        }
        const mid = (c.f0 + c.f1) / 2;
        V.push(c.axe === 'x' ? { minX: g, maxX: d, minY: h0 + ou.y0, maxY: h0 + ou.y1, minZ: mid - 0.03, maxZ: mid + 0.03 }
          : { minX: mid - 0.03, maxX: mid + 0.03, minY: h0 + ou.y0, maxY: h0 + ou.y1, minZ: g, maxZ: d });
        B(c, ou.c - 0.04, ou.c + 0.04, ou.y0, ou.y1, mid - 0.05, mid + 0.05, m.bord);
        B(c, g, d, (ou.y0 + ou.y1) / 2 - 0.04, (ou.y0 + ou.y1) / 2 + 0.04, mid - 0.05, mid + 0.05, m.bord);
      }
    });
    for (const [x, z] of [[m.x0, m.z0], [m.x1, m.z0], [m.x0, m.z1], [m.x1, m.z1]]) deco(x - 0.28, h0, z - 0.28, x + 0.28, h0 + H, z + 0.28, m.bord);
    ajouter(m.x0, h0 + H, m.z0, m.x1, h0 + H + 0.4, m.z1, m.plat ? new THREE.Color(m.mur).multiplyScalar(0.8).getStyle() : m.toit);
    deco(m.x0 + e, h0 - 0.3, m.z0 + e, m.x1 - e, h0 + 0.03, m.z1 - e, m.style === 'grange' ? '#b8954a' : '#b07a45');
    if (m.etage) {
      const yE = h0 + m.haut;
      ajouter(m.x0 + e, yE - 0.3, m.z0 + e, m.x1 - e - 4, yE, m.z1 - e, '#a0703c');
      ajouter(m.x1 - e - 4, yE - 0.3, m.z0 + e + 4.2, m.x1 - e, yE, m.z1 - e, '#a0703c');
      // escalier : du sol jusqu'au plancher de l'étage, sur toute la longueur du trou (4,2 m)
      const sx = m.x1 - e - 2;
      rampe(this, sx, m.z0 + e, h0, sx, m.z0 + e + 4.2, h0 + m.haut, 4, '#8a5a2b');
    }
    if (m.plat) this.toitPlat(m, ajouter, deco);
    else this.toitPentu(m);
    if (m.style === 'grange') {
      for (let k = 0; k < 4; k++) { const x = m.x0 + 1.5 + k * 1.4, z = m.z1 - 1.6; ajouter(x - 0.6, h0, z - 0.6, x + 0.6, h0 + 1.0, z + 0.6, '#e3c35a'); }
    } else if (m.style === 'entrepot') {
      for (let k = 0; k < 3; k++) { const x = m.x0 + 1.5 + k * 1.2, z = m.z0 + 1.5; ajouter(x - 0.5, h0, z - 0.5, x + 0.5, h0 + 1, z + 0.5, '#b5834a'); }
    } else this.meubles(m, deco);
    if (m.barriere) this.barriere(m, deco);
    if (r() < 0.8) {
      const cote = Math.floor(r() * 4);
      let cx = m.x, cz = m.z, rot = 0;
      if (cote === 0) { cz = m.z0 + 1.1; rot = 0; }
      if (cote === 1) { cz = m.z1 - 1.1; rot = Math.PI; }
      if (cote === 2) { cx = m.x0 + 1.1; rot = Math.PI / 2; }
      if (cote === 3) { cx = m.x1 - 1.1; rot = -Math.PI / 2; }
      if (cote === m.porte) { if (cote < 2) cx += m.w / 4; else cz += m.d / 4; }
      this.coffres.push({ id: this.coffres.length, x: cx, y: h0, z: cz, rot, ouvert: false });
    }
  }

  toitPlat(m, ajouter, deco) {
    const H = m.haut * (m.etage ? 2 : 1), y = m.h0 + H + 0.4;
    for (const [a, b, c, d] of [[m.x0, m.z0, m.x1, m.z0 + 0.3], [m.x0, m.z1 - 0.3, m.x1, m.z1], [m.x0, m.z0, m.x0 + 0.3, m.z1], [m.x1 - 0.3, m.z0, m.x1, m.z1]]) ajouter(a, y, b, c, y + 0.6, d, m.bord);
    if (m.P.creneaux) {
      for (let x = m.x0; x < m.x1 - 0.5; x += 1.6) { ajouter(x, y + 0.6, m.z0, x + 0.8, y + 1.3, m.z0 + 0.3, m.mur); ajouter(x, y + 0.6, m.z1 - 0.3, x + 0.8, y + 1.3, m.z1, m.mur); }
      for (let z = m.z0; z < m.z1 - 0.5; z += 1.6) { ajouter(m.x0, y + 0.6, z, m.x0 + 0.3, y + 1.3, z + 0.8, m.mur); ajouter(m.x1 - 0.3, y + 0.6, z, m.x1, y + 1.3, z + 0.8, m.mur); }
    } else if (m.P.vigas) {
      for (let x = m.x0 + 1; x < m.x1 - 0.5; x += 1.4) { deco(x, y - 0.75, m.z0 - 0.6, x + 0.22, y - 0.53, m.z0 + 0.2, '#6b4423'); deco(x, y - 0.75, m.z1 - 0.2, x + 0.22, y - 0.53, m.z1 + 0.6, '#6b4423'); }
    } else {
      deco(m.x + 0.5, y, m.z - 1, m.x + 2.3, y + 1.1, m.z + 0.6, '#c8ced6');
      deco(m.x + 0.7, y + 1.1, m.z - 0.8, m.x + 2.1, y + 1.2, m.z + 0.4, '#7b838d');
    }
  }

  toitPentu(m) {
    const C = this.C;
    const H = m.haut * (m.etage ? 2 : 1);
    const yE = m.h0 + H + 0.4;
    const o = 0.7, ep = 0.32;
    const surX = m.w >= m.d;
    const s = (surX ? m.d : m.w) / 2 + o;
    const hr = Math.min(m.P.pentu ? 5.5 : 4.2, Math.max(2, s * (m.P.pentu || 0.6)));
    const p = hr / s, ang = Math.atan(p);
    const L = (surX ? m.w : m.d) + 2 * o, W = Math.hypot(s, hr);
    const sn = Math.sin(ang) * ep / 2, cs = Math.cos(ang) * ep / 2;
    const fonce = new THREE.Color(m.toit).multiplyScalar(0.7).getStyle();
    const neige = (rx, rz, cx, cy, cz) => { if (m.P.neige) C.tournee(surX ? L - 0.2 : W - 0.4, 0.14, surX ? W - 0.4 : L - 0.2, cx, cy, cz, rx, 0, rz, '#f5f8fc'); };
    if (surX) {
      const zc = m.z;
      C.tournee(L, ep, W, m.x, yE + hr / 2 - cs, zc - s / 2 + sn, -ang, 0, 0, m.toit);
      C.tournee(L, ep, W, m.x, yE + hr / 2 - cs, zc + s / 2 - sn, ang, 0, 0, m.toit);
      neige(-ang, 0, m.x, yE + hr / 2 + 0.1, zc - s / 2 - 0.05);
      neige(ang, 0, m.x, yE + hr / 2 + 0.1, zc + s / 2 + 0.05);
      C.tournee(L + 0.1, 0.28, 0.5, m.x, yE + hr + 0.02, zc, 0, 0, 0, m.P.neige ? '#f5f8fc' : fonce);
      for (const x of [m.x0, m.x1]) C.triangle([x, yE - 0.01, m.z0], [x, yE - 0.01, m.z1], [x, yE + hr - 0.05, zc], m.mur);
      this.ajouterBoite({ minX: m.x0 - o, maxX: m.x1 + o, minZ: m.z0 - o, maxZ: zc, minY: yE, maxY: yE + hr, solide: false, type: 'maison', rampe: { A: yE - (m.z0 - o) * p, gx: 0, gz: p, minX: m.x0 - o, maxX: m.x1 + o, minZ: m.z0 - o, maxZ: zc } });
      this.ajouterBoite({ minX: m.x0 - o, maxX: m.x1 + o, minZ: zc, maxZ: m.z1 + o, minY: yE, maxY: yE + hr, solide: false, type: 'maison', rampe: { A: yE + (m.z1 + o) * p, gx: 0, gz: -p, minX: m.x0 - o, maxX: m.x1 + o, minZ: zc, maxZ: m.z1 + o } });
      const cx = m.x0 + m.w * 0.27, cz = zc - s * 0.45, yr = yE + (cz - (m.z0 - o)) * p;
      C.boite(cx - 0.4, yr - 0.6, cz - 0.4, cx + 0.4, yr + 1.4, cz + 0.4, '#9b4a3a');
      C.boite(cx - 0.5, yr + 1.4, cz - 0.5, cx + 0.5, yr + 1.6, cz + 0.5, '#5a3a32');
      this.cheminees.push({ x: cx, y: yr + 1.7, z: cz });
    } else {
      const xc = m.x;
      C.tournee(W, ep, L, xc - s / 2 + sn, yE + hr / 2 - cs, m.z, 0, 0, ang, m.toit);
      C.tournee(W, ep, L, xc + s / 2 - sn, yE + hr / 2 - cs, m.z, 0, 0, -ang, m.toit);
      neige(0, ang, xc - s / 2 - 0.05, yE + hr / 2 + 0.1, m.z);
      neige(0, -ang, xc + s / 2 + 0.05, yE + hr / 2 + 0.1, m.z);
      C.tournee(0.5, 0.28, L + 0.1, xc, yE + hr + 0.02, m.z, 0, 0, 0, m.P.neige ? '#f5f8fc' : fonce);
      for (const z of [m.z0, m.z1]) C.triangle([m.x0, yE - 0.01, z], [m.x1, yE - 0.01, z], [xc, yE + hr - 0.05, z], m.mur);
      this.ajouterBoite({ minX: m.x0 - o, maxX: xc, minZ: m.z0 - o, maxZ: m.z1 + o, minY: yE, maxY: yE + hr, solide: false, type: 'maison', rampe: { A: yE - (m.x0 - o) * p, gx: p, gz: 0, minX: m.x0 - o, maxX: xc, minZ: m.z0 - o, maxZ: m.z1 + o } });
      this.ajouterBoite({ minX: xc, maxX: m.x1 + o, minZ: m.z0 - o, maxZ: m.z1 + o, minY: yE, maxY: yE + hr, solide: false, type: 'maison', rampe: { A: yE + (m.x1 + o) * p, gx: -p, gz: 0, minX: xc, maxX: m.x1 + o, minZ: m.z0 - o, maxZ: m.z1 + o } });
      const cz = m.z0 + m.d * 0.27, cx = xc - s * 0.45, yr = yE + (cx - (m.x0 - o)) * p;
      C.boite(cx - 0.4, yr - 0.6, cz - 0.4, cx + 0.4, yr + 1.4, cz + 0.4, '#9b4a3a');
      C.boite(cx - 0.5, yr + 1.4, cz - 0.5, cx + 0.5, yr + 1.6, cz + 0.5, '#5a3a32');
      this.cheminees.push({ x: cx, y: yr + 1.7, z: cz });
    }
  }

  meubles(m, deco) {
    const r = this.rng, h = m.h0 + 0.03, e = 0.4;
    const coin = [[m.x0 + e + 0.3, m.z0 + e + 0.3, 1, 1], [m.x1 - e - 0.3, m.z0 + e + 0.3, -1, 1], [m.x0 + e + 0.3, m.z1 - e - 0.3, 1, -1], [m.x1 - e - 0.3, m.z1 - e - 0.3, -1, -1]];
    const pris = coin.sort(() => r() - 0.5).slice(0, 2);
    const couv = ['#d63031', '#3d8dff', '#2ecc71', '#f1c40f', '#b552ff'][Math.floor(r() * 5)];
    pris.forEach(([x, z, sx, sz], n) => {
      const X = (a, b) => [Math.min(x + a * sx, x + b * sx), Math.max(x + a * sx, x + b * sx)];
      const Z = (a, b) => [Math.min(z + a * sz, z + b * sz), Math.max(z + a * sz, z + b * sz)];
      if (n === 0) {
        const [a0, a1] = X(0, 1.3), [b0, b1] = Z(0, 2.1);
        deco(a0, h, b0, a1, h + 0.45, b1, '#7a4a24');
        deco(a0 + 0.05, h + 0.45, b0 + 0.05, a1 - 0.05, h + 0.6, b1 - 0.05, '#f4f4f4');
        const [c0, c1] = Z(0.6, 2.05);
        deco(a0 + 0.02, h + 0.6, c0, a1 - 0.02, h + 0.68, c1, couv);
        const [d0, d1] = Z(0.12, 0.5);
        deco(a0 + 0.2, h + 0.6, d0, a1 - 0.2, h + 0.75, d1, '#ffffff');
      } else {
        const [a0, a1] = X(0.5, 1.9), [b0, b1] = Z(0.5, 1.4);
        deco(a0, h + 0.75, b0, a1, h + 0.85, b1, '#a0703c');
        for (const [px, pz] of [[a0, b0], [a1 - 0.1, b0], [a0, b1 - 0.1], [a1 - 0.1, b1 - 0.1]]) deco(px, h, pz, px + 0.1, h + 0.75, pz + 0.1, '#7a4a24');
        deco((a0 + a1) / 2 - 0.15, h + 0.85, (b0 + b1) / 2 - 0.15, (a0 + a1) / 2 + 0.15, h + 1.1, (b0 + b1) / 2 + 0.15, '#3d8dff');
        const [e0, e1] = X(0, 0.4), [f0, f1] = Z(2.2, 3.8);
        deco(e0, h, f0, e1, h + 2.0, f1, '#6b4423');
        const livres = ['#d63031', '#2e86de', '#f1c40f', '#27ae60', '#8e44ad'];
        for (let k = 0; k < 3; k++) for (let l = 0; l < 4; l++) deco(e0 + 0.03, h + 0.15 + k * 0.6, f0 + 0.1 + l * 0.36, e1 - 0.03, h + 0.5 + k * 0.6, f0 + 0.38 + l * 0.36, livres[(k + l) % 5]);
      }
    });
  }

  barriere(m, deco) {
    const marge = 2.4;
    const x0 = m.x0 - marge, x1 = m.x1 + marge, z0 = m.z0 - marge, z1 = m.z1 + marge;
    const coul = m.bord === '#fdfaf2' ? '#fdfaf2' : '#8a5a33';
    [[x0, z0, x1, z0], [x0, z1, x1, z1], [x0, z0, x0, z1], [x1, z0, x1, z1]].forEach(([ax, az, bx, bz], i) => {
      const L = Math.hypot(bx - ax, bz - az), n = Math.round(L / 1.1);
      for (let k = 0; k <= n; k++) {
        const t = k / n;
        if (i === m.porte && Math.abs(t - 0.5) * L < 1.8) continue;
        const x = ax + (bx - ax) * t, z = az + (bz - az) * t;
        const hy = this.hauteurTerrain(x, z);
        deco(x - 0.07, hy, z - 0.07, x + 0.07, hy + 1.0, z + 0.07, coul);
        if (k < n && !(i === m.porte && Math.abs((k + 0.5) / n - 0.5) * L < 2.3)) {
          const x2 = ax + (bx - ax) * (k + 1) / n, z2 = az + (bz - az) * (k + 1) / n;
          for (const y of [0.35, 0.75]) deco(Math.min(x, x2) - 0.03, hy + y, Math.min(z, z2) - 0.03, Math.max(x, x2) + 0.03, hy + y + 0.08, Math.max(z, z2) + 0.03, coul);
        }
      }
    });
  }

  // ---------- Arbres et rochers ----------
  libreDeMaison(x, z, marge) {
    for (const m of this.maisons) if (x > m.x0 - marge && x < m.x1 + marge && z > m.z0 - marge && z < m.z1 + marge) return false;
    return true;
  }

  // Un point juste devant l'entrée d'une maison (on y laisse le passage libre)
  prochePorte(x, z, dist) {
    return this.maisons.some(h => {
      const mx = (h.x0 + h.x1) / 2, mz = (h.z0 + h.z1) / 2;
      const [px, pz] = [[mx, h.z0], [mx, h.z1], [h.x0, mz], [h.x1, mz]][h.porte];
      return Math.hypot(px - x, pz - z) < dist;
    });
  }

  genererArbresRochers() {
    const r = this.rng, bf = creerBruit(r);
    const ajouterArbre = (x, z, espece, s) => {
      const h = this.hauteurTerrain(x, z);
      const a = { id: this.arbres.length, x, z, y: h - 0.2, s, espece, sapin: espece === 'sapin' || espece === 'sapinNeige', pv: 100, vivant: true, teinte: r() };
      const larg = espece === 'cactus' ? 0.5 : espece === 'palmier' ? 0.35 : 0.45, haut = espece === 'palmier' ? 6.5 : espece === 'cactus' ? 3.0 : 3.4;
      a.boite = Monde.cylindre(x, z, larg * s, h - 1, h + haut * s, { type: 'arbre', id: a.id });
      this.ajouterBoite(a.boite);
      this.arbres.push(a);
    };
    for (const [x, z] of this.palmiersForces) if (this.libreDeMaison(x, z, 1.5)) ajouterArbre(x, z, 'palmier', 0.9 + r() * 0.3);
    for (let essai = 0; essai < 3000 && this.arbres.length < 640; essai++) {
      const x = (r() * 2 - 1) * DEMI * 0.93, z = (r() * 2 - 1) * DEMI * 0.93;
      const h = this.hauteurTerrain(x, z);
      if (h < 1.0 || h > 32) continue;
      if (!this.libreDeMaison(x, z, 3.5) || this.distanceRoute(x, z) < 3.5 || this.dansLieu(x, z, 3) || this.dansChamp(x, z) || this.prochePorte(x, z, 6)) continue;
      const b = this.biome(x, z);
      let espece;
      if (b === 'desert') { if (r() < 0.6) continue; espece = 'cactus'; }
      else if (b === 'neige') espece = 'sapinNeige';
      else if (h < 3.4 && this.hauteurTerrain(x * 1.07, z * 1.07) < 0) espece = 'palmier';
      else {
        const dens = bf(x / 60, z / 60);
        if (r() > dens * 1.3) continue;
        espece = h > 17 ? (r() < 0.85 ? 'sapin' : 'feuillu') : (r() < 0.45 ? 'sapin' : 'feuillu');
      }
      ajouterArbre(x, z, espece, 0.8 + r() * 0.6);
    }
    for (let essai = 0; essai < 600 && this.rochers.length < 150; essai++) {
      const x = (r() * 2 - 1) * DEMI * 0.95, z = (r() * 2 - 1) * DEMI * 0.95;
      const h = this.hauteurTerrain(x, z);
      if (h < -0.5) continue;
      if (!this.libreDeMaison(x, z, 3) || this.distanceRoute(x, z) < 3 || this.dansLieu(x, z, 2) || this.prochePorte(x, z, 7)) continue;
      const s = 0.9 + r() * 1.5;
      const ro = { id: this.rochers.length, x, z, y: h, s, rot: r() * 6.28, pv: 150, vivant: true, teinte: r(), biome: this.biome(x, z) };
      // le rocher dessiné est un dodécaèdre aplati (×1,1 ; ×0,85 ; ×1) : cylindre de même largeur
      ro.boite = Monde.cylindre(x, z, 0.98 * s, h - 1, h + 0.78 * s, { type: 'rocher', id: ro.id });
      this.ajouterBoite(ro.boite);
      this.rochers.push(ro);
    }
    for (let essai = 0; essai < 500 && this.coffres.length < 70; essai++) {
      const x = (r() * 2 - 1) * DEMI * 0.85, z = (r() * 2 - 1) * DEMI * 0.85;
      const h = this.hauteurTerrain(x, z);
      if (h < 1.5 || !this.libreDeMaison(x, z, 3) || this.dansLieu(x, z, 2)) continue;
      this.coffres.push({ id: this.coffres.length, x, y: h, z, rot: r() * 6.28, ouvert: false });
    }
  }

  // Coffres dorés, champignons rebondissants et fontaines de soin (même tirage chez tout le monde)
  zoneLibre(x, z, rayon) {
    const h = this.hauteurTerrain(x, z);
    let libre = true;
    this.pourBoites(x - rayon, z - rayon, x + rayon, z + rayon, b => {
      if (b.maxY > h + 0.3 && b.minY < h + 3 && b.maxX > x - rayon && b.minX < x + rayon && b.maxZ > z - rayon && b.minZ < z + rayon) libre = false;
    });
    return libre;
  }
  genererBonus() {
    const r = hasard(this.graine + 99);
    for (const c of this.coffres) c.dore = r() < 0.12;
    this.trampolines = []; this.sources = [];
    const loinDe = (liste, x, z, d) => liste.every(t => Math.hypot(t.x - x, t.z - z) > d);
    // une fontaine de soin dans chaque lieu (là où il y a de la place)
    for (const l of this.lieux) {
      if (l.cote) continue;
      for (let k = 0; k < 60; k++) {
        const a = r() * Math.PI * 2, d = l.rayon * (0.25 + r() * 0.6);
        const x = l.x + Math.cos(a) * d, z = l.z + Math.sin(a) * d;
        const h = this.hauteurTerrain(x, z);
        if (h < 1.5 || !this.libreDeMaison(x, z, 3) || !this.zoneLibre(x, z, 2.6)) continue;
        this.sources.push({ id: this.sources.length, x, y: h, z });
        break;
      }
    }
    // champignons rebondissants : autour des lieux et dans la nature
    for (const l of this.lieux) {
      for (let k = 0, pose = 0; k < 40 && pose < 2; k++) {
        const a = r() * Math.PI * 2, d = l.rayon + 4 + r() * 14;
        const x = l.x + Math.cos(a) * d, z = l.z + Math.sin(a) * d;
        const h = this.hauteurTerrain(x, z);
        if (h < 1.5 || !this.libreDeMaison(x, z, 3) || !this.zoneLibre(x, z, 1.6) || !loinDe(this.trampolines, x, z, 18)) continue;
        this.trampolines.push({ id: this.trampolines.length, x, y: h, z, anim: 0 }); pose++;
      }
    }
    for (let k = 0; k < 200 && this.trampolines.length < 26; k++) {
      const x = (r() * 2 - 1) * DEMI * 0.85, z = (r() * 2 - 1) * DEMI * 0.85;
      const h = this.hauteurTerrain(x, z);
      if (h < 1.5 || h > 30 || !this.libreDeMaison(x, z, 3) || !this.zoneLibre(x, z, 1.6) || !loinDe(this.trampolines, x, z, 35)) continue;
      this.trampolines.push({ id: this.trampolines.length, x, y: h, z, anim: 0 });
    }
  }

  genererPointsButin() {
    const r = this.rng;
    for (const m of this.maisons) {
      for (let k = 0; k < 2; k++) this.pointsButin.push({ x: m.x0 + 1.5 + r() * (m.w - 3), z: m.z0 + 1.5 + r() * (m.d - 3), y: m.h0 + 0.1 });
      if (m.etage) this.pointsButin.push({ x: m.x0 + 1.5 + r() * (m.w - 6), z: m.z0 + 1.5 + r() * (m.d - 3), y: m.h0 + m.haut + 0.1 });
    }
    for (let k = 0, essai = 0; k < 70 && essai < 500; essai++) {
      const x = (r() * 2 - 1) * DEMI * 0.88, z = (r() * 2 - 1) * DEMI * 0.88;
      const h = this.hauteurTerrain(x, z);
      if (h < 1.5 || !this.libreDeMaison(x, z, 2)) continue;
      this.pointsButin.push({ x, z, y: h + 0.1 }); k++;
    }
  }

  // ---------- Grille de collision ----------
  ajouterBoite(b) {
    b.cles = [];
    for (let cx = Math.floor(b.minX / CH); cx <= Math.floor(b.maxX / CH); cx++)
      for (let cz = Math.floor(b.minZ / CH); cz <= Math.floor(b.maxZ / CH); cz++) {
        const k = cx * 1000 + cz;
        let arr = this.cellules.get(k);
        if (!arr) { arr = []; this.cellules.set(k, arr); }
        arr.push(b); b.cles.push(k);
      }
  }
  retirerBoite(b) {
    for (const k of b.cles || []) {
      const arr = this.cellules.get(k);
      if (!arr) continue;
      const i = arr.indexOf(b); if (i >= 0) arr.splice(i, 1);
    }
    b.cles = [];
  }
  pourBoites(minX, minZ, maxX, maxZ, fn) {
    const tp = ++this.tampon;
    for (let cx = Math.floor(minX / CH); cx <= Math.floor(maxX / CH); cx++)
      for (let cz = Math.floor(minZ / CH); cz <= Math.floor(maxZ / CH); cz++) {
        const arr = this.cellules.get(cx * 1000 + cz);
        if (!arr) continue;
        for (let n = 0; n < arr.length; n++) {
          const b = arr[n];
          if (b.tampon === tp) continue;
          b.tampon = tp; fn(b);
        }
      }
  }

  hauteurSol(x, z, pieds) {
    let h = this.hauteurTerrain(x, z);
    this.pourBoites(x, z, x, z, b => {
      if (!b.rampe) return;
      const y = hauteurRampe(b.rampe, x, z);
      if (y !== null && y <= pieds + 0.8 && y > h) h = y;
    });
    return h;
  }

  // ---------- Déplacement avec collisions ----------
  // On découpe le mouvement en petits pas (25 cm au plus) : même en tombant du dirigeable
  // ou quand le jeu rame, on ne traverse plus un mur, un toit, et on ne rate plus une rampe.
  deplacer(e, dt) {
    const dist = Math.max(Math.abs(e.vx), Math.abs(e.vz), Math.abs(e.vy)) * dt;
    const n = Math.min(48, Math.max(1, Math.ceil(dist / 0.25)));
    const h = dt / n;
    for (let k = 0; k < n; k++) this.pas(e, h);
    e.dansEau = e.y < -0.3;
  }

  pas(e, dt) {
    const R = 0.4, Ht = 1.8;
    const avant = e.auSol;
    const x0 = e.x, z0 = e.z;
    e.x += e.vx * dt; this.resoudre(e, 0, R, Ht, avant, dt);
    e.z += e.vz * dt; this.resoudre(e, 2, R, Ht, avant, dt);
    // pente trop raide (falaises) : au sol, on ne grimpe pas plus de ~63°
    if (avant) {
      const d = Math.hypot(e.x - x0, e.z - z0);
      if (d > 1e-4 && this.hauteurTerrain(e.x, e.z) - Math.max(e.y, this.hauteurTerrain(x0, z0)) > d * 2 + 0.02) { e.x = x0; e.z = z0; }
    }
    e.y += e.vy * dt; e.auSol = false; this.resoudre(e, 1, R, Ht, avant, dt);
    // le sol = terrain, rampes ET dessus des boîtes sous les pieds (sinon on « retombe »
    // dans une marche ou un plancher juste après y être monté)
    const sol = Math.max(this.hauteurSol(e.x, e.z, e.y), this.dessusSous(e, R));
    if (e.y <= sol) { e.y = sol; if (e.vy < 0) e.vy = 0; e.auSol = true; }
    else if (!e.auSol && avant && e.vy <= 0 && e.y - sol < 0.7) { e.y = sol; e.vy = 0; e.auSol = true; }
    e.x = borner(e.x, -DEMI + 1, DEMI - 1);
    e.z = borner(e.z, -DEMI + 1, DEMI - 1);
  }

  resoudre(e, axe, R, Ht, avant, dt) {
    this.pourBoites(e.x - R, e.z - R, e.x + R, e.z + R, b => {
      if (!b.solide) return;
      if (b.cyl) { this.resoudreCylindre(e, b, axe, R, Ht, avant, dt); return; }
      if (!(e.x + R > b.minX && e.x - R < b.maxX && e.y + Ht > b.minY && e.y < b.maxY && e.z + R > b.minZ && e.z - R < b.maxZ)) return;
      if (axe === 1) {
        const dessus = b.maxY - e.y, dessous = e.y + Ht - b.minY;
        if (e.vy <= 0 && dessus <= 0.6 + Math.abs(e.vy * dt)) { e.y = b.maxY; e.vy = 0; e.auSol = true; return; }
        if (e.vy > 0 && dessous <= 0.6 + e.vy * dt) { e.y = b.minY - Ht - 0.001; e.vy = 0; return; }
        const px1 = e.x + R - b.minX, px2 = b.maxX - (e.x - R), pz1 = e.z + R - b.minZ, pz2 = b.maxZ - (e.z - R);
        const m = Math.min(px1, px2, pz1, pz2);
        if (m === px1) e.x -= px1 + 0.001; else if (m === px2) e.x += px2 + 0.001;
        else if (m === pz1) e.z -= pz1 + 0.001; else e.z += pz2 + 0.001;
        return;
      }
      if (avant && b.maxY - e.y <= 0.6) { e.y = b.maxY; return; }
      // on ressort du côté par où l'on est entré ; si l'on est enfoncé plus que ce pas
      // (construction posée sur soi…), on ressort par le côté le plus proche
      if (axe === 0) {
        const g = e.x + R - b.minX, d = b.maxX - (e.x - R), pas = Math.abs(e.vx * dt) + 0.02;
        if (e.vx > 0 && g <= pas) e.x = b.minX - R - 0.001;
        else if (e.vx < 0 && d <= pas) e.x = b.maxX + R + 0.001;
        else if (g < d) e.x = b.minX - R - 0.001; else e.x = b.maxX + R + 0.001;
      } else {
        const g = e.z + R - b.minZ, d = b.maxZ - (e.z - R), pas = Math.abs(e.vz * dt) + 0.02;
        if (e.vz > 0 && g <= pas) e.z = b.minZ - R - 0.001;
        else if (e.vz < 0 && d <= pas) e.z = b.maxZ + R + 0.001;
        else if (g < d) e.z = b.minZ - R - 0.001; else e.z = b.maxZ + R + 0.001;
      }
    });
  }

  // Le plus haut dessus de boîte (ou de cylindre) sous les pieds, sans dépasser les pieds
  dessusSous(e, R) {
    let h = -Infinity;
    this.pourBoites(e.x - R, e.z - R, e.x + R, e.z + R, b => {
      if (!b.solide || b.maxY > e.y + 0.05 || b.maxY <= h || b.maxY < e.y - 0.7) return;
      const dessous = b.cyl ? Math.hypot(e.x - b.cx, e.z - b.cz) < R + b.r
        : e.x + R > b.minX && e.x - R < b.maxX && e.z + R > b.minZ && e.z - R < b.maxZ;
      if (dessous) h = b.maxY;
    });
    return h;
  }

  resoudreCylindre(e, c, axe, R, Ht, avant, dt) {
    const dx = e.x - c.cx, dz = e.z - c.cz, d = Math.hypot(dx, dz), rr = R + c.r;
    if (d >= rr || e.y + Ht <= c.minY || e.y >= c.maxY) return;
    if (axe === 1) {
      const dessus = c.maxY - e.y, dessous = e.y + Ht - c.minY;
      if (e.vy <= 0 && dessus <= 0.6 + Math.abs(e.vy * dt)) { e.y = c.maxY; e.vy = 0; e.auSol = true; return; }
      if (e.vy > 0 && dessous <= 0.6 + e.vy * dt) { e.y = c.minY - Ht - 0.001; e.vy = 0; return; }
    } else if (avant && c.maxY - e.y <= 0.6) { e.y = c.maxY; return; }
    // on glisse autour du tronc / du rocher
    if (d > 1e-4) { const k = (rr + 0.001) / d; e.x = c.cx + dx * k; e.z = c.cz + dz * k; }
    else e.x = c.cx + rr + 0.001;
  }

  // Collider rond (cylindre debout) rangé dans la même grille que les boîtes
  static cylindre(x, z, r, minY, maxY, extra = {}) {
    return { cyl: true, cx: x, cz: z, r, minX: x - r, maxX: x + r, minZ: z - r, maxZ: z + r, minY, maxY, solide: true, ...extra };
  }

  // ---------- Rayons (tirs, caméra) ----------
  lancerRayon(ox, oy, oz, dx, dy, dz, maxD, filtre) {
    let best = maxD, touche = null;
    const ix = 1 / (dx || 1e-9), iy = 1 / (dy || 1e-9), iz = 1 / (dz || 1e-9);
    const tp = ++this.tampon;
    let cx = Math.floor(ox / CH), cz = Math.floor(oz / CH);
    const sx = dx > 0 ? 1 : -1, sz = dz > 0 ? 1 : -1;
    const tdx = dx !== 0 ? Math.abs(CH / dx) : Infinity, tdz = dz !== 0 ? Math.abs(CH / dz) : Infinity;
    let tmx = dx !== 0 ? (dx > 0 ? (cx + 1) * CH - ox : ox - cx * CH) / Math.abs(dx) : Infinity;
    let tmz = dz !== 0 ? (dz > 0 ? (cz + 1) * CH - oz : oz - cz * CH) / Math.abs(dz) : Infinity;
    let t = 0;
    for (let n = 0; n < 500 && t <= best; n++) {
      const arr = this.cellules.get(cx * 1000 + cz);
      if (arr) for (let q = 0; q < arr.length; q++) {
        const b = arr[q];
        if (b.tampon === tp) continue;
        b.tampon = tp;
        if (filtre && !filtre(b)) continue;
        const tt = b.rampe ? rayonRampe(b.rampe, ox, oy, oz, dx, dy, dz) : b.cyl ? rayonCylindre(b, ox, oy, oz, dx, dy, dz) : (b.solide ? rayonBoite(b, ox, oy, oz, ix, iy, iz) : null);
        if (tt !== null && tt < best) { best = tt; touche = b; }
      }
      if (tmx < tmz) { t = tmx; tmx += tdx; cx += sx; } else { t = tmz; tmz += tdz; cz += sz; }
      if (t === Infinity) break;
    }
    const tTerrain = this.rayonTerrain(ox, oy, oz, dx, dy, dz, best);
    if (tTerrain !== null && tTerrain < best) return { t: tTerrain, type: 'terrain', x: ox + dx * tTerrain, y: oy + dy * tTerrain, z: oz + dz * tTerrain };
    if (!touche) return null;
    return { t: best, type: touche.type, boite: touche, x: ox + dx * best, y: oy + dy * best, z: oz + dz * best };
  }

  rayonTerrain(ox, oy, oz, dx, dy, dz, maxD) {
    let t = 0;
    for (let n = 0; n < 700 && t <= maxD; n++) {
      const x = ox + dx * t, y = oy + dy * t, z = oz + dz * t;
      if (y > this.hMax && dy >= 0) return null;
      const h = this.hauteurTerrain(x, z);
      if (y < h) {
        let a = Math.max(0, t - 1.2), b = t;
        for (let k = 0; k < 10; k++) {
          const m = (a + b) / 2;
          if (oy + dy * m < this.hauteurTerrain(ox + dx * m, oz + dz * m)) b = m; else a = m;
        }
        return a <= maxD ? a : null;
      }
      t += Math.max(0.6, (y - h) * 0.55);
    }
    return null;
  }

  // ---------- Constructions des joueurs ----------
  static boiteConstruction(c) {
    const i = c.i * CASE, j = c.j * CASE, k = c.k * CASE;
    if (c.type === 'mur') {
      if (c.axe === 'x') return { minX: i - 0.15, maxX: i + 0.15, minZ: j, maxZ: j + CASE, minY: k, maxY: k + CASE };
      return { minX: i, maxX: i + CASE, minZ: j - 0.15, maxZ: j + 0.15, minY: k, maxY: k + CASE };
    }
    if (c.type === 'sol') return { minX: i, maxX: i + CASE, minZ: j, maxZ: j + CASE, minY: k - 0.15, maxY: k + 0.15 };
    return { minX: i, maxX: i + CASE, minZ: j, maxZ: j + CASE, minY: k, maxY: k + CASE };
  }

  initMateriauxConstruction() {
    if (this.matConstr) return;
    this.matConstr = new THREE.MeshLambertMaterial({ map: textureBois('#c8955a') });
    this.matAbime = new THREE.MeshLambertMaterial({ map: textureBois('#a87a48', true) });
    this.matFantome = new THREE.MeshBasicMaterial({ color: '#4fb3ff', transparent: true, opacity: 0.38, depthWrite: false });
    this.matFantomeRouge = new THREE.MeshBasicMaterial({ color: '#ff4f4f', transparent: true, opacity: 0.35, depthWrite: false });
    this.geoMurX = new THREE.BoxGeometry(0.3, CASE, CASE);
    this.geoMurZ = new THREE.BoxGeometry(CASE, CASE, 0.3);
    this.geoSol = new THREE.BoxGeometry(CASE, 0.3, CASE);
    this.geoRampeX = new THREE.BoxGeometry(CASE * Math.SQRT2, 0.3, CASE);
    this.geoRampeZ = new THREE.BoxGeometry(CASE, 0.3, CASE * Math.SQRT2);
  }

  // Pièce faite dans Blender (constructions.glb, tailles exactes : 4 × 4 × 0,3)
  modeleConstruction(c, materiel) {
    const nom = (c.type === 'mur' ? 'mur' : c.type === 'sol' ? 'sol' : 'rampe') + '_' + (c.matiere || 'bois');
    const m = modeleGlb(nom);
    if (!m) return null;
    if (materiel !== this.matConstr) m.traverse(o => { if (o.isMesh) { o.material = materiel; o.castShadow = false; o.renderOrder = 5; } });
    const i = c.i * CASE, j = c.j * CASE, k = c.k * CASE;
    const g = new THREE.Group(); g.add(m);
    if (c.type === 'mur') {
      if (c.axe === 'x') { m.rotation.y = Math.PI / 2; g.position.set(i, k + 2, j + 2); } else g.position.set(i + 2, k + 2, j);
    } else if (c.type === 'sol') g.position.set(i + 2, k, j + 2);
    else {
      if (c.d < 2) m.rotation.y = Math.PI / 2; // la longueur de la rampe le long de x
      g.position.set(i + 2, k + 2 - 0.2, j + 2);
      if (c.d === 0) g.rotation.z = Math.PI / 4;
      if (c.d === 1) g.rotation.z = -Math.PI / 4;
      if (c.d === 2) g.rotation.x = -Math.PI / 4;
      if (c.d === 3) g.rotation.x = Math.PI / 4;
    }
    g.userData.blender = true;
    return g;
  }

  meshConstruction(c, materiel) {
    this.initMateriauxConstruction();
    const bl = this.modeleConstruction(c, materiel);
    if (bl) return bl;
    let mesh;
    const i = c.i * CASE, j = c.j * CASE, k = c.k * CASE;
    if (c.type === 'mur') {
      mesh = new THREE.Mesh(c.axe === 'x' ? this.geoMurX : this.geoMurZ, materiel);
      if (c.axe === 'x') mesh.position.set(i, k + 2, j + 2); else mesh.position.set(i + 2, k + 2, j);
    } else if (c.type === 'sol') {
      mesh = new THREE.Mesh(this.geoSol, materiel);
      mesh.position.set(i + 2, k, j + 2);
    } else {
      const surX = c.d < 2;
      mesh = new THREE.Mesh(surX ? this.geoRampeX : this.geoRampeZ, materiel);
      mesh.position.set(i + 2, k + 2 - 0.2, j + 2);
      if (c.d === 0) mesh.rotation.z = Math.PI / 4;
      if (c.d === 1) mesh.rotation.z = -Math.PI / 4;
      if (c.d === 2) mesh.rotation.x = -Math.PI / 4;
      if (c.d === 3) mesh.rotation.x = Math.PI / 4;
    }
    return mesh;
  }

  ajouterConstruction(c) {
    if (this.constructions.has(c.cle)) return;
    this.initMateriauxConstruction();
    const b = Monde.boiteConstruction(c);
    b.type = 'constr'; b.cle = c.cle; b.solide = c.type !== 'rampe';
    if (c.type === 'rampe') b.rampe = { i: c.i, j: c.j, k: c.k, d: c.d };
    this.ajouterBoite(b);
    const mesh = this.meshConstruction(c, this.matConstr);
    mesh.castShadow = true; mesh.receiveShadow = true;
    mesh.scale.setScalar(0.3);
    this.groupe.add(mesh);
    this.animations.push({ mesh, t: 0 });
    this.constructions.set(c.cle, { ...c, boite: b, mesh, pv: c.pv ?? 150, pvMax: c.pv ?? 150 });
  }

  abimerConstruction(cle, pv) {
    const c = this.constructions.get(cle);
    if (!c) return null;
    c.pv = pv;
    const abime = pv < c.pvMax * 0.5;
    if (c.mesh.userData.blender) c.mesh.traverse(o => { if (!o.isMesh) return; o.userData.matOrig ??= o.material; o.material = abime ? materiauAbime(o.userData.matOrig) : o.userData.matOrig; });
    else c.mesh.material = abime ? this.matAbime : this.matConstr;
    return c;
  }

  retirerConstruction(cle) {
    const c = this.constructions.get(cle);
    if (!c) return null;
    this.retirerBoite(c.boite);
    this.groupe.remove(c.mesh);
    this.constructions.delete(cle);
    return c;
  }

  secouer(type, id) { this.secousses.push({ type, id, t: 0 }); }

  animer(dt) {
    this.temps += dt;
    // arbres qui tombent
    for (let n = this.chutes.length - 1; n >= 0; n--) {
      const c = this.chutes[n];
      c.t += dt;
      const k = Math.min(1, c.t / 1.0);
      c.pivot.quaternion.setFromAxisAngle(c.axe, k * k * 1.5);
      if (c.t > 1.3) c.pivot.position.y = c.y - (c.t - 1.3) * 2.5;
      if (c.t > 2.4) { this.groupe.remove(c.pivot); c.pivot.traverse(o => { if (o.material) o.material.dispose(); }); this.chutes.splice(n, 1); }
    }
    // champignons qui s'écrasent quand on rebondit dessus
    for (const t of this.trampolines || []) {
      if (!t.mesh) continue;
      if (t.anim > 0) t.anim = Math.max(0, t.anim - dt * 3);
      const s = 1 - Math.sin(t.anim * Math.PI) * 0.3 * t.anim;
      t.chapeau.scale.set(1 + (1 - s) * 0.8, s, 1 + (1 - s) * 0.8);
    }
    for (const s of this.sources || []) if (s.eau) s.eau.rotation.y += dt * 0.8;
    if (this.rayonsDores) for (const r of this.rayonsDores) r.material.opacity = 0.45 + Math.sin(this.temps * 3) * 0.15;
    for (let n = this.animations.length - 1; n >= 0; n--) {
      const a = this.animations[n];
      a.t += dt * 7;
      a.mesh.scale.setScalar(Math.min(1, 0.3 + a.t * 0.7));
      if (a.t >= 1) this.animations.splice(n, 1);
    }
    if (this.matHerbe) this.matHerbe.userData.uTemps.value = this.temps;
    if (this.nuages) this.nuages.rotation.y += dt * 0.004;
    for (const c of this.coffres) {
      if (c.ouvert && c.couvercle && c.ouvreT < 1) {
        c.ouvreT = Math.min(1, c.ouvreT + dt * 3);
        c.couvercle.rotation.x = (1 - Math.pow(1 - c.ouvreT, 3)) * 1.9;
      }
    }
    // Phares qui tournent, projecteurs de l'arène, écran géant animé
    for (const p of this.meshPhares || []) p.rotation.y += dt * 0.8;
    for (const p of this.meshProjecteurs || []) {
      const t = this.temps * 0.9 + p.userData.phase;
      p.rotation.set(Math.sin(t) * 0.45, 0, Math.cos(t * 1.3) * 0.35 + 0.15);
    }
    this.ecranT = (this.ecranT || 0) - dt;
    if (this.ecranT <= 0 && this.dessinerEcrans) { this.ecranT = 0.1; this.dessinerEcrans(this.temps); }
    if (this.secousses.length && this.iTroncs) {
      const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler(), v = new THREE.Vector3(), sc = new THREE.Vector3();
      for (let n = this.secousses.length - 1; n >= 0; n--) {
        const s = this.secousses[n];
        s.t += dt;
        const fin = s.t >= 0.35;
        const ang = fin ? 0 : Math.sin(s.t * 45) * 0.06 * (1 - s.t / 0.35);
        if (s.type === 'arbre') {
          const a = this.arbres[s.id];
          if (!a || !a.vivant) { this.secousses.splice(n, 1); continue; }
          e.set(ang, a.id * 1.7, ang * 0.6); q.setFromEuler(e);
          this.matriceTronc(a, q, m4, v, sc); this.iTroncs.setMatrixAt(a.id, m4);
          this.matriceCouronne(a, q, m4, v, sc);
          const im = this.iCouronnes[a.espece];
          im.setMatrixAt(a.iCouronne, m4);
          this.iTroncs.instanceMatrix.needsUpdate = true;
          im.instanceMatrix.needsUpdate = true;
        }
        if (fin) this.secousses.splice(n, 1);
      }
    }
  }

  matriceTronc(a, q, m4, v, sc) {
    if (a.espece === 'cactus') m4.makeScale(0, 0, 0);
    else if (a.espece === 'palmier') m4.compose(v.set(a.x, a.y, a.z), q, sc.set(0.55 * a.s, 6.4 * a.s, 0.55 * a.s));
    else m4.compose(v.set(a.x, a.y, a.z), q, sc.set(a.s, 3.6 * a.s, a.s));
  }
  matriceCouronne(a, q, m4, v, sc) {
    const s = a.s;
    if (a.espece === 'sapin' || a.espece === 'sapinNeige') m4.compose(v.set(a.x, a.y + 1.6 * s, a.z), q, sc.set(2.3 * s, 4.6 * s, 2.3 * s));
    else if (a.espece === 'feuillu') m4.compose(v.set(a.x, a.y + 4.1 * s, a.z), q, sc.set(2.3 * s, 2.0 * s, 2.3 * s));
    else if (a.espece === 'cactus') m4.compose(v.set(a.x, a.y, a.z), q, sc.set(s, s, s));
    else m4.compose(v.set(a.x, a.y + 6.3 * s, a.z), q, sc.set(s, s, s));
  }

  // ---------- Création des objets 3D du décor ----------
  creerDecor({ ombres = true, herbe = 1 } = {}) {
    const r = hasard(this.graine + 11);
    // Terrain
    const pos = new Float32Array(N * N * 3), col = new Float32Array(N * N * 3);
    const b = creerBruit(hasard(this.graine + 7));
    const c = new THREE.Color();
    for (let iz = 0; iz < N; iz++) for (let ix = 0; ix < N; ix++) {
      const k = iz * N + ix, x = -DEMI + ix * PAS, z = -DEMI + iz * PAS, h = this.H[k];
      pos[k * 3] = x; pos[k * 3 + 1] = h; pos[k * 3 + 2] = z;
      this.couleurSol(x, z, h, b(x / 12, z / 12), c);
      col[k * 3] = c.r; col[k * 3 + 1] = c.g; col[k * 3 + 2] = c.b;
    }
    const idx = [];
    for (let iz = 0; iz < N - 1; iz++) for (let ix = 0; ix < N - 1; ix++) {
      const a = iz * N + ix, bb = (iz + 1) * N + ix, cc = (iz + 1) * N + ix + 1, d = iz * N + ix + 1;
      idx.push(a, bb, d, bb, cc, d);
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    g.setAttribute('color', new THREE.BufferAttribute(col, 3));
    g.setIndex(idx);
    g.computeVertexNormals();
    const terrain = new THREE.Mesh(g, new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true }));
    terrain.receiveShadow = true;
    this.groupe.add(terrain);

    // Bâtiments, vitres, lumières, écrans des postes de jeu
    const matMaisons = new THREE.MeshLambertMaterial({ vertexColors: true });
    for (const geo of this.geosMaisons) {
      const maisons = new THREE.Mesh(geo, matMaisons);
      maisons.castShadow = ombres; maisons.receiveShadow = true;
      this.groupe.add(maisons);
    }
    if (this.geoVitres) this.groupe.add(new THREE.Mesh(this.geoVitres, new THREE.MeshStandardMaterial({ color: '#bfe6ff', transparent: true, opacity: 0.38, roughness: 0.05, metalness: 0.2 })));
    this.matLumieres = new THREE.MeshBasicMaterial({ vertexColors: true, color: new THREE.Color(1.7, 1.7, 1.7), toneMapped: false });
    if (this.geoLumieres) this.groupe.add(new THREE.Mesh(this.geoLumieres, this.matLumieres));
    if (this.geoEcrans) this.groupe.add(new THREE.Mesh(this.geoEcrans, new THREE.MeshBasicMaterial({ vertexColors: true, color: new THREE.Color(1.3, 1.3, 1.3), toneMapped: false })));
    this.creerAnimations();

    // Arbres (instanciés : un seul objet par espèce)
    const tronc = new THREE.CylinderGeometry(0.28, 0.4, 1, 7); tronc.translate(0, 0.5, 0);
    const sansUV = l => l.map(x => { x.deleteAttribute('uv'); return x; });
    const pin = mergeGeometries(sansUV([
      new THREE.ConeGeometry(1, 0.55, 8).translate(0, 0.27, 0),
      new THREE.ConeGeometry(0.78, 0.5, 8).translate(0, 0.55, 0),
      new THREE.ConeGeometry(0.52, 0.45, 8).translate(0, 0.82, 0),
    ]));
    const pinNeige = pin.clone();
    { const p = pinNeige.attributes.position, cc = new Float32Array(p.count * 3), v = new THREE.Color();
      for (let i = 0; i < p.count; i++) { const y = p.getY(i); v.set(y > 0.62 || (y > 0.3 && y < 0.36) ? '#f4f8fc' : '#2d6b3a'); cc[i * 3] = v.r; cc[i * 3 + 1] = v.g; cc[i * 3 + 2] = v.b; }
      pinNeige.setAttribute('color', new THREE.BufferAttribute(cc, 3)); }
    const feuillu = mergeGeometries(sansUV([
      new THREE.IcosahedronGeometry(1, 0),
      new THREE.IcosahedronGeometry(0.72, 0).translate(0.62, -0.18, 0.25),
      new THREE.IcosahedronGeometry(0.66, 0).translate(-0.55, -0.1, -0.35),
      new THREE.IcosahedronGeometry(0.6, 0).translate(0.1, 0.55, -0.1),
    ]));
    const cactus = mergeGeometries(sansUV([
      new THREE.CylinderGeometry(0.32, 0.36, 3, 8).translate(0, 1.5, 0), new THREE.SphereGeometry(0.32, 8, 6).translate(0, 3, 0),
      new THREE.CylinderGeometry(0.17, 0.17, 0.6, 8).rotateZ(Math.PI / 2).translate(0.5, 1.3, 0), new THREE.CylinderGeometry(0.2, 0.2, 1.0, 8).translate(0.78, 1.8, 0), new THREE.SphereGeometry(0.2, 8, 6).translate(0.78, 2.3, 0),
      new THREE.CylinderGeometry(0.17, 0.17, 0.6, 8).rotateZ(Math.PI / 2).translate(-0.5, 1.9, 0), new THREE.CylinderGeometry(0.2, 0.2, 0.8, 8).translate(-0.78, 2.3, 0), new THREE.SphereGeometry(0.2, 8, 6).translate(-0.78, 2.7, 0),
    ]));
    const feuilles = [];
    for (let k = 0; k < 8; k++) feuilles.push(new THREE.BoxGeometry(2.8, 0.05, 0.55).translate(1.4, 0, 0).rotateZ(-0.38 - (k % 2) * 0.15).rotateY(k / 8 * Math.PI * 2));
    for (let k = 0; k < 3; k++) feuilles.push(new THREE.SphereGeometry(0.18, 8, 6).translate(Math.cos(k * 2.1) * 0.25, -0.2, Math.sin(k * 2.1) * 0.25));
    const palme = mergeGeometries(sansUV(feuilles.map(x => x.index ? x : x)));
    { const p = palme.attributes.position, cc = new Float32Array(p.count * 3), v = new THREE.Color();
      for (let i = 0; i < p.count; i++) { v.set(p.getY(i) < -0.05 && Math.hypot(p.getX(i), p.getZ(i)) < 0.5 ? '#6b4423' : '#3f9a3a'); cc[i * 3] = v.r; cc[i * 3 + 1] = v.g; cc[i * 3 + 2] = v.b; }
      palme.setAttribute('color', new THREE.BufferAttribute(cc, 3)); }
    const geos = { sapin: pin, sapinNeige: pinNeige, feuillu, cactus, palmier: palme };
    const compte = {};
    for (const a of this.arbres) compte[a.espece] = (compte[a.espece] || 0) + 1;
    this.iTroncs = new THREE.InstancedMesh(tronc, new THREE.MeshLambertMaterial({ color: '#ffffff', flatShading: true }), Math.max(1, this.arbres.length));
    this.iCouronnes = {};
    for (const esp of Object.keys(geos)) {
      const vc = esp === 'sapinNeige' || esp === 'palmier';
      this.iCouronnes[esp] = new THREE.InstancedMesh(geos[esp], new THREE.MeshLambertMaterial({ color: '#ffffff', flatShading: true, vertexColors: vc, side: esp === 'palmier' ? THREE.DoubleSide : THREE.FrontSide }), Math.max(1, compte[esp] || 0));
    }
    const COULEURS = {
      sapin: ['#2f7d3b', '#27703a', '#3a8a45', '#22603a', '#336f3f'], feuillu: ['#5cb34c', '#4fa043', '#6cbd52', '#79c75a', '#4a9a48'],
      cactus: ['#4f9a4a', '#5aa652', '#478c45'], sapinNeige: ['#ffffff', '#f0f6ff'], palmier: ['#ffffff', '#e8ffe0'],
    };
    const AUTOMNE = ['#e08a2c', '#e8b53a', '#d4552c', '#c9732c'];
    const BOIS_T = ['#7a4e2a', '#6b4423', '#8a5a33'];
    const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler(), v = new THREE.Vector3(), sc = new THREE.Vector3();
    const idxEsp = {};
    for (const a of this.arbres) {
      e.set(a.espece === 'palmier' ? 0.08 : 0, a.id * 1.7, 0); q.setFromEuler(e);
      this.matriceTronc(a, q, m4, v, sc);
      this.iTroncs.setMatrixAt(a.id, m4);
      this.iTroncs.setColorAt(a.id, c.set(a.espece === 'palmier' ? '#a07a50' : BOIS_T[a.id % 3]));
      this.matriceCouronne(a, q, m4, v, sc);
      const im = this.iCouronnes[a.espece];
      a.iCouronne = idxEsp[a.espece] = (idxEsp[a.espece] ?? -1) + 1;
      im.setMatrixAt(a.iCouronne, m4);
      const l = COULEURS[a.espece];
      im.setColorAt(a.iCouronne, c.set(a.espece === 'feuillu' && a.teinte > 0.86 ? AUTOMNE[Math.floor((a.teinte - 0.86) / 0.14 * 4)] : l[Math.floor(a.teinte * l.length) % l.length]));
    }
    for (const im of [this.iTroncs, ...Object.values(this.iCouronnes)]) { im.castShadow = ombres; im.receiveShadow = true; this.groupe.add(im); }
    // ancienne API (sapin/feuillu) utilisée ailleurs
    this.iSapins = this.iCouronnes.sapin; this.iFeuillus = this.iCouronnes.feuillu;

    // Rochers
    this.iRochers = new THREE.InstancedMesh(new THREE.DodecahedronGeometry(1, 0), new THREE.MeshLambertMaterial({ color: '#ffffff', flatShading: true }), Math.max(1, this.rochers.length));
    const GRIS = { prairie: ['#9a9ea6', '#8a8f98', '#a7a29a', '#7f858e'], desert: ['#c98b5a', '#b8774a', '#d49a68'], neige: ['#cfd6de', '#b9c2cc', '#dfe5ec'] };
    for (const ro of this.rochers) {
      e.set(0.3, ro.rot, 0.2); q.setFromEuler(e);
      m4.compose(v.set(ro.x, ro.y, ro.z), q, sc.set(ro.s * 1.1, ro.s * 0.85, ro.s));
      this.iRochers.setMatrixAt(ro.id, m4);
      const l = GRIS[ro.biome] || GRIS.prairie;
      this.iRochers.setColorAt(ro.id, c.set(l[Math.floor(ro.teinte * l.length)]));
    }
    this.iRochers.castShadow = ombres; this.iRochers.receiveShadow = true;
    this.groupe.add(this.iRochers);

    this.creerVegetation(r, herbe, ombres);

    // Coffres (le couvercle s'ouvre)
    this.matCoffre = new THREE.MeshLambertMaterial({ color: '#e0a91f', emissive: '#7a5200', emissiveIntensity: 0.9 });
    this.matCoffreOuvert = new THREE.MeshLambertMaterial({ color: '#b98a22' });
    const matBois = new THREE.MeshLambertMaterial({ color: '#7a4a24' });
    const matFer = new THREE.MeshLambertMaterial({ color: '#3d3f45' });
    const matTresor = new THREE.MeshBasicMaterial({ color: new THREE.Color('#ffe27a').multiplyScalar(1.5), toneMapped: false });
    const coffreBlender = modeleBlender('coffre');
    for (const co of this.coffres) {
      const gr = new THREE.Group();
      if (coffreBlender) {
        // Coffre fait dans Blender : la base porte le couvercle (pivot = charnière à l'arrière)
        const modele = coffreBlender.clone();
        let pivot = null;
        const parties = [];
        modele.traverse(o => {
          if ((o.userData.name || o.name) === 'coffre_couvercle' && !pivot) pivot = o;
          if (!o.isMesh) return;
          if (o.material.name === 'or_coffre') { o.material = this.matCoffre; parties.push(o); }
          else if (o.material.name === 'tresor') o.material = matTresor;
        });
        gr.add(modele);
        gr.position.set(co.x, co.y, co.z); gr.rotation.y = co.rot;
        gr.traverse(o => { o.castShadow = ombres; });
        co.mesh = gr; co.couvercle = pivot; co.parties = parties; co.ouvreT = 0;
        this.groupe.add(gr);
        continue;
      }
      const base = new THREE.Mesh(new THREE.BoxGeometry(1.1, 0.55, 0.7), matBois); base.position.y = 0.28;
      const or = new THREE.Mesh(new THREE.BoxGeometry(1.0, 0.05, 0.6), matTresor); or.position.y = 0.53;
      const bandes = new THREE.Mesh(new THREE.BoxGeometry(1.14, 0.12, 0.74), this.matCoffre); bandes.position.y = 0.12;
      const pivot = new THREE.Group(); pivot.position.set(0, 0.55, 0.35);
      const cou = new THREE.Mesh(new THREE.BoxGeometry(1.14, 0.28, 0.74), this.matCoffre); cou.position.set(0, 0.14, -0.37);
      const serrure = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.2, 0.04), matFer); serrure.position.set(0, 0.04, -0.75);
      pivot.add(cou, serrure);
      gr.add(base, or, bandes, pivot);
      gr.position.set(co.x, co.y, co.z); gr.rotation.y = co.rot;
      gr.traverse(o => { o.castShadow = ombres; });
      co.mesh = gr; co.couvercle = pivot; co.parties = [bandes, cou]; co.ouvreT = 0;
      this.groupe.add(gr);
    }

    // Maisons faites dans Blender (modeles/integration.json)
    for (const m of this.maisonsModeles || []) {
      const v = (m.modele.objet && modeleGlb('maison:' + m.modele.id + ':' + m.modele.objet, { ombres })) || m.modele.scene.clone(true);
      v.traverse(o => { if (o.isMesh) { o.castShadow = ombres; o.receiveShadow = true; if (/^COL[_.-]/i.test(o.userData.name || o.name || '')) o.visible = false; } });
      v.position.set(m.x, m.h0, m.z); v.rotation.y = m.angle;
      this.groupe.add(v);
    }

    // Coffres dorés : plus gros, plus brillants, avec un rayon de lumière
    this.matCoffreDore = new THREE.MeshStandardMaterial({ color: '#ffd23f', emissive: '#b37400', emissiveIntensity: 1.1, metalness: 0.75, roughness: 0.25 });
    this.rayonsDores = [];
    const geoRayonDore = new THREE.CylinderGeometry(0.35, 0.6, 14, 14, 1, true).translate(0, 7, 0);
    for (const co of this.coffres) {
      if (!co.dore || !co.mesh) continue;
      for (const p of co.parties || []) p.material = this.matCoffreDore;
      co.mesh.scale.setScalar(1.18);
      const rayon = new THREE.Mesh(geoRayonDore, new THREE.MeshBasicMaterial({ color: new THREE.Color('#ffd23f').multiplyScalar(1.5), transparent: true, opacity: 0.5, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide, toneMapped: false }));
      rayon.position.set(co.x, co.y, co.z);
      co.rayon = rayon; this.rayonsDores.push(rayon);
      this.groupe.add(rayon);
    }

    // Champignons rebondissants
    const matPied = new THREE.MeshLambertMaterial({ color: '#f3ead8' });
    const matChapeau = new THREE.MeshLambertMaterial({ color: '#c44dff', emissive: '#4a0f6b', emissiveIntensity: 0.6 });
    const matPois = new THREE.MeshBasicMaterial({ color: new THREE.Color('#fff2a8').multiplyScalar(1.4), toneMapped: false });
    const geoPied = new THREE.CylinderGeometry(0.35, 0.5, 0.8, 12).translate(0, 0.4, 0);
    const geoChap = new THREE.SphereGeometry(1.2, 20, 10, 0, Math.PI * 2, 0, Math.PI / 2); geoChap.scale(1, 0.55, 1);
    const geoDessous = new THREE.CircleGeometry(1.2, 20).rotateX(Math.PI / 2);
    const geoPois = new THREE.SphereGeometry(0.16, 8, 6);
    for (const t of this.trampolines) {
      const bl = modeleGlb('trampoline', { ombres });
      if (bl) {
        // champignon Blender : il s'écrase en entier quand on rebondit dessus
        const g = new THREE.Group(); g.add(bl);
        g.position.set(t.x, t.y, t.z); g.rotation.y = t.id * 1.3;
        t.mesh = g; t.chapeau = bl;
        this.groupe.add(g);
        continue;
      }
      const g = new THREE.Group();
      const pied = new THREE.Mesh(geoPied, matPied);
      const chap = new THREE.Group(); chap.position.y = 0.75;
      chap.add(new THREE.Mesh(geoChap, matChapeau), new THREE.Mesh(geoDessous, matPied));
      for (let k = 0; k < 7; k++) {
        const a = k / 7 * Math.PI * 2 + 0.3, rr = k === 6 ? 0 : 0.75, el = k === 6 ? 0.66 : 0.42;
        const p = new THREE.Mesh(geoPois, matPois); p.position.set(Math.cos(a) * rr, el, Math.sin(a) * rr); p.scale.y = 0.5; chap.add(p);
      }
      g.add(pied, chap);
      g.position.set(t.x, t.y, t.z);
      g.traverse(o => { if (o.isMesh) o.castShadow = ombres; });
      t.mesh = g; t.chapeau = chap;
      this.groupe.add(g);
    }

    // Fontaines de soin
    const matPierre = new THREE.MeshLambertMaterial({ color: '#b9b4a8', flatShading: true });
    const matEauSoin = new THREE.MeshBasicMaterial({ color: new THREE.Color('#5bffb0').multiplyScalar(1.2), transparent: true, opacity: 0.8, toneMapped: false });
    for (const so of this.sources) {
      const bl = modeleGlb('fontaine', { ombres });
      if (bl) {
        bl.position.set(so.x, so.y, so.z);
        so.mesh = bl; so.eau = null;
        this.groupe.add(bl);
        continue;
      }
      const g = new THREE.Group();
      const bord = new THREE.Mesh(new THREE.CylinderGeometry(1.6, 1.75, 0.55, 16, 1, true), matPierre); bord.position.y = 0.27;
      const bordH = new THREE.Mesh(new THREE.TorusGeometry(1.62, 0.13, 6, 20), matPierre); bordH.rotation.x = Math.PI / 2; bordH.position.y = 0.55;
      const eau = new THREE.Mesh(new THREE.CircleGeometry(1.55, 20).rotateX(-Math.PI / 2), matEauSoin); eau.position.y = 0.42;
      const colonne = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.3, 1.3, 10), matPierre); colonne.position.y = 0.9;
      const vasque = new THREE.Mesh(new THREE.CylinderGeometry(0.6, 0.25, 0.25, 12), matPierre); vasque.position.y = 1.6;
      const croix = new THREE.Group(); croix.position.y = 2.2;
      croix.add(new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.16, 0.16), matEauSoin), new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.5, 0.16), matEauSoin));
      g.add(bord, bordH, eau, colonne, vasque, croix);
      g.position.set(so.x, so.y, so.z);
      g.traverse(o => { if (o.isMesh && o.material === matPierre) o.castShadow = ombres; });
      so.mesh = g; so.eau = croix;
      this.groupe.add(g);
    }

    // Nuages
    const matNuage = new THREE.MeshLambertMaterial({ color: '#ffffff', emissive: '#c8d8ea', emissiveIntensity: 0.35 });
    const rr = hasard(this.graine + 3);
    const gn = [];
    for (let n = 0; n < 40; n++) {
      const cx = (rr() - 0.5) * 900, cy = 140 + rr() * 50, cz = (rr() - 0.5) * 900;
      const nb = 3 + Math.floor(rr() * 4);
      for (let p = 0; p < nb; p++) {
        const bx = new THREE.BoxGeometry(12 + rr() * 16, 5 + rr() * 5, 10 + rr() * 12);
        bx.deleteAttribute('uv');
        bx.translate(cx + (rr() - 0.5) * 24, cy + rr() * 4, cz + (rr() - 0.5) * 16);
        gn.push(bx);
      }
    }
    this.nuages = new THREE.Mesh(mergeGeometries(gn), matNuage);
    this.groupe.add(this.nuages);

    // Îles au loin
    const loin = new THREE.MeshLambertMaterial({ color: '#6a9a6a', flatShading: true });
    for (let n = 0; n < 8; n++) {
      const a = n / 8 * Math.PI * 2 + rr(), d = 640 + rr() * 220;
      const ile = new THREE.Mesh(new THREE.ConeGeometry(40 + rr() * 70, 18 + rr() * 45, 7), loin);
      ile.position.set(Math.cos(a) * d, -2, Math.sin(a) * d);
      ile.scale.z = 0.6 + rr() * 0.6;
      this.groupe.add(ile);
    }
  }

  // Écrans 2K27, drapeaux, panneaux, phares et projecteurs
  creerAnimations() {
    const NEON = { cyan: '#22e8ff', rose: '#ff2e88', violet: '#b026ff' };
    const toile = (w, h) => { const cv = document.createElement('canvas'); cv.width = w; cv.height = h; return cv; };
    const logo = (g, x, y, t) => {
      g.font = `900 ${t}px Orbitron, 'Lilita One', system-ui`; g.textAlign = 'center'; g.textBaseline = 'middle';
      g.shadowColor = NEON.cyan; g.shadowBlur = t / 4;
      g.strokeStyle = NEON.rose; g.lineWidth = t / 9; g.strokeText('2K27', x, y);
      g.fillStyle = NEON.cyan; g.fillText('2K27', x, y); g.shadowBlur = 0;
    };
    const statiques = [];
    const dessin = {
      geant: (g, w, h, t) => {
        const d = g.createLinearGradient(0, 0, w, h);
        d.addColorStop(0, `hsl(${(270 + Math.sin(t * 0.5) * 30)}, 70%, 12%)`); d.addColorStop(1, `hsl(${(195 + Math.cos(t * 0.4) * 25)}, 70%, 10%)`);
        g.fillStyle = d; g.fillRect(0, 0, w, h);
        for (let i = 0; i < 24; i++) { const bh = (0.3 + 0.7 * Math.abs(Math.sin(t * 3 + i * 0.7))) * h * 0.35; g.fillStyle = i % 2 ? NEON.violet + '88' : NEON.cyan + '66'; g.fillRect(i * (w / 24) + 2, h - bh, w / 24 - 4, bh); }
        logo(g, w / 2, h * 0.38, 92 + Math.sin(t * 4) * 4);
        g.font = '900 20px Orbitron, system-ui'; g.fillStyle = NEON.rose; g.textAlign = 'center'; g.fillText('FESTIVAL GAMING', w / 2, h * 0.68);
        const msg = '★ COLLAB NATX ROYALE × 2K27 ★ BIENVENUE À L\'ARÈNE ★ ';
        g.font = '700 16px Orbitron, system-ui'; g.fillStyle = '#ffffff'; g.textAlign = 'left';
        const dec = (t * 60) % (msg.length * 11);
        g.fillText(msg + msg, 10 - dec, h - 14);
        g.strokeStyle = NEON.cyan; g.lineWidth = 4; g.strokeRect(2, 2, w - 4, h - 4);
      },
      cote: (g, w, h) => { g.fillStyle = '#0a0a14'; g.fillRect(0, 0, w, h); logo(g, w / 2, h * 0.42, 64); g.font = '900 15px Orbitron, system-ui'; g.fillStyle = NEON.rose; g.textAlign = 'center'; g.fillText('NATX ROYALE', w / 2, h * 0.8); g.strokeStyle = NEON.violet; g.lineWidth = 4; g.strokeRect(2, 2, w - 4, h - 4); },
      logo: (g, w, h) => { g.fillStyle = '#0a0a14'; g.fillRect(0, 0, w, h); logo(g, w * 0.32, h / 2, 46); g.font = '900 22px Orbitron, system-ui'; g.fillStyle = '#ffffff'; g.textAlign = 'center'; g.fillText('ARÈNE', w * 0.75, h / 2); },
      drapeau: (g, w, h) => { const d = g.createLinearGradient(0, 0, 0, h); d.addColorStop(0, NEON.violet); d.addColorStop(1, '#0a0a14'); g.fillStyle = d; g.fillRect(0, 0, w, h); g.save(); g.translate(w / 2, h / 2); g.rotate(-Math.PI / 2); logo(g, 0, 0, 44); g.restore(); },
      pub: (g, w, h) => { g.fillStyle = '#0a0a14'; g.fillRect(0, 0, w, h); logo(g, w * 0.5, h * 0.36, 70); g.font = '900 17px Orbitron, system-ui'; g.fillStyle = NEON.rose; g.textAlign = 'center'; g.fillText('COLLAB · VIENS À L\'ARÈNE !', w / 2, h * 0.78); g.strokeStyle = NEON.cyan; g.lineWidth = 5; g.strokeRect(3, 3, w - 6, h - 6); },
    };
    const tailles = { geant: [512, 224], cote: [256, 144], logo: [512, 64], drapeau: [96, 200], pub: [400, 200] };
    this.texturesEcrans = [];
    for (const e of this.anim.ecrans) {
      const [w, h] = tailles[e.type];
      const cv = toile(w, h);
      const tex = new THREE.CanvasTexture(cv); tex.colorSpace = THREE.SRGBColorSpace;
      const ref = { cv, tex, type: e.type, w, h };
      if (e.type === 'geant') this.texturesEcrans.push(ref); else statiques.push(ref);
      dessin[e.type](cv.getContext('2d'), w, h, 0);
      tex.needsUpdate = true;
      const mesh = new THREE.Mesh(new THREE.PlaneGeometry(e.w, e.h), new THREE.MeshBasicMaterial({ map: tex, toneMapped: false, color: new THREE.Color(1.25, 1.25, 1.25), side: e.type === 'drapeau' ? THREE.DoubleSide : THREE.FrontSide }));
      mesh.position.set(e.x, e.y, e.z); mesh.rotation.y = e.ry || 0;
      this.groupe.add(mesh);
    }
    // Redessine une fois que la police Orbitron est chargée
    if (document.fonts && document.fonts.load) document.fonts.load('900 20px Orbitron').then(() => {
      for (const s of statiques) { dessin[s.type](s.cv.getContext('2d'), s.w, s.h, 0); s.tex.needsUpdate = true; }
    }).catch(() => {});
    this.dessinerEcrans = this.texturesEcrans.length ? (t) => { for (const s of this.texturesEcrans) { dessin.geant(s.cv.getContext('2d'), s.w, s.h, t); s.tex.needsUpdate = true; } } : null;
    // Faisceaux des phares
    const matFaisceau = new THREE.MeshBasicMaterial({ color: '#fff3c0', transparent: true, opacity: 0.16, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide });
    this.meshPhares = this.anim.phares.map(p => {
      const g = new THREE.Group(); g.position.set(p.x, p.y, p.z);
      for (const s of [0, Math.PI]) {
        const geo = new THREE.ConeGeometry(5, 45, 16, 1, true); geo.translate(0, -22.5, 0); geo.rotateZ(Math.PI / 2);
        const m = new THREE.Mesh(geo, matFaisceau); m.rotation.y = s; g.add(m);
      }
      this.groupe.add(g);
      return g;
    });
    // Projecteurs de l'arène
    this.meshProjecteurs = this.anim.projecteurs.map(p => {
      const geo = new THREE.ConeGeometry(2.2, 9, 16, 1, true); geo.translate(0, -4.5, 0);
      const m = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ color: p.couleur, transparent: true, opacity: 0.2, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide }));
      m.position.set(p.x, p.y, p.z); m.userData.phase = p.phase;
      this.groupe.add(m);
      return m;
    });
  }

  creerVegetation(r, herbe, ombres) {
    const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler(), v = new THREE.Vector3(), sc = new THREE.Vector3(), c = new THREE.Color();
    const place = (marge, hMin, hMax, biomes = ['prairie']) => {
      for (let k = 0; k < 20; k++) {
        const x = (r() * 2 - 1) * DEMI * 0.93, z = (r() * 2 - 1) * DEMI * 0.93, h = this.hauteurTerrain(x, z);
        if (h < hMin || h > hMax) continue;
        if (!biomes.includes(this.biome(x, z))) continue;
        if (!this.libreDeMaison(x, z, marge) || this.distanceRoute(x, z) < 3.2 || this.dansLieu(x, z, 1) || this.dansChamp(x, z)) continue;
        return [x, h, z];
      }
      return null;
    };
    // Buissons (verts dans la prairie, secs dans le désert)
    const nbB = 380;
    const buissons = new THREE.InstancedMesh(new THREE.IcosahedronGeometry(1, 0), new THREE.MeshLambertMaterial({ color: '#ffffff', flatShading: true }), nbB);
    let nb = 0;
    for (let i = 0; i < nbB; i++) {
      const p = place(2, 1.3, 20, ['prairie', 'desert']); if (!p) continue;
      const desert = this.biome(p[0], p[2]) === 'desert';
      const s = (desert ? 0.4 : 0.6) + r() * 0.7;
      e.set(r(), r() * 6, 0); q.setFromEuler(e);
      m4.compose(v.set(p[0], p[1] + 0.25 * s, p[2]), q, sc.set(1.2 * s, 0.85 * s, 1.1 * s));
      buissons.setMatrixAt(nb, m4);
      buissons.setColorAt(nb++, desert ? c.setHSL(0.09 + r() * 0.04, 0.35, 0.38) : c.setHSL(0.27 + r() * 0.06, 0.5, 0.3 + r() * 0.08));
    }
    buissons.count = nb; buissons.castShadow = ombres; buissons.receiveShadow = true;
    this.groupe.add(buissons);
    if (herbe <= 0) return;
    // Herbe qui bouge avec le vent
    const touffe = new THREE.BufferGeometry();
    const P = [], C = [];
    for (let k = 0; k < 4; k++) {
      const a = k / 4 * Math.PI + 0.3, l = 0.07, hh = 0.42 + (k % 2) * 0.16, pench = 0.14;
      const cx = Math.cos(a) * l, cz = Math.sin(a) * l, ox = Math.cos(a + 1.3) * 0.06, oz = Math.sin(a + 1.3) * 0.06;
      P.push(ox - cx, 0, oz - cz, ox + cx, 0, oz + cz, ox + Math.cos(a + 1.57) * pench, hh, oz + Math.sin(a + 1.57) * pench);
      C.push(0.45, 0.6, 0.35, 0.45, 0.6, 0.35, 1.25, 1.3, 1.0);
    }
    touffe.setAttribute('position', new THREE.Float32BufferAttribute(P, 3));
    touffe.setAttribute('color', new THREE.Float32BufferAttribute(C, 3));
    touffe.computeVertexNormals();
    const matHerbe = new THREE.MeshLambertMaterial({ vertexColors: true, side: THREE.DoubleSide });
    matHerbe.userData.uTemps = { value: 0 };
    matHerbe.onBeforeCompile = sh => {
      sh.uniforms.uTemps = matHerbe.userData.uTemps;
      sh.vertexShader = 'uniform float uTemps;\n' + sh.vertexShader.replace('#include <begin_vertex>', `#include <begin_vertex>
        #ifdef USE_INSTANCING
        float ph = instanceMatrix[3].x * 0.21 + instanceMatrix[3].z * 0.17;
        transformed.x += sin(uTemps * 2.1 + ph) * 0.09 * position.y * 2.0;
        transformed.z += cos(uTemps * 1.7 + ph) * 0.06 * position.y * 2.0;
        #endif`);
    };
    this.matHerbe = matHerbe;
    const nbH = Math.floor(13000 * herbe);
    const iHerbe = new THREE.InstancedMesh(touffe, matHerbe, nbH);
    nb = 0;
    for (let i = 0; i < nbH; i++) {
      const p = place(0.8, 1.2, 20); if (!p) continue;
      const s = 0.8 + r() * 0.9;
      e.set(0, r() * 6.28, 0); q.setFromEuler(e);
      m4.compose(v.set(p[0], p[1] - 0.05, p[2]), q, sc.set(s, s, s));
      iHerbe.setMatrixAt(nb, m4);
      iHerbe.setColorAt(nb++, c.setHSL(0.24 + r() * 0.08, 0.55, 0.42 + r() * 0.1));
    }
    iHerbe.count = nb;
    iHerbe.receiveShadow = true;
    this.groupe.add(iHerbe);
    const nbF = Math.floor(3000 * herbe);
    const tige = new THREE.BoxGeometry(0.03, 0.34, 0.03).translate(0, 0.17, 0);
    const petales = new THREE.BoxGeometry(0.16, 0.08, 0.16).translate(0, 0.36, 0);
    const iTiges = new THREE.InstancedMesh(tige, new THREE.MeshLambertMaterial({ color: '#3f8f3a' }), nbF);
    const iPetales = new THREE.InstancedMesh(petales, new THREE.MeshLambertMaterial({ color: '#ffffff' }), nbF);
    const FLEURS = ['#ff5d73', '#ffd23f', '#ffffff', '#b552ff', '#ff8c1a', '#6ec8ff'];
    nb = 0;
    for (let i = 0; i < nbF; i += 3) {
      const p = place(1, 1.4, 18); if (!p) continue;
      const col = FLEURS[Math.floor(r() * FLEURS.length)];
      for (let k = 0; k < 3 && nb < nbF; k++) {
        const x = p[0] + (r() - 0.5) * 2, z = p[2] + (r() - 0.5) * 2;
        const s = 0.8 + r() * 0.6;
        e.set(0, r() * 6.28, 0); q.setFromEuler(e);
        m4.compose(v.set(x, this.hauteurTerrain(x, z) - 0.03, z), q, sc.set(s, s, s));
        iTiges.setMatrixAt(nb, m4); iPetales.setMatrixAt(nb, m4);
        iPetales.setColorAt(nb++, c.set(col));
      }
    }
    iTiges.count = nb; iPetales.count = nb;
    this.groupe.add(iTiges, iPetales);
  }

  cacherInstance(im, i) {
    const m4 = new THREE.Matrix4().makeScale(0, 0, 0);
    im.setMatrixAt(i, m4);
    im.instanceMatrix.needsUpdate = true;
  }

  detruireArbre(id) {
    const a = this.arbres[id];
    if (!a || !a.vivant) return;
    a.vivant = false;
    this.retirerBoite(a.boite);
    if (this.iTroncs) {
      // copie de l'arbre qui tombe avant de disparaître
      const m4 = new THREE.Matrix4(), c = new THREE.Color();
      const pivot = new THREE.Group(); pivot.position.set(a.x, a.y, a.z);
      const inv = new THREE.Matrix4().makeTranslation(-a.x, -a.y, -a.z);
      const copie = (im, i) => {
        im.getMatrixAt(i, m4);
        const mat = im.material.clone();
        if (im.instanceColor) { im.getColorAt(i, c); mat.color.copy(c); }
        const mesh = new THREE.Mesh(im.geometry, mat);
        mesh.matrixAutoUpdate = false; mesh.matrix.multiplyMatrices(inv, m4);
        mesh.castShadow = true;
        pivot.add(mesh);
      };
      copie(this.iTroncs, a.id);
      copie(this.iCouronnes[a.espece], a.iCouronne);
      const ang = Math.random() * Math.PI * 2;
      this.groupe.add(pivot);
      this.chutes.push({ pivot, axe: new THREE.Vector3(Math.cos(ang), 0, Math.sin(ang)), t: 0, y: a.y });
      this.cacherInstance(this.iTroncs, a.id);
      this.cacherInstance(this.iCouronnes[a.espece], a.iCouronne);
    }
  }
  detruireRocher(id) {
    const r = this.rochers[id];
    if (!r || !r.vivant) return;
    r.vivant = false;
    this.retirerBoite(r.boite);
    if (this.iRochers) this.cacherInstance(this.iRochers, r.id);
  }
  ouvrirCoffre(id) {
    const c = this.coffres[id];
    if (!c || c.ouvert) return;
    c.ouvert = true;
    c.ouvreT = 0;
    if (c.parties) for (const p of c.parties) p.material = this.matCoffreOuvert;
    if (c.rayon) c.rayon.visible = false;
  }

  // Image du terrain vu du dessus, pour la carte
  dessinerCarte(taille) {
    const cv = document.createElement('canvas'); cv.width = cv.height = taille;
    const g = cv.getContext('2d');
    const img = g.createImageData(taille, taille);
    const c = new THREE.Color();
    const b = creerBruit(hasard(this.graine + 7));
    for (let py = 0; py < taille; py++) for (let px = 0; px < taille; px++) {
      const x = -DEMI + (px + 0.5) / taille * DEMI * 2, z = -DEMI + (py + 0.5) / taille * DEMI * 2;
      const h = this.hauteurTerrain(x, z);
      const k = (py * taille + px) * 4;
      if (h < 0) {
        const p = Math.min(1, -h / 1.8);
        img.data[k] = 98 - p * 60; img.data[k + 1] = 214 - p * 70; img.data[k + 2] = 214 - p * 10;
      } else {
        this.couleurSol(x, z, h, b(x / 12, z / 12), c);
        const l = 0.85 + h / 70;
        img.data[k] = Math.min(255, c.r * 255 * l); img.data[k + 1] = Math.min(255, c.g * 255 * l); img.data[k + 2] = Math.min(255, c.b * 255 * l);
      }
      img.data[k + 3] = 255;
    }
    g.putImageData(img, 0, 0);
    const ech = taille / (DEMI * 2);
    const P = (x, z) => [(x + DEMI) * ech, (z + DEMI) * ech];
    // bâtiments (vus du dessus)
    g.fillStyle = 'rgba(40,40,55,.55)';
    for (const bx of this.C.boites) {
      if (!bx.solide || bx.maxY - bx.minY < 2.5) continue;
      const [x0, z0] = P(bx.minX, bx.minZ), [x1, z1] = P(bx.maxX, bx.maxZ);
      g.fillRect(x0, z0, Math.max(1, x1 - x0), Math.max(1, z1 - z0));
    }
    for (const m of this.maisons) {
      g.fillStyle = m.toit;
      g.fillRect((m.x0 + DEMI) * ech, (m.z0 + DEMI) * ech, m.w * ech, m.d * ech);
      g.strokeStyle = 'rgba(0,0,0,.35)'; g.lineWidth = 1;
      g.strokeRect((m.x0 + DEMI) * ech, (m.z0 + DEMI) * ech, m.w * ech, m.d * ech);
    }
    for (const a of this.arbres) { g.fillStyle = a.espece === 'sapinNeige' ? 'rgba(60,100,70,.6)' : a.espece === 'cactus' ? 'rgba(60,120,60,.6)' : 'rgba(20,70,30,.55)'; g.beginPath(); g.arc((a.x + DEMI) * ech, (a.z + DEMI) * ech, 1.4 * a.s, 0, 7); g.fill(); }
    return cv;
  }
}
