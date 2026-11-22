// Touches personnalisables (Paramètres → ⌨️ Touches).
// Le jeu continue de raisonner avec les touches « de base » (KeyW = avancer, KeyE = ramasser…) :
// ce module traduit la touche que le joueur a choisie en touche de base, juste à l'arrivée du clavier.
// On travaille avec la POSITION des touches (e.code), donc ça marche pareil en AZERTY et en QWERTY.

export const ACTIONS = [
  { id: 'avancer', nom: 'Avancer', base: 'KeyW' },
  { id: 'reculer', nom: 'Reculer', base: 'KeyS' },
  { id: 'gauche', nom: 'Aller à gauche', base: 'KeyA' },
  { id: 'droite', nom: 'Aller à droite', base: 'KeyD' },
  { id: 'sauter', nom: 'Sauter · deltaplane', base: 'Space' },
  { id: 'courir', nom: 'Courir · plonger', base: 'ShiftLeft' },
  { id: 'accroupir', nom: "S'accroupir", base: 'KeyX' },
  { id: 'ramasser', nom: 'Ramasser · ouvrir · capturer', base: 'KeyE' },
  { id: 'recharger', nom: 'Recharger', base: 'KeyR' },
  { id: 'jeter', nom: "Jeter l'objet", base: 'KeyG' },
  { id: 'mur', nom: 'Construire un mur', base: 'KeyF' },
  { id: 'rampe', nom: 'Construire une rampe', base: 'KeyC' },
  { id: 'sol', nom: 'Construire un sol', base: 'KeyV' },
  { id: 'pouvoir', nom: "Pouvoir de l'esprit", base: 'KeyQ' },
  { id: 'ameliorer', nom: "Améliorer l'esprit (sur un autel)", base: 'KeyU' },
  { id: 'emote', nom: 'Émote (danse)', base: 'KeyB' },
  { id: 'carte', nom: 'Grande carte', base: 'KeyM' },
  { id: 'chat', nom: 'Discuter', base: 'KeyT' },
  { id: 'souris', nom: 'Libérer la souris', base: 'KeyH' },
];
const PAR_ID = new Map(ACTIONS.map(a => [a.id, a]));
const BASES = new Set(ACTIONS.map(a => a.base));

// Touches qu'on ne peut pas prendre : elles ont déjà un rôle fixe
export const RESERVEES = {
  Escape: 'Échap sert à mettre en pause', Tab: 'Tab affiche le classement', Enter: 'Entrée ouvre la discussion',
  Digit1: '1 à 6 changent d\'objet', Digit2: '1 à 6 changent d\'objet', Digit3: '1 à 6 changent d\'objet',
  Digit4: '1 à 6 changent d\'objet', Digit5: '1 à 6 changent d\'objet', Digit6: '1 à 6 changent d\'objet',
  Digit7: '7, 8, 9 et 0 envoient les messages rapides', Digit8: '7, 8, 9 et 0 envoient les messages rapides',
  Digit9: '7, 8, 9 et 0 envoient les messages rapides', Digit0: '7, 8, 9 et 0 envoient les messages rapides',
  MetaLeft: 'la touche Windows est gérée par l\'ordinateur', MetaRight: 'la touche Windows est gérée par l\'ordinateur',
  ContextMenu: 'cette touche ouvre le menu de l\'ordinateur', F5: 'F5 recharge la page', F11: 'F11 met en plein écran', F12: 'F12 ouvre les outils du navigateur',
};
const CODE_VALIDE = /^[A-Za-z0-9]{2,24}$/;

let perso = {}; // id d'action → touche choisie (seulement celles qui ont changé)
let table = new Map(); // touche appuyée → touche de base

function reconstruire() {
  table = new Map();
  for (const a of ACTIONS) table.set(perso[a.id] || a.base, a.base);
  // raccourcis d'avant, gardés tant que l'action n'a pas été changée (et que la touche est libre)
  if (!perso.courir && !table.has('ShiftRight')) table.set('ShiftRight', 'ShiftLeft');
  if (!perso.carte && !table.has('Semicolon')) table.set('Semicolon', 'KeyM'); // le M d'un clavier AZERTY
}

// À appeler au démarrage avec reglages.touches (garde seulement ce qui est valable)
export function chargerTouches(r) {
  perso = {};
  const pris = new Set();
  if (r && typeof r === 'object') {
    for (const [id, code] of Object.entries(r)) {
      if (!PAR_ID.has(id) || typeof code !== 'string' || !CODE_VALIDE.test(code) || RESERVEES[code] || pris.has(code)) continue;
      if (code !== PAR_ID.get(id).base) perso[id] = code;
      pris.add(code);
    }
  }
  // une touche de base ne peut pas servir deux fois (ex. ancienne action restée sur sa touche de base)
  for (const a of ACTIONS) if (!perso[a.id] && Object.values(perso).includes(a.base)) delete perso[Object.keys(perso).find(k => perso[k] === a.base)];
  reconstruire();
  return { ...perso };
}
export const touchesPerso = () => ({ ...perso });

// Touche appuyée → touche de base que le jeu comprend (null = touche à ignorer)
export function traduire(code) {
  if (table.has(code)) return table.get(code);
  if (BASES.has(code)) return null; // touche de base d'une action qui a été déplacée ailleurs
  return code; // flèches, chiffres, Tab, Entrée… : inchangées
}

// Touche choisie pour une action (par son id ou par sa touche de base)
export function toucheDe(idOuBase) {
  const a = PAR_ID.get(idOuBase) || ACTIONS.find(x => x.base === idOuBase);
  return a ? perso[a.id] || a.base : idOuBase;
}

// Donner une touche à une action. Si une autre action l'avait, elles échangent leurs touches.
export function choisirTouche(id, code) {
  const a = PAR_ID.get(id);
  if (!a) return { ok: false, message: 'Action inconnue.' };
  if (RESERVEES[code]) return { ok: false, message: `Touche réservée : ${RESERVEES[code]}.` };
  if (!CODE_VALIDE.test(code)) return { ok: false, message: 'Cette touche ne peut pas être utilisée.' };
  const ancienne = toucheDe(id);
  if (code === ancienne) return { ok: true, echange: null };
  const autre = ACTIONS.find(x => x.id !== id && toucheDe(x.id) === code);
  const fixer = (act, touche) => { if (touche === act.base) delete perso[act.id]; else perso[act.id] = touche; };
  fixer(a, code);
  if (autre) fixer(autre, ancienne);
  reconstruire();
  return { ok: true, echange: autre ? autre.nom : null };
}
export function touchesParDefaut() { perso = {}; reconstruire(); }

// ---------- Nom affiché d'une touche ----------
// Sans la carte du clavier (Firefox, Safari), on suppose un clavier AZERTY (français)
const AZERTY = { KeyQ: 'A', KeyW: 'Z', KeyA: 'Q', KeyZ: 'W', KeyM: ',', Semicolon: 'M', Comma: ';', Period: ':', Slash: '!' };
const NOMS = {
  Space: 'Espace', ShiftLeft: 'Maj', ShiftRight: 'Maj droite', ControlLeft: 'Ctrl', ControlRight: 'Ctrl droite', AltLeft: 'Alt', AltRight: 'Alt Gr',
  CapsLock: 'Verr. Maj', Backspace: 'Retour', Delete: 'Suppr', Insert: 'Inser', Home: 'Début', End: 'Fin', PageUp: 'Page ↑', PageDown: 'Page ↓',
  ArrowUp: '↑', ArrowDown: '↓', ArrowLeft: '←', ArrowRight: '→', Tab: 'Tab', Enter: 'Entrée', Escape: 'Échap', Backquote: '²',
  NumpadAdd: 'Pavé +', NumpadSubtract: 'Pavé -', NumpadMultiply: 'Pavé *', NumpadDivide: 'Pavé /', NumpadEnter: 'Pavé Entrée', NumpadDecimal: 'Pavé .',
};
let disposition = null;
export function chargerDisposition(apres) {
  if (!navigator.keyboard || !navigator.keyboard.getLayoutMap) return;
  navigator.keyboard.getLayoutMap().then(m => { disposition = m; if (apres) apres(); }).catch(() => {});
}
export function nomTouche(code) {
  if (NOMS[code]) return NOMS[code];
  if (/^Numpad\d$/.test(code)) return 'Pavé ' + code.slice(6);
  if (/^F\d{1,2}$/.test(code)) return code;
  const v = disposition && disposition.get(code);
  if (v && v.trim()) return v.toUpperCase();
  if (AZERTY[code]) return AZERTY[code];
  if (/^Key[A-Z]$/.test(code)) return code.slice(3);
  if (/^Digit\d$/.test(code)) return code.slice(5);
  return code;
}
