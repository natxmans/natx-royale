# Natx Royale — constructions.glb : les pièces que les joueurs construisent, aux tailles EXACTES.
#   mur   : 4 (X) x 0,3 (Y) x 4 (Z)        sol : 4 x 4 (X, Y) x 0,3 (Z)
#   rampe : 4 (X) x 5,66 (Y) x 0,3 (Z), à plat (le jeu l'incline)
# Origine au centre. Les détails restent À L'INTÉRIEUR de ces dimensions (collisions justes).
# Lancer : blender.exe -b --factory-startup --python construire_constructions.py
import sys, os, math, random
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import outils as O
from outils import Piece, boite, sphere
import bpy, bmesh
from mathutils import Vector, Matrix

O.nouvelle_scene()
random.seed(4)
M = dict(
    bois=O.mat('bois_construction', '#d9a15a', 0.8),
    bois_f=O.mat('bois_construction_fonce', '#c08443', 0.8),
    cadre=O.mat('bois_cadre', '#8f5a2b', 0.8),
    pierre=O.mat('pierre_construction', '#b9c0cb', 0.85),
    pierre_f=O.mat('pierre_construction_fonce', '#99a2af', 0.85),
    mortier=O.mat('mortier', '#6b7280', 0.9),
    metal=O.mat('metal_construction', '#9aa7b8', 0.4, 0.6),
    metal_f=O.mat('metal_construction_fonce', '#5d6878', 0.45, 0.6),
    jaune=O.mat('metal_jaune', '#ffc61a', 0.5, 0.2),
)
E = 0.3          # épaisseur
D = E / 2


# Chaque style construit une plaque « debout » : largeur W (X), hauteur H (Z), épaisseur 0,3 (Y)
def bois(p, W, H):
    n = max(1, round((W - 0.5) / 0.46))
    lp = (W - 0.5) / n
    for i in range(n):
        x = -W / 2 + 0.25 + lp * (i + 0.5)
        p.ajouter(boite(lp - 0.03, 0.22, H - 0.5, 0.03, 1), M['bois'] if i % 2 == 0 else M['bois_f'], loc=(x, 0, 0))
    for sz in (1, -1):
        p.ajouter(boite(W, E, 0.25, 0.05, 2), M['cadre'], loc=(0, 0, sz * (H / 2 - 0.125)))
    for sx in (1, -1):
        p.ajouter(boite(0.25, E, H - 0.5, 0.05, 2), M['cadre'], loc=(sx * (W / 2 - 0.125), 0, 0))
    a = math.atan2(H - 0.5, W - 0.5)
    lg = math.hypot(W - 0.5, H - 0.5) - 0.12
    p.ajouter(boite(lg, 0.26, 0.2, 0.04, 1), M['cadre'], rot=(0, -math.degrees(a), 0))


def pierre(p, W, H):
    p.ajouter(boite(W - 0.04, 0.2, H - 0.04, 0.0), M['mortier'])
    rangs = max(1, round(H / 0.5))
    rh = H / rangs
    g = 0.025
    for r in range(rangs):
        z0, z1 = -H / 2 + r * rh, -H / 2 + (r + 1) * rh
        bl = W / 4
        decal = (bl / 2) if r % 2 else 0.0
        bords = [-W / 2] + [x for x in [(-W / 2 + decal + bl * k) for k in range(1, 6)] if -W / 2 < x < W / 2 - 0.05] + [W / 2]
        for x0, x1 in zip(bords[:-1], bords[1:]):
            a0 = x0 if x0 <= -W / 2 + 1e-6 else x0 + g
            a1 = x1 if x1 >= W / 2 - 1e-6 else x1 - g
            b0 = z0 if r == 0 else z0 + g
            b1 = z1 if r == rangs - 1 else z1 - g
            m = M['pierre'] if random.random() < 0.6 else M['pierre_f']
            p.ajouter(boite(a1 - a0, E, b1 - b0, 0.06, 1), m, loc=((a0 + a1) / 2, 0, (b0 + b1) / 2))


def metal(p, W, H):
    p.ajouter(boite(W - 0.3, 0.18, H - 0.3, 0.0), M['metal'])
    n = int((W - 0.4) / 0.4)
    for i in range(n):
        x = -(n - 1) * 0.2 + i * 0.4
        p.ajouter(boite(0.12, 0.24, H - 0.4, 0.04, 1), M['metal'], loc=(x, 0, 0))
    for sz in (1, -1):
        p.ajouter(boite(W - 0.6, E, 0.2, 0.05, 2), M['metal_f'], loc=(0, 0, sz * (H / 2 - 0.1)))
    for sx in (1, -1):
        p.ajouter(boite(0.2, E, H - 0.6, 0.05, 2), M['metal_f'], loc=(sx * (W / 2 - 0.1), 0, 0))
        for sz in (1, -1):
            p.ajouter(boite(0.3, E, 0.3, 0.06, 2), M['jaune'], loc=(sx * (W / 2 - 0.15), 0, sz * (H / 2 - 0.15)))
    a = math.atan2(H - 0.4, W - 0.4)
    lg = math.hypot(W - 0.4, H - 0.4) - 0.3
    for s in (1, -1):
        p.ajouter(boite(lg, 0.27, 0.16, 0.04, 1), M['metal_f'], rot=(0, s * math.degrees(a), 0))
    for sx in (1, -1):
        for sz in (1, -1):
            for sy in (1, -1):
                p.ajouter(sphere(0.045, 8, 5, ech=(1, 0.35, 1)), M['metal_f'],
                          loc=(sx * (W / 2 - 0.42), sy * 0.105, sz * (H / 2 - 0.42)))


STYLES = {'bois': bois, 'pierre': pierre, 'metal': metal}
TAILLES = {'mur': (4.0, 4.0), 'sol': (4.0, 4.0), 'rampe': (4.0, 5.66)}
racines = []
for piece, (W, H) in TAILLES.items():
    for style, f in STYLES.items():
        p = Piece(f'{piece}_{style}')
        f(p, W, H)
        if piece != 'mur':
            # couchée : la hauteur devient la longueur (Y), la face « avant » devient le dessus
            bm = p.bm
            bmesh.ops.rotate(bm, verts=bm.verts, cent=(0, 0, 0), matrix=Matrix.Rotation(math.radians(90), 3, 'X'))
        racines.append(p.objet(lisse=35))

print('--- BILAN constructions ---')
O.bilan(racines)
bpy.context.view_layer.update()
attendu = {'mur': (4.0, 0.3, 4.0), 'sol': (4.0, 4.0, 0.3), 'rampe': (4.0, 5.66, 0.3)}
ok = True
for r in racines:
    mn, mx = O.boite_englobante([r])
    t = tuple(round(mx[i] - mn[i], 4) for i in range(3))
    c = tuple(round((mx[i] + mn[i]) / 2, 4) for i in range(3))
    bon = all(abs(t[i] - attendu[r.name.split('_')[0]][i]) < 1e-3 for i in range(3)) and all(abs(v) < 1e-3 for v in c)
    ok &= bon
    print(f'TAILLE {r.name:14s} {t}  centre {c}  ->', 'EXACT' if bon else 'FAUX')
print('TOUTES LES TAILLES EXACTES :', ok)
O.exporter('constructions.glb', racines)
O.sauver('constructions.blend')

# ------------------------------------------------------------------ rendu : murs debout, sols, rampes inclinées à 45°
for o in racines:
    o.hide_render = True
vit = []
for i, style in enumerate(('bois', 'pierre', 'metal')):
    x = (i - 1) * 5.0
    vit += O.copier([bpy.data.objects[f'mur_{style}']], (x, 0, 2.0), 0)
    vit += O.copier([bpy.data.objects[f'sol_{style}']], (x, -4.6, 0.15), 0)
    c = O.copier([bpy.data.objects[f'rampe_{style}']], (0, 0, 0), 0)[0]
    c.matrix_world = Matrix.Translation((x, -10.0, 2.0)) @ Matrix.Rotation(math.radians(45), 4, 'X')
    vit.append(c)
O.rendu('constructions.png', objets=vit, direction=(0.35, -1, 0.75), taille=(1500, 1000), ortho=False)
