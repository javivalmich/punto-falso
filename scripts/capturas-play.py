"""Capturas de la ficha de Google Play: cada captura de Android se encaja ENTERA (sin recortar ni deformar) y centrada en un lienzo de 1080x1920
con fondo negro y resplandor rojo de la marca. Sin textos ni marcos.
Uso: python -I scripts/capturas-play.py "<carpeta con las capturas>" "<carpeta de salida>"   (necesita Pillow)"""
import sys
from pathlib import Path
from PIL import Image, ImageFilter
W, H = 1080, 1920
origen, salida = Path(sys.argv[1]), Path(sys.argv[2])
salida.mkdir(parents=True, exist_ok=True)

def fondo():
    # negro #070706 con un resplandor rojo suave arriba y abajo (mismo estilo que el gráfico de funciones)
    f = Image.new('RGB', (W, H), (7, 7, 6))
    for cy in (0, H):
        glow = Image.new('RGB', (W, H), (7, 7, 6))
        from PIL import ImageDraw
        d = ImageDraw.Draw(glow)
        d.ellipse((W // 2 - 620, cy - 520, W // 2 + 620, cy + 520), fill=(120, 8, 6))
        glow = glow.filter(ImageFilter.GaussianBlur(220))
        f = Image.blend(f, glow, .55) if cy == 0 else Image.blend(f, glow, .55)
    return f

ficheros = sorted(p for p in origen.iterdir() if p.suffix.lower() in ('.jpg', '.jpeg', '.png'))  # orden por nombre = orden en que se hicieron
for i, p in enumerate(ficheros, 1):
    im = Image.open(p).convert('RGB')
    k = min(W / im.width, H / im.height)                     # encaja entera, sin deformar
    nw, nh = round(im.width * k), round(im.height * k)
    im = im.resize((nw, nh), Image.LANCZOS)
    lienzo = fondo()
    lienzo.paste(im, ((W - nw) // 2, (H - nh) // 2))
    lienzo.save(salida / f'{i:02d}.png')
    print(p.name, '->', f'{i:02d}.png', (nw, nh))
