# Convierte los PNG de ./salida a webp para el juego y arma una hoja de contacto para revisarlos.
import sys, pathlib
from PIL import Image
salida = pathlib.Path(sys.argv[1]); destino = pathlib.Path(sys.argv[2]); destino.mkdir(parents=True, exist_ok=True)
ELEMENTOS = ["fuego","hielo","electricidad","agua","viento","roca","sombra","luz","veneno","metal","naturaleza","cosmos"]
miniaturas = []
for e in ELEMENTOS:
    for nombre, ancho in ((e, 480), (f"victoria-{e}", 1200)):
        im = Image.open(salida / f"{nombre}.png").convert("RGB")
        im = im.resize((ancho, round(im.height * ancho / im.width)), Image.LANCZOS)
        im.save(destino / f"{nombre}.webp", "WEBP", quality=82)
        t = im.copy(); t.thumbnail((240, 240)); miniaturas.append(t)
hoja = Image.new("RGB", (6 * 240, 4 * 240), "black")
for i, t in enumerate(miniaturas): hoja.paste(t, ((i % 6) * 240, (i // 6) * 240))
hoja.save(salida / "hoja.png")
print("ok", sum(f.stat().st_size for f in destino.glob("*.webp")) // 1024, "KB")
