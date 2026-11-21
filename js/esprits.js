// Esprits de NATX ROYALE (création originale, modèles de la session modélisation : modeles/esprits_v001.glb).
// De petits compagnons flottent au-dessus des autels de l'île. On en capture un (E / bouton 👆) :
// il te suit, te donne un bonus passif et un pouvoir (touche A, ou bouton ✨ sur téléphone) avec un temps de recharge.
// Un seul esprit à la fois ; il s'en va quand tu es éliminé. L'autel en fait apparaître un nouveau plus tard.
// L'hôte décide de tout (captures, pouvoirs, soins, constructions) ; les joueurs affichent et appliquent
// ce qui touche à leur propre déplacement (vitesse, double saut, bond).
import * as THREE from 'three';
import { DEMI } from './monde.js';
import { arrondi } from './outils.js';
import { modeleGlb, clipAnimation } from './modeles.js';

// ids = noms des modèles livrés (esprit_<id> dans esprits_v001.glb)
export const ESPRITS = {
  soin: {
    nom: 'Pousse', role: 'Soin', icone: '🌱', couleur: '#a8ff7a', clair: '#e6ffd6',
    passif: 'Ta vie remonte toute seule jusqu\'à 75', pouvoir: 'Bourgeon', descPouvoir: '+40 PV pour toi et tes coéquipiers proches', recharge: 30,
  },
  mobilite: {
    nom: 'Filou', role: 'Mobilité', icone: '☁️', couleur: '#5ff2ff', clair: '#e0fdff',
    passif: '+12 % de vitesse, double saut, pas de dégâts de chute', pouvoir: 'Envol', descPouvoir: 'Un grand bond vers l\'avant', recharge: 12,
  },
  protection: {
    nom: 'Gardien', role: 'Protection', icone: '🛡️', couleur: '#9ff0ff', clair: '#ffffff',
    passif: 'Ton bouclier remonte tout seul jusqu\'à 50', pouvoir: 'Carapace', descPouvoir: '+50 de bouclier d\'un coup', recharge: 30,
  },
  vision: {
    nom: 'Zyeuto', role: 'Vision', icone: '👁️', couleur: '#ff6ef0', clair: '#ffd6fb',
    passif: 'Les ennemis proches (35 m) sont sur ta mini-carte', pouvoir: 'Œil perçant', descPouvoir: 'Montre les ennemis à 70 m à travers les murs pendant 6 s', recharge: 25,
  },
  batisseur: {
    nom: 'Briquet', role: 'Bâtisseur', icone: '🔨', couleur: '#fff0a8', clair: '#ffffff',
    passif: 'Construire coûte 5 matériaux au lieu de 10', pouvoir: 'Fort express', descPouvoir: '4 murs autour de toi, gratuits', recharge: 28,
  },
  // ----- les 10 esprits ajoutés le 21 nov. 2026 (modèles commandés : modeles/esprits_plus_v001.glb) -----
  feu: {
    nom: 'Braise', role: 'Attaque', icone: '🔥', couleur: '#ff7a3d', clair: '#ffd9b8',
    passif: '+10 % de dégâts avec tes armes', pouvoir: 'Boule de feu', descPouvoir: 'Une boule de feu part droit devant et explose (jusqu’à 35 dégâts)', recharge: 20,
  },
  glace: {
    nom: 'Givrette', role: 'Glace', icone: '❄️', couleur: '#9fd8ff', clair: '#ffffff',
    passif: 'Tes tirs ralentissent l’ennemi touché pendant 1 s', pouvoir: 'Blizzard', descPouvoir: 'Gèle les ennemis à 10 m pendant 3 s : ils avancent au ralenti', recharge: 28,
  },
  foudre: {
    nom: 'Zap', role: 'Foudre', icone: '⚡', couleur: '#ffe14d', clair: '#fff9c9',
    passif: 'Chaque élimination te rend 20 de bouclier', pouvoir: 'Éclair en chaîne', descPouvoir: '30 dégâts à l’ennemi le plus proche (25 m), puis 15 à deux autres', recharge: 30,
  },
  vent: {
    nom: 'Zephyr', role: 'Vent', icone: '🌪️', couleur: '#b8fff0', clair: '#ffffff',
    passif: 'Tu sautes 50 % plus haut', pouvoir: 'Bourrasque', descPouvoir: 'Repousse fort les ennemis à 8 m', recharge: 22,
  },
  nature: {
    nom: 'Racine', role: 'Récolte', icone: '🍄', couleur: '#c9a25a', clair: '#f3e2bd',
    passif: 'Tu récoltes 2 fois plus de matériaux', pouvoir: 'Ronces', descPouvoir: 'Pose un piège : l’ennemi qui marche dessus est bloqué 2 s (15 dégâts)', recharge: 25,
  },
  ombre: {
    nom: 'Minuit', role: 'Furtivité', icone: '🌙', couleur: '#8a6bff', clair: '#d9ceff',
    passif: 'L’esprit Zyeuto ne te voit pas', pouvoir: 'Clone', descPouvoir: 'Un faux toi part en courant et les bots te perdent de vue', recharge: 30,
  },
  temps: {
    nom: 'Tic-Tac', role: 'Temps', icone: '⏰', couleur: '#c9b6ff', clair: '#ffffff',
    passif: 'Tu recharges tes armes 30 % plus vite', pouvoir: 'Retour', descPouvoir: 'Te ramène où tu étais il y a 4 secondes', recharge: 25,
  },
  eau: {
    nom: 'Goutte', role: 'Eau', icone: '💧', couleur: '#4fb3ff', clair: '#d6efff',
    passif: 'Tu nages aussi vite que tu cours', pouvoir: 'Bulle', descPouvoir: 'Pendant 6 s tu rebondis très haut, sans dégâts de chute', recharge: 20,
  },
  chance: {
    nom: 'Pépite', role: 'Trésor', icone: '🍀', couleur: '#ffc83d', clair: '#fff1c2',
    passif: 'Les coffres fermés proches (40 m) sont sur ta mini-carte', pouvoir: 'Jackpot', descPouvoir: 'Un objet surprise tombe devant toi', recharge: 45,
  },
  etoile: {
    nom: 'Lumi', role: 'Étoile', icone: '🌟', couleur: '#fff27a', clair: '#ffffff',
    passif: 'Une fois par partie, elle te sauve d’un coup mortel (il te reste 40 PV)', pouvoir: 'Étoile filante', descPouvoir: 'Tu fonces tout droit sur 14 m et tu fais 20 dégâts à ceux que tu traverses', recharge: 18,
  },
};
export const TYPES_ESPRITS = Object.keys(ESPRITS);

// Personnalités : quelques répliques (bulles et fil d'infos) ; elles ne changent rien aux pouvoirs
export const PERSONNALITES = {
  soin: { trait: 'Douce et attentionnée, elle pousse partout où elle passe.',
    capture: ['On va se requinquer !', 'Une petite pousse, et ça repart !', 'Je veille sur toi.'],
    pouvoir: ['Bourgeon !', 'Respire un grand coup !', 'Tout le monde reprend des couleurs !'],
    repos: ['Tu as bu de l\'eau aujourd\'hui ?', 'J\'aime le soleil du matin.', 'Chut… j\'écoute l\'herbe pousser.'] },
  mobilite: { trait: 'Pilote casse-cou qui ne tient jamais en place.',
    capture: ['Accroche-toi, on décolle !', 'Plus vite que le vent !', 'Lunettes : OK. Départ !'],
    pouvoir: ['Envol !', 'Wiiiiz !', 'Personne ne nous rattrape !'],
    repos: ['On s\'ennuie, non ?', 'J\'ai compté 47 nuages.', 'Un tour de piste ?'] },
  protection: { trait: 'Chevalier de cristal, sérieux et toujours prêt.',
    capture: ['Bouclier levé, je suis là.', 'Rien ne passera.', 'Gardien au rapport.'],
    pouvoir: ['Carapace !', 'Derrière moi !', 'Mur de cristal !'],
    repos: ['Je monte la garde.', 'Mon armure brille ? Bien.', 'Toujours prêt.'] },
  vision: { trait: 'Curieux et un peu fouineur : il voit TOUT.',
    capture: ['Je les vois venir…', 'Rien ne m\'échappe !', 'Un œil sur tout le monde.'],
    pouvoir: ['Œil perçant !', 'Je vous vois !', 'Coucou, derrière le mur !'],
    repos: ['Tu as une miette sur la joue.', 'J\'ai vu un écureuil.', 'Je ne cligne jamais. Enfin… presque.'] },
  batisseur: { trait: 'Petit ouvrier pressé qui adore construire.',
    capture: ['Au boulot !', 'Casque mis, marteau prêt !', 'On construit quoi ?'],
    pouvoir: ['Fort express !', 'Et hop, quatre murs !', 'Chantier terminé !'],
    repos: ['Ce mur est un peu penché…', 'Toc toc toc.', 'J\'ai besoin de briques.'] },
  feu: { trait: 'Petite braise qui s’enflamme pour un rien.',
    capture: ['Ça va chauffer !', 'J’ai le feu sacré !', 'On allume la mèche ?'],
    pouvoir: ['Boule de feu !', 'Attention, c’est chaud !', 'Et boum !'],
    repos: ['Tu as des chamallows ?', 'Je crépite d’impatience.', 'Il fait bon, non ?'] },
  glace: { trait: 'Flocon timide qui garde toujours son sang-froid.',
    capture: ['Brrr… enchantée.', 'On reste calmes.', 'Pas de panique, je gèle tout.'],
    pouvoir: ['Blizzard !', 'On se calme !', 'Restez au frais !'],
    repos: ['Tu veux un glaçon ?', 'J’adore l’hiver.', 'Atchoum ! … pardon.'] },
  foudre: { trait: 'Petit nuage électrique incapable de rester en place.',
    capture: ['Bzzt ! Je suis chargé !', 'Ça va faire des étincelles !', 'Branché !'],
    pouvoir: ['Éclair en chaîne !', 'Bzzzt !', 'Et un, et deux, et trois !'],
    repos: ['J’ai les cheveux qui se dressent.', 'Tic… tic… bzzt.', 'Il va y avoir de l’orage.'] },
  vent: { trait: 'Tourbillon farceur, la tête toujours en l’air.',
    capture: ['Hop, je te décoiffe !', 'On s’envole ?', 'Du vent dans les voiles !'],
    pouvoir: ['Bourrasque !', 'Pfffouuu !', 'Du balai !'],
    repos: ['Tu sens ce courant d’air ?', 'Je fais tourner les feuilles.', 'Ton écharpe est mal mise.'] },
  nature: { trait: 'Vieille petite bûche qui connaît tous les coins à champignons.',
    capture: ['Au travail, jeune pousse !', 'J’ai du bois en réserve.', 'On ramasse tout !'],
    pouvoir: ['Ronces !', 'Attention où tu marches !', 'Ça pique !'],
    repos: ['Dans mon temps, les arbres étaient plus grands.', 'Tiens, un champignon.', 'Je prends racine.'] },
  ombre: { trait: 'Petite ombre discrète qui adore faire des blagues.',
    capture: ['Chut… je suis là.', 'Personne ne nous a vus.', 'On disparaît ?'],
    pouvoir: ['Clone !', 'Lequel est le vrai ?', 'Coucou, c’est pas moi !'],
    repos: ['Tu m’as vue ? Non ? Parfait.', 'J’aime bien la nuit.', 'Bouh ! … raté.'] },
  temps: { trait: 'Petit réveil pressé, toujours en avance.',
    capture: ['Pile à l’heure !', 'Tic, tac, on y va !', 'On n’a pas toute la journée !'],
    pouvoir: ['Retour !', 'On rembobine !', 'Comme si de rien n’était !'],
    repos: ['Il est quelle heure ? Je plaisante.', 'Tic… tac… tic…', 'Dépêche-toi un peu !'] },
  eau: { trait: 'Petite goutte joyeuse qui rebondit partout.',
    capture: ['Plouf ! Me voilà !', 'On va se mouiller !', 'Tu sais nager ?'],
    pouvoir: ['Bulle !', 'Boing, boing !', 'Ça rebondit !'],
    repos: ['Il va pleuvoir ? J’espère.', 'Glou glou.', 'Je coule de source.'] },
  chance: { trait: 'Pièce porte-bonheur qui trouve toujours quelque chose par terre.',
    capture: ['C’est ton jour de chance !', 'Pile ou face ?', 'Je sens un trésor !'],
    pouvoir: ['Jackpot !', 'Et voilà le gros lot !', 'Tombé du ciel !'],
    repos: ['J’ai trouvé un trèfle.', 'Je parie qu’il y a un coffre par là.', 'Touche du bois.'] },
  etoile: { trait: 'Petite étoile courageuse qui veille sur toi.',
    capture: ['Fais un vœu !', 'Je veille sur toi.', 'On va briller !'],
    pouvoir: ['Étoile filante !', 'Fiouuu !', 'Plus vite que la lumière !'],
    repos: ['Tu as vu comme je brille ?', 'J’ai compté les autres étoiles.', 'Je ne te lâche pas.'] },
};
export const replique = (type, quand) => { const l = PERSONNALITES[type]?.[quand] || ['…']; return l[Math.floor(Math.random() * l.length)]; };

// Raretés de collection (gagnées dans les cargaisons) : SEULEMENT l'aspect (aura, étincelles, son) — les pouvoirs restent les mêmes
export const RARETES_ESPRIT = {
  commun: { nom: 'Commun', couleur: '#8fa3b8', aura: 0 },
  rare: { nom: 'Rare', couleur: '#3d8dff', aura: 1 },
  epique: { nom: 'Épique', couleur: '#b552ff', aura: 2 },
  legendaire: { nom: 'Légendaire', couleur: '#ffad1f', aura: 3 },
};
export const ORDRE_RARETES = ['commun', 'rare', 'epique', 'legendaire'];
// meilleure rareté possédée pour chaque type ({ soin: 'rare', … }) : envoyée à l'hôte pour que les autres voient l'aura
export function meilleuresRaretes(collection) {
  const r = {};
  for (const e of collection || []) if (ESPRITS[e.type] && RARETES_ESPRIT[e.rarete] && ORDRE_RARETES.indexOf(e.rarete) > ORDRE_RARETES.indexOf(r[e.type] || '')) r[e.type] = e.rarete;
  return r;
}

// Réglages des effets (partagés par l'hôte et les joueurs)
export const RECHARGE_SANCTUAIRE = 75;      // secondes avant qu'un nouvel esprit apparaisse sur l'autel
export const DUREE_ESPRIT_TOMBE = 60;      // secondes pendant lesquelles l'esprit d'un joueur éliminé reste à prendre
export const PORTEE_CAPTURE = 3.2;          // mètres
export const VITESSE_MOBILITE = 1.12;
export const ENVOL = { haut: 15, avant: 13 };
export const REGEN = { soin: { max: 75, pas: 2 }, protection: { max: 50, pas: 3 } };
export const BOURGEON = { pv: 40, rayon: 8 };
export const CARAPACE = 50;
export const VISION = { passif: 35, pouvoir: 70, duree: 6 };
export const COUT_BATISSEUR = 5;
// Les 10 esprits ajoutés (mêmes valeurs chez l'hôte et chez les joueurs)
export const FEU = { bonus: 1.1, portee: 45, vitesse: 34, rayon: 4.5, degats: 35 };
export const GLACE = { touche: 1, facteurTouche: 0.7, rayon: 10, duree: 3, facteur: 0.4 };
export const FOUDRE = { bouclier: 20, portee: 25, saut: 14, degats: [30, 15, 15] };
export const VENT = { saut: 11.3, rayon: 8, force: 16, haut: 8, degats: 5 };
export const NATURE = { recolte: 2, rayon: 1.5, duree: 2, facteur: 0.05, degats: 15, vie: 45, max: 2 };
export const OMBRE = { duree: 5, vitesse: 7, oubli: 4 };
export const TEMPS = { recharge: 0.7, retour: 4 };
export const EAU = { duree: 6, saut: 15, rebond: 12 };
export const CHANCE = { passif: 40 };
export const ETOILE = { pv: 40, distance: 14, duree: 0.35, largeur: 1.6, degats: 20 };
export const ECHELLE_AUTEL = 1.6;           // l'autel livré fait 0,94 m : un peu agrandi pour être vu de loin

// ---------- Placement des autels (fait par l'hôte, envoyé à tout le monde) ----------
// Sur la terre ferme, à plat, à ciel ouvert (pas dans une maison ni sous un arbre), loin les uns des autres.
let disponibles = null; // null = tous (pas de réglage reçu du serveur)
export function reglerEspritsDisponibles(liste) { disponibles = Array.isArray(liste) && liste.length ? liste.filter(t => ESPRITS[t]) : null; }
export function placerSanctuaires(monde, r, n, centre = null) {
  const liste = [];
  const types = [];
  const choix = disponibles && disponibles.length ? disponibles : TYPES_ESPRITS;
  while (types.length < n) types.push(...choix.slice().sort(() => r() - 0.5));
  const ecart = centre ? 12 : DEMI * 0.3;
  for (let essai = 0; liste.length < n && essai < n * 80; essai++) {
    const a = r() * Math.PI * 2;
    const d = centre ? 14 + r() * 34 : Math.sqrt(r()) * DEMI * 0.8;
    const x = (centre ? centre.x : 0) + Math.cos(a) * d, z = (centre ? centre.z : 0) + Math.sin(a) * d;
    const h = monde.hauteurTerrain(x, z);
    if (h < 2) continue;
    const pente = Math.abs(monde.hauteurTerrain(x + 2, z) - h) + Math.abs(monde.hauteurTerrain(x, z + 2) - h)
      + Math.abs(monde.hauteurTerrain(x - 2, z) - h) + Math.abs(monde.hauteurTerrain(x, z - 2) - h);
    if (pente > 2.4) continue;
    let couvert = false;
    for (const [ox, oz] of [[0, 0], [1.6, 0], [-1.6, 0], [0, 1.6], [0, -1.6]]) {
      const hit = monde.lancerRayon(x + ox, h + 30, z + oz, 0, -1, 0, 31);
      if (hit && hit.y > monde.hauteurTerrain(x + ox, z + oz) + 0.4) { couvert = true; break; }
    }
    if (couvert) continue;
    if (liste.some(s => Math.hypot(s.x - x, s.z - z) < ecart)) continue;
    liste.push({ id: liste.length, x: arrondi(x), y: arrondi(h), z: arrondi(z), type: types[liste.length] });
  }
  return liste;
}

// ---------- Modèles ----------
// Le vrai modèle (esprit_<id>, socle_esprit) quand integration.json l'active ; sinon une forme de secours faite en code.
const cacheMat = new Map();
function mat(cle, fabrique) { if (!cacheMat.has(cle)) cacheMat.set(cle, fabrique()); return cacheMat.get(cle); }
const lumineux = (couleur, k = 1.7) => mat('l' + couleur + k, () => new THREE.MeshBasicMaterial({ color: new THREE.Color(couleur).multiplyScalar(k), toneMapped: false }));
const voile = couleur => mat('v' + couleur, () => new THREE.MeshBasicMaterial({ color: couleur, transparent: true, opacity: 0.24, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false }));
const GEO = {
  coeur: new THREE.IcosahedronGeometry(0.3, 2), halo: new THREE.IcosahedronGeometry(0.48, 2), oeil: new THREE.SphereGeometry(0.052, 10, 8),
  feuille: new THREE.ConeGeometry(0.085, 0.32, 6), cristal: new THREE.OctahedronGeometry(0.11), anneau: new THREE.TorusGeometry(0.52, 0.022, 6, 40),
  cube: new THREE.BoxGeometry(0.13, 0.13, 0.13), grosOeil: new THREE.SphereGeometry(0.13, 14, 10),
};

function espritDeSecours(type, d) {
  const g = new THREE.Group();
  const coeur = new THREE.Mesh(GEO.coeur, lumineux(d.couleur));
  const halo = new THREE.Mesh(GEO.halo, voile(d.clair));
  const oeilMat = mat('oeil', () => new THREE.MeshBasicMaterial({ color: '#1b1033' }));
  if (type === 'vision') { const o = new THREE.Mesh(GEO.grosOeil, oeilMat); o.position.set(0, 0.04, -0.24); g.add(o); }
  else for (const s of [-1, 1]) { const o = new THREE.Mesh(GEO.oeil, oeilMat); o.position.set(s * 0.1, 0.05, -0.27); g.add(o); }
  const accents = new THREE.Group();
  // (les 10 esprits ajoutés ont chacun leur petite forme en attendant leur vrai modèle)
  const NB = { mobilite: 2, batisseur: 3, protection: 3, feu: 4, glace: 6, foudre: 3, vent: 3, nature: 3, ombre: 2, temps: 2, eau: 4, chance: 4, etoile: 5 };
  const n = NB[type] || 5;
  for (let i = 0; i < n; i++) {
    const a = i / n * Math.PI * 2;
    let m;
    if (type === 'soin') { m = new THREE.Mesh(GEO.feuille, lumineux(i % 2 ? d.clair : d.couleur, 1.6)); m.position.set(Math.cos(a) * 0.2, 0.28, Math.sin(a) * 0.2); m.rotation.set(Math.sin(a) * 0.5, 0, -Math.cos(a) * 0.5); }
    else if (type === 'mobilite') { m = new THREE.Mesh(GEO.anneau, lumineux(i ? d.clair : d.couleur, 1.6)); m.rotation.set(Math.PI / 2 + (i ? 0.6 : -0.4), i ? 0.5 : 0, 0); }
    else if (type === 'protection') { m = new THREE.Mesh(GEO.cristal, lumineux(d.couleur, 1.5)); m.position.set(Math.cos(a) * 0.45, 0, Math.sin(a) * 0.45); m.scale.set(1.6, 1.6, 0.4); }
    else if (type === 'batisseur') { m = new THREE.Mesh(GEO.cube, mat('cube' + i, () => new THREE.MeshStandardMaterial({ color: ['#a0703c', '#9a9ea6', '#c9ced8'][i], roughness: 0.8 }))); m.position.set(Math.cos(a) * 0.45, 0, Math.sin(a) * 0.45); }
    else if (type === 'feu') { m = new THREE.Mesh(GEO.feuille, lumineux(i % 2 ? '#ffd23f' : d.couleur, 1.8)); m.position.set(Math.cos(a) * 0.14, 0.3 + (i % 2) * 0.06, Math.sin(a) * 0.14); }
    else if (type === 'glace') { m = new THREE.Mesh(GEO.feuille, lumineux(d.clair, 1.5)); m.position.set(Math.cos(a) * 0.36, 0, Math.sin(a) * 0.36); m.rotation.set(0, -a, -Math.PI / 2); m.scale.setScalar(0.8); }
    else if (type === 'foudre') { m = new THREE.Mesh(GEO.feuille, lumineux('#fff7a8', 1.9)); m.position.set((i - 1) * 0.16, -0.38, 0); m.rotation.z = Math.PI + (i - 1) * 0.3; }
    else if (type === 'vent') { m = new THREE.Mesh(GEO.anneau, lumineux(i % 2 ? d.clair : d.couleur, 1.4)); m.rotation.x = Math.PI / 2; m.position.y = -0.22 + i * 0.2; m.scale.setScalar(0.55 + i * 0.22); }
    else if (type === 'nature') { m = new THREE.Mesh(i ? GEO.feuille : GEO.grosOeil, lumineux(i ? '#7bd65a' : '#e2574c', 1.2)); m.position.set(i ? Math.cos(a) * 0.2 : 0.12, i ? 0.3 : 0.34, i ? Math.sin(a) * 0.2 : 0.05); if (i) m.rotation.set(Math.sin(a) * 0.6, 0, -Math.cos(a) * 0.6); }
    else if (type === 'ombre') { m = new THREE.Mesh(GEO.feuille, lumineux(d.couleur, 1.1)); m.position.set((i ? 1 : -1) * 0.2, 0.3, 0.02); m.rotation.z = (i ? -1 : 1) * 0.5; }
    else if (type === 'temps') { m = new THREE.Mesh(GEO.grosOeil, lumineux(d.clair, 1.3)); m.position.set((i ? 1 : -1) * 0.2, 0.3, 0); m.scale.setScalar(0.8); }
    else if (type === 'eau') { m = new THREE.Mesh(GEO.grosOeil, lumineux(d.clair, 1.3)); m.position.set(Math.cos(a) * 0.44, Math.sin(i * 2.1) * 0.12, Math.sin(a) * 0.44); m.scale.setScalar(0.45); }
    else if (type === 'chance') { m = new THREE.Mesh(GEO.cristal, lumineux(i % 2 ? '#7bd65a' : d.couleur, 1.5)); m.position.set(Math.cos(a) * 0.44, 0, Math.sin(a) * 0.44); m.scale.set(1, 1, 0.3); }
    else if (type === 'etoile') { m = new THREE.Mesh(GEO.feuille, lumineux(d.couleur, 1.9)); const b = a + Math.PI / 2; m.position.set(Math.cos(b) * 0.33, Math.sin(b) * 0.33, 0); m.rotation.z = b - Math.PI / 2; }
    else { m = new THREE.Mesh(GEO.cristal, lumineux(d.couleur, 1.4)); m.position.set(Math.cos(a) * 0.42, Math.sin(i * 1.7) * 0.08, Math.sin(a) * 0.42); }
    accents.add(m);
  }
  g.add(coeur, halo, accents);
  return { g, accents, halo };
}

// Aura de rareté : anneau lumineux + halo, plus grands et plus nombreux selon la rareté
const GEO_AURA = { anneau: new THREE.TorusGeometry(0.4, 0.014, 6, 48), halo: new THREE.SphereGeometry(0.42, 16, 12) };
function aura(rarete) {
  const r = RARETES_ESPRIT[rarete];
  if (!r || !r.aura) return null;
  const g = new THREE.Group();
  const coul = new THREE.Color(r.couleur);
  for (let i = 0; i < r.aura; i++) {
    const a = new THREE.Mesh(GEO_AURA.anneau, mat('aura' + rarete, () => new THREE.MeshBasicMaterial({ color: coul.clone().multiplyScalar(1.6), toneMapped: false, transparent: true, opacity: 0.6 })));
    a.rotation.set(Math.PI / 2 + i * 0.7, i * 1.1, 0);
    a.scale.setScalar(1 + i * 0.1);
    g.add(a);
  }
  const h = new THREE.Mesh(GEO_AURA.halo, mat('halo' + rarete, () => new THREE.MeshBasicMaterial({ color: coul, transparent: true, opacity: 0.12 + r.aura * 0.04, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false })));
  g.add(h);
  g.userData = { niveau: r.aura };
  return g;
}

export function creerEsprit(type, echelle = 1, rarete = null) {
  const d = ESPRITS[type] || ESPRITS.soin;
  const g = new THREE.Group();
  g.userData = { esprit: type, accents: null, halo: null, t: Math.random() * 6, mixer: null, actions: {}, rarete, aura: null, boucle: 'flotter', attenteT: 6 + Math.random() * 8 };
  const au = aura(rarete);
  if (au) { g.add(au); g.userData.aura = au; }
  const glb = modeleGlb('esprit_' + type);
  if (glb) {
    glb.traverse(o => { if (o.isMesh) o.castShadow = false; });
    g.add(glb);
    // animations livrées : flotter en boucle, activer / apparaître une fois
    const mixer = new THREE.AnimationMixer(glb);
    for (const nom of ['flotter', 'activer', 'apparaitre', 'attente2', 'deplacer', 'content', 'surpris', 'obtention']) {
      const clip = clipAnimation(type + '_' + nom);
      if (clip) g.userData.actions[nom] = mixer.clipAction(clip);
    }
    const flotter = g.userData.actions.flotter;
    if (flotter) { flotter.setLoop(THREE.LoopRepeat, Infinity); flotter.time = Math.random() * 2; flotter.play(); }
    mixer.addEventListener('finished', () => {
      const f = g.userData.actions[g.userData.boucle] || g.userData.actions.flotter;
      g.userData.unique = null;
      if (f) { f.reset().setEffectiveWeight(1).fadeIn(0.2).play(); }
    });
    g.userData.mixer = mixer;
  } else {
    const s = espritDeSecours(type, d);
    g.add(s.g);
    Object.assign(g.userData, { accents: s.accents, halo: s.halo });
  }
  g.scale.setScalar(echelle);
  return g;
}

// Joue une animation une fois (« activer », « apparaitre », « content », « surpris », « attente2 », « obtention »), puis reprend la boucle
export function jouerEsprit(g, nom) {
  const u = g && g.userData;
  const a = u && u.actions && u.actions[nom];
  if (!a) return false;
  const boucle = u.actions[u.boucle] || u.actions.flotter;
  if (u.unique && u.unique !== a) u.unique.stop();
  a.reset().setLoop(THREE.LoopOnce, 1);
  a.clampWhenFinished = false;
  if (boucle) a.crossFadeFrom(boucle, 0.2, false);
  a.play();
  u.unique = a;
  return true;
}
// Boucle de fond : « flotter » à l'arrêt, « deplacer » quand son joueur court (fondu entre les deux)
export function boucleEsprit(g, nom) {
  const u = g && g.userData;
  if (!u || !u.actions[nom] || u.boucle === nom) return;
  const avant = u.actions[u.boucle], apres = u.actions[nom];
  u.boucle = nom;
  if (u.unique) return; // une animation « une fois » est en cours : la nouvelle boucle reprendra après
  apres.reset().setLoop(THREE.LoopRepeat, Infinity).play();
  if (avant) apres.crossFadeFrom(avant, 0.3, false);
}

export function animerEsprit(g, dt) {
  const u = g.userData;
  u.t += dt;
  if (u.aura) { u.aura.rotation.y += dt * (0.8 + u.aura.userData.niveau * 0.4); u.aura.children[u.aura.children.length - 1].scale.setScalar(1 + Math.sin(u.t * 2.5) * 0.06); }
  if (u.mixer) {
    // de temps en temps, à l'arrêt : il regarde autour de lui (attente2)
    if (u.boucle === 'flotter' && !u.unique) { u.attenteT -= dt; if (u.attenteT <= 0) { u.attenteT = 9 + Math.random() * 10; jouerEsprit(g, 'attente2'); } }
    u.mixer.update(dt);
    return;
  }
  // (l'étoile et la goutte ne tournent pas sur elles-mêmes : leurs branches restent face à nous)
  if (u.accents && u.esprit !== 'etoile' && u.esprit !== 'foudre' && u.esprit !== 'ombre' && u.esprit !== 'temps') u.accents.rotation.y += dt * (u.esprit === 'mobilite' || u.esprit === 'vent' ? 4 : u.esprit === 'batisseur' ? 1.2 : 1.6);
  if (u.halo) u.halo.scale.setScalar(1 + Math.sin(u.t * 3) * 0.08);
}

export function creerSanctuaire() {
  const g = new THREE.Group();
  const runes = new THREE.MeshBasicMaterial({ color: '#888888', toneMapped: false });
  const cercle = new THREE.MeshBasicMaterial({ color: '#888888', transparent: true, opacity: 0.55, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide, toneMapped: false });
  const glb = modeleGlb('socle_esprit');
  let mixer = null, hauteur = 2.1;
  if (glb) {
    glb.scale.setScalar(ECHELLE_AUTEL);
    glb.traverse(o => {
      if (!o.isMesh) return;
      if (/^COL[_.-]/i.test(o.userData.name || o.name || '')) { o.visible = false; return; }
      o.receiveShadow = true;
      // les parties lumineuses de l'autel prennent la couleur de l'esprit qui l'habite
      if (/^lumiere/i.test(o.material?.name || '')) o.material = runes;
    });
    g.add(glb);
    const clip = clipAnimation('socle_tourner');
    if (clip) { mixer = new THREE.AnimationMixer(glb); mixer.clipAction(clip).play(); }
    hauteur = (glb.userData.hauteur_esprit || 1.0) * ECHELLE_AUTEL - 0.1;
  } else {
    const pierre = mat('socle', () => new THREE.MeshStandardMaterial({ color: '#9a958c', roughness: 0.9, flatShading: true }));
    const socle = new THREE.Mesh(new THREE.CylinderGeometry(1.45, 1.7, 0.4, 10), pierre);
    socle.position.y = 0.2; socle.castShadow = socle.receiveShadow = true;
    const dalle = new THREE.Mesh(new THREE.CylinderGeometry(1.05, 1.15, 0.16, 10), mat('dalle', () => new THREE.MeshStandardMaterial({ color: '#c8c2b5', roughness: 0.8, flatShading: true })));
    dalle.position.y = 0.46;
    g.add(socle, dalle);
    for (let i = 0; i < 4; i++) {
      const a = i / 4 * Math.PI * 2 + Math.PI / 4;
      const pilier = new THREE.Mesh(new THREE.BoxGeometry(0.26, 1.15, 0.26), pierre);
      pilier.position.set(Math.cos(a) * 1.28, 0.95, Math.sin(a) * 1.28); pilier.rotation.y = -a; pilier.castShadow = true;
      const pierreRune = new THREE.Mesh(new THREE.OctahedronGeometry(0.15), runes);
      pierreRune.position.set(Math.cos(a) * 1.28, 1.72, Math.sin(a) * 1.28);
      g.add(pilier, pierreRune);
    }
  }
  const rond = new THREE.Mesh(new THREE.RingGeometry(0.9, 1.15, 40), cercle);
  rond.rotation.x = -Math.PI / 2; rond.position.y = 0.06;
  g.add(rond);
  g.userData = { runes, cercle, rond, mixer, hauteur };
  return g;
}

// Couleur de l'autel : celle de l'esprit qui l'habite, gris quand il est vide
export function colorerSanctuaire(g, type, dispo) {
  const d = ESPRITS[type] || ESPRITS.soin;
  g.userData.runes.color.copy(dispo ? new THREE.Color(d.couleur).multiplyScalar(1.8) : new THREE.Color('#5d5d66'));
  g.userData.cercle.color.copy(dispo ? new THREE.Color(d.clair) : new THREE.Color('#40404a'));
}
