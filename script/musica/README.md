# Música y efectos de Club Race con IA

Todo corre local en el ComfyUI portable de `C:\IA\ComfyUI_windows_portable` (RTX 3080, 10 GB).
Para levantarlo: `C:\IA\ComfyUI_windows_portable\run_nvidia_gpu.bat` → http://127.0.0.1:8188

## Modelos

| Para qué | Modelo (archivos en `ComfyUI/models/`) | Plantilla de ComfyUI | Tiempo |
|---|---|---|---|
| **Música (el bueno)** | MiniMax Music 3: `diffusion_models/minimax_music3_dit_fp16`, `text_encoders/minimax_music3_text_encoder_pruned_int8_convrot`, `vae/minimax_music3_dav` | Audio → *MiniMax Music 3* | ~3–4 min por tema de 60 s |
| Música, rápido y peor | ACE-Step 1.5 turbo: `checkpoints/ace_step_1.5_turbo_aio` | Audio → *ACE-Step 1.5 checkpoint* | ~10 s |
| Música, sigue mejor el pedido | ACE-Step 1.5 XL SFT: `diffusion_models/acestep_v1.5_xl_sft_bf16` + `qwen_0.6b_ace15` + `qwen_4b_ace15` + `vae/ace_1.5_vae` | Audio → *ACE-Step 1.5 XL SFT* | ~2 min |
| Efectos | Stable Audio Open 1.0: `checkpoints/stable-audio-open-1.0` + `text_encoders/t5-base` | Audio → *Stable Audio* | ~6 s |

Lo que aprendimos con MiniMax:

- **El pedido (caption)** va en tres partes, en inglés y en prosa: `Global Metadata:` (género, tempo, tonalidad, ánimo, producción),
  `Vocal Details:` (para instrumental: "Instrumental. A screaming lead guitar carries the melody.") y `Arrangement:` (qué toca
  cada instrumento, sección por sección). Guía oficial: https://github.com/MiniMax-AI/MiniMax-Music3 (skill `music-caption-rewriter`).
- **Sin voz:** en la letra (lyrics) poné solo etiquetas instrumentales: `[Intro]`, `[Instrumental]`, `[Solo]`, `[Outro]`.
  Con `[Verse]` o `[Chorus]` canta alguien.
- **No uses negaciones** ("no synths", "no vocals"): nombrar algo lo invoca.
- **El tempo del texto casi no se respeta:** sale ~15 % más lento. Para llevarlo al tempo exacto, aceleralo después (abajo).
- El que más te gustó fue `t7-minimax-oscuro` (metal oscuro, thrash, líder chillona). Su pedido está en `tanda7.json`.

## Camino 1: sin código, desde ComfyUI

1. En ComfyUI: *Templates → Audio → MiniMax Music 3*.
2. Pegá el pedido en **caption**, las etiquetas en **lyrics**, elegí la duración (`max_duration`) y una semilla. *Run*.
3. El mp3 queda en `C:\IA\ComfyUI_windows_portable\ComfyUI\output\audio\`.
4. Copialo a `public/sonidos/candidatos/<momento>/` (`inicio` = carrera, `sala` = espera, `final`, `transformacion`)
   y aparece solo en el soundboard: http://127.0.0.1:3000/prototipos/sonidos.html

## Camino 2: con el script (tandas)

Copiá una tanda (por ejemplo `tanda7.json`), cambiá `nombre`, `semilla` y el pedido, y corré:

```
node script/musica/generar.mjs script/musica/mi-tanda.json            # toda la tanda
node script/musica/generar.mjs script/musica/mi-tanda.json nombre1    # solo esa entrada
```

Campos de cada entrada:

| Campo | Qué hace |
|---|---|
| `momento` | carpeta del soundboard (`inicio`, `sala`, `final`…) |
| `motor` | `minimax`, `xl`, `turbo` (por defecto) o `sfx` |
| `tags` | el pedido (caption) |
| `letra` | las etiquetas de sección (lyrics) |
| `segundos`, `semilla` | duración y semilla (misma semilla + mismo pedido = mismo tema) |
| `bpm`, `tono` | solo para ACE-Step (MiniMax los lee del texto) |
| `idioma` | solo ACE-Step: idioma de la letra (`es`, `en`…). En MiniMax se pide en el texto ("singing in Spanish") |
| `bpm_final` | después de generar, quita la voz si se coló y acelera a ese tempo |
| `preparar: true` | solo quita la voz si se coló |
| `referencia` + `fuerza` | solo ACE-Step: parte de un tema existente (0,4 = fiel, 0,7 = lo reinventa) |
| `recortar` | solo efectos: duración final en segundos |

Al terminar mide los instrumentos de cada tema (las barras del soundboard).

## Herramientas sueltas (`instrumentos.py`, entorno `C:\IA\venv-audio`)

```
set PY=C:\IA\venv-audio\Scripts\python.exe -I script\musica\instrumentos.py
%PY% tempo archivo.mp3                         mide el tempo real
%PY% acelerar 200 entrada.mp3 salida.mp3       lo lleva a 200 bpm sin cambiar el tono
%PY% sin_voz entrada.mp3 salida.mp3            quita la voz (Demucs)
%PY% medir                                     mide los instrumentos de todos los candidatos
```

## Qué suena hoy en el juego

`public/sonidos/juego/`: `musica-carrera.mp3` (t8-rapido-215-b sin voz; entra en el ¡YA! y se apaga en el festejo) y los
efectos `click`, `tic`, `moneda`, `premio`, `cuenta`, `ya`, `meta`, `ganador`. Para cambiar uno, reemplazá el archivo con el
mismo nombre. Si falta, `app/javascript/sonidos.js` usa el sintetizado.
