"""Icônes du site (onglet, favori, écran d'accueil) : le « M » doré du logo Mécafé sur fond espresso.
Usage : python3 scripts/make-icons.py  (écrit app/icon.png, app/apple-icon.png, app/favicon.ico ; nécessite Pillow)."""
import sys
from PIL import Image, ImageDraw, ImageFilter, ImageChops
SRC = "public/mecafe-logo.png"
OUT = sys.argv[1] if len(sys.argv) > 1 else "app"

logo = Image.open(SRC).convert("RGBA")
m_alpha = logo.crop((0, 0, 312, 245)).split()[3]
bbox = m_alpha.getbbox(); m_alpha = m_alpha.crop(bbox)

def vgrad(size, top, bottom):
    w, h = size
    g = Image.new("RGBA", size)
    d = ImageDraw.Draw(g)
    for y in range(h):
        t = y / max(1, h - 1)
        d.line([(0, y), (w, y)], fill=tuple(int(top[i] + (bottom[i] - top[i]) * t) for i in range(3)) + (255,))
    return g

def radial(size, center_col, edge_col):
    w, h = size
    g = Image.new("RGBA", size)
    px = g.load()
    cx, cy = w * 0.5, h * 0.32
    maxd = (w ** 2 + h ** 2) ** 0.5 * 0.62
    for y in range(h):
        for x in range(w):
            t = min(1, (((x - cx) ** 2 + (y - cy) ** 2) ** 0.5) / maxd)
            px[x, y] = tuple(int(center_col[i] + (edge_col[i] - center_col[i]) * t) for i in range(3)) + (255,)
    return g

def tile(S, rounded=True):
    # fond espresso, léger halo chaud en haut
    bg = radial((S, S), (74, 48, 30), (22, 14, 9))
    # M doré en dégradé
    mw = int(S * (0.8 if S <= 32 else 0.7 if S <= 64 else 0.64))
    mh = int(m_alpha.height * mw / m_alpha.width)
    a = m_alpha.resize((mw, mh), Image.LANCZOS)
    gold = vgrad((mw, mh), (240, 214, 150), (176, 124, 52))
    gold.putalpha(a)
    # ombre douce sous le M
    sh = Image.new("RGBA", (mw, mh), (0, 0, 0, 0)); sh.putalpha(a.point(lambda v: int(v * 0.55)))
    sh = sh.filter(ImageFilter.GaussianBlur(S * 0.012))
    x = (S - mw) // 2; y = (S - mh) // 2 + int(S * 0.01)
    bg.alpha_composite(sh, (x, y + int(S * 0.012)))
    bg.alpha_composite(gold, (x, y))
    # filet doré intérieur
    d = ImageDraw.Draw(bg)
    inset = int(S * 0.055); r = int(S * 0.17)
    if S >= 128:
        d.rounded_rectangle((inset, inset, S - inset - 1, S - inset - 1), radius=r, outline=(201, 160, 92, 110), width=max(1, S // 128))
    if not rounded:
        return bg
    mask = Image.new("L", (S * 4, S * 4), 0)
    ImageDraw.Draw(mask).rounded_rectangle((0, 0, S * 4 - 1, S * 4 - 1), radius=int(S * 4 * 0.225), fill=255)
    mask = mask.resize((S, S), Image.LANCZOS)
    out = Image.new("RGBA", (S, S), (0, 0, 0, 0)); out.paste(bg, (0, 0), mask)
    return out

tile(512).save(f"{OUT}/icon.png")
tile(180, rounded=False).convert("RGB").save(f"{OUT}/apple-icon.png")
tile(256).save(f"{OUT}/favicon.ico", sizes=[(16, 16), (32, 32), (48, 48), (256, 256)])
