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
  // ----- les 50 esprits ajoutés le 22 nov. 2026 -----
  // Leurs bonus (p) et leur pouvoir (a) sont des RÉGLAGES lus par un code commun (hote.js : pouvoirGenerique ; jeu.js : effetGenerique).
  // p : degats, tete, degatsBas [PV, ×], explosion, resiste, zone, volVie, epines, killPv, killBouclier, killMats, gelTouche [s, ×],
  //     poisonTouche [s, dégâts/s], regenPv [max, pas], regenBouclier [max, pas], sauve, vitesse, saut, doubleSaut, chute, nage, planeur,
  //     recharge, recolte, construit, conso, carteEnnemis, carteCoffres, mats, munitions, aimant, precision, pioche.
  // a.t : boule, frappe, nuage, onde, chaine, soin, buff, dash, bond, teleport, echange, piege, objet, murs, vision, clone.
  lave: {
    nom: 'Magmou', role: 'Lave', icone: '🌋', couleur: '#ff5a2a', clair: '#ffd0a8',
    passif: 'Tu reçois 10 % de dégâts en moins', pouvoir: 'Flaque de lave', descPouvoir: 'Une flaque brûlante là où tu vises (25 m) : 9 dégâts par seconde pendant 6 s', recharge: 26,
    p: { resiste: 0.9 }, a: { t: 'nuage', portee: 25, rayon: 4.5, duree: 6, dps: 9 },
  },
  cendre: {
    nom: 'Suie', role: 'Fumée', icone: '💨', couleur: '#9aa3ad', clair: '#e3e8ee',
    passif: 'La zone te fait 2 fois moins mal', pouvoir: 'Rideau de fumée', descPouvoir: 'Tu deviens invisible 5 s (faire des dégâts te fait réapparaître)', recharge: 28,
    p: { zone: 0.5 }, a: { t: 'buff', duree: 5, invisible: true },
  },
  comete: {
    nom: 'Astro', role: 'Météore', icone: '☄️', couleur: '#ffb14d', clair: '#fff0c9',
    passif: '+20 % de dégâts quand tu touches la tête', pouvoir: 'Météore', descPouvoir: 'Un météore tombe là où tu vises (45 m) : jusqu’à 45 dégâts', recharge: 30,
    p: { tete: 1.2 }, a: { t: 'frappe', portee: 45, delai: 1.2, rayon: 5, degats: 45 },
  },
  dragon: {
    nom: 'Dracot', role: 'Dragon', icone: '🐉', couleur: '#e2463f', clair: '#ffd2a1',
    passif: '+25 % de dégâts quand il te reste moins de 40 PV', pouvoir: 'Souffle brûlant', descPouvoir: 'Un souffle court (16 m) mais très large : 30 dégâts et repousse', recharge: 22,
    p: { degatsBas: [40, 1.25] }, a: { t: 'boule', portee: 16, vitesse: 45, rayon: 6, degats: 30, pousse: 9 },
  },
  volcan: {
    nom: 'Krakou', role: 'Éruption', icone: '🧨', couleur: '#ff8a3d', clair: '#ffe0a8',
    passif: 'Chaque élimination te donne 50 matériaux', pouvoir: 'Éruption', descPouvoir: '4 rochers en feu tombent autour du point visé (35 m) : 22 dégâts chacun', recharge: 32,
    p: { killMats: 50 }, a: { t: 'frappe', portee: 35, delai: 1, rayon: 3.5, degats: 22, n: 4, ecart: 6 },
  },
  cristal: {
    nom: 'Cristo', role: 'Cristal', icone: '💎', couleur: '#7ae0ff', clair: '#e6fbff',
    passif: 'Ton bouclier remonte tout seul jusqu’à 25 et tu reçois 5 % de dégâts en moins', pouvoir: 'Igloo', descPouvoir: '4 murs et un toit autour de toi, gratuits', recharge: 30,
    p: { regenBouclier: [25, 2], resiste: 0.95 }, a: { t: 'murs', forme: 'bunker' },
  },
  neige: {
    nom: 'Boulou', role: 'Neige', icone: '☃️', couleur: '#cfeeff', clair: '#ffffff',
    passif: 'Tu sautes plus haut et tomber ne te fait pas mal', pouvoir: 'Boule de neige géante', descPouvoir: 'Explose à l’arrivée (40 m) : 20 dégâts et gèle 3 s', recharge: 22,
    p: { saut: 10.6, chute: true }, a: { t: 'boule', portee: 40, vitesse: 30, rayon: 4, degats: 20, gel: [3, 0.4] },
  },
  banquise: {
    nom: 'Pingou', role: 'Glisse', icone: '🐧', couleur: '#5aa8ff', clair: '#e0f0ff',
    passif: '+10 % de vitesse, et tu nages aussi vite que tu cours', pouvoir: 'Glissade', descPouvoir: 'Tu glisses tout droit sur 18 m : 15 dégâts à ceux que tu traverses', recharge: 14,
    p: { vitesse: 1.1, nage: true }, a: { t: 'dash', distance: 18, degats: 15, duree: 0.45 },
  },
  aurore: {
    nom: 'Boréa', role: 'Aurore', icone: '🌈', couleur: '#8affc8', clair: '#f0e0ff',
    passif: 'Ta vie remonte jusqu’à 50 et ton bouclier jusqu’à 25', pouvoir: 'Lueur boréale', descPouvoir: '+25 PV et +25 de bouclier pour toi et tes coéquipiers proches (10 m)', recharge: 32,
    p: { regenPv: [50, 1], regenBouclier: [25, 1] }, a: { t: 'soin', pv: 25, bouclier: 25, rayon: 10 },
  },
  orage: {
    nom: 'Grondin', role: 'Orage', icone: '⛈️', couleur: '#8f9bff', clair: '#fff7a8',
    passif: '+6 % de dégâts et +5 % de vitesse', pouvoir: 'Nuage d’orage', descPouvoir: 'Un nuage là où tu vises (30 m) : 7 dégâts par seconde et ralentit, pendant 5 s', recharge: 28,
    p: { degats: 1.06, vitesse: 1.05 }, a: { t: 'nuage', portee: 30, rayon: 6, duree: 5, dps: 7, gel: 0.75 },
  },
  pile: {
    nom: 'Voltix', role: 'Énergie', icone: '🔋', couleur: '#b6ff3d', clair: '#f2ffd0',
    passif: 'Tu recharges 25 % plus vite et tu te soignes 30 % plus vite', pouvoir: 'Survolté', descPouvoir: '+35 % de vitesse pendant 6 s', recharge: 22,
    p: { recharge: 0.75, conso: 0.7 }, a: { t: 'buff', duree: 6, vitesse: 1.35 },
  },
  aimant: {
    nom: 'Magno', role: 'Aimant', icone: '🧲', couleur: '#ff4d6d', clair: '#cfd8ff',
    passif: 'Tu ramasses les munitions et les matériaux à 6 m', pouvoir: 'Attraction', descPouvoir: 'Attire vers toi les ennemis à 12 m', recharge: 24,
    p: { aimant: 6 }, a: { t: 'onde', rayon: 12, pousse: [-13, 4] },
  },
  plasma: {
    nom: 'Néon', role: 'Plasma', icone: '🟣', couleur: '#c44dff', clair: '#f3d6ff',
    passif: 'Tes tirs sont 40 % plus précis', pouvoir: 'Arc plasma', descPouvoir: '22 dégâts à l’ennemi le plus proche (30 m), puis à 3 autres', recharge: 30,
    p: { precision: 0.6 }, a: { t: 'chaine', portee: 30, saut: 12, degats: [22, 22, 22, 22] },
  },
  nimbus: {
    nom: 'Nimbo', role: 'Nuage', icone: '🌥️', couleur: '#dfe9f5', clair: '#ffffff',
    passif: 'En l’air à plus de 5 m, Espace rouvre ton deltaplane', pouvoir: 'Ascenseur', descPouvoir: 'Tu montes tout droit, très haut', recharge: 16,
    p: { planeur: true, chute: true }, a: { t: 'bond', haut: 22, avant: 5 },
  },
  tornade: {
    nom: 'Tourbi', role: 'Tornade', icone: '🌀', couleur: '#7fd6c9', clair: '#e0fff8',
    passif: '+8 % de vitesse et tu récoltes 50 % de plus', pouvoir: 'Tornade', descPouvoir: 'Projette en l’air les ennemis à 9 m (10 dégâts, plus la chute)', recharge: 24,
    p: { vitesse: 1.08, recolte: 1.5 }, a: { t: 'onde', rayon: 9, degats: 10, pousse: [5, 15] },
  },
  plume: {
    nom: 'Piaf', role: 'Plume', icone: '🕊️', couleur: '#ffe9c2', clair: '#ffffff',
    passif: 'Tomber ne te fait pas mal et +6 % de vitesse', pouvoir: 'Coup d’aile', descPouvoir: 'Tu te téléportes là où tu vises (22 m)', recharge: 18,
    p: { chute: true, vitesse: 1.06 }, a: { t: 'teleport', portee: 22 },
  },
  echo: {
    nom: 'Résono', role: 'Écho', icone: '🔔', couleur: '#ffd24d', clair: '#fff6cf',
    passif: 'Les ennemis proches (30 m) sont sur ta mini-carte', pouvoir: 'Cri strident', descPouvoir: 'Les ennemis à 10 m sont bloqués sur place pendant 2,5 s', recharge: 30,
    p: { carteEnnemis: 30 }, a: { t: 'onde', rayon: 10, gel: [2.5, 0.05] },
  },
  vague: {
    nom: 'Houlou', role: 'Vague', icone: '🌊', couleur: '#2f9bff', clair: '#c9ecff',
    passif: 'Tu nages vite et ta vie remonte jusqu’à 60', pouvoir: 'Déferlante', descPouvoir: 'Une vague explose à l’arrivée (30 m) : 18 dégâts et repousse fort', recharge: 20,
    p: { nage: true, regenPv: [60, 1] }, a: { t: 'boule', portee: 30, vitesse: 26, rayon: 5, degats: 18, pousse: 16 },
  },
  pluie: {
    nom: 'Ondine', role: 'Pluie', icone: '☔', couleur: '#6fc3ff', clair: '#e3f4ff',
    passif: 'Tu te soignes 40 % plus vite', pouvoir: 'Pluie douce', descPouvoir: 'Une zone de soin autour de toi pendant 6 s : +7 PV par seconde pour toi et ton équipe', recharge: 30,
    p: { conso: 0.6 }, a: { t: 'nuage', portee: 0, rayon: 7, duree: 6, soin: 7 },
  },
  corail: {
    nom: 'Récifa', role: 'Corail', icone: '🐚', couleur: '#ff8fa3', clair: '#ffe3e8',
    passif: 'Tu renvoies 20 % des dégâts à celui qui te tire dessus', pouvoir: 'Oursin', descPouvoir: 'Pose un piège (3 au plus) : 30 dégâts et ralentit celui qui marche dessus', recharge: 18,
    p: { epines: 0.2 }, a: { t: 'piege', rayon: 1.6, degats: 30, gel: [1.5, 0.3], vie: 60, max: 3 },
  },
  poulpe: {
    nom: 'Tentac', role: 'Encre', icone: '🐙', couleur: '#7b5cff', clair: '#d9d0ff',
    passif: 'Tu reçois 8 % de dégâts en moins et tu nages vite', pouvoir: 'Jet d’encre', descPouvoir: 'Un nuage noir là où tu vises (25 m) : ralentit de plus de moitié pendant 6 s', recharge: 24,
    p: { resiste: 0.92, nage: true }, a: { t: 'nuage', portee: 25, rayon: 5.5, duree: 6, dps: 3, gel: 0.45 },
  },
  fleur: {
    nom: 'Pétalia', role: 'Fleur', icone: '🌸', couleur: '#ff9ed8', clair: '#ffe6f5',
    passif: 'Ta vie remonte lentement jusqu’à 100', pouvoir: 'Floraison', descPouvoir: '+60 PV pour toi', recharge: 35,
    p: { regenPv: [100, 1] }, a: { t: 'soin', pv: 60, rayon: 0 },
  },
  spore: {
    nom: 'Sporo', role: 'Poison', icone: '🦠', couleur: '#9be04a', clair: '#e6ffc2',
    passif: 'Tes tirs empoisonnent : 3 dégâts par seconde pendant 3 s', pouvoir: 'Nuage toxique', descPouvoir: 'Un nuage là où tu vises (25 m) : 6 dégâts par seconde pendant 7 s', recharge: 26,
    p: { poisonTouche: [3, 3] }, a: { t: 'nuage', portee: 25, rayon: 5, duree: 7, dps: 6 },
  },
  cactus: {
    nom: 'Piko', role: 'Épines', icone: '🌵', couleur: '#5fcf6b', clair: '#d6ffd9',
    passif: 'Chaque élimination te rend 30 PV', pouvoir: 'Explosion d’épines', descPouvoir: '28 dégâts à tous les ennemis à 6,5 m', recharge: 18,
    p: { killPv: 30 }, a: { t: 'onde', rayon: 6.5, degats: 28 },
  },
  chene: {
    nom: 'Chênou', role: 'Forêt', icone: '🌳', couleur: '#7bbf4a', clair: '#e3f7c9',
    passif: 'Tu gagnes 2 matériaux par seconde', pouvoir: 'Rempart', descPouvoir: '3 murs devant toi, gratuits', recharge: 22,
    p: { mats: 2 }, a: { t: 'murs', forme: 'rempart' },
  },
  abeille: {
    nom: 'Bzzou', role: 'Essaim', icone: '🐝', couleur: '#ffcf33', clair: '#fff3c2',
    passif: '+7 % de vitesse et tu sautes plus haut', pouvoir: 'Essaim', descPouvoir: '12 dégâts à l’ennemi le plus proche (22 m), puis à 4 autres', recharge: 22,
    p: { vitesse: 1.07, saut: 10.4 }, a: { t: 'chaine', portee: 22, saut: 10, degats: [12, 12, 12, 12, 12] },
  },
  liane: {
    nom: 'Liana', role: 'Liane', icone: '🌿', couleur: '#52c98a', clair: '#d6ffe9',
    passif: 'Construire coûte 6 matériaux au lieu de 10 et tu récoltes 50 % de plus', pouvoir: 'Liane', descPouvoir: 'Tu te hisses d’un coup jusqu’au point visé (30 m)', recharge: 20,
    p: { construit: 6, recolte: 1.5 }, a: { t: 'teleport', portee: 30 },
  },
  ours: {
    nom: 'Grizou', role: 'Force', icone: '🐻', couleur: '#b9824f', clair: '#f3dcc2',
    passif: 'Tu reçois 12 % de dégâts en moins', pouvoir: 'Coup de patte', descPouvoir: '20 dégâts aux ennemis à 7 m, et ils sont repoussés', recharge: 20,
    p: { resiste: 0.88 }, a: { t: 'onde', rayon: 7, degats: 20, pousse: [12, 6] },
  },
  loup: {
    nom: 'Crocs', role: 'Chasse', icone: '🐺', couleur: '#aab4c8', clair: '#eef2fa',
    passif: '+8 % de dégâts avec tes armes', pouvoir: 'Traque', descPouvoir: '+25 % de vitesse et +15 % de dégâts pendant 5 s', recharge: 26,
    p: { degats: 1.08 }, a: { t: 'buff', duree: 5, vitesse: 1.25, degats: 1.15 },
  },
  hibou: {
    nom: 'Houhou', role: 'Nuit', icone: '🦉', couleur: '#b08cff', clair: '#ece0ff',
    passif: 'Les coffres fermés à 60 m sont sur ta mini-carte', pouvoir: 'Vue de nuit', descPouvoir: 'Montre les ennemis à 90 m à travers les murs pendant 8 s', recharge: 28,
    p: { carteCoffres: 60 }, a: { t: 'vision', rayon: 90, duree: 8 },
  },
  tortue: {
    nom: 'Carapou', role: 'Carapace', icone: '🐢', couleur: '#4fbf8f', clair: '#d3ffea',
    passif: 'Tu reçois 15 % de dégâts en moins, mais tu es 6 % plus lent', pouvoir: 'Carapace', descPouvoir: 'Pendant 4 s, tu reçois 80 % de dégâts en moins', recharge: 28,
    p: { resiste: 0.85, vitesse: 0.94 }, a: { t: 'buff', duree: 4, resiste: 0.2 },
  },
  vampire: {
    nom: 'Morsi', role: 'Vampire', icone: '🦇', couleur: '#d1456f', clair: '#ffd6e2',
    passif: '15 % des dégâts de tes armes te soignent', pouvoir: 'Morsure', descPouvoir: '35 dégâts à l’ennemi le plus proche (20 m), et tu récupères autant de PV', recharge: 26,
    p: { volVie: 0.15 }, a: { t: 'chaine', portee: 20, saut: 0, degats: [35], vol: 1 },
  },
  fantome: {
    nom: 'Bouh', role: 'Fantôme', icone: '👻', couleur: '#e8e6ff', clair: '#ffffff',
    passif: 'Tu reçois 7 % de dégâts en moins et +5 % de vitesse', pouvoir: 'Frousse', descPouvoir: 'Repousse et ralentit pendant 2 s les ennemis à 9 m', recharge: 22,
    p: { resiste: 0.93, vitesse: 1.05 }, a: { t: 'onde', rayon: 9, gel: [2, 0.4], pousse: [15, 5] },
  },
  miroir: {
    nom: 'Reflex', role: 'Miroir', icone: '💠', couleur: '#9fe8ff', clair: '#ffffff',
    passif: '+15 % de dégâts dans la tête et 5 % de dégâts reçus en moins', pouvoir: 'Reflet', descPouvoir: 'Un faux toi part en courant et les bots te perdent de vue', recharge: 26,
    p: { tete: 1.15, resiste: 0.95 }, a: { t: 'clone' },
  },
  sablier: {
    nom: 'Sablo', role: 'Sablier', icone: '⏳', couleur: '#e8c48a', clair: '#fff1d6',
    passif: 'Ta vie remonte jusqu’à 40 et +5 % de vitesse', pouvoir: 'Ralenti', descPouvoir: 'Les ennemis à 15 m avancent 2 fois moins vite pendant 4 s', recharge: 30,
    p: { regenPv: [40, 1], vitesse: 1.05 }, a: { t: 'onde', rayon: 15, gel: [4, 0.5] },
  },
  sable: {
    nom: 'Dunou', role: 'Désert', icone: '🏜️', couleur: '#e0a95a', clair: '#ffe7bd',
    passif: 'Tu récoltes 50 % de plus et chaque élimination te donne 30 matériaux', pouvoir: 'Tempête de sable', descPouvoir: 'Un nuage autour de toi pendant 6 s : les ennemis y sont ralentis de moitié et perdent 4 PV par seconde', recharge: 26,
    p: { recolte: 1.5, killMats: 30 }, a: { t: 'nuage', portee: 0, rayon: 6, duree: 6, dps: 4, gel: 0.5 },
  },
  bombe: {
    nom: 'Boumi', role: 'Explosifs', icone: '💣', couleur: '#ff6b4a', clair: '#ffd9cf',
    passif: 'Tes roquettes et tes grenades font 30 % de dégâts en plus', pouvoir: 'Sac à malice', descPouvoir: '3 grenades tombent devant toi', recharge: 35,
    p: { explosion: 1.3 }, a: { t: 'objet', objets: [{ objet: 'grenade', rarete: 1, qte: 3 }] },
  },
  mine: {
    nom: 'Clac', role: 'Piège', icone: '🔩', couleur: '#c8ced8', clair: '#ffffff',
    passif: 'Les ennemis proches (25 m) sont sur ta mini-carte', pouvoir: 'Mine', descPouvoir: 'Pose une mine (2 au plus) : elle explose quand un ennemi marche dessus (45 dégâts)', recharge: 22,
    p: { carteEnnemis: 25 }, a: { t: 'piege', rayon: 2, degats: 45, explose: 4.5, vie: 90, max: 2 },
  },
  reserve: {
    nom: 'Cartou', role: 'Réserve', icone: '🎒', couleur: '#c9a36b', clair: '#f5e6cf',
    passif: 'Tes munitions reviennent toutes seules (+1 par seconde)', pouvoir: 'Ravitaillement', descPouvoir: '90 munitions et 60 matériaux tombent devant toi', recharge: 30,
    p: { munitions: 1 }, a: { t: 'objet', objets: [{ objet: 'munitions', qte: 90 }, { objet: 'materiaux', qte: 60 }] },
  },
  docteur: {
    nom: 'Bobo', role: 'Secours', icone: '🩹', couleur: '#ff7a8a', clair: '#ffe0e4',
    passif: 'Tu te soignes 2 fois plus vite', pouvoir: 'Trousse', descPouvoir: 'Une trousse de soin et 3 pansements tombent devant toi', recharge: 40,
    p: { conso: 0.5 }, a: { t: 'objet', objets: [{ objet: 'soin', rarete: 1, qte: 1 }, { objet: 'pansements', qte: 3 }] },
  },
  forge: {
    nom: 'Enclumo', role: 'Forge', icone: '⚒️', couleur: '#ff9d3d', clair: '#ffe6c2',
    passif: 'Tes coups de pioche font 2 fois plus mal et tu récoltes 50 % de plus', pouvoir: 'Lingots', descPouvoir: '120 matériaux tombent devant toi', recharge: 30,
    p: { pioche: 2, recolte: 1.5 }, a: { t: 'objet', objets: [{ objet: 'materiaux', qte: 60 }, { objet: 'materiaux', qte: 60 }] },
  },
  egide: {
    nom: 'Égide', role: 'Rempart', icone: '🔰', couleur: '#5ad1a4', clair: '#dafff0',
    passif: 'Ton bouclier remonte tout seul jusqu’à 35', pouvoir: 'Égide', descPouvoir: '+40 de bouclier pour toi et tes coéquipiers proches (12 m)', recharge: 30,
    p: { regenBouclier: [35, 2] }, a: { t: 'soin', pv: 0, bouclier: 40, rayon: 12 },
  },
  rage: {
    nom: 'Furio', role: 'Rage', icone: '😤', couleur: '#ff3d3d', clair: '#ffc9c9',
    passif: 'Chaque élimination te rend 15 PV et 15 de bouclier', pouvoir: 'Furie', descPouvoir: 'Pendant 7 s : +25 % de dégâts et +15 % de vitesse, mais tu reçois 15 % de dégâts en plus', recharge: 28,
    p: { killPv: 15, killBouclier: 15 }, a: { t: 'buff', duree: 7, degats: 1.25, vitesse: 1.15, resiste: 1.15 },
  },
  ninja: {
    nom: 'Shino', role: 'Ninja', icone: '🗡️', couleur: '#6b7280', clair: '#d5dae3',
    passif: '+10 % de vitesse et tomber ne te fait pas mal', pouvoir: 'Furtif', descPouvoir: 'Invisible et +30 % de vitesse pendant 3,5 s (faire des dégâts te fait réapparaître)', recharge: 22,
    p: { vitesse: 1.1, chute: true }, a: { t: 'buff', duree: 3.5, invisible: true, vitesse: 1.3 },
  },
  robot: {
    nom: 'Bipbop', role: 'Robot', icone: '🤖', couleur: '#8fd3e8', clair: '#e3f8ff',
    passif: 'Tu reçois 7 % de dégâts en moins et tu recharges 15 % plus vite', pouvoir: 'Tir orbital', descPouvoir: 'Un tir très précis tombe là où tu vises (60 m) : jusqu’à 55 dégâts sur 3 m', recharge: 26,
    p: { resiste: 0.93, recharge: 0.85 }, a: { t: 'frappe', portee: 60, delai: 0.8, rayon: 3, degats: 55 },
  },
  ange: {
    nom: 'Séraph', role: 'Ange', icone: '😇', couleur: '#fff3b0', clair: '#ffffff',
    passif: 'Une fois par partie, il te sauve d’un coup mortel (il te reste 30 PV)', pouvoir: 'Auréole', descPouvoir: '+12 PV par seconde pendant 5 s', recharge: 30,
    p: { sauve: 30 }, a: { t: 'buff', duree: 5, regen: 12 },
  },
  perroquet: {
    nom: 'Coco', role: 'Pirate', icone: '🦜', couleur: '#3ddc84', clair: '#fff27a',
    passif: 'Les coffres fermés à 70 m sont sur ta mini-carte', pouvoir: 'Butin du pirate', descPouvoir: 'Une gourde bouclier et 2 mini-gourdes tombent devant toi', recharge: 38,
    p: { carteCoffres: 70 }, a: { t: 'objet', objets: [{ objet: 'bouclier', rarete: 2, qte: 1 }, { objet: 'minigourde', rarete: 2, qte: 2 }] },
  },
  soleil: {
    nom: 'Solaro', role: 'Soleil', icone: '☀️', couleur: '#ffd84d', clair: '#fff7cf',
    passif: 'Ta vie remonte jusqu’à 65', pouvoir: 'Éclat solaire', descPouvoir: '22 dégâts aux ennemis à 10 m, éblouis (ralentis) pendant 1,5 s', recharge: 22,
    p: { regenPv: [65, 2] }, a: { t: 'onde', rayon: 10, degats: 22, gel: [1.5, 0.5] },
  },
  galaxie: {
    nom: 'Nébula', role: 'Cosmos', icone: '🌌', couleur: '#7a6bff', clair: '#ffc9f5',
    passif: 'Un peu de tout : +5 % de vitesse, +5 % de dégâts, 5 % de dégâts reçus en moins', pouvoir: 'Passe-passe', descPouvoir: 'Tu échanges ta place avec l’ennemi le plus proche que tu vois (35 m)', recharge: 24,
    p: { vitesse: 1.05, degats: 1.05, resiste: 0.95 }, a: { t: 'echange', portee: 35 },
  },
  prisme: {
    nom: 'Prisma', role: 'Lumière', icone: '🔮', couleur: '#ff8af0', clair: '#fff0fd',
    passif: '+15 % de dégâts dans la tête et tes tirs sont 20 % plus précis', pouvoir: 'Trait de lumière', descPouvoir: 'Un trait très rapide et très long (70 m) : jusqu’à 40 dégâts', recharge: 18,
    p: { tete: 1.15, precision: 0.8 }, a: { t: 'boule', portee: 70, vitesse: 80, rayon: 2.5, degats: 40 },
  },
};
export const TYPES_ESPRITS = Object.keys(ESPRITS);
// ---------- Amélioration des esprits pendant la partie (comme les établis d'amélioration de Fortnite) ----------
// Sur n'importe quel vrai autel, on paie des matériaux pour faire monter son esprit d'un niveau (★ → ★★ → ★★★).
// force : ce que deviennent ses bonus et la force de son pouvoir (dégâts, soins, bouclier) ; recharge : temps de recharge du pouvoir.
// Un esprit tombé (joueur éliminé) garde son niveau : celui qui le ramasse en profite.
// On améliore ses esprits DEPUIS L'ACCUEIL (page ✨ Esprits), avec des ÉCLATS D'ESPRIT 💠 gagnés en partie (monnaie qui ne sert qu'à
// ça). Le solde et le niveau de chaque esprit sont gardés sur le serveur (serveur/gestion.py, mêmes prix) ; en partie, l'esprit
// capturé a le niveau que son joueur lui a donné.
export const NIVEAUX = { max: 3, force: [1, 1, 1.35, 1.7], recharge: [1, 1, 0.85, 0.7], etoiles: ['', '★', '★★', '★★★'] };
// Le prix dépend de la rareté de cet esprit dans la collection du joueur (un esprit qu'il n'a pas encore : prix « commun »)
export const PRIX_ECLATS = { commun: [50, 120], rare: [80, 200], epique: [120, 300], legendaire: [200, 500] }; // [★★, ★★★]
// Esprit de départ perdu (mort avec lui) : prix pour le récupérer, selon sa rareté (mêmes prix sur le serveur)
export const PRIX_RECUPERATION = { commun: 25, rare: 40, epique: 60, legendaire: 100 };
export const prixAmelioration = (rarete, nivCible) => (PRIX_ECLATS[rarete] || PRIX_ECLATS.commun)[Math.max(2, Math.min(3, nivCible)) - 2];
// Où trouver des éclats : coffre, coffre doré, ravitaillement, petits tas sur l'île (part des points de butin), joueur éliminé,
// victoire. Le serveur en accepte 150 par partie et 600 par jour au plus. Les bots ramassent aussi des éclats (ils les lâchent
// quand ils sont éliminés) ; leurs esprits sont parfois améliorés selon la difficulté.
export const ECLATS = { coffre: 3, coffreDore: 10, ravito: 10, sol: 0.12, tas: 2, elimination: 5, eliminationMelee: 1, victoire: 25,
  icone: '💠', nom: 'éclats d\'esprit' };
export const niveauDe = esprit => Math.max(1, Math.min(NIVEAUX.max, (esprit && esprit.niv) | 0 || 1));
export const forceEsprit = esprit => NIVEAUX.force[niveauDe(esprit)];
export const rechargeEsprit = esprit => (ESPRITS[esprit && esprit.type] ? ESPRITS[esprit.type].recharge : 30) * NIVEAUX.recharge[niveauDe(esprit)];
// Un bonus « plus fort » : un multiplicateur s'éloigne de 1, une quantité grandit
export const plusFort = (base, v, f) => base + (v - base) * f;
// Comment chaque bonus des 50 esprits « à réglages » grandit avec le niveau
// (le poison et les épines ne grandissent pas ici : ce sont des dégâts d'esprit, l'hôte les multiplie déjà)
const PLUS = new Set(['degats', 'tete', 'explosion', 'recolte', 'pioche']);
const MOINS = new Set(['resiste', 'zone', 'recharge', 'conso', 'precision']);
const QUANTITES = new Set(['killPv', 'killBouclier', 'killMats', 'mats', 'munitions', 'carteEnnemis', 'carteCoffres', 'aimant']);
function monter(cle, v, f) {
  if (f === 1 || typeof v === 'boolean') return v;
  if (PLUS.has(cle)) return plusFort(1, v, f);
  if (MOINS.has(cle)) return Math.max(0.1, plusFort(1, v, f));
  if (QUANTITES.has(cle)) return Math.round(v * f);
  switch (cle) {
    case 'vitesse': return v > 1 ? plusFort(1, v, f) : v; // le malus de Carapou ne grandit pas
    case 'saut': return plusFort(9.2, v, f);
    case 'construit': return Math.max(2, Math.round(plusFort(10, v, f)));
    case 'sauve': return Math.min(60, Math.round(v * f));
    case 'volVie': return v * f;
    case 'degatsBas': return [v[0], plusFort(1, v[1], f)];
    case 'gelTouche': return [v[0] * f, v[1]];
    case 'regenPv': case 'regenBouclier': return [Math.min(100, Math.round(v[0] * (1 + (f - 1) * 0.6))), Math.round(v[1] * f)];
  }
  return v;
}
// Bonus passif d'un esprit « à réglages » (les 50 ajoutés) : don(joueur.esprit, 'degats', 1) → 1.08, ou la valeur par défaut.
// Il tient compte du niveau de l'esprit.
export const don = (esprit, cle, defaut = null) => {
  const p = esprit && ESPRITS[esprit.type] && ESPRITS[esprit.type].p;
  return p && p[cle] !== undefined ? monter(cle, p[cle], forceEsprit(esprit)) : defaut;
};
// Le pouvoir d'un esprit « à réglages » à un niveau donné : soins, bouclier, objets et durées grandissent
// (les dégâts, eux, sont multipliés par l'hôte au moment du coup, pour tous les esprits)
export function pouvoirAuNiveau(A, niv) {
  const f = NIVEAUX.force[Math.max(1, Math.min(NIVEAUX.max, niv | 0 || 1))];
  if (!A || f === 1) return A;
  const g = 1 + (f - 1) * 0.5, a = { ...A };
  for (const c of ['pv', 'bouclier', 'soin', 'regen']) if (a[c]) a[c] = Math.round(a[c] * f);
  if (a.duree && (a.t === 'buff' || a.t === 'nuage' || a.t === 'vision')) a.duree = +(a.duree * g).toFixed(2);
  if (a.gel) a.gel = [+(a.gel[0] * g).toFixed(2), a.gel[1]];
  if (a.objets) a.objets = a.objets.map(o => ({ ...o, qte: Math.max(1, Math.round((o.qte || 1) * f)) }));
  return a;
}
// Les réglages du pouvoir d'un esprit « à réglages » (null pour les 15 premiers, qui ont leur propre code)
export const pouvoirDe = type => (ESPRITS[type] && ESPRITS[type].a) || null;
// Le son d'un esprit : les 15 premiers ont le leur ; les 50 suivants prennent celui qui va avec leur sorte de pouvoir
const SONS_POUVOIRS = { boule: 'feu', frappe: 'feu', nuage: 'vent', onde: 'vent', chaine: 'foudre', soin: 'soin', buff: 'protection', dash: 'etoile', bond: 'mobilite',
  teleport: 'temps', echange: 'temps', piege: 'nature', objet: 'chance', murs: 'batisseur', vision: 'vision', clone: 'ombre' };
export const sonEsprit = type => 'esprit_' + ((pouvoirDe(type) && SONS_POUVOIRS[pouvoirDe(type).t]) || type);

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
// Les 50 esprits ajoutés : un trait de caractère et trois répliques chacun (capture, pouvoir, repos)
const PERSO_PLUS = {
  lave: ['Petite boule de lave qui boude dès qu’il fait frais.', 'Attention, je coule !', 'Flaque de lave !', 'Qui a éteint le chauffage ?'],
  cendre: ['Nuage de fumée discret, toujours un peu dans le brouillard.', 'Pfff… me voilà.', 'Rideau de fumée !', 'Tu me vois ? Moi non plus.'],
  comete: ['Petit caillou de l’espace très fier de sa traînée.', 'Je tombe à pic !', 'Météore !', 'J’ai fait trois fois le tour de la Lune.'],
  dragon: ['Bébé dragon qui éternue des flammèches.', 'Grrr ! Enfin… miaou ?', 'Souffle brûlant !', 'Atchoum ! Oups, pardon pour l’herbe.'],
  volcan: ['Petit volcan soupe au lait : il explose pour un rien.', 'Ça va péter !', 'Éruption !', 'Je bous, je bous…'],
  cristal: ['Cristal coquet qui adore qu’on le regarde briller.', 'Je brille, non ?', 'Igloo !', 'Ne me raye pas, s’il te plaît.'],
  neige: ['Bonhomme de neige rondouillard, jamais pressé.', 'Bien au frais !', 'Boule de neige géante !', 'J’ai perdu ma carotte.'],
  banquise: ['Manchot glisseur qui ne marche jamais quand il peut glisser.', 'Sur le ventre, c’est plus rapide !', 'Glissade !', 'Tu as du poisson ?'],
  aurore: ['Ruban de lumière doux et rêveur.', 'Regarde le ciel…', 'Lueur boréale !', 'Les couleurs, ça repose.'],
  orage: ['Gros nuage grognon qui gronde pour se faire entendre.', 'GRRROUM.', 'Nuage d’orage !', 'Il va pleuvoir. Je le sens.'],
  pile: ['Petite pile survoltée qui parle trop vite.', 'Chargé à bloc !', 'Survolté !', 'Tu-crois-qu’on-part-bientôt ?'],
  aimant: ['Aimant collant qui s’attache à tout le monde.', 'Je ne te lâche plus !', 'Attraction !', 'J’ai encore attrapé une cuillère.'],
  plasma: ['Boule de néon branchée, très à la mode.', 'Trop stylé, non ?', 'Arc plasma !', 'Bzzz… je clignote.'],
  nimbus: ['Petit nuage moelleux qui adore faire la sieste en hauteur.', 'On monte ?', 'Ascenseur !', 'Zzz… hein ? Je ne dormais pas.'],
  tornade: ['Tourbillon étourdi qui a toujours le tournis.', 'Ça tourne !', 'Tornade !', 'Où est le haut, déjà ?'],
  plume: ['Oiseau léger comme tout, toujours ailleurs.', 'Cui cui, on file !', 'Coup d’aile !', 'J’étais là-bas il y a une seconde.'],
  echo: ['Petite cloche bavarde qui répète tout… tout… tout.', 'Ding ! Ding !', 'Cri strident !', 'Tu m’entends… tends… tends ?'],
  vague: ['Vague joueuse qui éclabousse tout le monde.', 'Splash !', 'Déferlante !', 'La marée monte, non ?'],
  pluie: ['Petite pluie gentille qui fait pousser les fleurs.', 'Une averse, ça fait du bien.', 'Pluie douce !', 'Plic… ploc… plic…'],
  corail: ['Coquillage piquant mais au grand cœur.', 'Je pique un peu, désolée.', 'Oursin !', 'On entend la mer, là-dedans.'],
  poulpe: ['Poulpe farceur qui a toujours de l’encre plein les bras.', 'Huit bras pour t’aider !', 'Jet d’encre !', 'J’ai encore taché le tapis.'],
  fleur: ['Fleur délicate qui sent bon le printemps.', 'Sens comme ça sent bon !', 'Floraison !', 'Une abeille m’a dit bonjour.'],
  spore: ['Microbe rigolo qui adore tout ce qui est gluant.', 'Beurk, génial !', 'Nuage toxique !', 'Ne te lave pas les mains, s’il te plaît.'],
  cactus: ['Cactus câlin… mais personne ne veut de câlin.', 'Un câlin ? Non ? Dommage.', 'Explosion d’épines !', 'J’ai soif. Une fois par an.'],
  chene: ['Vieux chêne costaud et rassurant.', 'Solide comme un tronc !', 'Rempart !', 'J’ai 300 ans. Enfin, je crois.'],
  abeille: ['Abeille travailleuse qui bourdonne sans arrêt.', 'Bzz ! Au boulot !', 'Essaim !', 'Tu as vu une fleur ?'],
  liane: ['Liane acrobate qui se balance partout.', 'Accroche-toi !', 'Liane !', 'Je me suis encore emmêlée.'],
  ours: ['Gros ours gentil qui ne connaît pas sa force.', 'Un gros câlin ?', 'Coup de patte !', 'Tu as du miel ?'],
  loup: ['Jeune loup fier qui flaire tout.', 'J’ai une piste !', 'Traque !', 'Aouuuh… pardon, l’habitude.'],
  hibou: ['Hibou savant qui ne dort que le jour.', 'Hou hou, je vois tout.', 'Vue de nuit !', 'À cette heure-ci, je devrais dormir.'],
  tortue: ['Tortue prudente : lentement mais sûrement.', 'Doucement… on arrive.', 'Carapace !', 'Je réfléchis. Ça prend du temps.'],
  vampire: ['Chauve-souris gourmande qui dort la tête en bas.', 'J’ai un petit creux.', 'Morsure !', 'Il fait trop jour, ici.'],
  fantome: ['Petit fantôme qui a peur de tout, surtout de lui.', 'B… bouh ?', 'Frousse !', 'Tu as entendu ce bruit ?'],
  miroir: ['Éclat de miroir qui se trouve très beau.', 'Regarde-moi ! Enfin, regarde-toi.', 'Reflet !', 'Miroir, mon beau miroir…'],
  sablier: ['Sablier patient qui prend tout son temps.', 'Rien ne presse.', 'Ralenti !', 'Grain… après… grain.'],
  sable: ['Petite dune voyageuse, toujours du sable dans les yeux.', 'Ça gratte un peu.', 'Tempête de sable !', 'J’ai vu un chameau, une fois.'],
  bombe: ['Bombinette rigolarde qui adore les feux d’artifice.', 'Boum ? Boum !', 'Sac à malice !', 'Tic… tic… je plaisante.'],
  mine: ['Petit ressort malin qui adore faire des surprises.', 'Clic !', 'Mine !', 'Ne marche pas là. Ni là.'],
  reserve: ['Sac à dos prévoyant : il a toujours ce qu’il faut.', 'J’ai tout prévu !', 'Ravitaillement !', 'J’ai même pris un goûter.'],
  docteur: ['Pansement dévoué qui soigne tous les bobos.', 'Où est-ce que ça fait mal ?', 'Trousse !', 'Tu as mis ton manteau ?'],
  forge: ['Petit marteau costaud qui tape plus vite que son ombre.', 'On forge !', 'Lingots !', 'Cling ! Cling ! Cling !'],
  egide: ['Blason loyal, toujours devant ses amis.', 'Derrière moi, tout le monde !', 'Égide !', 'Je monte la garde.'],
  rage: ['Petite boule de nerfs qui s’énerve pour un rien.', 'Grrr ! Qui a commencé ?', 'Furie !', 'Je suis calme. JE SUIS CALME.'],
  ninja: ['Petite lame silencieuse : personne ne l’entend arriver.', '…', 'Furtif !', 'Tu ne m’as pas vu. Normal.'],
  robot: ['Petit robot précis qui calcule tout.', 'Bip. Cible acquise.', 'Tir orbital !', 'Bip bop. Mise à jour en cours.'],
  ange: ['Petit ange un peu maladroit avec son auréole.', 'Je veille sur toi.', 'Auréole !', 'Elle est où, mon auréole ?'],
  perroquet: ['Perroquet pirate qui répète « trésor ! » toute la journée.', 'Trésor ! Trésor !', 'Butin du pirate !', 'Coco veut un biscuit.'],
  soleil: ['Petit soleil souriant, toujours de bonne humeur.', 'Quelle belle journée !', 'Éclat solaire !', 'Tu as mis de la crème ?'],
  galaxie: ['Bout de galaxie rêveur, la tête dans les étoiles.', 'L’univers est grand…', 'Passe-passe !', 'J’ai compté les étoiles. Presque toutes.'],
  prisme: ['Boule de cristal qui prétend lire l’avenir.', 'Je vois… une victoire !', 'Trait de lumière !', 'Je vois… que tu as faim.'],
};
for (const [id, [trait, capture, pouvoir, repos]] of Object.entries(PERSO_PLUS)) PERSONNALITES[id] = { trait, capture: [capture], pouvoir: [pouvoir], repos: [repos] };
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
// Export d'un esprit vers la collection (comme l'extraction de Fortnite) : sur un AUTRE autel que celui où on l'a pris
export const EXPORT = { duree: 5, parPartie: 3 }; // secondes sans bouger ; nombre d'exports par partie
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
// Un esprit au hasard parmi ceux que l'admin a laissés allumés (pour un autel qui se recharge)
export const espritAuHasard = (r = Math.random) => { const choix = disponibles && disponibles.length ? disponibles : TYPES_ESPRITS; return choix[Math.floor(r() * choix.length)]; };
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

// Les 50 esprits du 22 nov. : une petite forme chacun en attendant leur vrai modèle (commandé à la session modélisation)
const FORME_SECOURS = {};
for (const [forme, liste] of Object.entries({
  oreilles: 'dragon banquise ours loup hibou tortue vampire abeille perroquet poulpe ninja fantome',
  flammes: 'lave cendre comete volcan bombe rage soleil forge',
  anneaux: 'orage nimbus tornade echo vague pluie sable sablier galaxie aimant',
  aureole: 'ange aurore docteur egide prisme miroir',
  feuilles: 'fleur spore cactus chene liane corail plume',
  cubes: 'mine reserve robot cristal pile plasma neige',
})) for (const t of liste.split(' ')) FORME_SECOURS[t] = forme;
const NB_FORME = { oreilles: 2, flammes: 4, anneaux: 2, aureole: 1, feuilles: 5, cubes: 4 };

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
  const forme = FORME_SECOURS[type];
  const n = NB[type] || NB_FORME[forme] || 5;
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
    else if (forme === 'oreilles') { m = new THREE.Mesh(GEO.feuille, lumineux(d.couleur, 1.3)); m.position.set((i ? 1 : -1) * 0.17, 0.3, 0.02); m.rotation.z = (i ? -1 : 1) * 0.35; m.scale.set(1.3, 0.8, 1.3); }
    else if (forme === 'flammes') { m = new THREE.Mesh(GEO.feuille, lumineux(i % 2 ? d.clair : d.couleur, 1.8)); m.position.set(Math.cos(a) * 0.14, 0.3 + (i % 2) * 0.06, Math.sin(a) * 0.14); }
    else if (forme === 'anneaux') { m = new THREE.Mesh(GEO.anneau, lumineux(i ? d.clair : d.couleur, 1.5)); m.rotation.set(Math.PI / 2 + (i ? 0.5 : -0.3), 0, i ? 0.4 : 0); m.scale.setScalar(i ? 0.8 : 1); }
    else if (forme === 'aureole') { m = new THREE.Mesh(GEO.anneau, lumineux(d.clair, 1.9)); m.rotation.x = Math.PI / 2; m.position.y = 0.42; m.scale.setScalar(0.5); }
    else if (forme === 'feuilles') { m = new THREE.Mesh(GEO.feuille, lumineux(i % 2 ? d.clair : d.couleur, 1.4)); m.position.set(Math.cos(a) * 0.2, 0.28, Math.sin(a) * 0.2); m.rotation.set(Math.sin(a) * 0.5, 0, -Math.cos(a) * 0.5); }
    else if (forme === 'cubes') { m = new THREE.Mesh(GEO.cube, lumineux(i % 2 ? d.clair : d.couleur, 1.3)); m.position.set(Math.cos(a) * 0.44, Math.sin(i * 1.9) * 0.1, Math.sin(a) * 0.44); m.rotation.set(a, a * 0.7, 0); }
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
