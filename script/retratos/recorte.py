# Chibis con borde transparente: el blanco del fondo que toca los bordes se vuelve transparente (relleno desde
# las esquinas, así el blanco de adentro del dibujo queda), con el borde suavizado. Guarda webp con alfa.
import sys, pathlib
from PIL import Image, ImageDraw, ImageFilter
origen = pathlib.Path(sys.argv[1]); destino = pathlib.Path(sys.argv[2]); destino.mkdir(parents=True, exist_ok=True)
for par in sys.argv[3].split(","):
    fuente, nombre = par.split(":")
    im = Image.open(origen / f"{fuente}.png").convert("RGB")
    claro = im.convert("L").point(lambda v: 255 if v > 232 else 0)
    w, h = claro.size
    for x, y in [(0, 0), (w - 1, 0), (0, h - 1), (w - 1, h - 1), (w // 2, 0), (w // 2, h - 1), (0, h // 2), (w - 1, h // 2)]:
        if claro.getpixel((x, y)) == 255: ImageDraw.floodfill(claro, (x, y), 128)
    fondo = claro.point(lambda v: 255 if v == 128 else 0)
    alfa = fondo.point(lambda v: 255 - v).filter(ImageFilter.MinFilter(3)).filter(ImageFilter.GaussianBlur(1.2))
    rgba = im.convert("RGBA"); rgba.putalpha(alfa)
    rgba = rgba.crop(rgba.getbbox())
    rgba.thumbnail((360, 360), Image.LANCZOS)
    rgba.save(destino / f"{nombre}.webp", "WEBP", quality=85)
print("ok")
