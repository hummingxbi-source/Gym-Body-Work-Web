"""
remove_bg.py
Quita el fondo de dumbbell-profile.png usando rembg,
redimensiona a máx 1024px (lado largo) con margen de 40px,
guarda dumbbell-cutout.png y genera preview-black.png para verificar.
"""

from pathlib import Path
from rembg import remove
from PIL import Image
import io

# ── rutas ──────────────────────────────────────────────────────────────────
HERE   = Path(__file__).parent
SRC    = HERE / "dumbbell-profile.png"
OUT    = HERE / "dumbbell-cutout.png"
PREV   = HERE / "preview-black.png"

MAX_LONG = 1024   # píxeles del lado largo (incluyendo margen)
MARGIN   = 40     # píxeles de espacio vacío por cada lado

# ── 1. quitar fondo ─────────────────────────────────────────────────────────
print("Eliminando fondo con rembg…")
with open(SRC, "rb") as f:
    raw = f.read()

result_bytes = remove(raw)
cutout = Image.open(io.BytesIO(result_bytes)).convert("RGBA")
print(f"  Tamaño tras rembg: {cutout.size}")

# ── 2. recortar a bbox del contenido real (sin píxeles transparentes) ────────
bbox = cutout.getbbox()
if bbox:
    cutout = cutout.crop(bbox)
    print(f"  Tras crop bbox: {cutout.size}")

# ── 3. redimensionar para que el sujeto quepa en (MAX_LONG - 2*MARGIN) ──────
subject_max = MAX_LONG - 2 * MARGIN   # 944 px
w, h = cutout.size
scale = min(subject_max / w, subject_max / h)

if scale < 1.0:          # solo reducir, nunca ampliar
    new_w = round(w * scale)
    new_h = round(h * scale)
    cutout = cutout.resize((new_w, new_h), Image.LANCZOS)
    print(f"  Redimensionado a: {cutout.size}")
else:
    print(f"  No es necesario redimensionar (imagen ya cabe).")

# ── 4. añadir margen ─────────────────────────────────────────────────────────
canvas_w = cutout.width  + 2 * MARGIN
canvas_h = cutout.height + 2 * MARGIN
canvas = Image.new("RGBA", (canvas_w, canvas_h), (0, 0, 0, 0))
canvas.paste(cutout, (MARGIN, MARGIN), cutout)
print(f"  Tamaño final (con margen): {canvas.size}")

# ── 5. guardar cutout PNG con transparencia ───────────────────────────────────
canvas.save(OUT, "PNG")
print(f"  Guardado: {OUT}")

# ── 6. vista previa sobre fondo negro ────────────────────────────────────────
preview = Image.new("RGB", canvas.size, (0, 0, 0))
preview.paste(canvas, mask=canvas.split()[3])   # alpha como máscara
preview.save(PREV, "PNG")
print(f"  Vista previa guardada: {PREV}")
print("¡Listo!")
