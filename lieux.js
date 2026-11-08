// Les lieux de l'île (tous inventés) : Arène 2K27, ville, usine, ferme, château,
// oasis du désert, chalets, village et port avec son phare.
const NEON = { cyan: '#22e8ff', rose: '#ff2e88', violet: '#b026ff' };

// ---------- Petits outils de construction ----------
function S(m, x0, y0, z0, x1, y1, z1, c) {
  const b = m.C.boite(Math.min(x0, x1), Math.min(y0, y1), Math.min(z0, z1), Math.max(x0, x1), Math.max(y0, y1), Math.max(z0, z1), c, (m.rng() - 0.5) * 0.03);
  if (b) { b.solide = true; b.type = 'maison'; m.ajouterBoite(b); }
  return b;
}
const D = (m, x0, y0, z0, x1, y1, z1, c) => m.C.boite(Math.min(x0, x1), Math.min(y0, y1), Math.min(z0, z1), Math.max(x0, x1), Math.max(y0, y1), Math.max(z0, z1), c);
const lum = (m, x0, y0, z0, x1, y1, z1, c) => m.Lum.push({ minX: Math.min(x0, x1), minY: Math.min(y0, y1), minZ: Math.min(z0, z1), maxX: Math.max(x0, x1), maxY: Math.max(y0, y1), maxZ: Math.max(z0, z1), couleur: c });
const vitre = (m, x0, y0, z0, x1, y1, z1) => m.V.push({ minX: Math.min(x0, x1), minY: Math.min(y0, y1), minZ: Math.min(z0, z1), maxX: Math.max(x0, x1), maxY: Math.max(y0, y1), maxZ: Math.max(z0, z1) });
const coffre = (m, x, y, z, rot = 0) => m.coffres.push({ id: m.coffres.length, x, y, z, rot, ouvert: false });
const butin = (m, x, y, z, bonus = false) => m.pointsButin.push({ x, y, z, bonus });
// Colonne solide (cylindre dessiné, boîte pour les collisions)
function colonne(m, x, y0, z, r, h, c, seg = 14) {
  m.C.cylindre(x, y0, z, r, r, h, c, seg);
  const k = r * 0.8;
  S(m, x - k, y0, z - k, x + k, y0 + h, z + k, c).dessin = false;
}

// Rampe droite (le long de x ou de z) de (xa,za,ya) à (xb,zb,yb)
export function rampe(m, xa, za, ya, xb, zb, yb, larg, couleur) {
  const surX = Math.abs(xb - xa) > Math.abs(zb - za);
  const L = surX ? xb - xa : zb - za;
  const pente = (yb - ya) / L;
  const p = surX ? { A: ya - xa * pente, gx: pente, gz: 0 } : { A: ya - za * pente, gx: 0, gz: pente };
  const minX = surX ? Math.min(xa, xb) : xa - larg / 2, maxX = surX ? Math.max(xa, xb) : xa + larg / 2;
  const minZ = surX ? za - larg / 2 : Math.min(za, zb), maxZ = surX ? za + larg / 2 : Math.max(za, zb);
  m.ajouterBoite({ minX, maxX, minZ, maxZ, minY: Math.min(ya, yb), maxY: Math.max(ya, yb), solide: false, type: 'maison', rampe: { ...p, minX, maxX, minZ, maxZ } });
  const longueur = Math.hypot(Math.abs(L), yb - ya), ang = Math.atan(pente);
  const cx = (xa + xb) / 2, cz = (za + zb) / 2, cy = (ya + yb) / 2 - 0.16;
  if (surX) m.C.tournee(longueur, 0.3, larg, cx, cy, cz, 0, 0, ang, couleur);
  else m.C.tournee(larg, 0.3, longueur, cx, cy, cz, -ang, 0, 0, couleur);
}

// Dalle avec un trou (pour les rampes entre les étages)
function dalleTrou(m, x0, z0, x1, z1, y, t, c) {
  S(m, x0, y - 0.3, z0, t.x0, y, z1, c);
  S(m, t.x1, y - 0.3, z0, x1, y, z1, c);
  S(m, t.x0, y - 0.3, z0, t.x1, y, t.z0, c);
  S(m, t.x0, y - 0.3, t.z1, t.x1, y, z1, c);
}

function lampadaire(m, x, z, c = '#ffe2a0') {
  const h = m.hauteurTerrain(x, z);
  S(m, x - 0.1, h, z - 0.1, x + 0.1, h + 3.6, z + 0.1, '#2b2d33');
  D(m, x - 0.32, h + 3.6, z - 0.32, x + 0.32, h + 3.72, z + 0.32, '#2b2d33');
  lum(m, x - 0.22, h + 3.1, z - 0.22, x + 0.22, h + 3.6, z + 0.22, c);
}

function caisses(m, x, z, n, r, y) {
  const h = y ?? m.hauteurTerrain(x, z);
  for (let k = 0; k < n; k++) {
    const ox = x + (k % 2) * 1.15, oz = z + Math.floor(k / 2) * 1.15;
    if (r() < 0.5) { S(m, ox - 0.5, h - 0.1, oz - 0.5, ox + 0.5, h + 0.95, oz + 0.5, '#b5834a'); D(m, ox - 0.52, h + 0.35, oz - 0.52, ox + 0.52, h + 0.48, oz + 0.52, '#8a5a33'); }
    else { S(m, ox - 0.4, h - 0.1, oz - 0.4, ox + 0.4, h + 1.1, oz + 0.4, '#8b5a2b'); for (const y of [0.15, 0.85]) D(m, ox - 0.43, h + y, oz - 0.43, ox + 0.43, h + y + 0.08, oz + 0.43, '#4a4f57'); }
  }
}

function voiture(m, x, z, surX, c) {
  const h = m.hauteurTerrain(x, z);
  const [lx, lz] = surX ? [2.2, 1.0] : [1.0, 2.2];
  S(m, x - lx, h + 0.35, z - lz, x + lx, h + 1.1, z + lz, c);
  const [cx, cz] = surX ? [1.2, 0.9] : [0.9, 1.2];
  S(m, x - cx, h + 1.1, z - cz, x + cx, h + 1.75, z + cz, c);
  vitre(m, x - cx - 0.02, h + 1.15, z - cz - 0.02, x + cx + 0.02, h + 1.65, z + cz + 0.02);
  for (const a of [-1, 1]) for (const b of [-1, 1]) {
    const wx = surX ? x + a * 1.4 : x + b * 1.02, wz = surX ? z + b * 1.02 : z + a * 1.4;
    m.C.roue(wx, h + 0.38, wz, 0.38, 0.25, surX);
  }
  lum(m, surX ? x - lx - 0.02 : x - 0.7, h + 0.75, surX ? z - 0.7 : z - lz - 0.02, surX ? x - lx : x - 0.4, h + 0.95, surX ? z - 0.4 : z - lz, '#fff6d0');
  lum(m, surX ? x - lx - 0.02 : x + 0.4, h + 0.75, surX ? z + 0.4 : z - lz - 0.02, surX ? x - lx : x + 0.7, h + 0.95, surX ? z + 0.7 : z - lz, '#fff6d0');
}

function bonhommeNeige(m, x, z) {
  const h = m.hauteurTerrain(x, z);
  m.C.sphere(x, h + 0.55, z, 0.6, '#f6f9fc');
  m.C.sphere(x, h + 1.4, z, 0.45, '#f6f9fc');
  m.C.sphere(x, h + 2.05, z, 0.32, '#f6f9fc');
  m.C.cone(x, h + 2.05, z - 0.42, 0.06, 0.3, '#ff7b1a', 8, -Math.PI / 2);
  m.C.sphere(x - 0.11, h + 2.13, z - 0.27, 0.04, '#111');
  m.C.sphere(x + 0.11, h + 2.13, z - 0.27, 0.04, '#111');
  m.C.cylindre(x, h + 2.3, z, 0.22, 0.22, 0.32, '#1b1d24', 12);
  D(m, x - 0.36, h + 1.65, z - 0.36, x + 0.36, h + 1.75, z + 0.36, '#d63031');
  S(m, x - 0.5, h, z - 0.5, x + 0.5, h + 2.2, z + 0.5, '#f6f9fc').dessin = false;
}

// Une porte vers le centre du lieu (0 = vers -z, 1 = +z, 2 = -x, 3 = +x)
const porteVers = (x, z, cx, cz) => Math.abs(cx - x) > Math.abs(cz - z) ? (cx < x ? 2 : 3) : (cz < z ? 0 : 1);
const anneau = (cx, cz, n, rayon, decal = 0) => Array.from({ length: n }, (_, i) => { const a = i / n * Math.PI * 2 + decal; return [Math.round(cx + Math.cos(a) * rayon), Math.round(cz + Math.sin(a) * rayon)]; });

// ---------- Immeuble à étages (ville) ----------
function immeuble(m, x, z, w, d, n, couleur, porte) {
  const r = m.rng;
  const e = 0.4, hE = 4.5, h0 = m.hauteurTerrain(x, z);
  const x0 = x - w / 2, x1 = x + w / 2, z0 = z - d / 2, z1 = z + d / 2;
  const bord = '#e8e8e8', cadre = '#3d4450';
  const cotes = [
    { axe: 'x', f0: z0, f1: z0 + e, a0: x0, a1: x1, dehors: -1 },
    { axe: 'x', f0: z1 - e, f1: z1, a0: x0, a1: x1, dehors: 1 },
    { axe: 'z', f0: x0, f1: x0 + e, a0: z0 + e, a1: z1 - e, dehors: -1 },
    { axe: 'z', f0: x1 - e, f1: x1, a0: z0 + e, a1: z1 - e, dehors: 1 },
  ];
  const B = (c, a0, a1, y0, y1, f0, f1, col, solide) => {
    const args = c.axe === 'x' ? [a0, y0, f0, a1, y1, f1] : [f0, y0, a0, f1, y1, a1];
    return solide ? S(m, ...args, col) : D(m, ...args, col);
  };
  for (let f = 0; f < n; f++) {
    const y0 = h0 + f * hE;
    cotes.forEach((c, i) => {
      const L = c.a1 - c.a0, k = Math.max(1, Math.floor(L / 4));
      const ouv = [];
      for (let q = 0; q < k; q++) ouv.push({ c: c.a0 + (q + 0.5) * L / k, w: 1.8, y0: 1.2, y1: 3.4 });
      if (f === 0 && i === porte) { const mid = ouv[Math.floor(k / 2)]; mid.w = 2.4; mid.y0 = 0; mid.y1 = 3.2; mid.porte = true; }
      let a = c.a0;
      for (const o of ouv) {
        B(c, a, o.c - o.w / 2, y0, y0 + hE, c.f0, c.f1, couleur, true);
        if (o.y0 > 0) B(c, o.c - o.w / 2, o.c + o.w / 2, y0, y0 + o.y0, c.f0, c.f1, couleur, true);
        B(c, o.c - o.w / 2, o.c + o.w / 2, y0 + o.y1, y0 + hE, c.f0, c.f1, couleur, true);
        a = o.c + o.w / 2;
        const [cf0, cf1] = [c.f0 - 0.05, c.f1 + 0.05];
        B(c, o.c - o.w / 2 - 0.1, o.c + o.w / 2 + 0.1, y0 + o.y1, y0 + o.y1 + 0.12, cf0, cf1, cadre, false);
        B(c, o.c - o.w / 2 - 0.1, o.c - o.w / 2, y0 + o.y0, y0 + o.y1, cf0, cf1, cadre, false);
        B(c, o.c + o.w / 2, o.c + o.w / 2 + 0.1, y0 + o.y0, y0 + o.y1, cf0, cf1, cadre, false);
        if (!o.porte) {
          const mid = (c.f0 + c.f1) / 2;
          if (c.axe === 'x') vitre(m, o.c - o.w / 2, y0 + o.y0, mid - 0.03, o.c + o.w / 2, y0 + o.y1, mid + 0.03);
          else vitre(m, mid - 0.03, y0 + o.y0, o.c - o.w / 2, mid + 0.03, y0 + o.y1, o.c + o.w / 2);
          B(c, o.c - o.w / 2 - 0.12, o.c + o.w / 2 + 0.12, y0 + o.y0 - 0.12, y0 + o.y0, cf0 - 0.06, cf1 + 0.06, bord, false);
        } else {
          // auvent coloré au-dessus de la porte
          const ext = c.dehors < 0 ? [c.f0 - 1.4, c.f0] : [c.f1, c.f1 + 1.4];
          B(c, o.c - 1.8, o.c + 1.8, y0 + 3.5, y0 + 3.7, ext[0], ext[1], ['#d63031', '#2e86de', '#27ae60', '#f39c12'][Math.floor(r() * 4)], false);
        }
      }
      B(c, a, c.a1, y0, y0 + hE, c.f0, c.f1, couleur, true);
      // bandeau entre les étages
      const ext = c.dehors < 0 ? [c.f0 - 0.1, c.f0 + 0.01] : [c.f1 - 0.01, c.f1 + 0.1];
      B(c, c.a0 - 0.1, c.a1 + 0.1, y0 + hE - 0.2, y0 + hE + 0.05, ext[0], ext[1], bord, false);
    });
    // Sol de l'étage, rampe vers l'étage du dessus (contre un mur sans porte)
    const ix0 = x0 + e, ix1 = x1 - e, iz0 = z0 + e, iz1 = z1 - e;
    D(m, ix0, y0 - 0.05, iz0, ix1, y0 + 0.03, iz1, f === 0 ? '#9a8f80' : '#b58a5a');
    const pair = f % 2 === 0;
    let trou = null;
    if (f < n - 1) {
      const yh = y0 + hE, L = 3.2;
      if (porte === 2 || porte === 3) {
        // rampes le long de x, contre les murs du fond (z0 puis z1)
        const zr = pair ? iz0 + L / 2 + 0.1 : iz1 - L / 2 - 0.1;
        rampe(m, ix0 + 5.2, zr, y0, ix0 + 0.6, zr, yh, L, '#6b6f78');
        trou = pair ? { x0: ix0, x1: ix0 + 5.4, z0: iz0, z1: iz0 + L + 0.3 } : { x0: ix0, x1: ix0 + 5.4, z0: iz1 - L - 0.3, z1: iz1 };
      } else {
        const xr = pair ? ix1 - L / 2 - 0.1 : ix0 + L / 2 + 0.1;
        rampe(m, xr, pair ? iz0 + 5.2 : iz1 - 5.2, y0, xr, pair ? iz0 + 0.6 : iz1 - 0.6, yh, L, '#6b6f78');
        trou = pair ? { x0: ix1 - L - 0.3, x1: ix1, z0: iz0, z1: iz0 + 5.4 } : { x0: ix0, x1: ix0 + L + 0.3, z0: iz1 - 5.4, z1: iz1 };
      }
      dalleTrou(m, ix0, iz0, ix1, iz1, yh, trou, '#8a8f99');
    }
    // butin et coffre : dans la partie de l'étage loin des rampes
    const libre = (px, pz) => !trou || px < trou.x0 - 0.8 || px > trou.x1 + 0.8 || pz < trou.z0 - 0.8 || pz > trou.z1 + 0.8;
    const trouBas = immeuble.dernierTrou;
    const libreBas = (px, pz) => !trouBas || px < trouBas.x0 - 0.8 || px > trouBas.x1 + 0.8 || pz < trouBas.z0 - 0.8 || pz > trouBas.z1 + 0.8;
    for (let essai = 0; essai < 12; essai++) {
      const px = ix0 + 1.2 + r() * (ix1 - ix0 - 2.4), pz = iz0 + 1.2 + r() * (iz1 - iz0 - 2.4);
      if (libre(px, pz) && libreBas(px, pz)) { butin(m, px, y0 + 0.1, pz); break; }
    }
    if (r() < 0.35) {
      for (const [px, pz, rot] of [[ix0 + 0.8, z, Math.PI / 2], [ix1 - 0.8, z, -Math.PI / 2], [x, iz0 + 0.8, 0], [x, iz1 - 0.8, Math.PI]]) {
        if (libre(px, pz) && libreBas(px, pz) && !(f === 0 && [[x, iz0 + 0.8], [x, iz1 - 0.8], [ix0 + 0.8, z], [ix1 - 0.8, z]][porte][0] === px && [[x, iz0 + 0.8], [x, iz1 - 0.8], [ix0 + 0.8, z], [ix1 - 0.8, z]][porte][1] === pz)) { coffre(m, px, y0, pz, rot); break; }
      }
    }
    immeuble.dernierTrou = trou;
  }
  immeuble.dernierTrou = null;
  // Toit + rebord + détails
  const yt = h0 + n * hE;
  S(m, x0, yt - 0.3, z0, x1, yt + 0.1, z1, '#6b6f78');
  for (const [a, b, c2, dd] of [[x0, z0, x1, z0 + 0.3], [x0, z1 - 0.3, x1, z1], [x0, z0, x0 + 0.3, z1], [x1 - 0.3, z0, x1, z1]]) S(m, a, yt + 0.1, b, c2, yt + 0.9, dd, bord);
  D(m, x - 1.5, yt + 0.1, z + 0.5, x + 0.3, yt + 1.3, z + 2.3, '#c8ced6');
  m.C.cylindre(x1 - 2.2, yt + 0.1, z0 + 2.2, 0.06, 0.06, 4.5, '#2b2d33', 6);
  lum(m, x1 - 2.32, yt + 4.6, z0 + 2.08, x1 - 2.08, yt + 4.84, z0 + 2.32, '#ff3030');
  butin(m, x, yt + 0.2, z);
  return { yt, x0, x1, z0, z1 };
}

// ============================================================
// ARÈNE 2K27 (collab avec le festival gaming 2K27)
// ============================================================
function arene(m, l) {
  const r = m.rng;
  const cx = l.x, cz = l.z, h = l.h;
  // Sol de la salle + bandes néon
  D(m, cx - 20, h - 0.2, cz - 14, cx + 20, h + 0.05, cz + 14, '#1a1a28');
  for (const [z, c] of [[cz - 13.8, NEON.cyan], [cz + 13.8, NEON.rose]]) lum(m, cx - 20, h + 0.05, z - 0.1, cx + 20, h + 0.12, z + 0.1, c);
  for (const [x, c] of [[cx - 19.8, NEON.violet], [cx + 19.8, NEON.violet]]) lum(m, x - 0.1, h + 0.05, cz - 14, x + 0.1, h + 0.12, cz + 14, c);
  // Piliers + grand toit
  for (const x of [cx - 19.5, cx + 19.5]) for (const z of [cz - 13.5, cz, cz + 13.5]) S(m, x - 0.6, h, z - 0.6, x + 0.6, h + 10, z + 0.6, '#22222f');
  S(m, cx - 21, h + 10, cz - 15, cx + 21, h + 10.6, cz + 15, '#1b1b29');
  for (let k = 0; k < 8; k++) {
    const c = [NEON.cyan, NEON.rose, NEON.violet][k % 3];
    lum(m, cx - 21 + k * 5.25, h + 9.75, cz + 14.9, cx - 21 + (k + 1) * 5.25 - 0.3, h + 9.95, cz + 15.05, c);
    lum(m, cx - 21 + k * 5.25, h + 9.75, cz - 15.05, cx - 21 + (k + 1) * 5.25 - 0.3, h + 9.95, cz - 14.9, c);
  }
  // Mur du fond (derrière la scène) et murs de côté avec de grandes ouvertures
  S(m, cx - 20, h, cz - 14.6, cx + 20, h + 10, cz - 14, '#14141f');
  for (const x of [cx - 20.3, cx + 20.3]) { S(m, x - 0.3, h, cz - 14, x + 0.3, h + 10, cz - 6, '#14141f'); S(m, x - 0.3, h, cz + 6, x + 0.3, h + 10, cz + 14, '#14141f'); S(m, x - 0.3, h + 6, cz - 6, x + 0.3, h + 10, cz + 6, '#14141f'); }
  // Scène + escalier + enceintes + projecteurs
  S(m, cx - 9, h, cz - 14, cx + 9, h + 1.3, cz - 7, '#2a2a3d');
  lum(m, cx - 9, h + 1.15, cz - 7.08, cx + 9, h + 1.3, cz - 6.95, NEON.cyan);
  rampe(m, cx, cz - 3.6, h, cx, cz - 7, h + 1.3, 4, '#2a2a3d');
  for (const s of [-1, 1]) {
    S(m, cx + s * 11.5 - 1, h, cz - 13.5, cx + s * 11.5 + 1, h + 3.6, cz - 11.5, '#101015');
    for (const y of [0.9, 2.4]) m.C.cylindre(cx + s * 11.5, h + y, cz - 11.48, 0.55, 0.55, 0.05, '#2d2d3a', 16, Math.PI / 2);
    lum(m, cx + s * 11.5 - 1, h + 3.6, cz - 11.55, cx + s * 11.5 + 1, h + 3.7, cz - 11.45, s < 0 ? NEON.cyan : NEON.rose);
  }
  D(m, cx - 10.5, h + 8.4, cz - 10.2, cx + 10.5, h + 8.6, cz - 9.8, '#3a3a4a');
  for (const s of [-1, 1]) D(m, cx + s * 10.4 - 0.1, h + 1.3, cz - 10.1, cx + s * 10.4 + 0.1, h + 8.6, cz - 9.9, '#3a3a4a');
  for (let k = -2; k <= 2; k++) m.anim.projecteurs.push({ x: cx + k * 4, y: h + 8.3, z: cz - 10, couleur: [NEON.cyan, NEON.rose, NEON.violet][(k + 3) % 3], phase: k });
  // Écran géant + écrans de côté
  m.anim.ecrans.push({ x: cx, y: h + 6.2, z: cz - 13.95, w: 16, h: 7, ry: 0, type: 'geant' });
  for (const s of [-1, 1]) m.anim.ecrans.push({ x: cx + s * 15, y: h + 5.5, z: cz - 13.95, w: 6, h: 3.4, ry: 0, type: 'cote' });
  // Postes de jeu : tables, écrans, chaises
  const coulEcran = [NEON.cyan, NEON.rose, NEON.violet, '#4fff7a', '#ffd23f'];
  for (const zr of [cz - 1, cz + 4, cz + 9]) {
    for (const [a, b] of [[cx - 17, cx - 3], [cx + 3, cx + 17]]) {
      S(m, a, h + 0.75, zr - 0.6, b, h + 0.9, zr + 0.6, '#2b2b3d');
      for (const x of [a + 0.3, b - 0.5]) D(m, x, h, zr - 0.5, x + 0.2, h + 0.75, zr + 0.5, '#1a1a24');
      for (let x = a + 1.3; x < b - 0.6; x += 2.6) {
        D(m, x - 0.55, h + 0.9, zr - 0.45, x + 0.55, h + 1.6, zr - 0.38, '#111118');
        m.Ecrans.push({ minX: x - 0.48, maxX: x + 0.48, minY: h + 0.98, maxY: h + 1.54, minZ: zr - 0.375, maxZ: zr - 0.36, couleur: coulEcran[Math.floor(r() * 5)] });
        D(m, x - 0.3, h + 0.9, zr + 0.05, x + 0.3, h + 0.93, zr + 0.3, '#22222c');
        const ch = r() < 0.5 ? NEON.rose : NEON.cyan;
        D(m, x - 0.35, h + 0.45, zr + 1.0, x + 0.35, h + 0.6, zr + 1.55, '#1a1a24');
        D(m, x - 0.35, h + 0.6, zr + 1.45, x + 0.35, h + 1.65, zr + 1.6, ch);
        D(m, x - 0.05, h, zr + 1.2, x + 0.05, h + 0.45, zr + 1.3, '#555');
      }
      butin(m, (a + b) / 2, h + 0.1, zr + 2.2, true);
    }
  }
  // Arche d'entrée avec le logo
  for (const s of [-1, 1]) S(m, cx + s * 7 - 0.6, h, cz + 19.4, cx + s * 7 + 0.6, h + 8, cz + 20.6, '#22222f');
  S(m, cx - 8, h + 7.2, cz + 19.5, cx + 8, h + 8.6, cz + 20.5, '#1b1b29');
  lum(m, cx - 8, h + 7.1, cz + 19.4, cx + 8, h + 7.2, cz + 20.6, NEON.cyan);
  lum(m, cx - 8, h + 8.6, cz + 19.4, cx + 8, h + 8.7, cz + 20.6, NEON.rose);
  m.anim.ecrans.push({ x: cx, y: h + 7.9, z: cz + 20.52, w: 11, h: 1.3, ry: 0, type: 'logo' });
  m.anim.ecrans.push({ x: cx, y: h + 7.9, z: cz + 19.48, w: 11, h: 1.3, ry: Math.PI, type: 'logo' });
  // Drapeaux 2K27 sur les piliers
  for (const x of [cx - 20.2, cx + 20.2]) for (const z of [cz - 7, cz + 7]) m.anim.ecrans.push({ x: x + Math.sign(x - cx) * 0.5, y: h + 6, z, w: 2, h: 4.2, ry: Math.sign(x - cx) * Math.PI / 2, type: 'drapeau' });
  // Coffres et butin bonus
  coffre(m, cx, h + 1.3, cz - 12, 0);
  coffre(m, cx - 17, h, cz + 12, Math.PI);
  coffre(m, cx + 17, h, cz + 12, Math.PI);
  coffre(m, cx, h + 10.6, cz, 0);
  for (let k = 0; k < 4; k++) butin(m, cx - 15 + k * 10, h + 0.1, cz + 12.5, true);
  butin(m, cx - 5, h + 1.4, cz - 10, true); butin(m, cx + 5, h + 1.4, cz - 10, true);
}

// ============================================================
// VILLE avec des tours
// ============================================================
function ville(m, l) {
  const r = m.rng;
  const cx = l.x, cz = l.z, h = l.h;
  const couleurs = ['#9aa5b1', '#c7b299', '#a3b8cc', '#d9d2c5', '#8f8fa8', '#b5654a', '#d4a373', '#7f9c8a'];
  const places = [[-23, -21], [0, -25], [23, -21], [-25, 3], [25, 3], [-21, 25], [21, 25]];
  let plusHaute = null;
  places.forEach(([ox, oz], i) => {
    const w = [10, 12, 14][Math.floor(r() * 3)], d = [10, 12][Math.floor(r() * 2)];
    const n = i === 1 ? 6 : 2 + Math.floor(r() * 3);
    const x = cx + ox, z = cz + oz;
    const b = immeuble(m, x, z, w, d, n, couleurs[Math.floor(r() * couleurs.length)], porteVers(x, z, cx, cz));
    if (!plusHaute || b.yt > plusHaute.yt) plusHaute = { ...b, x, z };
  });
  // Panneau 2K27 sur la plus haute tour
  const p = plusHaute;
  for (const s of [-1, 1]) S(m, p.x + s * 3.5 - 0.15, p.yt, p.z - 0.15, p.x + s * 3.5 + 0.15, p.yt + 5, p.z + 0.15, '#2b2d33');
  S(m, p.x - 4.2, p.yt + 2, p.z - 0.25, p.x + 4.2, p.yt + 6.4, p.z + 0.25, '#15151f');
  m.anim.ecrans.push({ x: p.x, y: p.yt + 4.2, z: p.z + 0.27, w: 8, h: 4, ry: 0, type: 'pub' });
  m.anim.ecrans.push({ x: p.x, y: p.yt + 4.2, z: p.z - 0.27, w: 8, h: 4, ry: Math.PI, type: 'pub' });
  // Place : statue, lampadaires, bancs, voitures
  S(m, cx - 2.5, h, cz - 2.5, cx + 2.5, h + 1.2, cz + 2.5, '#c8c2b8');
  S(m, cx - 0.6, h + 1.2, cz - 0.6, cx + 0.6, h + 5, cz + 0.6, '#9aa3ad');
  m.C.sphere(cx, h + 5.8, cz, 1, '#ffc72c', 1, 1, 1, 16);
  for (const [x, z] of anneau(cx, cz, 6, 11, 0.5)) lampadaire(m, x, z);
  const coul = ['#e74c3c', '#3498db', '#f1c40f', '#2ecc71', '#ecf0f1', '#9b59b6'];
  for (let k = 0; k < 6; k++) {
    const a = k / 6 * Math.PI * 2 + 0.2, x = cx + Math.cos(a) * 15, z = cz + Math.sin(a) * 15;
    voiture(m, x, z, Math.abs(Math.cos(a)) < 0.7, coul[k]);
  }
  caisses(m, cx + 8, cz + 14, 3, r);
}

// ============================================================
// USINE
// ============================================================
function usine(m, l) {
  const r = m.rng;
  const cx = l.x, cz = l.z, h = l.h;
  const mur = '#b8c4cc', toit = '#6b7782';
  const x0 = cx - 13, x1 = cx + 13, z0 = cz - 8, z1 = cz + 8, H = 8, e = 0.5;
  // Murs longs + nervures
  S(m, x0, h, z0, x1, h + H, z0 + e, mur);
  S(m, x0, h, z1 - e, x1, h + H, z1, mur);
  for (let x = x0 + 0.6; x < x1; x += 1.3) { D(m, x, h, z0 - 0.12, x + 0.18, h + H, z0, '#9aa7b0'); D(m, x, h, z1, x + 0.18, h + H, z1 + 0.12, '#9aa7b0'); }
  // Murs courts avec grande porte
  for (const x of [x0, x1 - e]) {
    S(m, x, h, z0 + e, x + e, h + H, cz - 3, mur);
    S(m, x, h, cz + 3, x + e, h + H, z1 - e, mur);
    S(m, x, h + 6, cz - 3, x + e, h + H, cz + 3, mur);
    D(m, x - 0.1, h + 6, cz - 3.2, x + e + 0.1, h + 6.3, cz + 3.2, '#f1c40f');
  }
  S(m, x0 - 0.4, h + H, z0 - 0.4, x1 + 0.4, h + H + 0.4, z1 + 0.4, toit);
  for (let x = x0 + 3; x < x1 - 2; x += 6) D(m, x, h + H + 0.4, cz - 2, x + 2.5, h + H + 1, cz + 2, '#a8d8f0');
  // Mezzanine + rampe
  S(m, x0 + e, h + 4, z0 + e, x1 - e, h + 4.3, cz - 4.5, '#7b838d');
  for (let x = x0 + 1; x < x1; x += 2) D(m, x, h + 4.3, cz - 4.6, x + 0.08, h + 5.3, cz - 4.5, '#f1c40f');
  D(m, x0 + e, h + 5.2, cz - 4.62, x1 - e, h + 5.3, cz - 4.5, '#f1c40f');
  rampe(m, cx + 8, cz + 1.2, h, cx + 8, cz - 4.5, h + 4.3, 3, '#7b838d');
  // Machines et caisses à l'intérieur
  S(m, cx - 9, h, cz - 1, cx - 3, h + 1.2, cz + 1, '#4a5059');
  for (let x = cx - 8.5; x < cx - 3; x += 0.8) m.C.roue(x, h + 1.25, cz, 0.15, 1.8, true);
  caisses(m, cx + 2, cz + 4, 4, r);
  caisses(m, cx - 11, cz + 4, 3, r);
  coffre(m, cx - 6, h + 4.3, z0 + 2, 0);
  coffre(m, cx + 3, h, cz - 2, Math.PI / 2);
  for (const [x, z] of [[cx - 8, cz + 5], [cx + 10, cz + 5], [cx, cz - 6.5], [cx - 4, cz - 6.5]]) butin(m, x, z === cz - 6.5 ? h + 4.4 : h + 0.1, z);
  // Conteneurs dehors
  const cc = ['#c0392b', '#2e86de', '#27ae60', '#e67e22', '#8e44ad', '#16a085'];
  for (let row = 0; row < 2; row++) for (let k = 0; k < 3; k++) {
    const x = cx + 18 + row * 4, z = cz - 9 + k * 7;
    const hy = m.hauteurTerrain(x, z);
    const col = cc[Math.floor(r() * cc.length)];
    S(m, x - 1.3, hy, z - 3, x + 1.3, hy + 2.6, z + 3, col);
    for (let q = -2.6; q <= 2.6; q += 0.65) D(m, x - 1.36, hy + 0.1, z + q, x + 1.36, hy + 2.5, z + q + 0.12, new_shade(col));
    if (r() < 0.45) { const c2 = cc[Math.floor(r() * cc.length)]; S(m, x - 1.3, hy + 2.6, z - 3, x + 1.3, hy + 5.2, z + 3, c2); }
  }
  // Cheminées rayées et citernes
  for (const x of [cx - 9, cx - 5]) {
    const z = cz + 12, hy = m.hauteurTerrain(x, z);
    for (let k = 0; k < 6; k++) m.C.cylindre(x, hy + k * 2.8, z, 1.0 - k * 0.04, 1.05 - k * 0.04, 2.8, k % 2 ? '#ffffff' : '#c0392b', 16);
    S(m, x - 0.8, hy, z - 0.8, x + 0.8, hy + 16.8, z + 0.8, '#c0392b').dessin = false;
    m.anim.fumees.push({ x, y: hy + 17, z });
  }
  for (const x of [cx + 6, cx + 12]) {
    const z = cz + 13, hy = m.hauteurTerrain(x, z);
    colonne(m, x, hy, z, 2.4, 5, '#d5dbe1', 20);
    m.C.sphere(x, hy + 5, z, 2.4, '#d5dbe1', 1, 0.45, 1, 20);
  }
}
function new_shade(c) { const n = parseInt(c.slice(1), 16); const k = 0.8; return '#' + [16, 8, 0].map(s => Math.floor(((n >> s) & 255) * k).toString(16).padStart(2, '0')).join(''); }

// ============================================================
// FERME
// ============================================================
function ferme(m, l) {
  const r = m.rng;
  const cx = l.x, cz = l.z;
  m.ajouterMaison(cx - 7, cz - 5, { w: 14, d: 10, style: 'grange', porte: 1, force: true });
  m.ajouterMaison(cx + 11, cz + 8, { w: 10, d: 8, style: 'normal', porte: 2, force: true });
  // Silo
  const sx = cx + 5, sz = cz - 9, sh = m.hauteurTerrain(sx, sz);
  colonne(m, sx, sh, sz, 2.3, 11, '#c9ced6', 20);
  for (let k = 1; k < 5; k++) m.C.cylindre(sx, sh + k * 2.2, sz, 2.36, 2.36, 0.15, '#8f979f', 20);
  m.C.sphere(sx, sh + 11, sz, 2.3, '#b03a2e', 1, 0.7, 1, 20);
  // Champs (rangées de cultures)
  const champs = [[cx - 38, cz - 30, cx - 18, cz - 12, '#e3c35a'], [cx + 18, cz - 34, cx + 36, cz - 16, '#6fbf4a'], [cx - 34, cz + 14, cx - 16, cz + 32, '#f39c12']];
  for (const [a, b, c, d, coul] of champs) {
    m.champs.push({ x0: a, z0: b, x1: c, z1: d });
    for (let x = a + 1; x < c - 0.5; x += 1.8) {
      for (let z = b + 0.5; z < d - 0.5; z += 4) {
        const hy = m.hauteurTerrain(x, z + 2);
        if (coul === '#f39c12') { if (r() < 0.35) m.C.sphere(x, hy + 0.3, z + 2, 0.38, coul, 1, 0.8, 1, 10); }
        else D(m, x - 0.25, hy - 0.1, z, x + 0.25, hy + (coul === '#e3c35a' ? 0.9 : 0.5), z + 3.6, coul);
      }
    }
    for (let x = a; x <= c; x += 2.2) { const hy = m.hauteurTerrain(x, b); D(m, x - 0.06, hy, b - 0.06, x + 0.06, hy + 1, b + 0.06, '#8a5a33'); const hy2 = m.hauteurTerrain(x, d); D(m, x - 0.06, hy2, d - 0.06, x + 0.06, hy2 + 1, d + 0.06, '#8a5a33'); }
  }
  // Épouvantail
  const ex = cx - 28, ez = cz - 21, eh = m.hauteurTerrain(ex, ez);
  D(m, ex - 0.06, eh, ez - 0.06, ex + 0.06, eh + 2.4, ez + 0.06, '#8a5a33');
  D(m, ex - 0.8, eh + 1.7, ez - 0.05, ex + 0.8, eh + 1.8, ez + 0.05, '#8a5a33');
  D(m, ex - 0.35, eh + 1.1, ez - 0.2, ex + 0.35, eh + 1.9, ez + 0.2, '#3a63a8');
  m.C.sphere(ex, eh + 2.25, ez, 0.3, '#f39c12', 1, 0.9, 1, 12);
  m.C.cone(ex, eh + 2.45, ez, 0.45, 0.4, '#d9b55a', 12);
  // Tracteur
  const tx = cx + 3, tz = cz + 6, th = m.hauteurTerrain(tx, tz);
  S(m, tx - 1.6, th + 0.6, tz - 0.8, tx + 1.2, th + 1.6, tz + 0.8, '#27ae60');
  S(m, tx - 1.6, th + 1.6, tz - 0.7, tx - 0.2, th + 2.8, tz + 0.7, '#27ae60');
  vitre(m, tx - 1.62, th + 1.8, tz - 0.6, tx - 0.18, th + 2.6, tz + 0.6);
  for (const s of [-1, 1]) { m.C.roue(tx - 1.0, th + 0.75, tz + s * 0.95, 0.75, 0.4, true); m.C.roue(tx + 0.9, th + 0.45, tz + s * 0.9, 0.45, 0.3, true); }
  m.C.cylindre(tx + 0.7, th + 1.6, tz - 0.4, 0.08, 0.08, 1, '#333', 6);
  // Bottes de foin
  for (let k = 0; k < 6; k++) {
    const x = cx - 14 + (r() - 0.5) * 8, z = cz + 6 + (r() - 0.5) * 8, hy = m.hauteurTerrain(x, z);
    S(m, x - 0.9, hy - 0.1, z - 0.6, x + 0.9, hy + 1.0, z + 0.6, '#e3c35a');
    D(m, x - 0.92, hy + 0.42, z - 0.62, x + 0.92, hy + 0.5, z + 0.62, '#b48a2c');
  }
  coffre(m, cx - 14, m.hauteurTerrain(cx - 14, cz + 2), cz + 2, 0);
  butin(m, cx - 2, l.h + 0.1, cz + 2); butin(m, cx + 4, l.h + 0.1, cz - 2);
}

// ============================================================
// CHÂTEAU
// ============================================================
function chateau(m, l) {
  const r = m.rng;
  const cx = l.x, cz = l.z, h = l.h;
  const pierre = '#9a9590', pierreF = '#7d7873', R = 15, ep = 1.2, H = 6;
  // Murs (porte au sud)
  S(m, cx - R, h, cz - R, cx + R, h + H, cz - R + ep, pierre);
  S(m, cx - R, h, cz - R + ep, cx - R + ep, h + H, cz + R, pierre);
  S(m, cx + R - ep, h, cz - R + ep, cx + R, h + H, cz + R, pierre);
  S(m, cx - R + ep, h, cz + R - ep, cx - 2.2, h + H, cz + R, pierre);
  S(m, cx + 2.2, h, cz + R - ep, cx + R - ep, h + H, cz + R, pierre);
  S(m, cx - 2.2, h + 4.2, cz + R - ep, cx + 2.2, h + H, cz + R, pierre);
  D(m, cx - 2.4, h + 4.0, cz + R - ep - 0.1, cx + 2.4, h + 4.3, cz + R + 0.1, pierreF);
  // Créneaux (côté extérieur)
  for (let t = -R + 1; t < R - 1; t += 2.2) {
    S(m, cx + t, h + H, cz - R, cx + t + 1, h + H + 1, cz - R + 0.5, pierre);
    S(m, cx + t, h + H, cz + R - 0.5, cx + t + 1, h + H + 1, cz + R, pierre);
    S(m, cx - R, h + H, cz + t, cx - R + 0.5, h + H + 1, cz + t + 1, pierre);
    S(m, cx + R - 0.5, h + H, cz + t, cx + R, h + H + 1, cz + t + 1, pierre);
  }
  // Escalier pour monter sur les remparts
  rampe(m, cx - 12, cz - R + ep + 1, h, cx - 5, cz - R + ep + 1, h + H, 2, pierreF);
  rampe(m, cx + 12, cz + R - ep - 1, h, cx + 5, cz + R - ep - 1, h + H, 2, pierreF);
  // Tours d'angle avec toit pointu
  const toits = ['#2c4a8a', '#b03a2e'];
  for (const [sx, sz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) {
    const x = cx + sx * R, z = cz + sz * R;
    colonne(m, x, h, z, 3.2, 10, pierre, 18);
    for (let k = 0; k < 10; k++) { const a = k / 10 * Math.PI * 2; D(m, x + Math.cos(a) * 2.9 - 0.4, h + 10, z + Math.sin(a) * 2.9 - 0.4, x + Math.cos(a) * 2.9 + 0.4, h + 11, z + Math.sin(a) * 2.9 + 0.4, pierre); }
    m.C.cone(x, h + 10.6, z, 3.6, 4.5, toits[(sx + sz + 4) % 2], 18);
    D(m, x - 0.05, h + 15, z - 0.05, x + 0.05, h + 17, z + 0.05, '#333');
    D(m, x + 0.05, h + 16.2, z - 0.02, x + 1.3, h + 16.9, z + 0.02, toits[(sx + sz + 5) % 2]);
  }
  // Donjon + puits
  m.ajouterMaison(cx, cz - 4, { w: 10, d: 10, style: 'pierre', porte: 1, etage: true, force: true });
  const px = cx + 7, pz = cz + 6;
  m.C.cylindre(px, h, pz, 1.4, 1.5, 0.9, pierreF, 14);
  S(m, px - 1.1, h, pz - 1.1, px + 1.1, h + 0.9, pz + 1.1, pierreF).dessin = false;
  m.C.cylindre(px, h + 0.85, pz, 1.1, 1.1, 0.05, '#2a6fb0', 14);
  for (const s of [-1, 1]) D(m, px + s * 1.2 - 0.08, h + 0.9, pz - 0.08, px + s * 1.2 + 0.08, h + 2.6, pz + 0.08, '#6b4423');
  m.C.cone(px, h + 2.6, pz, 1.8, 1.1, '#8b4a2b', 4, 0, Math.PI / 4);
  coffre(m, cx - 10, h, cz + 9, 0);
  coffre(m, cx + R, h + 10, cz - R, 0);
  butin(m, cx - 8, h + 0.1, cz + 4); butin(m, cx + 9, h + 0.1, cz - 8); butin(m, cx, h + H + 0.1, cz - R + 0.6);
}

// ============================================================
// OASIS DU DÉSERT
// ============================================================
function desert(m, l) {
  const r = m.rng;
  const cx = l.x, cz = l.z, h = l.h;
  m.creuser(cx, cz, 6.5, -1.4, 4);
  for (const [x, z] of anneau(cx, cz, 7, 9, 0.3)) m.palmiersForces.push([x + (r() - 0.5) * 2, z + (r() - 0.5) * 2]);
  for (const [x, z] of anneau(cx, cz, 6, 21, 0.2)) {
    m.ajouterMaison(x, z, { w: [8, 10][Math.floor(r() * 2)], d: [8, 10][Math.floor(r() * 2)], style: 'adobe', porte: porteVers(x, z, cx, cz), etage: r() < 0.3 });
  }
  // Étals du marché
  const tissus = ['#d63031', '#e67e22', '#2e86de', '#8e44ad'];
  for (const [x, z] of anneau(cx, cz, 3, 14, 1.1)) {
    const hy = m.hauteurTerrain(x, z);
    for (const [a, b] of [[-1.5, -1], [1.5, -1], [-1.5, 1], [1.5, 1]]) D(m, x + a - 0.07, hy, z + b - 0.07, x + a + 0.07, hy + 2.4, z + b + 0.07, '#8b5a2b');
    for (let k = 0; k < 4; k++) D(m, x - 1.7 + k * 0.85, hy + 2.4, z - 1.3, x - 1.7 + (k + 1) * 0.85, hy + 2.55, z + 1.3, k % 2 ? '#ffffff' : tissus[Math.floor(r() * 4)]);
    S(m, x - 1.4, hy, z - 0.9, x + 1.4, hy + 0.9, z - 0.3, '#a0703c');
    for (let k = 0; k < 4; k++) m.C.sphere(x - 1 + k * 0.6, hy + 1.05, z - 0.6, 0.16, ['#ff8c1a', '#f1c40f', '#e74c3c', '#8bc34a'][k], 1, 1, 1, 8);
  }
  // Château d'eau
  const wx = cx - 14, wz = cz - 16, wh = m.hauteurTerrain(wx, wz);
  for (const [a, b] of [[-1.5, -1.5], [1.5, -1.5], [-1.5, 1.5], [1.5, 1.5]]) S(m, wx + a - 0.12, wh, wz + b - 0.12, wx + a + 0.12, wh + 6, wz + b + 0.12, '#6b4423');
  m.C.cylindre(wx, wh + 6, wz, 2.2, 2.2, 3, '#a0703c', 16);
  m.C.cylindre(wx, wh + 9, wz, 2.35, 2.35, 0.2, '#7b4a2a', 16);
  for (let k = 0; k < 12; k++) { const a = k / 12 * Math.PI * 2; D(m, wx + Math.cos(a) * 2.2 - 0.06, wh + 9.2, wz + Math.sin(a) * 2.2 - 0.06, wx + Math.cos(a) * 2.2 + 0.06, wh + 10.1, wz + Math.sin(a) * 2.2 + 0.06, '#6b4423'); }
  S(m, wx - 2, wh + 6, wz - 2, wx + 2, wh + 9.2, wz + 2, '#a0703c').dessin = false;
  coffre(m, wx, wh + 9.2, wz, 0);
  // Mesas (grands rochers plats)
  for (const [ox, oz] of [[30, -10], [-26, 22]]) {
    const x = cx + ox, z = cz + oz, hy = m.hauteurTerrain(x, z);
    const tailles = [[7, 3], [5.5, 3], [4, 3]];
    let y = hy - 0.5;
    tailles.forEach(([s, hh], k) => { S(m, x - s + k * 0.4, y, z - s * 0.8, x + s - k * 0.3, y + hh, z + s * 0.8, ['#c46a3d', '#d98a55', '#c97b48'][k]); y += hh; });
    butin(m, x, y + 0.1, z);
  }
  butin(m, cx + 6, h + 0.1, cz + 8); butin(m, cx - 7, h + 0.1, cz - 5);
}

// ============================================================
// CHALETS DANS LA NEIGE
// ============================================================
function chalets(m, l) {
  const r = m.rng;
  const cx = l.x, cz = l.z, h = l.h;
  for (const [x, z] of anneau(cx, cz, 5, 17, 0.4)) m.ajouterMaison(x, z, { w: [8, 10][Math.floor(r() * 2)], d: [8, 10][Math.floor(r() * 2)], style: 'chalet', porte: porteVers(x, z, cx, cz), etage: r() < 0.4 });
  // Étang gelé
  m.C.cylindre(cx, h + 0.02, cz, 6, 6, 0.06, '#bfe6ff', 28);
  for (const [x, z] of anneau(cx, cz, 3, 9, 1)) bonhommeNeige(m, x, z);
  for (const [x, z] of anneau(cx, cz, 4, 11.5, 0.8)) lampadaire(m, x, z, '#fff1c7');
  // Tas de bois
  for (const [x, z] of anneau(cx, cz, 2, 26, 2.1)) {
    const hy = m.hauteurTerrain(x, z);
    for (let k = 0; k < 3; k++) for (let q = 0; q < 3 - k; q++) m.C.cylindre(x - 1 + q * 0.6 + k * 0.3, hy + 0.25 + k * 0.45, z, 0.24, 0.24, 1.6, '#8a5a33', 8, Math.PI / 2);
    S(m, x - 1.2, hy, z - 0.8, x + 1, hy + 1.3, z + 0.8, '#8a5a33').dessin = false;
  }
  coffre(m, cx, h, cz + 3, 0);
}

// ============================================================
// VILLAGE avec sa fontaine
// ============================================================
function quartier(m, l) {
  const r = m.rng;
  const cx = l.x, cz = l.z, h = l.h;
  S(m, cx - 2.2, h - 0.2, cz - 2.2, cx + 2.2, h + 0.7, cz - 1.8, '#b9b0a2');
  S(m, cx - 2.2, h - 0.2, cz + 1.8, cx + 2.2, h + 0.7, cz + 2.2, '#b9b0a2');
  S(m, cx - 2.2, h - 0.2, cz - 1.8, cx - 1.8, h + 0.7, cz + 1.8, '#b9b0a2');
  S(m, cx + 1.8, h - 0.2, cz - 1.8, cx + 2.2, h + 0.7, cz + 1.8, '#b9b0a2');
  D(m, cx - 1.8, h - 0.2, cz - 1.8, cx + 1.8, h + 0.45, cz + 1.8, '#4fc3f7');
  S(m, cx - 0.35, h, cz - 0.35, cx + 0.35, h + 2.0, cz + 0.35, '#d5ccbf');
  D(m, cx - 0.8, h + 2.0, cz - 0.8, cx + 0.8, h + 2.2, cz + 0.8, '#d5ccbf');
  m.anim.fontaines.push({ x: cx, y: h + 2.3, z: cz });
  for (const [x, z] of anneau(cx, cz, 4, 9, Math.PI / 4)) lampadaire(m, x, z);
  for (const [x, z] of anneau(cx, cz, 4, 7, 0)) {
    const hy = m.hauteurTerrain(x, z), surX = Math.abs(z - cz) > Math.abs(x - cx);
    const [wx, wz] = surX ? [0.9, 0.25] : [0.25, 0.9];
    D(m, x - wx, hy + 0.45, z - wz, x + wx, hy + 0.55, z + wz, '#a0703c');
  }
  for (const [x, z] of anneau(cx, cz, 6, 22, 0.25)) m.ajouterMaison(x, z, { porte: porteVers(x, z, cx, cz) });
  caisses(m, cx + 12, cz - 6, 3, r);
}

// ============================================================
// PORT ET PHARE
// ============================================================
function port(m, l) {
  const r = m.rng;
  const surX = Math.abs(l.dx) > Math.abs(l.dz);
  const dx = surX ? Math.sign(l.dx) : 0, dz = surX ? 0 : Math.sign(l.dz);
  const px = -dz, pz = dx;
  const P = (avant, cote) => [l.x + dx * avant + px * cote, l.z + dz * avant + pz * cote];
  const planche = '#9a6b3f';
  // Deux pontons
  for (const k of [-7, 7]) {
    const [ax, az] = P(2, k), [bx, bz] = P(24, k);
    const minX = Math.min(ax, bx) - (surX ? 0 : 1.8), maxX = Math.max(ax, bx) + (surX ? 0 : 1.8);
    const minZ = Math.min(az, bz) - (surX ? 1.8 : 0), maxZ = Math.max(az, bz) + (surX ? 1.8 : 0);
    S(m, minX, 0.5, minZ, maxX, 1.0, maxZ, planche);
    for (let t = 2; t <= 24; t += 3) for (const s of [-1.9, 1.9]) { const [x, z] = P(t, k + s); D(m, x - 0.15, -2.5, z - 0.15, x + 0.15, 1.3, z + 0.15, '#6b4423'); }
    // Bateau
    const [bx2, bz2] = P(14, k + (k < 0 ? -4.5 : 4.5));
    const lx = surX ? 3.6 : 1.3, lz = surX ? 1.3 : 3.6;
    const auSec = Math.max(m.hauteurTerrain(bx2 - lx, bz2 - lz), m.hauteurTerrain(bx2 + lx, bz2 + lz), m.hauteurTerrain(bx2, bz2)) > -0.4;
    if (auSec) { caisses(m, ...P(20, k - 0.8), 2, r, 1.0); butin(m, ...[P(23, k)].map(([x, z]) => [x, 1.1, z])[0]); continue; }
    S(m, bx2 - lx, -0.6, bz2 - lz, bx2 + lx, 1.1, bz2 + lz, k < 0 ? '#f1f2f6' : '#c0392b');
    D(m, bx2 - lx - 0.05, 0.6, bz2 - lz - 0.05, bx2 + lx + 0.05, 0.8, bz2 + lz + 0.05, '#2c4a8a');
    S(m, bx2 - lx * 0.4, 1.1, bz2 - lz * 0.4, bx2 + lx * 0.2, 2.4, bz2 + lz * 0.2, '#ecf0f1');
    m.C.cylindre(bx2 + dx * 1.5, 1.1, bz2 + dz * 1.5, 0.1, 0.12, 7, '#6b4423', 8);
    const base = [bx2 + dx * 1.5, 1.6, bz2 + dz * 1.5], haut = [bx2 + dx * 1.5, 7.6, bz2 + dz * 1.5];
    m.C.triangle(base, haut, [bx2 - dx * 2.6, 1.8, bz2 - dz * 2.6], k < 0 ? '#ffffff' : '#f1c40f');
    caisses(m, ...P(20, k - 0.8), 2, r, 1.0);
    butin(m, ...[P(23, k)].map(([x, z]) => [x, 1.1, z])[0]);
  }
  coffre(m, ...[P(24, -7)].map(([x, z]) => [x, 1.0, z])[0], 0);
  // Entrepôts
  for (const k of [-11, 11]) { const [x, z] = P(-12, k); m.ajouterMaison(x, z, { w: 12, d: 10, style: 'entrepot', porte: porteVers(x, z, l.x + dx * 5, l.z + dz * 5) }); }
  // Phare
  const [fx, fz] = P(4, 20);
  const fh = Math.max(0.5, m.hauteurTerrain(fx, fz));
  m.C.cylindre(fx, fh - 1, fz, 3.2, 3.6, 1.6, '#7f858e', 16);
  for (let k = 0; k < 5; k++) m.C.cylindre(fx, fh + 0.6 + k * 3, fz, 2.2 - (k + 1) * 0.1, 2.2 - k * 0.1, 3, k % 2 ? '#d63031' : '#ffffff', 18);
  const top = fh + 15.6;
  m.C.cylindre(fx, top, fz, 2.4, 2.4, 0.3, '#2b2d33', 18);
  m.C.cylindre(fx, top + 0.3, fz, 1.3, 1.3, 2, '#2b2d33', 8);
  lum(m, fx - 0.9, top + 0.6, fz - 0.9, fx + 0.9, top + 2, fz + 0.9, '#fff2b0');
  m.C.cone(fx, top + 2.3, fz, 1.6, 1.4, '#d63031', 16);
  S(m, fx - 1.7, fh - 1, fz - 1.7, fx + 1.7, top + 0.3, fz + 1.7, '#ffffff').dessin = false;
  m.anim.phares.push({ x: fx, y: top + 1.3, z: fz });
  coffre(m, ...[P(4, 16.5)].map(([x, z]) => [x, Math.max(0.5, m.hauteurTerrain(x, z)), z])[0], 0);
}

export function construireLieu(m, l) {
  ({ arene, ville, usine, ferme, chateau, desert, chalets, quartier, port })[l.type](m, l);
}
