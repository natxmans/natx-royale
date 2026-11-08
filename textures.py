# Natx Royale — textures réalistes fabriquées par calcul (numpy), sans aucune image copiée.
# Chaque texture = une image de couleur (souvent en niveaux de gris, multipliée par la couleur du matériau,
# pour que le jeu puisse la recolorer) + une carte de relief (normal map). Elles se raccordent sans couture.
# Les images sont mises en cache dans sources/textures/ (supprimer un fichier pour le refaire).
import os, math
import numpy as np
import bpy

SOURCES = os.path.dirname(os.path.abspath(__file__))
DOSSIER = os.path.join(SOURCES, 'textures')
os.makedirs(DOSSIER, exist_ok=True)
TAU = math.tau


# ------------------------------------------------------------------ briques de base
def _rng(g):
    return np.random.default_rng(g)


def norm(a):
    a = a - a.min()
    m = a.max()
    return a / m if m > 0 else a


def bruit(n, beta=2.0, graine=0, etire=(1.0, 1.0), m=None):
    """Bruit fractal raccordable (périodique) : n colonnes (U) x m lignes (V), valeurs 0..1.
    beta grand = doux ; etire=(eu, ev) : eu grand -> structures allongées le long de U."""
    m = m or n
    w = _rng(graine).standard_normal((m, n))
    F = np.fft.fft2(w)
    fv = np.fft.fftfreq(m)[:, None]
    fu = np.fft.fftfreq(n)[None, :]
    f = np.sqrt((fu * etire[0]) ** 2 + (fv * etire[1]) ** 2)
    f[0, 0] = 1.0
    F = F / f ** (beta / 2.0)
    F[0, 0] = 0
    return norm(np.real(np.fft.ifft2(F)))


def cellules(n, nb, graine, m=None, etire=(1.0, 1.0)):
    """Cellules (Worley) raccordables : distance au plus proche (d1), au 2e (d2), numéro de cellule."""
    m = m or n
    r = _rng(graine)
    px, py = r.random(nb) * n, r.random(nb) * m
    yy, xx = np.mgrid[0:m, 0:n].astype(np.float32)
    d1 = np.full((m, n), 1e9, np.float32)
    d2 = d1.copy()
    idx = np.zeros((m, n), np.int32)
    for i in range(nb):
        dx = np.abs(xx - px[i]); dx = np.minimum(dx, n - dx) / etire[0]
        dy = np.abs(yy - py[i]); dy = np.minimum(dy, m - dy) / etire[1]
        d = np.sqrt(dx * dx + dy * dy)
        pp = d < d1
        d2 = np.where(pp, d1, np.minimum(d2, d))
        idx = np.where(pp, i, idx)
        d1 = np.where(pp, d, d1)
    return d1, d2, idx


def grille(n, m=None):
    m = m or n
    v, u = np.mgrid[0:m, 0:n].astype(np.float32)
    return (u + 0.5) / n, (v + 0.5) / m


def normale(h, force):
    """Carte de normales (convention OpenGL, comme glTF) à partir d'une hauteur 0..1."""
    gx = (np.roll(h, -1, 1) - np.roll(h, 1, 1)) * 0.5 * force
    gy = (np.roll(h, -1, 0) - np.roll(h, 1, 0)) * 0.5 * force
    nx, ny, nz = -gx, -gy, np.ones_like(h)
    l = np.sqrt(nx * nx + ny * ny + nz * nz)
    return np.stack([nx / l, ny / l, nz / l], -1) * 0.5 + 0.5


def gris(a):
    a = np.clip(a, 0, 1)
    return np.stack([a, a, a], -1)


def melange(a, b, t):
    t = np.clip(t, 0, 1)[..., None] if np.ndim(t) == 2 else t
    return a * (1 - t) + b * t


def couleur(hexa):
    h = hexa.lstrip('#')
    return np.array([int(h[i:i + 2], 16) / 255 for i in (0, 2, 4)], np.float32)


# ------------------------------------------------------------------ enregistrement / cache
def _sauver(nom, rgb, alpha=None, qualite=92):
    H, W = rgb.shape[:2]
    png = alpha is not None
    img = bpy.data.images.new(nom, W, H, alpha=png)
    a = alpha if png else np.ones((H, W), np.float32)
    px = np.concatenate([np.clip(rgb, 0, 1), np.clip(a, 0, 1)[..., None]], -1).astype(np.float32)
    img.pixels.foreach_set(px.ravel())
    chemin = os.path.join(DOSSIER, nom + ('.png' if png else '.jpg'))
    img.filepath_raw = chemin
    img.file_format = 'PNG' if png else 'JPEG'
    img.save(filepath=chemin, quality=qualite)
    bpy.data.images.remove(img)
    return chemin


def fichiers(nom):
    c = os.path.join(DOSSIER, nom + '_couleur')
    return (c + '.png' if os.path.exists(c + '.png') else c + '.jpg'), os.path.join(DOSSIER, nom + '_normal.jpg')


def preparer(nom):
    """Fabrique la texture `nom` si elle n'est pas déjà en cache ; renvoie (chemin couleur, chemin normales)."""
    c, nrm = fichiers(nom)
    if not (os.path.exists(c) and os.path.exists(nrm)):
        rgb, h, force, alpha = GENERATEURS[nom]()
        _sauver(nom + '_couleur', rgb, alpha)
        _sauver(nom + '_normal', normale(h, force))
        c, nrm = fichiers(nom)
    return c, nrm


# ------------------------------------------------------------------ textures « détail » (gris x couleur du matériau)
def t_bois(n=512):
    u, v = grille(n)
    base = bruit(n, 2.4, 11, etire=(14, 1))
    fibres = bruit(n, 1.1, 12, etire=(30, 1))
    anneaux = 0.5 + 0.5 * np.sin(TAU * (v * 9 + base * 2.6))
    lignes = anneaux ** 8
    tache = bruit(n, 3.0, 13)
    g = 0.86 - 0.32 * lignes + 0.12 * (fibres - 0.5) - 0.12 * (tache - 0.5)
    h = 0.55 * (1 - lignes) + 0.45 * fibres
    return gris(g), h, 3.0, None


def t_ecorce(n=512, m=1024):
    d1, d2, idx = cellules(n, 46, 21, m=m, etire=(1.0, 4.5))
    fissure = np.clip((d2 - d1) / 18.0, 0, 1)
    rugueux = bruit(n, 1.6, 22, etire=(1, 5), m=m)
    plaque = (idx * 0.618) % 1.0
    h = 0.75 * fissure ** 0.6 + 0.25 * rugueux
    g = 0.25 + 0.6 * fissure ** 0.7 + 0.15 * (rugueux - 0.5) + 0.08 * (plaque - 0.5)
    return gris(g), h, 9.0, None


def t_pierre(n=512):
    d1, d2, idx = cellules(n, 26, 31)
    joint = np.clip((d2 - d1) / 10.0, 0, 1)
    gros = bruit(n, 2.6, 32)
    fin = bruit(n, 1.0, 33)
    teinte = ((idx * 0.37) % 1.0)
    h = 0.5 * joint ** 0.5 + 0.35 * gros + 0.15 * fin
    g = 0.5 + 0.22 * (gros - 0.5) + 0.12 * (fin - 0.5) + 0.12 * (teinte - 0.5) - 0.35 * (1 - joint) ** 6
    return gris(g + 0.15), h, 7.0, None


def t_metal(n=512):
    u, v = grille(n)
    brosse = bruit(n, 0.8, 41, etire=(60, 1))
    sale = bruit(n, 3.0, 42)
    r = _rng(43)
    rayures = np.zeros((n, n), np.float32)
    for _ in range(70):
        x0, y0 = r.random() * n, r.random() * n
        a, l = r.random() * math.pi, 20 + r.random() * 90
        for t in np.linspace(0, 1, int(l)):
            x, y = int(x0 + math.cos(a) * l * t) % n, int(y0 + math.sin(a) * l * t) % n
            rayures[y, x] = 1.0
    g = 0.86 + 0.08 * (brosse - 0.5) - 0.18 * (sale - 0.4).clip(0) + 0.12 * rayures
    h = 0.6 * brosse + 0.4 * (1 - rayures)
    return gris(g), h, 1.5, None


def t_peinture(n=512):
    peau_orange = bruit(n, 0.9, 51)
    d1, d2, idx = cellules(n, 60, 52)
    eclat = ((d1 < 7) & ((idx % 4) == 0)).astype(np.float32)
    sale = bruit(n, 3.2, 53)
    g = 0.95 - 0.5 * eclat - 0.15 * (sale - 0.45).clip(0) + 0.03 * (peau_orange - 0.5)
    h = 0.85 - 0.6 * eclat + 0.08 * peau_orange
    return gris(g), h, 4.0, None


def t_polymere(n=512):
    grain = bruit(n, 0.3, 61)
    d1, d2, idx = cellules(n, 260, 62)
    bosse = np.clip(1 - d1 / 9.0, 0, 1)
    g = 0.93 + 0.05 * (grain - 0.5) + 0.03 * bosse
    h = 0.5 * grain + 0.5 * bosse
    return gris(g), h, 2.5, None


def t_caoutchouc(n=512):
    grain = bruit(n, 0.6, 71)
    sale = bruit(n, 3.0, 72)
    g = 0.9 + 0.06 * (grain - 0.5) - 0.08 * sale
    return gris(g), grain, 1.5, None


def t_pneu(n=512):
    u, v = grille(n)
    chevron = (u * 10 + np.abs(v - 0.5) * 3) % 1.0
    sillon = (chevron < 0.18).astype(np.float32)
    rainure = (np.abs(v - 0.5) < 0.03).astype(np.float32) + (np.abs(np.abs(v - 0.5) - 0.3) < 0.025)
    creux = np.clip(sillon + rainure, 0, 1)
    grain = bruit(n, 0.7, 73)
    g = 0.95 - 0.35 * creux + 0.05 * (grain - 0.5)
    return gris(g), 1 - creux * 0.9 + 0.05 * grain, 8.0, None


def t_tissu(n=512, k=64):
    u, v = grille(n)
    chaine = np.abs(np.sin(math.pi * u * k))
    trame = np.abs(np.sin(math.pi * v * k))
    dessus = ((np.floor(u * k) + np.floor(v * k)) % 2 == 0)
    h = np.where(dessus, chaine * (0.6 + 0.4 * trame), trame * (0.6 + 0.4 * chaine))
    duvet = bruit(n, 1.2, 81)
    g = 0.84 + 0.12 * h + 0.06 * (duvet - 0.5)
    return gris(g), 0.85 * h + 0.15 * duvet, 2.5, None


def t_tricot(n=512, k=24, k2=32):
    u, v = grille(n)
    cu, cv = (u * k) % 1.0, (v * k2) % 1.0
    d = np.abs(cu - 0.5)
    boucle = np.cos(math.pi * np.clip(np.abs((cv - d * 0.9) - 0.35) * 2.2, 0, 1)) ** 2
    bord = np.clip(1 - np.abs(d - 0.25) * 6, 0, 1)
    h = np.clip(boucle * (0.6 + 0.4 * bord), 0, 1)
    duvet = bruit(n, 1.0, 82)
    g = 0.78 + 0.2 * h + 0.05 * (duvet - 0.5)
    return gris(g), 0.9 * h + 0.1 * duvet, 5.0, None


def t_cuir(n=512):
    d1, d2, idx = cellules(n, 700, 91)
    bosse = np.clip((d2 - d1) / 5.0, 0, 1) ** 0.6
    pli = bruit(n, 2.4, 92)
    g = 0.86 + 0.08 * bosse + 0.08 * (pli - 0.5)
    return gris(g), 0.7 * bosse + 0.3 * pli, 3.5, None


def t_peau(n=512):
    pores = bruit(n, 0.4, 101)
    d1, d2, idx = cellules(n, 900, 102)
    trou = np.clip(1 - d1 / 2.2, 0, 1)
    tache = bruit(n, 3.0, 103)
    g = 0.94 + 0.05 * (tache - 0.5) - 0.06 * trou + 0.02 * (pores - 0.5)
    h = 0.75 + 0.15 * pores - 0.4 * trou
    return gris(g), h, 1.2, None


def t_cheveux(n=512):
    meches = bruit(n, 1.4, 111, etire=(1, 80))
    fins = bruit(n, 0.5, 112, etire=(1, 120))
    paquets = bruit(n, 2.4, 113, etire=(1, 10))
    g = 0.55 + 0.3 * meches + 0.12 * (fins - 0.5) + 0.12 * (paquets - 0.5)
    h = 0.5 * meches + 0.3 * fins + 0.2 * paquets
    return gris(g), h, 4.0, None


def t_papier(n=512):
    fibres = bruit(n, 1.0, 121, etire=(3, 1))
    g = 0.95 + 0.04 * (fibres - 0.5)
    return gris(g), fibres, 0.8, None


def t_eau(n=512):
    u, v = grille(n)
    h = (np.sin(TAU * (u * 6 + v * 2)) + np.sin(TAU * (u * -3 + v * 7)) * 0.7 +
         np.sin(TAU * (u * 11 - v * 5)) * 0.4) / 2.1 * 0.5 + 0.5
    h = 0.7 * h + 0.3 * bruit(n, 2.0, 131)
    return gris(np.ones((n, n)) * 0.95), h, 5.0, None


def t_ecailles(n=512, k=12):
    u, v = grille(n)
    rang = np.floor(v * k)
    uu = (u * k + 0.5 * (rang % 2)) % 1.0
    vv = (v * k) % 1.0
    d = np.sqrt((uu - 0.5) ** 2 + (vv - 0.15) ** 2 * 1.3)
    h = np.clip(1 - d * 1.6, 0, 1) ** 0.7
    g = 0.7 + 0.3 * h
    return gris(g), h, 6.0, None


def t_membrane(n=512):
    d1, d2, idx = cellules(n, 30, 141)
    veine = np.clip(1 - (d2 - d1) / 4.0, 0, 1)
    peau = bruit(n, 1.6, 142)
    g = 0.85 - 0.3 * veine + 0.08 * (peau - 0.5)
    return gris(g), 0.6 * veine + 0.4 * peau, 4.0, None


def t_iris(n=256):
    u, v = grille(n)
    x, y = u - 0.5, v - 0.5
    r = np.sqrt(x * x + y * y) * 2
    a = np.arctan2(y, x)
    fibres = bruit(n, 1.0, 151)
    rayons = 0.5 + 0.5 * np.sin(a * 60 + fibres * 8)
    g = 0.55 + 0.35 * rayons * (1 - r) + 0.15 * (fibres - 0.5)
    g = np.where(r > 0.86, 0.25, g)                 # anneau sombre au bord de l'iris
    g = np.where(r < 0.33, 0.04, g)                 # pupille
    g = np.where(r > 1.0, 1.0, g)
    return gris(g), 1 - np.clip(r, 0, 1) * 0.3, 1.0, None


# ------------------------------------------------------------------ textures en couleur
def _tampon(A, C, Hh, x, y, r, col, hv, a=1.0):
    Hgt, W = A.shape
    x0, x1 = int(max(0, x - r - 1)), int(min(W, x + r + 2))
    y0, y1 = int(max(0, y - r - 1)), int(min(Hgt, y + r + 2))
    if x1 <= x0 or y1 <= y0:
        return
    yy, xx = np.mgrid[y0:y1, x0:x1]
    d = np.sqrt((xx - x) ** 2 + (yy - y) ** 2) / max(r, 0.5)
    msk = d <= 1.0
    C[y0:y1, x0:x1][msk] = col
    A[y0:y1, x0:x1][msk] = np.maximum(A[y0:y1, x0:x1][msk], a)
    Hh[y0:y1, x0:x1][msk] = np.maximum(Hh[y0:y1, x0:x1][msk], hv * (1 - d[msk] ** 2))


def _trait(A, C, Hh, x0, y0, x1, y1, r0, r1, col, hv=1.0):
    l = math.hypot(x1 - x0, y1 - y0)
    n = max(2, int(l / max(0.6, min(r0, r1) * 0.7)))
    for i in range(n + 1):
        t = i / n
        _tampon(A, C, Hh, x0 + (x1 - x0) * t, y0 + (y1 - y0) * t, r0 + (r1 - r0) * t, col, hv)


def _feuille(A, C, Hh, cx, cy, l, w, ang, col, nervure=None):
    Hgt, W = A.shape
    R = int(l * 0.6 + 2)
    x0, x1, y0, y1 = max(0, int(cx - R)), min(W, int(cx + R)), max(0, int(cy - R)), min(Hgt, int(cy + R))
    if x1 <= x0 or y1 <= y0:
        return
    yy, xx = np.mgrid[y0:y1, x0:x1].astype(np.float32)
    ca, sa = math.cos(ang), math.sin(ang)
    lx = (xx - cx) * ca + (yy - cy) * sa
    ly = -(xx - cx) * sa + (yy - cy) * ca
    t = lx / (l / 2)
    largeur = (w / 2) * np.clip(1 - t * t, 0, 1) ** 0.75
    msk = (np.abs(t) <= 1) & (np.abs(ly) <= largeur)
    hv = np.where(largeur > 0, 1 - (np.abs(ly) / np.maximum(largeur, 1e-3)) ** 2, 0)
    teinte = col * (0.85 + 0.25 * (t[..., None] * 0.5 + 0.5))
    if nervure is not None:
        sur = np.abs(ly) < 1.2
        teinte = np.where(sur[..., None], nervure, teinte)
    zone = C[y0:y1, x0:x1]
    zone[msk] = teinte[msk]
    A[y0:y1, x0:x1][msk] = 1.0
    Hh[y0:y1, x0:x1][msk] = np.maximum(Hh[y0:y1, x0:x1][msk], 0.4 + 0.6 * hv[msk])


def atlas_feuillage(T=512):
    """Atlas 3 x 2 tuiles (RGBA, transparence = découpe des feuilles) :
    rangée du haut : sapin, sapin enneigé, feuillu ; rangée du bas : palmier, cactus (opaque), buisson."""
    W, Hgt = 3 * T, 2 * T
    A = np.zeros((Hgt, W), np.float32)
    C = np.zeros((Hgt, W, 3), np.float32) + couleur('#2c4a1c')
    Hh = np.zeros((Hgt, W), np.float32)
    r = _rng(201)

    def tuile(i, j):
        return i * T, j * T

    # --- sapin (et sapin enneigé) : rameau central, aiguilles des deux côtés
    for (i, j), neige in (((0, 1), False), ((1, 1), True)):
        ox, oy = tuile(i, j)
        cx = ox + T / 2
        _trait(A, C, Hh, cx, oy + 8, cx, oy + T - 16, 6, 2.5, couleur('#4a3121'), 1.0)
        for k in range(28):
            y = oy + 20 + k * (T - 50) / 28
            lg = (T * 0.42) * (1 - (k / 28) * 0.75)
            for s in (-1, 1):
                for b in range(3):
                    yb = y + b * 4
                    x1 = cx + s * lg * (0.45 + 0.55 * r.random())
                    y1 = yb + lg * (0.25 + 0.2 * r.random())
                    _trait(A, C, Hh, cx + s * 2, yb, cx + s * lg * 0.5, yb + lg * 0.18, 2.5, 1.8, couleur('#3d2a1c'))
                    for q in range(int(lg / 7)):
                        t = q / max(1, int(lg / 7))
                        px, py = cx + s * lg * 0.5 * t, yb + lg * 0.18 * t
                        for side in (-1, 1):
                            vert = couleur('#2f5a26') * (0.75 + 0.5 * r.random())
                            _trait(A, C, Hh, px, py, px + s * 9 + side * 3, py + side * 9 + 6, 1.4, 0.9, vert, 0.8)
            if neige:
                for s in (-1, 1):
                    for q in range(10):
                        px = cx + s * lg * (0.1 + 0.5 * r.random())
                        py = y + 4 + r.random() * 10
                        _tampon(A, C, Hh, px, py, 4 + r.random() * 7, couleur('#f2f6fb') * (0.92 + 0.08 * r.random()), 1.0)
    # --- feuillu : grappe de feuilles
    ox, oy = tuile(2, 1)
    for k in range(5):
        a = -math.pi / 2 + (k - 2) * 0.45
        _trait(A, C, Hh, ox + T / 2, oy + 10, ox + T / 2 + math.cos(a + math.pi) * -T * 0.35,
               oy + 10 + T * 0.55 * (0.7 + 0.3 * r.random()), 3, 1.5, couleur('#4a3424'))
    for k in range(95):
        cx = ox + T / 2 + (r.random() - 0.5) * T * 0.82
        cy = oy + T * 0.12 + r.random() * T * 0.8
        if math.hypot((cx - ox - T / 2) / (T * 0.45), (cy - oy - T * 0.55) / (T * 0.45)) > 1:
            continue
        vert = couleur(['#3f7a2a', '#4f8f30', '#36692a', '#5c9a36'][k % 4]) * (0.85 + 0.3 * r.random())
        _feuille(A, C, Hh, cx, cy, 46 + r.random() * 24, 24 + r.random() * 10, r.random() * math.tau, vert,
                 vert * 0.7)
    # --- palmier : nervure centrale + folioles retombantes
    ox, oy = tuile(0, 0)
    _trait(A, C, Hh, ox + 10, oy + T / 2, ox + T - 10, oy + T / 2, 5, 2, couleur('#6b7a32'))
    for k in range(34):
        x = ox + 20 + k * (T - 40) / 34
        lg = T * 0.42 * math.sin(math.pi * (k + 2) / 37)
        for s in (-1, 1):
            vert = couleur('#4c8a2e') * (0.8 + 0.35 * r.random())
            _feuille(A, C, Hh, x + lg * 0.35, oy + T / 2 + s * lg * 0.42, lg, 13, s * 1.05, vert, vert * 0.75)
    # --- cactus : peau verte côtelée avec aréoles et épines (opaque)
    ox, oy = tuile(1, 0)
    u, v = grille(T)
    cotes = 0.5 + 0.5 * np.cos(TAU * u * 8)
    grain = bruit(T, 1.2, 202)
    base = couleur('#3f7d3a')
    C[oy:oy + T, ox:ox + T] = base[None, None, :] * (0.65 + 0.35 * cotes[..., None] + 0.1 * (grain[..., None] - 0.5))
    A[oy:oy + T, ox:ox + T] = 1.0
    Hh[oy:oy + T, ox:ox + T] = 0.7 * cotes + 0.3 * grain
    for c in range(8):
        for q in range(14):
            px, py = ox + (c + 0.0) * T / 8, oy + (q + 0.5 + 0.5 * (c % 2)) * T / 14
            _tampon(A, C, Hh, px, py, 4, couleur('#e9e2c4'), 1.0)
            for s in (-1, 1):
                _trait(A, C, Hh, px, py, px + s * 9, py + 6, 1.0, 0.6, couleur('#f5efd8'), 1.0)
    # --- buisson : petites feuilles serrées
    ox, oy = tuile(2, 0)
    for k in range(240):
        cx = ox + T / 2 + (r.random() - 0.5) * T * 0.9
        cy = oy + T / 2 + (r.random() - 0.5) * T * 0.9
        if math.hypot((cx - ox - T / 2) / (T * 0.47), (cy - oy - T / 2) / (T * 0.47)) > 1:
            continue
        vert = couleur(['#2f6e2a', '#3b7f30', '#285a24'][k % 3]) * (0.85 + 0.3 * r.random())
        _feuille(A, C, Hh, cx, cy, 26 + r.random() * 12, 13 + r.random() * 5, r.random() * math.tau, vert, vert * 0.7)
    return C, Hh, 5.0, A


def atlas_tronc(T=512):
    """Atlas de 3 tuiles hautes (T x 2T) : écorce de pin, écorce de feuillu, tronc de palmier."""
    W, Hgt = 3 * T, 2 * T
    C = np.zeros((Hgt, W, 3), np.float32)
    Hh = np.zeros((Hgt, W), np.float32)
    for i, (graine, c1, c2) in enumerate(((301, '#5a3726', '#8a5a3c'), (302, '#4b4540', '#7d756b'))):
        d1, d2, idx = cellules(T, 40 if i == 0 else 70, graine, m=2 * T, etire=(1.0, 4.0 if i == 0 else 2.2))
        fiss = np.clip((d2 - d1) / (16 if i == 0 else 9), 0, 1)
        rug = bruit(T, 1.5, graine + 5, etire=(1, 5), m=2 * T)
        t = 0.75 * fiss ** 0.6 + 0.25 * rug
        C[:, i * T:(i + 1) * T] = melange(couleur(c1) * 0.55, couleur(c2), t)
        Hh[:, i * T:(i + 1) * T] = t
    u, v = grille(T, 2 * T)
    anneau = (v * 18) % 1.0
    bord = np.clip(np.abs(anneau - 0.5) * 2, 0, 1) ** 3
    fibres = bruit(T, 1.0, 310, etire=(6, 1), m=2 * T)
    t = 1 - 0.6 * bord + 0.25 * (fibres - 0.5)
    C[:, 2 * T:] = melange(couleur('#5b4a36'), couleur('#a08465'), t)
    Hh[:, 2 * T:] = t
    return C, Hh, 7.0, None


def t_pizza(n=512):
    fromage = bruit(n, 2.2, 401)
    bulles = cellules(n, 50, 402)[0]
    dore = np.clip(1 - bulles / 22, 0, 1) ** 2
    c = melange(couleur('#ffd96a'), couleur('#f5b83a'), fromage)
    c = melange(c, couleur('#c4772b'), dore * 0.9)
    sauce = (bruit(n, 2.6, 403) > 0.72)
    c = np.where(sauce[..., None], couleur('#c8452f'), c)
    return c, 0.6 * fromage + 0.4 * dore, 5.0, None


def t_tapis(n=512):
    u, v = grille(n)
    x, y = np.abs(u - 0.5) * 2, np.abs(v - 0.5) * 2
    losange = (x + y)
    bord = np.maximum(x, y)
    c = np.zeros((n, n, 3), np.float32) + couleur('#9e1b3a')
    c = np.where(((losange % 0.25) < 0.05)[..., None], couleur('#e9b949'), c)
    c = np.where((losange < 0.35)[..., None], couleur('#1d3f7a'), c)
    c = np.where((losange < 0.18)[..., None], couleur('#e9b949'), c)
    c = np.where(((bord > 0.82) & (bord < 0.9))[..., None], couleur('#e9b949'), c)
    c = np.where((bord >= 0.9)[..., None], couleur('#1d3f7a'), c)
    laine = t_tissu(n, 128)[1]
    c = c * (0.85 + 0.2 * laine[..., None])
    return c, laine, 2.0, None


def t_feuille_geante(n=512):
    u, v = grille(n)
    x = (u - 0.5) * 2
    nerv = np.exp(-(x / 0.012) ** 2)
    sec = np.zeros_like(u)
    for k in range(-6, 7):
        y0 = 0.5 + k * 0.08
        sec = np.maximum(sec, np.exp(-((v - y0 - np.abs(x) * 0.35) / 0.008) ** 2) * (np.abs(x) > 0.02))
    grain = bruit(n, 1.4, 501)
    c = melange(couleur('#3c8f2c'), couleur('#6cc04a'), 0.5 + 0.4 * (grain - 0.5) + 0.3 * (1 - np.abs(x)))
    c = melange(c, couleur('#b9e08a'), np.clip(nerv + sec * 0.7, 0, 1))
    return c, 0.6 * (nerv + sec * 0.5) + 0.4 * grain, 4.0, None


GENERATEURS = {
    'bois': t_bois, 'ecorce': t_ecorce, 'pierre': t_pierre, 'metal': t_metal, 'peinture': t_peinture,
    'polymere': t_polymere, 'caoutchouc': t_caoutchouc, 'pneu': t_pneu, 'tissu': t_tissu, 'tricot': t_tricot,
    'cuir': t_cuir, 'peau': t_peau, 'cheveux': t_cheveux, 'papier': t_papier, 'eau': t_eau,
    'ecailles': t_ecailles, 'membrane': t_membrane, 'iris': t_iris,
    'atlas_feuillage': atlas_feuillage, 'atlas_tronc': atlas_tronc,
    'pizza': t_pizza, 'tapis': t_tapis, 'feuille_geante': t_feuille_geante,
}
