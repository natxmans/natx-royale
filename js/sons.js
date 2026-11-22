// Bruitages : de vrais sons (dossier sons/) ; tant qu'un fichier n'est pas chargé, ou s'il manque, le même bruitage fabriqué avec
// Web Audio sert de secours. Les musiques et le vent de la chute restent fabriqués avec Web Audio.
let ctx = null, bruit = null, maitre = null, busMusique = null;
export let volumeGeneral = 0.6;
let volumeMusique = 0.5;

export function initSons() {
  if (ctx) { if (ctx.state === 'suspended') ctx.resume(); return; }
  ctx = new (window.AudioContext || window.webkitAudioContext)();
  maitre = ctx.createGain(); maitre.gain.value = volumeGeneral; maitre.connect(ctx.destination);
  busMusique = ctx.createGain(); busMusique.gain.value = volumeMusique * 0.7; busMusique.connect(maitre);
  bruit = ctx.createBuffer(1, ctx.sampleRate * 1.2, ctx.sampleRate);
  const d = bruit.getChannelData(0);
  for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  if (musiqueVoulue) jouerMusique(musiqueVoulue);
  chargerBruitages();
}

export function reglerVolume(v) { volumeGeneral = v; if (maitre) maitre.gain.value = v; }
export function reglerMusique(v) { volumeMusique = v; if (busMusique) busMusique.gain.value = v * 0.7; }

function rafale(duree, freq, q, vol, type = 'lowpass', sortie = maitre, t = ctx.currentTime) {
  if (!ctx) return;
  const s = ctx.createBufferSource(); s.buffer = bruit;
  const f = ctx.createBiquadFilter(); f.type = type; f.frequency.value = freq; f.Q.value = q;
  const g = ctx.createGain();
  g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.001, t + duree);
  s.connect(f); f.connect(g); g.connect(sortie);
  s.start(t, Math.random() * 0.5); s.stop(t + duree + 0.05);
}
function bip(freq, duree, vol, type = 'square', freqFin, sortie = maitre, t = ctx.currentTime, attaque = 0) {
  if (!ctx) return;
  const o = ctx.createOscillator(); o.type = type;
  const g = ctx.createGain();
  o.frequency.setValueAtTime(freq, t);
  if (freqFin) o.frequency.exponentialRampToValueAtTime(freqFin, t + duree);
  if (attaque) { g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(vol, t + attaque); }
  else g.gain.setValueAtTime(vol, t);
  g.gain.exponentialRampToValueAtTime(0.001, t + duree);
  o.connect(g); g.connect(sortie); o.start(t); o.stop(t + duree + 0.02);
}
const plus = (ms, f) => setTimeout(f, ms);

// ---------- Vrais bruitages (dossier sons/) ----------
// Les fichiers viennent de pixabay.com (licence Pixabay ; la liste et les auteurs sont dans sons/CREDITS.md).
// Chaque nom de son du jeu → un fichier de sons/ et ses réglages :
//   f = fichier (ou plusieurs : un au hasard à chaque fois), v = volume, ton = vitesse de lecture (1 = normal),
//   var = petite variation du ton au hasard (pour que ça ne sonne jamais deux fois pareil), duree = on coupe après tant de secondes,
//   tranches = morceaux [début, durée] d'un fichier qui contient plusieurs sons, avec = un autre son joué en même temps.
const VERSION_SONS = 2; // à augmenter quand un fichier de sons/ change (évite le vieux cache du navigateur)
const FICHIERS = {
  // armes
  // (les armes qui tirent vite ont un son coupé plus tôt : sinon 5 ou 6 échos se superposent et ça devient de la bouillie)
  pistolet: { f: 'pistolet', v: 0.85, var: 0.05, duree: 0.6 },
  smg: { f: 'smg', v: 0.6, ton: 1.12, var: 0.06, duree: 0.28 },
  fusil: { f: 'fusil', v: 0.75, var: 0.05, duree: 0.5 },
  pompe: { f: 'pompe', v: 1, var: 0.04 },
  sniper: { f: 'sniper', v: 1, var: 0.03 },
  roquette: { f: 'roquette', v: 0.9 },
  lancer: { f: 'souffle', v: 0.5, ton: 1.2, var: 0.08 },
  explosion: { f: 'explosion', v: 1.15, var: 0.06 },
  recharge: { f: 'recharge', v: 0.6 },
  vide: { f: 'vide', v: 0.5 },
  // pioche, récolte, constructions
  pioche: { f: 'souffle', v: 0.35, ton: 1.5, var: 0.1 },
  bois: { f: 'bois', v: 0.7, var: 0.08 },
  pierre: { f: 'pierre', v: 0.8, var: 0.08 },
  arbreTombe: { f: 'arbre', v: 0.9 },
  construire: { f: 'construire', v: 0.6, var: 0.1 },
  casse: { f: 'casse', v: 0.7, var: 0.08 },
  // coups reçus et donnés
  touche: { f: 'touche', v: 0.5, ton: 1.25, var: 0.06 },
  tete: { f: 'tete', v: 0.55, ton: 1.1 },
  aie: { f: 'aie', v: 0.75, var: 0.06 },
  bouclierCasse: { f: 'verre', v: 0.6 },
  mort: { f: 'mort', v: 0.8 },
  elimination: { f: 'elimination', v: 0.7 },
  serie: { f: 'elimination', v: 0.7, ton: 1.25 },
  coeur: { f: 'coeur', v: 0.6, duree: 0.8 }, // rejoué toutes les 0,95 s quand il reste peu de vie
  // objets, coffres, déplacements
  ramasser: { f: 'ramasser', v: 0.6, var: 0.05 },
  scintille_eclat: { f: 'scintille', v: 0.4, ton: 1.5, duree: 0.7, var: 0.06 }, // ramasser un éclat d'esprit
  coffre: { f: 'coffre', v: 0.8 },
  coffreDore: { f: 'scintille', v: 0.7, avec: 'coffre' },
  ravito: { f: 'arrivee', v: 0.7, ton: 0.75 },
  soin: { f: 'soin', v: 0.6 },
  rebond: { f: 'rebond', v: 0.7, var: 0.06 },
  passage: { f: 'teleport', v: 0.7 },
  chute: { f: 'chute', v: 0.8 },
  saut: { f: 'souffle', v: 0.4, ton: 0.85 },
  // menus et annonces
  clic: { f: 'clic', v: 0.45 },
  niveau: { f: 'niveau', v: 0.7 },
  ameliorer: { f: 'niveau', v: 0.65, ton: 1.12, avec: 'construire' }, // un esprit monte de niveau sur un autel
  victoire: { f: 'victoire', v: 0.8 },
  zone: { f: 'zone', v: 0.5 },
  cadeau: { f: 'scintille', v: 0.5, ton: 1.15 },
  message: { f: 'message', v: 0.5 },
  arrivee: { f: 'arrivee', v: 0.5 },
  // bruits de pas selon le sol
  // (on les entend sans arrêt : plus doux que le reste ; volumes mesurés pour que les 5 sols aient la même force)
  pasHerbe: { f: ['pasHerbe1', 'pasHerbe2', 'pasHerbe3'], v: 0.3, var: 0.1 },
  pasSable: { f: 'pasSable', v: 0.35, var: 0.1, tranches: [[0.65, 0.18], [0.87, 0.18], [1.13, 0.18], [1.83, 0.18]] },
  pasNeige: { f: 'pasNeige', v: 0.5, var: 0.08, duree: 0.45 },
  pasBois: { f: 'pasBois', v: 0.28, var: 0.1 },
  pasEau: { f: 'eau', v: 0.45, ton: 1.15, var: 0.12, duree: 0.5 },
  // esprits (capture et pouvoir) : les 50 esprits du 22 nov. prennent le son de leur sorte de pouvoir (esprits.js, sonEsprit)
  esprit_soin: { f: 'magie', v: 0.7, ton: 1.2 },
  esprit_mobilite: { f: 'elan', v: 0.5, ton: 1.2 },
  esprit_protection: { f: 'bouclier', v: 0.6 },
  esprit_vision: { f: 'magie', v: 0.7, ton: 1.4 },
  esprit_batisseur: { f: 'magie', v: 0.6, ton: 0.85, avec: 'construire' },
  esprit_feu: { f: 'feu', v: 0.8 },
  esprit_glace: { f: 'glace', v: 0.8, duree: 1.4 },
  esprit_foudre: { f: 'foudre', v: 0.7 },
  esprit_vent: { f: 'elan', v: 0.5, ton: 0.8 },
  esprit_nature: { f: 'magie', v: 0.6, ton: 0.9 },
  esprit_ombre: { f: 'teleport', v: 0.6, ton: 0.7 },
  esprit_temps: { f: 'teleport', v: 0.6, ton: 1.25 },
  esprit_eau: { f: 'eau', v: 0.6, ton: 0.8 },
  esprit_chance: { f: 'scintille', v: 0.6 },
  esprit_etoile: { f: 'scintille', v: 0.6, ton: 1.2 },
  esprit_rare: { f: 'scintille', v: 0.35, ton: 1.45 },
};
export const NOMS_SONS = Object.keys(FICHIERS);
const tampons = new Map(); // fichier → { b, debut, gain } une fois chargé ; false s'il manque
let chargementSons = null, vraisSons = true;
// Pour comparer (page d'écoute) : false = seulement les anciens bruitages fabriqués
export function reglerVraisSons(oui) { vraisSons = !!oui; }
export function etatSons() { const v = [...tampons.values()]; return { prets: v.filter(Boolean).length, manquants: v.filter(x => x === false).length, total: new Set(Object.values(FICHIERS).flatMap(d => [].concat(d.f))).size }; }
// Mesure un son chargé : où il commence vraiment (les fichiers ont un petit silence au début) et de combien le monter ou le baisser
// pour que tous les sons aient à peu près la même force avant leur réglage « v ».
function mesurer(b) {
  const n = b.length, sr = b.sampleRate;
  let pic = 0;
  const voies = [];
  for (let c = 0; c < b.numberOfChannels; c++) { const d = b.getChannelData(c); voies.push(d); for (let i = 0; i < n; i++) { const a = d[i] < 0 ? -d[i] : d[i]; if (a > pic) pic = a; } }
  if (!(pic > 0)) return { b, debut: 0, gain: 1 };
  const d0 = voies[0], seuil = pic * 0.04;
  let debut = 0;
  while (debut < n && d0[debut] < seuil && d0[debut] > -seuil) debut++;
  // force du passage le plus fort (fenêtre d'un dixième de seconde)
  const w = Math.max(1, Math.round(sr * 0.1));
  let som = 0, fort = 0;
  for (let i = 0; i < n; i++) { som += d0[i] * d0[i]; if (i >= w) som -= d0[i - w] * d0[i - w]; if (i >= w - 1 && som > fort) fort = som; }
  const rms = Math.sqrt(fort / w) || pic;
  return { b, debut: Math.max(0, debut / sr - 0.004), gain: Math.min(0.95 / pic, 0.25 / rms) };
}
// Charge tous les fichiers en douce (4 à la fois), après le premier clic du joueur
function chargerBruitages() {
  if (chargementSons || !ctx) return chargementSons;
  const noms = [...new Set(Object.values(FICHIERS).flatMap(d => [].concat(d.f)))];
  let i = 0;
  const suivant = async () => {
    while (i < noms.length) {
      const nom = noms[i++];
      try {
        const r = await fetch(new URL(`../sons/${nom}.mp3?v=${VERSION_SONS}`, import.meta.url)); // à côté du dossier js/, quelle que soit la page
        if (!r.ok) throw new Error('absent');
        const donnees = await r.arrayBuffer();
        const b = await new Promise((ok, rate) => ctx.decodeAudioData(donnees, ok, rate));
        tampons.set(nom, mesurer(b));
      } catch (e) { tampons.set(nom, false); } // fichier absent ou illisible : le bruitage fabriqué reste
    }
  };
  chargementSons = Promise.all([suivant(), suivant(), suivant(), suivant()]);
  return chargementSons;
}
export const bruitagesPrets = () => chargementSons || Promise.resolve();
// Joue le vrai son s'il est chargé ; renvoie false sinon
function jouerFichier(nom, vol) {
  const d = FICHIERS[nom];
  if (!d) return false;
  const liste = [].concat(d.f);
  const t = tampons.get(liste[Math.floor(Math.random() * liste.length)]);
  if (!t) return false;
  const s = ctx.createBufferSource(); s.buffer = t.b;
  const ton = (d.ton || 1) * (1 + (Math.random() * 2 - 1) * (d.var || 0));
  s.playbackRate.value = ton;
  const g = ctx.createGain(), niveau = vol * (d.v === undefined ? 1 : d.v) * t.gain, m = ctx.currentTime;
  g.gain.setValueAtTime(niveau, m);
  s.connect(g); g.connect(maitre);
  const tr = d.tranches ? d.tranches[Math.floor(Math.random() * d.tranches.length)] : null;
  const debut = tr ? tr[0] : t.debut, duree = tr ? tr[1] : d.duree || 0;
  if (duree) { // on coupe en douceur
    const fin = m + duree / ton;
    g.gain.setValueAtTime(niveau, Math.max(m, fin - 0.04)); g.gain.linearRampToValueAtTime(0.0001, fin);
    s.start(m, debut, duree);
  } else s.start(m, debut);
  if (d.avec) jouerFichier(d.avec, vol);
  return true;
}

export function son(nom, vol = 1) {
  if (!ctx || vol < 0.02) return;
  if (vraisSons && jouerFichier(nom, vol)) return;
  sonFabrique(nom, vol);
}
// Les anciens bruitages, fabriqués avec Web Audio : ils servent de secours tant qu'un fichier n'est pas chargé
export function sonFabrique(nom, vol = 1) {
  if (!ctx || vol < 0.02) return;
  switch (nom) {
    case 'pistolet': rafale(0.12, 2600, 1, 0.5 * vol); bip(180, 0.08, 0.2 * vol, 'sine', 60); break;
    case 'smg': rafale(0.07, 3200, 1, 0.35 * vol); break;
    case 'fusil': rafale(0.14, 2000, 1, 0.55 * vol); bip(140, 0.1, 0.25 * vol, 'sine', 50); break;
    case 'pompe': rafale(0.32, 1200, 0.7, 0.8 * vol); bip(90, 0.25, 0.4 * vol, 'sine', 35); break;
    case 'sniper': rafale(0.45, 1500, 0.8, 0.9 * vol); bip(70, 0.4, 0.5 * vol, 'sine', 30); break;
    case 'roquette': rafale(0.6, 900, 0.6, 0.55 * vol); bip(220, 0.45, 0.15 * vol, 'sawtooth', 70); break;
    case 'lancer': rafale(0.18, 1400, 1.5, 0.25 * vol, 'bandpass'); break;
    case 'explosion': rafale(1.1, 380, 0.7, 1.0 * vol); bip(55, 0.9, 0.6 * vol, 'sine', 22); rafale(0.35, 2600, 0.5, 0.35 * vol); break;
    case 'pioche': rafale(0.08, 1800, 4, 0.4 * vol, 'bandpass'); break;
    case 'bois': rafale(0.1, 600, 3, 0.5 * vol, 'bandpass'); bip(220, 0.06, 0.15 * vol, 'triangle', 120); break;
    case 'pierre': rafale(0.12, 2500, 6, 0.5 * vol, 'bandpass'); break;
    case 'arbreTombe': rafale(0.9, 300, 0.8, 0.5 * vol); bip(90, 0.5, 0.2 * vol, 'triangle', 40); break;
    case 'construire': bip(320, 0.07, 0.18 * vol, 'square', 160); rafale(0.06, 800, 2, 0.25 * vol, 'bandpass'); break;
    case 'casse': rafale(0.3, 700, 1, 0.5 * vol); break;
    case 'touche': bip(1300, 0.05, 0.15 * vol, 'square'); break;
    case 'tete': bip(1900, 0.08, 0.2 * vol, 'square', 2400); break;
    case 'aie': bip(260, 0.15, 0.25 * vol, 'sawtooth', 120); break;
    case 'bouclierCasse': bip(900, 0.25, 0.2 * vol, 'triangle', 200); break;
    case 'recharge': bip(500, 0.05, 0.12 * vol, 'square'); plus(120, () => bip(700, 0.05, 0.12 * vol, 'square')); break;
    case 'vide': bip(900, 0.03, 0.1 * vol, 'square'); break;
    case 'ramasser': bip(600, 0.08, 0.15 * vol, 'triangle', 1200); break;
    case 'coffre': [523, 659, 784, 1047].forEach((f, i) => plus(i * 70, () => bip(f, 0.15, 0.13 * vol, 'triangle'))); break;
    case 'coffreDore': [523, 659, 784, 1047, 1319, 1568].forEach((f, i) => plus(i * 60, () => { bip(f, 0.22, 0.13 * vol, 'triangle'); bip(f * 2, 0.1, 0.04 * vol, 'sine'); })); break;
    case 'ravito': bip(784, 0.3, 0.15 * vol, 'triangle'); plus(260, () => bip(587, 0.45, 0.15 * vol, 'triangle')); rafale(1.2, 500, 0.5, 0.15 * vol); break;
    case 'soin': bip(400, 0.4, 0.12 * vol, 'sine', 800); break;
    case 'rebond': bip(160, 0.35, 0.3 * vol, 'sine', 720); bip(320, 0.2, 0.08 * vol, 'triangle', 900); break;
    case 'passage': bip(220, 0.45, 0.22 * vol, 'sine', 55); plus(120, () => bip(90, 0.5, 0.2 * vol, 'triangle', 40)); plus(380, () => bip(500, 0.18, 0.08 * vol, 'triangle', 900)); break;
    case 'chute': rafale(0.2, 500, 1, 0.5 * vol); bip(120, 0.2, 0.25 * vol, 'sine', 50); break;
    case 'elimination': bip(880, 0.12, 0.2 * vol, 'square'); plus(110, () => bip(1320, 0.2, 0.2 * vol, 'square')); break;
    case 'serie': [660, 880, 1100, 1320].forEach((f, i) => plus(i * 80, () => bip(f, 0.14, 0.16 * vol, 'square'))); break;
    case 'victoire': [523, 659, 784, 1047, 1319].forEach((f, i) => plus(i * 140, () => bip(f, 0.3, 0.2 * vol, 'triangle'))); break;
    case 'niveau': [392, 523, 659, 784, 1047].forEach((f, i) => plus(i * 90, () => bip(f, 0.25, 0.16 * vol, 'triangle'))); plus(500, () => bip(1047, 0.6, 0.12 * vol, 'sine')); break;
    case 'mort': bip(300, 0.6, 0.25 * vol, 'sawtooth', 60); break;
    case 'saut': rafale(0.4, 500, 0.5, 0.3 * vol); break;
    case 'zone': bip(110, 0.6, 0.2 * vol, 'sawtooth', 80); break;
    case 'clic': bip(800, 0.04, 0.1 * vol, 'square'); break;
    case 'esprit_soin': [523, 659, 784].forEach((f, i) => plus(i * 90, () => bip(f, 0.3, 0.09 * vol, 'sine', f * 1.02))); break;
    case 'esprit_mobilite': rafale(0.35, 2400, 1.6, 0.18 * vol, 'bandpass'); bip(600, 0.25, 0.08 * vol, 'sine', 1500); break;
    case 'esprit_protection': bip(330, 0.6, 0.12 * vol, 'triangle'); plus(60, () => bip(495, 0.5, 0.08 * vol, 'triangle')); break;
    case 'esprit_vision': bip(880, 0.45, 0.08 * vol, 'sine', 620); plus(200, () => bip(1320, 0.3, 0.05 * vol, 'sine', 990)); break;
    case 'esprit_batisseur': bip(220, 0.06, 0.15 * vol, 'square', 140); plus(130, () => bip(220, 0.06, 0.15 * vol, 'square', 140)); plus(280, () => bip(1046, 0.25, 0.08 * vol, 'triangle')); break;
    // les 10 esprits ajoutés
    case 'esprit_feu': rafale(0.45, 700, 0.9, 0.2 * vol, 'lowpass'); bip(180, 0.3, 0.1 * vol, 'sawtooth', 90); break;
    case 'esprit_glace': [1760, 2093, 2637, 3136].forEach((f, i) => plus(i * 55, () => bip(f, 0.2, 0.04 * vol, 'sine'))); break;
    case 'esprit_foudre': rafale(0.12, 3000, 2, 0.25 * vol, 'highpass'); plus(70, () => bip(1400, 0.18, 0.1 * vol, 'sawtooth', 300)); break;
    case 'esprit_vent': rafale(0.6, 1200, 0.8, 0.2 * vol, 'bandpass'); break;
    case 'esprit_nature': bip(196, 0.12, 0.12 * vol, 'triangle', 147); plus(120, () => bip(262, 0.2, 0.1 * vol, 'triangle', 196)); break;
    case 'esprit_ombre': bip(440, 0.5, 0.09 * vol, 'sine', 180); plus(120, () => bip(330, 0.4, 0.06 * vol, 'sine', 140)); break;
    case 'esprit_temps': [988, 784, 988, 784].forEach((f, i) => plus(i * 80, () => bip(f, 0.07, 0.09 * vol, 'square'))); break;
    case 'esprit_eau': bip(300, 0.25, 0.12 * vol, 'sine', 900); plus(160, () => bip(500, 0.2, 0.08 * vol, 'sine', 1200)); break;
    case 'esprit_chance': [1319, 1568, 2093].forEach((f, i) => plus(i * 70, () => bip(f, 0.14, 0.08 * vol, 'triangle'))); break;
    case 'esprit_etoile': bip(600, 0.35, 0.1 * vol, 'sine', 2400); plus(200, () => bip(2637, 0.25, 0.05 * vol, 'sine')); break;
    case 'esprit_rare': [1568, 2093, 2637].forEach((f, i) => plus(i * 60, () => bip(f, 0.18, 0.035 * vol, 'sine'))); break;
    case 'cadeau': bip(1046, 0.12, 0.05 * vol, 'sine'); plus(110, () => bip(1397, 0.12, 0.045 * vol, 'sine')); plus(220, () => bip(2093, 0.22, 0.03 * vol, 'sine')); break;
    case 'message': bip(1180, 0.07, 0.08 * vol, 'sine'); plus(80, () => bip(1560, 0.09, 0.08 * vol, 'sine')); break;
    case 'arrivee': bip(660, 0.1, 0.12 * vol, 'triangle'); plus(110, () => bip(880, 0.16, 0.12 * vol, 'triangle')); break;
    case 'coeur': bip(62, 0.13, 0.4 * vol, 'sine', 40); plus(170, () => bip(55, 0.16, 0.32 * vol, 'sine', 38)); break;
    // Bruits de pas selon le sol
    case 'pasHerbe': rafale(0.06, 900, 1.2, 0.12 * vol, 'bandpass'); break;
    case 'pasSable': rafale(0.08, 1600, 0.8, 0.12 * vol, 'bandpass'); break;
    case 'pasNeige': rafale(0.09, 2600, 0.6, 0.1 * vol, 'highpass'); break;
    case 'pasBois': rafale(0.05, 420, 3, 0.18 * vol, 'bandpass'); bip(160, 0.04, 0.06 * vol, 'triangle', 110); break;
    case 'pasEau': rafale(0.16, 1300, 0.8, 0.14 * vol, 'bandpass'); break;
  }
}

// Son dans l'espace : plus faible quand c'est loin
export function sonLoin(nom, distance) {
  son(nom, Math.max(0, 1 - distance / 160) ** 2);
}

// ---------- Vent pendant la chute ----------
let vent = null;
export function reglerVent(k) {
  if (!ctx) return;
  if (!vent) {
    const s = ctx.createBufferSource(); s.buffer = bruit; s.loop = true;
    const f = ctx.createBiquadFilter(); f.type = 'bandpass'; f.frequency.value = 600; f.Q.value = 0.6;
    const g = ctx.createGain(); g.gain.value = 0;
    s.connect(f); f.connect(g); g.connect(maitre); s.start();
    vent = { g, f };
  }
  const t = ctx.currentTime;
  vent.g.gain.setTargetAtTime(Math.max(0, Math.min(1, k)) * 0.35, t, 0.15);
  vent.f.frequency.setTargetAtTime(400 + k * 900, t, 0.2);
}

// ---------- Musiques (inventées, jouées note par note) ----------
const hz = n => 440 * Math.pow(2, (n - 69) / 12);
const MORCEAUX = {
  // menu : entraînant
  menu: {
    bpm: 112, batterie: true,
    accords: [[48, 55, 64], [43, 55, 62], [45, 57, 64], [41, 57, 65]],
    melodie: [72, 0, 76, 0, 79, 77, 76, 74, 74, 0, 71, 0, 74, 76, 74, 71, 72, 0, 69, 0, 72, 76, 74, 72, 69, 0, 72, 0, 77, 76, 74, 72,
      76, 0, 79, 0, 84, 83, 81, 79, 79, 0, 74, 0, 79, 81, 79, 77, 76, 0, 72, 0, 76, 79, 77, 76, 77, 76, 74, 72, 74, 0, 72, 0],
  },
  // dirigeable : calme, en attendant de sauter
  dirigeable: {
    bpm: 86, batterie: false, arpege: true,
    accords: [[45, 57, 64], [41, 57, 65], [48, 55, 64], [43, 55, 62]],
    melodie: [],
  },
};
let musique = null, musiqueVoulue = null;
export function jouerMusique(nom) {
  musiqueVoulue = nom;
  if (!ctx) return;
  if (musique && musique.nom === nom) return;
  arreterMusique(false);
  const m = MORCEAUX[nom];
  if (!m) return;
  musique = { nom, etape: 0, prochain: ctx.currentTime + 0.15 };
  musique.timer = setInterval(() => planifier(m), 60);
}
export function arreterMusique(oublier = true) {
  if (oublier) musiqueVoulue = null;
  if (musique) { clearInterval(musique.timer); musique = null; }
}
function planifier(m) {
  const pas = 60 / m.bpm / 4; // une double croche
  while (musique && musique.prochain < ctx.currentTime + 0.25) {
    const e = musique.etape, t = musique.prochain;
    const mesure = Math.floor(e / 16) % m.accords.length, dans = e % 16;
    const acc = m.accords[mesure];
    const B = busMusique;
    // basse
    if (dans % 8 === 0) bip(hz(acc[0] - 12), pas * 6, 0.16, 'triangle', null, B, t, 0.01);
    if (m.batterie && dans % 8 === 6) bip(hz(acc[0]), pas * 1.5, 0.08, 'triangle', null, B, t, 0.01);
    // nappe d'accords
    if (dans === 0) for (const n of acc) bip(hz(n + 12), pas * 15, 0.025, 'sine', null, B, t, 0.25);
    // arpège
    if (m.arpege && dans % 2 === 0) bip(hz(acc[(dans / 2) % 3] + 24), pas * 3, 0.03, 'sine', null, B, t, 0.02);
    // mélodie (une note par croche)
    if (m.melodie.length && dans % 2 === 0) {
      const n = m.melodie[((Math.floor(e / 2)) % m.melodie.length)];
      if (n) { bip(hz(n), pas * 1.8, 0.05, 'triangle', null, B, t, 0.01); bip(hz(n + 12), pas * 0.8, 0.012, 'square', null, B, t, 0.005); }
    }
    // batterie
    if (m.batterie) {
      if (dans % 8 === 0) bip(150, 0.12, 0.35, 'sine', 40, B, t);
      if (dans % 8 === 4) rafale(0.12, 1800, 0.8, 0.12, 'bandpass', B, t);
      if (dans % 2 === 1) rafale(0.03, 8000, 0.7, 0.035, 'highpass', B, t);
    }
    musique.etape++; musique.prochain += pas;
  }
}
