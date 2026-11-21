// Boutique : catalogue des objets (tous inventés), pièces, profil du joueur.
import { hasard } from './outils.js';
import { CATALOGUE_250, COLLECTIONS_250 } from './catalogue250.js';

export const RARETES_COSM = {
  commun:     { nom: 'Commun',     couleur: '#8fa3b8', prix: 300 },
  rare:       { nom: 'Rare',       couleur: '#3d8dff', prix: 600 },
  epique:     { nom: 'Épique',     couleur: '#b552ff', prix: 1000 },
  legendaire: { nom: 'Légendaire', couleur: '#ffad1f', prix: 1600 },
  collab:     { nom: 'Collab 2K27', couleur: '#ff2e88', prix: 1200 },
  staff:      { nom: 'Staff', couleur: '#14e0a2', prix: 0 }, // jamais en vente : seulement pour les comptes liés au staff
};

export const CATEGORIES = [
  { id: 'tenue', nom: 'Tenues', un: 'Tenue', icone: '👕' },
  { id: 'chapeau', nom: 'Chapeaux', un: 'Chapeau', icone: '🎩' },
  { id: 'dos', nom: 'Dos', un: 'Dos', icone: '🎒' },
  { id: 'pioche', nom: 'Pioches', un: 'Pioche', icone: '⛏️' },
  { id: 'deltaplane', nom: 'Deltaplanes', un: 'Deltaplane', icone: '🪁' },
  { id: 'trainee', nom: 'Traînées', un: 'Traînée', icone: '✨' },
  { id: 'emote', nom: 'Émotes', un: 'Émote', icone: '💃' },
];

// g = gratuit (déjà possédé au départ)
const L = (id, cat, nom, rarete, desc, g = false) => ({ id, cat, nom, rarete, desc, gratuit: g });
export const CATALOGUE = [
  // Tenues
  L('classique', 'tenue', 'Classique', 'commun', 'Ta couleur préférée, tout simplement.', true),
  L('mariniere', 'tenue', 'Marinière', 'commun', 'Des rayures bleu et blanc, comme au bord de la mer.'),
  L('sportif', 'tenue', 'Numéro 10', 'commun', 'Maillot de sport, prêt pour la finale.'),
  L('cuisinier', 'tenue', 'Grand Chef', 'commun', 'Veste blanche et boutons dorés.'),
  L('fermier', 'tenue', 'Salopette', 'commun', 'Chemise à carreaux et salopette en jean.'),
  L('camouflage', 'tenue', 'Camouflage', 'rare', 'Parfait pour se cacher dans les buissons.'),
  L('pyjama', 'tenue', 'Pyjama Étoilé', 'rare', 'Pour faire la bataille… en pantoufles.'),
  L('pirate', 'tenue', 'Corsaire', 'rare', 'Gilet, ceinture rouge et esprit d\'aventure.'),
  L('ninja', 'tenue', 'Ombre', 'rare', 'Tout en noir, discret comme un chat.'),
  L('smoking', 'tenue', 'Agent Secret', 'epique', 'Costume noir et nœud papillon.'),
  L('chevalier', 'tenue', 'Chevalier', 'epique', 'Armure brillante et blason rouge.'),
  L('robot', 'tenue', 'Robot X-9', 'epique', 'Carrosserie en métal et voyants lumineux.'),
  L('astronaute', 'tenue', 'Astronaute', 'legendaire', 'Combinaison spatiale (casque vendu à part).'),
  L('lave', 'tenue', 'Cœur de Lave', 'legendaire', 'Des fissures de lave qui brillent dans le noir.'),
  L('neon', 'tenue', 'Néon', 'legendaire', 'Des lignes lumineuses rose et bleu.'),
  L('statue', 'tenue', 'Statue d\'Or', 'legendaire', 'Entièrement en or, de la tête aux pieds.'),
  L('pompier', 'tenue', 'Pompier', 'rare', 'Veste rouge à bandes réfléchissantes : prêt pour l\'intervention !'),
  L('sorcier', 'tenue', 'Sorcier', 'epique', 'Une robe étoilée pleine de mystère.'),
  // Collab 2K27 (toujours en boutique pendant l'événement)
  L('tee2k27', 'tenue', 'Tee-shirt 2K27', 'collab', 'Cadeau de la collab : le tee-shirt du festival gaming 2K27.', true),
  L('sweat2k27', 'tenue', 'Sweat Néon 2K27', 'collab', 'Sweat à capuche qui brille aux couleurs du festival.'),
  L('casque2k27', 'chapeau', 'Casque Gamer 2K27', 'collab', 'Casque avec micro et néons cyan et rose.'),
  L('manette', 'dos', 'Manette Géante', 'collab', 'Une manette géante dans le dos.'),
  L('clavier', 'pioche', 'Clavier-Pioche', 'collab', 'Un clavier lumineux… pour taper très fort.'),
  L('ecran2k27', 'deltaplane', 'Écran Volant 2K27', 'collab', 'Descends sur un écran géant du festival.'),
  L('neon2k27', 'trainee', 'Néons 2K27', 'collab', 'Une traînée cyan, rose et violette.'),
  L('dj', 'emote', 'DJ 2K27', 'collab', 'Mets le feu aux platines.'),
  // Chapeaux
  L('aucun', 'chapeau', 'Rien du tout', 'commun', 'Juste tes cheveux.', true),
  L('casquette', 'chapeau', 'Casquette', 'commun', 'La casquette de base.', true),
  L('bonnet', 'chapeau', 'Bonnet à Pompon', 'commun', 'Bien au chaud.'),
  L('cowboy', 'chapeau', 'Chapeau de Cowboy', 'commun', 'Yiiihaa !'),
  L('toque', 'chapeau', 'Toque', 'commun', 'Va avec la tenue de Grand Chef.'),
  L('bandeau', 'chapeau', 'Bandeau', 'commun', 'Un bandeau rouge qui flotte au vent.'),
  L('hautdeforme', 'chapeau', 'Haut-de-forme', 'rare', 'Très élégant.'),
  L('viking', 'chapeau', 'Casque Viking', 'rare', 'Avec de grandes cornes.'),
  L('chat', 'chapeau', 'Oreilles de Chat', 'rare', 'Miaou.'),
  L('tricorne', 'chapeau', 'Tricorne', 'rare', 'Le chapeau des capitaines.'),
  L('helice', 'chapeau', 'Casquette à Hélice', 'epique', 'L\'hélice tourne pour de vrai !'),
  L('cornes', 'chapeau', 'Petites Cornes', 'epique', 'Un air un peu diabolique.'),
  L('heaume', 'chapeau', 'Heaume', 'epique', 'Casque de chevalier avec un plumet.'),
  L('couronne', 'chapeau', 'Couronne', 'legendaire', 'Pour le roi ou la reine de l\'île.'),
  L('aureole', 'chapeau', 'Auréole', 'legendaire', 'Elle flotte et elle brille.'),
  L('bocal', 'chapeau', 'Casque Spatial', 'legendaire', 'Une bulle de verre autour de la tête.'),
  L('sorcier', 'chapeau', 'Chapeau de Sorcier', 'rare', 'Pointu, étoilé, magique.'),
  L('casquepompier', 'chapeau', 'Casque de Pompier', 'rare', 'Rouge vif avec son insigne doré.'),
  // Dos
  L('rien', 'dos', 'Rien', 'commun', 'Le dos libre.', true),
  L('sac', 'dos', 'Sac à Dos', 'commun', 'Pour ranger ses goûters.'),
  L('cape', 'dos', 'Cape de Héros', 'rare', 'Elle flotte quand tu cours.'),
  L('carquois', 'dos', 'Carquois', 'rare', 'Rempli de flèches.'),
  L('guitare', 'dos', 'Guitare', 'rare', 'Pour le feu de camp après la victoire.'),
  L('bouclier', 'dos', 'Bouclier Rond', 'epique', 'Bouclier en bois avec un blason.'),
  L('poisson', 'dos', 'Poisson Géant', 'epique', 'Personne ne sait pourquoi.'),
  L('ailes', 'dos', 'Ailes d\'Ange', 'legendaire', 'Elles battent doucement.'),
  L('fusee', 'dos', 'Réacteur', 'legendaire', 'Avec de vraies flammes (décoratives).'),
  L('ballons', 'dos', 'Ballons', 'epique', 'Trois ballons qui flottent au-dessus de toi.'),
  // Pioches
  L('classique', 'pioche', 'Pioche', 'commun', 'La pioche de départ.', true),
  L('pelle', 'pioche', 'Pelle', 'commun', 'Pour creuser… et taper.'),
  L('cle', 'pioche', 'Clé à Molette', 'commun', 'L\'outil du mécano.'),
  L('baguette', 'pioche', 'Baguette de Pain', 'rare', 'Bien croustillante.'),
  L('marteau', 'pioche', 'Gros Marteau', 'rare', 'Bonk.'),
  L('hache', 'pioche', 'Hache de Bûcheron', 'rare', 'Les arbres ont peur.'),
  L('os', 'pioche', 'Os Géant', 'epique', 'Un os de dinosaure ?'),
  L('trident', 'pioche', 'Trident', 'epique', 'Le roi des océans.'),
  L('pinceau', 'pioche', 'Pinceau Géant', 'epique', 'Pour repeindre l\'île.'),
  L('doree', 'pioche', 'Pioche Dorée', 'legendaire', 'En or massif.'),
  L('cristal', 'pioche', 'Cristal', 'legendaire', 'Une pioche de cristal qui brille.'),
  L('spatule', 'pioche', 'Spatule', 'commun', 'Pour retourner les crêpes… et les adversaires.'),
  // Deltaplanes
  L('classique', 'deltaplane', 'Deltaplane', 'commun', 'Le modèle de base.', true),
  L('papier', 'deltaplane', 'Avion en Papier', 'commun', 'Plié en classe de techno.'),
  L('feuille', 'deltaplane', 'Feuille Géante', 'commun', 'Tombée d\'un très grand arbre.'),
  L('arcenciel', 'deltaplane', 'Arc-en-ciel', 'rare', 'Toutes les couleurs.'),
  L('parapluie', 'deltaplane', 'Parapluie', 'rare', 'Pour rester au sec pendant la descente.'),
  L('tapis', 'deltaplane', 'Tapis Volant', 'epique', 'Tu voles debout dessus !'),
  L('pizza', 'deltaplane', 'Part de Pizza', 'epique', 'Fromage et tomate.'),
  L('chauvesouris', 'deltaplane', 'Chauve-souris', 'epique', 'Ailes sombres.'),
  L('dragon', 'deltaplane', 'Ailes de Dragon', 'legendaire', 'Rouges et majestueuses.'),
  // Traînées
  L('aucune', 'trainee', 'Aucune', 'commun', 'Pas de traînée.', true),
  L('fumee', 'trainee', 'Fumée', 'commun', 'Un petit nuage blanc.'),
  L('etincelles', 'trainee', 'Étincelles', 'rare', 'Des étincelles dorées.'),
  L('coeurs', 'trainee', 'Cœurs', 'rare', 'Plein d\'amour en tombant.'),
  L('etoiles', 'trainee', 'Étoiles', 'epique', 'Une pluie d\'étoiles.'),
  L('arcenciel', 'trainee', 'Arc-en-ciel', 'legendaire', 'Une traînée de toutes les couleurs.'),
  // Émotes (touche B)
  L('salut', 'emote', 'Coucou', 'commun', 'Un grand signe de la main.', true),
  L('applaudir', 'emote', 'Bravo', 'commun', 'On applaudit !'),
  L('sautjoie', 'emote', 'Saut de Joie', 'commun', 'Des sauts en étoile.'),
  L('robot', 'emote', 'Danse du Robot', 'rare', 'Bip boup.'),
  L('toupie', 'emote', 'Toupie', 'rare', 'Tourne, tourne, tourne…'),
  L('victoire', 'emote', 'Champion', 'epique', 'Le poing levé.'),
  L('zen', 'emote', 'Zen', 'legendaire', 'Lévite en méditant.'),
  L('pompes', 'emote', 'Pompes', 'commun', 'Une petite séance de sport en plein combat.'),
];

// Tenue Staff : réservée aux comptes joueurs liés à un compte admin (panel → Mon compte → Mon compte joueur).
// Le serveur dit qui est du staff (boîte de réception) ; elle n'est ni en vente, ni offrable, ni portée par les bots,
// et l'hôte d'une partie l'enlève à un joueur qui la porterait sans être vraiment du staff (voir hote.js).
export const CLE_STAFF = 'tenue:staff';
CATALOGUE.push({ id: 'staff', cat: 'tenue', nom: 'Tenue Staff', rarete: 'staff', reserve: true, gratuit: false,
  desc: 'Réservée au staff de NATX ROYALE : elle arrive toute seule quand ton compte joueur est lié à ton compte admin.' });
export function appliquerStaff(p, estStaff) {
  const i = p.possedes.indexOf(CLE_STAFF);
  if (estStaff && i < 0) { p.possedes.push(CLE_STAFF); p.nouveautes.push(CLE_STAFF); return 'ajoutee'; }
  if (!estStaff && i >= 0) {
    p.possedes.splice(i, 1);
    const n = p.nouveautes.indexOf(CLE_STAFF);
    if (n >= 0) p.nouveautes.splice(n, 1);
    if (p.equipe.tenue === 'staff') p.equipe.tenue = LOOK_DEFAUT.tenue;
    for (const pr of p.presets || []) if (pr && pr.tenue === 'staff') pr.tenue = LOOK_DEFAUT.tenue;
    return 'retiree';
  }
  return null;
}

export const COLLAB = CATALOGUE.filter(o => o.rarete === 'collab');
export const objet = (cat, id) => CATALOGUE.find(o => o.cat === cat && o.id === id);

// ---------- Les 250 nouveaux cosmétiques (js/catalogue250.js) ----------
// Ils n'entrent dans CATALOGUE (vente, casier, bots) qu'une fois leur contenu livré ET activé dans
// modeles/integration.json : on ne vend jamais un objet qui ne s'affiche pas.
export { COLLECTIONS_250 };
const EN_ATTENTE = new Map(CATALOGUE_250.map(e => [e.cat + ':' + e.id, { ...e, nouveau250: true }]));
export const estConnu250 = (cat, id) => EN_ATTENTE.has(cat + ':' + id) || CATALOGUE.some(o => o.cat === cat && o.id === id && o.nouveau250);
export function activerCosmetiques(cles) {
  let n = 0;
  for (const cle of cles) {
    const e = EN_ATTENTE.get(cle);
    if (!e) continue;
    EN_ATTENTE.delete(cle);
    CATALOGUE.push(e);
    n++;
  }
  return n;
}
export const nbDisponibles250 = () => CATALOGUE.filter(o => o.nouveau250).length;
// ---------- Réglages de la boutique venus de l'espace admin (GET /api/jeu) ----------
// nom, description, rareté, prix, « en vente » de chaque objet ; promotions ; rotation ; noms des collections.
// Sans serveur : la boutique marche comme avant (valeurs du catalogue).
const CONFIG = { cosmetiques: {}, promotions: [], boutique: {}, collections: {} };
const ORIGINE = new Map();
export function appliquerConfigBoutique(e) {
  if (!e || typeof e !== 'object') return;
  CONFIG.cosmetiques = e.cosmetiques || {};
  CONFIG.promotions = Array.isArray(e.promotions) ? e.promotions : [];
  CONFIG.boutique = e.boutique || {};
  CONFIG.collections = e.collections || {};
  for (const o of CATALOGUE) {
    if (o.reserve) continue;
    const cle = cleObjet(o);
    if (!ORIGINE.has(cle)) ORIGINE.set(cle, { nom: o.nom, desc: o.desc, rarete: o.rarete, serie: o.serie });
    const base = ORIGINE.get(cle), r = CONFIG.cosmetiques[cle] || {};
    o.nom = r.nom || base.nom;
    o.desc = r.desc || base.desc;
    o.rarete = r.rarete && RARETES_COSM[r.rarete] ? r.rarete : base.rarete;
    o.serie = Number.isInteger(r.collection) ? r.collection : base.serie;
    o.horsVente = r.en_vente === 0;
    o.prixAdmin = Number.isInteger(r.prix) ? r.prix : null;
  }
}
const nomsCollections = () => COLLECTIONS_250.map(c => ({ ...c, nom: CONFIG.collections[c.n]?.nom || c.nom, visible: CONFIG.collections[c.n]?.visible !== false }));
export const collectionsVisibles = () => nomsCollections().filter(c => c.visible);
export const collectionDe = o => (o && o.serie ? nomsCollections().find(c => c.n === o.serie && c.visible) || null : null);
// meilleure promotion en cours pour cet objet (null s'il n'y en a pas)
export function promoDe(o) {
  if (!o || o.gratuit || o.reserve) return null;
  const cle = cleObjet(o), t = Date.now() / 1000;
  let meilleure = null;
  for (const p of CONFIG.promotions) {
    if (p.fin && p.fin < t) continue;
    const v = p.cible_valeurs || [];
    const ok = p.cible_type === 'tout' || (p.cible_type === 'categorie' && v.includes(o.cat)) || (p.cible_type === 'rarete' && v.includes(o.rarete))
      || (p.cible_type === 'collection' && v.map(Number).includes(o.serie)) || (p.cible_type === 'objets' && v.includes(cle));
    if (ok && (!meilleure || p.reduction > meilleure.reduction)) meilleure = p;
  }
  return meilleure;
}
export const prixNormal = o => o.prixAdmin ?? RARETES_COSM[o.rarete].prix;
export function prixDe(o) {
  const p = prixNormal(o), r = promoDe(o);
  return r ? Math.max(0, Math.round(p * (100 - r.reduction) / 1000) * 10) : p;
}
export const enVente = o => !!o && !o.gratuit && !o.horsVente && !o.reserve;
// cosmétiques ajoutés dans l'espace admin (leur modèle est un modèle livré, voir modeles.js enregistrerAjouts)
export function ajouterCosmetiquesAdmin(liste) {
  for (const a of Array.isArray(liste) ? liste : []) {
    if (!a || !CATEGORIES.some(c => c.id === a.cat) || !RARETES_COSM[a.rarete] || a.rarete === 'staff' || objet(a.cat, a.id)) continue;
    CATALOGUE.push({ id: a.id, cat: a.cat, nom: a.nom, desc: a.desc || '', rarete: a.rarete, ajout: true, prixAdmin: Number.isInteger(a.prix) ? a.prix : null });
  }
}
export const cleObjet = o => o.cat + ':' + o.id;

export const LOOK_DEFAUT = { tenue: 'classique', chapeau: 'casquette', dos: 'rien', pioche: 'classique', deltaplane: 'classique', trainee: 'aucune', emote: 'salut' };

// Vérifie un look reçu par le réseau
export function nettoyerLook(l) {
  const r = { ...LOOK_DEFAUT };
  if (l && typeof l === 'object') for (const c of Object.keys(LOOK_DEFAUT)) if (typeof l[c] === 'string' && (objet(c, l[c]) || estConnu250(c, l[c]))) r[c] = l[c];
  if (l && typeof l.peau === 'string' && /^#[0-9a-f]{6}$/i.test(l.peau)) r.peau = l.peau.toLowerCase(); // couleur de peau choisie
  return r;
}

export function lookAuHasard(r = Math.random) {
  const l = {};
  for (const c of Object.keys(LOOK_DEFAUT)) {
    const liste = CATALOGUE.filter(o => o.cat === c && !o.reserve); // les bots ne portent jamais la Tenue Staff
    l[c] = liste[Math.floor(r() * liste.length)].id;
  }
  if (r() < 0.4) l.chapeau = 'aucun';
  return l;
}

// ---------- Profil enregistré ----------
const CLE = 'natx-royale-profil';
export function chargerProfil() {
  let p = null;
  try { p = JSON.parse(localStorage.getItem(CLE)); } catch (e) { p = null; }
  if (!p || typeof p !== 'object') p = {};
  p.pieces = Number.isFinite(p.pieces) ? p.pieces : 600;
  p.possedes = Array.isArray(p.possedes) ? p.possedes : [];
  for (const o of CATALOGUE) if (o.gratuit && !p.possedes.includes(cleObjet(o))) p.possedes.push(cleObjet(o));
  p.equipe = nettoyerLook(p.equipe);
  for (const c of Object.keys(p.equipe)) if (!p.possedes.includes(c + ':' + p.equipe[c])) p.equipe[c] = LOOK_DEFAUT[c];
  // déséquiper = revenir à l'objet « de base » de la catégorie (on garde tout ce qu'on possède)
  p.stats = Object.assign({ parties: 0, victoires: 0, kills: 0, meilleur: 0, tirs: 0, touches: 0, temps: 0, degats: 0 }, p.stats || {});
  p.dernierBonus = p.dernierBonus || '';
  p.nouveautes = Array.isArray(p.nouveautes) ? p.nouveautes : [];
  p.niveau = Number.isFinite(p.niveau) && p.niveau >= 1 ? p.niveau : 1;
  p.xp = Number.isFinite(p.xp) && p.xp >= 0 ? p.xp : 0;
  p.historique = Array.isArray(p.historique) ? p.historique.slice(0, 10) : [];
  p.records = Object.assign({ kills: 0, degats: 0, place: 0, survie: 0 }, p.records || {});
  p.presets = Array.isArray(p.presets) ? p.presets.slice(0, 3) : [];
  while (p.presets.length < 3) p.presets.push(null);
  p.presets = p.presets.map(l => (l ? nettoyerLook(l) : null));
  // cadeaux déjà ouverts / déjà annoncés (numéros du serveur) : un cadeau n'est jamais donné deux fois
  p.cadeauxOuverts = Array.isArray(p.cadeauxOuverts) ? p.cadeauxOuverts.filter(Number.isInteger).slice(-400) : [];
  p.cadeauxNotifies = Array.isArray(p.cadeauxNotifies) ? p.cadeauxNotifies.filter(Number.isInteger).slice(-400) : [];
  // collection d'esprits : { type, rarete, n (combien de fois), le (date de la 1re fois) }
  p.collectionEsprits = Array.isArray(p.collectionEsprits) ? p.collectionEsprits.filter(e => e && typeof e.type === 'string' && typeof e.rarete === 'string') : [];
  return p;
}

// ---------- Niveaux ----------
export const xpPourNiveau = n => 400 + n * 100;
export function xpPartie({ kills, place, nbJoueurs, gagne, degats, survie }) {
  let xp = 80 + kills * 50 + Math.floor(degats / 10) + Math.floor((survie || 0) / 10);
  if (gagne) xp += 300; else if (place && place <= 3 && nbJoueurs > 3) xp += 150; else if (place && place <= 10 && nbJoueurs > 10) xp += 60;
  return xp;
}
// Ajoute de l'XP ; chaque niveau rapporte des pièces (plus tous les 5 niveaux)
export function ajouterXP(p, xp) {
  p.xp += Math.max(0, Math.round(xp));
  const niveaux = [];
  while (p.xp >= xpPourNiveau(p.niveau)) {
    p.xp -= xpPourNiveau(p.niveau);
    p.niveau++;
    const bonus = p.niveau % 5 === 0 ? 300 : 100;
    p.pieces += bonus;
    niveaux.push({ niveau: p.niveau, pieces: bonus });
  }
  return niveaux;
}

// ---------- Défis du jour ----------
const DEFIS = [
  { id: 'kills', texte: 'Élimine {n} adversaires', n: [3, 5, 8] },
  { id: 'coffres', texte: 'Ouvre {n} coffres', n: [4, 6, 10] },
  { id: 'constr', texte: 'Construis {n} murs, sols ou rampes', n: [20, 40, 60] },
  { id: 'degats', texte: 'Inflige {n} dégâts', n: [500, 800, 1200] },
  { id: 'top', texte: 'Finis dans le top {n}', n: [10, 5, 3] },
  { id: 'survie', texte: 'Survis {n} minutes au total', n: [5, 8, 12] },
  { id: 'emotes', texte: 'Fais {n} émotes', n: [3, 5] },
  { id: 'distance', texte: 'Parcours {n} m', n: [1500, 2500] },
  { id: 'soins', texte: 'Utilise {n} soins', n: [3, 5, 8] },
  { id: 'rebonds', texte: 'Rebondis {n} fois sur un champignon', n: [3, 5] },
  { id: 'tete', texte: 'Touche {n} fois à la tête', n: [5, 10] },
  { id: 'parties', texte: 'Joue {n} parties', n: [2, 3] },
];
export const RECOMPENSE_DEFI = { pieces: 250, xp: 300 };
export function defisDuJour(p, d = new Date()) {
  const jour = jourCle(d);
  if (!p.defis || p.defis.jour !== jour || !Array.isArray(p.defis.liste)) {
    const r = hasard(Number(jour.replace(/-/g, '')) * 31 + 5);
    const pool = DEFIS.slice(), liste = [];
    while (liste.length < 3) {
      const def = pool.splice(Math.floor(r() * pool.length), 1)[0];
      liste.push({ id: def.id, n: def.n[Math.floor(r() * def.n.length)], prog: 0, fait: false });
    }
    p.defis = { jour, liste };
    sauverProfil(p);
  }
  return p.defis.liste;
}
export const texteDefi = d => (DEFIS.find(x => x.id === d.id) || { texte: '?' }).texte.replace('{n}', d.n);
// s = { kills, coffres, constr, degats, place, survie (secondes), emotes, distance, soins, rebonds, tete, parties }
export function avancerDefis(p, s) {
  const finis = [];
  for (const d of defisDuJour(p)) {
    if (d.fait) continue;
    if (d.id === 'top') { if (s.place && s.place <= d.n) d.prog = d.n; }
    else if (d.id === 'survie') d.prog += (s.survie || 0) / 60;
    else d.prog += s[d.id] || 0;
    if (d.prog >= d.n) { d.prog = d.n; d.fait = true; p.pieces += RECOMPENSE_DEFI.pieces; finis.push(d); }
  }
  return finis;
}

// ---------- Historique et records ----------
export function enregistrerPartie(p, s) {
  p.historique.unshift({ d: Date.now(), place: s.place, nb: s.nb, kills: s.kills, degats: Math.round(s.degats), survie: Math.round(s.survie), gagne: !!s.gagne, mode: s.mode || 'solo' });
  p.historique = p.historique.slice(0, 10);
  const r = p.records, nouveaux = [];
  const battre = (cle, v, mieux, nom) => { if (mieux) { if (r[cle] > 0 || cle === 'place') nouveaux.push(nom); r[cle] = v; } };
  battre('kills', s.kills, s.kills > r.kills, 'éliminations');
  battre('degats', Math.round(s.degats), s.degats > r.degats, 'dégâts');
  battre('survie', Math.round(s.survie), s.survie > r.survie, 'temps de survie');
  // la place ne compte que s'il y avait des adversaires
  if (s.nb > 1 && s.place && (!r.place || s.place < r.place)) { if (r.place) nouveaux.push('meilleure place'); r.place = s.place; }
  return nouveaux;
}

// Style au hasard parmi les objets possédés
export function lookPossedeAuHasard(p, r = Math.random) {
  const l = {};
  for (const c of Object.keys(LOOK_DEFAUT)) {
    const liste = CATALOGUE.filter(o => o.cat === c && possede(p, o));
    l[c] = liste.length ? liste[Math.floor(r() * liste.length)].id : LOOK_DEFAUT[c];
  }
  return l;
}
// Chaque sauvegarde augmente le numéro de version « rev » : le serveur garde toujours la plus récente (compte.js)
let quandSauve = null;
export const surSauvegardeProfil = f => { quandSauve = f; };
export function sauverProfil(p) {
  p.rev = (Number.isInteger(p.rev) && p.rev > 0 ? p.rev : 0) + 1;
  try { localStorage.setItem(CLE, JSON.stringify(p)); } catch (e) { /* stockage plein ou bloqué */ }
  if (quandSauve) quandSauve(p);
}
export const possede = (p, o) => !!o && p.possedes.includes(cleObjet(o));
export const estDeBase = o => !!o && LOOK_DEFAUT[o.cat] === o.id;
export function desequiper(p, cat) {
  if (!(cat in LOOK_DEFAUT) || p.equipe[cat] === LOOK_DEFAUT[cat]) return false;
  p.equipe[cat] = LOOK_DEFAUT[cat];
  sauverProfil(p);
  return true;
}

export function acheter(p, o) {
  if (possede(p, o)) return { ok: false, raison: 'Tu l\'as déjà !' };
  if (!enVente(o)) return { ok: false, raison: 'Cet objet n\'est pas en vente pour le moment.' };
  const prix = prixDe(o);
  if (p.pieces < prix) return { ok: false, raison: `Il te manque ${prix - p.pieces} 🪙` };
  p.pieces -= prix;
  p.possedes.push(cleObjet(o));
  p.nouveautes.push(cleObjet(o));
  sauverProfil(p);
  return { ok: true };
}

export function jourCle(d = new Date()) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

// Bonus de connexion une fois par jour
export function bonusDuJour(p) {
  const j = jourCle();
  if (p.dernierBonus === j) return 0;
  p.dernierBonus = j;
  p.pieces += 150;
  sauverProfil(p);
  return 150;
}

// La boutique change tous les jours à minuit (pareille pour tout le monde)
export function boutiqueDuJour(d = new Date()) {
  const cfg = CONFIG.boutique || {};
  const graine = d.getFullYear() * 10000 + (d.getMonth() + 1) * 100 + d.getDate() + (cfg.melange || 0) * 7;
  const r = hasard(graine * 7919);
  const retires = new Set(cfg.retires || []);
  const payants = CATALOGUE.filter(o => enVente(o) && o.rarete !== 'collab' && !retires.has(cleObjet(o)));
  const melange = payants.map(o => [r(), o]).sort((a, b) => a[0] - b[0]).map(x => x[1]);
  const nbV = Math.min(4, Math.max(1, cfg.vedettes || 2)), nbQ = Math.min(16, Math.max(4, cfg.quotidiens || 8));
  // « à la une » choisis par l'admin d'abord, puis le hasard du jour
  const vedettes = (cfg.epingles || []).map(c => payants.find(o => cleObjet(o) === c)).filter(Boolean).slice(0, nbV);
  for (const o of melange) if (vedettes.length < nbV && (o.rarete === 'legendaire' || o.rarete === 'epique') && !vedettes.includes(o) && !vedettes.some(v => v.cat === o.cat)) vedettes.push(o);
  const quotidiens = [];
  for (const o of melange) if (quotidiens.length < nbQ && !vedettes.includes(o) && !quotidiens.some(q => q.cat === o.cat && q.rarete === o.rarete)) quotidiens.push(o);
  for (const o of melange) if (quotidiens.length < nbQ && !vedettes.includes(o) && !quotidiens.includes(o)) quotidiens.push(o);
  const minuit = new Date(d); minuit.setHours(24, 0, 0, 0);
  return { vedettes, quotidiens, finDans: minuit - d };
}

// Pièces gagnées à la fin d'une partie
export function recompense({ kills, place, nbJoueurs, gagne, degats }) {
  const details = [['Partie jouée', 40]];
  if (kills) details.push([`${kills} élimination${kills > 1 ? 's' : ''}`, kills * 25]);
  if (degats >= 100) details.push(['Dégâts infligés', Math.min(60, Math.floor(degats / 50) * 5)]);
  if (gagne) details.push(['TOP 1 !', 200]);
  else if (place && place <= 3 && nbJoueurs > 3) details.push(['Top 3', 80]);
  else if (place && place <= 10 && nbJoueurs > 10) details.push(['Top 10', 40]);
  const total = details.reduce((s, d) => s + d[1], 0);
  return { details, total };
}
