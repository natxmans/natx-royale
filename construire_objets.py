# Natx Royale — objets.glb : armes, soins, coffre et ravitaillement en style cartoon.
# Armes : origine à la poignée (là où se ferme la main), canon vers +Y, haut vers +Z,
# à l'échelle du perso de 2 m. Matériau « rarete » sur une grosse partie, « lueur » sur une bande.
# Lancer : blender.exe -b --factory-startup --python construire_objets.py
import sys, os, math
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import outils as O
from outils import Piece, boite, cyl, cone, sphere, ico, tore, tube, capsule, demi_cyl, rot_vers
import bpy, bmesh
from mathutils import Vector, Matrix

O.nouvelle_scene()
M = dict(
    rarete=O.mat('rarete', '#a7adb5', 0.45, 0.15),
    lueur=O.mat('lueur', '#c9d0da', 0.4, 0.0, 2.0),
    sombre=O.mat('arme_sombre', '#2a2f3a', 0.45, 0.35),
    noir=O.mat('caoutchouc', '#1b1e24', 0.8),
    metal=O.mat('metal_clair', '#d6dbe3', 0.3, 0.8),
    acier=O.mat('acier', '#7d8794', 0.35, 0.7),
    verre=O.mat('verre', '#5fd8ff', 0.1, 0.1, 1.2),
    bois=O.mat('bois', '#d0843f', 0.7),
    bois_f=O.mat('bois_fonce', '#8a4f22', 0.75),
    rouge=O.mat('rouge_vif', '#ff3b3b', 0.45, 0.0, 0.15),
    orange=O.mat('orange_vif', '#ff8a1f', 0.45),
    jaune=O.mat('jaune_vif', '#ffd23f', 0.4, 0.2),
    blanc=O.mat('blanc', '#f5f6f8', 0.5),
    gris=O.mat('gris_clair', '#c5ccd6', 0.5),
    bleu_liq=O.mat('liquide_bouclier', '#33a6ff', 0.15, 0.1, 0.9),
    bleu_f=O.mat('bleu_fonce', '#1f4fa8', 0.4, 0.2),
    vert=O.mat('vert_militaire', '#5f8f3a', 0.6),
    vert_f=O.mat('vert_fonce', '#3f6526', 0.6),
    rose=O.mat('rose_pansement', '#ff6f91', 0.55),
)
racines = []
X90 = (-90, 0, 0)      # couche un cylindre le long de +Y (son haut va vers l'avant)


def poignee(p, haut=0.17, incl=-14):
    p.ajouter(boite(0.072, 0.092, haut, 0.03), M['noir'], loc=(0, 0, 0), rot=(incl, 0, 0))
    p.ajouter(boite(0.076, 0.03, haut * 0.8, 0.012, 1), M['sombre'], loc=(0, -0.04, -0.005), rot=(incl, 0, 0))


def pontet(p, y=0.07, z=0.045):
    p.ajouter(boite(0.026, 0.10, 0.018, 0.007, 1), M['sombre'], loc=(0, y, z - 0.035))
    p.ajouter(boite(0.026, 0.018, 0.05, 0.007, 1), M['sombre'], loc=(0, y + 0.05, z - 0.012))
    p.ajouter(boite(0.016, 0.018, 0.045, 0.006, 1), M['metal'], loc=(0, y - 0.01, z))


# ------------------------------------------------------------------ pistolet (≈ 0,40 m)
p = Piece('pistolet')
poignee(p, 0.18, -12)
p.ajouter(boite(0.078, 0.28, 0.06, 0.02), M['sombre'], loc=(0, 0.085, 0.10))
p.ajouter(boite(0.09, 0.35, 0.088, 0.03), M['rarete'], loc=(0, 0.105, 0.165))
p.ajouter(boite(0.093, 0.12, 0.018, 0.005, 1), M['lueur'], loc=(0, 0.15, 0.15))
p.ajouter(cyl(0.024, 0.04, 12, b=0.006, seg=1), M['metal'], loc=(0, 0.285, 0.165), rot=X90)
p.ajouter(boite(0.02, 0.025, 0.022, 0.006, 1), M['sombre'], loc=(0, 0.25, 0.217))
p.ajouter(boite(0.06, 0.022, 0.024, 0.006, 1), M['sombre'], loc=(0, -0.045, 0.217))
p.ajouter(boite(0.05, 0.03, 0.04, 0.01, 1), M['sombre'], loc=(0, -0.075, 0.15))
pontet(p, 0.07, 0.05)
racines.append(p.objet())

# ------------------------------------------------------------------ mitraillette (≈ 0,75 m)
p = Piece('smg')
poignee(p, 0.17, -14)
p.ajouter(boite(0.10, 0.42, 0.13, 0.032), M['rarete'], loc=(0, 0.14, 0.12))
p.ajouter(boite(0.103, 0.14, 0.02, 0.005, 1), M['lueur'], loc=(0, 0.20, 0.13))
p.ajouter(boite(0.05, 0.30, 0.024, 0.006, 1), M['sombre'], loc=(0, 0.13, 0.195))
p.ajouter(cyl(0.04, 0.13, 12, b=0.01), M['sombre'], loc=(0, 0.41, 0.12), rot=X90)
p.ajouter(cyl(0.019, 0.08, 10, b=0.004, seg=1), M['metal'], loc=(0, 0.50, 0.12), rot=X90)
p.ajouter(boite(0.06, 0.07, 0.25, 0.016), M['sombre'], loc=(0, 0.17, -0.06), rot=(8, 0, 0))
p.ajouter(boite(0.052, 0.052, 0.11, 0.02), M['noir'], loc=(0, 0.32, 0.02))
p.ajouter(boite(0.028, 0.20, 0.028, 0.008, 1), M['metal'], loc=(0, -0.13, 0.15))
p.ajouter(boite(0.028, 0.20, 0.028, 0.008, 1), M['metal'], loc=(0, -0.13, 0.085), rot=(-10, 0, 0))
p.ajouter(boite(0.075, 0.04, 0.13, 0.016), M['sombre'], loc=(0, -0.24, 0.115))
p.ajouter(boite(0.055, 0.065, 0.05, 0.014), M['sombre'], loc=(0, 0.08, 0.232))
p.ajouter(boite(0.044, 0.068, 0.034, 0.004, 1), M['verre'], loc=(0, 0.08, 0.237))
pontet(p, 0.07, 0.05)
racines.append(p.objet())

# ------------------------------------------------------------------ fusil d'assaut (≈ 1,0 m)
p = Piece('fusil')
poignee(p, 0.17, -16)
p.ajouter(boite(0.11, 0.44, 0.14, 0.032), M['sombre'], loc=(0, 0.12, 0.12))
p.ajouter(boite(0.10, 0.34, 0.12, 0.036), M['rarete'], loc=(0, 0.50, 0.12))
p.ajouter(boite(0.092, 0.32, 0.15, 0.036), M['rarete'], loc=(0, -0.26, 0.095))
p.ajouter(boite(0.096, 0.04, 0.18, 0.016), M['noir'], loc=(0, -0.43, 0.09))
p.ajouter(boite(0.113, 0.16, 0.02, 0.005, 1), M['lueur'], loc=(0, 0.16, 0.135))
p.ajouter(cyl(0.021, 0.22, 10, b=0.004, seg=1), M['acier'], loc=(0, 0.77, 0.13), rot=X90)
p.ajouter(cyl(0.033, 0.07, 10, b=0.01), M['sombre'], loc=(0, 0.88, 0.13), rot=X90)
p.ajouter(boite(0.06, 0.085, 0.13, 0.016), M['sombre'], loc=(0, 0.17, -0.015))
p.ajouter(boite(0.06, 0.085, 0.12, 0.016), M['sombre'], loc=(0, 0.20, -0.115), rot=(18, 0, 0))
p.ajouter(boite(0.03, 0.08, 0.045, 0.008, 1), M['sombre'], loc=(0, 0.14, 0.205))
p.ajouter(cyl(0.034, 0.21, 12, b=0.008), M['sombre'], loc=(0, 0.14, 0.255), rot=X90)
p.ajouter(cyl(0.038, 0.02, 12), M['verre'], loc=(0, 0.25, 0.255), rot=X90)
p.ajouter(boite(0.03, 0.04, 0.03, 0.008, 1), M['metal'], loc=(0.065, 0.24, 0.15))
racines.append(p.objet())

# ------------------------------------------------------------------ fusil à pompe (≈ 1,05 m)
p = Piece('pompe')
p.ajouter(boite(0.072, 0.092, 0.17, 0.03), M['bois'], rot=(-22, 0, 0))
p.ajouter(boite(0.09, 0.34, 0.14, 0.036), M['bois'], loc=(0, -0.22, 0.075), rot=(6, 0, 0))
p.ajouter(boite(0.095, 0.04, 0.165, 0.016), M['noir'], loc=(0, -0.385, 0.06), rot=(6, 0, 0))
p.ajouter(boite(0.10, 0.25, 0.14, 0.032), M['rarete'], loc=(0, 0.13, 0.11))
p.ajouter(boite(0.103, 0.12, 0.02, 0.005, 1), M['lueur'], loc=(0, 0.15, 0.125))
p.ajouter(cyl(0.035, 0.56, 14, b=0.008), M['acier'], loc=(0, 0.53, 0.15), rot=X90)
p.ajouter(cyl(0.041, 0.04, 14, b=0.01), M['sombre'], loc=(0, 0.79, 0.15), rot=X90)
p.ajouter(cyl(0.028, 0.46, 12, b=0.006), M['sombre'], loc=(0, 0.47, 0.082), rot=X90)
p.ajouter(cyl(0.05, 0.2, 14, b=0.015), M['bois_f'], loc=(0, 0.46, 0.083), rot=X90)
for y in (0.40, 0.44, 0.48, 0.52):
    p.ajouter(cyl(0.053, 0.012, 14), M['bois'], loc=(0, y, 0.083), rot=X90)
p.ajouter(sphere(0.012, 8, 5), M['metal'], loc=(0, 0.78, 0.19))
pontet(p, 0.06, 0.05)
racines.append(p.objet())

# ------------------------------------------------------------------ fusil de précision (≈ 1,45 m)
p = Piece('sniper')
poignee(p, 0.16, -18)
p.ajouter(boite(0.09, 0.40, 0.16, 0.036), M['rarete'], loc=(0, -0.27, 0.075))
p.ajouter(boite(0.075, 0.18, 0.05, 0.018), M['rarete'], loc=(0, -0.24, 0.17))
p.ajouter(boite(0.095, 0.04, 0.18, 0.016), M['noir'], loc=(0, -0.475, 0.07))
p.ajouter(boite(0.10, 0.42, 0.12, 0.028), M['sombre'], loc=(0, 0.15, 0.12))
p.ajouter(boite(0.103, 0.16, 0.02, 0.005, 1), M['lueur'], loc=(0, 0.16, 0.125))
p.ajouter(boite(0.06, 0.09, 0.09, 0.014), M['sombre'], loc=(0, 0.17, 0.03))
p.ajouter(cyl(0.025, 0.72, 12, r2=0.021, b=0.004, seg=1), M['acier'], loc=(0, 0.70, 0.13), rot=X90)
p.ajouter(boite(0.064, 0.085, 0.058, 0.014), M['sombre'], loc=(0, 1.07, 0.13))
p.ajouter(cyl(0.042, 0.32, 14, b=0.008), M['sombre'], loc=(0, 0.15, 0.255), rot=X90)
p.ajouter(cyl(0.042, 0.09, 14, r2=0.058, b=0.008), M['sombre'], loc=(0, 0.35, 0.255), rot=X90)
p.ajouter(cyl(0.05, 0.012, 14), M['verre'], loc=(0, 0.396, 0.255), rot=X90)
p.ajouter(cyl(0.048, 0.06, 14, b=0.01), M['sombre'], loc=(0, -0.03, 0.255), rot=X90)
p.ajouter(cyl(0.022, 0.05, 10, b=0.006, seg=1), M['rarete'], loc=(0, 0.15, 0.31))
for y in (0.06, 0.24):
    p.ajouter(boite(0.035, 0.04, 0.07, 0.01, 1), M['sombre'], loc=(0, y, 0.2))
p.ajouter(boite(0.05, 0.06, 0.03, 0.01, 1), M['sombre'], loc=(0, 0.62, 0.1))
p.ajouter(boite(0.02, 0.26, 0.02, 0.006, 1), M['acier'], loc=(0.022, 0.5, 0.085), sym=True)
p.ajouter(cyl(0.012, 0.07, 8), M['metal'], loc=(0.075, 0.02, 0.13), rot=(0, 90, 0))
p.ajouter(sphere(0.02, 8, 6), M['metal'], loc=(0.11, 0.02, 0.13))
racines.append(p.objet())

# ------------------------------------------------------------------ lance-roquettes (≈ 1,3 m)
p = Piece('roquettes')
poignee(p, 0.16, -12)
p.ajouter(cyl(0.09, 1.12, 18, b=0.015), M['rarete'], loc=(0, 0.17, 0.2), rot=X90)
p.ajouter(cyl(0.096, 0.13, 18, r2=0.118, b=0.012), M['sombre'], loc=(0, 0.78, 0.2), rot=X90)
p.ajouter(cyl(0.11, 0.12, 18, r2=0.094, b=0.012), M['sombre'], loc=(0, -0.44, 0.2), rot=X90)
for y in (-0.15, 0.45):
    p.ajouter(cyl(0.096, 0.05, 18, b=0.008), M['sombre'], loc=(0, y, 0.2), rot=X90)
p.ajouter(cyl(0.0935, 0.06, 18), M['lueur'], loc=(0, 0.15, 0.2), rot=X90)
p.ajouter(cyl(0.07, 0.04, 14), M['sombre'], loc=(0, 0.83, 0.2), rot=X90)
p.ajouter(cone(0.07, 0.16, 14), M['rouge'], loc=(0, 0.92, 0.2), rot=X90)
p.ajouter(cyl(0.071, 0.03, 14), M['jaune'], loc=(0, 0.855, 0.2), rot=X90)
p.ajouter(boite(0.05, 0.12, 0.07, 0.015), M['sombre'], loc=(-0.06, 0.25, 0.3))
p.ajouter(boite(0.046, 0.02, 0.05, 0.006, 1), M['verre'], loc=(-0.06, 0.312, 0.31))
p.ajouter(boite(0.05, 0.05, 0.13, 0.018), M['noir'], loc=(0, 0.42, 0.08))
p.ajouter(boite(0.11, 0.24, 0.05, 0.02), M['noir'], loc=(0, -0.20, 0.10))
pontet(p, 0.07, 0.05)
racines.append(p.objet())

# ------------------------------------------------------------------ grenade (origine au centre = dans la main)
p = Piece('grenade')
p.ajouter(sphere(0.058, 16, 10, ech=(1, 1, 1.12)), M['rarete'])
for z in (-0.03, 0.0, 0.03):
    rr = math.sqrt(max(0.0, 0.058 ** 2 - (z / 1.12) ** 2)) + 0.003
    p.ajouter(tore(rr, 0.005, 20, 5), M['sombre'], loc=(0, 0, z))
p.ajouter(tore(0.0605, 0.005, 20, 5), M['lueur'], loc=(0, 0, 0), rot=(0, 90, 0))
p.ajouter(cyl(0.026, 0.035, 12, b=0.006, seg=1), M['acier'], loc=(0, 0, 0.075))
p.ajouter(cyl(0.02, 0.02, 12), M['sombre'], loc=(0, 0, 0.098))
p.ajouter(boite(0.026, 0.02, 0.11, 0.006, 1), M['metal'], loc=(0, -0.045, 0.045), rot=(-25, 0, 0))
p.ajouter(tore(0.02, 0.0035, 14, 5), M['jaune'], loc=(0.04, 0.0, 0.085), rot=(0, 90, 0))
racines.append(p.objet())

# ------------------------------------------------------------------ minigourde (petite gourde de bouclier)
p = Piece('minigourde')
p.ajouter(sphere(0.048, 14, 10, ech=(1, 1, 0.92)), M['bleu_liq'], loc=(0, 0, -0.01))
p.ajouter(cyl(0.022, 0.04, 12, b=0.004, seg=1), M['bleu_liq'], loc=(0, 0, 0.045))
p.ajouter(cyl(0.028, 0.03, 12, b=0.008), M['blanc'], loc=(0, 0, 0.075))
p.ajouter(tore(0.049, 0.007, 20, 6), M['bleu_f'], loc=(0, 0, -0.012))
p.ajouter(boite(0.032, 0.008, 0.032, 0.004, 1), M['blanc'], loc=(0, 0.048, -0.012))
racines.append(p.objet())

# ------------------------------------------------------------------ pansements (rouleau + bout déroulé)
p = Piece('pansements')
p.ajouter(cyl(0.05, 0.085, 18, b=0.014), M['blanc'], rot=(0, 90, 0))
p.ajouter(cyl(0.018, 0.088, 12), M['gris'], rot=(0, 90, 0))
p.ajouter(cyl(0.052, 0.022, 18, b=0.006, seg=1), M['rose'], rot=(0, 90, 0))
p.ajouter(boite(0.075, 0.12, 0.006, 0.002, 1), M['blanc'], loc=(0, 0.06, -0.048), rot=(8, 0, 0))
p.ajouter(boite(0.03, 0.01, 0.03, 0.003, 1), M['rouge'], loc=(0, 0.052, 0.0))
p.ajouter(boite(0.01, 0.01, 0.03, 0.003, 1), M['rouge'], loc=(0, 0.052, 0.0), rot=(0, 90, 0))
racines.append(p.objet())

# ------------------------------------------------------------------ trousse de soin
p = Piece('soin')
p.ajouter(boite(0.46, 0.26, 0.30, 0.055, 3), M['blanc'], loc=(0, 0, -0.01))
p.ajouter(boite(0.466, 0.266, 0.026, 0.01, 1), M['gris'], loc=(0, 0, 0.06))
p.ajouter(boite(0.075, 0.272, 0.19, 0.012), M['rouge'], loc=(0, 0, -0.035))
p.ajouter(boite(0.19, 0.272, 0.075, 0.012), M['rouge'], loc=(0, 0, -0.035))
p.ajouter(boite(0.22, 0.05, 0.035, 0.014), M['sombre'], loc=(0, 0, 0.19))
p.ajouter(boite(0.035, 0.05, 0.06, 0.01, 1), M['sombre'], loc=(0.095, 0, 0.155), sym=True)
p.ajouter(boite(0.05, 0.03, 0.06, 0.01, 1), M['jaune'], loc=(0.155, 0.13, 0.06), sym=True)
racines.append(p.objet())

# ------------------------------------------------------------------ gourde bouclier
p = Piece('bouclier')
p.ajouter(cyl(0.105, 0.27, 20, b=0.03), M['bleu_liq'], loc=(0, 0, -0.04))
p.ajouter(cyl(0.105, 0.08, 20, r2=0.045, b=0.0), M['bleu_liq'], loc=(0, 0, 0.135))
p.ajouter(cyl(0.044, 0.04, 16, b=0.006, seg=1), M['bleu_liq'], loc=(0, 0, 0.19))
p.ajouter(cyl(0.056, 0.055, 16, b=0.014), M['blanc'], loc=(0, 0, 0.23))
p.ajouter(cyl(0.109, 0.095, 20, b=0.008, seg=1), M['bleu_f'], loc=(0, 0, -0.03))
p.ajouter(cyl(0.111, 0.032, 20, b=0.01), M['bleu_f'], loc=(0, 0, -0.165))
# petit écusson (forme de bouclier) devant et derrière
for sy in (1, -1):
    p.ajouter(boite(0.06, 0.012, 0.05, 0.006, 1), M['blanc'], loc=(0, 0.11 * sy, -0.02))
    p.ajouter(cone(0.03, 0.035, 4), M['blanc'], loc=(0, 0.11 * sy, -0.06), rot=(180, 0, 45), ech=(1.4, 0.3, 1))
racines.append(p.objet())

# ------------------------------------------------------------------ caisse de munitions
p = Piece('munitions')
p.ajouter(boite(0.48, 0.30, 0.20, 0.03), M['vert'], loc=(0, 0, -0.04))
p.ajouter(boite(0.486, 0.306, 0.045, 0.008, 1), M['jaune'], loc=(0, 0, -0.035))
p.ajouter(boite(0.50, 0.32, 0.065, 0.022), M['vert_f'], loc=(0, 0, 0.085))
p.ajouter(boite(0.17, 0.04, 0.03, 0.012), M['noir'], loc=(0, 0, 0.145))
p.ajouter(boite(0.03, 0.04, 0.035, 0.008, 1), M['noir'], loc=(0.075, 0, 0.125), sym=True)
p.ajouter(boite(0.07, 0.03, 0.07, 0.01, 1), M['metal'], loc=(0, 0.165, 0.06))
for x in (-0.18, -0.14, 0.14, 0.18):
    p.ajouter(cyl(0.017, 0.06, 8), M['jaune'], loc=(x, 0.15, -0.06), rot=X90)
    p.ajouter(cone(0.017, 0.03, 8), M['acier'], loc=(x, 0.195, -0.06), rot=X90)
racines.append(p.objet())

# ------------------------------------------------------------------ matériaux (planches)
p = Piece('materiaux')
cl, fo, corde = O.mat('planche_claire', '#e2a35e', 0.8), O.mat('planche_foncee', '#bf7c3c', 0.8), O.mat('corde', '#e8d39a', 0.9)
p.ajouter(boite(0.64, 0.155, 0.095, 0.022), cl, loc=(0, -0.08, -0.05))
p.ajouter(boite(0.64, 0.155, 0.095, 0.022), fo, loc=(0, 0.08, -0.05))
p.ajouter(boite(0.64, 0.155, 0.095, 0.022), cl, loc=(0, 0.0, 0.045), rot=(0, 0, 7))
p.ajouter(boite(0.035, 0.34, 0.23, 0.012), corde, loc=(0.2, 0, -0.01), sym=True)
racines.append(p.objet())

# ------------------------------------------------------------------ pioche (origine à la poignée, tête vers +Y)
p = Piece('pioche')
acc = O.mat('pioche_accent', '#ff7a2f', 0.5)
p.ajouter(cyl(0.032, 0.86, 10, b=0.006, seg=1), M['bois'], loc=(0, 0.33, 0), rot=X90)
p.ajouter(cyl(0.041, 0.2, 10, b=0.01), M['noir'], loc=(0, 0.0, 0), rot=X90)
p.ajouter(cyl(0.046, 0.035, 10, b=0.01), acc, loc=(0, -0.115, 0), rot=X90)
p.ajouter(boite(0.12, 0.13, 0.14, 0.03), M['acier'], loc=(0, 0.74, 0))
p.ajouter(boite(0.125, 0.04, 0.145, 0.012), acc, loc=(0, 0.675, 0))
for sz in (1, -1):
    d = Vector((0, -0.28, sz)).normalized()
    p.ajouter(cyl(0.058, 0.36, 8, r2=0.01), M['metal'], loc=Vector((0, 0.74, 0)) + d * 0.2, rot=rot_vers(d),
              ech=(0.7, 1, 1))
racines.append(p.objet())

# ------------------------------------------------------------------ coffre (origine au sol, enfant « couvercle »)
bois_c = O.mat('bois_coffre', '#9b5a2a', 0.75)
bois_cf = O.mat('bois_coffre_fonce', '#6b3a18', 0.8)
or_c = O.mat('or_coffre', '#ffbe1a', 0.35, 0.6, 0.35)
fer = O.mat('fer_coffre', '#343a46', 0.45, 0.5)
tresor = O.mat('tresor', '#ffe27a', 0.3, 0.3, 3.0)
p = Piece('coffre')
p.ajouter(boite(1.04, 0.66, 0.50, 0.035), bois_c, loc=(0, 0, 0.27))
for z in (0.19, 0.35):
    p.ajouter(boite(1.046, 0.666, 0.016, 0.0), bois_cf, loc=(0, 0, z))
p.ajouter(boite(1.10, 0.72, 0.09, 0.03), or_c, loc=(0, 0, 0.05))
p.ajouter(boite(1.10, 0.72, 0.065, 0.022), or_c, loc=(0, 0, 0.525))
p.ajouter(boite(0.075, 0.726, 0.48, 0.016), or_c, loc=(0.30, 0, 0.29), sym=True)
for sx in (-1, 1):
    for sy in (-1, 1):
        p.ajouter(boite(0.1, 0.1, 0.5, 0.025), or_c, loc=(0.52 * sx, 0.33 * sy, 0.29))
p.ajouter(boite(0.98, 0.6, 0.03, 0.0), tresor, loc=(0, 0, 0.545))
p.ajouter(sphere(0.3, 12, 5, ech=(1.5, 0.9, 0.24)), tresor, loc=(0, 0, 0.54))
coffre = p.objet()
q = Piece('couvercle')   # coordonnées locales : origine = charnière à l'arrière, en haut de la caisse
q.ajouter(demi_cyl(0.35, 1.04, 18, 0.75), bois_c, loc=(0, 0.36, 0))
for x, l in ((0.30, 0.075), (-0.30, 0.075), (0.515, 0.085), (-0.515, 0.085)):
    q.ajouter(demi_cyl(0.368, l, 18, 0.75), or_c, loc=(x, 0.36, 0))
q.ajouter(boite(1.10, 0.05, 0.065, 0.016), or_c, loc=(0, 0.72, 0.03))
q.ajouter(boite(0.16, 0.05, 0.19, 0.03), fer, loc=(0, 0.735, -0.025))
q.ajouter(boite(0.03, 0.012, 0.06, 0.004, 1), or_c, loc=(0, 0.762, -0.03))
couvercle = q.objet(loc=(0, -0.36, 0.555), parent=coffre)
racines.append(coffre)

# ------------------------------------------------------------------ ravitaillement (caisse + enfant « parachute »)
bleu_r = O.mat('caisse_bleu', '#2b6dff', 0.5, 0.1)
p = Piece('ravitaillement')
p.ajouter(boite(1.2, 1.2, 1.0, 0.07, 2), bleu_r, loc=(0, 0, 0.5))
for sx in (-1, 1):
    for sy in (-1, 1):
        p.ajouter(boite(0.16, 0.16, 1.04, 0.04, 1), M['jaune'], loc=(0.56 * sx, 0.56 * sy, 0.5))
for z in (0.06, 0.94):
    p.ajouter(boite(1.24, 0.16, 0.12, 0.04, 1), M['jaune'], loc=(0, 0.54, z), sym=False)
    p.ajouter(boite(1.24, 0.16, 0.12, 0.04, 1), M['jaune'], loc=(0, -0.54, z))
    p.ajouter(boite(0.16, 0.92, 0.12, 0.04, 1), M['jaune'], loc=(0.54, 0, z), sym=True)
for (sx, sy, rz) in ((0, 1, 0), (0, -1, 0), (1, 0, 90), (-1, 0, 90)):
    p.ajouter(boite(0.9, 0.02, 0.07, 0.008, 1), M['lueur'], loc=(0.61 * sx, 0.61 * sy, 0.5), rot=(0, 0, rz))
    p.ajouter(boite(0.12, 0.03, 0.5, 0.015, 1), M['blanc'], loc=(0.6 * sx, 0.6 * sy, 0.5), rot=(0, 0, rz))
    p.ajouter(boite(0.5, 0.03, 0.12, 0.015, 1), M['blanc'], loc=(0.6 * sx, 0.6 * sy, 0.5), rot=(0, 0, rz))
p.ajouter(tore(0.08, 0.018, 14, 6), M['acier'], loc=(0, 0, 1.03), rot=(90, 0, 0))
ravit = p.objet()
para_r = O.mat('parachute_rouge', '#ff4d4d', 0.6)
para_b = O.mat('parachute_blanc', '#f7f7f7', 0.6)
q = Piece('parachute')   # origine = point d'accroche, au centre du dessus de la caisse
N = 8
for i in range(N):
    a0, a1 = 360 / N * i, 360 / N * (i + 1)
    # quartier de dôme : demi-sphère aplatie découpée en N parts de couleurs alternées
    an = []
    for j in range(7):
        t = math.radians(90 * j / 6)
        an.append((math.sin(t) * 0.9, math.cos(t)))
    b = bmesh.new()
    rings = []
    for (z, r) in an:
        ring = []
        for k in range(4):
            a = math.radians(a0 + (a1 - a0) * k / 3)
            ring.append(b.verts.new((1.7 * r * math.cos(a), 1.7 * r * math.sin(a), z)))
        rings.append(ring)
    for j in range(len(rings) - 1):
        for k in range(3):
            b.faces.new((rings[j][k], rings[j][k + 1], rings[j + 1][k + 1], rings[j + 1][k]))
    bmesh.ops.remove_doubles(b, verts=b.verts, dist=1e-5)
    bmesh.ops.solidify(b, geom=b.faces[:], thickness=0.04)
    q.ajouter(b, para_r if i % 2 == 0 else para_b, loc=(0, 0, 2.6))
for i in range(N):
    a = math.radians(360 / N * i)
    haut = Vector((1.7 * math.cos(a), 1.7 * math.sin(a), 2.6))
    bas = Vector((0.5 * (1 if math.cos(a) > 0.3 else -1 if math.cos(a) < -0.3 else 0),
                  0.5 * (1 if math.sin(a) > 0.3 else -1 if math.sin(a) < -0.3 else 0), 0.0))
    d = haut - bas
    q.ajouter(cyl(0.008, d.length, 4), M['blanc'], loc=(bas + haut) / 2, rot=rot_vers(d))
para = q.objet(loc=(0, 0, 1.0), parent=ravit)
racines.append(ravit)

# ------------------------------------------------------------------ bilan, export
print('--- BILAN objets ---')
O.bilan(racines, budget=3000)
O.exporter('objets.glb', racines)
O.sauver('objets.blend')

# ------------------------------------------------------------------ rendus de contrôle
armes = racines[:7]
for o in racines:
    o.hide_render = True
    for c in o.children_recursive:
        c.hide_render = True
vit = []
for i, a in enumerate(armes[:6]):
    vit += O.copier([a], (0, 0, -i * 0.55), 0)
vit += O.copier([armes[6]], (0, 0.75, -0.05), 0)
O.rendu('objets_armes.png', objets=vit, direction=(1, 0, 0.12), taille=(1000, 1300))
for o in vit:
    o.hide_render = True
autres = racines[7:14]
vit = []
for i, a in enumerate(autres):
    vit += O.copier([a], ((i % 4) * 0.75, -(i // 4) * 0.9, 0.3 if a.name != 'pioche' else 0.0), 0)
O.rendu('objets_soins.png', objets=vit, direction=(0.55, 1, 0.55), taille=(1400, 900), ortho=False)
for o in vit:
    o.hide_render = True
vit = O.copier([coffre], (0, 0, 0), 0)
ouvert = O.copier([coffre], (1.5, 0, 0), 0)
charn = Vector((1.5, -0.36, 0.555))
for c in ouvert:
    if c.name.startswith('couvercle'):
        c.matrix_world = Matrix.Translation(charn) @ Matrix.Rotation(1.9, 4, 'X') @ Matrix.Translation(-charn) @ c.matrix_world
vit += ouvert + O.copier([ravit], (4.0, 0, 0), 0)
O.rendu('objets_coffre_ravitaillement.png', objets=vit, direction=(0.35, 1, 0.45), taille=(1400, 900), ortho=False)
