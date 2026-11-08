# Natx Royale — personnage.glb : un héros cartoon de 2 m en morceaux séparés (pas d'armature).
# Lancer : blender.exe -b --factory-startup --python construire_personnage.py
import sys, os, math
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import outils as O
from outils import Piece, tube, boite, cyl, sphere, capsule, tore, cone, ico, rot_vers
import bmesh, bpy
from mathutils import Vector

O.nouvelle_scene()
M = dict(
    peau=O.mat('peau', '#f0b48a', 0.6),
    haut=O.mat('haut', '#2f7dff', 0.55),
    bas=O.mat('bas', '#263457', 0.6),
    pieds=O.mat('pieds', '#ff6a2b', 0.45),
    semelle=O.mat('semelle', '#f4f4f4', 0.5),
    mains=O.mat('mains', '#f0b48a', 0.6),
    cheveux=O.mat('cheveux', '#5b3622', 0.6),
    yeux=O.mat('yeux', '#ffffff', 0.25),
    pupille=O.mat('pupille', '#1a1f2e', 0.2),
    bouche=O.mat('bouche', '#8c2f39', 0.5),
    ceinture=O.mat('ceinture', '#1d1f26', 0.5),
    boucle=O.mat('boucle', '#ffcc33', 0.3, 0.6),
)
racines = []

# ------------------------------------------------------------------ bassin (origine 0,0,0)
p = Piece('bassin')
p.ajouter(tube([
    (0.905, 0.09, 0.07, 0, 0.0),
    (0.94, 0.15, 0.11, 0, 0.0),
    (0.99, 0.168, 0.122, 0, -0.004),
    (1.04, 0.17, 0.122, 0, -0.004),
    (1.09, 0.166, 0.118, 0, 0.0),
    (1.13, 0.16, 0.112, 0, 0.0),
], cotes=20), M['bas'])
p.ajouter(tube([(1.07, 0.176, 0.128), (1.115, 0.174, 0.126)], cotes=20, uv=False), M['ceinture'])
p.ajouter(boite(0.07, 0.02, 0.052, 0.008), M['boucle'], loc=(0, 0.129, 1.092))
racines.append(p.objet())

# ------------------------------------------------------------------ torse + cou (origine 0,0,0)
p = Piece('torse')
p.ajouter(tube([
    (1.09, 0.160, 0.112),
    (1.15, 0.166, 0.116, 0, 0.002),
    (1.23, 0.184, 0.124, 0, 0.006),
    (1.32, 0.212, 0.136, 0, 0.012),
    (1.41, 0.240, 0.146, 0, 0.018),
    (1.48, 0.258, 0.146, 0, 0.016),
    (1.545, 0.264, 0.138, 0, 0.008),
    (1.59, 0.250, 0.124, 0, 0.0),
    (1.62, 0.205, 0.108, 0, -0.006),
    (1.645, 0.145, 0.094, 0, -0.008),
    (1.665, 0.080, 0.072, 0, -0.008),
], cotes=20), M['haut'])
p.ajouter(tube([(1.62, 0.078, 0.072, 0, -0.008), (1.71, 0.068, 0.064, 0, -0.004), (1.80, 0.062, 0.06, 0, 0.0)],
               cotes=14, uv=False), M['peau'])
racines.append(p.objet())


# ------------------------------------------------------------------ jambes
def cuisse(s):
    p = Piece('cuisse_' + ('D' if s > 0 else 'G'))
    p.ajouter(tube([
        (-0.50, 0.064, 0.068),
        (-0.44, 0.071, 0.076),
        (-0.33, 0.087, 0.095, 0.002 * s, 0.005),
        (-0.19, 0.099, 0.109, 0.004 * s, 0.009),
        (-0.06, 0.103, 0.112, 0.005 * s, 0.004),
        (0.03, 0.100, 0.106),
        (0.065, 0.070, 0.074),
    ], cotes=16), M['bas'])
    return p.objet(loc=(0.11 * s, 0, 1.00))


def tibia(s):
    p = Piece('tibia_' + ('D' if s > 0 else 'G'))
    p.ajouter(tube([
        (-0.405, 0.047, 0.049),
        (-0.36, 0.048, 0.050),
        (-0.28, 0.058, 0.061, 0, -0.002),
        (-0.17, 0.073, 0.079, 0, -0.011),
        (-0.08, 0.076, 0.080, 0, -0.008),
        (0.0, 0.069, 0.072),
        (0.04, 0.056, 0.058),
    ], cotes=16), M['bas'])
    # chaussure : 0,32 m de long, 0,12 m de haut, le sol en z = -0,52 (local)
    p.ajouter(boite(0.136, 0.318, 0.036, 0.016), M['semelle'], loc=(0.004 * s, 0.068, -0.502))
    p.ajouter(boite(0.13, 0.30, 0.094, 0.036, 2), M['pieds'], loc=(0.004 * s, 0.066, -0.448))
    p.ajouter(sphere(0.064, 12, 6, ech=(1.0, 0.95, 0.68)), M['pieds'], loc=(0.004 * s, 0.155, -0.455))
    p.ajouter(cyl(0.061, 0.06, 12, b=0.012, seg=1), M['pieds'], loc=(0, -0.012, -0.39))
    p.ajouter(boite(0.064, 0.13, 0.014, 0.004, 1), M['semelle'], loc=(0.004 * s, 0.085, -0.398), rot=(-16, 0, 0))
    p.ajouter(boite(0.142, 0.06, 0.04, 0.01, 1), M['semelle'], loc=(0.004 * s, -0.072, -0.462))
    return p.objet(loc=(0.11 * s, 0, 0.52))


# ------------------------------------------------------------------ bras
def bras(s):
    p = Piece('bras_' + ('D' if s > 0 else 'G'))
    p.ajouter(tube([
        (-0.345, 0.047, 0.048),
        (-0.30, 0.052, 0.054),
        (-0.22, 0.057, 0.062, 0, 0.004),
        (-0.14, 0.060, 0.070, 0, 0.008),
        (-0.07, 0.063, 0.071, 0.002 * s, 0.004),
        (-0.01, 0.064, 0.070, 0.002 * s, 0.0),
        (0.030, 0.058, 0.062, 0.001 * s, 0.0),
        (0.052, 0.046, 0.050),
        (0.066, 0.028, 0.030),
        (0.071, 0.010, 0.010),
    ], cotes=16), M['haut'])
    return p.objet(loc=(0.25 * s, 0, 1.56))


def avantbras(s):
    p = Piece('avantbras_' + ('D' if s > 0 else 'G'))
    p.ajouter(tube([
        (-0.275, 0.040, 0.038),
        (-0.23, 0.044, 0.042),
        (-0.15, 0.052, 0.050),
        (-0.07, 0.059, 0.057),
        (0.0, 0.056, 0.056),
        (0.04, 0.042, 0.042),
    ], cotes=16), M['haut'])
    # main (un peu plus grosse que nature) : paume tournée vers le corps, pouce vers l'avant,
    # doigts serrés qui finissent 0,44 m sous le coude
    p.ajouter(boite(0.066, 0.114, 0.122, 0.027), M['mains'], loc=(0, 0.004, -0.318))
    d = Vector((-s * math.sin(math.radians(12)), 0, -math.cos(math.radians(12))))
    for y, lg in ((0.041, 0.078), (0.0137, 0.083), (-0.0137, 0.080), (-0.041, 0.070)):
        p.ajouter(capsule(0.0168, lg, cotes=8, demi=2), M['mains'], loc=(-0.005 * s, y, -0.36), rot=rot_vers(d))
    p.ajouter(capsule(0.02, 0.075, cotes=8, demi=2), M['mains'], loc=(-0.016 * s, 0.05, -0.29),
              rot=rot_vers((-0.3 * s, 0.5, -0.81)))
    return p.objet(loc=(0.25 * s, 0, 1.24))


for s in (-1, 1):
    racines += [cuisse(s), tibia(s), bras(s), avantbras(s)]

# ------------------------------------------------------------------ tête (origine au centre, à 1,86 m)
TETE = [
    (-0.138, 0.024, 0.020, 0, 0.050),
    (-0.130, 0.050, 0.045, 0, 0.052),
    (-0.112, 0.072, 0.075, 0, 0.040),
    (-0.085, 0.088, 0.098, 0, 0.022),
    (-0.050, 0.097, 0.110, 0, 0.010),
    (-0.010, 0.103, 0.116, 0, 0.004),
    (0.030, 0.106, 0.118, 0, 0.000),
    (0.070, 0.104, 0.116, 0, -0.004),
    (0.100, 0.095, 0.108, 0, -0.008),
    (0.125, 0.077, 0.088, 0, -0.010),
    (0.140, 0.048, 0.056, 0, -0.010),
    (0.147, 0.020, 0.022, 0, -0.010),
]
p = Piece('tete')
p.ajouter(tube(TETE, cotes=20, uv=False), M['peau'])
p.ajouter(sphere(0.026, 10, 6, ech=(1.0, 0.55, 1.2)), M['yeux'], loc=(0.040, 0.101, 0.012), sym=True)
p.ajouter(sphere(0.012, 8, 5, ech=(1.0, 0.5, 1.25)), M['pupille'], loc=(0.037, 0.1145, 0.010), sym=True)
p.ajouter(boite(0.05, 0.016, 0.014, 0.006, 1), M['cheveux'], loc=(0.045, 0.111, 0.056), rot=(0, 8, 0), sym=True)
p.ajouter(sphere(0.02, 8, 5, ech=(0.85, 1.0, 1.15)), M['peau'], loc=(0, 0.119, -0.018))
p.ajouter(tore(0.028, 0.006, 10, 5, 212, 328), M['bouche'], loc=(0, 0.117, -0.052), rot=(90, 0, 0))
p.ajouter(sphere(0.032, 8, 5, ech=(0.4, 0.75, 1.0)), M['peau'], loc=(0.103, -0.008, 0.0), sym=True)
racines.append(p.objet(loc=(0, 0, 1.86)))


# ------------------------------------------------------------------ 5 coiffures (origine au centre de la tête)
def calotte(av=0.085, ar=-0.04, ep=0.009, gonfle=1.035, cotes=18):
    """Coque de cheveux qui épouse le crâne ; ligne des cheveux à z=av devant et z=ar derrière."""
    an = [(z * 1.03 + 0.004, rx * gonfle + 0.002, ry * gonfle + 0.002, cx, cy)
          for (z, rx, ry, cx, cy) in TETE if z >= -0.09]
    bm = tube(an, cotes=cotes, uv=False, ferme_bas=False)
    k = (av - ar) / 0.25
    O.couper(bm, (0, 0, (av + ar) / 2), (0, -k, 1), boucher=False)
    O.epaissir(bm, ep)
    return bm


def coiffure(n):
    p = Piece(f'cheveux_{n}')
    c = M['cheveux']
    if n == 0:  # courte à pointes
        p.ajouter(calotte(0.085, -0.045), c)
        for (a, b, h) in ((0, 70, 0.09), (35, 55, 0.08), (-35, 55, 0.08), (0, 40, 0.085), (60, 30, 0.07),
                          (-60, 30, 0.07), (25, 15, 0.075), (-25, 15, 0.075), (0, 5, 0.08), (90, 10, 0.06),
                          (-90, 10, 0.06)):
            az, el = math.radians(a), math.radians(b)
            d = Vector((math.sin(az) * math.cos(el), math.cos(az) * math.cos(el) * 0.6 - 0.35, math.sin(el) + 0.25))
            d.normalize()
            pos = Vector((d.x * 0.10, d.y * 0.11, d.z * 0.12 + 0.02))
            p.ajouter(cone(0.038, h, 8), c, loc=pos + d * (h * 0.35), rot=rot_vers(d))
    elif n == 1:  # grande mèche sur le côté
        p.ajouter(calotte(0.095, -0.05), c)
        for i, (x, y, z, rz, l) in enumerate(((0.05, 0.08, 0.13, -60, 0.10), (0.0, 0.095, 0.12, -70, 0.11),
                                               (-0.05, 0.09, 0.11, -80, 0.10), (0.03, 0.03, 0.155, -40, 0.11))):
            p.ajouter(sphere(0.05, 10, 6, ech=(1.0, l / 0.05 * 0.5, 0.42)), c, loc=(x, y, z), rot=(-15, 10, rz))
        p.ajouter(sphere(0.04, 8, 6, ech=(0.55, 0.6, 1.3)), c, loc=(-0.075, 0.095, 0.075), rot=(0, -20, 0))
        p.ajouter(boite(0.018, 0.03, 0.06, 0.007), c, loc=(0.108, 0.025, 0.02), sym=True)
    elif n == 2:  # queue de cheval
        p.ajouter(calotte(0.08, -0.035), c)
        p.ajouter(tore(0.032, 0.012, 14, 6), M['haut'], loc=(0, -0.128, 0.045), rot=(80, 0, 0))
        p.ajouter(tube([(-0.30, 0.008, 0.008, 0, -0.2), (-0.25, 0.03, 0.026, 0, -0.205),
                        (-0.16, 0.048, 0.042, 0, -0.2), (-0.07, 0.055, 0.048, 0, -0.185),
                        (0.0, 0.048, 0.044, 0, -0.165), (0.045, 0.034, 0.032, 0, -0.14),
                        (0.065, 0.02, 0.02, 0, -0.13)], cotes=12, uv=False), c)
        p.ajouter(sphere(0.035, 10, 6, ech=(0.6, 0.7, 1.6)), c, loc=(0.088, 0.075, 0.03), rot=(0, 12, 0), sym=True)
    elif n == 3:  # frisée volumineuse
        p.ajouter(calotte(0.09, -0.07, ep=0.016), c)
        for (x, y, z, r) in ((0, 0.04, 0.15, 0.06), (0.07, 0.03, 0.13, 0.055), (-0.07, 0.03, 0.13, 0.055),
                             (0.045, -0.05, 0.15, 0.06), (-0.045, -0.05, 0.15, 0.06), (0.1, -0.03, 0.07, 0.052),
                             (-0.1, -0.03, 0.07, 0.052), (0.0, -0.11, 0.09, 0.06), (0.07, -0.1, 0.02, 0.05),
                             (-0.07, -0.1, 0.02, 0.05), (0.0, 0.085, 0.115, 0.045), (0.0, -0.12, -0.0, 0.05)):
            p.ajouter(ico(r, 1), c, loc=(x, y, z))
    elif n == 4:  # crête
        p.ajouter(calotte(0.085, -0.06, ep=0.008, gonfle=1.06), c)
        for i, (y, z, h) in enumerate(((0.09, 0.115, 0.08), (0.05, 0.15, 0.10), (0.0, 0.16, 0.11),
                                       (-0.05, 0.148, 0.10), (-0.095, 0.115, 0.085), (-0.125, 0.065, 0.065))):
            d = Vector((0, -0.35 - y * 1.5, 1.0)).normalized()
            p.ajouter(cone(0.042, h, 8), c, loc=Vector((0, y, z)) + d * h * 0.3, rot=rot_vers(d), ech=(0.38, 1, 1))
    return p.objet(loc=(0, 0, 1.86))


coiffures = [coiffure(n) for n in range(5)]
racines += coiffures

# ------------------------------------------------------------------ bilan, export
print('--- BILAN personnage ---')
O.bilan(racines)
corps = [r for r in racines if not r.name.startswith('cheveux')]
tot = sum(O.triangles(r) for r in corps)
print('TOTAL corps + tête :', tot, '| avec la coiffure la plus lourde :', tot + max(O.triangles(c) for c in coiffures))
O.exporter('personnage.glb', racines)
O.sauver('personnage.blend')

# ------------------------------------------------------------------ rendus de contrôle
for c in coiffures[1:]:
    c.hide_render = True
# 1) proportions : face, profil, cube de 2 m
cube = Piece('cube_2m')
cube.ajouter(boite(2, 2, 2, 0.01), O.mat('gris_ref', '#9aa3b5', 0.8), loc=(0, 0, 1))
cube = cube.objet(loc=(-1.75, -1.2, 0))
vis = corps + [coiffures[0]]
profil = O.copier(vis, (1.1, 0, 0), -90)
O.rendu('personnage_proportions.png', objets=vis + profil + [cube], direction=(0, 1, 0), taille=(1500, 900))
for o in profil + [cube]:
    o.hide_render = True
# 2) les 5 coiffures, vue de 3/4
for o in vis:
    o.hide_render = True
vitrine = []
for n in range(5):
    vitrine += O.copier(corps + [coiffures[n]], ((n - 2) * 0.85, 0, 0), 0)
O.rendu('personnage_coiffures.png', objets=vitrine, direction=(0.55, 1, 0.3), taille=(1600, 800), ortho=False)
for o in vitrine:
    o.hide_render = True
# 3) gros plan sur la tête et les mains
nom = {r.name: r for r in racines}
gros = O.copier([nom['tete'], coiffures[1]], (0, 0, 0), 0) + O.copier([nom['avantbras_D']], (0.32, 0.05, 0.75), -60)
O.rendu('personnage_tete.png', objets=gros, direction=(0.45, 1, 0.12), taille=(1000, 800), ortho=False)
for o in gros:
    o.hide_render = True

# 4) test des UV (après la sauvegarde) : moitié rouge / moitié bleue, trait blanc à U = 0,5, bandes en V
img = bpy.data.images.new('uv_test', 64, 64)
px = []
for y in range(64):
    for x in range(64):
        u, v = (x + 0.5) / 64, (y + 0.5) / 64
        c = (1, 1, 1) if abs(u - 0.5) < 0.035 else ((1, 0.25, 0.2) if u < 0.5 else (0.2, 0.45, 1))
        if int(v * 8) % 2 == 0:
            c = tuple(k * 0.55 for k in c)
        px += [*c, 1.0]
img.pixels = px
for nm in ('haut', 'bas'):
    m = M[nm]
    t = m.node_tree.nodes.new('ShaderNodeTexImage')
    t.image = img
    t.interpolation = 'Closest'
    bsdf = next(n for n in m.node_tree.nodes if n.type == 'BSDF_PRINCIPLED')
    m.node_tree.links.new(t.outputs['Color'], bsdf.inputs['Base Color'])
face = O.copier(vis, (0, 0, 0), 0)
dos = O.copier(vis, (1.0, 0, 0), 180)
O.rendu('personnage_uv.png', objets=face + dos, direction=(0, 1, 0.1), taille=(1200, 900))
