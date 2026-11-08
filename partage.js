// Règles communes à l'hôte et aux invités : zone, dirigeable, cases de construction.
import { CASE, DEMI } from './monde.js';
import { borner } from './outils.js';

// ---------- Zone qui rétrécit ----------
// [attente, durée du rétrécissement, rayon visé, dégâts par seconde]
const K = DEMI / 200;
const PLAN = [[100, 45, 150 * K, 1], [60, 35, 85 * K, 2], [50, 28, 45 * K, 4], [40, 22, 22 * K, 6], [30, 20, 8, 8], [25, 25, 0, 10]];

export const VITESSES_ZONE = { lente: 1.45, normale: 1, rapide: 0.62 };
export function creerPlanZone(r, monde, options = {}) {
  const etapes = [];
  const R0 = DEMI * 1.45;
  // Entraînement : la zone ne bouge jamais
  if (options.entrainement) return [{ debut: 1e7, fin: 1e7 + 1, x0: 0, z0: 0, r0: R0, x1: 0, z1: 0, r1: R0, deg: 0 }];
  const k = VITESSES_ZONE[options.vitesseZone] || 1;
  let cx = 0, cz = 0, rayon = R0, t = 0;
  for (const [att0, ret0, rc, deg] of PLAN) {
    const att = att0 * k, ret = ret0 * k;
    let nx = cx, nz = cz;
    const marge = rayon === R0 ? DEMI * 0.42 : (rayon - rc) * 0.85;
    for (let k = 0; k < 40; k++) {
      const a = r() * Math.PI * 2, d = Math.sqrt(r()) * marge;
      nx = cx + Math.cos(a) * d; nz = cz + Math.sin(a) * d;
      if (monde.hauteurTerrain(nx, nz) > 1.5) break;
    }
    etapes.push({ debut: t + att, fin: t + att + ret, x0: cx, z0: cz, r0: rayon, x1: nx, z1: nz, r1: rc, deg });
    t += att + ret; cx = nx; cz = nz; rayon = rc;
  }
  return etapes;
}

export function etatZone(etapes, t) {
  for (let n = 0; n < etapes.length; n++) {
    const e = etapes[n];
    if (t < e.debut) return { x: e.x0, z: e.z0, r: e.r0, cx: e.x1, cz: e.z1, cr: e.r1, deg: e.deg, retrecit: false, dans: e.debut - t, etape: n };
    if (t < e.fin) {
      const k = (t - e.debut) / (e.fin - e.debut);
      return {
        x: e.x0 + (e.x1 - e.x0) * k, z: e.z0 + (e.z1 - e.z0) * k, r: e.r0 + (e.r1 - e.r0) * k,
        cx: e.x1, cz: e.z1, cr: e.r1, deg: e.deg, retrecit: true, dans: e.fin - t, etape: n,
      };
    }
  }
  const e = etapes[etapes.length - 1];
  return { x: e.x1, z: e.z1, r: e.r1, cx: e.x1, cz: e.z1, cr: e.r1, deg: e.deg, retrecit: false, dans: 0, etape: etapes.length };
}

// ---------- Dirigeable qui traverse l'île ----------
export function creerDirigeable(r) {
  const a = r() * Math.PI * 2, decal = (r() - 0.5) * 120;
  const px = -Math.sin(a) * decal, pz = Math.cos(a) * decal;
  const L = DEMI * 0.96;
  return { ax: -Math.cos(a) * L + px, az: -Math.sin(a) * L + pz, bx: Math.cos(a) * L + px, bz: Math.sin(a) * L + pz, duree: 40, y: 120 };
}
export function posDirigeable(d, t) {
  const k = borner(t / d.duree, 0, 1);
  return { x: d.ax + (d.bx - d.ax) * k, y: d.y, z: d.az + (d.bz - d.az) * k, vx: (d.bx - d.ax) / d.duree, vz: (d.bz - d.az) / d.duree };
}

// ---------- Où poser une construction ----------
// x,y,z = pieds du joueur ; ry = direction du regard ; rx = haut/bas
export function cibleConstruction(monde, type, x, y, z, ry, rx) {
  const fx = -Math.sin(ry), fz = -Math.cos(ry);
  const surX = Math.abs(fx) > Math.abs(fz);
  const ax = surX ? Math.sign(fx) : 0, az = surX ? 0 : Math.sign(fz);
  const i = Math.floor(x / CASE), j = Math.floor(z / CASE);
  if (type === 'mur') {
    let k = Math.floor((y + 0.6) / CASE);
    if (rx > 0.75) k++;
    if (surX) { const ii = ax > 0 ? i + 1 : i; return { type, axe: 'x', i: ii, j, k, cle: `Mx|${ii}|${j}|${k}` }; }
    const jj = az > 0 ? j + 1 : j;
    return { type, axe: 'z', i, j: jj, k, cle: `Mz|${i}|${jj}|${k}` };
  }
  if (type === 'sol') {
    let ci = Math.floor((x + fx * 3) / CASE), cj = Math.floor((z + fz * 3) / CASE);
    let k = Math.floor((y + 0.6) / CASE);
    if (rx > 0.5) { ci = i; cj = j; k++; }
    return { type, i: ci, j: cj, k, cle: `S|${ci}|${cj}|${k}` };
  }
  // rampe
  const ci = Math.floor((x + ax * 2.2) / CASE), cj = Math.floor((z + az * 2.2) / CASE);
  let ex, ez;
  if (surX) { ex = ax > 0 ? ci * CASE + 0.01 : ci * CASE + CASE - 0.01; ez = borner(z, cj * CASE, cj * CASE + CASE); }
  else { ez = az > 0 ? cj * CASE + 0.01 : cj * CASE + CASE - 0.01; ex = borner(x, ci * CASE, ci * CASE + CASE); }
  const h = Math.max(monde.hauteurSol(ex, ez, y + 1.5), y);
  const k = Math.floor((h + 0.6) / CASE);
  const d = surX ? (ax > 0 ? 0 : 1) : (az > 0 ? 2 : 3);
  return { type, i: ci, j: cj, k, d, cle: `R|${ci}|${cj}|${k}` };
}

export const PV_CONSTR = { mur: 150, sol: 140, rampe: 140 };
export const COUT_CONSTR = 10;

// ---------- Ravitaillements (caisse qui descend en parachute) ----------
export const VITESSE_RAVITO = 6;
export function posRavito(r, t) {
  const y = r.y0 - Math.max(0, t - r.t0) * VITESSE_RAVITO;
  return y <= r.sol ? { y: r.sol, pose: true } : { y, pose: false };
}

// ---------- Équipes ----------
// Deux joueurs de la même équipe (équipe 0 = chacun pour soi)
export const memeEquipe = (a, b) => !!(a && b && a.equipe && a.equipe === b.equipe);

// ---------- Grenades : trajectoire qui rebondit (même calcul chez tout le monde) ----------
export function simulerGrenade(monde, g, dt) {
  g.vy -= 22 * dt;
  const nx = g.x + g.vx * dt, ny = g.y + g.vy * dt, nz = g.z + g.vz * dt;
  const dx = nx - g.x, dy = ny - g.y, dz = nz - g.z, L = Math.hypot(dx, dy, dz);
  if (L > 1e-4) {
    const h = monde.lancerRayon(g.x, g.y, g.z, dx / L, dy / L, dz / L, L + 0.15);
    if (h) {
      // rebond : on renvoie la vitesse sur l'axe le plus probable
      g.x = g.x + dx / L * Math.max(0, h.t - 0.15); g.y = g.y + dy / L * Math.max(0, h.t - 0.15); g.z = g.z + dz / L * Math.max(0, h.t - 0.15);
      if (h.type === 'terrain' || Math.abs(dy) > Math.max(Math.abs(dx), Math.abs(dz))) { g.vy = Math.abs(g.vy) * 0.35; g.vx *= 0.6; g.vz *= 0.6; }
      else if (Math.abs(dx) > Math.abs(dz)) { g.vx = -g.vx * 0.4; } else { g.vz = -g.vz * 0.4; }
      if (Math.abs(g.vy) < 1.2 && h.type === 'terrain') g.vy = 0;
      g.rebonds = (g.rebonds || 0) + 1;
      return true;
    }
  }
  g.x = nx; g.y = ny; g.z = nz;
  const sol = monde.hauteurTerrain(g.x, g.z);
  if (g.y < sol + 0.12) { g.y = sol + 0.12; g.vy = Math.abs(g.vy) * 0.3; g.vx *= 0.6; g.vz *= 0.6; if (g.vy < 1.2) g.vy = 0; }
  return false;
}
