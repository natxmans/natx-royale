# Boîte à outils de modélisation pour Natx Royale (Blender 5.2).
# Les scripts construire_*.py l'utilisent. Ils se lancent en arrière-plan :
#   blender.exe -b --factory-startup --python construire_personnage.py
# Convention : 1 unité = 1 m, Z en haut, l'avant vers +Y, la droite vers +X.
import bpy, bmesh, math, os, random
from mathutils import Vector, Matrix, Euler

SOURCES = os.path.dirname(os.path.abspath(__file__))
MODELES = os.path.dirname(SOURCES)
RENDUS = os.path.join(SOURCES, 'rendus')
TAU = math.tau


# ---------------------------------------------------------------- scène
def nouvelle_scene():
    for o in list(bpy.data.objects):
        bpy.data.objects.remove(o, do_unlink=True)
    for coll in (bpy.data.meshes, bpy.data.materials, bpy.data.cameras, bpy.data.lights, bpy.data.curves):
        for d in list(coll):
            coll.remove(d)
    sc = bpy.context.scene
    sc.unit_settings.system = 'METRIC'
    sc.unit_settings.scale_length = 1.0
    return sc


# ---------------------------------------------------------------- matériaux
def lin(h):
    h = h.lstrip('#')
    c = [int(h[i:i + 2], 16) / 255 for i in (0, 2, 4)]
    return tuple((x / 12.92) if x <= 0.04045 else ((x + 0.055) / 1.055) ** 2.4 for x in c)


def mat(nom, couleur='#888888', rugo=0.55, metal=0.0, emission=0.0, alpha=1.0, double=False):
    """Matériau simple : couleur + rugosité (+ métal / lumière si besoin). Réutilisé s'il existe.
    double=False : une seule face visible (plus rapide dans le jeu) ; True pour les surfaces fines ouvertes."""
    m = bpy.data.materials.get(nom)
    if m is None:
        m = bpy.data.materials.new(nom)
        try:
            m.use_nodes = True
        except Exception:
            pass
    m.use_backface_culling = not (double or alpha < 1)
    p = next(n for n in m.node_tree.nodes if n.type == 'BSDF_PRINCIPLED')
    col = (*lin(couleur), 1.0)
    p.inputs['Base Color'].default_value = col
    p.inputs['Roughness'].default_value = rugo
    p.inputs['Metallic'].default_value = metal
    if emission > 0:
        p.inputs['Emission Color'].default_value = col
        p.inputs['Emission Strength'].default_value = emission
    if alpha < 1:
        p.inputs['Alpha'].default_value = alpha
        for attr, val in (('surface_render_method', 'BLENDED'), ('blend_method', 'BLEND')):
            try:
                setattr(m, attr, val)
            except Exception:
                pass
    m.diffuse_color = col
    return m


TUILE = {}     # nom du matériau texturé -> taille (en m) d'une répétition de la texture (UV en boîte)


def mat_tex(nom, couleur, tex, rugo=0.6, metal=0.0, tuile=1.0, relief=1.0, emission=0.0, decoupe=False,
            double=False):
    """Matériau réaliste : texture (souvent en gris) x couleur du matériau + carte de relief.
    La couleur reste réglable par le jeu (baseColorFactor). decoupe=True : feuilles découpées (alpha MASK)."""
    import textures as TX
    m = mat(nom, couleur, rugo, metal, emission, double=double or decoupe)
    nt = m.node_tree
    nodes, liens = nt.nodes, nt.links
    for n in [n for n in nodes if n.type in ('TEX_IMAGE', 'MIX', 'NORMAL_MAP', 'MATH')]:
        nodes.remove(n)
    bsdf = next(n for n in nodes if n.type == 'BSDF_PRINCIPLED')
    c_chemin, n_chemin = TX.preparer(tex)
    ic = nodes.new('ShaderNodeTexImage')
    ic.image = bpy.data.images.load(c_chemin, check_existing=True)
    mix = nodes.new('ShaderNodeMix')
    mix.data_type = 'RGBA'
    mix.blend_type = 'MULTIPLY'
    mix.inputs[0].default_value = 1.0
    liens.new(ic.outputs['Color'], mix.inputs[6])
    mix.inputs[7].default_value = (*lin(couleur), 1.0)
    liens.new(mix.outputs[2], bsdf.inputs['Base Color'])
    inr = nodes.new('ShaderNodeTexImage')
    inr.image = bpy.data.images.load(n_chemin, check_existing=True)
    inr.image.colorspace_settings.name = 'Non-Color'
    nm = nodes.new('ShaderNodeNormalMap')
    nm.inputs['Strength'].default_value = relief
    liens.new(inr.outputs['Color'], nm.inputs['Color'])
    liens.new(nm.outputs['Normal'], bsdf.inputs['Normal'])
    if decoupe:
        gt = nodes.new('ShaderNodeMath')
        gt.operation = 'GREATER_THAN'
        gt.inputs[1].default_value = 0.5
        liens.new(ic.outputs['Alpha'], gt.inputs[0])
        liens.new(gt.outputs[0], bsdf.inputs['Alpha'])
    TUILE[nom] = tuile
    return m


def uv_boite(bm, tuile=1.0, decalage=None, sens='long'):
    """UV par projection « en boîte » : chaque face prend les deux axes de son plan, divisés par la taille
    de répétition. sens='long' : U suit le plus grand côté de la forme (fil du bois dans la longueur)."""
    uvl = bm.loops.layers.uv.verify()
    if not bm.verts:
        return bm
    xs = [v.co for v in bm.verts]
    ext = [max(c[i] for c in xs) - min(c[i] for c in xs) for i in range(3)]
    if decalage is None:
        decalage = (random.random(), random.random())
    for f in bm.faces:
        n = f.normal
        a = max(range(3), key=lambda i: abs(n[i]))
        b, c = [i for i in range(3) if i != a]
        if sens == 'long' and ext[c] > ext[b]:
            b, c = c, b
        for l in f.loops:
            co = l.vert.co
            l[uvl].uv = (co[b] / tuile + decalage[0], co[c] / tuile + decalage[1])
    return bm


# ---------------------------------------------------------------- formes de base (renvoient un bmesh)
def matrice(loc=(0, 0, 0), rot=(0, 0, 0), ech=None):
    M = Matrix.Translation(Vector(loc)) @ Euler([math.radians(a) for a in rot], 'XYZ').to_matrix().to_4x4()
    if ech is not None:
        if isinstance(ech, (int, float)):
            ech = (ech, ech, ech)
        M = M @ Matrix.Diagonal((*ech, 1.0))
    return M


def _biseau(bm, aretes, b, seg):
    if b <= 0 or not aretes:
        return
    verts = list({v for e in aretes for v in e.verts})
    bmesh.ops.bevel(bm, geom=list(aretes) + verts, offset=b, offset_type='OFFSET', segments=seg,
                    profile=0.5, affect='EDGES', clamp_overlap=True)


def boite(sx, sy, sz, b=0.0, seg=2):
    """Boîte centrée, arêtes biseautées de b mètres."""
    bm = bmesh.new()
    bmesh.ops.create_cube(bm, size=1.0)
    bmesh.ops.scale(bm, vec=(sx, sy, sz), verts=bm.verts)
    _biseau(bm, list(bm.edges), min(b, 0.49 * min(sx, sy, sz)), seg)
    return bm


def cyl(r, h, cotes=16, r2=None, b=0.0, seg=2):
    """Cylindre (ou cône tronqué si r2) le long de Z, centré. Bords des bouts biseautés."""
    bm = bmesh.new()
    bmesh.ops.create_cone(bm, cap_ends=True, cap_tris=False, segments=cotes,
                          radius1=r, radius2=(r if r2 is None else r2), depth=h)
    if b > 0:
        ar = [e for e in bm.edges if len(e.link_faces) == 2 and e.calc_face_angle(0) > math.radians(50)]
        _biseau(bm, ar, min(b, 0.45 * h, 0.45 * min(r, r if r2 is None else max(r2, 0.001))), seg)
    return bm


def cone(r, h, cotes=12):
    """Cône pointu le long de Z, base en z=-h/2, pointe en z=+h/2."""
    bm = bmesh.new()
    bmesh.ops.create_cone(bm, cap_ends=True, cap_tris=True, segments=cotes, radius1=r, radius2=0.0, depth=h)
    return bm


def sphere(r, seg=16, anneaux=10, ech=(1, 1, 1)):
    bm = bmesh.new()
    bmesh.ops.create_uvsphere(bm, u_segments=seg, v_segments=anneaux, radius=r)
    bmesh.ops.scale(bm, vec=ech, verts=bm.verts)
    return bm


def ico(r, sub=1, ech=(1, 1, 1)):
    bm = bmesh.new()
    bmesh.ops.create_icosphere(bm, subdivisions=sub, radius=r)
    bmesh.ops.scale(bm, vec=ech, verts=bm.verts)
    return bm


def tore(R, r, seg=24, cotes=8, debut=0.0, fin=360.0):
    """Anneau dans le plan XY (autour de Z). debut/fin en degrés pour un arc (bouts fermés)."""
    bm = bmesh.new()
    complet = abs(fin - debut) >= 359.9
    n = seg if complet else seg + 1
    anneaux = []
    for i in range(n):
        a = math.radians(debut + (fin - debut) * i / seg)
        c, s = math.cos(a), math.sin(a)
        ring = []
        for j in range(cotes):
            b = TAU * j / cotes
            rr = R + r * math.cos(b)
            ring.append(bm.verts.new((rr * c, rr * s, r * math.sin(b))))
        anneaux.append(ring)
    for i in range(n if complet else n - 1):
        a1, a2 = anneaux[i], anneaux[(i + 1) % n]
        for j in range(cotes):
            j2 = (j + 1) % cotes
            bm.faces.new((a1[j], a2[j], a2[j2], a1[j2]))
    if not complet:
        bm.faces.new(list(reversed(anneaux[0])))
        bm.faces.new(anneaux[-1])
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    return bm


def balayage(points, rayons, cotes=8, fermer=True):
    """Tube qui suit une ligne de points (cornes, cordes, tiges...). rayons : un nombre ou un par point."""
    pts = [Vector(p) for p in points]
    if isinstance(rayons, (int, float)):
        rayons = [rayons] * len(pts)
    bm = bmesh.new()
    anneaux, n_prec = [], None
    for i, p in enumerate(pts):
        t = (pts[min(i + 1, len(pts) - 1)] - pts[max(i - 1, 0)]).normalized()
        if n_prec is None:
            a = Vector((0, 0, 1)) if abs(t.z) < 0.9 else Vector((1, 0, 0))
            n = t.cross(a).normalized()
        else:
            n = (n_prec - t * n_prec.dot(t)).normalized()
        b = t.cross(n)
        n_prec = n
        r = max(rayons[i], 0.0008)
        anneaux.append([bm.verts.new(p + (n * math.cos(TAU * k / cotes) + b * math.sin(TAU * k / cotes)) * r)
                        for k in range(cotes)])
    for i in range(len(anneaux) - 1):
        for k in range(cotes):
            k2 = (k + 1) % cotes
            bm.faces.new((anneaux[i][k], anneaux[i][k2], anneaux[i + 1][k2], anneaux[i + 1][k]))
    if fermer:
        bm.faces.new(list(reversed(anneaux[0])))
        bm.faces.new(anneaux[-1])
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    return bm


def dome(rx, ry, rz, seg=18, anneaux=8):
    """Demi-ellipsoïde (dôme) posé sur z=0, dessous fermé."""
    bm = sphere(1.0, seg, anneaux * 2, ech=(rx, ry, rz))
    couper(bm, (0, 0, 0), (0, 0, 1))
    return bm


def anneau(z0, z1, rx, ry, ep, cotes=24):
    """Bande en anneau (bandeau, ruban de chapeau...) : intérieur rx/ry, épaisseur ep."""
    return tube([(z0, rx, ry), (z1, rx, ry), (z1, rx + ep, ry + ep), (z0, rx + ep, ry + ep)],
                cotes=cotes, uv=False, boucle=True)


def etoile(r_ext, r_int, ep, branches=5):
    """Étoile plate dans le plan XZ (face vers +Y), épaisseur ep."""
    bm = bmesh.new()
    av, ar = [], []
    for i in range(branches * 2):
        a = math.pi / 2 + math.pi * i / branches
        r = r_ext if i % 2 == 0 else r_int
        x, z = r * math.cos(a), r * math.sin(a)
        av.append(bm.verts.new((x, ep / 2, z)))
        ar.append(bm.verts.new((x, -ep / 2, z)))
    bm.faces.new(av)
    bm.faces.new(list(reversed(ar)))
    n = len(av)
    for i in range(n):
        j = (i + 1) % n
        bm.faces.new((av[i], ar[i], ar[j], av[j]))
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    return bm


def plaque(contour, ep=0.03, cuts=3, deform=None):
    """Surface plate dessinée par un contour [(x, y), ...] (peut être creusé), subdivisée,
    déformée par deform(Vector) -> Vector, puis épaissie de ep (0 = laisser à plat)."""
    bm = bmesh.new()
    vs = [bm.verts.new((x, y, 0.0)) for (x, y) in contour]
    f = bm.faces.new(vs)
    f.normal_update()
    if f.normal.z < 0:
        bmesh.ops.reverse_faces(bm, faces=[f])
    bmesh.ops.triangulate(bm, faces=[f], quad_method='BEAUTY', ngon_method='EAR_CLIP')
    if cuts:
        bmesh.ops.subdivide_edges(bm, edges=bm.edges[:], cuts=cuts, use_grid_fill=True)
    if deform:
        for v in bm.verts:
            v.co = deform(v.co.copy())
    if ep:
        bmesh.ops.solidify(bm, geom=bm.faces[:], thickness=ep)
    return bm


def tube(anneaux, cotes=16, uv=True, ferme_bas=True, ferme_haut=True, axe='Z', boucle=False):
    """Forme de révolution : anneaux = [(z, rx, ry, cx=0, cy=0), ...] du bas vers le haut.
    Sommet k à l'angle phi = 2πk/cotes mesuré depuis +Y (l'avant) vers +X.
    UV « dépliées en cylindre » : U fait le tour, l'avant à U=0,5 ; U augmente vers -X
    (vers la droite de l'image quand on regarde le perso de face) ; V de bas (0) en haut (1)."""
    bm = bmesh.new()
    uvl = bm.loops.layers.uv.new('UVMap')
    zs = [a[0] for a in anneaux]
    z0, z1 = min(zs), max(zs)
    dz = (z1 - z0) or 1.0
    ann = []
    for a in anneaux:
        z, rx, ry = a[0], a[1], a[2]
        cx = a[3] if len(a) > 3 else 0.0
        cy = a[4] if len(a) > 4 else 0.0
        ann.append([bm.verts.new((cx + rx * math.sin(TAU * k / cotes), cy + ry * math.cos(TAU * k / cotes), z))
                    for k in range(cotes)])

    def u_de(k):
        phi = TAU * k / cotes
        if phi > math.pi + 1e-9:
            phi -= TAU
        return 0.5 - phi / TAU

    def poser_uv(f, ks, vs):
        us = [u_de(k) for k in ks]
        if max(us) > 0.75 and min(us) < 0.25:
            us = [u + 1.0 if u < 0.25 else u for u in us]
        for l, u, v in zip(f.loops, us, vs):
            l[uvl].uv = (u, v)

    for i in range(len(ann) - 1):
        vi, vj = (anneaux[i][0] - z0) / dz, (anneaux[i + 1][0] - z0) / dz
        for k in range(cotes):
            k2 = (k + 1) % cotes
            f = bm.faces.new((ann[i][k], ann[i + 1][k], ann[i + 1][k2], ann[i][k2]))
            poser_uv(f, [k, k, k2, k2], [vi, vj, vj, vi])
    if boucle:   # profil fermé (anneau) : on relie le dernier anneau au premier, sans bouchons
        for k in range(cotes):
            k2 = (k + 1) % cotes
            bm.faces.new((ann[-1][k], ann[0][k], ann[0][k2], ann[-1][k2]))
        ferme_bas = ferme_haut = False
    for (ferme, i, v) in ((ferme_bas, 0, 0.0), (ferme_haut, len(ann) - 1, 1.0)):
        if not ferme:
            continue
        a = anneaux[i]
        cx = a[3] if len(a) > 3 else 0.0
        cy = a[4] if len(a) > 4 else 0.0
        c = bm.verts.new((cx, cy, a[0]))
        for k in range(cotes):
            k2 = (k + 1) % cotes
            f = bm.faces.new((ann[i][k], ann[i][k2], c) if i == 0 else (ann[i][k2], ann[i][k], c))
            u1, u2 = u_de(k), u_de(k2)
            if abs(u1 - u2) > 0.5:
                if u1 < 0.25: u1 += 1.0
                if u2 < 0.25: u2 += 1.0
            us = [u1, u2, (u1 + u2) / 2] if i == 0 else [u2, u1, (u1 + u2) / 2]
            for l, u in zip(f.loops, us):
                l[uvl].uv = (u, v)
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    if axe == 'Y':
        bmesh.ops.rotate(bm, verts=bm.verts, cent=(0, 0, 0), matrix=Matrix.Rotation(-math.pi / 2, 3, 'X'))
    elif axe == 'X':
        bmesh.ops.rotate(bm, verts=bm.verts, cent=(0, 0, 0), matrix=Matrix.Rotation(math.pi / 2, 3, 'Y'))
    return bm


def capsule(r, h, cotes=10, demi=3, ry=None):
    """Capsule le long de Z, de z=0 à z=h (bouts arrondis)."""
    ry = r if ry is None else ry
    an = []
    for i in range(demi + 1):
        a = -math.pi / 2 + (math.pi / 2) * i / demi
        an.append((r + r * math.sin(a), r * math.cos(a), ry * math.cos(a)))
    for i in range(demi + 1):
        a = (math.pi / 2) * i / demi
        an.append((h - r + r * math.sin(a), r * math.cos(a), ry * math.cos(a)))
    an = [x for x in an if x[1] > 1e-4]
    return tube(an, cotes=cotes, uv=False)


def demi_cyl(r, longueur, cotes=24, aplati=1.0):
    """Demi-cylindre couché le long de X, posé sur z=0 (dôme vers le haut)."""
    bm = bmesh.new()
    bmesh.ops.create_cone(bm, cap_ends=True, cap_tris=False, segments=cotes, radius1=r, radius2=r, depth=longueur)
    bmesh.ops.rotate(bm, verts=bm.verts, cent=(0, 0, 0), matrix=Matrix.Rotation(math.radians(90), 3, 'Y'))
    bmesh.ops.bisect_plane(bm, geom=bm.verts[:] + bm.edges[:] + bm.faces[:], plane_co=(0, 0, 0),
                           plane_no=(0, 0, 1), clear_inner=True)
    bmesh.ops.holes_fill(bm, edges=[e for e in bm.edges if e.is_boundary], sides=0)
    bmesh.ops.scale(bm, vec=(1, 1, aplati), verts=bm.verts)
    return bm


def couper(bm, point, normale, garder_dessus=True, boucher=True):
    """Coupe un bmesh par un plan ; garde le côté vers lequel pointe la normale."""
    n = Vector(normale).normalized()
    bmesh.ops.bisect_plane(bm, geom=bm.verts[:] + bm.edges[:] + bm.faces[:], plane_co=point,
                           plane_no=(n if garder_dessus else -n), clear_inner=True)
    if boucher:
        bmesh.ops.holes_fill(bm, edges=[e for e in bm.edges if e.is_boundary], sides=0)
    return bm


def epaissir(bm, e):
    bmesh.ops.solidify(bm, geom=bm.faces[:], thickness=e)
    return bm


def lisser(bm, niveaux=1):
    """Subdivision douce (comme un modificateur Subdivision appliqué)."""
    for _ in range(niveaux):
        bmesh.ops.subdivide_edges(bm, edges=bm.edges[:], cuts=1, use_grid_fill=True, smooth=1.0)
    return bm


def texte(chaine, taille=0.3, epaisseur=0.03, biseau=0.006, centrer=True, debout=True, finesse=4):
    """Texte 3D converti en bmesh. debout=True : dans le plan XZ, lisible de face (depuis +Y).
    debout=False : couché dans le plan XY, lisible d'en haut (le haut des lettres vers +Y).
    finesse : points par courbe des lettres (moins = moins de triangles)."""
    cu = bpy.data.curves.new('txt', 'FONT')
    cu.body = chaine
    cu.size = taille
    cu.resolution_u = finesse
    cu.extrude = epaisseur / 2
    cu.bevel_depth = biseau
    cu.bevel_resolution = 1
    if centrer:
        cu.align_x = 'CENTER'
        cu.align_y = 'CENTER'
    ob = bpy.data.objects.new('txt', cu)
    bpy.context.scene.collection.objects.link(ob)
    dg = bpy.context.evaluated_depsgraph_get()
    me = bpy.data.meshes.new_from_object(ob.evaluated_get(dg))
    bm = bmesh.new()
    bm.from_mesh(me)
    bpy.data.objects.remove(ob, do_unlink=True)
    bpy.data.meshes.remove(me)
    bpy.data.curves.remove(cu)
    if debout:
        bmesh.ops.rotate(bm, verts=bm.verts, cent=(0, 0, 0),
                         matrix=Matrix.Rotation(math.pi, 3, 'Z') @ Matrix.Rotation(math.radians(90), 3, 'X'))
    return bm


def rot_vers(direction):
    """Rotation (en degrés, XYZ) qui tourne l'axe +Z vers `direction`."""
    e = Vector((0, 0, 1)).rotation_difference(Vector(direction).normalized()).to_euler('XYZ')
    return tuple(math.degrees(a) for a in e)


# ---------------------------------------------------------------- assemblage d'un objet
class Piece:
    """Un objet final : on y ajoute des formes (chacune avec son matériau), puis .objet()."""

    def __init__(self, nom):
        self.nom = nom
        self.bm = bmesh.new()
        self.uv = self.bm.loops.layers.uv.new('UVMap')
        self.mats = []

    def _i(self, m):
        if m not in self.mats:
            self.mats.append(m)
        return self.mats.index(m)

    def ajouter(self, src, m, loc=(0, 0, 0), rot=(0, 0, 0), ech=None, sym=False, uv=None, sens='long'):
        """Ajoute la forme `src` (bmesh) avec le matériau m. sym=True ajoute aussi son reflet de l'autre
        côté (x -> -x), une fois placée. m peut être une fonction (centre, normale) -> matériau.
        uv : None = UV en boîte si le matériau est texturé et que la forme n'a pas d'UV ;
        'boite' = toujours en boîte ; 'garder' = garder les UV de la forme."""
        nom_m = None if callable(m) else m.name
        if uv == 'boite' or (uv is None and nom_m in TUILE and len(src.loops.layers.uv) == 0):
            if ech is not None:
                bmesh.ops.scale(src, vec=(ech, ech, ech) if isinstance(ech, (int, float)) else ech, verts=src.verts)
                ech = None
            src.normal_update()
            uv_boite(src, TUILE.get(nom_m, 1.0), sens=sens)
        bmesh.ops.transform(src, matrix=matrice(loc, rot, ech), verts=src.verts)
        if sym:
            reflet = src.copy()
            bmesh.ops.scale(reflet, vec=(-1, 1, 1), verts=reflet.verts)
            bmesh.ops.reverse_faces(reflet, faces=reflet.faces)
            self._copier(reflet, m)
        self._copier(src, m)
        return self

    def _copier(self, src, m):
        idx = None if callable(m) else self._i(m)
        uv_s = src.loops.layers.uv.active
        vmap = {v: self.bm.verts.new(v.co) for v in src.verts}
        for f in src.faces:
            try:
                nf = self.bm.faces.new([vmap[v] for v in f.verts])
            except ValueError:
                continue
            nf.material_index = idx if idx is not None else self._i(m(f.calc_center_median(), f.normal))
            if uv_s is not None:
                for ln, lo in zip(nf.loops, f.loops):
                    ln[self.uv].uv = lo[uv_s].uv
        src.free()

    def objet(self, loc=(0, 0, 0), parent=None, lisse=40, radial=None):
        """radial = {nom de matériau: centre} : normales « en boule » pour le feuillage (éclairage doux)."""
        me = bpy.data.meshes.new(self.nom)
        self.bm.normal_update()
        self.bm.to_mesh(me)
        self.bm.free()
        for m in self.mats:
            me.materials.append(m)
        for p in me.polygons:
            p.use_smooth = True
        me.set_sharp_from_angle(angle=math.radians(lisse))
        if radial:
            normales = [tuple(c.vector) for c in me.corner_normals]
            for poly in me.polygons:
                nm = me.materials[poly.material_index].name
                if nm in radial:
                    centre = radial[nm]
                    for li in poly.loop_indices:
                        co = me.vertices[me.loops[li].vertex_index].co
                        c = centre(co) if callable(centre) else Vector(centre)
                        d = (co - c)
                        normales[li] = tuple(d.normalized()) if d.length > 1e-6 else normales[li]
            me.normals_split_custom_set(normales)
        ob = bpy.data.objects.new(self.nom, me)
        bpy.context.scene.collection.objects.link(ob)
        if parent is not None:
            ob.parent = parent
        ob.location = loc
        return ob


# ---------------------------------------------------------------- bilan, export, sauvegarde
def triangles(ob, enfants=True):
    obs = [ob] + (list(ob.children_recursive) if enfants else [])
    return sum(sum(len(p.vertices) - 2 for p in o.data.polygons) for o in obs if o.type == 'MESH')


def boite_englobante(obs):
    pts = []
    for o in obs:
        for oo in [o] + list(o.children_recursive):
            if oo.type == 'MESH':
                pts += [oo.matrix_world @ Vector(c) for c in oo.bound_box]
    mn = Vector([min(p[i] for p in pts) for i in range(3)])
    mx = Vector([max(p[i] for p in pts) for i in range(3)])
    return mn, mx


def bilan(racines, budget=None):
    bpy.context.view_layer.update()
    lignes = []
    for r in racines:
        t = triangles(r)
        mn, mx = boite_englobante([r])
        mats = sorted({m.name for o in [r] + list(r.children_recursive) if o.type == 'MESH' for m in o.data.materials})
        alerte = '  <-- TROP' if budget and t > budget else ''
        lignes.append(f"{r.name:22s} {t:6d} tri  taille {mx.x - mn.x:.2f} x {mx.y - mn.y:.2f} x {mx.z - mn.z:.2f}"
                      f"  z {mn.z:.2f}..{mx.z:.2f}  mats {','.join(mats)}{alerte}")
    print('\n'.join(lignes))
    return lignes


def exporter(fichier, racines):
    bpy.context.view_layer.update()
    for o in bpy.context.scene.objects:
        o.select_set(False)
    for r in racines:
        r.select_set(True)
        for c in r.children_recursive:
            c.select_set(True)
    chemin = os.path.join(MODELES, fichier)
    bpy.ops.export_scene.gltf(filepath=chemin, export_format='GLB', use_selection=True, export_apply=True,
                              export_yup=True, export_cameras=False, export_lights=False,
                              export_animations=False)
    print('EXPORT', chemin, os.path.getsize(chemin), 'octets')
    return chemin


def sauver(nom_blend):
    chemin = os.path.join(SOURCES, nom_blend)
    bpy.ops.wm.save_as_mainfile(filepath=chemin)
    print('BLEND', chemin)


# ---------------------------------------------------------------- vitrine + rendu de contrôle
def copier(obs, decalage=(0, 0, 0), rot_z=0.0):
    """Copies liées (même maillage) des objets et de leurs enfants, déplacées pour une vitrine."""
    M = Matrix.Translation(Vector(decalage)) @ Matrix.Rotation(math.radians(rot_z), 4, 'Z')
    res = []
    for o in obs:
        for oo in [o] + list(o.children_recursive):
            c = oo.copy()
            bpy.context.scene.collection.objects.link(c)
            c.parent = None
            c.matrix_world = M @ oo.matrix_world
            c.hide_render = False
            res.append(c)
    return res


def rendu(nom_png, objets=None, direction=(0.0, 1.0, 0.25), taille=(1400, 800), marge=1.12,
          fond='#3a4458', ortho=True, cacher=(), ciel=True):
    """Rendu EEVEE vu depuis `direction` (vers le centre des objets)."""
    sc = bpy.context.scene
    bpy.context.view_layer.update()
    for o in cacher:
        o.hide_render = True
    if objets is None:
        objets = [o for o in sc.objects if o.type == 'MESH' and not o.hide_render]
    mn, mx = boite_englobante(objets)
    centre = (mn + mx) / 2
    d = Vector(direction).normalized()
    f = -d
    droite = f.cross(Vector((0, 0, 1)))
    if droite.length < 1e-6:
        droite = Vector((1, 0, 0))
    droite.normalize()
    haut = droite.cross(f).normalized()
    coins = [Vector((x, y, z)) for x in (mn.x, mx.x) for y in (mn.y, mx.y) for z in (mn.z, mx.z)]
    lx = 2 * max(abs((c - centre).dot(droite)) for c in coins)
    ly = 2 * max(abs((c - centre).dot(haut)) for c in coins)
    W, H = taille
    asp = W / H
    portee = (mx - mn).length + 5
    cam_d = bpy.data.cameras.get('cam_rendu') or bpy.data.cameras.new('cam_rendu')
    cam = bpy.data.objects.get('cam_rendu') or bpy.data.objects.new('cam_rendu', cam_d)
    if cam.name not in sc.collection.objects:
        sc.collection.objects.link(cam)
    cam.location = centre + d * portee
    cam.rotation_euler = f.to_track_quat('-Z', 'Y').to_euler()
    cam_d.clip_end = portee * 4
    # ortho_scale (et le champ de vision) s'appliquent au plus grand côté de l'image
    ech = max(lx, ly * asp) if W >= H else max(lx / asp, ly)
    if ortho:
        cam_d.type = 'ORTHO'
        cam_d.ortho_scale = ech * marge
    else:
        cam_d.type = 'PERSP'
        cam_d.lens = 50
        cam.location = centre + d * (ech * marge * 1.45 + (mx - mn).length / 2)
    sc.camera = cam
    # Lumières : soleil principal + contre-jour léger, ciel uniforme
    soleil_d = bpy.data.lights.get('soleil_rendu') or bpy.data.lights.new('soleil_rendu', 'SUN')
    soleil_d.energy = 3.2
    soleil_d.angle = math.radians(8)
    soleil = bpy.data.objects.get('soleil_rendu') or bpy.data.objects.new('soleil_rendu', soleil_d)
    if soleil.name not in sc.collection.objects:
        sc.collection.objects.link(soleil)
    lum = (d + droite * -0.6 + Vector((0, 0, 1.2))).normalized()
    soleil.rotation_euler = (-lum).to_track_quat('-Z', 'Y').to_euler()
    contre_d = bpy.data.lights.get('contre_rendu') or bpy.data.lights.new('contre_rendu', 'SUN')
    contre_d.energy = 1.2
    contre = bpy.data.objects.get('contre_rendu') or bpy.data.objects.new('contre_rendu', contre_d)
    if contre.name not in sc.collection.objects:
        sc.collection.objects.link(contre)
    lum2 = (-d + droite * 0.8 + Vector((0, 0, 0.6))).normalized()
    contre.rotation_euler = (-lum2).to_track_quat('-Z', 'Y').to_euler()
    w = sc.world or bpy.data.worlds.new('Monde')
    sc.world = w
    try:
        w.use_nodes = True
    except Exception:
        pass
    bg = next(n for n in w.node_tree.nodes if n.type == 'BACKGROUND')
    bg.inputs[0].default_value = (*lin(fond), 1)
    bg.inputs[1].default_value = 1.0
    if ciel:   # vrai ciel (lumière du jour) pour juger le réalisme
        ct = next((n for n in w.node_tree.nodes if n.type == 'TEX_SKY'), None) or w.node_tree.nodes.new('ShaderNodeTexSky')
        for t in ('NISHITA', 'MULTIPLE_SCATTERING', 'SINGLE_SCATTERING', 'HOSEK_WILKIE'):
            try:
                ct.sky_type = t
                break
            except TypeError:
                continue
        for attr, val in (('sun_elevation', math.radians(35)), ('sun_rotation', math.radians(200))):
            try:
                setattr(ct, attr, val)
            except Exception:
                pass
        w.node_tree.links.new(ct.outputs['Color'], bg.inputs[0])
        bg.inputs[1].default_value = 0.22
        soleil_d.energy = 4.0
    try:
        sc.render.engine = 'BLENDER_EEVEE'
    except TypeError:
        sc.render.engine = 'BLENDER_WORKBENCH'
    try:
        sc.eevee.taa_render_samples = 24
    except Exception:
        pass
    try:
        sc.view_settings.view_transform = 'Standard'
    except TypeError:
        pass
    sc.render.resolution_x, sc.render.resolution_y = W, H
    sc.render.resolution_percentage = 100
    sc.render.film_transparent = False
    os.makedirs(RENDUS, exist_ok=True)
    sc.render.filepath = os.path.join(RENDUS, nom_png)
    bpy.ops.render.render(write_still=True)
    for o in cacher:
        o.hide_render = False
    print('RENDU', sc.render.filepath)
