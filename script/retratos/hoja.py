import sys, pathlib
from PIL import Image, ImageDraw
salida = pathlib.Path(sys.argv[1]); nombres = sys.argv[3].split(","); cols = int(sys.argv[4]); w = int(sys.argv[5])
ims = [Image.open(salida / f"{n}.png").convert("RGB") for n in nombres]
h = round(ims[0].height * w / ims[0].width)
hoja = Image.new("RGB", (cols * w, -(-len(ims) // cols) * (h + 18)), "black")
d = ImageDraw.Draw(hoja)
for i, (n, im) in enumerate(zip(nombres, ims)):
    x, y = (i % cols) * w, (i // cols) * (h + 18)
    hoja.paste(im.resize((w, h)), (x, y + 18)); d.text((x + 4, y + 3), n, fill="white")
hoja.save(sys.argv[2])
