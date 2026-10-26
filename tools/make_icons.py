"""Genera los iconos pixel-art de WinRate (coin rojo con aro plateado y una W)."""
from PIL import Image, ImageDraw
import math, os, sys

OUT = sys.argv[1] if len(sys.argv) > 1 else os.path.join(os.path.dirname(__file__), "..", "icons")
BG = (8, 8, 10, 255)
RED = (255, 30, 60, 255)
RED_D = (150, 0, 24, 255)
RED_L = (255, 120, 135, 255)
SIL = (205, 210, 220, 255)
SIL_D = (120, 126, 138, 255)
SIL_L = (250, 252, 255, 255)
INK = (12, 12, 14, 255)

W_GLYPH = [  # 11x9
    "XX.......XX",
    "XX.......XX",
    "XX...X...XX",
    "XX..XXX..XX",
    "XX.XXXXX.XX",
    "XXXXX.XXXXX",
    "XXXX...XXXX",
    "XXX.....XXX",
    "XX.......XX",
]

def coin(n=32, radius=13.5):
    img = Image.new("RGBA", (n, n), BG)
    px = img.load()
    c = (n - 1) / 2
    for y in range(n):
        for x in range(n):
            d = math.hypot(x - c, y - c)
            if d <= radius:
                # luz arriba-izquierda
                shade = (x - c) + (y - c)
                if d > radius - 2.2:
                    px[x, y] = SIL_L if shade < -8 else (SIL_D if shade > 8 else SIL)
                elif d > radius - 3.2:
                    px[x, y] = RED_D
                else:
                    px[x, y] = RED_L if shade < -14 else (RED_D if shade > 12 else RED)
    gw, gh = len(W_GLYPH[0]), len(W_GLYPH)
    ox, oy = int(round(c - gw / 2 + 0.5)), int(round(c - gh / 2 + 0.5))
    for j, row in enumerate(W_GLYPH):
        for i, ch in enumerate(row):
            if ch == "X":
                px[ox + i + 1, oy + j + 1] = RED_D  # sombra
    for j, row in enumerate(W_GLYPH):
        for i, ch in enumerate(row):
            if ch == "X":
                px[ox + i, oy + j] = SIL_L
    return img

def save(img, size, name):
    img.resize((size, size), Image.NEAREST).save(os.path.join(OUT, name))

os.makedirs(OUT, exist_ok=True)
base = coin(32, 14.6)
save(base, 192, "icon-192.png")
save(base, 512, "icon-512.png")
save(base, 180, "apple-touch-icon.png")
save(base, 64, "favicon-64.png")
# maskable: el coin dentro de la zona segura (80%) sobre fondo completo
m = Image.new("RGBA", (40, 40), BG)
m.paste(coin(32, 13.2), (4, 4))
save(m, 512, "icon-maskable-512.png")
save(m, 192, "icon-maskable-192.png")
print("ok")
