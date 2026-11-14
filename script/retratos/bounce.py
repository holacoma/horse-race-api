# Loop de ida y vuelta: los cuadros hacia adelante y después hacia atrás, sin repetir los extremos.
import sys
from PIL import Image
im = Image.open(sys.argv[1]); cuadros = []
for i in range(im.n_frames):
    im.seek(i); cuadros.append(im.convert("RGB").copy())
ida_vuelta = cuadros + cuadros[-2:0:-1]
ida_vuelta[0].save(sys.argv[2], save_all=True, append_images=ida_vuelta[1:], duration=42, loop=0, quality=80)
print(len(ida_vuelta), "cuadros")
