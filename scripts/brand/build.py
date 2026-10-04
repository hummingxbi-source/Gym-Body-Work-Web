"""One-off brand asset builder (not part of the site build).

Usage (from repo root):
    python scripts/brand/build.py
    npx svgo -f public/brand -o public/brand && npx svgo public/favicon.svg -o public/favicon.svg

Needs: pillow, numpy, scipy, fonttools + brotli (only to read the woff2 fonts).
Colors mirror the tokens in src/styles/global.css (--text, --red, --bg).
"""
import io
import os
import sys

sys.path.insert(0, os.path.dirname(__file__))
import numpy as np
from PIL import Image, ImageDraw, ImageFilter, ImageFont
from fontTools.ttLib import TTFont
from runner import BODY, HEAD, LEG

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".."))
PUB = os.path.join(ROOT, "public")
BRAND = os.path.join(PUB, "brand")
os.makedirs(BRAND, exist_ok=True)

# tokens (src/styles/global.css)
TEXT, RED, BG = "#f1ede6", "#d1121b", "#0b0b0c"

# runner bbox in source px
X0, Y0, X1, Y1 = 28.0, 37.5, HEAD["cx"] + HEAD["rx"], 343.0
W, H = X1 - X0, Y1 - Y0


def f(v):
    s = f"{v:.1f}".rstrip("0").rstrip(".")
    return "0" if s in ("-0", "") else s


def path_d(scale=1.0, ox=0.0, oy=0.0):
    """Single path 'd' for the runner, mapped to (ox,oy)+scale*(p-origin)."""
    T = lambda p: (ox + (p[0] - X0) * scale, oy + (p[1] - Y0) * scale)
    out = []
    for sh in (BODY, LEG):
        x, y = T(sh["start"])
        out.append(f"M{f(x)} {f(y)}")
        for c1, c2, p in sh["segs"]:
            pts = [T(c1), T(c2), T(p)]
            out.append("C" + " ".join(f"{f(a)} {f(b)}" for a, b in pts))
        out.append("Z")
    h = HEAD
    cx, cy = T((h["cx"], h["cy"]))
    rx, ry = h["rx"] * scale, h["ry"] * scale
    out.append(f"M{f(cx - rx)} {f(cy)}a{f(rx)} {f(ry)} 0 1 1 {f(2 * rx)} 0a{f(rx)} {f(ry)} 0 1 1 {f(-2 * rx)} 0Z")
    return "".join(out)


def write(path, text):
    with open(path, "w", encoding="utf-8") as fh:
        fh.write(text)


# ---- SVG marks -------------------------------------------------------------
D = path_d()
VB = f"0 0 {f(W)} {f(H)}"
for name, color in (("light", TEXT), ("red", RED), ("mono-dark", BG)):
    write(os.path.join(BRAND, f"mark-{name}.svg"),
          f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="{VB}"><path fill="{color}" d="{D}"/></svg>\n')
write(os.path.join(ROOT, "scripts", "brand", "runner-path.txt"), f"{VB}\n{D}\n")

# ---- Favicon SVG (64 grid, thickened runner so it survives at 16px) ------------
FAV_STROKE = 4.0   # in 64-grid units; fattens thin leg/arm tips
FAV_W = 48.0
fs = FAV_W / W
fox = (64 - FAV_W) / 2
foy = (64 - H * fs) / 2
FD = path_d(fs, fox, foy)
write(os.path.join(PUB, "favicon.svg"),
      f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><rect width="64" height="64" rx="14" fill="{BG}"/>'
      f'<path fill="{RED}" stroke="{RED}" stroke-width="{FAV_STROKE}" stroke-linejoin="round" d="{FD}"/></svg>\n')

# ---- Raster helpers (same geometry, supersampled) ---------------------------------
SS = 8


def bez(p0, c1, c2, p3, n=40):
    t = np.linspace(0, 1, n)[1:, None]
    u = 1 - t
    return u**3 * np.array(p0) + 3 * u**2 * t * np.array(c1) + 3 * u * t**2 * np.array(c2) + t**3 * np.array(p3)


def poly(sh):
    pts = [np.array(sh["start"], float)[None]]
    p0 = sh["start"]
    for c1, c2, p in sh["segs"]:
        pts.append(bez(p0, c1, c2, p))
        p0 = p
    return np.vstack(pts)


def runner_mask(size_w, size_h, scale, ox, oy, grow=0.0):
    """L-mode mask (supersampled then reduced) of runner placed at (ox,oy) with given scale."""
    big = Image.new("L", (size_w * SS, size_h * SS), 0)
    d = ImageDraw.Draw(big)
    T = lambda a: [((ox + (x - X0) * scale) * SS, (oy + (y - Y0) * scale) * SS) for x, y in a]
    for sh in (BODY, LEG):
        d.polygon(T(poly(sh)), fill=255)
    h = HEAD
    (cx, cy), = T([(h["cx"], h["cy"])])
    rx, ry = h["rx"] * scale * SS, h["ry"] * scale * SS
    d.ellipse([cx - rx, cy - ry, cx + rx, cy + ry], fill=255)
    if grow > 0:  # same effect as an SVG stroke of width 2*grow, round joins
        from scipy import ndimage as ndi
        dist = ndi.distance_transform_edt(np.asarray(big) == 0)
        big = Image.fromarray(((dist <= grow * SS) * 255).astype("uint8"))
    return big.resize((size_w, size_h), Image.LANCZOS)


def hexrgb(h):
    return tuple(int(h[i:i + 2], 16) for i in (1, 3, 5))


def rounded_bg(size, radius_frac):
    big = Image.new("L", (size * SS, size * SS), 0)
    ImageDraw.Draw(big).rounded_rectangle([0, 0, size * SS - 1, size * SS - 1], radius=size * SS * radius_frac, fill=255)
    return big.resize((size, size), Image.LANCZOS)


def favicon_png(size):
    k = size / 64.0
    m = runner_mask(size, size, fs * k, fox * k, foy * k, grow=FAV_STROKE * k / 2)
    img = Image.new("RGBA", (size, size), hexrgb(BG) + (255,))
    img.paste(Image.new("RGBA", (size, size), hexrgb(RED) + (255,)), (0, 0), m)
    out = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    out.paste(img, (0, 0), rounded_bg(size, 14 / 64))
    return out


favicon_png(32).save(os.path.join(PUB, "favicon-32.png"), optimize=True)
icon512 = favicon_png(512)
icon512.save(os.path.join(PUB, "icon-512.png"), optimize=True)


def apple_touch(size=180):
    # iOS applies its own mask: full-bleed square, no transparency
    k = size / 64.0
    m = runner_mask(size, size, fs * k, fox * k, foy * k, grow=FAV_STROKE * k / 2)
    img = Image.new("RGB", (size, size), hexrgb(BG))
    img.paste(Image.new("RGB", (size, size), hexrgb(RED)), (0, 0), m)
    return img


apple_touch().save(os.path.join(PUB, "apple-touch-icon.png"), optimize=True)

# ---- Fonts (woff2 -> TTF in memory) ------------------------------------------------


def load_font(woff2, px, wght=None):
    tt = TTFont(os.path.join(PUB, "fonts", woff2))
    tt.flavor = None
    buf = io.BytesIO()
    tt.save(buf)
    buf.seek(0)
    ft = ImageFont.truetype(buf, px)
    if wght is not None:
        try:
            ft.set_variation_by_axes([wght])
        except Exception:
            pass
    return ft


# ---- OG image 1200x630 ----------------------------------------------------------------
OW, OH = 1200, 630
og = Image.new("RGB", (OW, OH), hexrgb(BG))
mh = 400
ms = mh / H
mw = int(W * ms)
mx, my = 70, (OH - mh) // 2
m = runner_mask(OW, OH, ms, mx, my)
og.paste(Image.new("RGB", (OW, OH), hexrgb(TEXT)), (0, 0), m)
d = ImageDraw.Draw(og)
tx = 590
anton = load_font("Anton-Regular.woff2", 122)
inter = load_font("Inter-Medium.woff2", 22, 500)
d.text((tx, 330), "BODY WORK", font=anton, fill=hexrgb(TEXT), anchor="ls")
bb = d.textbbox((tx, 330), "BODY WORK", font=anton, anchor="ls")
d.rectangle([tx, 362, tx + 80, 367], fill=hexrgb(RED))
tag = "GYM & FITNESS · CUAUTITLÁN IZCALLI"
# letter-spaced tagline
x = tx
for ch in tag:
    d.text((x, 410), ch, font=inter, fill=hexrgb(TEXT), anchor="ls")
    x += d.textlength(ch, font=inter) + 2
print("og text right edge:", bb[2], "tagline right:", x)
og.save(os.path.join(PUB, "og-image.jpg"), quality=90, optimize=True, progressive=True)

# ---- Favicon preview sheet (16 / 32 / 180) ----------------------------------------------
sheet = Image.new("RGB", (620, 260), hexrgb("#8a8a90"))
sd = ImageDraw.Draw(sheet)
x = 20
for s, label in ((16, "16"), (32, "32"), (180, "180")):
    ic = favicon_png(s) if s != 180 else apple_touch(180).convert("RGBA")
    sheet.paste(ic, (x, 30), ic)
    zoom = favicon_png(s).resize((s * 6, s * 6), Image.NEAREST) if s == 16 else None
    sd.text((x, 220), f"{label}px", fill=hexrgb(TEXT))
    x += s + 40
z16 = favicon_png(16).resize((96, 96), Image.NEAREST)
sheet.paste(z16, (500, 30), z16)
sd.text((500, 140), "16px ×6", fill=hexrgb(TEXT))
os.makedirs(os.path.join(ROOT, "assets-src"), exist_ok=True)
sheet.save(os.path.join(ROOT, "assets-src", "favicon-preview.png"))
print("done")
