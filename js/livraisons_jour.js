// Livraisons quotidiennes de cosmétiques (fichier GÉRÉ par outils/livraison_jour.py : ne pas modifier à la main).
// Chaque livraison : sa date et ses objets (catégorie, id, nom, rareté, description, fichier .glb dans modeles/).
// Lu par js/boutique.js (vente, casier, bots), js/modeles.js (quel .glb charger) et serveur/extraire_catalogue.py.
export const LIVRAISONS_JOUR = [
 {
  "date": "2026-11-22",
  "objets": [
   {
    "cat": "chapeau",
    "id": "cupcake_geant",
    "nom": "Cupcake Géant",
    "rarete": "commun",
    "desc": "Un cupcake rose posé sur la tête. La cerise est en bonus.",
    "fichier": "jour/2026-11-22_chapeau.glb"
   },
   {
    "cat": "chapeau",
    "id": "couronne_de_macarons",
    "nom": "Couronne de Macarons",
    "rarete": "rare",
    "desc": "Huit macarons pastel en couronne. Interdit de les grignoter en pleine partie.",
    "fichier": "jour/2026-11-22_chapeau.glb"
   },
   {
    "cat": "chapeau",
    "id": "chantilly_royale",
    "nom": "Chantilly Royale",
    "rarete": "epique",
    "desc": "Une tour de chantilly avec une fraise au sommet. Tenir droit, surtout !",
    "fichier": "jour/2026-11-22_chapeau.glb"
   },
   {
    "cat": "dos",
    "id": "sac_croissant",
    "nom": "Sac Croissant",
    "rarete": "commun",
    "desc": "Un croissant tout doré à porter sur le dos. Ça sent bon le matin.",
    "fichier": "jour/2026-11-22_dos.glb"
   },
   {
    "cat": "dos",
    "id": "gateau_a_etages",
    "nom": "Gâteau à Étages",
    "rarete": "rare",
    "desc": "Trois étages de gâteau et une bougie. C'est l'anniversaire de qui ?",
    "fichier": "jour/2026-11-22_dos.glb"
   },
   {
    "cat": "dos",
    "id": "pot_de_confiture",
    "nom": "Pot de Confiture",
    "rarete": "epique",
    "desc": "Un pot géant de confiture qui brille. La cuillère est déjà dedans.",
    "fichier": "jour/2026-11-22_dos.glb"
   },
   {
    "cat": "pioche",
    "id": "rouleau_patissier",
    "nom": "Rouleau Pâtissier",
    "rarete": "commun",
    "desc": "Pour aplatir la pâte… et le décor. Encore un peu de farine dessus.",
    "fichier": "jour/2026-11-22_pioche.glb"
   },
   {
    "cat": "pioche",
    "id": "sucette_tourbillon",
    "nom": "Sucette Tourbillon",
    "rarete": "rare",
    "desc": "Une sucette géante qui donne le tournis rien qu'à la regarder.",
    "fichier": "jour/2026-11-22_pioche.glb"
   },
   {
    "cat": "deltaplane",
    "id": "gaufre_volante",
    "nom": "Gaufre Volante",
    "rarete": "rare",
    "desc": "Une gaufre croustillante avec un carré de beurre. Planer n'a jamais été aussi bon.",
    "fichier": "jour/2026-11-22_deltaplane.glb"
   },
   {
    "cat": "deltaplane",
    "id": "crepe_etoilee",
    "nom": "Crêpe Étoilée",
    "rarete": "legendaire",
    "desc": "Une crêpe dorée nappée de chocolat, pleine d'étoiles en sucre qui brillent.",
    "fichier": "jour/2026-11-22_deltaplane.glb"
   }
  ]
 }
];
