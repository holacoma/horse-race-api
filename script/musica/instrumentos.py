# Instrumentos de un tema, con Demucs (htdemucs_6s: batería, bajo, otros, voz, guitarra, piano).
# Entorno: C:\IA\venv-audio (pip install demucs==4.0.1 librosa==0.10.2.post1 soundfile). Lo llama generar.mjs.
#
#   python instrumentos.py medir                       mide los temas de public/sonidos/candidatos sin medir y
#                                                      escribe candidatos/medidas.json (peso de cada instrumento, en %)
#   python instrumentos.py aislar <stem> <mp3>...      deja en cada mp3 solo ese instrumento (guitarra, bateria, ...)
#   python instrumentos.py sin_voz <mp3> <salida>      quita la voz (suma todo menos el stem de voz)
#   python instrumentos.py acelerar <bpm> <mp3> <salida>  mide el tempo y lo lleva a <bpm> sin cambiar el tono (rubberband)
#   python instrumentos.py tempo <mp3>...              mide el tempo real (los modelos suelen salir más lentos que lo pedido)
import json, os, subprocess, sys, tempfile
import numpy as np, librosa, soundfile as sf, torch
from demucs.apply import apply_model
from demucs.pretrained import get_model

PUBLICO = os.path.join(os.path.dirname(__file__), "..", "..", "public", "sonidos")
CANDIDATOS = os.path.join(PUBLICO, "candidatos")
MEDIDAS = os.path.join(CANDIDATOS, "medidas.json")
NO_MEDIR = {"descartados", "instrumentos", "efectos"}
NOMBRES = {"drums": "bateria", "bass": "bajo", "guitar": "guitarra", "piano": "piano", "vocals": "voz", "other": "otros"}

_modelo = None
def modelo():
    global _modelo
    if _modelo is None:
        _modelo = get_model("htdemucs_6s")
        _modelo.eval()
    return _modelo

def separar(archivo):
    m = modelo()
    y, _ = librosa.load(archivo, sr=m.samplerate, mono=False)
    if y.ndim == 1:
        y = np.stack([y, y])
    wav = torch.tensor(y, dtype=torch.float32)
    ref = wav.mean(0)
    media, desv = ref.mean(), ref.std() + 1e-8
    with torch.no_grad():
        partes = apply_model(m, ((wav - media) / desv)[None], device="cpu", split=True, overlap=0.25, progress=False)[0]
    return {NOMBRES[s]: p for s, p in zip(m.sources, partes * desv + media)}

def peso(partes):
    # Peso percibido: energía con ponderación A (el oído casi no oye el grave profundo), no energía cruda.
    sr = modelo().samplerate
    pesos = librosa.db_to_power(librosa.A_weighting(librosa.fft_frequencies(sr=sr, n_fft=4096)))
    energia = {n: float((np.abs(librosa.stft(p.mean(0).numpy(), n_fft=4096)) ** 2 * pesos[:, None]).sum()) for n, p in partes.items()}
    total = sum(energia.values()) or 1
    return {n: round(100 * e / total) for n, e in energia.items()}

def medir():
    medidas = json.load(open(MEDIDAS, encoding="utf8")) if os.path.exists(MEDIDAS) else {}
    for momento in sorted(os.listdir(CANDIDATOS)):
        carpeta = os.path.join(CANDIDATOS, momento)
        if momento in NO_MEDIR or not os.path.isdir(carpeta):
            continue
        for nombre in sorted(os.listdir(carpeta)):
            clave = f"{momento}/{nombre}"
            ruta = os.path.join(carpeta, nombre)
            if not nombre.lower().endswith((".mp3", ".wav", ".ogg", ".flac", ".m4a")):
                continue
            if medidas.get(clave, {}).get("mtime") == os.path.getmtime(ruta):
                continue
            medidas[clave] = {**peso(separar(ruta)), "mtime": os.path.getmtime(ruta)}
            print(clave, {k: v for k, v in medidas[clave].items() if k != "mtime"}, flush=True)
            with open(MEDIDAS, "w", encoding="utf8") as f:
                json.dump(medidas, f, indent=1, ensure_ascii=False)

def aislar(stem, archivos):
    for archivo in archivos:
        parte = separar(archivo)[stem]
        with tempfile.TemporaryDirectory() as tmp:
            wav = os.path.join(tmp, "parte.wav")
            sf.write(wav, parte.numpy().T, modelo().samplerate)
            subprocess.run(["ffmpeg", "-v", "error", "-y", "-i", wav, "-af", "loudnorm=I=-16:TP=-1", "-q:a", "2", archivo], check=True)
        print(f"{archivo}: solo {stem}", flush=True)

def a_mp3(audio, salida, filtro=None):
    with tempfile.TemporaryDirectory() as tmp:
        wav = os.path.join(tmp, "audio.wav")
        sf.write(wav, audio.T, modelo().samplerate)
        subprocess.run(["ffmpeg", "-v", "error", "-y", "-i", wav, *(["-af", filtro] if filtro else []), "-q:a", "2", salida], check=True)

def sin_voz(archivo, salida):
    partes = separar(archivo)
    a_mp3(sum(p for n, p in partes.items() if n != "voz").numpy(), salida)
    print(f"{salida}: sin voz", flush=True)

def tempo(archivo):
    # Pulso dominante entre 140 y 240 bpm: el rango de una carrera, para no leer el medio tiempo.
    y, sr = librosa.load(archivo, sr=22050)
    oenv = librosa.onset.onset_strength(y=y, sr=sr)
    ac = librosa.autocorrelate(oenv, max_size=400)
    bpm = 60 * sr / 512 / np.maximum(np.arange(len(ac)), 1)
    rango = (bpm > 140) & (bpm < 240)
    return float(bpm[rango][np.argmax(ac[rango])])

def acelerar(objetivo, archivo, salida):
    actual = tempo(archivo)
    factor = objetivo / actual
    subprocess.run(["ffmpeg", "-v", "error", "-y", "-i", archivo, "-af", f"rubberband=tempo={factor:.4f}:transients=crisp", "-q:a", "2", salida], check=True)
    print(f"{salida}: {actual:.0f} -> {objetivo:.0f} bpm (x{factor:.2f})", flush=True)

def preparar(objetivo, archivo):
    # Deja un tema listo para el juego: sin voz si se coló (5 % o más) y al tempo objetivo (0 = no tocar el tempo).
    partes = separar(archivo)
    voz = peso(partes)["voz"]
    with tempfile.TemporaryDirectory() as tmp:
        if voz >= 5:
            limpio = os.path.join(tmp, "limpio.mp3")
            a_mp3(sum(p for n, p in partes.items() if n != "voz").numpy(), limpio)
            os.replace(limpio, archivo)
        if objetivo:
            rapido = os.path.join(tmp, "rapido.mp3")
            acelerar(objetivo, archivo, rapido)
            os.replace(rapido, archivo)
    print(f"{os.path.basename(archivo)}: voz {voz}%{' (quitada)' if voz >= 5 else ''}", flush=True)

if __name__ == "__main__":
    accion, *resto = sys.argv[1:] or ["medir"]
    if accion == "medir":
        medir()
    elif accion == "aislar":
        aislar(resto[0], resto[1:])
    elif accion == "sin_voz":
        sin_voz(resto[0], resto[1])
    elif accion == "acelerar":
        acelerar(float(resto[0]), resto[1], resto[2])
    elif accion == "preparar":
        for a in resto[1:]:
            preparar(float(resto[0]), a)
    elif accion == "tempo":
        for a in resto:
            print(f"{os.path.basename(a)}: {tempo(a):.0f} bpm")
    else:
        sys.exit(f"Acción desconocida: {accion}")
