// NATX ROYALE — boucle de jeu, contrôles, caméra, HUD, menus.
import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { Monde, DEMI, rayonBoite } from './monde.js';
import { OBJETS, RARETES, modeleObjet, modelesPrets } from './armes.js';
import { creerPersonnage, tenirObjet, animerPersonnage, creerEtiquette, corpsPret } from './personnage.js';
import { Reseau } from './reseau.js';
import { Hote } from './hote.js';
import { etatZone, posDirigeable, cibleConstruction, COUT_CONSTR, posRavito, simulerGrenade } from './partage.js';
import { initSons, son, sonLoin, reglerVolume, reglerMusique, jouerMusique, arreterMusique, reglerVent } from './sons.js';
import { borner, codeAleatoire, arrondi, echapper, angleVers } from './outils.js';
import { creerCiel, creerMer, materiauZone, Particules, SOLEIL, COULEURS_CIEL } from './effets.js';
import { Apercu } from './apercu.js';
import { Menus, toast } from './menus.js';
import { chargerProfil, sauverProfil, bonusDuJour, recompense, nettoyerLook, xpPartie, ajouterXP, avancerDefis, texteDefi, enregistrerPartie, RECOMPENSE_DEFI, xpPourNiveau } from './boutique.js';

const $ = s => document.querySelector(s);
const COULEURS = ['#e74c3c', '#ff8c1a', '#f7d038', '#2ecc71', '#1abc9c', '#3498db', '#8e44ad', '#ff5fa2', '#ecf0f1', '#34495e'];

// ---------- Réglages enregistrés ----------
let reglages = {};
try { reglages = JSON.parse(localStorage.getItem('natx-royale') || '{}'); } catch (e) { reglages = {}; }
reglages.pseudo ??= '';
reglages.couleur ??= COULEURS[Math.floor(Math.random() * COULEURS.length)];
reglages.sensi ??= 1.2; reglages.volume ??= 0.6;
// Téléphone / tablette : écran tactile sans souris
reglages.tactile ??= 'auto'; reglages.sensiTactile ??= 1; reglages.tailleBoutons ??= 'normal'; reglages.opaciteBoutons ??= 0.85; reglages.vibrations ??= true;
const tactileAuto = matchMedia('(pointer: coarse)').matches || (navigator.maxTouchPoints > 0 && matchMedia('(hover: none)').matches);
let tactile = reglages.tactile === 'oui' || (reglages.tactile === 'auto' && tactileAuto);
document.body.classList.toggle('tactile', tactile);
if (tactile) { reglages.qualite ??= 'basse'; reglages.distance ??= 'courte'; }
reglages.qualite ??= reglages.ombres === false ? 'basse' : 'haute';
reglages.numero ??= Math.floor(Math.random() * 6);
reglages.musique ??= 0.5; reglages.fov ??= 72; reglages.inverserY ??= false; reglages.sensiVisee ??= 0.7;
reglages.couleurViseur ??= '#ffffff'; reglages.distance ??= 'normale'; reglages.chiffresDegats ??= true; reglages.fps ??= false; reglages.visuSons ??= true;
const DISTANCES = { courte: 0.65, normale: 1, loin: 1.45 };
const brumeLoin = () => 640 * (DISTANCES[reglages.distance] || 1);
const sauverReglages = () => { try { localStorage.setItem('natx-royale', JSON.stringify(reglages)); } catch (e) { /* rien */ } };
const profil = chargerProfil();
const QUALITES = {
  haute: { ratio: 1.5, ombres: true, carteOmbre: 2048, bloom: true, herbe: 1 },
  moyenne: { ratio: 1.25, ombres: true, carteOmbre: 1024, bloom: false, herbe: 0.5 },
  basse: { ratio: 1, ombres: false, carteOmbre: 512, bloom: false, herbe: 0 },
};
const Q = () => QUALITES[reglages.qualite] || QUALITES.haute;

// ---------- Rendu 3D ----------
const canvas = $('#jeu');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(devicePixelRatio, Q().ratio));
renderer.setSize(innerWidth, innerHeight, false);
renderer.shadowMap.enabled = Q().ombres;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.toneMapping = THREE.NeutralToneMapping;
renderer.toneMappingExposure = 1.08;
const scene = new THREE.Scene();
scene.fog = new THREE.Fog(COULEURS_CIEL.horizon.clone(), 180, 640);
const camera = new THREE.PerspectiveCamera(72, innerWidth / innerHeight, 0.1, 2200);
camera.rotation.order = 'YXZ';
const ciel = creerCiel();
scene.add(ciel);
// Reflets du ciel sur les objets brillants (or, métal, vitres)
{
  const sceneCiel = new THREE.Scene(); sceneCiel.add(creerCiel());
  const pm = new THREE.PMREMGenerator(renderer);
  scene.environment = pm.fromScene(sceneCiel, 0.02).texture;
  scene.environmentIntensity = 0.7;
}
const hemi = new THREE.HemisphereLight('#dff1ff', '#6b8a4a', 1.5);
scene.add(hemi);
const soleil = new THREE.DirectionalLight('#fff0d4', 2.6);
soleil.castShadow = true;
soleil.shadow.mapSize.set(Q().carteOmbre, Q().carteOmbre);
Object.assign(soleil.shadow.camera, { left: -70, right: 70, top: 70, bottom: -70, near: 1, far: 360 });
soleil.shadow.bias = -0.0004; soleil.shadow.normalBias = 0.06;
scene.add(soleil, soleil.target);
// Lueur (bloom) sur ce qui brille, en qualité haute
const composer = new EffectComposer(renderer);
composer.addPass(new RenderPass(scene, camera));
const bloom = new UnrealBloomPass(new THREE.Vector2(innerWidth, innerHeight), 0.32, 0.45, 0.92);
composer.addPass(bloom);
composer.addPass(new OutputPass());
function appliquerQualite() {
  const q = Q();
  renderer.setPixelRatio(Math.min(devicePixelRatio, q.ratio));
  renderer.setSize(innerWidth, innerHeight, false);
  composer.setPixelRatio(Math.min(devicePixelRatio, q.ratio));
  composer.setSize(innerWidth, innerHeight);
  if (renderer.shadowMap.enabled !== q.ombres) {
    renderer.shadowMap.enabled = q.ombres;
    scene.traverse(o => { if (o.material) for (const m of [].concat(o.material)) m.needsUpdate = true; });
  }
}
addEventListener('resize', () => {
  renderer.setSize(innerWidth, innerHeight, false);
  composer.setSize(innerWidth, innerHeight);
  camera.aspect = innerWidth / innerHeight; camera.updateProjectionMatrix();
});
const particules = new Particules(scene);

// Éclair de lumière des tirs et des explosions
const lumiereTir = new THREE.PointLight('#ffc46b', 0, 14, 1.6);
scene.add(lumiereTir);
let lumiereT = 0;
function eclairer(x, y, z, force, portee) {
  lumiereTir.position.set(x, y, z); lumiereTir.intensity = force; lumiereTir.distance = portee; lumiereT = force > 30 ? 0.25 : 0.06;
}

// ---------- Le soleil se couche pendant la partie ----------
const dirSoleil = SOLEIL.clone();
const CIEL_SOIR = { haut: new THREE.Color('#4a5bb0'), horizon: new THREE.Color('#ffb27a'), bas: new THREE.Color('#e7a27a') };
const couleurSoleil = new THREE.Color('#fff0d4'), couleurSoir = new THREE.Color('#ffa060');
const cielHorizon = COULEURS_CIEL.horizon.clone();
let soirActuel = -1;
function majJourNuit(k) {
  if (Math.abs(k - soirActuel) < 0.002) return;
  soirActuel = k;
  dirSoleil.set(0.45, 0.62 - k * 0.5, 0.32 + k * 0.45).normalize();
  const u = ciel.material.uniforms;
  u.uHaut.value.copy(COULEURS_CIEL.haut).lerp(CIEL_SOIR.haut, k);
  cielHorizon.copy(COULEURS_CIEL.horizon).lerp(CIEL_SOIR.horizon, k);
  u.uHorizon.value.copy(cielHorizon);
  u.uBas.value.copy(COULEURS_CIEL.bas).lerp(CIEL_SOIR.bas, k);
  u.uSoleil.value.copy(dirSoleil);
  soleil.color.copy(couleurSoleil).lerp(couleurSoir, k);
  soleil.intensity = 2.6 - k * 0.9;
  hemi.intensity = 1.5 - k * 0.45;
  if (etat.mer) { etat.mer.material.uniforms.uSoleil.value.copy(dirSoleil); etat.mer.material.uniforms.uCiel.value.copy(cielHorizon); }
  if (etat.monde && etat.monde.matLumieres) etat.monde.matLumieres.color.setScalar(1.7 + k * 2.4);
}

// ---------- Mouettes au-dessus de la plage ----------
const mouettes = (() => {
  const g = new THREE.Group();
  const mat = new THREE.MeshLambertMaterial({ color: '#f4f6f8', side: THREE.DoubleSide });
  const matBout = new THREE.MeshLambertMaterial({ color: '#3b3f47', side: THREE.DoubleSide });
  const aile = new THREE.BufferGeometry();
  aile.setAttribute('position', new THREE.Float32BufferAttribute([0, 0, -0.22, 0, 0, 0.22, 0.75, 0.04, 0.05], 3)); aile.computeVertexNormals();
  const bout = new THREE.BufferGeometry();
  bout.setAttribute('position', new THREE.Float32BufferAttribute([0.7, 0.04, -0.02, 0.7, 0.04, 0.12, 1.05, 0.06, 0.1], 3)); bout.computeVertexNormals();
  const corps = new THREE.CapsuleGeometry(0.1, 0.42, 3, 6).rotateX(Math.PI / 2);
  const liste = [];
  for (let i = 0; i < 9; i++) {
    const o = new THREE.Group();
    const ag = new THREE.Group(), ad = new THREE.Group();
    ag.add(new THREE.Mesh(aile, mat), new THREE.Mesh(bout, matBout)); ag.scale.x = -1;
    ad.add(new THREE.Mesh(aile, mat), new THREE.Mesh(bout, matBout));
    o.add(new THREE.Mesh(corps, mat), ag, ad);
    o.scale.setScalar(1.7);
    liste.push({ o, ag, ad, a: Math.random() * 6.28, r: 10 + Math.random() * 22, h: 20 + Math.random() * 16, v: (0.22 + Math.random() * 0.2) * (i % 2 ? 1 : -1), p: Math.random() * 6 });
    g.add(o);
  }
  g.visible = false;
  scene.add(g);
  return { g, liste, angle: 0 };
})();
function majMouettes(dt, t) {
  if (!etat.monde) { mouettes.g.visible = false; return; }
  mouettes.g.visible = true;
  // le vol tourne au-dessus de la côte la plus proche de la caméra
  const voulu = Math.atan2(camera.position.z, camera.position.x);
  mouettes.angle += Math.atan2(Math.sin(voulu - mouettes.angle), Math.cos(voulu - mouettes.angle)) * Math.min(1, dt * 0.2);
  const cx = Math.cos(mouettes.angle) * DEMI * 0.98, cz = Math.sin(mouettes.angle) * DEMI * 0.98;
  for (const m of mouettes.liste) {
    m.a += m.v * dt;
    const x = cx + Math.cos(m.a) * m.r, z = cz + Math.sin(m.a) * m.r;
    m.o.position.set(x, m.h + Math.sin(t * 0.7 + m.p) * 2, z);
    m.o.rotation.y = Math.atan2(Math.sin(m.a) * m.v, -Math.cos(m.a) * m.v) + Math.PI;
    m.o.rotation.z = -Math.sign(m.v) * 0.25;
    const b = Math.sin(t * 7 + m.p) * 0.55;
    m.ad.rotation.z = b; m.ag.rotation.z = -b;
  }
}

// ---------- Effets : éclats, traînées de balles, flashs ----------
const geoEclat = new THREE.BoxGeometry(0.16, 0.16, 0.16);
const matsEclats = new Map();
const matEclat = c => { if (!matsEclats.has(c)) matsEclats.set(c, new THREE.MeshBasicMaterial({ color: c })); return matsEclats.get(c); };
const eclatsListe = [];
function eclats(x, y, z, couleur, n = 6, force = 4) {
  for (let i = 0; i < n; i++) {
    let p = eclatsListe.find(p => !p.actif);
    if (!p) { if (eclatsListe.length > 220) return; p = { mesh: new THREE.Mesh(geoEclat, matEclat(couleur)) }; scene.add(p.mesh); eclatsListe.push(p); }
    p.mesh.material = matEclat(couleur);
    p.actif = true; p.vie = 0.4 + Math.random() * 0.4; p.mesh.visible = true;
    p.mesh.position.set(x, y, z); p.mesh.scale.setScalar(0.5 + Math.random() * 0.9);
    p.vx = (Math.random() - 0.5) * force; p.vy = Math.random() * force; p.vz = (Math.random() - 0.5) * force;
  }
}
const tracesListe = [];
function trace(a, b, couleur = '#fff3a0') {
  let t = tracesListe.find(t => !t.actif);
  if (!t) {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(new Float32Array(6), 3));
    t = { ligne: new THREE.Line(g, new THREE.LineBasicMaterial({ color: couleur, transparent: true })) };
    t.ligne.frustumCulled = false; scene.add(t.ligne); tracesListe.push(t);
  }
  const p = t.ligne.geometry.attributes.position;
  p.setXYZ(0, a[0], a[1], a[2]); p.setXYZ(1, b[0], b[1], b[2]); p.needsUpdate = true;
  t.ligne.material.color.set(couleur);
  t.actif = true; t.vie = 0.09; t.ligne.visible = true;
}
const texFlash = (() => {
  const cv = document.createElement('canvas'); cv.width = cv.height = 64;
  const g = cv.getContext('2d'); const gr = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  gr.addColorStop(0, 'rgba(255,255,220,1)'); gr.addColorStop(0.4, 'rgba(255,200,60,.8)'); gr.addColorStop(1, 'rgba(255,120,0,0)');
  g.fillStyle = gr; g.fillRect(0, 0, 64, 64);
  return new THREE.CanvasTexture(cv);
})();
const flashsListe = [];
function flash(x, y, z, taille = 0.9) {
  let f = flashsListe.find(f => !f.actif);
  if (!f) { f = { s: new THREE.Sprite(new THREE.SpriteMaterial({ map: texFlash, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true })) }; scene.add(f.s); flashsListe.push(f); }
  f.actif = true; f.vie = 0.05; f.s.visible = true; f.s.position.set(x, y, z); f.s.scale.setScalar(taille);
}
// Douilles éjectées à droite de l'arme
const geoDouille = new THREE.CylinderGeometry(0.025, 0.025, 0.09, 6);
const matDouille = new THREE.MeshStandardMaterial({ color: '#d4a017', metalness: 0.8, roughness: 0.3 });
const douilles = [];
function douille(x, y, z, ry) {
  let d = douilles.find(d => !d.actif);
  if (!d) { if (douilles.length > 30) return; d = { mesh: new THREE.Mesh(geoDouille, matDouille) }; scene.add(d.mesh); douilles.push(d); }
  d.actif = true; d.vie = 0.9; d.mesh.visible = true; d.mesh.position.set(x, y, z);
  const rx = Math.cos(ry), rz = -Math.sin(ry);
  d.vx = rx * (2 + Math.random()) + (Math.random() - 0.5); d.vy = 2.5 + Math.random() * 1.5; d.vz = rz * (2 + Math.random()) + (Math.random() - 0.5);
}
// Trous de balles sur les murs des maisons
const geoImpact = new THREE.CircleGeometry(0.08, 8);
const matImpact = new THREE.MeshBasicMaterial({ color: '#1d1b19', transparent: true, opacity: 0.8, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2 });
const impacts = []; let impactN = 0;
function impact(x, y, z) {
  let m = impacts[impactN % 60];
  if (!m) { m = new THREE.Mesh(geoImpact, matImpact); scene.add(m); impacts.push(m); }
  impactN++;
  const c = camera.position, d = Math.hypot(c.x - x, c.y - y, c.z - z) || 1;
  m.position.set(x + (c.x - x) / d * 0.03, y + (c.y - y) / d * 0.03, z + (c.z - z) / d * 0.03);
  m.lookAt(c);
  m.visible = true;
}
function majEffets(dt) {
  for (const d of douilles) if (d.actif) {
    d.vie -= dt; if (d.vie <= 0) { d.actif = false; d.mesh.visible = false; continue; }
    d.vy -= 18 * dt; d.mesh.position.x += d.vx * dt; d.mesh.position.y += d.vy * dt; d.mesh.position.z += d.vz * dt;
    d.mesh.rotation.x += dt * 20; d.mesh.rotation.z += dt * 13;
  }
  if (lumiereT > 0) { lumiereT -= dt; if (lumiereT <= 0) lumiereTir.intensity = 0; else lumiereTir.intensity *= 0.82; }
  for (const p of eclatsListe) if (p.actif) {
    p.vie -= dt; if (p.vie <= 0) { p.actif = false; p.mesh.visible = false; continue; }
    p.vy -= 18 * dt; p.mesh.position.x += p.vx * dt; p.mesh.position.y += p.vy * dt; p.mesh.position.z += p.vz * dt;
  }
  for (const t of tracesListe) if (t.actif) { t.vie -= dt; if (t.vie <= 0) { t.actif = false; t.ligne.visible = false; } }
  for (const f of flashsListe) if (f.actif) { f.vie -= dt; if (f.vie <= 0) { f.actif = false; f.s.visible = false; } }
}

// ---------- État ----------
const reseau = new Reseau();
let hote = null;
const etat = {
  ecran: 'menu', monde: null, imageCarte: null, temps: 0, dirigeable: null, zone: null,
  moi: null, infos: new Map(), autres: new Map(), butins: new Map(), vivants: 0,
  envoiT: 0, spectate: null, enAttente: new Map(), grandeCarte: false, etapeZone: -1, retrecit: false,
  fini: false, mondeNeuf: false, angleMenu: 0, interaction: null, salon: null,
  options: {}, ravitos: new Map(), projectiles: [], kills: new Map(), classement: [], premierSang: false, repere: null,
  secousse: 0, stats: {}, ping: 0, pingT: 0, barres: new Map(), tableau: false, mesCoffres: new Set(), tuto: null, exclu: false,
};
const monEquipe = () => (etat.infos.get(reseau.monId) || {}).equipe || 0;
const coequipier = id => { const e = monEquipe(), i = etat.infos.get(id); return !!(e && i && i.equipe === e && id !== reseau.monId); };
const sujetVue = () => { const moi = etat.moi; return moi.ph === 'mort' && etat.spectate ? etat.autres.get(etat.spectate) || moi : moi; };
const touches = new Set();
let tirAppuye = false, viseeAppuye = false;

// ---------- Monde ----------
function creerDirigeableMesh() {
  const g = new THREE.Group();
  const lam = c => new THREE.MeshLambertMaterial({ color: c });
  const ballon = new THREE.Mesh(new THREE.SphereGeometry(1, 24, 16), lam('#ff7b39')); ballon.scale.set(9, 7, 24);
  const bande = new THREE.Mesh(new THREE.SphereGeometry(1, 24, 16), lam('#ffffff')); bande.scale.set(9.15, 7.15, 5);
  const bande2 = new THREE.Mesh(new THREE.SphereGeometry(1, 24, 16), lam('#3d8dff')); bande2.scale.set(9.2, 7.2, 1.6);
  const nacelle = new THREE.Mesh(new THREE.BoxGeometry(5, 2.6, 11), lam('#4a3426')); nacelle.position.y = -8.2;
  const vitres = new THREE.Mesh(new THREE.BoxGeometry(5.1, 0.9, 9), lam('#9fe3ff')); vitres.position.y = -7.9;
  const aileV = new THREE.Mesh(new THREE.BoxGeometry(0.5, 8, 6), lam('#ffd23f')); aileV.position.set(0, 2, 21);
  const aileH = new THREE.Mesh(new THREE.BoxGeometry(12, 0.5, 6), lam('#ffd23f')); aileH.position.set(0, 0, 21);
  const helice = new THREE.Mesh(new THREE.BoxGeometry(6, 0.4, 0.4), lam('#333')); helice.position.set(0, -8.2, 6);
  const helice2 = helice.clone(); helice2.position.set(0, -8.2, -6.2); helice2.rotation.z = 1;
  const fanions = new THREE.Group();
  ['#e74c3c', '#f1c40f', '#2ecc71', '#3d8dff', '#b552ff', '#ff8c1a'].forEach((c, i) => {
    const f = new THREE.Mesh(new THREE.ConeGeometry(0.5, 1.2, 3), lam(c)); f.rotation.x = Math.PI; f.position.set(0, -4.5 - Math.sin(i / 5 * Math.PI) * 1.2, -12 + i * 4.8); fanions.add(f);
  });
  const lumiere = new THREE.Mesh(new THREE.SphereGeometry(0.5, 10, 8), new THREE.MeshBasicMaterial({ color: new THREE.Color('#ff3d3d').multiplyScalar(2), toneMapped: false })); lumiere.position.set(0, -9.8, 0);
  // Banderole de la collab sur les côtés du ballon
  const cvB = document.createElement('canvas'); cvB.width = 512; cvB.height = 128;
  const dessinBanderole = () => {
    const gb = cvB.getContext('2d');
    gb.fillStyle = '#0a0a14'; gb.fillRect(0, 0, 512, 128);
    gb.strokeStyle = '#b026ff'; gb.lineWidth = 8; gb.strokeRect(4, 4, 504, 120);
    gb.font = "900 64px Orbitron, 'Lilita One', system-ui"; gb.textAlign = 'center'; gb.textBaseline = 'middle';
    gb.fillStyle = '#ffffff'; gb.fillText('NATX', 130, 68);
    gb.fillStyle = '#ff2e88'; gb.fillText('×', 256, 68);
    gb.shadowColor = '#22e8ff'; gb.shadowBlur = 14; gb.strokeStyle = '#ff2e88'; gb.lineWidth = 6; gb.strokeText('2K27', 380, 68);
    gb.fillStyle = '#22e8ff'; gb.fillText('2K27', 380, 68); gb.shadowBlur = 0;
  };
  dessinBanderole();
  const texB = new THREE.CanvasTexture(cvB); texB.colorSpace = THREE.SRGBColorSpace;
  document.fonts?.load?.('900 64px Orbitron').then(() => { dessinBanderole(); texB.needsUpdate = true; }).catch(() => {});
  for (const s of [-1, 1]) {
    const p = new THREE.Mesh(new THREE.PlaneGeometry(22, 5.5), new THREE.MeshBasicMaterial({ map: texB, toneMapped: false, color: new THREE.Color(1.2, 1.2, 1.2) }));
    p.position.set(s * 9.35, 0.5, -1); p.rotation.y = s * Math.PI / 2;
    g.add(p);
  }
  g.add(ballon, bande, bande2, nacelle, vitres, aileV, aileH, helice, helice2, fanions, lumiere);
  g.userData.helice = helice; g.userData.helice2 = helice2; g.userData.lumiere = lumiere;
  g.traverse(o => { if (o.isMesh) o.castShadow = true; });
  return g;
}

function liberer(o) {
  if (!o) return;
  scene.remove(o);
  o.traverse(c => {
    if (c.geometry) c.geometry.dispose();
    if (c.material) for (const m of [].concat(c.material)) { if (m.map && m.map !== texFlash) m.map.dispose(); m.dispose(); }
  });
}

function viderJoueursEtButin() {
  for (const a of etat.autres.values()) scene.remove(a.modele);
  etat.autres.clear();
  for (const b of etat.butins.values()) scene.remove(b.mesh);
  etat.butins.clear();
  if (etat.moi && etat.moi.modele) scene.remove(etat.moi.modele);
  etat.moi = null;
  if (fantome) { scene.remove(fantome); fantome = null; cleFantome = null; }
  for (const r of etat.ravitos.values()) scene.remove(r.mesh);
  etat.ravitos.clear();
  for (const p of etat.projectiles) scene.remove(p.g);
  etat.projectiles.length = 0;
  for (const b of etat.barres.values()) b.el.remove();
  etat.barres.clear();
  for (const m of impacts) m.visible = false;
}

function preparerMonde(graine) {
  if (etat.monde && etat.monde.graine === graine && etat.mondeNeuf) { etat.mondeNeuf = false; return etat.monde; }
  viderJoueursEtButin();
  if (etat.monde) liberer(etat.monde.groupe);
  liberer(etat.meshZone); liberer(etat.meshDirigeable);
  const m = new Monde(graine);
  m.creerDecor({ ombres: Q().ombres, herbe: Q().herbe });
  etat.mer = creerMer(m);
  m.groupe.add(etat.mer);
  scene.add(m.groupe);
  etat.monde = m;
  etat.imageCarte = m.dessinerCarte(512);
  etat.meshZone = new THREE.Mesh(new THREE.CylinderGeometry(1, 1, 500, 96, 1, true), materiauZone());
  etat.meshZone.renderOrder = 3;
  etat.meshZone.visible = false; scene.add(etat.meshZone);
  etat.meshDirigeable = creerDirigeableMesh(); etat.meshDirigeable.visible = false; scene.add(etat.meshDirigeable);
  etat.mondeNeuf = true;
  return m;
}

// ---------- Joueurs ----------
function nouveauMoi(info) {
  const modele = creerPersonnage(info.couleur, null, info.n || 0, info.look || profil.equipe);
  scene.add(modele);
  return {
    id: info.id, nom: info.nom, couleur: info.couleur, modele,
    x: 0, y: 110, z: 0, vx: 0, vy: 0, vz: 0, auSol: false, dansEau: false,
    ry: 0, rx: -0.2, ph: 'dirigeable', pv: 100, bouclier: 0, mats: 0, munitions: 40,
    inv: [{ objet: 'pioche', rarete: 0 }, null, null, null, null, null], slot: 0,
    tirT: 0, rechargeT: 0, conso: null, visee: false, construction: null, kills: 0, degats: 0, coup: 0,
    sautT: 0, construitT: 0, place: 0, emote: null, look: nettoyerLook(info.look || profil.equipe), recompense: false,
    equipe: info.equipe || 0, accroupi: false, sansChute: false,
  };
}

function creerAutre(info) {
  const look = nettoyerLook(info.look);
  const modele = creerPersonnage(info.couleur, info.nom, info.n || 0, look);
  modele.visible = false;
  scene.add(modele);
  const a = { id: info.id, modele, vivant: true, cible: null, x: 0, y: 0, z: 0, ry: 0, rx: 0, vitesse: 0, f: 0, look, couleur: info.couleur, ph: '' };
  // coéquipier : losange vert visible à travers les murs
  if (coequipier(info.id)) {
    const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: texLosange, depthTest: false, transparent: true, fog: false }));
    s.position.y = 3.15; s.scale.set(0.55, 0.55, 1); s.renderOrder = 12;
    modele.add(s); a.marqueur = s;
  }
  etat.autres.set(info.id, a);
}
const texLosange = (() => {
  const cv = document.createElement('canvas'); cv.width = cv.height = 64;
  const g = cv.getContext('2d');
  g.fillStyle = '#4fff7a'; g.strokeStyle = '#0b3d1a'; g.lineWidth = 6;
  g.beginPath(); g.moveTo(32, 6); g.lineTo(56, 30); g.lineTo(32, 58); g.lineTo(8, 30); g.closePath(); g.fill(); g.stroke();
  const t = new THREE.CanvasTexture(cv); t.colorSpace = THREE.SRGBColorSpace; return t;
})();

function nomDe(id) { const i = etat.infos.get(id); return i ? i.nom : '???'; }

// ---------- Butin au sol ----------
const matsRayon = new Map();
const geoRayon = new THREE.CylinderGeometry(0.22, 0.32, 3.2, 12, 1, true).translate(0, 1.6, 0);
const geoHalo = new THREE.PlaneGeometry(1.8, 1.8);
const texRayon = (() => {
  const cv = document.createElement('canvas'); cv.width = 4; cv.height = 64;
  const g = cv.getContext('2d'); const gr = g.createLinearGradient(0, 0, 0, 64);
  gr.addColorStop(0, 'rgba(255,255,255,0)'); gr.addColorStop(0.7, 'rgba(255,255,255,.35)'); gr.addColorStop(1, 'rgba(255,255,255,.9)');
  g.fillStyle = gr; g.fillRect(0, 0, 4, 64);
  return new THREE.CanvasTexture(cv);
})();
const texHalo = (() => {
  const cv = document.createElement('canvas'); cv.width = cv.height = 64;
  const g = cv.getContext('2d'); const gr = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  gr.addColorStop(0, 'rgba(255,255,255,.9)'); gr.addColorStop(0.45, 'rgba(255,255,255,.35)'); gr.addColorStop(0.6, 'rgba(255,255,255,.6)'); gr.addColorStop(0.7, 'rgba(255,255,255,0)');
  g.fillStyle = gr; g.fillRect(0, 0, 64, 64);
  return new THREE.CanvasTexture(cv);
})();
function ajouterButin(b) {
  if (etat.butins.has(b.id)) return;
  const g = new THREE.Group();
  const m = modeleObjet(b.objet, b.rarete);
  m.scale.setScalar(1.5); m.position.y = 0.55;
  g.add(m);
  const coul = RARETES[b.rarete || 0].couleur;
  if (!matsRayon.has(coul)) {
    matsRayon.set(coul, {
      rayon: new THREE.MeshBasicMaterial({ map: texRayon, color: new THREE.Color(coul).multiplyScalar(1.6), transparent: true, opacity: 0.75, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide, toneMapped: false }),
      sol: new THREE.MeshBasicMaterial({ map: texHalo, color: new THREE.Color(coul).multiplyScalar(1.4), transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false }),
    });
  }
  const mats = matsRayon.get(coul);
  const grand = (b.rarete || 0) >= 3 ? 1.6 : 1;
  const rayon = new THREE.Mesh(geoRayon, mats.rayon); rayon.scale.set(grand, (b.rarete || 0) >= 2 ? 1.6 : 1, grand);
  const halo = new THREE.Mesh(geoHalo, mats.sol); halo.rotation.x = -Math.PI / 2; halo.position.y = 0.06;
  g.add(rayon, halo);
  g.position.set(b.x, b.y, b.z);
  scene.add(g);
  etat.butins.set(b.id, { ...b, mesh: g, modele: m, phase: Math.random() * 6 });
}
function retirerButin(id) {
  const b = etat.butins.get(id);
  if (!b) return null;
  scene.remove(b.mesh);
  etat.butins.delete(id);
  return b;
}

// ---------- Messages venant de l'hôte ----------
function recevoir(m) {
  if (!m || typeof m !== 'object') return;
  const moi = etat.moi;
  switch (m.t) {
    case 'bienvenue':
      if (m.enCours) $('#infoSalon').textContent = 'Une partie est en cours : tu joueras à la prochaine !';
      break;
    case 'salon': majSalon(m); break;
    case 'info': annonce(m.texte, 2.5, '#9fe0ff'); break;
    case 'debut': debutPartie(m); break;
    case 'snap': recevoirSnap(m); break;
    case 'pv': {
      if (moi && m.id === moi.id) {
        const avant = moi.pv + moi.bouclier;
        moi.pv = m.pv; moi.bouclier = m.b;
        if (m.deg && moi.pv + moi.bouclier < avant) {
          $('#flash').style.opacity = 0.9;
          vibrer(m.casse ? [40, 30, 60] : 35);
          $('#flash').classList.toggle('bleu', !!m.casse || m.b > 0);
          son(m.casse ? 'bouclierCasse' : 'aie', 0.8);
          moi.emote = null;
          if (m.de && m.de !== moi.id && etat.infos.has(m.de)) {
            moi.dernierAttaquant = m.de;
            const a = etat.autres.get(m.de);
            if (a) indiquerDirection(a.x, a.z);
          }
          if (m.casse) for (let i = 0; i < 14; i++) particules.ajouter({ x: moi.x, y: moi.y + 1.2, z: moi.z, vx: (Math.random() - 0.5) * 6, vy: Math.random() * 4, vz: (Math.random() - 0.5) * 6, couleur: '#7cc9ff', forme: 3, taille: 0.35, tailleFin: 0.05, vie: 0.6, additif: true, gravite: 6 });
        } else if (!m.deg && moi.pv + moi.bouclier > avant) {
          const coul = m.b > 0 && moi.pv >= 100 ? '#6ec8ff' : '#5bff7a';
          for (let i = 0; i < (m.fontaine ? 4 : 18); i++) particules.ajouter({ x: moi.x + (Math.random() - 0.5) * 1.2, y: moi.y + Math.random() * 1.8, z: moi.z + (Math.random() - 0.5) * 1.2, vy: 1.5 + Math.random(), couleur: coul, forme: 2, taille: 0.3, tailleFin: 0.1, vie: 1.1, additif: true });
        }
      }
      const inf = etat.infos.get(m.id); if (inf) { inf.pv = m.pv; inf.b = m.b; }
      if (moi && m.de === moi.id && m.id !== moi.id && m.deg) {
        if (reglages.chiffresDegats) afficherDegats(m.x, m.y + 2.3, m.z, m.deg, m.tete, m.b > 0);
        moi.degats += m.deg;
        montrerBarre(m.id);
      }
      break;
    }
    case 'elim': recevoirElim(m); break;
    case 'constr': {
      etat.monde.ajouterConstruction(m.c);
      etat.enAttente.delete(m.c.cle);
      if (moi && m.par !== moi.id) sonLoin('construire', distCam(m.c.i * 4, m.c.k * 4, m.c.j * 4));
      else if (moi && m.par === moi.id) etat.stats.constr = (etat.stats.constr || 0) + 1;
      break;
    }
    case 'refusConstr':
      if (etat.enAttente.has(m.cle)) { etat.enAttente.delete(m.cle); if (moi) moi.mats += COUT_CONSTR; }
      break;
    case 'constrPV': { const c = etat.monde.abimerConstruction(m.cle, m.pv); if (c) { const p = c.mesh.position; for (let i = 0; i < 3; i++) particules.ajouter({ x: p.x + (Math.random() - 0.5) * 2, y: p.y + (Math.random() - 0.5) * 2, z: p.z + (Math.random() - 0.5) * 2, vy: 0.5, couleur: '#d9c2a0', taille: 0.6, tailleFin: 1.2, vie: 0.7, alpha: 0.6 }); } break; }
    case 'constrX': {
      const c = etat.monde.retirerConstruction(m.cle);
      if (c) {
        const p = c.mesh.position;
        eclats(p.x, p.y, p.z, '#c8955a', 12, 6);
        for (let i = 0; i < 12; i++) particules.ajouter({ x: p.x + (Math.random() - 0.5) * 3, y: p.y + (Math.random() - 0.5) * 3, z: p.z + (Math.random() - 0.5) * 3, vx: (Math.random() - 0.5) * 2, vy: Math.random() * 1.5, vz: (Math.random() - 0.5) * 2, couleur: '#d9c2a0', taille: 0.9, tailleFin: 2.2, vie: 1, alpha: 0.55, frein: 1.5 });
        sonLoin('casse', distCam(p.x, p.y, p.z));
      }
      break;
    }
    case 'arbreX': {
      const a = etat.monde.arbres[m.id];
      if (a && a.vivant) {
        etat.monde.detruireArbre(m.id); eclats(a.x, a.y + 3, a.z, '#3f8f3a', 16, 6); sonLoin('arbreTombe', distCam(a.x, a.y, a.z));
        for (let i = 0; i < 16; i++) particules.ajouter({ x: a.x + (Math.random() - 0.5) * 3, y: a.y + 3 + Math.random() * 3, z: a.z + (Math.random() - 0.5) * 3, vx: (Math.random() - 0.5) * 2, vy: -0.5, vz: (Math.random() - 0.5) * 2, couleur: '#4caf50', forme: 3, taille: 0.25, vie: 1.6, gravite: 1 });
      }
      break;
    }
    case 'rocherX': {
      const r = etat.monde.rochers[m.id];
      if (r && r.vivant) { etat.monde.detruireRocher(m.id); eclats(r.x, r.y + 1, r.z, '#9a9ea6', 12, 6); }
      break;
    }
    case 'butin+': ajouterButin(m.b); break;
    case 'butin-': {
      retirerButin(m.id);
      if (moi && m.par === moi.id && m.b) recevoirObjet(m.b);
      break;
    }
    case 'coffreX': {
      const c = etat.monde.coffres[m.id];
      if (c && !c.ouvert) {
        etat.monde.ouvrirCoffre(m.id); eclats(c.x, c.y + 0.8, c.z, '#ffd23f', c.dore ? 20 : 12, 5); sonLoin(c.dore ? 'coffreDore' : 'coffre', distCam(c.x, c.y, c.z) * 3);
        if (etat.mesCoffres.has('c' + m.id)) etat.stats.coffres++;
        for (let i = 0; i < (c.dore ? 60 : 30); i++) particules.ajouter({ x: c.x, y: c.y + 0.7, z: c.z, vx: (Math.random() - 0.5) * 4, vy: 2 + Math.random() * 4, vz: (Math.random() - 0.5) * 4, couleur: Math.random() < 0.5 ? '#ffd23f' : '#fff3b0', forme: 2, taille: 0.3, tailleFin: 0.05, vie: 1.2, additif: true, gravite: 5 });
      }
      break;
    }
    case 'tir': {
      if (moi && m.par === moi.id) break;
      if (!Array.isArray(m.o) || !Array.isArray(m.d)) break;
      trace(m.o, m.d, '#ffe9a0');
      flash(m.o[0], m.o[1], m.o[2], 0.7);
      if (distCam(m.o[0], m.o[1], m.o[2]) < 70) visuSon(m.o[0], m.o[2], m.par);
      particules.ajouter({ x: m.o[0], y: m.o[1], z: m.o[2], vy: 0.6, couleur: '#dddddd', taille: 0.25, tailleFin: 0.7, vie: 0.5, alpha: 0.4 });
      const def = OBJETS[m.a];
      if (def && def.son) sonLoin(def.son, distCam(m.o[0], m.o[1], m.o[2]));
      break;
    }
    case 'fin': recevoirFin(m); break;
    case 'retourSalon': retourSalon(); break;
    case 'chat': recevoirChat(m); break;
    case 'pong': etat.ping = Math.round(performance.now() - (+m.c || 0)); break;
    case 'exclu': etat.exclu = true; location.href = location.pathname + '?erreur=exclu'; break;
    case 'ravito+':
      if (!m.r || !etat.monde) break;
      ajouterRavito(m.r);
      if (moi && moi.ph !== 'mort') { annonce('📦 Un ravitaillement arrive !', 2.5, '#d18bff'); son('ravito', 0.8); }
      break;
    case 'ravitoX': {
      const r = etat.ravitos.get(m.id);
      if (!r) break;
      r.ouvert = true;
      eclats(r.x, r.sol + 1, r.z, '#c44dff', 18, 6);
      for (let i = 0; i < 40; i++) particules.ajouter({ x: r.x, y: r.sol + 1, z: r.z, vx: (Math.random() - 0.5) * 6, vy: 2 + Math.random() * 5, vz: (Math.random() - 0.5) * 6, couleur: i % 2 ? '#c44dff' : '#ffe27a', forme: 2, taille: 0.35, tailleFin: 0.05, vie: 1.2, additif: true, gravite: 5 });
      sonLoin('coffreDore', distCam(r.x, r.sol, r.z) * 2);
      if (etat.mesCoffres.has('r' + m.id)) etat.stats.coffres++;
      scene.remove(r.mesh);
      etat.ravitos.delete(m.id);
      break;
    }
    case 'projectile':
      if (m.par === reseau.monId || !Array.isArray(m.o) || !Array.isArray(m.v)) break;
      lancerProjectile({ type: m.type, o: m.o, v: m.v, duree: +m.duree || 0, par: m.par, mien: false });
      if (m.type === 'roquette') sonLoin('roquette', distCam(m.o[0], m.o[1], m.o[2]));
      break;
    case 'boum': explosionVisuelle(+m.x, +m.y, +m.z, +m.r || 4); visuSon(+m.x, +m.z, 'boum'); break;
  }
}

function distCam(x, y, z) { return Math.hypot(camera.position.x - x, camera.position.y - y, camera.position.z - z); }

function debutPartie(m) {
  preparerMonde(m.graine);
  etat.options = m.options || {};
  etat.kills = new Map(); etat.classement = []; etat.premierSang = false; etat.repere = null; etat.secousse = 0;
  etat.stats = { tirs: 0, touches: 0, tete: 0, constr: 0, coffres: 0, distance: 0, soins: 0, emotes: 0, rebonds: 0 };
  etat.mesCoffres = new Set();
  etat.tuto = profil.stats.parties < 2 ? { t: 6, vus: new Set() } : null;
  soirActuel = -1;
  etat.dirigeable = m.dirigeable; etat.zone = m.zone;
  etat.temps = 0; etat.fini = false; etat.spectate = null; etat.etapeZone = -1; etat.retrecit = false;
  etat.enAttente.clear();
  etat.infos.clear();
  // d'abord tout le monde (pour connaître mon équipe), puis les modèles des autres
  for (const j of m.joueurs) etat.infos.set(j.id, { ...j, pv: 100, b: 0, vivant: true });
  for (const j of m.joueurs) if (j.id !== reseau.monId) creerAutre(j);
  etat.vivants = m.joueurs.length;
  for (const b of m.butins) ajouterButin(b);
  const info = etat.infos.get(reseau.monId);
  etat.moi = nouveauMoi(info || { id: reseau.monId, nom: '?', couleur: '#fff' });
  if (!info) { etat.moi.ph = 'mort'; etat.moi.spectateurSeulement = true; }
  etat.moi.mats = Math.min(999, etat.options.matsDepart | 0);
  jouerMusique('dirigeable');
  const p = posDirigeable(etat.dirigeable, 0);
  etat.moi.ry = Math.atan2(-(etat.dirigeable.bx - etat.dirigeable.ax), -(etat.dirigeable.bz - etat.dirigeable.az));
  etat.moi.x = p.x; etat.moi.y = p.y; etat.moi.z = p.z;
  etat.meshZone.visible = true;
  etat.meshDirigeable.visible = true;
  $('#mortPanneau').classList.add('cache');
  $('#spectateur').classList.add('cache');
  $('#fil').innerHTML = '';
  afficherEcran('jeu');
  construireBarreObjets();
  annonce(tactile ? 'Touche ⤴ pour sauter !' : 'Appuie sur ESPACE pour sauter !', 4);
  if (etat.options.mode === 'duo') setTimeout(() => banniere('👥 MODE DUOS', 'Ton coéquipier a un losange vert au-dessus de la tête'), 1500);
  if (etat.options.entrainement) setTimeout(() => banniere('🎯 ENTRAÎNEMENT', 'Pas de zone · 999 matériaux'), 1500);
}

function recevoirSnap(m) {
  if (!reseau.estHote) {
    const ecart = m.tm - etat.temps;
    if (Math.abs(ecart) > 1) etat.temps = m.tm; else etat.temps += ecart * 0.1;
  }
  for (const e of m.j) {
    const [id, x, y, z, ry, rx, f, a, ph, em] = e;
    if (etat.moi && id === etat.moi.id) continue;
    const o = etat.autres.get(id);
    if (!o || !o.vivant) continue;
    if (!o.cible) { o.x = x; o.y = y; o.z = z; o.ry = ry; }
    o.cible = { x, y, z, ry, rx, f, a, ph, em: em || '' };
  }
}

function recevoirElim(m) {
  etat.vivants = m.vivants;
  if (m.k) etat.kills.set(m.k, m.kills || 0);
  etat.classement.push({ id: m.v, place: m.place });
  const premier = !!m.k && !etat.premierSang;
  if (premier) etat.premierSang = true;
  const inf = etat.infos.get(m.v); if (inf) inf.vivant = false;
  const o = etat.autres.get(m.v);
  if (o) { o.vivant = false; o.modele.visible = false; explosionElimination(o.x, o.y, o.z, o.couleur); }
  const moi = etat.moi;
  // Fil des éliminations
  let texte;
  const v = `<b style="color:${echapper(inf ? inf.couleur : '#fff')}">${echapper(nomDe(m.v))}</b>`;
  if (m.k) {
    const ki = etat.infos.get(m.k);
    const ic = OBJETS[m.a] ? OBJETS[m.a].icone : '💥';
    texte = `<b style="color:${echapper(ki ? ki.couleur : '#fff')}">${echapper(nomDe(m.k))}</b> ${ic} ${v}${m.dist > 4 ? ` <small>(${m.dist | 0} m)</small>` : ''}`;
  } else if (m.a === 'zone') texte = `${v} a été avalé par la zone 🌀`;
  else if (m.a === 'chute') texte = `${v} est tombé de trop haut 🪂`;
  else if (m.a === 'deconnexion') texte = `${v} s'est déconnecté 🔌`;
  else texte = `${v} est éliminé`;
  ajouterFil(texte, moi && (m.k === moi.id || m.v === moi.id));
  if (!moi) return;
  if (m.k === moi.id) {
    moi.kills++;
    son('elimination');
    // séries d'éliminations
    moi.killsT = (moi.killsT || []).filter(t => etat.temps - t < 8);
    moi.killsT.push(etat.temps);
    const n = moi.killsT.length;
    let titre = premier ? '🩸 PREMIER SANG' : '💀 ÉLIMINATION';
    if (n === 2) titre = '⚡ DOUBLE ÉLIMINATION'; else if (n === 3) titre = '🔥 TRIPLE ÉLIMINATION'; else if (n >= 4) titre = '💥 MÉGA ÉLIMINATION';
    if (n >= 2) setTimeout(() => son('serie'), 150);
    const bonus = moi.kills === 5 ? ' · Tu es en feu ! 🔥' : moi.kills === 10 ? ' · Inarrêtable ! 👑' : '';
    banniere(titre, `${nomDe(m.v)} · ${moi.kills} au total${bonus}`);
  } else if (premier && moi.ph !== 'mort') annonce(`🩸 Premier sang : ${nomDe(m.k)}`, 2.5, '#ff7b7b');
  if (m.v === moi.id && moi.ph !== 'mort') mourir(m);
  else if (m.vivants > 1 && moi.ph !== 'mort' && m.vivants <= 5) annonce(`Plus que ${m.vivants} joueurs !`, 2, '#ffffff');
  if (etat.spectate === m.v) setTimeout(() => changerSpectateur(m.k), 1500);
}

function mourir(m) {
  const moi = etat.moi;
  moi.ph = 'mort'; moi.place = m.place; moi.pv = 0; moi.tempsSurvie = etat.temps; moi.accroupi = false;
  reglerVent(0);
  moi.construction = null; moi.conso = null;
  moi.modele.visible = false;
  moi.emote = null;
  son('mort');
  explosionElimination(moi.x, moi.y, moi.z, moi.couleur);
  // On lâche tout son inventaire
  const objets = moi.inv.slice(1).filter(Boolean).map(it => ({ objet: it.objet, rarete: it.rarete, qte: it.qte || 0, mun: it.mun || 0 }));
  if (moi.munitions > 0) objets.push({ objet: 'munitions', qte: moi.munitions });
  if (moi.mats > 0) objets.push({ objet: 'materiaux', qte: moi.mats });
  if (objets.length) reseau.versHote({ t: 'jeter', objets, x: moi.x, y: moi.y, z: moi.z });
  moi.inv = [{ objet: 'pioche', rarete: 0 }, null, null, null, null, null];
  moi.slot = 0; moi.munitions = 0; moi.mats = 0;
  construireBarreObjets();
  const par = m.k ? `par <b>${echapper(nomDe(m.k))}</b>` : (m.a === 'zone' ? 'par la zone' : m.a === 'chute' ? 'par une chute' : '');
  const p = $('#mortPanneau');
  const gain = donnerRecompense(m.place, false);
  p.innerHTML = `<b class="gros">ÉLIMINÉ</b>${par} · Top <b>#${m.place}</b> · ${moi.kills} élimination${moi.kills > 1 ? 's' : ''}
    <div class="gain">${gain}</div>
    <small>${tactile ? 'Touche l\'écran' : 'Clique'} pour changer de joueur à regarder</small><br><button class="petit rouge" id="btnQuitterMort">Retour au menu</button>`;
  p.classList.remove('cache');
  $('#btnQuitterMort').onclick = quitter;
  document.exitPointerLock?.();
  setTimeout(() => changerSpectateur(m.k), 1200);
}

function changerSpectateur(prefere) {
  const moi = etat.moi;
  if (!moi || moi.ph !== 'mort') return;
  const vivants = [...etat.autres.values()].filter(a => a.vivant && a.cible);
  if (!vivants.length) { etat.spectate = null; $('#spectateur').classList.add('cache'); return; }
  let cible = vivants.find(a => a.id === prefere);
  if (!cible && !etat.spectate) cible = vivants.find(a => coequipier(a.id));
  if (!cible) {
    const i = vivants.findIndex(a => a.id === etat.spectate);
    cible = vivants[(i + 1) % vivants.length];
  }
  etat.spectate = cible.id;
  const s = $('#spectateur');
  s.innerHTML = `👁️ Tu regardes <b>${echapper(nomDe(cible.id))}</b>`;
  s.classList.remove('cache');
}

function recevoirFin(m) {
  etat.fini = true;
  const moi = etat.moi;
  const gagnants = Array.isArray(m.gagnants) ? m.gagnants : (m.gagnant ? [m.gagnant] : []);
  const gagne = moi && (m.gagnant === moi.id || gagnants.includes(moi.id) || (moi.equipe && m.equipe === moi.equipe));
  for (const id of gagnants) if (!etat.classement.some(c => c.id === id)) etat.classement.push({ id, place: 1 });
  if (gagne) {
    son('victoire'); annonce('🏆 TOP 1 ! 🏆', 3, '#ffd23f');
    if (moi.ph !== 'mort') moi.emote = 'victoire';
    feuxArtifice(moi.x, moi.y, moi.z);
    for (let i = 0; i < 60; i++) particules.ajouter({ x: moi.x, y: moi.y + 2, z: moi.z, vx: (Math.random() - 0.5) * 10, vy: 4 + Math.random() * 8, vz: (Math.random() - 0.5) * 10, couleur: ['#ffd23f', '#ff5d8f', '#4fd1ff', '#7dff9a'][i % 4], forme: 2, taille: 0.45, tailleFin: 0.2, vie: 2.2, additif: true, gravite: 6 });
  }
  const gainHtml = moi && !moi.recompense ? donnerRecompense(gagne ? 1 : moi.place || etat.vivants, gagne) : (moi && moi.gainHtml) || '';
  setTimeout(() => {
    document.exitPointerLock?.();
    $('#finTitre').innerHTML = gagne ? 'TOP 1 !<span>CHAMPION</span>' : (m.nom ? 'PARTIE<span>TERMINÉE</span>' : 'MATCH<span>NUL</span>');
    const duo = m.equipe && gagnants.length > 1;
    $('#finTexte').innerHTML = gagne ? (duo ? 'Ton équipe est la dernière debout. Bravo ! 🎉' : 'Tu es le dernier debout sur l\'île. Bravo ! 🎉')
      : m.nom ? `<b>${echapper(m.nom)}</b> remporte la partie avec ${m.kills} élimination${m.kills > 1 ? 's' : ''}.` : 'Personne n\'a survécu…';
    const place = gagne ? 1 : (moi ? moi.place || '?' : '?');
    $('#finStats').innerHTML = moi ? `<div><b>#${place}</b>place</div><div><b>${moi.kills}</b>élimination${moi.kills > 1 ? 's' : ''}</div><div><b>${Math.round(moi.degats)}</b>dégâts</div>` : '';
    afficherDetailsFin();
    $('#finPieces').innerHTML = gainHtml;
    $('#finPieces').classList.toggle('cache', !gainHtml);
    if (gagne) confettis();
    $('#btnRejouer').classList.toggle('cache', !reseau.estHote);
    $('#btnRejouer').textContent = reseau.code ? '🔁 Retour au salon' : '🔁 Rejouer tout de suite';
    $('#finAttente').classList.toggle('cache', reseau.estHote);
    $('#fin').classList.remove('cache');
  }, gagne ? 2500 : 1500);
}

// Pièces gagnées (une seule fois par partie)
function donnerRecompense(place, gagne) {
  const moi = etat.moi;
  if (!moi || moi.recompense || moi.spectateurSeulement) return (moi && moi.gainHtml) || '';
  moi.recompense = true;
  const r = recompense({ kills: moi.kills, place, nbJoueurs: etat.infos.size, gagne, degats: moi.degats });
  profil.pieces += r.total;
  const survie = Math.round(etat.temps);
  const st = etat.stats;
  profil.stats.parties++;
  profil.stats.kills += moi.kills;
  profil.stats.tirs += st.tirs; profil.stats.touches += st.touches; profil.stats.temps += survie; profil.stats.degats += Math.round(moi.degats);
  if (gagne) profil.stats.victoires++;
  // défis du jour
  const finis = avancerDefis(profil, { kills: moi.kills, coffres: st.coffres, constr: st.constr, degats: moi.degats, place, survie, emotes: st.emotes, distance: Math.round(st.distance), soins: st.soins, rebonds: st.rebonds, tete: st.tete, parties: 1 });
  const details = r.details.slice();
  for (const d of finis) details.push(['✅ Défi : ' + texteDefi(d), RECOMPENSE_DEFI.pieces]);
  // XP et niveaux
  const xp = xpPartie({ kills: moi.kills, place, nbJoueurs: etat.infos.size, gagne, degats: moi.degats, survie }) + finis.length * RECOMPENSE_DEFI.xp;
  const niveaux = ajouterXP(profil, xp);
  for (const n of niveaux) details.push([`⭐ Niveau ${n.niveau} atteint`, n.pieces]);
  const records = enregistrerPartie(profil, { place, nb: etat.infos.size, kills: moi.kills, degats: moi.degats, survie, gagne, mode: etat.options.mode || 'solo' });
  sauverProfil(profil);
  menus.majPieces();
  if (niveaux.length) { setTimeout(() => { son('niveau'); toast(`⭐ Niveau ${profil.niveau} ! +${niveaux.reduce((a, n) => a + n.pieces, 0)} 🪙`, 4000); }, 900); }
  const total = details.reduce((a, d) => a + d[1], 0);
  const pct = Math.round(profil.xp / xpPourNiveau(profil.niveau) * 100);
  moi.gainHtml = details.map(([t, v], i) => `<div class="ligne" style="animation-delay:${i * 0.12}s"><span>${echapper(t)}</span><span>+${v} 🪙</span></div>`).join('')
    + `<div class="total"><span>Total</span><span>+${total} 🪙</span></div>`
    + `<div class="xp"><span>+${xp} XP · Niveau <b>${profil.niveau}</b></span><div class="barre-xp"><i style="width:${pct}%"></i></div></div>`
    + (records.length ? `<div class="record">🏅 Nouveau record : ${records.map(echapper).join(', ')} !</div>` : '');
  return moi.gainHtml;
}

// Détails de fin : classement complet + statistiques de la partie
function afficherDetailsFin() {
  const moi = etat.moi;
  const st = etat.stats;
  const mmss = s => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`;
  const precision = st.tirs ? Math.round(st.touches / st.tirs * 100) : 0;
  $('#finDetails').innerHTML = moi && !moi.spectateurSeulement ? [
    ['🎯', precision + ' %', 'précision'], ['🔫', st.tirs, 'tirs'], ['🧱', st.constr, 'constructions'],
    ['✨', st.coffres, 'coffres'], ['👟', Math.round(st.distance) + ' m', 'parcourus'], ['⏱️', mmss(moi.tempsSurvie ?? etat.temps), 'de survie'],
  ].map(([i, v, t]) => `<div><span>${i}</span><b>${v}</b>${t}</div>`).join('') : '';
  const lignes = etat.classement.slice().sort((a, b) => a.place - b.place).slice(0, 12);
  $('#finClassement').innerHTML = lignes.length ? `<table>${lignes.map(c => {
    const i = etat.infos.get(c.id) || {};
    return `<tr class="${c.id === reseau.monId ? 'moi' : ''}"><td>#${c.place}</td><td style="color:${echapper(i.couleur || '#fff')}">${echapper(i.nom || '?')}</td><td>${etat.kills.get(c.id) || 0} 💀</td></tr>`;
  }).join('')}</table>` : '';
}

// Feux d'artifice de victoire
function feuxArtifice(x, y, z) {
  const couleurs = ['#ffd23f', '#ff5d8f', '#4fd1ff', '#7dff9a', '#b552ff', '#ff8c1a'];
  for (let k = 0; k < 9; k++) {
    setTimeout(() => {
      const px = x + (Math.random() - 0.5) * 30, py = y + 22 + Math.random() * 14, pz = z + (Math.random() - 0.5) * 30;
      const c = couleurs[k % couleurs.length];
      for (let i = 0; i < 70; i++) {
        const a = Math.random() * 6.28, b = Math.acos(Math.random() * 2 - 1), v = 7 + Math.random() * 3;
        particules.ajouter({ x: px, y: py, z: pz, vx: Math.cos(a) * Math.sin(b) * v, vy: Math.cos(b) * v, vz: Math.sin(a) * Math.sin(b) * v, couleur: i % 5 ? c : '#ffffff', forme: 2, taille: 0.6, tailleFin: 0.1, vie: 1.4, additif: true, gravite: 3, frein: 1.2 });
      }
      sonLoin('explosion', distCam(px, py, pz) * 1.5 + 40);
    }, 300 + k * 380);
  }
}

let banniereT = null;
function banniere(titre, sous) {
  const b = $('#banniere');
  b.innerHTML = `${echapper(titre)}<small>${echapper(sous || '')}</small>`;
  b.classList.add('vue');
  clearTimeout(banniereT);
  banniereT = setTimeout(() => b.classList.remove('vue'), 2200);
}

function indiquerDirection(x, z) {
  const moi = etat.moi;
  // angle de l'attaquant par rapport à l'endroit où l'on regarde (0 = devant)
  const fx = -Math.sin(moi.ry), fz = -Math.cos(moi.ry);
  const dx = x - moi.x, dz = z - moi.z;
  const rel = Math.atan2(fx * dz - fz * dx, fx * dx + fz * dz);
  const d = document.createElement('div');
  d.style.transform = `rotate(${rel}rad)`;
  $('#directions').appendChild(d);
  setTimeout(() => { d.style.opacity = 0; }, 500);
  setTimeout(() => d.remove(), 1200);
}

function explosionElimination(x, y, z, couleur) {
  eclats(x, y + 1, z, couleur || '#ffffff', 16, 6);
  for (let i = 0; i < 26; i++) particules.ajouter({ x, y: y + 1, z, vx: (Math.random() - 0.5) * 7, vy: 1 + Math.random() * 6, vz: (Math.random() - 0.5) * 7, couleur: i % 2 ? couleur || '#ffffff' : '#ffffff', forme: 2, taille: 0.45, tailleFin: 0.05, vie: 1.2, additif: true, gravite: 4 });
}

let confettisActifs = false;
function confettis() {
  const cv = $('#confettis'), g = cv.getContext('2d');
  cv.width = innerWidth; cv.height = innerHeight;
  const bouts = Array.from({ length: 180 }, () => ({ x: Math.random() * innerWidth, y: -Math.random() * innerHeight, vx: (Math.random() - 0.5) * 2, vy: 2 + Math.random() * 3, r: Math.random() * 6, vr: (Math.random() - 0.5) * 0.3, c: ['#ffd23f', '#ff5d8f', '#4fd1ff', '#7dff9a', '#b552ff', '#ff8c1a'][Math.floor(Math.random() * 6)], w: 6 + Math.random() * 6 }));
  confettisActifs = true;
  const etape = () => {
    g.clearRect(0, 0, cv.width, cv.height);
    if (!confettisActifs) return;
    for (const b of bouts) {
      b.x += b.vx; b.y += b.vy; b.r += b.vr;
      if (b.y > innerHeight + 20) { b.y = -20; b.x = Math.random() * innerWidth; }
      g.save(); g.translate(b.x, b.y); g.rotate(b.r); g.fillStyle = b.c; g.fillRect(-b.w / 2, -3, b.w, 6); g.restore();
    }
    requestAnimationFrame(etape);
  };
  etape();
}

function retourSalon() {
  viderJoueursEtButin();
  etat.zone = null; etat.dirigeable = null;
  if (etat.meshZone) etat.meshZone.visible = false;
  if (etat.meshDirigeable) etat.meshDirigeable.visible = false;
  $('#fin').classList.add('cache');
  confettisActifs = false;
  afficherEcran('salon');
}

// ---------- Inventaire ----------
function recevoirObjet(b) {
  const moi = etat.moi;
  if (!moi || moi.ph === 'mort') return;
  const def = OBJETS[b.objet];
  son('ramasser');
  if (def.type === 'munitions') { moi.munitions = Math.min(999, moi.munitions + (b.qte || 30)); annonceObjet(`+${b.qte || 30} munitions`); return; }
  if (def.type === 'materiaux') { moi.mats = Math.min(999, moi.mats + (b.qte || 30)); annonceObjet(`+${b.qte || 30} matériaux`); return; }
  if (def.type === 'conso' || def.type === 'lancer') {
    let qte = b.qte || 1;
    for (let s = 1; s < 6 && qte > 0; s++) {
      const it = moi.inv[s];
      if (it && it.objet === b.objet && it.qte < def.max) { const a = Math.min(def.max - it.qte, qte); it.qte += a; qte -= a; }
    }
    if (qte > 0) {
      const s = moi.inv.indexOf(null, 1);
      if (s > 0) { moi.inv[s] = { objet: b.objet, rarete: b.rarete, qte }; qte = 0; }
    }
    if (qte > 0) reseau.versHote({ t: 'jeter', objets: [{ objet: b.objet, rarete: b.rarete, qte }], x: moi.x, y: moi.y, z: moi.z });
    construireBarreObjets();
    return;
  }
  // Arme
  const nouveau = { objet: b.objet, rarete: b.rarete, mun: b.mun ?? def.chargeur };
  let s = moi.inv.indexOf(null, 1);
  if (s < 0) {
    s = moi.slot > 0 ? moi.slot : 1;
    jeterSlot(s);
  }
  moi.inv[s] = nouveau;
  if (moi.slot === 0 && !moi.construction) choisirSlot(s);
  construireBarreObjets();
}

function jeterSlot(s) {
  const moi = etat.moi;
  const it = moi.inv[s];
  if (!it || s === 0) return;
  const fx = -Math.sin(moi.ry), fz = -Math.cos(moi.ry);
  reseau.versHote({ t: 'jeter', objets: [{ objet: it.objet, rarete: it.rarete, qte: it.qte || 0, mun: it.mun || 0 }], x: moi.x + fx * 1.2, y: moi.y, z: moi.z + fz * 1.2 });
  moi.inv[s] = null;
  if (moi.conso && moi.conso.slot === s) moi.conso = null;
  if (s === moi.slot) moi.rechargeT = 0;
  construireBarreObjets();
}

function choisirSlot(s) {
  const moi = etat.moi;
  if (!moi || moi.ph === 'mort') return;
  if (s === moi.slot && !moi.construction) return;
  moi.slot = s; moi.construction = null; moi.conso = null; moi.rechargeT = 0;
  moi.tirT = Math.max(moi.tirT, 0.15);
  son('clic', 0.6);
  construireBarreObjets();
}

function modeConstruction(type) {
  const moi = etat.moi;
  if (!moi || moi.ph === 'mort') return;
  moi.construction = moi.construction === type ? null : type;
  moi.conso = null; moi.rechargeT = 0;
  son('clic', 0.6);
  construireBarreObjets();
}

// ---------- Contrôles ----------
const LABELS = { KeyW: 'Z', KeyA: 'Q', KeyS: 'S', KeyD: 'D', KeyF: 'F', KeyC: 'C', KeyV: 'V', KeyE: 'E', KeyR: 'R', KeyG: 'G', KeyH: 'H', KeyB: 'B', KeyX: 'X' };
const L = c => LABELS[c] || c;
if (navigator.keyboard && navigator.keyboard.getLayoutMap) {
  navigator.keyboard.getLayoutMap().then(map => {
    for (const k in LABELS) { const v = map.get(k); if (v) LABELS[k] = v.toUpperCase(); }
    remplirAides();
  }).catch(() => {});
}
function aideHTML() {
  if (tactile) return `<h3>📱 Commandes tactiles</h3><table>
  <tr><td>🕹️ Pouce gauche</td><td>Se déplacer (à fond : courir, plonger)</td></tr>
  <tr><td>👆 Glisser à droite</td><td>Regarder autour</td></tr>
  <tr><td>🔫 Gros bouton</td><td>Tirer · frapper · poser · se soigner (glisse dessus pour viser en même temps)</td></tr>
  <tr><td>⤴ 🪂 🪁</td><td>Sauter · sauter du dirigeable · ouvrir le deltaplane</td></tr>
  <tr><td>🎯 🧎 🔄</td><td>Viser · s'accroupir · recharger</td></tr>
  <tr><td>🧱 📐 ⬛</td><td>Construire un mur, une rampe, un sol (10 🪵)</td></tr>
  <tr><td>Barre d'objets</td><td>Touche une case pour prendre l'objet</td></tr>
  <tr><td>👆 « Ramasser »</td><td>Touche le texte pour ramasser ou ouvrir</td></tr>
  <tr><td>⏸️ 🗺️ 🏆 💬 💃 🗑️</td><td>Pause · carte · classement · discussion · émote · jeter</td></tr>
  </table><p>📱 Joue en mode paysage. Si ça rame : Réglages → Qualité basse.</p>`;
  const k = c => `<kbd>${L(c)}</kbd>`;
  return `<h3>🎮 Commandes</h3><table>
  <tr><td>${k('KeyW')}${k('KeyA')}${k('KeyS')}${k('KeyD')}</td><td>Se déplacer</td></tr>
  <tr><td><kbd>Espace</kbd></td><td>Sauter · sauter du dirigeable · ouvrir le deltaplane</td></tr>
  <tr><td><kbd>Maj</kbd></td><td>Courir (et plonger en chute libre)</td></tr>
  <tr><td>🖱️ Clic gauche</td><td>Tirer · frapper · poser · se soigner</td></tr>
  <tr><td>🖱️ Clic droit</td><td>Viser (lunette avec le fusil de précision)</td></tr>
  <tr><td><kbd>1</kbd>…<kbd>6</kbd> / molette</td><td>Changer d'objet (1 = pioche)</td></tr>
  <tr><td>${k('KeyF')} ${k('KeyC')} ${k('KeyV')}</td><td>Construire un <b>mur</b>, une <b>rampe</b>, un <b>sol</b> (10 🪵)</td></tr>
  <tr><td>${k('KeyE')}</td><td>Ramasser · ouvrir un coffre</td></tr>
  <tr><td>${k('KeyR')} · ${k('KeyG')}</td><td>Recharger · jeter l'objet</td></tr>
  <tr><td>${k('KeyB')} · ${k('KeyX')}</td><td>Émote (danse) 💃 · s'accroupir</td></tr>
  <tr><td><kbd>M</kbd></td><td>Grande carte (clique dessus pour poser un repère)</td></tr>
  <tr><td><kbd>Tab</kbd> · <kbd>Entrée</kbd></td><td>Classement · discuter</td></tr>
  <tr><td><kbd>7</kbd> <kbd>8</kbd> <kbd>9</kbd> <kbd>0</kbd></td><td>Messages rapides</td></tr>
  </table><p>🪵 Frappe les arbres et les rochers avec la pioche pour avoir des matériaux.</p>`;
}
function remplirAides() {
  $('#aideMenu').innerHTML = aideHTML();
  $('#aidePause').innerHTML = aideHTML();
  majAideConstr();
}
function majAideConstr() {
  const moi = etat.moi;
  const t = moi ? moi.construction : null;
  $('#aideConstr').innerHTML = `<span class="${t === 'mur' ? 'actif' : ''}">${L('KeyF')} Mur</span><span class="${t === 'rampe' ? 'actif' : ''}">${L('KeyC')} Rampe</span><span class="${t === 'sol' ? 'actif' : ''}">${L('KeyV')} Sol</span>`;
}

const enJeu = () => etat.ecran === 'jeu' && etat.moi;
const verrouille = () => tactile || document.pointerLockElement === canvas;
function verrouiller() {
  if (tactile) { etat.pauseTactile = false; majPause(); return; }
  try {
    const p = canvas.requestPointerLock();
    if (p && p.catch) p.catch(() => {});
  } catch (e) { /* navigateur sans verrouillage de souris */ }
}

addEventListener('keydown', e => {
  if (e.target.tagName === 'INPUT' || e.target.tagName === 'SELECT') return;
  if (!enJeu()) return;
  if (['Space', 'Tab', 'ArrowUp', 'ArrowDown'].includes(e.code)) e.preventDefault();
  if (e.repeat) { touches.add(e.code); return; }
  touches.add(e.code);
  actionTouche(e.code, e);
});
function actionTouche(c, e = { key: '', preventDefault() {} }) {
  const moi = etat.moi;
  if (c.startsWith('Digit') && !MESSAGES_RAPIDES[c]) { const n = +c.slice(5); if (n >= 1 && n <= 6) choisirSlot(n - 1); }
  else if (c === 'KeyF') modeConstruction('mur');
  else if (c === 'KeyC') modeConstruction('rampe');
  else if (c === 'KeyV') modeConstruction('sol');
  else if (c === 'KeyR') recharger();
  else if (c === 'KeyE') interagir();
  else if (c === 'KeyG') { if (moi.ph === 'sol') jeterSlot(moi.slot); }
  else if (c === 'KeyM' || c === 'Semicolon' || e.key === 'm' || e.key === 'M') {
    etat.grandeCarte = !etat.grandeCarte;
    $('#grandeCarte').classList.toggle('cache', !etat.grandeCarte);
    // souris libre pour poser un repère
    if (etat.grandeCarte) document.exitPointerLock?.(); else verrouiller();
    majPause();
  }
  else if (c === 'KeyH') { if (verrouille()) document.exitPointerLock(); }
  else if (c === 'KeyX') { if (moi.ph === 'sol' && moi.auSol) { moi.accroupi = !moi.accroupi; son('clic', 0.4); } }
  else if (c === 'Tab') { etat.tableau = true; majTableau(); $('#tableau').classList.remove('cache'); }
  else if (c === 'Enter' || c === 'KeyT') { e.preventDefault(); ouvrirChat(); }
  else if (MESSAGES_RAPIDES[c]) envoyerChat(MESSAGES_RAPIDES[c], true);
  else if (c === 'KeyB') {
    if (moi.emote) moi.emote = null;
    else if (moi.ph === 'sol' && moi.auSol) { moi.emote = profil.equipe.emote; moi.construction = null; moi.conso = null; moi.accroupi = false; etat.orbite = 0; etat.stats.emotes++; construireBarreObjets(); }
  }
  else if (c === 'Space') {
    if (moi.ph === 'dirigeable') sauterDuDirigeable();
    else if (moi.ph === 'chute' && moi.y - etat.monde.hauteurTerrain(moi.x, moi.z) > 6) { moi.ph = 'planeur'; son('saut', 0.5); }
  }
}
addEventListener('keyup', e => {
  touches.delete(e.code);
  if (e.code === 'Tab') { etat.tableau = false; $('#tableau').classList.add('cache'); }
});
const MESSAGES_RAPIDES = { Digit7: '👍 OK !', Digit8: '🆘 À l\'aide !', Digit9: '⚠️ Ennemi par ici !', Digit0: '😄 Bien joué !' };
addEventListener('blur', () => { touches.clear(); tirAppuye = false; viseeAppuye = false; });

canvas.addEventListener('mousedown', e => {
  if (!enJeu()) return;
  initSons();
  const moi = etat.moi;
  if (moi.ph === 'mort') { if (e.button === 0) changerSpectateur(); return; }
  if (!verrouille()) { verrouiller(); return; }
  if (e.button === 0) { tirAppuye = true; moi.emote = null; }
  if (e.button === 2) { viseeAppuye = true; moi.emote = null; }
});
addEventListener('mouseup', e => { if (e.button === 0) tirAppuye = false; if (e.button === 2) viseeAppuye = false; });
canvas.addEventListener('contextmenu', e => e.preventDefault());
addEventListener('mousemove', e => {
  if (!enJeu() || tactile || !verrouille()) return;
  tourner(e.movementX, e.movementY, 0.0022 * reglages.sensi);
});
// Tourner la vue (souris ou doigt)
function tourner(dx, dy, kBase) {
  const moi = etat.moi;
  const zoom = moi.visee ? reglages.sensiVisee * (camera.fov < 30 ? 0.35 : 1) : 1;
  const k = kBase * zoom;
  if (moi.emote) { etat.orbite = (etat.orbite || 0) - dx * k; return; }
  moi.ry -= dx * k;
  moi.rx = borner(moi.rx - dy * k * (reglages.inverserY ? -1 : 1), -1.45, 1.45);
}
addEventListener('wheel', e => {
  if (!enJeu() || !verrouille()) return;
  const moi = etat.moi;
  if (moi.construction) {
    const t = ['mur', 'rampe', 'sol'];
    moi.construction = t[(t.indexOf(moi.construction) + (e.deltaY > 0 ? 1 : 2)) % 3];
    majAideConstr();
    return;
  }
  choisirSlot((moi.slot + (e.deltaY > 0 ? 1 : 5)) % 6);
}, { passive: true });
document.addEventListener('pointerlockchange', () => {
  if (!verrouille()) { tirAppuye = false; viseeAppuye = false; touches.clear(); }
  majPause();
});
function majPause() {
  const enPause = tactile ? !!etat.pauseTactile : !verrouille();
  const montrer = etat.ecran === 'jeu' && etat.moi && etat.moi.ph !== 'mort' && !etat.fini && enPause && !etat.grandeCarte && !chatOuvert();
  $('#pause').classList.toggle('cache', !montrer);
}

// ---------- Actions ----------
function sauterDuDirigeable() {
  const moi = etat.moi;
  if (moi.ph !== 'dirigeable') return;
  const p = posDirigeable(etat.dirigeable, etat.temps);
  moi.ph = 'chute';
  moi.x = p.x; moi.y = p.y - 9; moi.z = p.z;
  moi.vx = p.vx * 0.3; moi.vz = p.vz * 0.3; moi.vy = 0;
  moi.sautT = 0;
  son('saut');
  arreterMusique();
}

function recharger() {
  const moi = etat.moi;
  const it = moi.inv[moi.slot];
  if (!it || moi.ph === 'mort' || moi.construction) return;
  const def = OBJETS[it.objet];
  if (def.type !== 'arme' || moi.rechargeT > 0 || it.mun >= def.chargeur) return;
  if (moi.munitions <= 0) { annonceObjet('Plus de munitions !'); son('vide'); return; }
  moi.rechargeT = def.recharge;
  moi.rechargeTotal = def.recharge;
  son('recharge', 0.7);
}

function interagir() {
  const moi = etat.moi;
  if (moi.ph !== 'sol') return;
  const it = etat.interaction;
  if (!it) return;
  if (it.type === 'coffre') { etat.mesCoffres.add('c' + it.c.id); reseau.versHote({ t: 'ouvrir', id: it.c.id }); }
  else if (it.type === 'ravito') { etat.mesCoffres.add('r' + it.r.id); reseau.versHote({ t: 'ouvrirRavito', id: it.r.id }); }
  else if (it.type === 'butin') {
    const b = it.b;
    const def = OBJETS[b.objet];
    if (def.type === 'arme' && moi.inv.indexOf(null, 1) < 0 && moi.slot === 0) {
      annonceObjet('Inventaire plein : prends l\'objet à remplacer (2 à 6) puis E');
      return;
    }
    if ((def.type === 'conso' || def.type === 'lancer') && moi.inv.indexOf(null, 1) < 0 && !moi.inv.some(x => x && x.objet === b.objet && x.qte < def.max)) {
      annonceObjet('Inventaire plein');
      return;
    }
    reseau.versHote({ t: 'ramasser', id: b.id });
  }
}

const vTmp = new THREE.Vector3(), vTmp2 = new THREE.Vector3();
function directionVisee() {
  return new THREE.Vector3(0, 0, -1).applyQuaternion(camera.quaternion);
}
function boutDuCanon() {
  const moi = etat.moi;
  const u = moi.modele.userData;
  u.mainArme.getWorldPosition(vTmp2);
  const fx = -Math.sin(moi.ry) * Math.cos(moi.rx), fy = Math.sin(moi.rx), fz = -Math.cos(moi.ry) * Math.cos(moi.rx);
  return [vTmp2.x + fx * 0.7, vTmp2.y + fy * 0.7, vTmp2.z + fz * 0.7];
}

function dispersionActuelle(def) {
  const moi = etat.moi;
  let d = moi.visee ? def.dispVisee : def.disp;
  const v = Math.hypot(moi.vx, moi.vz);
  if (v > 1) d += 0.015;
  if (!moi.auSol) d += 0.03;
  if (moi.accroupi && moi.auSol) d *= 0.6;
  return d;
}

// Lance un rayon depuis la caméra : renvoie le point touché + qui/quoi
function rayonVisee(dir, portee, departDevant = true) {
  const moi = etat.moi;
  const o = camera.position;
  let t0 = 0;
  if (departDevant) {
    t0 = Math.max(0, (moi.x - o.x) * dir.x + (moi.y + 1.5 - o.y) * dir.y + (moi.z - o.z) * dir.z);
  }
  const ox = o.x + dir.x * t0, oy = o.y + dir.y * t0, oz = o.z + dir.z * t0;
  const h = etat.monde.lancerRayon(ox, oy, oz, dir.x, dir.y, dir.z, portee);
  let best = h ? h.t : portee, cible = null, tete = false;
  const ix = 1 / (dir.x || 1e-9), iy = 1 / (dir.y || 1e-9), iz = 1 / (dir.z || 1e-9);
  for (const a of etat.autres.values()) {
    if (!a.vivant || !a.cible || a.cible.ph === 'dirigeable' || coequipier(a.id)) continue;
    const hc = (a.cible.f & 16) ? 1.15 : 1.6;
    const corps = { minX: a.x - 0.45, maxX: a.x + 0.45, minY: a.y, maxY: a.y + hc, minZ: a.z - 0.45, maxZ: a.z + 0.45 };
    const tt = { minX: a.x - 0.3, maxX: a.x + 0.3, minY: a.y + hc, maxY: a.y + hc + 0.55, minZ: a.z - 0.3, maxZ: a.z + 0.3 };
    const tc = rayonBoite(corps, ox, oy, oz, ix, iy, iz), th = rayonBoite(tt, ox, oy, oz, ix, iy, iz);
    if (th !== null && th < best) { best = th; cible = a; tete = true; }
    if (tc !== null && tc < best) { best = tc; cible = a; tete = false; }
  }
  return { x: ox + dir.x * best, y: oy + dir.y * best, z: oz + dir.z * best, dist: best + t0, distRayon: best, cible, tete, monde: cible ? null : h };
}

function essayerAction(dt) {
  const moi = etat.moi;
  if (moi.ph !== 'sol') return;
  if (moi.construction) { if (tirAppuye) poserConstruction(); return; }
  const it = moi.inv[moi.slot];
  if (!it) return;
  const def = OBJETS[it.objet];
  if (def.type === 'conso') {
    if (tirAppuye && !moi.conso) commencerConso();
    return;
  }
  if (def.type === 'lancer') { if (tirAppuye && moi.tirT <= 0) lancerGrenade(it); return; }
  if (!tirAppuye || moi.tirT > 0) return;
  if (def.type === 'melee') { coupPioche(); return; }
  if (def.type !== 'arme') return;
  if (moi.rechargeT > 0) return;
  if (it.mun <= 0) {
    if (moi.munitions > 0) recharger(); else { son('vide'); moi.tirT = 0.35; annonceObjet('Plus de munitions !'); }
    return;
  }
  moi.tirT = 1 / def.cadence;
  it.mun--;
  etat.stats.tirs++;
  const canon = boutDuCanon();
  if (def.explosif) { tirerRoquette(it, def, canon); return; }
  const disp = dispersionActuelle(def);
  const base = directionVisee();
  let fin = null, touche = false, toucheTete = false;
  for (let p = 0; p < (def.plombs || 1); p++) {
    const d = base.clone();
    if (disp > 0) {
      d.x += (Math.random() - 0.5) * 2 * disp; d.y += (Math.random() - 0.5) * 2 * disp; d.z += (Math.random() - 0.5) * 2 * disp;
      d.normalize();
    }
    const r = rayonVisee(d, def.portee);
    if (!fin) fin = [arrondi(r.x), arrondi(r.y), arrondi(r.z)];
    trace(canon, [r.x, r.y, r.z]);
    if (r.cible) {
      let deg = def.degats * RARETES[it.rarete || 0].mult;
      if (def.plombs) deg *= borner(1 - (r.dist - 7) / 35, 0.25, 1);
      if (r.tete) deg *= def.multTete || 1.8;
      reseau.versHote({ t: 'touche', cible: r.cible.id, deg: Math.round(deg), tete: r.tete, arme: it.objet });
      eclats(r.x, r.y, r.z, '#ff4d4d', 3, 3);
      touche = true; toucheTete = toucheTete || r.tete;
    } else if (r.monde) {
      const b = r.monde.boite;
      if (b && b.type === 'constr') reseau.versHote({ t: 'degatsConstr', cle: b.cle, deg: def.degats * (def.plombs ? 0.6 : 1) });
      else if (b && r.monde.type !== 'terrain' && b.type !== 'arbre' && b.type !== 'rocher' && !b.rampe && (p === 0 || Math.random() < 0.3)) impact(r.x, r.y, r.z);
      eclats(r.x, r.y, r.z, r.monde.type === 'terrain' ? '#6d8f4a' : b && b.type === 'arbre' ? '#7a4e2a' : '#c9c2b0', 2, 2.5);
    }
  }
  flash(canon[0], canon[1], canon[2]);
  eclairer(canon[0], canon[1], canon[2], 6, 10);
  douille(canon[0] - Math.sin(moi.ry) * -0.5, canon[1], canon[2] - Math.cos(moi.ry) * -0.5, moi.ry);
  moi.modele.userData.recul = 1;
  etat.secousse = Math.max(etat.secousse, it.objet === 'sniper' ? 0.35 : it.objet === 'pompe' ? 0.3 : 0.07);
  son(def.son);
  if (touche) { marqueur(toucheTete); son(toucheTete ? 'tete' : 'touche', 0.8); etat.stats.touches++; if (toucheTete) etat.stats.tete++; }
  reseau.versHote({ t: 'tir', o: canon.map(arrondi), d: fin, a: it.objet });
  moi.rx = Math.min(1.45, moi.rx + (it.objet === 'sniper' ? 0.05 : it.objet === 'pompe' ? 0.04 : 0.008 + Math.random() * 0.008));
  if (it.mun === 0 && moi.munitions > 0) setTimeout(() => { if (etat.moi && etat.moi.inv[etat.moi.slot] === it) recharger(); }, 250);
}

function coupPioche() {
  const moi = etat.moi;
  moi.tirT = 1 / OBJETS.pioche.cadence;
  moi.modele.userData.coup = 1;
  moi.coup = 0.25;
  son('pioche', 0.6);
  const r = rayonVisee(directionVisee(), 3.6);
  if (r.distRayon >= 3.59) return;
  if (r.cible) {
    reseau.versHote({ t: 'touche', cible: r.cible.id, deg: OBJETS.pioche.degats, tete: false, arme: 'pioche' });
    marqueur(false); son('touche');
    return;
  }
  const h = r.monde;
  if (!h) return;
  const b = h.boite;
  if (b && b.type === 'arbre') {
    reseau.versHote({ t: 'recolte', type: 'arbre', id: b.id, deg: 25 });
    moi.mats = Math.min(999, moi.mats + 6);
    eclats(r.x, r.y, r.z, '#8a5a2b', 5, 4); son('bois');
    annonceObjet('+6 🪵');
  } else if (b && b.type === 'rocher') {
    reseau.versHote({ t: 'recolte', type: 'rocher', id: b.id, deg: 25 });
    moi.mats = Math.min(999, moi.mats + 8);
    eclats(r.x, r.y, r.z, '#9a9ea6', 5, 4); son('pierre');
    annonceObjet('+8 🪵');
  } else if (b && b.type === 'constr') {
    reseau.versHote({ t: 'degatsConstr', cle: b.cle, deg: 50 });
    eclats(r.x, r.y, r.z, '#c8955a', 5, 4); son('bois');
  } else {
    eclats(r.x, r.y, r.z, '#bbbbbb', 3, 3); son('pierre', 0.5);
  }
}

// Roquette : elle vole jusqu'à ce qu'elle touche quelque chose, puis explose
function tirerRoquette(it, def, canon) {
  const moi = etat.moi;
  const dir = directionVisee();
  const disp = dispersionActuelle(def);
  dir.x += (Math.random() - 0.5) * 2 * disp; dir.y += (Math.random() - 0.5) * 2 * disp; dir.z += (Math.random() - 0.5) * 2 * disp; dir.normalize();
  const r = rayonVisee(dir, def.portee);
  const fin = [r.x, r.y, r.z];
  const dist = Math.hypot(fin[0] - canon[0], fin[1] - canon[1], fin[2] - canon[2]);
  const p = { type: 'roquette', o: canon.map(arrondi), v: fin.map(arrondi), duree: arrondi(Math.max(0.05, dist / def.vitesse)) };
  reseau.versHote({ t: 'projectile', ...p });
  lancerProjectile({ ...p, mien: true, par: reseau.monId });
  flash(canon[0], canon[1], canon[2], 1.4);
  eclairer(canon[0], canon[1], canon[2], 10, 12);
  son('roquette');
  moi.modele.userData.recul = 1.4;
  etat.secousse = Math.max(etat.secousse, 0.3);
  moi.rx = Math.min(1.45, moi.rx + 0.05);
  for (let i = 0; i < 8; i++) particules.ajouter({ x: canon[0], y: canon[1], z: canon[2], vx: (Math.random() - 0.5) * 2, vy: Math.random(), vz: (Math.random() - 0.5) * 2, couleur: '#d6d6d6', taille: 0.6, tailleFin: 1.8, vie: 0.8, alpha: 0.5, frein: 2 });
  if (it.mun === 0 && moi.munitions > 0) setTimeout(() => { if (etat.moi && etat.moi.inv[etat.moi.slot] === it) recharger(); }, 250);
}

// Grenade : lancée en cloche, elle rebondit puis explose
function lancerGrenade(it) {
  const moi = etat.moi;
  const dir = directionVisee();
  const o = [moi.x - Math.sin(moi.ry) * 0.5, moi.y + 1.75, moi.z - Math.cos(moi.ry) * 0.5];
  const v = [dir.x * 19 + moi.vx * 0.5, dir.y * 19 + 4.5, dir.z * 19 + moi.vz * 0.5];
  const p = { type: 'grenade', o: o.map(arrondi), v: v.map(arrondi), duree: OBJETS.grenade.delai };
  reseau.versHote({ t: 'projectile', ...p });
  lancerProjectile({ ...p, mien: true, par: reseau.monId });
  moi.tirT = 0.8; moi.coup = 0.25; moi.modele.userData.coup = 1;
  son('lancer');
  etat.stats.tirs++;
  it.qte--;
  if (it.qte <= 0) moi.inv[moi.slot] = null;
  construireBarreObjets();
}

function commencerConso() {
  const moi = etat.moi;
  const it = moi.inv[moi.slot];
  const def = OBJETS[it.objet];
  const plafond = def.plafond || 100;
  if (def.pv && moi.pv >= plafond) { annonceObjet(def.plafond ? `${def.nom} : soigne jusqu'à ${plafond} PV seulement` : 'Ta vie est déjà au maximum'); moi.tirT = 0.5; return; }
  if (def.bouclier && moi.bouclier >= plafond) { annonceObjet(def.plafond ? `${def.nom} : bouclier jusqu'à ${plafond} seulement` : 'Ton bouclier est déjà au maximum'); moi.tirT = 0.5; return; }
  moi.conso = { slot: moi.slot, t: 0, duree: def.duree };
  son('soin', 0.5);
}

function finirConso() {
  const moi = etat.moi;
  const it = moi.inv[moi.conso.slot];
  moi.conso = null;
  if (!it) return;
  const def = OBJETS[it.objet];
  reseau.versHote({ t: 'soin', pv: def.pv || 0, b: def.bouclier || 0, plafond: def.plafond || 100 });
  etat.stats.soins++;
  son('ramasser');
  it.qte--;
  if (it.qte <= 0) { moi.inv[moi.slot] = null; }
  construireBarreObjets();
}

// ---------- Constructions ----------
let fantome = null, cleFantome = null, fantomeValide = false, cibleConstr = null;
function majFantome() {
  const moi = etat.moi;
  const monde = etat.monde;
  if (!moi.construction || moi.ph !== 'sol') { if (fantome) fantome.visible = false; cibleConstr = null; return; }
  const c = cibleConstruction(monde, moi.construction, moi.x, moi.y, moi.z, moi.ry, moi.rx);
  const valide = !monde.constructions.has(c.cle) && !etat.enAttente.has(c.cle) && moi.mats >= COUT_CONSTR;
  const cle = c.cle + (valide ? '+' : '-');
  if (cle !== cleFantome) {
    if (fantome) scene.remove(fantome);
    monde.initMateriauxConstruction();
    fantome = monde.meshConstruction(c, valide ? monde.matFantome : monde.matFantomeRouge);
    fantome.renderOrder = 5;
    scene.add(fantome);
    cleFantome = cle;
  }
  fantome.visible = true;
  fantomeValide = valide;
  cibleConstr = c;
}
function poserConstruction() {
  const moi = etat.moi;
  if (!cibleConstr || moi.construitT > 0) return;
  if (!fantomeValide) {
    if (moi.mats < COUT_CONSTR && !moi.alerteMats) { annonceObjet('Pas assez de matériaux : frappe des arbres avec la pioche !'); moi.alerteMats = 1.5; }
    return;
  }
  moi.mats -= COUT_CONSTR;
  moi.construitT = 0.07;
  etat.enAttente.set(cibleConstr.cle, true);
  reseau.versHote({ t: 'construire', ...cibleConstr });
  son('construire');
  cleFantome = null;
}

// ---------- Mise à jour du joueur local ----------
function majMoi(dt) {
  const moi = etat.moi;
  const monde = etat.monde;
  moi.tirT = Math.max(0, moi.tirT - dt);
  moi.coup = Math.max(0, moi.coup - dt);
  moi.construitT = Math.max(0, moi.construitT - dt);
  if (moi.alerteMats) moi.alerteMats = Math.max(0, moi.alerteMats - dt);
  const it = moi.inv[moi.slot];
  moi.visee = viseeAppuye && moi.ph === 'sol' && !moi.construction && it && OBJETS[it.objet].type === 'arme';

  if (moi.rechargeT > 0) {
    moi.rechargeT -= dt;
    if (moi.rechargeT <= 0) {
      moi.rechargeT = 0;
      if (it && OBJETS[it.objet].type === 'arme') {
        const def = OBJETS[it.objet];
        const pris = Math.min(def.chargeur - it.mun, moi.munitions);
        it.mun += pris; moi.munitions -= pris;
      }
    }
  }
  if (moi.conso) {
    if (moi.slot !== moi.conso.slot || !moi.inv[moi.slot]) moi.conso = null;
    else { moi.conso.t += dt; if (moi.conso.t >= moi.conso.duree) finirConso(); }
  }

  // Direction voulue avec le clavier
  let av = 0, cote = 0;
  if (touches.has('KeyW') || touches.has('ArrowUp')) av += 1;
  if (touches.has('KeyS') || touches.has('ArrowDown')) av -= 1;
  if (touches.has('KeyA') || touches.has('ArrowLeft')) cote -= 1;
  if (touches.has('KeyD') || touches.has('ArrowRight')) cote += 1;
  if (joy.actif && joy.force > 0) { av -= joy.y; cote += joy.x; }
  const fx = -Math.sin(moi.ry), fz = -Math.cos(moi.ry);
  const rx = Math.cos(moi.ry), rz = -Math.sin(moi.ry);
  let dx = fx * av + rx * cote, dz = fz * av + rz * cote;
  const n = Math.hypot(dx, dz); if (n > 0) { dx /= n; dz /= n; }
  const sprint = sprintActif();
  if (moi.emote && (n > 0 || touches.has('Space') || moi.ph !== 'sol')) moi.emote = null;
  const phAvant = moi.ph;

  switch (moi.ph) {
    case 'dirigeable': {
      const p = posDirigeable(etat.dirigeable, etat.temps);
      moi.x = p.x; moi.y = p.y - 9; moi.z = p.z;
      if (etat.temps >= etat.dirigeable.duree) sauterDuDirigeable();
      break;
    }
    case 'chute': {
      moi.sautT += dt;
      moi.vx += (dx * 17 - moi.vx) * Math.min(1, dt * 2.5);
      moi.vz += (dz * 17 - moi.vz) * Math.min(1, dt * 2.5);
      moi.vy = Math.max(moi.vy - 30 * dt, sprint ? -58 : -38);
      monde.deplacer(moi, dt);
      if (moi.y - monde.hauteurTerrain(moi.x, moi.z) < 42) { moi.ph = 'planeur'; son('saut', 0.5); }
      if (moi.auSol) moi.ph = 'sol';
      break;
    }
    case 'planeur': {
      moi.vx += (dx * 13 - moi.vx) * Math.min(1, dt * 2);
      moi.vz += (dz * 13 - moi.vz) * Math.min(1, dt * 2);
      moi.vy = sprint ? -12 : -7;
      monde.deplacer(moi, dt);
      if (moi.auSol) { moi.ph = 'sol'; moi.vx *= 0.3; moi.vz *= 0.3; }
      break;
    }
    case 'sol': {
      let vit = 6.8;
      if (sprint && av > 0 && !moi.visee) { vit = 9.2; moi.accroupi = false; }
      if (moi.accroupi) vit = 3.8;
      if (moi.visee) vit = Math.min(vit, 4.4);
      if (moi.conso) vit = 3.2;
      if (moi.dansEau) vit *= 0.55;
      const k = moi.auSol ? Math.min(1, dt * 14) : Math.min(1, dt * 3);
      moi.vx += (dx * vit - moi.vx) * k;
      moi.vz += (dz * vit - moi.vz) * k;
      if (touches.has('Space') && moi.auSol) { moi.vy = 9.2; moi.auSol = false; moi.accroupi = false; }
      const etaitEnLair = !moi.auSol, vyAvant = moi.vy;
      moi.vy -= 25 * dt;
      monde.deplacer(moi, dt);
      if (etaitEnLair && moi.auSol) {
        if (vyAvant < -9) poussiere(moi.x, moi.y, moi.z, 8);
        // dégâts de chute (sauf après un champignon)
        if (vyAvant < -17 && !moi.sansChute && !moi.dansEau && !etat.options.entrainement) { reseau.versHote({ t: 'chute', deg: Math.round((-vyAvant - 17) * 5) }); son('chute'); etat.secousse = Math.max(etat.secousse, 0.4); }
        moi.sansChute = false;
      }
      // champignons rebondissants
      for (const t of monde.trampolines || []) {
        if (Math.abs(moi.x - t.x) > 1.3 || Math.abs(moi.z - t.z) > 1.3) continue;
        if (Math.hypot(moi.x - t.x, moi.z - t.z) < 1.25 && moi.y < t.y + 1.25 && moi.y > t.y - 0.6 && moi.vy <= 0.5) {
          moi.vy = 24; moi.auSol = false; moi.y = t.y + 1.26; moi.sansChute = true; moi.accroupi = false; moi.emote = null; t.anim = 1;
          son('rebond'); etat.stats.rebonds++;
          for (let i = 0; i < 16; i++) particules.ajouter({ x: t.x, y: t.y + 1.2, z: t.z, vx: (Math.random() - 0.5) * 5, vy: Math.random() * 3, vz: (Math.random() - 0.5) * 5, couleur: i % 2 ? '#e7a6ff' : '#fff2a8', forme: 2, taille: 0.35, tailleFin: 0.05, vie: 0.8, additif: true, gravite: 4 });
          if (!etat.rebondDit) { etat.rebondDit = true; annonceObjet(tactile ? '⤴ en l\'air pour ouvrir le deltaplane !' : 'Espace en l\'air pour ouvrir le deltaplane !'); }
        }
      }
      // deltaplane après un rebond
      if (moi.sansChute && !moi.auSol && moi.vy < 0 && touches.has('Space') && moi.y - monde.hauteurTerrain(moi.x, moi.z) > 5) { moi.ph = 'planeur'; son('saut', 0.5); }
      // bruits de pas
      const vh = Math.hypot(moi.vx, moi.vz);
      if (moi.auSol) etat.stats.distance += vh * dt;
      moi.pasSonT = (moi.pasSonT || 0) - dt;
      if (moi.auSol && vh > 2 && moi.pasSonT <= 0) { moi.pasSonT = moi.accroupi ? 0.55 : vh > 8 ? 0.27 : 0.36; son(surfacePas(moi), moi.accroupi ? 0.3 : 0.75); }
      moi.pasT = (moi.pasT || 0) - dt;
      if (moi.auSol && Math.hypot(moi.vx, moi.vz) > 8 && moi.pasT <= 0) { moi.pasT = 0.14; poussiere(moi.x, moi.y, moi.z, 1); }
      if (moi.dansEau && Math.hypot(moi.vx, moi.vz) > 1 && moi.pasT <= 0) { moi.pasT = 0.12; particules.ajouter({ x: moi.x, y: 0.1, z: moi.z, vx: (Math.random() - 0.5) * 2, vy: 2, vz: (Math.random() - 0.5) * 2, couleur: '#e8fbff', taille: 0.3, tailleFin: 0.1, vie: 0.5, gravite: 8 }); }
      if (!moi.emote) essayerAction(dt);
      majFantome();
      chercherInteraction();
      break;
    }
  }
  if (moi.ph !== 'sol' && fantome) fantome.visible = false;
  if (phAvant !== 'sol' && moi.ph === 'sol') { poussiere(moi.x, moi.y, moi.z, 14); son('saut', 0.3); moi.sansChute = false; }
  if (moi.ph === 'chute' || moi.ph === 'planeur') trainee(moi, moi.look.trainee, dt);
  // vent pendant la chute (son + petites lignes qui défilent)
  const kVent = moi.ph === 'chute' ? (sprint ? 1 : 0.65) : moi.ph === 'planeur' ? 0.3 : 0;
  if (Math.abs(kVent - (etat.vent ?? -1)) > 0.01) { etat.vent = kVent; reglerVent(kVent); }
  if (moi.ph === 'chute') for (let i = 0; i < 3; i++) particules.ajouter({ x: moi.x + (Math.random() - 0.5) * 14, y: moi.y - 5 - Math.random() * 10, z: moi.z + (Math.random() - 0.5) * 14, couleur: '#ffffff', taille: 0.13, tailleFin: 0.05, vie: 0.35, alpha: 0.55 });

  // Modèle 3D
  const m = moi.modele;
  m.position.set(moi.x, moi.y, moi.z);
  m.rotation.y = moi.ry;
  m.visible = moi.ph !== 'dirigeable' && moi.ph !== 'mort' && !(moi.visee && it && it.objet === 'sniper');
  const objet = moi.construction ? null : it ? it.objet : null;
  tenirObjet(m, objet, it ? it.rarete : 0);
  animerPersonnage(m, dt, {
    vitesse: Math.hypot(moi.vx, moi.vz), auSol: moi.auSol, planeur: moi.ph === 'planeur', chute: moi.ph === 'chute',
    arme: objet, pitch: moi.rx, emote: moi.emote, accroupi: moi.accroupi,
  });
}

// Bruit de pas selon le sol sous les pieds
function surfacePas(e) {
  if (e.dansEau || e.y < -0.3) return 'pasEau';
  const m = etat.monde, h = m.hauteurTerrain(e.x, e.z);
  if (e.y > h + 0.3) return 'pasBois';
  if (h < 2.2) return 'pasSable';
  const b = m.biome(e.x, e.z);
  return b === 'desert' ? 'pasSable' : b === 'neige' ? 'pasNeige' : 'pasHerbe';
}

// Petit nuage de poussière (atterrissage, course)
function poussiere(x, y, z, n) {
  for (let i = 0; i < n; i++) {
    const a = Math.random() * Math.PI * 2, v = 1 + Math.random() * 2;
    particules.ajouter({ x: x + Math.cos(a) * 0.3, y: y + 0.1, z: z + Math.sin(a) * 0.3, vx: Math.cos(a) * v, vy: 0.4 + Math.random() * 0.6, vz: Math.sin(a) * v, couleur: y < 1.1 ? '#f3e3b8' : '#d8cdb4', taille: 0.5, tailleFin: 1.4, vie: 0.7, alpha: 0.5, frein: 3 });
  }
}

// Traînée de la boutique pendant la chute
const COULEURS_TRAINEE = {
  fumee: ['#ffffff', '#e1e8f0'], etincelles: ['#ffd23f', '#ffae1f', '#fff3b0'], coeurs: ['#ff5d8f', '#ff8fb1'],
  etoiles: ['#ffe27a', '#ffffff', '#9fe0ff'], arcenciel: ['#ff4d4d', '#ff9a1f', '#ffe14d', '#4fe06f', '#4aa8ff', '#b552ff'], neon2k27: ['#22e8ff', '#ff2e88', '#b026ff'],
};
function trainee(e, type, dt) {
  const cs = COULEURS_TRAINEE[type];
  if (!cs) return;
  e.traineeT = (e.traineeT || 0) - dt;
  if (e.traineeT > 0) return;
  e.traineeT = type === 'arcenciel' ? 0.015 : 0.035;
  const forme = { fumee: 0, etincelles: 3, coeurs: 1, etoiles: 2, arcenciel: 0, neon2k27: 3 }[type];
  const n = type === 'arcenciel' ? 1 : 2;
  for (let i = 0; i < n; i++) {
    e.traineeIdx = ((e.traineeIdx || 0) + 1) % cs.length;
    particules.ajouter({
      x: e.x + (Math.random() - 0.5) * 0.6, y: e.y + 1 + (Math.random() - 0.5) * 0.6, z: e.z + (Math.random() - 0.5) * 0.6,
      vx: (Math.random() - 0.5) * 0.6, vy: 0.5, vz: (Math.random() - 0.5) * 0.6,
      couleur: cs[type === 'arcenciel' ? e.traineeIdx : Math.floor(Math.random() * cs.length)], forme,
      taille: type === 'fumee' ? 0.8 : type === 'arcenciel' ? 0.9 : 0.5, tailleFin: type === 'fumee' ? 2 : 0.1,
      vie: type === 'arcenciel' ? 1.6 : 1.1, additif: type !== 'fumee', alpha: type === 'fumee' ? 0.6 : 1,
    });
  }
}

function chercherInteraction() {
  const moi = etat.moi;
  let best = null, bd = 2.7;
  for (const b of etat.butins.values()) {
    const d = Math.hypot(b.x - moi.x, b.y - moi.y - 0.3, b.z - moi.z);
    const def = OBJETS[b.objet];
    if ((def.type === 'munitions' || def.type === 'materiaux') && d < 1.8) {
      if (!b.demande || performance.now() - b.demande > 1500) { b.demande = performance.now(); reseau.versHote({ t: 'ramasser', id: b.id }); }
      continue;
    }
    if (d < bd) { bd = d; best = { type: 'butin', b }; }
  }
  for (const c of etat.monde.coffres) {
    if (c.ouvert) continue;
    const d = Math.hypot(c.x - moi.x, c.y - moi.y, c.z - moi.z);
    if (d < 2.8 && d < bd + 0.4) { bd = d; best = { type: 'coffre', c }; }
  }
  for (const r of etat.ravitos.values()) {
    if (r.ouvert || !r.pose) continue;
    const d = Math.hypot(r.x - moi.x, r.sol - moi.y, r.z - moi.z);
    if (d < 3.2 && d < bd + 0.6) { bd = d; best = { type: 'ravito', r }; }
  }
  etat.interaction = best;
}

// ---------- Les autres joueurs ----------
function majAutres(dt) {
  const k = Math.min(1, dt * 12);
  for (const a of etat.autres.values()) {
    if (!a.vivant || !a.cible) { a.modele.visible = false; continue; }
    const c = a.cible;
    const ox = a.x, oz = a.z;
    if (Math.hypot(c.x - a.x, c.y - a.y, c.z - a.z) > 12) { a.x = c.x; a.y = c.y; a.z = c.z; }
    else { a.x += (c.x - a.x) * k; a.y += (c.y - a.y) * k; a.z += (c.z - a.z) * k; }
    a.ry = angleVers(a.ry, c.ry, k);
    a.rx += (c.rx - a.rx) * k;
    const v = Math.hypot(a.x - ox, a.z - oz) / Math.max(dt, 0.001);
    a.vitesse = a.vitesse * 0.85 + v * 0.15;
    const m = a.modele;
    m.visible = c.ph !== 'dirigeable';
    m.position.set(a.x, a.y, a.z);
    m.rotation.y = a.ry;
    const [obj, rar] = String(c.a || '').split(':');
    tenirObjet(m, obj || null, +rar || 0);
    if ((c.f & 4) && !(a.f & 4)) m.userData.coup = 1;
    a.f = c.f;
    animerPersonnage(m, dt, { vitesse: a.vitesse, auSol: !!(c.f & 1), planeur: c.ph === 'planeur', chute: c.ph === 'chute', arme: obj, pitch: a.rx, emote: c.em || null, accroupi: !!(c.f & 16) });
    if (a.bulle) { a.bulleT -= dt; if (a.bulleT <= 0) { m.remove(a.bulle); a.bulle.material.map.dispose(); a.bulle.material.dispose(); a.bulle = null; } }
    if ((c.ph === 'chute' || c.ph === 'planeur') && distCam(a.x, a.y, a.z) < 150) trainee(a, a.look.trainee, dt);
    if (c.ph === 'sol' && a.ph && a.ph !== 'sol' && distCam(a.x, a.y, a.z) < 60) poussiere(a.x, a.y, a.z, 10);
    a.ph = c.ph;
    const dc = Math.hypot(a.x - camera.position.x, a.z - camera.position.z);
    const et = m.userData.etiquette;
    const ami = !!a.marqueur;
    if (et) et.visible = (dc < 55 || ami) && etat.spectate !== a.id;
    if (a.marqueur) a.marqueur.visible = etat.spectate !== a.id;
    // bruits de pas des autres, pour les entendre arriver
    if ((c.f & 1) && a.vitesse > 2.5 && dc < 28 && !ami) {
      a.pasT = (a.pasT || 0) - dt;
      if (a.pasT <= 0) { a.pasT = a.vitesse > 8 ? 0.28 : 0.38; sonLoin(surfacePas(a), dc * 4); }
    }
    const loin = dc > 40;
    if (m.userData.loin !== loin) { m.userData.loin = loin; for (const d of m.userData.details) d.visible = !loin; }
  }
}

function majButins(dt) {
  for (const b of etat.butins.values()) {
    b.phase += dt;
    b.modele.rotation.y = b.phase * 1.2;
    b.modele.position.y = 0.55 + Math.sin(b.phase * 2) * 0.12;
    if ((b.rarete || 0) >= 3 && Math.random() < dt * 4 && distCam(b.x, b.y, b.z) < 50) {
      particules.ajouter({ x: b.x + (Math.random() - 0.5) * 0.8, y: b.y + 0.3, z: b.z + (Math.random() - 0.5) * 0.8, vy: 1.2 + Math.random(), couleur: RARETES[b.rarete].couleur, forme: 3, taille: 0.25, tailleFin: 0.05, vie: 1.2, additif: true });
    }
  }
}

// ---------- Caméra ----------
let fovVoulu = 72;
function majCamera(dt) {
  const moi = etat.moi;
  let sujet = moi, dist = 4.3, epaule = 0.75, haut = 0.3;
  if (moi.ph === 'mort' && etat.spectate && etat.autres.get(etat.spectate)) {
    sujet = etat.autres.get(etat.spectate);
  }
  const accroupi = sujet === moi ? moi.accroupi && moi.auSol : !!(sujet.f & 16);
  let px = sujet.x, py = sujet.y + (accroupi ? 1.2 : 1.65), pz = sujet.z;
  let yaw = sujet === moi ? moi.ry : sujet.ry, pitch = sujet === moi ? moi.rx : sujet.rx;
  if (sujet === moi && moi.ph === 'dirigeable') {
    const p = posDirigeable(etat.dirigeable, etat.temps);
    px = p.x; py = p.y; pz = p.z; dist = 42; epaule = 0; haut = 4;
  } else if (sujet === moi && (moi.ph === 'chute' || moi.ph === 'planeur')) {
    dist = 7; epaule = 0;
  } else if (sujet === moi && moi.ph === 'mort' && !etat.spectate) {
    dist = 9; epaule = 0;
  }
  const it = moi.inv[moi.slot];
  const lunette = sujet === moi && moi.visee && it && it.objet === 'sniper';
  if (sujet === moi && moi.visee && !lunette) { dist = 2.3; epaule = 0.85; }
  const fovBase = reglages.fov || 72;
  fovVoulu = lunette ? 16 : (sujet === moi && moi.visee ? fovBase - 16 : fovBase);
  if (sujet === moi && moi.ph === 'sol' && !moi.visee && Math.hypot(moi.vx, moi.vz) > 8.5) fovVoulu += 6;
  if (moi.ph === 'chute' && sprintActif()) fovVoulu = fovBase + 13;
  camera.fov += (fovVoulu - camera.fov) * Math.min(1, dt * (lunette ? 30 : 14));
  camera.updateProjectionMatrix();
  const emoteCam = sujet === moi && moi.emote;
  if (emoteCam) { yaw = moi.ry + Math.PI + (etat.orbite || 0); pitch = -0.15; dist = 4.6; epaule = 0; haut = -0.2; }
  camera.rotation.set(pitch, yaw, 0);
  if (lunette) {
    camera.position.set(px, sujet.y + 1.75, pz);
  } else {
    const f = directionVisee();
    const rx = Math.cos(yaw), rz = -Math.sin(yaw);
    let cx = px - f.x * dist + rx * epaule, cy = py - f.y * dist + haut, cz = pz - f.z * dist + rz * epaule;
    // On ne passe pas à travers les murs
    let ddx = cx - px, ddy = cy - py, ddz = cz - pz;
    const L = Math.hypot(ddx, ddy, ddz);
    if (L > 0.01 && etat.monde) {
      ddx /= L; ddy /= L; ddz /= L;
      const h = etat.monde.lancerRayon(px, py, pz, ddx, ddy, ddz, L + 0.3);
      if (h) { const t = Math.max(0.3, h.t - 0.3); cx = px + ddx * t; cy = py + ddy * t; cz = pz + ddz * t; }
    }
    // mouvement doux (sauf quand la caméra est tout près d'un mur)
    const k = 1 - Math.exp(-dt * 22);
    if (etat.camPrec && sujet === etat.camSujet && camera.position.distanceTo(etat.camPrec) < 6 && !lunette) {
      camera.position.set(etat.camPrec.x + (cx - etat.camPrec.x) * k, etat.camPrec.y + (cy - etat.camPrec.y) * k, etat.camPrec.z + (cz - etat.camPrec.z) * k);
      const dCam = camera.position.distanceTo(new THREE.Vector3(px, py, pz)), dVoulue = Math.hypot(cx - px, cy - py, cz - pz);
      if (dCam > dVoulue + 0.05) camera.position.set(cx, cy, cz);
    } else camera.position.set(cx, cy, cz);
    etat.camPrec = (etat.camPrec || new THREE.Vector3()).copy(camera.position);
    etat.camSujet = sujet;
  }
  // tremblement (tirs, explosions, chutes)
  if (etat.secousse > 0.002) {
    const k = etat.secousse;
    camera.position.x += (Math.random() - 0.5) * k * 0.35; camera.position.y += (Math.random() - 0.5) * k * 0.35; camera.position.z += (Math.random() - 0.5) * k * 0.35;
    camera.rotation.x += (Math.random() - 0.5) * k * 0.025; camera.rotation.y += (Math.random() - 0.5) * k * 0.025;
  }
  $('#lunette').style.display = lunette ? 'block' : 'none';
  // Le soleil suit le joueur pour les ombres
  placerSoleil(sujet.x, sujet.y, sujet.z);
}
function placerSoleil(x, y, z) {
  soleil.target.position.set(x, y, z);
  soleil.position.set(x + dirSoleil.x * 160, y + dirSoleil.y * 160, z + dirSoleil.z * 160);
}

// ---------- Zone ----------
function majZone(dt) {
  if (!etat.zone) return;
  const z = etatZone(etat.zone, etat.temps);
  const r = Math.max(0.1, z.r);
  etat.meshZone.scale.set(r, 1, r);
  etat.meshZone.position.set(z.x, 150, z.z);
  const moi = etat.moi;
  const sujet = moi.ph === 'mort' && etat.spectate ? etat.autres.get(etat.spectate) || moi : moi;
  const dehors = Math.hypot(camera.position.x - z.x, camera.position.z - z.z) > z.r;
  $('#vignette').style.opacity = dehors && sujet.ph !== 'dirigeable' ? 1 : 0;
  const u = ciel.material.uniforms;
  u.uMelange.value += ((dehors ? 0.85 : 0) - u.uMelange.value) * Math.min(1, dt * 3);
  scene.fog.color.copy(cielHorizon).lerp(COULEURS_CIEL.zone, u.uMelange.value);
  const loin = brumeLoin();
  scene.fog.near = 180 * loin / 640;
  scene.fog.far = loin - u.uMelange.value * loin * 0.75;
  etat.meshZone.material.uniforms.uTemps.value = etat.temps;
  etat.meshZone.material.uniforms.uRayon.value = r;
  etat.meshZone.visible = z.r < DEMI * 1.2;
  if (z.etape !== etat.etapeZone || z.retrecit !== etat.retrecit) {
    if (etat.etapeZone !== -1 && moi.ph !== 'mort') {
      if (z.retrecit) { annonce('⚠️ La zone se resserre !', 3, '#c58bff'); son('zone'); }
      else if (z.etape < etat.zone.length) annonce('Nouvelle zone sur la carte', 2.5, '#ffffff');
    }
    etat.etapeZone = z.etape; etat.retrecit = z.retrecit;
  }
  const mmss = s => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`;
  $('#infoZone').innerHTML = z.retrecit ? `🌀 La zone avance · <b>${mmss(z.dans)}</b>`
    : z.dans > 0 ? `🌀 Zone dans <b>${mmss(z.dans)}</b>` : '🌀 Zone finale !';
  etat.zoneEtat = z;
}

// ---------- Carte ----------
function dessinerCarte(cv, centreX, centreZ, vue, grand) {
  const g = cv.getContext('2d');
  const T = cv.width;
  const x0 = centreX - vue / 2, z0 = centreZ - vue / 2;
  const P = (x, z) => [(x - x0) / vue * T, (z - z0) / vue * T];
  g.fillStyle = '#2a9fd8'; g.fillRect(0, 0, T, T);
  if (etat.imageCarte) {
    const ech = 512 / (DEMI * 2);
    g.drawImage(etat.imageCarte, (x0 + DEMI) * ech, (z0 + DEMI) * ech, vue * ech, vue * ech, 0, 0, T, T);
  }
  const z = etat.zoneEtat;
  if (z) {
    const [zx, zy] = P(z.x, z.z);
    g.save();
    g.beginPath(); g.rect(0, 0, T, T); g.arc(zx, zy, Math.max(0, z.r) / vue * T, 0, Math.PI * 2);
    g.fillStyle = 'rgba(130,50,220,.45)'; g.fill('evenodd');
    g.restore();
    const [cx, cy] = P(z.cx, z.cz);
    g.strokeStyle = '#fff'; g.lineWidth = grand ? 3 : 2;
    g.beginPath(); g.arc(cx, cy, Math.max(0.5, z.cr / vue * T), 0, Math.PI * 2); g.stroke();
  }
  const moi = etat.moi;
  if (etat.dirigeable && etat.temps < etat.dirigeable.duree + 2) {
    const d = etat.dirigeable;
    const [ax, ay] = P(d.ax, d.az), [bx, by] = P(d.bx, d.bz);
    g.setLineDash([8, 6]); g.strokeStyle = '#ffd23f'; g.lineWidth = 3;
    g.beginPath(); g.moveTo(ax, ay); g.lineTo(bx, by); g.stroke(); g.setLineDash([]);
    const p = posDirigeable(d, etat.temps);
    const [qx, qy] = P(p.x, p.z);
    g.fillStyle = '#ff7b39'; g.beginPath(); g.arc(qx, qy, grand ? 8 : 5, 0, Math.PI * 2); g.fill();
  }
  // champignons, fontaines de soin, ravitaillements, repère, coéquipiers
  if (etat.monde && grand) {
    for (const t of etat.monde.trampolines || []) { const [x, y] = P(t.x, t.z); g.fillStyle = '#c44dff'; g.strokeStyle = '#fff'; g.lineWidth = 1.5; g.beginPath(); g.arc(x, y, 4, 0, 7); g.fill(); g.stroke(); }
    for (const so of etat.monde.sources || []) { const [x, y] = P(so.x, so.z); g.fillStyle = '#0b3d2a'; g.beginPath(); g.arc(x, y, 7, 0, 7); g.fill(); g.fillStyle = '#5bffb0'; g.fillRect(x - 5, y - 1.5, 10, 3); g.fillRect(x - 1.5, y - 5, 3, 10); }
  }
  for (const r of etat.ravitos.values()) {
    if (r.ouvert) continue;
    const [x, y] = P(r.x, r.z), k = grand ? 7 : 5;
    g.fillStyle = '#c44dff'; g.strokeStyle = '#fff'; g.lineWidth = 2; g.fillRect(x - k, y - k, k * 2, k * 2); g.strokeRect(x - k, y - k, k * 2, k * 2);
  }
  if (etat.repere) {
    const [x, y] = P(etat.repere.x, etat.repere.z), k = grand ? 1.4 : 1;
    g.fillStyle = '#ffd23f'; g.strokeStyle = '#000'; g.lineWidth = 2;
    g.beginPath(); g.moveTo(x, y); g.lineTo(x - 6 * k, y - 11 * k); g.arc(x, y - 13 * k, 6.5 * k, Math.PI * 0.85, Math.PI * 2.15); g.closePath(); g.fill(); g.stroke();
  }
  for (const a of etat.autres.values()) {
    if (!a.vivant || !a.marqueur || !a.cible) continue;
    const [x, y] = P(a.x, a.z);
    g.fillStyle = '#4fff7a'; g.strokeStyle = '#000'; g.lineWidth = 2; g.beginPath(); g.arc(x, y, grand ? 6 : 4.5, 0, 7); g.fill(); g.stroke();
  }
  if (etat.monde) {
    g.font = `bold ${grand ? 15 : 10}px system-ui`; g.textAlign = 'center';
    for (const l of etat.monde.lieux) {
      const [lx, ly] = P(l.x, l.z);
      if (lx < -40 || ly < -10 || lx > T + 40 || ly > T + 10) continue;
      g.lineWidth = 3; g.strokeStyle = 'rgba(0,0,0,.7)'; g.strokeText(l.nom, lx, ly);
      g.fillStyle = '#fff'; g.fillText(l.nom, lx, ly);
    }
  }
  if (moi) {
    const s = moi.ph === 'mort' && etat.spectate ? etat.autres.get(etat.spectate) : moi;
    if (s) {
      const [mx, my] = P(s.x, s.z);
      g.save(); g.translate(mx, my); g.rotate(-s.ry);
      g.fillStyle = '#ffd23f'; g.strokeStyle = '#000'; g.lineWidth = 2;
      const k = grand ? 1.5 : 1;
      g.beginPath(); g.moveTo(0, -9 * k); g.lineTo(6 * k, 7 * k); g.lineTo(0, 3 * k); g.lineTo(-6 * k, 7 * k); g.closePath();
      g.fill(); g.stroke(); g.restore();
    }
  }
}

// ---------- HUD ----------
let annonceT = 0, annonceObjetT = 0, marqueurT = 0;
function annonce(texte, duree = 2, couleur = '#ffd23f') {
  const a = $('#annonce');
  a.textContent = texte; a.style.color = couleur; a.style.opacity = 1;
  annonceT = duree;
}
function annonceObjet(texte) {
  const n = $('#nomObjet');
  n.textContent = texte;
  annonceObjetT = 1.6;
}
function marqueur(tete) {
  const m = $('#marqueur');
  m.classList.toggle('tete', tete); m.style.opacity = 1;
  marqueurT = 0.15;
}
function ajouterFil(html, important) {
  const fil = $('#fil');
  const d = document.createElement('div');
  d.innerHTML = html;
  if (important) d.className = 'moi';
  fil.appendChild(d);
  while (fil.children.length > 6) fil.firstChild.remove();
  setTimeout(() => { d.style.opacity = 0; setTimeout(() => d.remove(), 600); }, 7000);
}
const degatsListe = [];
function afficherDegats(x, y, z, deg, tete, bouclier) {
  const el = document.createElement('div');
  el.textContent = Math.round(deg);
  if (tete) el.className = 'tete'; else if (bouclier) el.className = 'bouclier';
  $('#degats').appendChild(el);
  degatsListe.push({ el, x: x + (Math.random() - 0.5) * 0.6, y, z, t: 0 });
}
function majDegats(dt) {
  majBarres(dt);
  for (let i = degatsListe.length - 1; i >= 0; i--) {
    const d = degatsListe[i];
    d.t += dt;
    if (d.t > 0.9) { d.el.remove(); degatsListe.splice(i, 1); continue; }
    vTmp.set(d.x, d.y + d.t * 1.2, d.z).project(camera);
    if (vTmp.z > 1) { d.el.style.display = 'none'; continue; }
    d.el.style.display = 'block';
    d.el.style.left = (vTmp.x * 0.5 + 0.5) * innerWidth + 'px';
    d.el.style.top = (-vTmp.y * 0.5 + 0.5) * innerHeight + 'px';
    d.el.style.opacity = 1 - Math.max(0, d.t - 0.5) / 0.4;
  }
}

let signatureBarre = '';
function construireBarreObjets() {
  const moi = etat.moi;
  if (!moi) return;
  const sig = JSON.stringify([moi.inv, moi.slot, moi.construction]);
  if (sig === signatureBarre) return;
  signatureBarre = sig;
  const bar = $('#objets');
  bar.innerHTML = '';
  moi.inv.forEach((it, i) => {
    const c = document.createElement('div');
    c.className = 'case' + (i === moi.slot && !moi.construction ? ' choisie' : '');
    if (it) {
      const def = OBJETS[it.objet];
      const coul = RARETES[it.rarete || 0].couleur;
      c.style.borderColor = coul;
      c.style.background = `linear-gradient(transparent 40%, ${coul}66)`;
      let img = def.icone;
      try { img = `<img src="${apercu.miniatureObjet(it.objet, it.rarete || 0, it.objet === 'pioche' ? moi.look.pioche : '')}" alt="">`; } catch (e) { /* emoji */ }
      c.innerHTML = `<span class="num">${i + 1}</span>${img}${it.qte ? `<span class="qte">×${it.qte}</span>` : ''}`;
    } else c.innerHTML = `<span class="num">${i + 1}</span>`;
    c.addEventListener('pointerdown', e => { e.stopPropagation(); if (enJeu()) choisirSlot(i); });
    bar.appendChild(c);
  });
  const it = moi.inv[moi.slot];
  if (!annonceObjetT) {
    $('#nomObjet').innerHTML = moi.construction ? `🔨 Construction : <b>${moi.construction}</b> (10 🪵)` : it ? `<span style="color:${RARETES[it.rarete || 0].couleur}">${OBJETS[it.objet].nom}${OBJETS[it.objet].type === 'arme' ? ' · ' + RARETES[it.rarete || 0].nom : ''}</span>` : '';
  }
  majAideConstr();
}

let hudT = 0;
function majHUD(dt) {
  const moi = etat.moi;
  annonceT -= dt; if (annonceT <= 0) $('#annonce').style.opacity = 0;
  if (annonceObjetT > 0) { annonceObjetT -= dt; if (annonceObjetT <= 0) { annonceObjetT = 0; signatureBarre = ''; construireBarreObjets(); } }
  marqueurT -= dt; if (marqueurT <= 0) $('#marqueur').style.opacity = 0;
  const fl = $('#flash'); fl.style.opacity = Math.max(0, (+fl.style.opacity || 0) - dt * 2.5);
  // Barres de vie
  $('#barrePv').style.width = Math.max(0, moi.pv) + '%';
  $('#txtPv').textContent = Math.max(0, Math.ceil(moi.pv));
  $('#barreBouclier').style.width = moi.bouclier + '%';
  $('#txtBouclier').textContent = Math.ceil(moi.bouclier);
  $('#coeur').classList.toggle('actif', moi.ph === 'sol' && moi.pv > 0 && moi.pv <= 30);
  // Munitions
  const it = moi.inv[moi.slot];
  const mun = $('#munitions');
  const defIt = it ? OBJETS[it.objet] : null;
  if (moi.construction) mun.innerHTML = '🔨';
  else if (defIt && defIt.type === 'arme') mun.innerHTML = moi.rechargeT > 0 ? '<small>Recharge…</small>' : `${it.mun}<small> / ${moi.munitions}</small>`;
  else if (defIt && defIt.type === 'lancer') mun.innerHTML = `${it.qte}<small> ${defIt.icone}</small>`;
  else mun.innerHTML = `<small>${moi.munitions} 📦</small>`;
  // chargeur presque vide : ça clignote
  mun.classList.toggle('peu', !!(defIt && defIt.type === 'arme' && defIt.chargeur > 1 && moi.rechargeT <= 0 && it.mun <= Math.ceil(defIt.chargeur * 0.25)));
  // battement de cœur quand la vie est basse
  if (moi.ph === 'sol' && moi.pv > 0 && moi.pv <= 25) { etat.coeurT = (etat.coeurT || 0) - dt; if (etat.coeurT <= 0) { etat.coeurT = 0.95; son('coeur', 0.8); } }
  $('#mats b').textContent = moi.mats;
  // Viseur
  let ecart = 6;
  if (it && OBJETS[it.objet].type === 'arme' && !moi.construction) {
    const focale = (innerHeight / 2) / Math.tan(camera.fov * Math.PI / 360);
    ecart = 4 + Math.tan(dispersionActuelle(OBJETS[it.objet])) * focale;
  }
  const v = $('#viseur');
  v.style.display = moi.ph === 'sol' && !(moi.visee && it && it.objet === 'sniper') ? 'block' : 'none';
  v.querySelector('.g').style.left = -(ecart + 10) + 'px';
  v.querySelector('.d').style.left = ecart + 'px';
  v.querySelector('.h1').style.top = -(ecart + 10) + 'px';
  v.querySelector('.b').style.top = ecart + 'px';
  v.style.setProperty('--viseur', reglages.couleurViseur || '#ffffff');
  // Progression (soin, recharge) : barre + anneau autour du viseur
  const pr = $('#progression');
  let kAnneau = -1;
  if (moi.conso) {
    pr.style.display = 'block';
    kAnneau = moi.conso.t / moi.conso.duree;
    pr.firstElementChild.style.width = (kAnneau * 100) + '%';
    pr.lastElementChild.textContent = OBJETS[moi.inv[moi.conso.slot]?.objet]?.nom || '';
  } else if (moi.rechargeT > 0) {
    pr.style.display = 'block';
    kAnneau = 1 - moi.rechargeT / moi.rechargeTotal;
    pr.firstElementChild.style.width = (kAnneau * 100) + '%';
    pr.lastElementChild.textContent = 'Recharge';
  } else pr.style.display = 'none';
  const anneau = $('#anneau');
  anneau.style.display = kAnneau >= 0 && moi.ph === 'sol' ? 'block' : 'none';
  if (kAnneau >= 0) anneau.querySelector('circle').style.strokeDashoffset = 100.5 * (1 - kAnneau);
  // Invitation (E)
  const inv = $('#invite');
  const ia = etat.interaction;
  const kE = tactile ? '👆' : `<kbd>${L('KeyE')}</kbd>`;
  if (moi.ph === 'sol' && ia) {
    inv.style.display = 'block';
    if (ia.type === 'coffre') inv.innerHTML = `${kE} Ouvrir le coffre${ia.c.dore ? ' <b style="color:#ffd23f">doré</b> 🌟' : ' ✨'}`;
    else if (ia.type === 'ravito') inv.innerHTML = `${kE} Ouvrir le <b style="color:#d18bff">ravitaillement</b> 📦`;
    else {
      const def = OBJETS[ia.b.objet];
      const r = RARETES[ia.b.rarete || 0];
      inv.innerHTML = `${kE} Ramasser <span style="color:${r.couleur}">${def.nom}${def.type === 'arme' ? ' (' + r.nom + ')' : ''}${ia.b.qte > 1 ? ' ×' + ia.b.qte : ''}</span>`;
    }
  } else inv.style.display = 'none';
  // Dirigeable
  const id = $('#infoDirigeable');
  if (moi.ph === 'dirigeable') {
    id.classList.remove('cache');
    id.innerHTML = `🎈 ${tactile ? 'Touche <b>🪂</b>' : 'Appuie sur <kbd>Espace</kbd>'} pour sauter · ${Math.max(0, Math.ceil(etat.dirigeable.duree - etat.temps))} s`;
  } else if (moi.ph === 'chute') {
    id.classList.remove('cache');
    id.innerHTML = tactile ? '<b>🪁</b> ouvrir le deltaplane · joystick à fond : plonger' : `<kbd>Espace</kbd> ouvrir le deltaplane · <kbd>Maj</kbd> plonger`;
  } else if (moi.emote) {
    id.classList.remove('cache');
    id.innerHTML = tactile ? '💃 Émote · glisse le doigt pour tourner autour · 💃 pour arrêter' : `💃 Émote · bouge la souris pour tourner autour · <kbd>${L('KeyB')}</kbd> pour arrêter`;
  } else id.classList.add('cache');
  dessinerBoussole();
  majRepere();
  majTuto(dt);
  // Compteurs + cartes (moins souvent)
  hudT -= dt;
  if (hudT <= 0) {
    hudT = 0.08;
    $('#nbVivants').textContent = '👤 ' + etat.vivants;
    $('#nbKills').textContent = '💀 ' + moi.kills;
    $('#chrono').textContent = `⏱️ ${Math.floor(etat.temps / 60)}:${String(Math.floor(etat.temps % 60)).padStart(2, '0')}`;
    $('#ping').textContent = !reseau.estHote && etat.ping ? `📶 ${etat.ping} ms` : '';
    const s = sujetVue();
    dessinerCarte($('#carte'), s.x, s.z, moi.ph === 'dirigeable' ? DEMI * 2 : 160, false);
    if (etat.grandeCarte) dessinerCarte($('#grandeCarte canvas'), 0, 0, DEMI * 2, true);
    majFlecheZone();
    majTactile();
    // viseur rouge quand il y a un ennemi dessous
    const arme = it && OBJETS[it.objet].type === 'arme' && !moi.construction && moi.ph === 'sol';
    v.classList.toggle('ennemi', !!(arme && rayonVisee(directionVisee(), 220).cible));
    etat.tableauT = (etat.tableauT || 0) - 0.08;
    if (etat.tableau && etat.tableauT <= 0) { etat.tableauT = 0.3; majTableau(); }
  }
  // images par seconde
  if (reglages.fps) {
    etat.fpsN = (etat.fpsN || 0) + 1; etat.fpsT = (etat.fpsT || 0) + dt;
    if (etat.fpsT >= 0.5) { $('#fps').textContent = Math.round(etat.fpsN / etat.fpsT) + ' i/s'; etat.fpsN = 0; etat.fpsT = 0; }
  }
}

// ---------- Envoi de mon état ----------
function envoyerEtat(dt) {
  const moi = etat.moi;
  etat.envoiT += dt;
  if (etat.envoiT < 0.05 || moi.ph === 'mort') return;
  etat.envoiT = 0;
  const it = moi.inv[moi.slot];
  const f = (moi.auSol ? 1 : 0) | (moi.visee ? 2 : 0) | (moi.coup > 0 ? 4 : 0) | (moi.conso ? 8 : 0) | (moi.accroupi && moi.auSol ? 16 : 0);
  reseau.versHote({
    t: 'etat', x: arrondi(moi.x), y: arrondi(moi.y), z: arrondi(moi.z), ry: arrondi(moi.ry), rx: arrondi(moi.rx),
    f, a: moi.construction || !it ? '' : it.objet + ':' + (it.rarete || 0), ph: moi.ph, em: moi.emote || '',
  });
}

// ---------- Explosifs : roquettes et grenades ----------
const geoRoquette = new THREE.CylinderGeometry(0.075, 0.075, 0.6, 8).rotateX(Math.PI / 2);
const matRoquette = new THREE.MeshLambertMaterial({ color: '#4d5a3a' });
const geoOgive = new THREE.ConeGeometry(0.075, 0.2, 8).rotateX(Math.PI / 2).translate(0, 0, 0.4);
const matOgive = new THREE.MeshLambertMaterial({ color: '#e74c3c' });
const matFeu = new THREE.MeshBasicMaterial({ color: new THREE.Color('#ffb03a').multiplyScalar(2), toneMapped: false });
function lancerProjectile(p) {
  // roquette : v = point d'arrivée ; grenade : v = vitesse de départ
  const g = new THREE.Group();
  if (p.type === 'roquette') {
    const feu = new THREE.Mesh(new THREE.SphereGeometry(0.13, 8, 6), matFeu); feu.position.z = -0.35;
    g.add(new THREE.Mesh(geoRoquette, matRoquette), new THREE.Mesh(geoOgive, matOgive), feu);
    g.position.set(p.o[0], p.o[1], p.o[2]);
    g.lookAt(p.v[0], p.v[1], p.v[2]);
  } else {
    const m = modeleObjet('grenade', 1); m.scale.setScalar(1.4); g.add(m);
    g.position.set(p.o[0], p.o[1], p.o[2]);
  }
  scene.add(g);
  etat.projectiles.push({ ...p, g, t: 0, x: +p.o[0], y: +p.o[1], z: +p.o[2], vx: +p.v[0], vy: +p.v[1], vz: +p.v[2] });
}
function majProjectiles(dt) {
  for (let n = etat.projectiles.length - 1; n >= 0; n--) {
    const p = etat.projectiles[n];
    p.t += dt;
    if (p.type === 'roquette') {
      const k = Math.min(1, p.t / Math.max(0.01, p.duree));
      p.x = p.o[0] + (p.v[0] - p.o[0]) * k; p.y = p.o[1] + (p.v[1] - p.o[1]) * k; p.z = p.o[2] + (p.v[2] - p.o[2]) * k;
      p.g.position.set(p.x, p.y, p.z);
      particules.ajouter({ x: p.x, y: p.y, z: p.z, vx: (Math.random() - 0.5) * 0.4, vy: 0.3, vz: (Math.random() - 0.5) * 0.4, couleur: '#d0d0d0', taille: 0.45, tailleFin: 1.5, vie: 0.9, alpha: 0.5, frein: 2 });
      particules.ajouter({ x: p.x, y: p.y, z: p.z, couleur: '#ffb03a', forme: 3, taille: 0.35, tailleFin: 0.05, vie: 0.15, additif: true });
    } else if (etat.monde) {
      const avant = p.rebonds || 0;
      simulerGrenade(etat.monde, p, Math.min(dt, 0.05));
      if ((p.rebonds || 0) > avant && p.rebonds < 5) sonLoin('pasBois', distCam(p.x, p.y, p.z) * 2);
      p.g.position.set(p.x, p.y, p.z);
      p.g.rotation.x += dt * 9 * Math.min(1, Math.hypot(p.vx, p.vz));
      if (Math.random() < 0.4) particules.ajouter({ x: p.x, y: p.y + 0.15, z: p.z, vy: 0.4, couleur: '#ff5d5d', forme: 3, taille: 0.16, tailleFin: 0.02, vie: 0.4, additif: true });
    }
    if (p.t >= p.duree) {
      if (p.mien) reseau.versHote({ t: 'explosion', x: arrondi(p.x), y: arrondi(p.y), z: arrondi(p.z), arme: p.type === 'roquette' ? 'roquettes' : 'grenade' });
      scene.remove(p.g);
      etat.projectiles.splice(n, 1);
    }
  }
}
// Boules de feu qui grossissent puis s'éteignent
const geoBoule = new THREE.IcosahedronGeometry(1, 2);
const boules = [];
function bouleDeFeu(x, y, z, r) {
  let b = boules.find(b => !b.actif);
  if (!b) {
    b = { coeur: new THREE.Mesh(geoBoule, new THREE.MeshBasicMaterial({ color: new THREE.Color('#fff1b0').multiplyScalar(2), transparent: true, toneMapped: false, depthWrite: false })),
      halo: new THREE.Mesh(geoBoule, new THREE.MeshBasicMaterial({ color: new THREE.Color('#ff7a1f').multiplyScalar(1.6), transparent: true, toneMapped: false, depthWrite: false, blending: THREE.AdditiveBlending })) };
    scene.add(b.coeur, b.halo); boules.push(b);
  }
  b.actif = true; b.t = 0; b.r = r;
  b.coeur.position.set(x, y + 0.6, z); b.halo.position.set(x, y + 0.6, z);
  b.coeur.visible = b.halo.visible = true;
}
function majBoules(dt) {
  for (const b of boules) if (b.actif) {
    b.t += dt;
    const k = b.t / 0.45;
    if (k >= 1) { b.actif = false; b.coeur.visible = b.halo.visible = false; continue; }
    const s = b.r * (0.35 + (1 - Math.pow(1 - k, 3)) * 0.75);
    b.coeur.scale.setScalar(s * 0.6); b.halo.scale.setScalar(s);
    b.coeur.material.opacity = Math.max(0, 1 - k * 1.6); b.halo.material.opacity = 0.9 * (1 - k);
  }
}
function explosionVisuelle(x, y, z, r) {
  const d = distCam(x, y, z);
  sonLoin('explosion', d * 0.55);
  flash(x, y + 0.5, z, r * 2.4);
  bouleDeFeu(x, y, z, r);
  eclairer(x, y + 1, z, 80, 30);
  for (let i = 0; i < 44; i++) {
    const a = Math.random() * 6.28, b = Math.random() * Math.PI, v = 3 + Math.random() * 7;
    particules.ajouter({ x, y: y + 0.3, z, vx: Math.cos(a) * Math.sin(b) * v, vy: Math.abs(Math.cos(b)) * v, vz: Math.sin(a) * Math.sin(b) * v, couleur: i % 3 ? '#ffb03a' : '#ff5a1f', taille: 2, tailleFin: 0.4, vie: 0.5 + Math.random() * 0.35, additif: true, frein: 2.5 });
  }
  for (let i = 0; i < 26; i++) particules.ajouter({ x: x + (Math.random() - 0.5) * r, y: y + Math.random() * r * 0.6, z: z + (Math.random() - 0.5) * r, vx: (Math.random() - 0.5) * 2, vy: 1 + Math.random() * 2, vz: (Math.random() - 0.5) * 2, couleur: i % 2 ? '#5d5d5d' : '#8a8a8a', taille: 2.4, tailleFin: 5.5, vie: 2 + Math.random(), alpha: 0.6, frein: 1.2 });
  eclats(x, y + 0.5, z, '#3b3b3b', 10, 9);
  etat.secousse = Math.max(etat.secousse, Math.max(0, 1 - d / 50) * 0.9);
}

// ---------- Ravitaillements ----------
function ajouterRavito(r) {
  if (etat.ravitos.has(r.id)) return;
  const m = modeleObjet('ravitaillement', 0);
  let para = null;
  m.traverse(o => { if ((o.userData.name || o.name) === 'parachute') para = o; if (o.isMesh) o.castShadow = true; });
  scene.add(m);
  etat.ravitos.set(r.id, { ...r, mesh: m, para, ouvert: false, pose: false });
}
function majRavitos(dt) {
  for (const r of etat.ravitos.values()) {
    const p = posRavito(r, etat.temps);
    r.mesh.position.set(r.x, p.y, r.z);
    if (!p.pose) { r.mesh.rotation.y += dt * 0.3; r.mesh.rotation.z = Math.sin(etat.temps * 1.5 + r.id) * 0.08; }
    else r.mesh.rotation.z = 0;
    if (r.para) { r.paraK = p.pose ? Math.max(0, (r.paraK ?? 1) - dt * 1.5) : 1; r.para.scale.setScalar(Math.max(0.001, r.paraK)); r.para.visible = r.paraK > 0.01; }
    if (p.pose && !r.pose) { poussiere(r.x, r.sol, r.z, 18); sonLoin('casse', distCam(r.x, r.sol, r.z)); }
    r.pose = p.pose;
  }
}

// ---------- Discussion ----------
const chatOuvert = () => !$('#chatSaisie').classList.contains('cache');
function ouvrirChat() {
  const s = $('#chatSaisie');
  touches.clear(); tirAppuye = false;
  s.classList.remove('cache'); s.value = ''; s.focus();
  if (tactile) $('#chatRapides').classList.remove('cache');
}
function fermerChat() {
  const s = $('#chatSaisie');
  if (s.classList.contains('cache')) return;
  s.value = ''; s.classList.add('cache'); s.blur();
  $('#chatRapides').classList.add('cache');
  majPause();
}
function envoyerChat(texte, rapide = false) {
  texte = String(texte || '').trim().slice(0, 80);
  if (texte) reseau.versHote({ t: 'chat', texte, rapide });
}
function recevoirChat(m) {
  son('message', 0.7);
  const html = `<b style="color:${echapper(m.couleur || '#fff')}">${echapper(m.nom)}</b> ${echapper(m.texte)}`;
  for (const id of ['#chatFil', '#chatSalonFil']) {
    const fil = $(id);
    const d = document.createElement('div'); d.innerHTML = html;
    fil.appendChild(d);
    if (id === '#chatFil') {
      while (fil.children.length > 6) fil.firstChild.remove();
      setTimeout(() => { d.style.opacity = 0; setTimeout(() => d.remove(), 600); }, 9000);
    } else { while (fil.children.length > 40) fil.firstChild.remove(); fil.scrollTop = fil.scrollHeight; }
  }
  // bulle au-dessus de la tête de celui qui parle
  const a = etat.autres.get(m.id);
  if (a && a.vivant && etat.ecran === 'jeu') {
    if (a.bulle) { a.modele.remove(a.bulle); a.bulle.material.map.dispose(); a.bulle.material.dispose(); }
    const b = creerEtiquette('💬 ' + String(m.texte).slice(0, 24));
    b.position.y = 3.05; b.scale.set(3.2, 0.8, 1);
    a.modele.add(b); a.bulle = b; a.bulleT = 4.5;
  }
}

// ---------- Classement (Tab) ----------
function majTableau() {
  const lignes = [...etat.infos.values()].map(i => ({ ...i, k: etat.kills.get(i.id) || 0 })).sort((a, b) => (b.vivant - a.vivant) || b.k - a.k);
  $('#tableau').innerHTML = `<h3>🏆 Classement · ${etat.vivants} en vie</h3><table>${lignes.map(i => `<tr class="${i.id === reseau.monId ? 'moi' : ''}${i.vivant ? '' : ' mort'}"><td>${i.vivant ? '🟢' : '💀'}</td><td style="color:${echapper(i.couleur)}">${echapper(i.nom)}${i.bot ? ' <small>bot</small>' : ''}${coequipier(i.id) ? ' <small class="ami">équipe</small>' : ''}</td><td>${i.k} 💀</td></tr>`).join('')}</table>`;
}

// ---------- Boussole, repère, flèche de zone ----------
const POINTS = ['N', 'NE', 'E', 'SE', 'S', 'SO', 'O', 'NO'];
function dessinerBoussole() {
  const cv = $('#boussole'), g = cv.getContext('2d'), W = cv.width, H = cv.height;
  g.clearRect(0, 0, W, H);
  const s = sujetVue();
  if (!s) return;
  const cap = ((-s.ry * 180 / Math.PI) % 360 + 360) % 360;
  const pxDeg = W / 180;
  g.textAlign = 'center'; g.font = '800 15px Nunito, system-ui';
  for (let d = Math.ceil((cap - 90) / 15) * 15; d <= cap + 90; d += 15) {
    const x = W / 2 + (d - cap) * pxDeg, dd = ((d % 360) + 360) % 360;
    if (dd % 45 === 0) { g.fillStyle = dd === 0 ? '#ffd23f' : '#ffffff'; g.fillText(POINTS[dd / 45], x, 19); }
    else { g.fillStyle = 'rgba(255,255,255,.55)'; g.fillRect(x - 1, 9, 2, 8); }
  }
  const marque = (x, z, couleur) => {
    const b = Math.atan2(x - s.x, -(z - s.z)) * 180 / Math.PI;
    let dl = ((b - cap + 540) % 360) - 180;
    dl = Math.max(-88, Math.min(88, dl));
    const px = W / 2 + dl * pxDeg;
    g.fillStyle = couleur; g.strokeStyle = '#000'; g.lineWidth = 1.5;
    g.beginPath(); g.moveTo(px, H - 1); g.lineTo(px - 6, H - 10); g.lineTo(px + 6, H - 10); g.closePath(); g.fill(); g.stroke();
  };
  if (etat.repere) marque(etat.repere.x, etat.repere.z, '#ffd23f');
  for (const r of etat.ravitos.values()) if (!r.ouvert) marque(r.x, r.z, '#c44dff');
  for (const a of etat.autres.values()) if (a.vivant && a.marqueur && a.cible) marque(a.x, a.z, '#4fff7a');
  const z = etat.zoneEtat;
  if (z && Math.hypot(s.x - z.x, s.z - z.z) > z.r) marque(z.x, z.z, '#ffffff');
  g.fillStyle = '#ffd23f'; g.fillRect(W / 2 - 1, 0, 2, 6);
}
function majRepere() {
  const el = $('#repere3d'), r = etat.repere;
  if (!r || !etat.monde) { el.style.display = 'none'; return; }
  vTmp.set(r.x, etat.monde.hauteurTerrain(r.x, r.z) + 3, r.z).project(camera);
  if (vTmp.z > 1) { el.style.display = 'none'; return; }
  el.style.display = 'block';
  el.style.left = borner((vTmp.x * 0.5 + 0.5) * innerWidth, 30, innerWidth - 30) + 'px';
  el.style.top = borner((-vTmp.y * 0.5 + 0.5) * innerHeight, 60, innerHeight - 60) + 'px';
  const s = sujetVue();
  el.querySelector('span').textContent = Math.round(Math.hypot(r.x - s.x, r.z - s.z)) + ' m';
}
function angleRelatif(x, z) {
  const s = sujetVue();
  const fx = -Math.sin(s.ry), fz = -Math.cos(s.ry);
  const dx = x - s.x, dz = z - s.z;
  return Math.atan2(fx * dz - fz * dx, fx * dx + fz * dz);
}
function majFlecheZone() {
  const el = $('#flecheZone'), z = etat.zoneEtat, moi = etat.moi;
  const d = z ? Math.hypot(moi.x - z.x, moi.z - z.z) : 0;
  if (!z || moi.ph !== 'sol' || d <= z.r) { el.style.display = 'none'; return; }
  el.style.display = 'flex';
  el.querySelector('i').style.transform = `rotate(${angleRelatif(z.x, z.z)}rad)`;
  el.querySelector('span').textContent = `Zone à ${Math.round(d - z.r)} m`;
}

// ---------- Barres de vie des ennemis touchés ----------
function montrerBarre(id) {
  let b = etat.barres.get(id);
  if (!b) {
    const el = document.createElement('div'); el.className = 'barre-ennemi';
    el.innerHTML = '<i class="b"></i><i class="p"></i>';
    $('#barresVie').appendChild(el);
    b = { el, t: 0 }; etat.barres.set(id, b);
  }
  b.t = 3;
}
function majBarres(dt) {
  for (const [id, b] of etat.barres) {
    b.t -= dt;
    const a = etat.autres.get(id), inf = etat.infos.get(id);
    if (b.t <= 0 || !a || !a.vivant || !inf) { b.el.remove(); etat.barres.delete(id); continue; }
    vTmp.set(a.x, a.y + 2.85, a.z).project(camera);
    if (vTmp.z > 1) { b.el.style.display = 'none'; continue; }
    b.el.style.display = 'block';
    b.el.style.left = (vTmp.x * 0.5 + 0.5) * innerWidth + 'px';
    b.el.style.top = (-vTmp.y * 0.5 + 0.5) * innerHeight + 'px';
    b.el.querySelector('.p').style.width = Math.max(0, inf.pv) + '%';
    b.el.querySelector('.b').style.width = Math.max(0, inf.b || 0) + '%';
    b.el.style.opacity = Math.min(1, b.t * 2);
  }
}

// ---------- Voir les sons (tirs et explosions autour de soi) ----------
const sonsVus = new Map();
function visuSon(x, z, qui) {
  const moi = etat.moi;
  if (!reglages.visuSons || !moi || moi.ph === 'mort' || qui === reseau.monId) return;
  const t = performance.now();
  if (t - (sonsVus.get(qui) || 0) < 350) return;
  sonsVus.set(qui, t);
  const d = document.createElement('div');
  d.className = 'son' + (qui === 'boum' ? ' boum' : '');
  d.style.transform = `rotate(${angleRelatif(x, z)}rad)`;
  $('#directions').appendChild(d);
  setTimeout(() => { d.style.opacity = 0; }, 450);
  setTimeout(() => d.remove(), 1100);
}

// ---------- Astuces de la première partie ----------
const TUTO = [
  { id: 'chute', quand: m => m.ph === 'chute', texte: '🪂 Maj pour plonger plus vite · Espace pour ouvrir le deltaplane', tactile: '🪂 Joystick à fond pour plonger · 🪁 pour ouvrir le deltaplane' },
  { id: 'sol', quand: m => m.ph === 'sol', texte: '✨ Cherche les coffres qui brillent et les armes au sol : E pour ramasser', tactile: '✨ Cherche les coffres et les armes : touche le texte « Ramasser » 👆' },
  { id: 'arme', quand: m => m.inv.some((x, i) => i > 0 && x && OBJETS[x.objet].type === 'arme'), texte: '🎯 Clic gauche : tirer · clic droit : viser · R : recharger', tactile: '🔫 Gros bouton : tirer (glisse dessus pour viser) · 🎯 viser · 🔄 recharger' },
  { id: 'bois', quand: m => m.ph === 'sol' && etat.temps > 75, texte: '🪵 Frappe les arbres avec la pioche (touche 1) pour avoir du bois', tactile: '🪵 Prends la pioche (case 1) et frappe les arbres pour avoir du bois' },
  { id: 'constr', quand: m => m.ph === 'sol' && m.mats >= 30, texte: '🔨 F : mur · C : rampe · V : sol (10 🪵 chacun)', tactile: '🔨 🧱 mur · 📐 rampe · ⬛ sol, puis le gros bouton pour poser' },
  { id: 'soin', quand: m => m.ph === 'sol' && m.pv < 70, texte: '❤️ Prends un soin dans ta barre (2 à 6) et garde le clic appuyé', tactile: '❤️ Touche un soin dans ta barre et garde le gros bouton appuyé' },
  { id: 'zone', quand: () => etat.zoneEtat && etat.zoneEtat.retrecit, texte: '🌀 Reste dans le cercle blanc de la carte (M) !' },
];
function majTuto(dt) {
  const t = etat.tuto, el = $('#astuceTuto');
  if (!t) { el.classList.add('cache'); return; }
  t.t -= dt;
  if (t.t > 0) return;
  el.classList.add('cache');
  for (const a of TUTO) {
    if (t.vus.has(a.id) || !a.quand(etat.moi)) continue;
    t.vus.add(a.id); el.textContent = (tactile && a.tactile) || a.texte; el.classList.remove('cache'); t.t = 6.5;
    return;
  }
}

// ---------- Réglages (menu et pause) ----------
function construireReglages(el) {
  el.innerHTML = `
  <div class="groupe-param" data-g="image">
  <label>Qualité de l'image <select data-r="qualite"><option value="haute">✨ Haute (le plus beau)</option><option value="moyenne">Moyenne</option><option value="basse">Basse (si ça rame)</option></select></label>
  <label>Distance d'affichage <select data-r="distance"><option value="courte">Courte</option><option value="normale">Normale</option><option value="loin">Loin</option></select></label>
  <label>Champ de vision <span class="valeur" data-v="fov"></span><input data-r="fov" type="range" min="60" max="95" step="1"></label>
  <label>Images par seconde <input data-r="fps" type="checkbox"></label>
  </div>
  <div class="groupe-param" data-g="controles">
  <label class="pc-seul">Sensibilité souris <span class="valeur" data-v="sensi"></span><input data-r="sensi" type="range" min="0.5" max="3" step="0.1"></label>
  <label class="tactile-seul">Sensibilité au doigt <span class="valeur" data-v="sensiTactile"></span><input data-r="sensiTactile" type="range" min="0.4" max="2.5" step="0.1"></label>
  <label>Sensibilité en visant <span class="valeur" data-v="sensiVisee"></span><input data-r="sensiVisee" type="range" min="0.3" max="1.2" step="0.05"></label>
  <label>Inverser haut / bas <input data-r="inverserY" type="checkbox"></label>
  <label>Commandes tactiles <select data-r="tactile"><option value="auto">Auto (téléphone)</option><option value="oui">Toujours</option><option value="non">Jamais</option></select></label>
  <label class="tactile-seul">Taille des boutons <select data-r="tailleBoutons"><option value="petit">Petits</option><option value="normal">Normaux</option><option value="grand">Grands</option></select></label>
  <label class="tactile-seul">Transparence des boutons <span class="valeur" data-v="opaciteBoutons"></span><input data-r="opaciteBoutons" type="range" min="0.3" max="1" step="0.05"></label>
  <label class="tactile-seul">Vibrations <input data-r="vibrations" type="checkbox"></label>
  </div>
  <div class="groupe-param" data-g="son">
  <label>Volume <span class="valeur" data-v="volume"></span><input data-r="volume" type="range" min="0" max="1" step="0.05"></label>
  <label>Musique <span class="valeur" data-v="musique"></span><input data-r="musique" type="range" min="0" max="1" step="0.05"></label>
  <label>Voir les sons (tirs proches) <input data-r="visuSons" type="checkbox"></label>
  </div>
  <div class="groupe-param" data-g="interface">
  <label>Couleur du viseur <span class="couleurs-viseur">${['#ffffff', '#ffd23f', '#4fff7a', '#4fd1ff', '#ff5d8f'].map(c => `<button type="button" data-c="${c}" style="background:${c}"></button>`).join('')}</span></label>
  <label>Chiffres de dégâts <input data-r="chiffresDegats" type="checkbox"></label>
  </div>`;
  for (const c of el.querySelectorAll('[data-r]')) {
    c.addEventListener(c.tagName === 'SELECT' || c.type === 'checkbox' ? 'change' : 'input', () => {
      const k = c.dataset.r;
      reglages[k] = c.type === 'checkbox' ? c.checked : c.type === 'range' ? +c.value : c.value;
      sauverReglages();
      if (k === 'volume') reglerVolume(reglages.volume);
      if (k === 'musique') { initSons(); reglerMusique(reglages.musique); }
      if (k === 'qualite') { appliquerQualite(); toast('Qualité : ' + c.selectedOptions[0].textContent + ' (l\'herbe change à la prochaine partie)'); }
      if (k === 'fps') $('#fps').classList.toggle('cache', !reglages.fps);
      if (k === 'tactile') {
        tactile = reglages.tactile === 'oui' || (reglages.tactile === 'auto' && tactileAuto);
        document.body.classList.toggle('tactile', tactile);
        remplirAides();
      }
      if (k === 'tailleBoutons' || k === 'opaciteBoutons') appliquerBoutons();
      synchroReglages();
    });
  }
  for (const b of el.querySelectorAll('[data-c]')) b.onclick = () => { reglages.couleurViseur = b.dataset.c; sauverReglages(); synchroReglages(); };
  synchroReglages();
}
function synchroReglages() {
  for (const c of document.querySelectorAll('[data-r]')) {
    const v = reglages[c.dataset.r];
    if (c.type === 'checkbox') c.checked = !!v; else if (document.activeElement !== c) c.value = v;
  }
  // valeurs affichées à côté des curseurs
  const pct = new Set(['volume', 'musique', 'opaciteBoutons']);
  for (const s of document.querySelectorAll('[data-v]')) {
    const v = +reglages[s.dataset.v];
    s.textContent = pct.has(s.dataset.v) ? Math.round(v * 100) + ' %' : s.dataset.v === 'fov' ? v + '°' : '×' + v.toFixed(1);
  }
  for (const b of document.querySelectorAll('[data-c]')) b.classList.toggle('choisi', b.dataset.c === reglages.couleurViseur);
}

// ---------- Commandes tactiles (téléphone, tablette) ----------
const joy = { actif: false, id: null, cx: 0, cy: 0, x: 0, y: 0, force: 0 };
const sprintActif = () => touches.has('ShiftLeft') || touches.has('ShiftRight') || (joy.actif && joy.force > 0.92);
function pleinEcranMobile() {
  if (!tactile) return;
  try {
    const p = document.documentElement.requestFullscreen?.({ navigationUI: 'hide' });
    if (p && p.then) p.then(() => screen.orientation?.lock?.('landscape').catch(() => {})).catch(() => {});
  } catch (e) { /* pas de plein écran (iPhone) */ }
}
function initTactile() {
  const zj = $('#zoneJoy'), zv = $('#zoneVue'), vj = $('#joy'), bj = vj.querySelector('i');
  const R = 55;
  // Joystick : il apparaît là où le pouce gauche se pose
  zj.addEventListener('pointerdown', e => {
    if (!enJeu()) return;
    e.preventDefault(); initSons();
    try { zj.setPointerCapture(e.pointerId); } catch (er) { /* rien */ }
    Object.assign(joy, { actif: true, id: e.pointerId, cx: e.clientX, cy: e.clientY, x: 0, y: 0, force: 0 });
    vj.style.left = e.clientX + 'px'; vj.style.top = e.clientY + 'px'; vj.classList.add('actif');
    bj.style.transform = 'translate(-50%, -50%)';
  });
  zj.addEventListener('pointermove', e => {
    if (!joy.actif || e.pointerId !== joy.id) return;
    let dx = e.clientX - joy.cx, dy = e.clientY - joy.cy;
    const L = Math.hypot(dx, dy);
    if (L > R) { dx *= R / L; dy *= R / L; }
    joy.force = Math.min(1, L / R);
    joy.x = joy.force < 0.15 ? 0 : dx / R; joy.y = joy.force < 0.15 ? 0 : dy / R;
    bj.style.transform = `translate(calc(-50% + ${dx}px), calc(-50% + ${dy}px))`;
  });
  const finJoy = e => {
    if (e.pointerId !== joy.id) return;
    Object.assign(joy, { actif: false, id: null, x: 0, y: 0, force: 0 });
    vj.classList.remove('actif'); vj.style.left = ''; vj.style.top = '';
    bj.style.transform = 'translate(-50%, -50%)';
  };
  zj.addEventListener('pointerup', finJoy); zj.addEventListener('pointercancel', finJoy);

  // Regarder : glisser le doigt sur la droite de l'écran (ou sur le gros bouton de tir)
  const regards = new Map();
  const debutRegard = (el, e) => { try { el.setPointerCapture(e.pointerId); } catch (er) { /* rien */ } regards.set(e.pointerId, { x: e.clientX, y: e.clientY, bouge: 0 }); };
  const bougerRegard = e => {
    const r = regards.get(e.pointerId);
    if (!r) return;
    const dx = e.clientX - r.x, dy = e.clientY - r.y;
    r.x = e.clientX; r.y = e.clientY; r.bouge += Math.abs(dx) + Math.abs(dy);
    if (enJeu()) tourner(dx, dy, 0.0055 * (reglages.sensiTactile || 1));
  };
  zv.addEventListener('pointerdown', e => { if (!enJeu()) return; e.preventDefault(); initSons(); debutRegard(zv, e); });
  zv.addEventListener('pointermove', bougerRegard);
  const finRegard = e => {
    const r = regards.get(e.pointerId);
    regards.delete(e.pointerId);
    // petite touche quand on est éliminé : joueur suivant
    if (r && r.bouge < 12 && enJeu() && etat.moi.ph === 'mort') changerSpectateur();
  };
  zv.addEventListener('pointerup', finRegard); zv.addEventListener('pointercancel', finRegard);

  // Les boutons
  const CODES = { accroupi: 'KeyX', recharger: 'KeyR', mur: 'KeyF', rampe: 'KeyC', sol: 'KeyV', carte: 'KeyM', emote: 'KeyB', jeter: 'KeyG' };
  for (const b of document.querySelectorAll('#tactile [data-t]')) {
    const t = b.dataset.t;
    b.addEventListener('pointerdown', e => {
      e.preventDefault(); e.stopPropagation();
      if (!enJeu()) return;
      initSons();
      const moi = etat.moi;
      b.classList.add('appui');
      if (t === 'tir') {
        if (moi.ph === 'mort') { changerSpectateur(); return; }
        tirAppuye = true; moi.emote = null; debutRegard(b, e);
      } else if (t === 'saut') { touches.add('Space'); actionTouche('Space'); }
      else if (t === 'viser') viseeAppuye = !viseeAppuye;
      else if (t === 'classement') { etat.tableau = !etat.tableau; if (etat.tableau) majTableau(); $('#tableau').classList.toggle('cache', !etat.tableau); }
      else if (t === 'chat') ouvrirChat();
      else if (t === 'pause') { etat.pauseTactile = true; majPause(); }
      else if (t === 'parametres') ouvrirParametres();
      else if (CODES[t]) actionTouche(CODES[t]);
      majTactile();
    });
    if (t === 'tir') b.addEventListener('pointermove', bougerRegard);
    const fin = e => {
      b.classList.remove('appui');
      if (t === 'tir') { tirAppuye = false; regards.delete(e.pointerId); }
      if (t === 'saut') touches.delete('Space');
    };
    b.addEventListener('pointerup', fin); b.addEventListener('pointercancel', fin);
  }
  $('#tactile').addEventListener('contextmenu', e => e.preventDefault());
  // messages rapides (au-dessus du clavier du téléphone)
  const cr = $('#chatRapides');
  for (const m of Object.values(MESSAGES_RAPIDES)) {
    const b = document.createElement('button');
    b.textContent = m;
    b.addEventListener('pointerdown', e => { e.preventDefault(); envoyerChat(m, true); fermerChat(); });
    cr.appendChild(b);
  }
}
// Fenêtre des paramètres (menu, pause, en jeu)
function ouvrirParametres() {
  synchroReglages();
  $('#parametres').classList.remove('cache');
  if (!tactile && etat.ecran === 'jeu') document.exitPointerLock?.();
}
function fermerParametres() { $('#parametres').classList.add('cache'); majPause(); }
function montrerGroupeParam(g) {
  for (const b of document.querySelectorAll('.onglets-param button')) b.classList.toggle('actif', b.dataset.p === g);
  for (const d of document.querySelectorAll('.groupe-param')) d.classList.toggle('cache', d.dataset.g !== g);
}
// Taille et transparence des boutons tactiles
function appliquerBoutons() {
  document.body.classList.remove('tb-petit', 'tb-grand');
  if (reglages.tailleBoutons === 'petit') document.body.classList.add('tb-petit');
  if (reglages.tailleBoutons === 'grand') document.body.classList.add('tb-grand');
  document.documentElement.style.setProperty('--opacite-tb', reglages.opaciteBoutons ?? 0.85);
}
function vibrer(motif) { if (tactile && reglages.vibrations) try { navigator.vibrate?.(motif); } catch (e) { /* pas de vibreur */ } }

// Icônes des boutons selon ce qu'on a en main
function majTactile() {
  if (!tactile || !etat.moi) return;
  const moi = etat.moi, it = moi.inv[moi.slot], def = it && OBJETS[it.objet];
  const icone = moi.ph === 'mort' ? '👁️' : moi.construction ? '🔨' : !def ? '✊' : def.type === 'arme' ? (def.explosif ? '🚀' : '🔫') : def.type === 'melee' ? '⛏️' : def.type === 'lancer' ? '💣' : def.icone;
  const T = $('#tactile');
  T.dataset.ph = moi.ph;
  const tir = $('#tTir'); if (tir.textContent !== icone) tir.textContent = icone;
  const saut = moi.ph === 'dirigeable' ? '🪂' : moi.ph === 'chute' ? '🪁' : '⤴';
  if ($('#tSaut').textContent !== saut) $('#tSaut').textContent = saut;
  $('#tViser').classList.toggle('on', viseeAppuye);
  $('#tAccroupi').classList.toggle('on', !!moi.accroupi);
  for (const k of ['mur', 'rampe', 'sol']) T.querySelector(`[data-t=${k}]`).classList.toggle('on', moi.construction === k);
}

// ---------- Boucle principale ----------
let dernier = performance.now();
function boucle(maintenant) {
  requestAnimationFrame(boucle);
  const dt = Math.min(0.1, (maintenant - dernier) / 1000);
  dernier = maintenant;
  miseAJour(dt);
  ciel.position.copy(camera.position);
  if (etat.ecran === 'jeu' || etat.monde) {
    if (Q().bloom) composer.render(); else renderer.render(scene, camera);
  }
  if (etat.ecran === 'menu' || !$('#fin').classList.contains('cache')) apercu.rendre(dt);
  surveillerFps(dt);
}

// Si ça rame en qualité haute, on le propose de baisser
let fpsT = 0, fpsN = 0, fpsPropose = false;
function surveillerFps(dt) {
  if (etat.ecran !== 'jeu' || fpsPropose || reglages.qualite === 'basse') return;
  fpsT += dt; fpsN++;
  if (fpsT >= 6) {
    const fps = fpsN / fpsT;
    fpsT = 0; fpsN = 0;
    if (fps < 28) { fpsPropose = true; toast(`🐢 Ça rame un peu (${Math.round(fps)} images/s) : baisse la qualité dans ⚙️ Réglages du menu.`, 6000); }
  }
}

// Petits effets d'ambiance autour de la caméra : fumée des cheminées, coffres qui brillent, fontaines
let ambianceT = 0;
function ambiance(dt) {
  const m = etat.monde;
  if (!m) return;
  ambianceT -= dt;
  if (ambianceT > 0) return;
  ambianceT = 0.12;
  const cx = camera.position.x, cz = camera.position.z;
  for (const c of m.cheminees) {
    if (Math.abs(c.x - cx) > 140 || Math.abs(c.z - cz) > 140) continue;
    if (Math.random() < 0.5) particules.ajouter({ x: c.x + (Math.random() - 0.5) * 0.4, y: c.y, z: c.z + (Math.random() - 0.5) * 0.4, vx: 0.4, vy: 1.2, vz: 0.2, couleur: '#e6e9ee', taille: 0.7, tailleFin: 2.6, vie: 3.2, alpha: 0.45, frein: 0.2 });
  }
  for (const c of m.coffres) {
    if (c.ouvert || Math.abs(c.x - cx) > (c.dore ? 80 : 45) || Math.abs(c.z - cz) > (c.dore ? 80 : 45)) continue;
    for (let k = 0; k < (c.dore ? 3 : 1); k++) if (Math.random() < 0.6) particules.ajouter({ x: c.x + (Math.random() - 0.5) * 1.2, y: c.y + 0.3 + Math.random() * 0.6, z: c.z + (Math.random() - 0.5) * 1.2, vy: 0.6 + Math.random() * (c.dore ? 1.5 : 0.6), couleur: '#ffe27a', forme: c.dore ? 2 : 3, taille: c.dore ? 0.3 : 0.22, tailleFin: 0.04, vie: 1, additif: true });
  }
  // constructions abîmées qui fument
  for (const c of m.constructions.values()) {
    if (!c.mesh || c.pv >= c.pvMax * 0.5) continue;
    const q = c.mesh.position;
    if (Math.abs(q.x - cx) > 60 || Math.abs(q.z - cz) > 60 || Math.random() > 0.4) continue;
    particules.ajouter({ x: q.x + (Math.random() - 0.5) * 2.5, y: q.y + 0.5 + Math.random(), z: q.z + (Math.random() - 0.5) * 2.5, vx: 0.2, vy: 0.9, couleur: '#7d7d7d', taille: 0.6, tailleFin: 1.8, vie: 1.5, alpha: 0.35, frein: 0.5 });
  }
  // fumée violette des ravitaillements posés
  for (const r of etat.ravitos.values()) {
    if (r.ouvert || !r.pose || Math.abs(r.x - cx) > 220 || Math.abs(r.z - cz) > 220) continue;
    for (let k = 0; k < 2; k++) particules.ajouter({ x: r.x + (Math.random() - 0.5) * 0.8, y: r.sol + 1.4, z: r.z + (Math.random() - 0.5) * 0.8, vx: 0.4 + Math.random() * 0.3, vy: 2.4 + Math.random(), vz: 0.2, couleur: k ? '#b552ff' : '#d79bff', taille: 1, tailleFin: 3.2, vie: 3.5, alpha: 0.55, frein: 0.25 });
  }
  // étincelles vertes des fontaines de soin
  for (const so of m.sources || []) {
    if (Math.abs(so.x - cx) > 60 || Math.abs(so.z - cz) > 60) continue;
    particules.ajouter({ x: so.x + (Math.random() - 0.5) * 2.6, y: so.y + 0.5, z: so.z + (Math.random() - 0.5) * 2.6, vy: 0.8 + Math.random(), couleur: '#5bffb0', forme: 2, taille: 0.22, tailleFin: 0.04, vie: 1.2, additif: true });
  }
  for (const f of m.lieuxFontaines || []) {
    if (Math.abs(f.x - cx) > 70 || Math.abs(f.z - cz) > 70) continue;
    for (let i = 0; i < 3; i++) { const a = Math.random() * 6.28; particules.ajouter({ x: f.x, y: f.y, z: f.z, vx: Math.cos(a) * 1.2, vy: 3 + Math.random(), vz: Math.sin(a) * 1.2, couleur: '#cdefff', taille: 0.18, tailleFin: 0.1, vie: 0.8, gravite: 9, alpha: 0.85 }); }
  }
}
function miseAJour(dt) {
  if (enJeu()) {
    if (hote && hote.enCours) { hote.tick(dt); etat.temps = hote.temps; } else etat.temps += dt;
    majMoi(dt);
    majAutres(dt);
    majButins(dt);
    majCamera(dt);
    majZone(dt);
    majHUD(dt);
    envoyerEtat(dt);
    etat.monde.animer(dt);
    ambiance(dt);
    majProjectiles(dt);
    majRavitos(dt);
    majBoules(dt);
    majJourNuit(etat.options.entrainement ? 0 : borner((etat.temps - 90) / 420, 0, 1));
    if (etat.dirigeable) {
      const md = etat.meshDirigeable;
      const p = posDirigeable(etat.dirigeable, etat.temps);
      md.visible = etat.temps < etat.dirigeable.duree + 8;
      const fin = Math.max(0, etat.temps - etat.dirigeable.duree);
      md.position.set(p.x + p.vx * fin, p.y + fin * 4, p.z + p.vz * fin);
      md.rotation.y = Math.atan2(-p.vx, -p.vz);
      md.userData.helice.rotation.z += dt * 20;
      md.userData.helice2.rotation.z += dt * 20;
      md.userData.lumiere.visible = Math.sin(etat.temps * 6) > 0;
    }
  } else if (etat.monde) {
    majJourNuit(0);
    scene.fog.far = brumeLoin(); scene.fog.near = 180 * brumeLoin() / 640;
    etat.angleMenu += dt * 0.04;
    camera.fov = 60; camera.updateProjectionMatrix();
    camera.position.set(Math.cos(etat.angleMenu) * 230, 85, Math.sin(etat.angleMenu) * 230);
    camera.lookAt(0, 5, 0);
    placerSoleil(0, 0, 0);
    etat.monde.animer(dt);
    ambiance(dt);
  }
  if (etat.mer) etat.mer.material.uniforms.uTemps.value += dt;
  etat.secousse = Math.max(0, etat.secousse - dt * 2.2);
  majMouettes(dt, performance.now() / 1000);
  // ping vers l'hôte (pour les invités)
  if (!reseau.estHote && reseau.connHote) { etat.pingT -= dt; if (etat.pingT <= 0) { etat.pingT = 2; reseau.versHote({ t: 'ping', c: performance.now() }); } }
  majEffets(dt);
  particules.maj(dt, camera, renderer.domElement.height);
  majDegats(dt);
}

// ---------- Écrans et menus ----------
function afficherEcran(nom) {
  etat.ecran = nom;
  for (const id of ['menu', 'salon', 'chargement']) $('#' + id).classList.toggle('cache', id !== nom);
  $('#hud').classList.toggle('cache', nom !== 'jeu');
  if (nom !== 'jeu') { $('#grandeCarte').classList.add('cache'); etat.grandeCarte = false; }
  if (nom === 'menu') menus.montrerPage(menus.page || 'jouer');
  if (nom === 'menu' || nom === 'salon') { jouerMusique('menu'); reglerVent(0); }
  document.body.classList.toggle('en-jeu', nom === 'jeu');
  if (nom !== 'jeu') { joy.actif = false; joy.x = joy.y = joy.force = 0; etat.pauseTactile = false; }
  if (nom !== 'jeu') { $('#chatSaisie').classList.add('cache'); etat.tableau = false; $('#tableau').classList.add('cache'); }
  majPause();
}
const ASTUCES = ['Construis une rampe (C) pour prendre de la hauteur !', 'Les coffres brillent : ouvre-les avec E.', 'Frappe les arbres avec la pioche pour gagner du bois 🪵.',
  'Les objets dorés sont légendaires : ils font plus de dégâts.', 'Reste dans le cercle blanc de la carte quand la zone avance.', 'Appuie sur B pour faire ton émote 💃.',
  'Chaque élimination rapporte 25 🪙 à dépenser dans la boutique.', 'Les champignons violets te font rebondir très haut 🍄.', 'Les fontaines vertes des villages te soignent ✚.',
  'Les coffres dorés contiennent une arme épique ou légendaire 🌟.', 'Un ravitaillement tombe plusieurs fois par partie : suis la fumée violette 📦.',
  'Accroupi (X), tu tires plus précisément.', 'Sur la grande carte (M), clique pour poser un repère.', 'Attention : tomber de trop haut fait mal !',
  'Les défis du jour rapportent des 🪙 et de l\'XP.', 'Tab affiche le classement de la partie.'];
function chargement(texte) {
  $('#txtChargement').textContent = texte;
  $('#astuceChargement').textContent = '💡 ' + ASTUCES[Math.floor(Math.random() * ASTUCES.length)];
  afficherEcran('chargement');
}

function texteOptions(o) {
  return [o.mode === 'duo' ? '👥 Duos' : '👤 Chacun pour soi', `🤖 ${o.bots} bots (${['facile', 'normal', 'difficile'][o.difficulte] || 'normal'})`,
    `🌀 Zone ${o.vitesseZone || 'normale'}`, o.matsDepart ? `🪵 ${o.matsDepart} au départ` : null, o.fete ? '🎉 Butin de fête' : null, o.entrainement ? '🎯 Entraînement' : null].filter(Boolean).join(' · ');
}
function majSalon(m) {
  // quelqu'un arrive dans le salon
  if (etat.salonIds && etat.ecran === 'salon') {
    for (const j of m.joueurs) if (j.id !== reseau.monId && !etat.salonIds.includes(j.id)) { toast(`👋 ${j.nom} a rejoint le salon`); son('arrivee'); }
  }
  etat.salonIds = m.joueurs.map(j => j.id);
  etat.salon = m;
  const ul = $('#listeJoueurs');
  ul.innerHTML = '';
  for (const j of m.joueurs) {
    const li = document.createElement('li');
    let avatar = '';
    try {
      const look = nettoyerLook(j.look);
      avatar = `<img class="avatar" alt="" src="${apercu.miniatureCosmetique({ cat: 'tenue', id: look.tenue }, j.couleur)}">`;
    } catch (e) { avatar = `<span class="pastille" style="background:${echapper(j.couleur)}"></span>`; }
    li.innerHTML = `${avatar}${echapper(j.nom)}${j.hote ? '<span class="tag">👑 hôte</span>' : ''}${j.id === reseau.monId ? '<span class="tag">(toi)</span>' : ''}`;
    if (reseau.estHote && reseau.code && j.id !== reseau.monId) {
      const b = document.createElement('button');
      b.className = 'exclure'; b.title = 'Exclure ce joueur'; b.textContent = '✖';
      b.onclick = () => { if (confirm(`Exclure ${j.nom} de la partie ?`)) reseau.versHote({ t: 'exclure', id: j.id }); };
      li.appendChild(b);
    }
    ul.appendChild(li);
  }
  $('#resumeOptions').textContent = texteOptions(m.options);
  $('#chatSalon').classList.toggle('cache', !reseau.code);
  $('#nbJoueurs').textContent = `(${m.joueurs.length} + ${m.options.bots} bots)`;
  $('#blocCode').classList.toggle('cache', !m.code);
  $('#codePartie').textContent = m.code || '';
  $('#optionsHote').classList.toggle('cache', !reseau.estHote);
  $('#attenteHote').classList.toggle('cache', reseau.estHote || m.enCours);
  if (!reseau.estHote) $('#infoSalon').textContent = m.enCours ? 'Une partie est en cours : tu joueras à la prochaine !' : '';
  if (etat.ecran === 'chargement' || etat.ecran === 'menu') afficherEcran('salon');
}

function quitter() {
  try { reseau.fermer(); } catch (e) { /* rien */ }
  location.href = location.pathname;
}

function lireOptionsSalon() {
  if (!hote) return;
  const o = hote.options;
  o.bots = +$('#nbBots').value; o.difficulte = +$('#difficulte').value;
  o.mode = $('#modeJeu').value; o.vitesseZone = $('#vitesseZone').value; o.matsDepart = +$('#matsDepart').value;
  o.fete = $('#optFete').checked; o.entrainement = $('#optEntrainement').checked;
}
function demarrerHote() {
  hote = new Hote(reseau, { preparerMonde });
  lireOptionsSalon();
  reseau.surMessageClient = recevoir;
  reseau.versHote({ t: 'bonjour', nom: reglages.pseudo, couleur: reglages.couleur, look: profil.equipe });
}

function lirePseudo() {
  let p = $('#pseudo').value.trim().slice(0, 16);
  if (!p) { p = 'Joueur' + Math.floor(Math.random() * 900 + 100); $('#pseudo').value = p; }
  reglages.pseudo = p; sauverReglages();
  return p;
}

function initMenu() {
  $('#pseudo').value = reglages.pseudo;
  const cc = $('#couleurs');
  for (const c of COULEURS) {
    const b = document.createElement('button');
    b.style.background = c; b.title = c;
    if (c === reglages.couleur) b.className = 'choisi';
    b.onclick = () => { reglages.couleur = c; sauverReglages(); for (const x of cc.children) x.className = x === b ? 'choisi' : ''; menus.montrerPerso(); };
    cc.appendChild(b);
  }
  $('#pseudo').addEventListener('input', () => { reglages.pseudo = $('#pseudo').value.trim().slice(0, 16); $('#nomPodium').textContent = reglages.pseudo || 'Toi'; sauverReglages(); });
  construireReglages($('#reglagesModal'));
  appliquerBoutons();
  for (const b of document.querySelectorAll('.onglets-param button')) b.onclick = () => montrerGroupeParam(b.dataset.p);
  montrerGroupeParam('image');
  for (const id of ['#btnParametres', '#btnParametresMenu', '#btnParametresPause']) $(id).onclick = () => { initSons(); ouvrirParametres(); };
  $('#fermerParametres').onclick = fermerParametres;
  $('#parametres').addEventListener('pointerdown', e => { if (e.target.id === 'parametres') fermerParametres(); });
  reglerVolume(reglages.volume); reglerMusique(reglages.musique);
  $('#fps').classList.toggle('cache', !reglages.fps);
  // le son démarre au premier clic (les navigateurs l'exigent)
  document.addEventListener('pointerdown', () => initSons(), { once: true });
  $('#btnPleinEcran').onclick = () => { if (document.fullscreenElement) document.exitFullscreen(); else document.documentElement.requestFullscreen?.().catch(() => {}); };

  const params = new URLSearchParams(location.search);
  if (params.get('code')) { $('#codeRejoindre').value = params.get('code').toUpperCase().slice(0, 4); }
  if (params.get('erreur') === 'hote') $('#erreurMenu').textContent = 'L\'hôte a quitté la partie.';
  if (params.get('erreur') === 'exclu') $('#erreurMenu').textContent = 'L\'hôte t\'a exclu de la partie.';

  $('#btnSolo').onclick = () => {
    initSons(); lirePseudo(); pleinEcranMobile();
    reseau.solo();
    demarrerHote();
  };
  $('#btnCreer').onclick = async () => {
    initSons(); lirePseudo(); pleinEcranMobile();
    chargement('Création de la partie…');
    for (let essai = 0; essai < 3; essai++) {
      try {
        await reseau.heberger(codeAleatoire(4));
        demarrerHote();
        return;
      } catch (err) {
        reseau.fermer();
        if (essai === 2 || (err.type && err.type !== 'unavailable-id')) {
          afficherEcran('menu');
          $('#erreurMenu').textContent = 'Impossible de créer la partie : ' + (err.message || err.type) + ' — tu peux jouer en solo.';
          return;
        }
      }
    }
  };
  const rejoindre = async () => {
    initSons(); lirePseudo(); pleinEcranMobile();
    const code = $('#codeRejoindre').value.trim().toUpperCase();
    if (code.length !== 4) { $('#erreurMenu').textContent = 'Le code fait 4 lettres/chiffres.'; return; }
    chargement('Connexion à la partie ' + code + '…');
    reseau.surMessageClient = recevoir;
    reseau.surPerteHote = () => { if (!etat.exclu) location.href = location.pathname + '?erreur=hote'; };
    try {
      await reseau.rejoindre(code);
      reseau.versHote({ t: 'bonjour', nom: reglages.pseudo, couleur: reglages.couleur, look: profil.equipe });
    } catch (err) {
      reseau.fermer();
      afficherEcran('menu');
      $('#erreurMenu').textContent = err.message || ('Erreur : ' + err.type);
    }
  };
  $('#btnRejoindre').onclick = rejoindre;
  $('#codeRejoindre').addEventListener('keydown', e => { if (e.key === 'Enter') rejoindre(); });

  // Salon
  $('#nbBots').oninput = e => {
    $('#nbBotsTxt').textContent = e.target.value;
    if (hote) { lireOptionsSalon(); hote.diffuserSalon(); }
  };
  for (const id of ['#difficulte', '#modeJeu', '#vitesseZone', '#matsDepart', '#optFete', '#optEntrainement']) $(id).onchange = () => { if (hote) { lireOptionsSalon(); hote.diffuserSalon(); } };
  // discussion dans le salon
  $('#chatSalonSaisie').addEventListener('keydown', e => { if (e.key === 'Enter') { envoyerChat(e.target.value); e.target.value = ''; } });
  // discussion en jeu
  $('#chatSaisie').addEventListener('keydown', e => {
    e.stopPropagation();
    if (e.key === 'Enter') { envoyerChat(e.target.value); fermerChat(); }
    else if (e.key === 'Escape') fermerChat();
  });
  $('#chatSaisie').addEventListener('blur', () => setTimeout(fermerChat, 0));
  // repère sur la grande carte
  const cvGrande = $('#grandeCarte canvas');
  cvGrande.addEventListener('pointerdown', e => {
    if (!enJeu()) return;
    if (e.button === 2) { etat.repere = null; son('clic', 0.5); return; }
    const rc = cvGrande.getBoundingClientRect();
    const x = (e.clientX - rc.left) / rc.width * DEMI * 2 - DEMI, z = (e.clientY - rc.top) / rc.height * DEMI * 2 - DEMI;
    // au doigt : toucher le repère l'enlève
    if (etat.repere && e.pointerType !== 'mouse' && Math.hypot(x - etat.repere.x, z - etat.repere.z) < DEMI * 0.06) { etat.repere = null; son('clic', 0.5); return; }
    etat.repere = { x, z };
    son('clic');
  });
  $('#fermerCarte').onclick = () => { if (enJeu() && etat.grandeCarte) actionTouche('KeyM'); };
  // le texte « Ramasser / Ouvrir » se touche du doigt
  $('#invite').addEventListener('pointerdown', e => { e.stopPropagation(); if (enJeu()) interagir(); });
  initTactile();
  cvGrande.addEventListener('contextmenu', e => e.preventDefault());
  $('#btnLancer').onclick = () => {
    if (!hote) return;
    initSons();
    chargement('L\'île se prépare…');
    verrouiller();
    setTimeout(() => hote.demarrer(), 60);
  };
  $('#btnCopier').onclick = () => {
    const lien = `${location.origin}${location.pathname}?code=${reseau.code}`;
    navigator.clipboard?.writeText(lien).then(() => { $('#btnCopier').textContent = '✅ Lien copié ! Envoie-le à tes potes'; });
  };
  $('#btnQuitterSalon').onclick = quitter;
  $('#btnReprendre').onclick = () => { initSons(); verrouiller(); };
  $('#btnQuitter').onclick = quitter;
  $('#btnQuitterFin').onclick = quitter;
  $('#btnRejouer').onclick = () => {
    if (!hote) return;
    hote.retourSalon();
    // en solo : on relance tout de suite une nouvelle partie
    if (!reseau.code) {
      verrouiller();
      setTimeout(() => { chargement('L\'île se prépare…'); setTimeout(() => hote.demarrer(), 60); }, 0);
    }
  };
  remplirAides();
}

// ---------- C'est parti ----------
// On attend les modèles faits dans Blender (5 s maximum, sinon le jeu garde les modèles en cubes)
await Promise.race([Promise.all([modelesPrets, corpsPret]), new Promise(r => setTimeout(r, 6000))]);
const apercu = new Apercu();
const menus = new Menus({
  apercu, profil, reglages, son: n => { initSons(); son(n); },
  surLook: () => { if (etat.ecran === 'salon') reseau.versHote({ t: 'look', look: profil.equipe, couleur: reglages.couleur }); },
});
initMenu();
afficherEcran('menu');
const bonus = bonusDuJour(profil);
if (bonus) setTimeout(() => { toast(`🎁 Bonus du jour : +${bonus} 🪙 !`, 4000); menus.majPieces(true); }, 900);
preparerMonde(Math.floor(Math.random() * 1e9));
requestAnimationFrame(boucle);

// Pour tester depuis la console
window.natx = {
  etat, reseau, get hote() { return hote; }, touches, recevoir, preparerMonde, camera, scene, renderer, version: 1,
  // Avance le jeu de quelques secondes d'un coup (pour les tests)
  simuler(secondes, pas = 1 / 30) {
    const n = Math.round(secondes / pas);
    for (let i = 0; i < n; i++) miseAJour(pas);
    renderer.render(scene, camera);
  },
  tirer(actif) { tirAppuye = actif; }, viser(actif) { viseeAppuye = actif; },
  explosionVisuelle, lancerProjectile, envoyerChat, majJourNuit, profil, reglages,
};
