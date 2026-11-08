# Natx Royale — decor.glb : arbres, rochers, objets de décor, dirigeable, trampoline, fontaine.
# Origine au pied de chaque objet (au sol), sauf le dirigeable (centre du ballon) et le bateau (ligne de flottaison).
# Lancer : blender.exe -b --factory-startup --python construire_decor.py
import sys, os, math, random
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import outils as O
from outils import Piece, boite, cyl, cone, sphere, ico, tore, tube, capsule, rot_vers, texte
import bpy, bmesh
from mathutils import Vector, Matrix, noise

O.nouvelle_scene()
TRONC = O.mat('tronc', '#8a5530', 0.85)
FEUIL = O.mat('feuillage', '#3fae4a', 0.7)
M = dict(
    rocher=O.mat('rocher', '#9ba4b0', 0.85),
    buisson=O.mat('buisson', '#2f9e44', 0.75),
    baies=O.mat('baies', '#ff3d5a', 0.4),
    cj=O.mat('couleur_joueur', '#ff3f6c', 0.4, 0.1),
    vitre=O.mat('vitre', '#9fe8ff', 0.1, 0.1, 0.3),
    pneu=O.mat('pneu', '#1d2026', 0.85),
    jante=O.mat('jante', '#d9dee6', 0.3, 0.8),
    phare=O.mat('phare', '#fff4c2', 0.2, 0.0, 2.0),
    feu_ar=O.mat('feu_arriere', '#ff2b2b', 0.3, 0.0, 1.5),
    sombre=O.mat('gris_fonce', '#2c313b', 0.5, 0.3),
    bois=O.mat('bois_clair', '#d39a55', 0.8),
    bois_f=O.mat('bois_fonce', '#9b6232', 0.8),
    fer=O.mat('fer', '#5c6470', 0.45, 0.6),
    lumiere=O.mat('lumiere', '#fff1a8', 0.2, 0.0, 4.0),
    blanc=O.mat('blanc', '#f6f6f8', 0.5),
    coque=O.mat('coque', '#ff5a3c', 0.45),
    violet=O.mat('dirigeable', '#7b3cff', 0.5),
    cyan=O.mat('dirigeable_bandes', '#22e8ff', 0.45, 0.0, 0.3),
    rose=O.mat('champignon', '#ff3fa4', 0.45),
    tige=O.mat('pied_champignon', '#fff1d6', 0.6),
    taches=O.mat('taches_lumineuses', '#7ff6ff', 0.3, 0.0, 1.2),
    pierre=O.mat('pierre_fontaine', '#dfe3ea', 0.7),
    pierre_f=O.mat('pierre_fontaine_fonce', '#a9b1bf', 0.75),
    eau=O.mat('eau_soin', '#3dffb0', 0.1, 0.0, 1.0),
)
racines = []
random.seed(27)


def bosseler(bm, force=0.12, echelle=1.5, graine=0.0):
    """Déforme un peu les sommets (bruit) pour un aspect rocher / buisson irrégulier."""
    for v in bm.verts:
        n = noise.noise(v.co * echelle + Vector((graine, graine * 2, graine * 3)))
        v.co += v.co.normalized() * n * force * v.co.length
    return bm


# ================================================================== arbres (2 matériaux : tronc, feuillage)
def sapin(nom, neige=False):
    p = Piece(nom)
    p.ajouter(cyl(0.24, 1.5, 10, r2=0.16, b=0.05, seg=1), TRONC, loc=(0, 0, 0.75))
    p.ajouter(cyl(0.3, 0.2, 10, r2=0.24, b=0.05, seg=1), TRONC, loc=(0, 0, 0.1))
    etages = ((1.65, 1.5, 1.7), (1.35, 1.35, 2.75), (1.05, 1.2, 3.7), (0.7, 1.05, 4.55))
    for i, (r, h, z) in enumerate(etages):
        if neige:   # étages plus ronds et gonflés, sommet arrondi : sapin couvert de neige
            p.ajouter(cyl(r * 1.05, h, 12, r2=r * 0.22, b=0.32, seg=2), FEUIL, loc=(0, 0, z), rot=(0, 0, i * 17))
        elif i < 3:
            p.ajouter(cyl(r, h, 12, r2=r * 0.12, b=0.14, seg=2), FEUIL, loc=(0, 0, z), rot=(0, 0, i * 17))
        else:
            p.ajouter(cone(r, h * 1.15, 12), FEUIL, loc=(0, 0, z + 0.08))
    if neige:
        p.ajouter(sphere(0.32, 10, 6), FEUIL, loc=(0, 0, 5.15))
    return p.objet(lisse=50)


def feuillu():
    p = Piece('feuillu')
    p.ajouter(tube([(0.0, 0.34, 0.34), (0.15, 0.27, 0.27), (1.2, 0.2, 0.2, 0.03), (2.4, 0.17, 0.17, 0.08),
                    (3.2, 0.14, 0.14, 0.05)], cotes=10, uv=False), TRONC)
    for (d, z, l) in (((0.8, 0.2, 0.7), 2.3, 1.2), ((-0.7, -0.4, 0.8), 2.6, 1.0)):
        d = Vector(d).normalized()
        p.ajouter(cyl(0.1, l, 8, r2=0.06), TRONC, loc=Vector((0, 0, z)) + d * l / 2, rot=rot_vers(d))
    for (x, y, z, r) in ((0, 0, 4.0, 1.55), (1.15, 0.35, 3.45, 1.1), (-1.05, -0.45, 3.6, 1.15),
                         (0.3, -1.0, 3.35, 1.0), (-0.25, 1.0, 3.5, 1.05), (0.15, 0.1, 5.0, 0.95)):
        p.ajouter(bosseler(sphere(r, 12, 8), 0.08, 1.2, x + z), FEUIL, loc=(x, y, z))
    return p.objet(lisse=55)


def palmier():
    p = Piece('palmier')
    an = []
    for i in range(17):
        z = i * 0.34
        courbe = 0.06 * z * z / 5.5 * 5.5 * 0.18
        r = (0.24 if i % 2 == 0 else 0.205) * (1 - z / 14)
        an.append((z, r, r, courbe, 0))
    p.ajouter(tube(an, cotes=8, uv=False), TRONC)
    sommet = Vector((an[-1][3], 0, an[-1][0]))
    for i in range(3):
        a = math.radians(120 * i + 30)
        p.ajouter(sphere(0.17, 8, 5), TRONC, loc=sommet + Vector((math.cos(a) * 0.2, math.sin(a) * 0.2, -0.22)))
    for i in range(7):
        a = math.radians(360 / 7 * i + 10)
        b = bmesh.new()
        n = 7
        lg = 2.6 + 0.3 * (i % 2)
        rangs = []
        for j in range(n + 1):
            t = j / n
            x = t * lg
            z = 0.55 * t - 1.3 * t * t          # retombe en arc
            w = 0.38 * math.sin(math.pi * min(1.0, t * 1.15 + 0.05)) + 0.02
            pli = 0.12 * w
            rangs.append([b.verts.new((x, -w, z - pli)), b.verts.new((x, 0, z)), b.verts.new((x, w, z - pli))])
        for j in range(n):
            for k in range(2):
                b.faces.new((rangs[j][k], rangs[j + 1][k], rangs[j + 1][k + 1], rangs[j][k + 1]))
        bmesh.ops.solidify(b, geom=b.faces[:], thickness=0.05)
        p.ajouter(b, FEUIL, loc=sommet + Vector((0, 0, 0.05)), rot=(0, -8, math.degrees(a)))
    return p.objet(lisse=50)


def cactus():
    p = Piece('cactus')

    def cotele(bm, n=16):
        for v in bm.verts:
            r = math.hypot(v.co.x, v.co.y)
            if r < 1e-4:
                continue
            k = round(math.atan2(v.co.x, v.co.y) / (math.tau / n))
            if k % 2 == 0:
                v.co.x *= 1.1
                v.co.y *= 1.1
        return bm
    p.ajouter(cotele(capsule(0.36, 2.7, cotes=16, demi=3)), FEUIL)
    for s, z0, h in ((1, 1.1, 0.95), (-1, 1.5, 0.7)):
        p.ajouter(cyl(0.2, 0.55, 12, b=0.0), FEUIL, loc=(0.42 * s, 0, z0), rot=(0, 90, 0))
        p.ajouter(cotele(capsule(0.22, h, cotes=16, demi=2)), FEUIL, loc=(0.68 * s, 0, z0 - 0.15))
    return p.objet(lisse=50)


racines += [sapin('sapin'), sapin('sapin_neige', True), feuillu(), palmier(), cactus()]


# ================================================================== rochers et buisson
def rocher(nom, blocs, graine):
    p = Piece(nom)
    for (x, y, z, sx, sy, sz) in blocs:
        bm = ico(1.0, 3)
        bosseler(bm, 0.2, 1.1, graine + x * 3 + z)
        p.ajouter(bm, M['rocher'], loc=(x, y, z), ech=(sx, sy, sz))
    return p.objet(lisse=28)


racines.append(rocher('rocher_1', [(0, 0, 0.42, 0.75, 0.62, 0.55)], 1.0))
racines.append(rocher('rocher_2', [(-0.45, 0, 0.42, 0.95, 0.8, 0.55), (0.6, 0.15, 0.32, 0.7, 0.65, 0.42)], 2.0))
racines.append(rocher('rocher_3', [(0, 0, 0.75, 0.7, 0.62, 0.95), (0.1, 0.05, 1.85, 0.45, 0.42, 0.65)], 3.0))

p = Piece('buisson')
for (x, y, z, r) in ((0, 0, 0.55, 0.62), (0.5, 0.15, 0.42, 0.45), (-0.48, -0.1, 0.42, 0.48), (0.1, 0.45, 0.4, 0.42),
                     (-0.05, -0.45, 0.4, 0.42), (0.15, 0.05, 0.95, 0.38)):
    p.ajouter(bosseler(sphere(r, 10, 7), 0.07, 1.4, x * 5 + y), M['buisson'], loc=(x, y, z))
for (x, y, z) in ((0.4, -0.35, 0.65), (-0.5, 0.3, 0.55), (0.0, 0.55, 0.75), (-0.2, -0.5, 0.82), (0.55, 0.3, 0.7)):
    p.ajouter(sphere(0.07, 8, 5), M['baies'], loc=(x, y, z))
racines.append(p.objet(lisse=55))

# ================================================================== voiture (≈ 4 m, carrosserie couleur_joueur)
p = Piece('voiture')
p.ajouter(boite(1.82, 3.9, 0.62, 0.22, 2), M['cj'], loc=(0, 0, 0.66))
p.ajouter(boite(1.58, 2.0, 0.66, 0.24, 2), M['cj'], loc=(0, -0.25, 1.22))
p.ajouter(boite(1.25, 0.04, 0.4, 0.02, 1), M['vitre'], loc=(0, 0.755, 1.25))
p.ajouter(boite(1.25, 0.04, 0.38, 0.02, 1), M['vitre'], loc=(0, -1.255, 1.25))
p.ajouter(boite(0.04, 1.45, 0.38, 0.02, 1), M['vitre'], loc=(0.795, -0.25, 1.26), sym=True)
for sx in (-1, 1):
    for sy in (-1, 1):
        p.ajouter(cyl(0.4, 0.32, 14, b=0.07, seg=1), M['pneu'], loc=(0.82 * sx, 1.25 * sy, 0.4), rot=(0, 90, 0))
        p.ajouter(cyl(0.21, 0.34, 10, b=0.03, seg=1), M['jante'], loc=(0.82 * sx, 1.25 * sy, 0.4), rot=(0, 90, 0))
p.ajouter(cyl(0.13, 0.06, 12, b=0.02, seg=1), M['phare'], loc=(0.6, 1.95, 0.75), rot=(-90, 0, 0), sym=True)
p.ajouter(boite(0.3, 0.05, 0.12, 0.02, 1), M['feu_ar'], loc=(0.62, -1.95, 0.78), sym=True)
p.ajouter(boite(1.86, 0.22, 0.22, 0.08, 1), M['sombre'], loc=(0, 1.98, 0.42))
p.ajouter(boite(1.86, 0.22, 0.22, 0.08, 1), M['sombre'], loc=(0, -1.98, 0.42))
p.ajouter(boite(0.8, 0.05, 0.22, 0.03, 1), M['sombre'], loc=(0, 1.96, 0.68))
racines.append(p.objet())

# ================================================================== caisse, tonneau, lampadaire, barrière
p = Piece('caisse')
p.ajouter(boite(0.96, 0.96, 0.96, 0.03, 1), M['bois'], loc=(0, 0, 0.5))
for (sx, sy, rz) in ((0, 1, 0), (0, -1, 0), (1, 0, 90), (-1, 0, 90)):
    for z in (0.1, 0.9):
        p.ajouter(boite(1.0, 0.06, 0.16, 0.025, 1), M['bois_f'], loc=(0.49 * sx, 0.49 * sy, z), rot=(0, 0, rz))
    for x in (-0.42, 0.42):
        p.ajouter(boite(0.16, 0.06, 0.8, 0.025, 1), M['bois_f'],
                  loc=(0.49 * sx + (x if sx == 0 else 0), 0.49 * sy + (x if sy == 0 else 0), 0.5), rot=(0, 0, rz))
    p.ajouter(boite(1.0, 0.05, 0.14, 0.02, 1), M['bois_f'], loc=(0.49 * sx, 0.49 * sy, 0.5), rot=(0, 45, rz))
p.ajouter(boite(1.0, 0.16, 0.06, 0.025, 1), M['bois_f'], loc=(0, 0.42, 0.99))
p.ajouter(boite(1.0, 0.16, 0.06, 0.025, 1), M['bois_f'], loc=(0, -0.42, 0.99))
racines.append(p.objet())

p = Piece('tonneau')
p.ajouter(tube([(0.0, 0.31, 0.31), (0.05, 0.33, 0.33), (0.3, 0.37, 0.37), (0.55, 0.38, 0.38), (0.8, 0.37, 0.37),
                (1.05, 0.33, 0.33), (1.1, 0.31, 0.31)], cotes=16, uv=False), O.mat('tonneau_bois', '#c0682f', 0.75))
for z, r in ((0.15, 0.355), (0.95, 0.355), (0.45, 0.383), (0.65, 0.383)):
    p.ajouter(cyl(r, 0.06, 16, b=0.01, seg=1), M['fer'], loc=(0, 0, z))
p.ajouter(cyl(0.29, 0.02, 16), M['bois_f'], loc=(0, 0, 1.095))
racines.append(p.objet())

p = Piece('lampadaire')
p.ajouter(cyl(0.22, 0.25, 12, r2=0.17, b=0.04, seg=1), M['sombre'], loc=(0, 0, 0.125))
p.ajouter(cyl(0.075, 3.7, 10, r2=0.06), M['sombre'], loc=(0, 0, 2.05))
p.ajouter(tore(0.35, 0.05, 12, 8, 0, 180), M['sombre'], loc=(0.35, 0, 3.9), rot=(90, 0, 0))
p.ajouter(cyl(0.26, 0.2, 12, r2=0.1, b=0.03, seg=1), M['sombre'], loc=(0.7, 0, 3.78))
p.ajouter(sphere(0.17, 10, 6, ech=(1, 1, 0.7)), M['lumiere'], loc=(0.7, 0, 3.66))
p.ajouter(sphere(0.07, 8, 5), M['sombre'], loc=(0, 0, 3.92))
racines.append(p.objet())

p = Piece('barriere')   # 4 m de long le long de X, origine au centre en bas
for x in (-1.93, 0.0, 1.93):
    p.ajouter(boite(0.14, 0.14, 1.05, 0.03, 1), M['bois'], loc=(x, 0, 0.525))
    p.ajouter(cone(0.1, 0.14, 4), M['bois'], loc=(x, 0, 1.12), rot=(0, 0, 45))
for z in (0.42, 0.82):
    p.ajouter(boite(4.0, 0.07, 0.16, 0.025, 1), M['bois_f'], loc=(0, 0.075, z))
racines.append(p.objet())

# ================================================================== bateau (origine à la ligne de flottaison)
p = Piece('bateau')
coque = tube([(-2.15, 0.82, 0.55, 0, 0.0), (-1.6, 0.95, 0.62, 0, 0.0), (-0.4, 1.0, 0.66, 0, 0.0),
              (0.8, 0.92, 0.64, 0, -0.04), (1.6, 0.66, 0.58, 0, -0.12), (2.1, 0.32, 0.5, 0, -0.22),
              (2.32, 0.06, 0.4, 0, -0.3)], cotes=16, uv=False, axe='Y')
O.couper(coque, (0, 0, 0.32), (0, 0, -1))
p.ajouter(coque, M['coque'])
bande = tube([(-2.16, 0.835, 0.565, 0, 0.0), (-1.6, 0.965, 0.635, 0, 0.0), (-0.4, 1.015, 0.675, 0, 0.0),
              (0.8, 0.935, 0.655, 0, -0.04), (1.6, 0.675, 0.595, 0, -0.12), (2.1, 0.335, 0.515, 0, -0.22),
              (2.33, 0.07, 0.415, 0, -0.3)], cotes=16, uv=False, axe='Y')
O.couper(bande, (0, 0, 0.31), (0, 0, -1), boucher=False)
O.couper(bande, (0, 0, 0.12), (0, 0, 1), boucher=False)
O.epaissir(bande, 0.015)
p.ajouter(bande, M['blanc'])
p.ajouter(boite(1.6, 3.4, 0.05, 0.0), M['bois'], loc=(0, -0.1, 0.30))
for y in (-1.2, 0.2):
    p.ajouter(boite(1.6, 0.32, 0.1, 0.03, 1), M['bois_f'], loc=(0, y, 0.55))
    p.ajouter(boite(0.12, 0.25, 0.25, 0.03, 1), M['bois_f'], loc=(0, y, 0.42))
p.ajouter(boite(1.2, 0.06, 0.4, 0.03, 1), M['vitre'], loc=(0, 0.95, 0.55), rot=(-20, 0, 0))
p.ajouter(boite(0.42, 0.42, 0.55, 0.08, 2), M['sombre'], loc=(0, -2.25, 0.55))
p.ajouter(boite(0.12, 0.12, 0.6, 0.03, 1), M['sombre'], loc=(0, -2.33, 0.05))
p.ajouter(cyl(0.12, 0.08, 10, b=0.02, seg=1), M['fer'], loc=(0, -2.33, -0.28), rot=(-90, 0, 0))
racines.append(p.objet())

# ================================================================== panneau
p = Piece('panneau')
p.ajouter(boite(0.14, 0.14, 2.1, 0.03, 1), M['bois_f'], loc=(0, 0, 1.05))
p.ajouter(boite(1.3, 0.08, 0.62, 0.05, 2), M['bois'], loc=(0, 0.08, 1.7))
p.ajouter(boite(1.12, 0.02, 0.46, 0.02, 1), O.mat('panneau_face', '#f3e2bd', 0.7), loc=(0, 0.125, 1.7))
p.ajouter(cone(0.1, 0.16, 4), M['bois_f'], loc=(0, 0, 2.18), rot=(0, 0, 45))
racines.append(p.objet())

# ================================================================== dirigeable (≈ 30 m, origine au centre du ballon)
p = Piece('dirigeable')
L, R = 15.0, 4.3


def rayon(y):
    t = y / L
    return R * math.sqrt(max(0.0, 1 - t * t)) * (1 - 0.18 * max(0.0, -t))   # l'arrière s'affine


an = []
for i in range(19):
    t = -math.cos(math.pi * i / 18)        # anneaux plus serrés aux deux bouts : nez bien rond
    y = t * L * 0.999
    an.append((y, max(rayon(y), 0.05), max(rayon(y), 0.05)))
p.ajouter(tube(an, cotes=24, uv=False, axe='Y'), M['violet'])
for y in (-6.0, 0.0, 6.0):
    r = rayon(y) + 0.06
    p.ajouter(tore(r, 0.22, 32, 6), M['cyan'], loc=(0, y, 0), rot=(90, 0, 0))
for (rx, ry, rz) in ((0, 0, 0), (0, 0, 90), (0, 0, 180), (0, 0, 270)):
    a = math.radians(rz)
    d = Vector((math.cos(a), 0, math.sin(a)))
    p.ajouter(boite(3.6, 4.2, 0.35, 0.15, 2), M['cyan'], loc=Vector((0, -12.0, 0)) + d * 2.6,
              rot=(0, -rz, 0), ech=(1, 1, 1))
# nacelle
p.ajouter(boite(3.2, 8.5, 2.3, 0.6, 2), M['sombre'], loc=(0, 0.5, -5.6))
for y in (-2.4, -0.8, 0.8, 2.4):
    p.ajouter(boite(0.06, 1.0, 0.8, 0.12, 1), M['vitre'], loc=(1.6, y + 0.5, -5.4), sym=True)
p.ajouter(boite(2.4, 0.06, 0.9, 0.15, 1), M['vitre'], loc=(0, 4.74, -5.35))
for y in (-2.5, 3.0):
    p.ajouter(boite(0.25, 0.25, 1.8, 0.05, 1), M['sombre'], loc=(0.9, y, -3.9), sym=True)
for s in (1, -1):
    p.ajouter(cyl(0.35, 1.2, 12, b=0.1, seg=1), M['sombre'], loc=(2.4 * s, -3.0, -5.3), rot=(-90, 0, 0))
    p.ajouter(boite(0.5, 0.15, 0.25, 0.05, 1), M['sombre'], loc=(1.85 * s, -3.0, -5.3))
    for k in range(3):
        p.ajouter(boite(0.18, 0.06, 1.3, 0.05, 1), M['blanc'], loc=(2.4 * s, -3.65, -5.3), rot=(0, 120 * k, 0))
# lettres NATX sur les deux flancs, collées à la courbe du ballon
for s in (1, -1):
    t = texte('NATX', 3.4, 0.25, 0.05)
    # texte debout dans XZ lisible depuis +Y : on le tourne vers le côté (+X ou -X)
    bmesh.ops.rotate(t, verts=t.verts, cent=(0, 0, 0), matrix=Matrix.Rotation(math.radians(-90 * s), 3, 'Z'))
    for v in t.verts:
        prof = v.co.x * s
        surf = math.sqrt(max(0.01, rayon(v.co.y) ** 2 - v.co.z ** 2))
        v.co.x = s * (surf + 0.02 + prof)
    p.ajouter(t, M['blanc'])
racines.append(p.objet(lisse=45))

# ================================================================== trampoline (champignon de 2 m de large)
p = Piece('trampoline')
p.ajouter(tube([(0.0, 0.5, 0.5), (0.12, 0.44, 0.44), (0.45, 0.33, 0.33), (0.85, 0.36, 0.36), (1.0, 0.42, 0.42)],
               cotes=14, uv=False), M['tige'])
chap = sphere(1.0, 20, 10, ech=(1.0, 1.0, 0.55))
O.couper(chap, (0, 0, -0.05), (0, 0, 1))
p.ajouter(chap, M['rose'], loc=(0, 0, 0.98))
p.ajouter(cyl(0.96, 0.04, 20), M['tige'], loc=(0, 0, 0.94))
for i in range(7):
    a = math.radians(360 / 6 * i)
    rr = 0.0 if i == 6 else 0.62
    pos = Vector((math.cos(a) * rr, math.sin(a) * rr, 0))
    hz = 0.55 * math.sqrt(max(0, 1 - rr * rr)) + 0.98 - 0.05
    d = Vector((pos.x, pos.y, 0.55 * 0.9)).normalized() if rr else Vector((0, 0, 1))
    p.ajouter(sphere(0.16, 10, 5, ech=(1, 1, 0.3)), M['taches'], loc=pos + Vector((0, 0, hz)), rot=rot_vers(d))
racines.append(p.objet(lisse=50))

# ================================================================== fontaine de soin (3 m)
p = Piece('fontaine')
p.ajouter(cyl(1.5, 0.55, 28, b=0.08, seg=2), M['pierre'], loc=(0, 0, 0.275))
p.ajouter(cyl(1.28, 0.1, 28), M['eau'], loc=(0, 0, 0.53))
p.ajouter(cyl(1.55, 0.12, 28, b=0.04, seg=1), M['pierre_f'], loc=(0, 0, 0.06))
p.ajouter(tube([(0.5, 0.3, 0.3), (0.9, 0.22, 0.22), (1.2, 0.26, 0.26), (1.3, 0.2, 0.2)], cotes=14, uv=False), M['pierre_f'])
coupe = sphere(0.7, 18, 8, ech=(1, 1, 0.45))
O.couper(coupe, (0, 0, 0.0), (0, 0, -1))
p.ajouter(coupe, M['pierre'], loc=(0, 0, 1.6))
p.ajouter(cyl(0.62, 0.06, 18), M['eau'], loc=(0, 0, 1.57))
p.ajouter(cyl(0.12, 0.5, 10), M['pierre_f'], loc=(0, 0, 1.8))
p.ajouter(sphere(0.2, 12, 8), M['eau'], loc=(0, 0, 2.12))
# croix de soin lumineuse qui flotte au-dessus
p.ajouter(boite(0.16, 0.08, 0.5, 0.04, 1), M['eau'], loc=(0, 0, 2.75))
p.ajouter(boite(0.5, 0.08, 0.16, 0.04, 1), M['eau'], loc=(0, 0, 2.75))
for i in range(6):
    a = math.radians(60 * i)
    p.ajouter(capsule(0.05, 0.5, cotes=6, demi=1), M['eau'], loc=(math.cos(a) * 0.62, math.sin(a) * 0.62, 1.08),
              rot=rot_vers((math.cos(a) * 0.4, math.sin(a) * 0.4, -1)))
racines.append(p.objet(lisse=45))

# ================================================================== bilan, export
print('--- BILAN decor ---')
O.bilan(racines)
O.exporter('decor.glb', racines)
O.sauver('decor.blend')

# ================================================================== rendus de contrôle (couleurs d'essai)
for o in racines:
    o.hide_render = True
nom = {r.name: r for r in racines}


def essai_couleur(copies, mat_nom, couleur):
    m = O.mat('essai_' + mat_nom + couleur, couleur, 0.7)
    for c in copies:
        for i, sl in enumerate(c.material_slots):
            if sl.material and sl.material.name == mat_nom:
                sl.link = 'OBJECT'
                sl.material = m


vit = []
place = [('sapin', -9, 0), ('sapin_neige', -5.5, 0), ('feuillu', -1.5, 0), ('palmier', 2.5, 0), ('cactus', 6, 0),
         ('rocher_1', -8, 6), ('rocher_2', -5, 6), ('rocher_3', -1.5, 6), ('buisson', 1.5, 6),
         ('trampoline', 4.5, 6), ('fontaine', 8.5, 6)]
for n, x, y in place:
    c = O.copier([nom[n]], (x, y, 0), 0)
    if n == 'sapin_neige':
        essai_couleur(c, 'feuillage', '#e9f5ff')
    if n == 'cactus':
        essai_couleur(c, 'feuillage', '#5cb84a')
    vit += c
O.rendu('decor_nature.png', objets=vit, direction=(0.25, 1, 0.45), taille=(1600, 900), ortho=False)
for o in vit:
    o.hide_render = True
vit = []
for n, x, y in (('voiture', -7, 0), ('bateau', -2.5, 0), ('caisse', 1.2, 0), ('tonneau', 2.7, 0),
                ('lampadaire', 4.5, 0), ('barriere', 7.5, 0), ('panneau', 10.5, 0)):
    vit += O.copier([nom[n]], (x, y, 0), 25 if n in ('voiture', 'bateau') else 0)
O.rendu('decor_objets.png', objets=vit, direction=(0.3, 1, 0.4), taille=(1600, 800), ortho=False)
for o in vit:
    o.hide_render = True
vit = O.copier([nom['dirigeable']], (0, 0, 0), 0)
O.rendu('decor_dirigeable.png', objets=vit, direction=(1, 0.55, 0.25), taille=(1400, 800), ortho=False)
