// Aperçu 3D du personnage sur un podium (menu, boutique, casier)
// + petites images 3D des objets (miniatures).
import * as THREE from 'three';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { creerPersonnage, modelePioche, modeleDeltaplane, animerPersonnage, tenirObjet } from './personnage.js';
import { modeleObjet } from './armes.js';

export class Apercu {
  constructor() {
    this.canvas = document.createElement('canvas');
    this.canvas.className = 'apercu3d';
    this.r = new THREE.WebGLRenderer({ canvas: this.canvas, antialias: true, alpha: true });
    this.r.setPixelRatio(Math.min(devicePixelRatio, 2));
    this.r.toneMapping = THREE.NeutralToneMapping;
    this.r.toneMappingExposure = 1.05;
    this.r.shadowMap.enabled = true;
    this.scene = new THREE.Scene();
    const pm = new THREE.PMREMGenerator(this.r);
    this.env = pm.fromScene(new RoomEnvironment(), 0.04).texture;
    this.scene.environment = this.env;
    this.lumieres(this.scene);
    // Podium
    const podium = new THREE.Group();
    const socle = new THREE.Mesh(new THREE.CylinderGeometry(1.25, 1.35, 0.3, 48), new THREE.MeshStandardMaterial({ color: '#1b2b55', roughness: 0.4, metalness: 0.3 }));
    socle.position.y = -0.15; socle.receiveShadow = true;
    const dessus = new THREE.Mesh(new THREE.CylinderGeometry(1.15, 1.15, 0.02, 48), new THREE.MeshStandardMaterial({ color: '#2a427f', roughness: 0.3, metalness: 0.2 }));
    dessus.position.y = 0.005; dessus.receiveShadow = true;
    const anneau = new THREE.Mesh(new THREE.TorusGeometry(1.3, 0.035, 8, 64), new THREE.MeshBasicMaterial({ color: new THREE.Color('#4fd1ff').multiplyScalar(1.5) }));
    anneau.rotation.x = Math.PI / 2; anneau.position.y = -0.02;
    podium.add(socle, dessus, anneau);
    this.scene.add(podium);
    this.podium = podium;
    this.vue = new THREE.Group();
    this.scene.add(this.vue);
    this.camera = new THREE.PerspectiveCamera(28, 1, 0.1, 60);
    this.cadrage = 'corps';
    this.angle = 0.35; this.vitesseRot = 0.35;
    this.etatAnim = {};
    this.cache = new Map();
    // Tourner le perso à la souris
    let glisse = null;
    this.canvas.addEventListener('pointerdown', e => { glisse = e.clientX; this.canvas.setPointerCapture(e.pointerId); });
    this.canvas.addEventListener('pointermove', e => { if (glisse !== null) { this.angle += (e.clientX - glisse) * 0.012; glisse = e.clientX; this.pause = 2; } });
    this.canvas.addEventListener('pointerup', () => { glisse = null; });
    // Scène pour les miniatures
    this.sceneMini = new THREE.Scene();
    this.sceneMini.environment = this.env;
    this.lumieres(this.sceneMini);
    this.camMini = new THREE.PerspectiveCamera(30, 1, 0.05, 60);
  }

  lumieres(s) {
    s.add(new THREE.HemisphereLight('#ffffff', '#3a4466', 1.4));
    const cle = new THREE.DirectionalLight('#fff3e0', 2.6); cle.position.set(3, 6, 5); cle.castShadow = true;
    cle.shadow.mapSize.set(1024, 1024);
    Object.assign(cle.shadow.camera, { left: -3, right: 3, top: 4, bottom: -1, near: 0.5, far: 20 });
    const contre = new THREE.DirectionalLight('#7fc8ff', 1.8); contre.position.set(-4, 3, -5);
    s.add(cle, contre);
  }

  monter(el) {
    if (!el) return;
    if (this.canvas.parentElement !== el) el.appendChild(this.canvas);
    this.redim();
  }

  redim() {
    const p = this.canvas.parentElement;
    if (!p) return;
    const w = p.clientWidth, h = p.clientHeight;
    if (!w || !h || (w === this.w && h === this.h)) return;
    this.w = w; this.h = h;
    this.r.setSize(w, h, false);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
  }

  // look = tenue, chapeau… ; cadrage = 'corps' | 'tete' | 'dos' | 'delta' | 'pioche'
  montrer({ couleur, look, numero = 0, cadrage = 'corps', emote = null }) {
    if (this.perso) this.vue.remove(this.perso);
    this.perso = creerPersonnage(couleur, null, numero, look);
    this.vue.add(this.perso);
    this.cadrage = cadrage;
    this.emote = emote;
    this.planeur = cadrage === 'delta';
    tenirObjet(this.perso, cadrage === 'pioche' ? 'pioche' : null, 0);
    if (cadrage === 'dos') this.angle = Math.PI + 0.5;
    else if (cadrage !== this.ancienCadrage) this.angle = 0.35;
    this.ancienCadrage = cadrage;
  }

  rendre(dt) {
    if (!this.canvas.isConnected || !this.perso || this.canvas.offsetParent === null) return;
    this.redim();
    if (this.pause > 0) this.pause -= dt; else this.angle += dt * this.vitesseRot;
    this.vue.rotation.y = this.angle + Math.PI; // le perso regarde vers -z : on le tourne vers la caméra
    const c = this.cadrage;
    const cibles = {
      corps: [0, 1.3, 7.6, 0, 1.05, 0], pioche: [0, 1.3, 7.6, 0, 1.05, 0], dos: [0, 1.3, 7.6, 0, 1.05, 0],
      tete: [0, 2.0, 2.3, 0, 1.92, 0], delta: [0, 3.0, 11.5, 0, 2.2, 0],
    }[c] || [0, 1.3, 7.6, 0, 1.05, 0];
    this.camera.position.set(cibles[0], cibles[1], cibles[2]);
    this.camera.lookAt(cibles[3], cibles[4], cibles[5]);
    this.perso.position.y = this.planeur ? 0.6 + Math.sin(performance.now() / 600) * 0.1 : 0;
    animerPersonnage(this.perso, dt, { vitesse: 0, auSol: !this.planeur, planeur: this.planeur, arme: c === 'pioche' ? 'pioche' : null, pitch: 0, emote: this.emote });
    if (c === 'pioche' && !this.emote) this.perso.userData.bd.rotation.set(1.2, 0, 0.2);
    this.r.render(this.scene, this.camera);
  }

  // Petite image (dataURL) d'un objet, gardée en mémoire
  miniature(cle, fabriquer, direction = [0.9, 0.5, 1.6], taille = 160) {
    if (this.cache.has(cle)) return this.cache.get(cle);
    const objet = fabriquer();
    this.sceneMini.add(objet);
    objet.updateMatrixWorld(true);
    const boite = new THREE.Box3().setFromObject(objet);
    const centre = boite.getCenter(new THREE.Vector3()), dim = boite.getSize(new THREE.Vector3());
    const rayon = Math.max(dim.x, dim.y, dim.z) * 0.62;
    const d = new THREE.Vector3(...direction).normalize();
    const dist = rayon / Math.tan(this.camMini.fov * Math.PI / 360) * 1.05;
    this.camMini.position.copy(centre).addScaledVector(d, dist);
    this.camMini.lookAt(centre);
    this.camMini.near = dist / 20; this.camMini.far = dist * 4;
    this.camMini.updateProjectionMatrix();
    const ancienW = this.w, ancienH = this.h;
    this.r.setSize(taille, taille, false);
    this.r.render(this.sceneMini, this.camMini);
    const url = this.canvas.toDataURL('image/png');
    this.sceneMini.remove(objet);
    this.r.setSize(ancienW || 1, ancienH || 1, false);
    if (this.perso && ancienW) this.r.render(this.scene, this.camera);
    this.cache.set(cle, url);
    return url;
  }

  // Miniature d'un objet de la boutique
  miniatureCosmetique(o, couleur) {
    const cle = 'c:' + o.cat + ':' + o.id + ':' + couleur;
    if (o.cat === 'pioche') return this.miniature(cle, () => { const g = modelePioche(o.id); g.rotation.set(-0.9, 0.6, 0.6); return g; }, [0.2, 0.3, 1]);
    if (o.cat === 'deltaplane') return this.miniature(cle, () => { const g = new THREE.Group(); const d = modeleDeltaplane(o.id, couleur); d.position.y = 0; g.add(d); return g; }, [0.4, 1.1, 1.4]);
    if (o.cat === 'trainee') return null;
    const look = {};
    look[o.cat] = o.id;
    if (o.cat !== 'chapeau') look.chapeau = 'aucun';
    return this.miniature(cle, () => {
      const p = creerPersonnage(couleur, null, 0, look);
      if (o.cat === 'emote') animerPersonnage(p, { salut: 0.2, applaudir: 0.1, sautjoie: 0.3, robot: 0.4, toupie: 0.1, victoire: 0.25, zen: 0.5 }[o.id] || 0.3, { auSol: true, emote: o.id });
      else animerPersonnage(p, 0.01, { auSol: true });
      p.userData.ombre.visible = false;
      if (o.cat === 'chapeau') { const t = p.userData.tete; const g = new THREE.Group(); g.add(t); t.position.y = 0; t.rotation.set(0, Math.PI, 0); return g; }
      p.rotation.y = o.cat === 'dos' ? 0.6 : Math.PI;
      return p;
    }, o.cat === 'chapeau' ? [0.6, 0.35, 1.4] : [0.5, 0.25, 1.6]);
  }

  // Miniature d'une arme / d'un objet du jeu (barre d'objets)
  miniatureObjet(objet, rarete, pioche) {
    const cle = 'o:' + objet + ':' + rarete + ':' + (pioche || '');
    return this.miniature(cle, () => {
      const g = objet === 'pioche' ? modelePioche(pioche) : modeleObjet(objet, rarete);
      const h = new THREE.Group(); h.add(g);
      g.rotation.set(0, objet === 'pioche' ? -1.2 : -Math.PI / 2, objet === 'pioche' ? 0.7 : 0);
      return h;
    }, [0.15, 0.35, 1], 128);
  }
}
