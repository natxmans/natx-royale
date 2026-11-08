# Natx Royale — cosmetiques.glb : un objet par cosmétique, nommé categorie_id.
#   chapeau_*   : origine au centre de la tête (à 1,86 m sur le perso)
#   dos_*       : origine au milieu du dos, sur la surface du dos (perso : x 0, y -0,13, z 1,35) ; l'objet part vers -Y
#   pioche_*    : origine à la poignée, manche vers +Y, tête au bout, pointes vers le haut / le bas (comme les armes)
#   deltaplane_*: origine aux pieds du perso, voile vers 3 m au-dessus, avant vers +Y
# Collab 2K27 : seulement le texte « 2K27 ».
# Lancer : blender.exe -b --factory-startup --python construire_cosmetiques.py
import sys, os, math, random
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import outils as O
from outils import (Piece, boite, cyl, cone, sphere, ico, tore, tube, capsule, rot_vers, texte, balayage, dome,
                    anneau, etoile, plaque, couper, epaissir)
import bpy, bmesh
from mathutils import Vector, Matrix

O.nouvelle_scene()
random.seed(11)
C = {}


def m(nom, couleur, rugo=0.55, metal=0.0, emission=0.0, alpha=1.0):
    if nom not in C:
        C[nom] = O.mat(nom, couleur, rugo, metal, emission, alpha)
    return C[nom]


NEON_C = lambda: m('neon_cyan', '#22e8ff', 0.3, 0.0, 2.5)
NEON_R = lambda: m('neon_rose', '#ff2e88', 0.3, 0.0, 2.5)
NEON_V = lambda: m('neon_violet', '#b026ff', 0.3, 0.0, 2.5)
NUIT = lambda: m('noir_2k27', '#0a0a14', 0.4, 0.2)
OR = lambda: m('or', '#ffc72c', 0.3, 0.85)
METAL = lambda: m('metal', '#c3ccd8', 0.3, 0.8)
SOMBRE = lambda: m('gris_fonce', '#2c313b', 0.5, 0.3)
BOIS = lambda: m('bois', '#b9773d', 0.75)
BLANC = lambda: m('blanc', '#f7f7fa', 0.5)
racines = []


def fin(p, lisse=40):
    o = p.objet(lisse=lisse)
    racines.append(o)
    return o


def arc_dessus(R, r, plan='XZ', cotes=8, seg=18):
    """Arceau qui passe par-dessus la tête : plan XZ (oreille à oreille) ou YZ (avant-arrière)."""
    bm = tore(R, r, seg, cotes, 0, 180)
    if plan == 'XZ':
        bmesh.ops.rotate(bm, verts=bm.verts, cent=(0, 0, 0), matrix=Matrix.Rotation(math.radians(90), 3, 'X'))
    else:
        bmesh.ops.transform(bm, verts=bm.verts, matrix=Matrix(((0, 0, 1, 0), (1, 0, 0, 0), (0, 1, 0, 0), (0, 0, 0, 1))))
    return bm


def bord_relevé(bm, R, k):
    for v in bm.verts:
        v.co.z += k * (v.co.x / R) ** 2
    return bm


# ==================================================================== CHAPEAUX (centre de la tête = 0,0,0)
# Le crâne monte à z = 0,15 ; la coque de cheveux fait environ 0,115 de large (X) et 0,125 (Y).
p = Piece('chapeau_casquette')
p.ajouter(dome(0.128, 0.138, 0.118), m('casquette', '#ff3b3b'), loc=(0, -0.004, 0.06))
p.ajouter(sphere(0.018, 8, 5), m('casquette', '#ff3b3b'), loc=(0, -0.004, 0.18))
p.ajouter(cyl(1.0, 0.02, 24, b=0.0), m('casquette_visiere', '#22262f'), loc=(0, 0.17, 0.072), rot=(-8, 0, 0), ech=(0.11, 0.105, 1))
p.ajouter(anneau(0.06, 0.08, 0.128, 0.138, 0.006), m('casquette_visiere', '#22262f'))
fin(p)

p = Piece('chapeau_bonnet')
p.ajouter(dome(0.128, 0.138, 0.155), m('bonnet', '#2ec4b6'), loc=(0, 0, 0.04))
p.ajouter(anneau(0.03, 0.095, 0.124, 0.134, 0.018), m('bonnet_bord', '#ffd23f'))
for z in (0.13,):
    p.ajouter(anneau(z, z + 0.025, 0.112, 0.122, 0.012), m('bonnet_bord', '#ffd23f'))
p.ajouter(ico(0.052, 3), m('bonnet_pompon', '#ff6fb5'), loc=(0, -0.01, 0.205))
fin(p)

p = Piece('chapeau_cowboy')
p.ajouter(bord_relevé(cyl(1.0, 0.018, 32, b=0.0), 1.0, 0.0), m('cowboy', '#b5713a'), loc=(0, 0, 0.068),
          ech=(0.27, 0.245, 1))
p.ajouter(tube([(0.065, 0.126, 0.136), (0.15, 0.12, 0.13), (0.21, 0.108, 0.118), (0.228, 0.09, 0.1),
                (0.205, 0.035, 0.06)], cotes=20, uv=False), m('cowboy', '#b5713a'))
p.ajouter(anneau(0.075, 0.105, 0.124, 0.134, 0.006), m('cowboy_bande', '#3a2414'))
bm = p.bm
for v in bm.verts:     # bords relevés sur les côtés
    if abs(v.co.z - 0.068) < 0.012 and math.hypot(v.co.x, v.co.y) > 0.14:
        v.co.z += 0.075 * (v.co.x / 0.27) ** 2
fin(p)

p = Piece('chapeau_toque')
p.ajouter(anneau(0.06, 0.13, 0.124, 0.134, 0.01), BLANC())
p.ajouter(cyl(0.128, 0.11, 20), BLANC(), loc=(0, 0, 0.165), ech=(1, 1.06, 1))
for i in range(6):
    a = math.radians(60 * i)
    p.ajouter(sphere(0.085, 12, 8), BLANC(), loc=(math.cos(a) * 0.075, math.sin(a) * 0.08, 0.255))
p.ajouter(sphere(0.1, 12, 8), BLANC(), loc=(0, 0, 0.285))
fin(p, 55)

p = Piece('chapeau_bandeau')
p.ajouter(anneau(0.035, 0.085, 0.112, 0.124, 0.014), m('bandeau', '#ff3b5c'))
p.ajouter(anneau(0.055, 0.065, 0.1265, 0.1385, 0.003), BLANC())
p.ajouter(sphere(0.026, 10, 6), m('bandeau', '#ff3b5c'), loc=(0, -0.14, 0.06))
p.ajouter(boite(0.045, 0.012, 0.12, 0.005, 1), m('bandeau', '#ff3b5c'), loc=(0.025, -0.15, -0.0), rot=(-12, 15, 0))
p.ajouter(boite(0.045, 0.012, 0.1, 0.005, 1), m('bandeau', '#ff3b5c'), loc=(-0.03, -0.15, 0.005), rot=(-12, -20, 0))
fin(p)

p = Piece('chapeau_hautdeforme')
brim = cyl(1.0, 0.02, 32, b=0.0)
for v in brim.verts:
    v.co.z += 0.12 * v.co.x ** 2
p.ajouter(brim, m('hautdeforme', '#1d1f26', 0.4), loc=(0, 0, 0.07), ech=(0.21, 0.2, 1))
p.ajouter(tube([(0.07, 0.124, 0.134), (0.3, 0.13, 0.14), (0.345, 0.136, 0.146)], cotes=22, uv=False),
          m('hautdeforme', '#1d1f26', 0.4))
p.ajouter(anneau(0.085, 0.13, 0.1255, 0.1355, 0.006), m('hautdeforme_ruban', '#8a3ffc'))
fin(p)

p = Piece('chapeau_viking')
p.ajouter(dome(0.132, 0.142, 0.13), METAL(), loc=(0, 0, 0.045))
p.ajouter(anneau(0.035, 0.075, 0.13, 0.14, 0.012), m('bronze', '#c9822b', 0.35, 0.7))
p.ajouter(arc_dessus(0.136, 0.012, 'YZ'), m('bronze', '#c9822b', 0.35, 0.7), loc=(0, 0, 0.045), ech=(1, 1.0, 0.96))
p.ajouter(boite(0.026, 0.02, 0.11, 0.008, 1), m('bronze', '#c9822b', 0.35, 0.7), loc=(0, 0.148, 0.02))
for s in (1, -1):
    pts = [(0.115 * s, 0.0, 0.09), (0.19 * s, 0.0, 0.115), (0.25 * s, 0.01, 0.18), (0.27 * s, 0.02, 0.26),
           (0.255 * s, 0.03, 0.32)]
    p.ajouter(balayage(pts, [0.042, 0.036, 0.026, 0.014, 0.002], 10), m('corne', '#f3e6c8'))
fin(p)

p = Piece('chapeau_chat')
p.ajouter(arc_dessus(0.132, 0.011, 'XZ'), m('chat', '#2b2b35'), loc=(0, 0.02, 0.0), ech=(1, 1, 1.18))
for s in (1, -1):
    p.ajouter(cone(0.058, 0.11, 4), m('chat', '#2b2b35'), loc=(0.078 * s, 0.02, 0.19), rot=(0, -22 * s, 45), ech=(1, 0.45, 1))
    p.ajouter(cone(0.036, 0.07, 4), m('chat_rose', '#ff8fb1'), loc=(0.074 * s, 0.032, 0.18), rot=(0, -22 * s, 45), ech=(1, 0.3, 1))
fin(p, 30)

p = Piece('chapeau_tricorne')
p.ajouter(dome(0.13, 0.14, 0.105), m('tricorne', '#2b2340'), loc=(0, 0, 0.07))
b = bmesh.new()
an = []
for j, f in enumerate((0.0, 0.35, 0.7, 1.0)):
    ring = []
    for k in range(36):
        a = math.tau * k / 36
        R = 0.235 * (0.78 + 0.22 * math.cos(3 * a))
        r = 0.125 + (R - 0.125) * f
        haut = (1 - math.cos(3 * a)) / 2 * 0.11 * f ** 1.4
        ring.append(b.verts.new((r * math.sin(a), r * math.cos(a), haut)))
    an.append(ring)
for j in range(3):
    for k in range(36):
        k2 = (k + 1) % 36
        b.faces.new((an[j][k], an[j][k2], an[j + 1][k2], an[j + 1][k]))
bmesh.ops.recalc_face_normals(b, faces=b.faces)
epaissir(b, 0.018)
p.ajouter(b, m('tricorne', '#2b2340'), loc=(0, 0, 0.07))
p.ajouter(anneau(0.07, 0.1, 0.128, 0.138, 0.005), OR())
p.ajouter(sphere(0.02, 8, 5), OR(), loc=(0, 0.2, 0.1))
fin(p)

p = Piece('chapeau_helice')
for i, coul in enumerate(('#ff3b3b', '#ffd23f', '#2b6dff', '#3fc94a')):
    q = dome(0.13, 0.14, 0.12)
    sx = 1 if i in (0, 3) else -1
    sy = 1 if i in (0, 1) else -1
    couper(q, (0, 0, 0), (sx, 0, 0))
    couper(q, (0, 0, 0), (0, sy, 0))
    p.ajouter(q, m(f'helice_{i}', coul), loc=(0, 0, 0.05))
p.ajouter(cyl(1.0, 0.016, 20), m('helice_visiere', '#2b6dff'), loc=(0, 0.16, 0.06), rot=(-8, 0, 0), ech=(0.09, 0.08, 1))
p.ajouter(cyl(0.008, 0.06, 8), METAL(), loc=(0, 0, 0.19))
p.ajouter(sphere(0.018, 8, 5), m('helice_0', '#ff3b3b'), loc=(0, 0, 0.222))
for s in (1, -1):
    p.ajouter(boite(0.15, 0.04, 0.008, 0.004, 1), m('helice_1', '#ffd23f'), loc=(0.08 * s, 0, 0.222), rot=(14 * s, 0, 0))
fin(p)

p = Piece('chapeau_cornes')
p.ajouter(arc_dessus(0.132, 0.01, 'XZ'), m('cornes_bandeau', '#2b2b35'), loc=(0, 0.02, 0.0), ech=(1, 1, 1.18))
for s in (1, -1):
    pts = [(0.07 * s, 0.03, 0.135), (0.085 * s, 0.035, 0.18), (0.11 * s, 0.04, 0.22), (0.145 * s, 0.04, 0.245),
           (0.17 * s, 0.035, 0.25)]
    p.ajouter(balayage(pts, [0.03, 0.025, 0.017, 0.009, 0.001], 10), m('cornes', '#ff2d2d', 0.4))
fin(p)

p = Piece('chapeau_heaume')
p.ajouter(tube([(-0.165, 0.138, 0.148), (0.0, 0.142, 0.152), (0.12, 0.138, 0.148), (0.17, 0.11, 0.12),
                (0.185, 0.05, 0.055), (0.188, 0.0, 0.0)], cotes=22, uv=False), METAL())
p.ajouter(boite(0.17, 0.03, 0.022, 0.008, 1), m('fente', '#11141a'), loc=(0, 0.15, 0.035))
p.ajouter(boite(0.032, 0.03, 0.33, 0.01, 1), m('metal_fonce', '#7c8796', 0.35, 0.8), loc=(0, 0.152, 0.0))
p.ajouter(anneau(-0.17, -0.14, 0.138, 0.148, 0.01), m('metal_fonce', '#7c8796', 0.35, 0.8))
for i in range(3):
    p.ajouter(sphere(0.008, 6, 4), m('fente', '#11141a'), loc=(0.05, 0.142, -0.05 - i * 0.025))
for i, (y, l) in enumerate(((-0.02, 0.2), (-0.06, 0.18), (0.02, 0.16))):
    p.ajouter(capsule(0.025, l, 8, 2), m('plume', '#ff3b3b'), loc=(0, y, 0.17), rot=rot_vers((0, -0.8 - i * 0.2, 1)))
fin(p)

p = Piece('chapeau_couronne')
p.ajouter(anneau(0.07, 0.13, 0.124, 0.134, 0.014), OR())
for i in range(8):
    a = math.tau * i / 8
    pos = Vector((math.sin(a) * 0.132, math.cos(a) * 0.142, 0.155))
    p.ajouter(cone(0.026, 0.07, 6), OR(), loc=pos)
    p.ajouter(sphere(0.012, 6, 4), OR(), loc=pos + Vector((0, 0, 0.04)))
    p.ajouter(sphere(0.015, 8, 5, ech=(1, 1, 1)), m('rubis', '#ff2b4a', 0.2, 0.0, 0.3) if i % 2 == 0 else
              m('saphir', '#2b6dff', 0.2, 0.0, 0.3), loc=Vector((math.sin(a) * 0.14, math.cos(a) * 0.15, 0.1)))
fin(p)

p = Piece('chapeau_aureole')
p.ajouter(tore(0.12, 0.014, 32, 8), m('aureole', '#fff0a0', 0.3, 0.0, 3.0), loc=(0, -0.01, 0.27), rot=(10, 0, 0))
fin(p)

p = Piece('chapeau_bocal')
verre = sphere(0.215, 24, 14)
couper(verre, (0, 0, -0.165), (0, 0, 1))
p.ajouter(verre, m('verre_bocal', '#bfeaff', 0.05, 0.0, 0.0, 0.25), loc=(0, 0.01, 0.02))
p.ajouter(anneau(-0.18, -0.135, 0.15, 0.15, 0.025), m('bocal_col', '#e6ebf2', 0.4, 0.4))
p.ajouter(sphere(0.022, 10, 6, ech=(1.4, 0.7, 1)), m('poisson_rouge', '#ff8a1f'), loc=(0.15, 0.08, 0.12))
p.ajouter(cone(0.02, 0.03, 6), m('poisson_rouge', '#ff8a1f'), loc=(0.115, 0.08, 0.12), rot=(0, 90, 0), ech=(0.4, 1, 1))
fin(p)

p = Piece('chapeau_casque2k27')
p.ajouter(arc_dessus(0.148, 0.018, 'XZ', 8, 20), NUIT(), loc=(0, 0, 0.0), ech=(1, 1, 1.12))
p.ajouter(arc_dessus(0.149, 0.006, 'XZ', 6, 20), NEON_V(), loc=(0, 0, 0.0), ech=(1, 1, 1.15))
for s, neon in ((1, NEON_C), (-1, NEON_R)):
    p.ajouter(cyl(0.066, 0.055, 20, b=0.016), NUIT(), loc=(0.135 * s, 0, 0.0), rot=(0, 90, 0))
    p.ajouter(tore(0.06, 0.008, 20, 6), neon(), loc=(0.165 * s, 0, 0.0), rot=(0, 90, 0))
    t = texte('2K27', 0.034, 0.006, 0.0)
    bmesh.ops.rotate(t, verts=t.verts, cent=(0, 0, 0), matrix=Matrix.Rotation(math.radians(-90 * s), 3, 'Z'))
    p.ajouter(t, NEON_V(), loc=(0.164 * s, 0, 0.0))
p.ajouter(balayage([(-0.15, 0.02, -0.02), (-0.14, 0.08, -0.05), (-0.1, 0.13, -0.07), (-0.05, 0.15, -0.075)],
                   0.007, 6), NUIT())
p.ajouter(sphere(0.015, 8, 5), NEON_R(), loc=(-0.045, 0.152, -0.075))
fin(p)

p = Piece('chapeau_sorcier')
brim = cyl(1.0, 0.018, 32, b=0.0)
for v in brim.verts:
    v.co.z += 0.03 * math.sin(3 * math.atan2(v.co.x, v.co.y)) * v.co.length
p.ajouter(brim, m('sorcier', '#5b2bd1'), loc=(0, 0, 0.07), ech=(0.28, 0.27, 1))
p.ajouter(tube([(0.07, 0.135, 0.145), (0.15, 0.11, 0.12, 0, -0.005), (0.25, 0.08, 0.085, 0, -0.02),
                (0.34, 0.05, 0.055, 0, -0.05), (0.40, 0.03, 0.03, 0, -0.09), (0.43, 0.015, 0.015, 0, -0.13),
                (0.435, 0.004, 0.004, 0, -0.16)], cotes=18, uv=False), m('sorcier', '#5b2bd1'))
p.ajouter(anneau(0.075, 0.11, 0.132, 0.142, 0.006), m('sorcier_or', '#ffd23f', 0.35, 0.3))
for (x, y, z, rz) in ((0.07, 0.07, 0.2, 40), (-0.06, 0.06, 0.28, -35), (0.0, -0.08, 0.24, 180)):
    p.ajouter(etoile(0.028, 0.012, 0.008), m('sorcier_or', '#ffd23f', 0.35, 0.3), loc=(x, y, z), rot=(0, 0, rz))
fin(p)

p = Piece('chapeau_casquepompier')
p.ajouter(dome(0.135, 0.145, 0.135), m('pompier', '#e8262b', 0.4), loc=(0, 0, 0.055))
brim = cyl(1.0, 0.02, 28, b=0.0)
for v in brim.verts:
    v.co.z -= 0.25 * max(0.0, -v.co.y) ** 2
p.ajouter(brim, m('pompier', '#e8262b', 0.4), loc=(0, -0.035, 0.06), ech=(0.2, 0.25, 1))
p.ajouter(arc_dessus(0.14, 0.014, 'YZ'), m('pompier_fonce', '#a8151a', 0.45), loc=(0, 0, 0.055), ech=(1, 1, 0.98))
p.ajouter(boite(0.085, 0.016, 0.095, 0.012, 1), OR(), loc=(0, 0.142, 0.13), rot=(-30, 0, 0))
p.ajouter(etoile(0.026, 0.011, 0.01), m('pompier', '#e8262b', 0.4), loc=(0, 0.152, 0.135), rot=(-30, 0, 0))
fin(p)

# ==================================================================== DOS (origine = surface du dos, vers -Y)
p = Piece('dos_sac')
p.ajouter(boite(0.34, 0.17, 0.44, 0.06, 2), m('sac', '#ff8a1f'), loc=(0, -0.09, -0.02))
p.ajouter(boite(0.35, 0.18, 0.11, 0.045, 2), m('sac_fonce', '#c4561b'), loc=(0, -0.095, 0.17))
p.ajouter(boite(0.24, 0.07, 0.17, 0.03, 2), m('sac_fonce', '#c4561b'), loc=(0, -0.19, -0.1))
p.ajouter(boite(0.05, 0.02, 0.32, 0.008, 1), SOMBRE(), loc=(0.1, 0.0, 0.08), sym=True)
p.ajouter(boite(0.05, 0.25, 0.02, 0.008, 1), SOMBRE(), loc=(0.1, 0.12, 0.25), sym=True)
p.ajouter(sphere(0.016, 6, 4), METAL(), loc=(0.06, -0.23, -0.04), sym=True)
fin(p)

p = Piece('dos_cape')


def forme_cape(v):
    u, t = v.x, -v.y          # u : -1..1 en largeur, t : 0 (épaules) .. 1 (bas)
    larg = 0.22 + 0.2 * t
    return Vector((u * larg, -0.03 - 0.07 * t - 0.03 * math.cos(u * 1.4), 0.26 - 1.2 * t + 0.03 * math.sin(u * 7) * t))


p.ajouter(plaque([(-1, 0), (1, 0), (1, -1), (-1, -1)], ep=0.02, cuts=6, deform=forme_cape), m('cape', '#d61f45'))
p.ajouter(cyl(0.03, 0.015, 12), OR(), loc=(0.19, 0.0, 0.25), rot=(90, 0, 0), sym=True)
fin(p, 50)

p = Piece('dos_carquois')
d = Vector((math.sin(math.radians(25)), 0, math.cos(math.radians(25))))
c0 = Vector((0.02, -0.09, 0.0))
p.ajouter(cyl(0.066, 0.5, 14, b=0.012), m('carquois', '#8a4f22'), loc=c0, rot=(0, 25, 0))
for k in (-0.2, 0.22):
    p.ajouter(cyl(0.069, 0.03, 14), OR(), loc=c0 + d * k, rot=(0, 25, 0))
for i, (dx, dy, l) in enumerate(((-0.02, 0.0, 0.3), (0.02, 0.01, 0.34), (0.0, -0.025, 0.28), (0.03, -0.015, 0.32))):
    base = c0 + d * 0.2 + Vector((dx, dy, 0))
    p.ajouter(cyl(0.006, l, 6), BOIS(), loc=base + d * (l / 2), rot=(0, 25, 0))
    for a in (0, 120, 240):
        p.ajouter(boite(0.004, 0.035, 0.07, 0.0), m('plume_fleche', '#ff3b3b' if i % 2 else '#ffffff'),
                  loc=base + d * (l - 0.03), rot=(0, 25, a))
p.ajouter(boite(0.04, 0.015, 0.62, 0.005, 1), m('sangle', '#5a3418'), loc=(0, -0.005, 0.0), rot=(0, -40, 0))
fin(p)

p = Piece('dos_guitare')
p.ajouter(sphere(0.17, 16, 8, ech=(1, 0.3, 0.88)), m('guitare', '#ff2e88', 0.35), loc=(0, -0.09, -0.13))
p.ajouter(sphere(0.13, 16, 8, ech=(1, 0.3, 0.82)), m('guitare', '#ff2e88', 0.35), loc=(0, -0.09, 0.06))
p.ajouter(boite(0.12, 0.012, 0.2, 0.03, 1), BLANC(), loc=(0.03, -0.142, -0.05), rot=(0, 12, 0))
for z in (-0.14, -0.07):
    p.ajouter(boite(0.09, 0.016, 0.03, 0.006, 1), SOMBRE(), loc=(0, -0.145, z))
p.ajouter(boite(0.052, 0.03, 0.44, 0.01, 1), m('guitare_manche', '#3a2414'), loc=(0, -0.1, 0.36))
p.ajouter(boite(0.075, 0.032, 0.11, 0.015, 1), m('guitare_manche', '#3a2414'), loc=(0, -0.1, 0.62))
for s in (1, -1):
    for z in (0.6, 0.64):
        p.ajouter(cyl(0.008, 0.03, 6), METAL(), loc=(0.045 * s, -0.1, z), rot=(0, 90, 0))
for x in (0.09, 0.11):
    p.ajouter(cyl(0.015, 0.015, 10), METAL(), loc=(x, -0.145, -0.2), rot=(90, 0, 0))
bmesh.ops.rotate(p.bm, verts=p.bm.verts, cent=(0, 0, 0), matrix=Matrix.Rotation(math.radians(-28), 3, 'Y'))
fin(p)

p = Piece('dos_bouclier')
p.ajouter(cyl(0.3, 0.045, 28, b=0.015), m('bouclier_dos', '#2b6dff'), loc=(0, -0.05, 0.0), rot=(90, 0, 0))
p.ajouter(tore(0.3, 0.026, 32, 8), OR(), loc=(0, -0.05, 0.0), rot=(90, 0, 0))
p.ajouter(sphere(0.07, 14, 7, ech=(1, 0.5, 1)), OR(), loc=(0, -0.075, 0.0))
p.ajouter(etoile(0.2, 0.085, 0.012), BLANC(), loc=(0, -0.078, 0.0))
fin(p)

p = Piece('dos_poisson')
p.ajouter(sphere(1.0, 18, 10, ech=(0.14, 0.09, 0.3)), m('poisson', '#ff8f1f'), loc=(0, -0.11, 0.02))
p.ajouter(sphere(1.0, 14, 8, ech=(0.1, 0.07, 0.2)), m('poisson_ventre', '#ffe2a8'), loc=(-0.045, -0.12, 0.0))
for s in (1, -1):
    p.ajouter(cone(0.11, 0.16, 4), m('poisson_nageoire', '#ff4a3d'), loc=(0.07 * s, -0.11, -0.34), rot=(0, 160 * s, 45),
              ech=(1, 0.25, 1))
p.ajouter(cone(0.12, 0.2, 4), m('poisson_nageoire', '#ff4a3d'), loc=(0.14, -0.11, 0.05), rot=(0, 90, 45), ech=(0.25, 0.2, 1))
p.ajouter(sphere(0.035, 10, 6), BLANC(), loc=(0.04, -0.185, 0.22))
p.ajouter(sphere(0.018, 8, 5), m('pupille', '#1a1f2e'), loc=(0.045, -0.212, 0.222))
for z in (-0.1, 0.06, 0.18):
    p.ajouter(boite(0.32, 0.012, 0.03, 0.006, 1), SOMBRE(), loc=(0, -0.025, z))
fin(p)

p = Piece('dos_ailes')
# silhouette d'une aile (x vers l'extérieur, z en haut), plumes festonnées en bas
AILE = [(0.05, 0.12), (0.18, 0.4), (0.38, 0.6), (0.6, 0.67), (0.8, 0.58), (0.9, 0.4), (0.8, 0.32), (0.86, 0.17),
        (0.72, 0.12), (0.75, -0.03), (0.6, -0.02), (0.6, -0.18), (0.46, -0.13), (0.43, -0.3), (0.3, -0.19),
        (0.14, -0.12)]


def aile_plume(contour, s, recul, ep):
    b = plaque([(x * s, z) for (x, z) in contour], ep=0, cuts=2)
    bmesh.ops.rotate(b, verts=b.verts, cent=(0, 0, 0), matrix=Matrix.Rotation(math.radians(90), 3, 'X'))
    for v in b.verts:
        v.co.y = recul - 0.22 * v.co.x ** 2
    bmesh.ops.recalc_face_normals(b, faces=b.faces)
    if b.faces and sum(f.normal.y for f in b.faces) > 0:
        bmesh.ops.reverse_faces(b, faces=b.faces)
    epaissir(b, ep)
    return b


for s in (1, -1):
    p.ajouter(aile_plume(AILE, s, -0.06, 0.035), m('ailes', '#fbfbff', 0.5))
    p.ajouter(aile_plume([(x * 0.6 + 0.02, z * 0.6 + 0.2) for (x, z) in AILE], s, -0.098, 0.02),
              m('ailes_bout', '#ffd86b', 0.4, 0.3))
    p.ajouter(sphere(0.06, 10, 6, ech=(1, 0.6, 1)), m('ailes_bout', '#ffd86b', 0.4, 0.3), loc=(0.07 * s, -0.06, 0.1))
fin(p, 50)

p = Piece('dos_fusee')
p.ajouter(boite(0.18, 0.06, 0.36, 0.03, 2), SOMBRE(), loc=(0, -0.035, -0.02))
for s in (1, -1):
    p.ajouter(capsule(0.085, 0.46, 14, 3), m('fusee', '#e9edf3', 0.35, 0.3), loc=(0.11 * s, -0.12, -0.26))
    p.ajouter(cone(0.088, 0.14, 14), m('fusee_rouge', '#ff3b3b'), loc=(0.11 * s, -0.12, 0.25))
    p.ajouter(cyl(0.06, 0.07, 12, r2=0.075, b=0.01, seg=1), SOMBRE(), loc=(0.11 * s, -0.12, -0.29), rot=(180, 0, 0))
    p.ajouter(cone(0.055, 0.22, 10), m('flamme', '#ff9a1f', 0.3, 0.0, 3.0), loc=(0.11 * s, -0.12, -0.43), rot=(180, 0, 0))
    p.ajouter(boite(0.012, 0.09, 0.12, 0.004, 1), m('fusee_rouge', '#ff3b3b'), loc=(0.2 * s, -0.12, -0.2))
fin(p)

p = Piece('dos_manette')
p.ajouter(boite(0.5, 0.1, 0.22, 0.08, 3), m('manette', '#2c2f3a', 0.45), loc=(0, -0.07, 0.04))
for s in (1, -1):
    p.ajouter(sphere(0.1, 14, 8, ech=(0.9, 0.5, 1.3)), m('manette', '#2c2f3a', 0.45), loc=(0.17 * s, -0.07, -0.1), rot=(0, 25 * s, 0))
    p.ajouter(cyl(0.035, 0.03, 12, b=0.008, seg=1), SOMBRE(), loc=(0.06 * s, -0.13, -0.04), rot=(90, 0, 0))
    p.ajouter(sphere(0.03, 10, 5, ech=(1, 0.5, 1)), m('manette_stick', '#4a5060'), loc=(0.06 * s, -0.15, -0.04))
p.ajouter(boite(0.1, 0.02, 0.03, 0.006, 1), SOMBRE(), loc=(-0.14, -0.123, 0.06))
p.ajouter(boite(0.03, 0.02, 0.1, 0.006, 1), SOMBRE(), loc=(-0.14, -0.123, 0.06))
for (dx, dz, c) in ((0, 0.04, '#22e8ff'), (0.04, 0, '#ff2e88'), (-0.04, 0, '#ffd23f'), (0, -0.04, '#3fc94a')):
    p.ajouter(sphere(0.017, 8, 5, ech=(1, 0.6, 1)), m('bouton_' + c, c, 0.3, 0.0, 0.6), loc=(0.14 + dx, -0.122, 0.06 + dz))
p.ajouter(boite(0.3, 0.012, 0.012, 0.004, 1), NEON_C(), loc=(0, -0.122, 0.13))
fin(p)

p = Piece('dos_ballons')
attache = Vector((0, -0.08, 0.18))
for (x, y, z, c) in ((-0.25, -0.18, 1.0, '#ff3b3b'), (0.0, -0.24, 1.18, '#ffd23f'), (0.26, -0.15, 1.02, '#2b6dff'),
                     (-0.12, -0.05, 1.34, '#3fc94a'), (0.16, -0.08, 1.36, '#ff6fb5')):
    centre = Vector((x, y, z))
    p.ajouter(sphere(0.15, 14, 9, ech=(1, 1, 1.18)), m('ballon_' + c, c, 0.25), loc=centre)
    p.ajouter(cone(0.025, 0.035, 8), m('ballon_' + c, c, 0.25), loc=centre + Vector((0, 0, -0.185)), rot=(180, 0, 0))
    bas = centre + Vector((0, 0, -0.2))
    milieu = (bas + attache) / 2 + Vector((0.03, 0, 0))
    p.ajouter(balayage([bas, milieu, attache], 0.004, 4), BLANC())
p.ajouter(sphere(0.025, 8, 5), SOMBRE(), loc=attache)
fin(p)


# ==================================================================== PIOCHES (origine à la poignée, tête vers +Y)
def manche(p, mat_manche=None, l=0.86, r=0.032, grip=None):
    p.ajouter(cyl(r, l, 10, b=0.006, seg=1), mat_manche or BOIS(), loc=(0, l / 2 - 0.1, 0), rot=(-90, 0, 0))
    p.ajouter(cyl(r + 0.009, 0.2, 10, b=0.01), grip or m('grip', '#1d2026', 0.8), loc=(0, 0.0, 0), rot=(-90, 0, 0))
    p.ajouter(cyl(r + 0.014, 0.035, 10, b=0.01), grip or m('grip', '#1d2026', 0.8), loc=(0, -0.115, 0), rot=(-90, 0, 0))


def tete_pioche(p, mat_bloc, mat_lame, mat_bague, y=0.74):
    p.ajouter(boite(0.12, 0.13, 0.14, 0.03), mat_bloc, loc=(0, y, 0))
    p.ajouter(boite(0.125, 0.04, 0.145, 0.012), mat_bague, loc=(0, y - 0.065, 0))
    for sz in (1, -1):
        d = Vector((0, -0.28, sz)).normalized()
        p.ajouter(cyl(0.058, 0.36, 8, r2=0.01), mat_lame, loc=Vector((0, y, 0)) + d * 0.2, rot=rot_vers(d), ech=(0.7, 1, 1))


p = Piece('pioche_classique')
manche(p)
tete_pioche(p, m('acier', '#7d8794', 0.35, 0.7), METAL(), m('orange', '#ff7a2f'))
fin(p)

p = Piece('pioche_pelle')
manche(p, l=0.92)
p.ajouter(tore(0.06, 0.016, 14, 6, 0, 360), SOMBRE(), loc=(0, -0.2, 0), ech=(1, 1, 1))
p.ajouter(cyl(0.045, 0.12, 10, b=0.01), METAL(), loc=(0, 0.8, 0), rot=(-90, 0, 0))
lame = plaque([(-0.13, 0.0), (0.13, 0.0), (0.14, 0.22), (0.07, 0.31), (0.0, 0.34), (-0.07, 0.31), (-0.14, 0.22)],
              ep=0.025, cuts=1, deform=lambda v: Vector((v.x, v.y, 0.15 * v.x * v.x)))
p.ajouter(lame, METAL(), loc=(0, 0.84, 0))
fin(p)

p = Piece('pioche_cle')
p.ajouter(boite(0.07, 0.82, 0.036, 0.015, 2), METAL(), loc=(0, 0.3, 0))
p.ajouter(boite(0.085, 0.3, 0.05, 0.02, 2), m('rouge', '#e8262b'), loc=(0, 0.0, 0))
p.ajouter(tore(0.09, 0.036, 20, 8, 130, 410), METAL(), loc=(0, 0.79, 0), ech=(1, 1, 0.75))
p.ajouter(tore(0.06, 0.03, 16, 8, 0, 360), METAL(), loc=(0, -0.17, 0), ech=(1, 1, 0.75))
fin(p)

p = Piece('pioche_baguette')
p.ajouter(capsule(0.06, 1.02, 12, 3), m('baguette', '#d9963f', 0.7), loc=(0, -0.16, 0), rot=(-90, 0, 0), ech=(1.15, 1, 0.85))
for i in range(5):
    p.ajouter(boite(0.1, 0.03, 0.02, 0.008, 1), m('baguette_entaille', '#f6dca0', 0.7), loc=(0, 0.12 + i * 0.15, 0.05),
              rot=(0, 0, 35))
fin(p)

p = Piece('pioche_marteau')
manche(p, m('bois_fonce', '#7a4a24', 0.75))
p.ajouter(cyl(0.09, 0.3, 16, b=0.02), m('acier', '#7d8794', 0.35, 0.7), loc=(0, 0.78, 0))
for z in (0.11, -0.11):
    p.ajouter(cyl(0.094, 0.025, 16, b=0.006, seg=1), m('orange', '#ff7a2f'), loc=(0, 0.78, z))
fin(p)

p = Piece('pioche_hache')
manche(p, m('bois_fonce', '#7a4a24', 0.75))
p.ajouter(boite(0.06, 0.12, 0.09, 0.02), m('rouge', '#e8262b'), loc=(0, 0.76, 0))
lame = cyl(0.15, 0.03, 24, b=0.008, seg=1)
bmesh.ops.rotate(lame, verts=lame.verts, cent=(0, 0, 0), matrix=Matrix.Rotation(math.radians(90), 3, 'Y'))
couper(lame, (0, 0, -0.03), (0, 0, 1))
p.ajouter(lame, METAL(), loc=(0, 0.77, 0.12))
p.ajouter(boite(0.032, 0.12, 0.1, 0.01, 1), METAL(), loc=(0, 0.77, 0.07))
fin(p)

p = Piece('pioche_os')
p.ajouter(cyl(0.045, 0.82, 12, b=0.01), m('os', '#f3ecdc', 0.6), loc=(0, 0.3, 0), rot=(-90, 0, 0))
for y in (-0.11, 0.71):
    for x in (0.045, -0.045):
        p.ajouter(sphere(0.065, 12, 8), m('os', '#f3ecdc', 0.6), loc=(x, y, 0))
fin(p, 55)

p = Piece('pioche_trident')
p.ajouter(cyl(0.025, 1.0, 10), OR(), loc=(0, 0.35, 0), rot=(-90, 0, 0))
p.ajouter(boite(0.32, 0.045, 0.045, 0.015), OR(), loc=(0, 0.86, 0))
for x in (-0.14, 0.0, 0.14):
    p.ajouter(cyl(0.016, 0.2, 8), OR(), loc=(x, 0.97, 0), rot=(-90, 0, 0))
    p.ajouter(cone(0.03, 0.09, 8), OR(), loc=(x, 1.1, 0), rot=(-90, 0, 0))
p.ajouter(cyl(0.035, 0.18, 10, b=0.01), m('grip_bleu', '#1f6fe0'), loc=(0, 0.0, 0), rot=(-90, 0, 0))
p.ajouter(sphere(0.035, 10, 6), m('saphir', '#2b6dff', 0.2, 0.0, 0.3), loc=(0, 0.86, 0.03))
fin(p)

p = Piece('pioche_pinceau')
p.ajouter(cyl(0.03, 0.75, 10, r2=0.042, b=0.006, seg=1), m('bois_clair', '#e8c89a', 0.7), loc=(0, 0.25, 0), rot=(-90, 0, 0))
p.ajouter(cyl(0.05, 0.12, 12, b=0.01), METAL(), loc=(0, 0.68, 0), rot=(-90, 0, 0))
p.ajouter(tube([(0.0, 0.052, 0.052), (0.1, 0.075, 0.06), (0.22, 0.06, 0.04), (0.3, 0.01, 0.008)], cotes=14, uv=False,
               axe='Y'), m('poils', '#7a4a24', 0.8), loc=(0, 0.74, 0))
p.ajouter(tube([(0.19, 0.066, 0.046), (0.24, 0.05, 0.034), (0.305, 0.012, 0.01)], cotes=14, uv=False, axe='Y'),
          m('peinture', '#2bd1ff', 0.3), loc=(0, 0.74, 0))
fin(p)

p = Piece('pioche_doree')
manche(p, m('bois_fonce', '#5a3a1e', 0.75), grip=OR())
tete_pioche(p, OR(), OR(), m('rubis', '#ff2b4a', 0.2, 0.0, 0.3))
p.ajouter(ico(0.045, 2), m('rubis', '#ff2b4a', 0.2, 0.0, 0.3), loc=(0.05, 0.74, 0), ech=(0.5, 1, 1))
p.ajouter(ico(0.045, 2), m('rubis', '#ff2b4a', 0.2, 0.0, 0.3), loc=(-0.05, 0.74, 0), ech=(0.5, 1, 1))
fin(p)

p = Piece('pioche_cristal')
manche(p, SOMBRE())
cr = m('cristal', '#7ff3ff', 0.1, 0.1, 1.0, 0.85)
p.ajouter(boite(0.1, 0.11, 0.12, 0.025), SOMBRE(), loc=(0, 0.74, 0))
for sz in (1, -1):
    p.ajouter(cone(0.07, 0.34, 4), cr, loc=(0, 0.72, 0.2 * sz), rot=(0 if sz > 0 else 180, 0, 45), ech=(0.8, 1.2, 1))
p.ajouter(ico(0.06, 1), cr, loc=(0, 0.74, 0), ech=(1.2, 1.1, 1.3))
fin(p, 25)

p = Piece('pioche_clavier')
manche(p, NUIT(), grip=NEON_V())
p.ajouter(boite(0.075, 0.25, 0.68, 0.025, 2), NUIT(), loc=(0, 0.79, 0))
for sx in (1, -1):
    for row in range(3):
        for col in range(9):
            p.ajouter(boite(0.012, 0.05, 0.05, 0.0), m('touche', '#2b2b40', 0.5),
                      loc=(0.043 * sx, 0.705 + row * 0.06, -0.3 + col * 0.06))
    t = texte('2K27', 0.07, 0.008, 0.0)
    bmesh.ops.rotate(t, verts=t.verts, cent=(0, 0, 0), matrix=Matrix.Rotation(math.radians(-90 * sx), 3, 'Z'))
    p.ajouter(t, NEON_V(), loc=(0.042 * sx, 0.79, 0.27))
for (y, neon) in ((0.665, NEON_C), (0.915, NEON_R)):
    p.ajouter(boite(0.078, 0.012, 0.66, 0.0), neon(), loc=(0, y, 0))
fin(p, 30)

p = Piece('pioche_spatule')
manche(p, m('rouge', '#e8262b'), l=0.8)
p.ajouter(cyl(0.022, 0.12, 8), METAL(), loc=(0, 0.74, 0), rot=(-90, 0, 0))
for x in (-0.09, 0.09):
    p.ajouter(boite(0.03, 0.26, 0.02, 0.008, 1), METAL(), loc=(x, 0.92, 0))
for x in (-0.03, 0.03):
    p.ajouter(boite(0.02, 0.2, 0.02, 0.006, 1), METAL(), loc=(x, 0.93, 0))
p.ajouter(boite(0.21, 0.035, 0.02, 0.008, 1), METAL(), loc=(0, 1.04, 0))
p.ajouter(boite(0.21, 0.04, 0.02, 0.008, 1), METAL(), loc=(0, 0.8, 0))
fin(p)

# ==================================================================== DELTAPLANES (origine aux pieds, voile vers 3 m)
Z = 3.0


def cadre(p, mat=None, prise=True):
    mt = mat or m('cadre', '#2c313b', 0.4, 0.5)
    p.ajouter(balayage([(0, 1.25, Z + 0.08), (0, -0.9, Z + 0.03)], 0.025, 8), mt)
    p.ajouter(balayage([(-1.5, -0.1, Z + 0.02), (1.5, -0.1, Z + 0.02)], 0.022, 8), mt)
    if prise:
        for s in (1, -1):
            p.ajouter(balayage([(0, 0.2, Z + 0.05), (0.45 * s, 0.45, 2.3)], 0.02, 6), mt)
        p.ajouter(balayage([(-0.47, 0.45, 2.3), (0.47, 0.45, 2.3)], 0.024, 8), m('grip', '#1d2026', 0.8))


DELTA = [(0.0, 1.45), (-2.0, -0.55), (-1.0, -0.72), (0.0, -0.85), (1.0, -0.72), (2.0, -0.55)]


def cambrure(v, h=0.22, z=Z + 0.06):
    return Vector((v.x, v.y, z + h * (1 - min(1.0, abs(v.x) / 2.0)) ** 1.3 - 0.06 * v.y))


p = Piece('deltaplane_classique')
for poly, coul in (([(0.0, 1.45), (-2.0, -0.55), (-1.0, -0.72), (0.0, -0.85)], '#2b6dff'),
                   ([(0.0, 1.45), (0.0, -0.85), (1.0, -0.72), (2.0, -0.55)], '#ffffff')):
    p.ajouter(plaque(poly, ep=0.03, cuts=3, deform=cambrure), m('voile_' + coul, coul, 0.6))
for s in (1, -1):
    pts = [cambrure(Vector((x * s, 1.45 - x, 0))) + Vector((0, 0, 0.02)) for x in (0.0, 0.5, 1.0, 1.5, 2.0)]
    p.ajouter(balayage(pts, 0.035, 8), m('jaune', '#ffd23f'))
cadre(p)
fin(p)

p = Piece('deltaplane_papier')
blanc_p = m('papier', '#fbfbf7', 0.7)


def pli(v):
    return Vector((v.x, v.y, Z + 0.1 + 0.18 * abs(v.x) / 1.8 - 0.03 * v.y))


for poly in ([(0.0, 1.6), (-1.8, -0.9), (0.0, -0.9)], [(0.0, 1.6), (0.0, -0.9), (1.8, -0.9)]):
    p.ajouter(plaque(poly, ep=0.02, cuts=2, deform=pli), blanc_p)
quille = bmesh.new()
vs = [quille.verts.new(c) for c in ((0, 1.6, Z + 0.1), (0, -0.9, Z + 0.1), (0, -0.9, Z - 0.25))]
quille.faces.new(vs)
epaissir(quille, 0.02)
p.ajouter(quille, blanc_p)
for s in (1, -1):
    p.ajouter(balayage([pli(Vector((0.6 * s, 1.6 - 0.6 * 2.5 / 1.8 * 1, 0))) + Vector((0, 0, 0.012)),
                        pli(Vector((0.6 * s, -0.9, 0))) + Vector((0, 0, 0.012))], 0.006, 4), m('pli', '#c9ccd6'))
cadre(p)
fin(p, 20)

p = Piece('deltaplane_feuille')
contour = []
for i in range(17):
    t = i / 16
    y = 1.5 - 3.0 * t
    w = 1.9 * math.sin(math.pi * t) ** 0.8
    contour.append((-w, y))
contour += [(-x, y) for (x, y) in reversed(contour[1:-1])]
contour = [(x, y) for (x, y) in contour]


def feuille(v):
    return Vector((v.x, v.y, Z + 0.06 + 0.12 * (v.x / 1.9) ** 2 - 0.05 * v.y))


p.ajouter(plaque(contour, ep=0.03, cuts=2, deform=feuille), m('feuille', '#47c13f', 0.6))
p.ajouter(balayage([feuille(Vector((0, y, 0))) + Vector((0, 0, 0.02)) for y in (1.45, 0.5, -0.5, -1.45)], 0.035, 8),
          m('nervure', '#9be36b', 0.6))
for y0 in (0.9, 0.3, -0.3, -0.9):
    for s in (1, -1):
        a = feuille(Vector((0, y0, 0))) + Vector((0, 0, 0.02))
        b2 = feuille(Vector((1.25 * s, y0 - 0.55, 0))) + Vector((0, 0, 0.02))
        p.ajouter(balayage([a, (a + b2) / 2, b2], [0.02, 0.014, 0.006], 6), m('nervure', '#9be36b', 0.6))
p.ajouter(balayage([feuille(Vector((0, -1.45, 0))), Vector((0, -1.75, Z - 0.05)), Vector((0, -1.9, Z - 0.2))],
                   [0.04, 0.03, 0.02], 8), m('nervure', '#9be36b', 0.6))
cadre(p)
fin(p, 45)

p = Piece('deltaplane_arcenciel')
base = plaque(DELTA, ep=0, cuts=4, deform=cambrure)
couleurs = ('#ff3b3b', '#ff8a1f', '#ffd23f', '#3fc94a', '#2b6dff', '#8a3ffc')
bornes = [1.6, 0.9, 0.45, 0.05, -0.3, -0.6, -1.0]
for i, coul in enumerate(couleurs):
    bande = base.copy()
    couper(bande, (0, bornes[i], 0), (0, -1, 0), boucher=False)
    couper(bande, (0, bornes[i + 1], 0), (0, 1, 0), boucher=False)
    epaissir(bande, 0.03)
    p.ajouter(bande, m('arcenciel_' + coul, coul, 0.5))
base.free()
cadre(p)
fin(p)

p = Piece('deltaplane_parapluie')
N = 8
for i in range(N):
    b = bmesh.new()
    rangs = []
    for j in range(6):
        t = math.radians(90 * j / 5)
        r, z = math.cos(t), math.sin(t)
        ring = []
        for k in range(4):
            a = math.tau * (i + k / 3) / N
            rr = 1.35 * r * (1 + 0.06 * math.sin(math.pi * k / 3) * r)
            ring.append(b.verts.new((rr * math.cos(a), rr * math.sin(a), z * 0.55)))
        rangs.append(ring)
    for j in range(5):
        for k in range(3):
            b.faces.new((rangs[j][k], rangs[j][k + 1], rangs[j + 1][k + 1], rangs[j + 1][k]))
    bmesh.ops.remove_doubles(b, verts=b.verts, dist=1e-5)
    epaissir(b, 0.025)
    p.ajouter(b, m('parapluie_' + str(i % 2), '#ffd23f' if i % 2 else '#ff3fa4', 0.5), loc=(0, 0, Z - 0.05))
    a = math.tau * i / N
    p.ajouter(sphere(0.03, 6, 4), SOMBRE(), loc=(1.37 * math.cos(a), 1.37 * math.sin(a), Z - 0.05))
p.ajouter(cyl(0.025, 1.3, 10), SOMBRE(), loc=(0, 0, Z - 0.05 - 0.6 + 0.55))
p.ajouter(sphere(0.045, 8, 5), SOMBRE(), loc=(0, 0, Z + 0.53))
p.ajouter(tore(0.09, 0.025, 14, 8, 180, 360), m('parapluie_poignee', '#7a4a24', 0.6), loc=(0.09, 0, 2.3 - 0.0), rot=(90, 0, 0))
p.ajouter(cyl(0.03, 0.12, 10), m('parapluie_poignee', '#7a4a24', 0.6), loc=(0, 0, 2.36))
fin(p, 45)

p = Piece('deltaplane_tapis')


def vague(v):
    return Vector((v.x, v.y, Z + 0.05 + 0.08 * math.sin(v.y * 2.2) + 0.05 * (v.x / 0.8) ** 2))


p.ajouter(plaque([(-0.8, -1.2), (0.8, -1.2), (0.8, 1.2), (-0.8, 1.2)], ep=0.035, cuts=5, deform=vague), m('tapis', '#c81d4e', 0.8))
cadre_t = plaque([(-0.62, -1.0), (0.62, -1.0), (0.62, 1.0), (-0.62, 1.0)], ep=0.0, cuts=5,
                 deform=lambda v: vague(v) + Vector((0, 0, 0.008)))
p.ajouter(epaissir(cadre_t, 0.006), m('tapis_motif', '#ffc72c', 0.6))
p.ajouter(plaque([(-0.5, -0.88), (0.5, -0.88), (0.5, 0.88), (-0.5, 0.88)], ep=0.006, cuts=5,
                 deform=lambda v: vague(v) + Vector((0, 0, 0.012))), m('tapis', '#c81d4e', 0.8))
p.ajouter(cyl(0.25, 0.01, 20), m('tapis_centre', '#1f6fe0', 0.6), loc=vague(Vector((0, 0, 0))) + Vector((0, 0, 0.017)))
for y in (-1.2, 1.2):
    for i in range(7):
        x = -0.72 + i * 0.24
        p.ajouter(capsule(0.02, 0.12, 6, 1), m('tapis_motif', '#ffc72c', 0.6),
                  loc=vague(Vector((x, y, 0))) + Vector((0, 0.07 * (1 if y > 0 else -1), -0.02)),
                  rot=(90 if y < 0 else -90, 0, 0))
for (x, y) in ((-0.7, -1.1), (0.7, -1.1), (-0.7, 1.1), (0.7, 1.1)):
    p.ajouter(balayage([vague(Vector((x, y, 0))), (0.47 * (1 if x > 0 else -1), 0.45, 2.3)], 0.01, 5), m('corde', '#e8d39a', 0.9))
p.ajouter(balayage([(-0.5, 0.45, 2.3), (0.5, 0.45, 2.3)], 0.03, 8), m('bois_fonce', '#7a4a24', 0.75))
fin(p, 45)

p = Piece('deltaplane_pizza')
pz = [(0.0, 1.5), (-1.55, -0.7)] + [(1.55 * math.sin(math.radians(a)), -0.7 - 0.25 * math.cos(math.radians(a)))
                                     for a in range(-60, 61, 15)] + [(1.55, -0.7)]
pz = [(0.0, 1.5), (-1.55, -0.7)] + [(x, y) for (x, y) in pz[2:-1]] + [(1.55, -0.7)]


def pizza(v):
    return Vector((v.x, v.y, Z + 0.06 + 0.1 * (1 - abs(v.x) / 1.6) - 0.03 * v.y))


p.ajouter(plaque(pz, ep=0.05, cuts=3, deform=pizza), m('fromage', '#ffd34d', 0.5))
croute = [pizza(Vector((x, y, 0))) + Vector((0, 0, 0.0)) for (x, y) in pz[1:]]
p.ajouter(balayage(croute, 0.11, 10), m('croute', '#e0a050', 0.7))
for (x, y) in ((0.0, 0.6), (-0.5, -0.1), (0.55, -0.05), (0.0, -0.45), (-0.95, -0.45), (0.95, -0.4), (0.2, 0.15)):
    p.ajouter(cyl(0.17 if y < 0.5 else 0.13, 0.02, 16), m('pepperoni', '#d63a2f', 0.5), loc=pizza(Vector((x, y, 0))) + Vector((0, 0, 0.011)))
cadre(p)
fin(p)

p = Piece('deltaplane_chauvesouris')
bat = [(0.0, 0.85), (-0.5, 0.55), (-2.1, 0.35), (-1.55, -0.1), (-1.7, -0.35), (-1.25, -0.35), (-1.0, -0.62),
       (-0.7, -0.45), (-0.4, -0.7), (0.0, -0.45), (0.4, -0.7), (0.7, -0.45), (1.0, -0.62), (1.25, -0.35),
       (1.7, -0.35), (1.55, -0.1), (2.1, 0.35), (0.5, 0.55)]


def aile(v, h=0.25):
    return Vector((v.x, v.y, Z + 0.05 + h * (1 - min(1.0, abs(v.x) / 2.1)) ** 1.2))


p.ajouter(plaque(bat, ep=0.025, cuts=2, deform=aile), m('chauvesouris', '#3b2152', 0.6))
for s in (1, -1):
    for (x, y) in ((2.1, 0.35), (1.7, -0.35), (1.0, -0.62), (0.4, -0.7)):
        p.ajouter(balayage([aile(Vector((0.25 * s, 0.3, 0))), aile(Vector((x * s, y, 0)))], [0.035, 0.01], 6),
                  m('os_aile', '#1e1228', 0.6), loc=(0, 0, 0.02))
p.ajouter(sphere(0.13, 12, 8), m('chauvesouris', '#3b2152', 0.6), loc=(0, 0.88, Z + 0.25))
for s in (1, -1):
    p.ajouter(cone(0.05, 0.12, 6), m('chauvesouris', '#3b2152', 0.6), loc=(0.07 * s, 0.86, Z + 0.4), rot=(0, -15 * s, 0))
    p.ajouter(sphere(0.022, 8, 5), m('yeux_rouges', '#ff2b2b', 0.3, 0.0, 2.5), loc=(0.05 * s, 0.995, Z + 0.27))
cadre(p, prise=True)
fin(p, 35)

p = Piece('deltaplane_dragon')
p.ajouter(plaque(bat, ep=0.03, cuts=2, deform=lambda v: aile(v, 0.32)), m('dragon', '#d6282b', 0.55))
for s in (1, -1):
    for (x, y) in ((2.1, 0.35), (1.7, -0.35), (1.0, -0.62), (0.4, -0.7)):
        p.ajouter(balayage([aile(Vector((0.25 * s, 0.3, 0)), 0.32), aile(Vector((x * s, y, 0)), 0.32)], [0.04, 0.012], 6),
                  OR(), loc=(0, 0, 0.025))
tete = Vector((0, 1.0, Z + 0.32))
p.ajouter(sphere(0.17, 14, 8, ech=(1, 1.1, 0.9)), m('dragon', '#d6282b', 0.55), loc=tete)
p.ajouter(boite(0.18, 0.22, 0.12, 0.05, 2), m('dragon', '#d6282b', 0.55), loc=tete + Vector((0, 0.2, -0.03)))
for s in (1, -1):
    p.ajouter(cone(0.04, 0.2, 8), OR(), loc=tete + Vector((0.08 * s, -0.08, 0.15)), rot=(-50, 15 * s, 0))
    p.ajouter(sphere(0.03, 8, 5), m('yeux_dragon', '#ffe03a', 0.3, 0.0, 2.5), loc=tete + Vector((0.08 * s, 0.13, 0.06)))
    p.ajouter(sphere(0.015, 6, 4), SOMBRE(), loc=tete + Vector((0.045 * s, 0.31, 0.0)))
queue = [Vector((0, -0.4, Z + 0.1)), Vector((0, -0.9, Z + 0.05)), Vector((0, -1.4, Z - 0.1)), Vector((0, -1.8, Z - 0.35))]
p.ajouter(balayage(queue, [0.09, 0.07, 0.045, 0.02], 8), m('dragon', '#d6282b', 0.55))
p.ajouter(cone(0.12, 0.2, 4), OR(), loc=queue[-1] + Vector((0, -0.08, -0.06)), rot=(120, 0, 0), ech=(1, 0.25, 1))
cadre(p)
fin(p, 35)

p = Piece('deltaplane_ecran2k27')
ecran = [(0.0, 1.35), (-1.9, -0.45), (-1.7, -0.75), (1.7, -0.75), (1.9, -0.45)]
plat = lambda v: Vector((v.x, v.y, Z + 0.08 - 0.03 * v.y))
p.ajouter(plaque(ecran, ep=0.06, cuts=1, deform=plat), NUIT())
bord = [plat(Vector((x, y, 0))) + Vector((0, 0, 0.0)) for (x, y) in ecran + [ecran[0]]]
moitie = len(bord) // 2 + 1
p.ajouter(balayage(bord[:moitie], 0.035, 8), NEON_C())
p.ajouter(balayage(bord[moitie - 1:], 0.035, 8), NEON_R())
dessus = texte('2K27', 0.62, 0.02, 0.008, debout=False)
p.ajouter(dessus, NEON_V(), loc=(0, -0.2, Z + 0.086 + 0.011), rot=(-1.7, 0, 0))
dessous = texte('2K27', 0.62, 0.02, 0.008, debout=False)
bmesh.ops.rotate(dessous, verts=dessous.verts, cent=(0, 0, 0), matrix=Matrix.Rotation(math.pi, 3, 'Y'))
p.ajouter(dessous, NEON_V(), loc=(0, -0.2, Z + 0.026 - 0.011), rot=(-1.7, 0, 0))
cadre(p, NUIT())
fin(p)

# ==================================================================== bilan, export
print('--- BILAN cosmetiques ---', len(racines), 'objets')
O.bilan(racines)
O.exporter('cosmetiques.glb', racines)
O.sauver('cosmetiques.blend')

# ==================================================================== rendus de contrôle sur le perso
bpy.ops.import_scene.gltf(filepath=os.path.join(O.MODELES, 'personnage.glb'))
perso = {o.name: o for o in bpy.context.scene.objects if o.type == 'MESH' and o.name.split('.')[0] in (
    'bassin', 'torse', 'cuisse_G', 'cuisse_D', 'tibia_G', 'tibia_D', 'bras_G', 'bras_D', 'avantbras_G',
    'avantbras_D', 'tete', 'cheveux_0', 'cheveux_1', 'cheveux_2', 'cheveux_3', 'cheveux_4')}
corps = [o for n, o in perso.items() if not n.startswith('cheveux')]
for o in list(perso.values()) + racines:
    o.hide_render = True
nom = {r.name: r for r in racines}


def vitrine(prefixe, colonnes, pas, avec, origine, direction, fichier, taille, ortho=False, cheveux='cheveux_2'):
    objs = [r for r in racines if r.name.startswith(prefixe)]
    vu = []
    for i, o in enumerate(objs):
        gx, gy = (i % colonnes) * pas[0], -(i // colonnes) * pas[1]
        if avec == 'tete':
            vu += O.copier([perso['tete'], perso[cheveux]], (gx, gy, 0), 0)
        elif avec == 'corps':
            vu += O.copier(corps + [perso[cheveux]], (gx, gy, 0), 0)
        vu += O.copier([o], (gx + origine[0], gy + origine[1], origine[2]), 0)
    O.rendu(fichier, objets=vu, direction=direction, taille=taille, ortho=ortho)
    for o in vu:
        o.hide_render = True


vitrine('chapeau_', 6, (0.55, 0.65), 'tete', (0, 0, 1.86), (0.35, 1, 0.35), 'cosmetiques_chapeaux.png', (1600, 900), True, 'cheveux_2')
vitrine('dos_', 5, (1.2, 1.6), 'corps', (0, -0.13, 1.35), (0.5, -1, 0.3), 'cosmetiques_dos.png', (1600, 1000))
pi = [r for r in racines if r.name.startswith('pioche_')]
vu = []
for i, o in enumerate(pi):
    vu += O.copier([o], (0, (i // 7) * 1.5, -(i % 7) * 0.62), 0)
O.rendu('cosmetiques_pioches.png', objets=vu, direction=(1, 0, 0.1), taille=(1100, 1300))
for o in vu:
    o.hide_render = True
vitrine('deltaplane_', 5, (5.0, 5.2), 'corps', (0, 0, 0), (0.3, 1, 0.75), 'cosmetiques_deltaplanes.png', (1600, 1000), cheveux='cheveux_0')
vitrine('deltaplane_ecran', 1, (5, 5), 'corps', (0, 0, 0), (0.2, 0.6, -0.7), 'cosmetiques_deltaplane_dessous.png', (1000, 700), cheveux='cheveux_0')
