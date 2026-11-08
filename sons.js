// Bruitages et musiques fabriqués avec Web Audio (aucun fichier son).
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

export function son(nom, vol = 1) {
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
    case 'chute': rafale(0.2, 500, 1, 0.5 * vol); bip(120, 0.2, 0.25 * vol, 'sine', 50); break;
    case 'elimination': bip(880, 0.12, 0.2 * vol, 'square'); plus(110, () => bip(1320, 0.2, 0.2 * vol, 'square')); break;
    case 'serie': [660, 880, 1100, 1320].forEach((f, i) => plus(i * 80, () => bip(f, 0.14, 0.16 * vol, 'square'))); break;
    case 'victoire': [523, 659, 784, 1047, 1319].forEach((f, i) => plus(i * 140, () => bip(f, 0.3, 0.2 * vol, 'triangle'))); break;
    case 'niveau': [392, 523, 659, 784, 1047].forEach((f, i) => plus(i * 90, () => bip(f, 0.25, 0.16 * vol, 'triangle'))); plus(500, () => bip(1047, 0.6, 0.12 * vol, 'sine')); break;
    case 'mort': bip(300, 0.6, 0.25 * vol, 'sawtooth', 60); break;
    case 'saut': rafale(0.4, 500, 0.5, 0.3 * vol); break;
    case 'zone': bip(110, 0.6, 0.2 * vol, 'sawtooth', 80); break;
    case 'clic': bip(800, 0.04, 0.1 * vol, 'square'); break;
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
