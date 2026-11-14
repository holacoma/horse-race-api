// Genera música con ACE-Step 1.5 en ComfyUI (C:\IA, puerto 8188) y la deja en public/sonidos/candidatos/<momento>/,
// donde aparece sola en el soundboard (/prototipos/sonidos.html). Al terminar mide los instrumentos de cada tema
// (instrumentos.py, con Demucs) para las barras del soundboard.
// Uso: node script/musica/generar.mjs <tanda.json> [nombre...]   (sin nombres, genera toda la tanda)
// Cada entrada: { momento, nombre, tags, bpm, segundos, tono, semilla, compas?, letra? }. Sin letra, es instrumental.
// Para la paleta de instrumentos: { carpeta: "paleta/<categoria>", aislar: "guitarra" | "bateria" | "bajo" | "otros", ... }
// deja el archivo en public/sonidos/<carpeta>/ con solo ese instrumento.
import { readFileSync, writeFileSync, mkdirSync, renameSync, copyFileSync } from "node:fs"
import { execFileSync } from "node:child_process"
import { fileURLToPath } from "node:url"

const COMFY = "http://127.0.0.1:8188"
const PYTHON = "C:\\IA\\venv-audio\\Scripts\\python.exe"
const INSTRUMENTOS = fileURLToPath(new URL("./instrumentos.py", import.meta.url))
const [archivoTanda, ...soloEstos] = process.argv.slice(2)
if (!archivoTanda) { console.error("Uso: node script/musica/generar.mjs <tanda.json> [nombre...]"); process.exit(1) }
const tanda = JSON.parse(readFileSync(archivoTanda, "utf8")).filter(e => !soloEstos.length || soloEstos.includes(e.nombre))
const SONIDOS = new URL("../../public/sonidos/", import.meta.url)

// Dos motores, de las plantillas oficiales de ComfyUI:
// - "turbo" (por defecto): "ACE-Step 1.5 checkpoint", modelo único, 8 pasos. Rápido (unos 10 s por tema).
// - "xl": "ACE-Step 1.5 XL SFT", con el modelo de lenguaje de 4B, 50 pasos y cfg 7. Más rico y bastante más lento.
// Los "tags" rinden mejor como descripción en prosa (como en las plantillas) que como lista, y sin negaciones:
// nombrar "synthesizers" para pedir que no estén los invoca.
function flujo(entrada) {
  if (entrada.motor === "sfx") return flujoSfx(entrada)
  return entrada.motor === "minimax" ? flujoMinimax(entrada) : flujoAce(entrada)
}

// Efectos con Stable Audio Open 1.0 (plantilla oficial "audio_stable_audio_example"). Acá el negativo sí funciona
// (es un prompt aparte con cfg). Con "recortar": <s>, se quita el silencio inicial, se corta a esa duración con un
// fundido y se normaliza el volumen.
function flujoSfx({ tags, negativo = "low quality, noise, hiss, music, melody, vocals, speech", segundos, semilla, nombre }) {
  return {
    4: { class_type: "CheckpointLoaderSimple", inputs: { ckpt_name: "stable-audio-open-1.0.safetensors" } },
    10: { class_type: "CLIPLoader", inputs: { clip_name: "t5-base.safetensors", type: "stable_audio", device: "default" } },
    6: { class_type: "CLIPTextEncode", inputs: { clip: ["10", 0], text: tags } },
    7: { class_type: "CLIPTextEncode", inputs: { clip: ["10", 0], text: negativo } },
    11: { class_type: "EmptyLatentAudio", inputs: { seconds: segundos, batch_size: 1 } },
    3: { class_type: "KSampler", inputs: { model: ["4", 0], positive: ["6", 0], negative: ["7", 0], latent_image: ["11", 0],
      seed: semilla, steps: 50, cfg: 4.98, sampler_name: "dpmpp_3m_sde_gpu", scheduler: "exponential", denoise: 1 } },
    12: { class_type: "VAEDecodeAudio", inputs: { samples: ["3", 0], vae: ["4", 2] } },
    8: { class_type: "SaveAudioMP3", inputs: { audio: ["12", 0], filename_prefix: `club-race/${nombre}`, quality: "V0" } }
  }
}

// LoadAudio lee de la carpeta input de ComfyUI: se copia ahí el tema de referencia.
function subirReferencia(relativa) {
  const nombre = `club-race-${relativa.replace(/[\\/]/g, "-")}`
  copyFileSync(fileURLToPath(new URL(relativa, SONIDOS)), `C:\\IA\\ComfyUI_windows_portable\\ComfyUI\\input\\${nombre}`)
  return nombre
}

function recortar(archivo, duracion) {
  const tmp = `${archivo}.tmp.mp3`
  const fundido = Math.min(0.25, duracion / 3)
  const filtro = `silenceremove=start_periods=1:start_threshold=-40dB,atrim=0:${duracion},afade=t=out:st=${(duracion - fundido).toFixed(2)}:d=${fundido.toFixed(2)},loudnorm=I=-14:TP=-1`
  execFileSync("ffmpeg", ["-v", "error", "-y", "-i", archivo, "-af", filtro, "-q:a", "2", tmp])
  renameSync(tmp, archivo)
}

// MiniMax Music 3 (plantilla oficial "audio_minimax_music_3"): temas de hasta 5 min con estructura estable.
// El pedido ("tags") va en tres partes: "Global Metadata: …", "Vocal Details: …", "Arrangement: …";
// la letra lleva las secciones ([intro], [verse], [chorus]…), que son lo único que manda en la estructura.
// Decodifica en mosaico para que entre en los 10 GB de la 3080.
function flujoMinimax({ tags, letra, segundos, semilla, nombre }) {
  return {
    1: { class_type: "UNETLoader", inputs: { unet_name: "minimax_music3_dit_fp16.safetensors", weight_dtype: "default" } },
    3: { class_type: "CLIPLoader", inputs: { clip_name: "minimax_music3_text_encoder_pruned_int8_convrot.safetensors", type: "minimax", device: "default" } },
    7: { class_type: "VAELoader", inputs: { vae_name: "minimax_music3_dav.safetensors" } },
    2: { class_type: "MiniMaxMusic3TextEncode", inputs: { clip: ["3", 0], caption: tags, lyrics: letra ?? "[intro]\n\n[verse]\n\n[chorus]\n\n[outro]", seed: semilla, max_duration: segundos, cfg_scale: 1.7, top_k: 50 } },
    10: { class_type: "ConditioningZeroOut", inputs: { conditioning: ["2", 0] } },
    15: { class_type: "EmptyMiniMaxMusic3LatentAudio", inputs: { seconds: ["2", 1], batch_size: 1 } },
    9: { class_type: "KSampler", inputs: { model: ["1", 0], positive: ["2", 0], negative: ["10", 0], latent_image: ["15", 0],
      seed: semilla, steps: 30, cfg: 1.7, sampler_name: "euler", scheduler: "simple", denoise: 1 } },
    12: { class_type: "VAEDecodeAudioTiled", inputs: { samples: ["9", 0], vae: ["7", 0], tile_size: 1536, overlap: 64 } },
    8: { class_type: "SaveAudioMP3", inputs: { audio: ["12", 0], filename_prefix: `club-race/${nombre}`, quality: "V0" } }
  }
}

// Con "referencia" (ruta dentro de public/sonidos) y "fuerza" (0..1), en vez de partir de silencio parte de ese tema:
// lo codifica y lo repinta. Con fuerza baja se parece mucho al original; con alta, lo reinventa.
// Solo para temas de ACE-Step (comparten el VAE).
function flujoAce({ tags, letra = "[Instrumental]", bpm, segundos, tono, semilla, compas = "4", nombre, motor = "turbo", referencia, fuerza = 1, idioma = "en" }) {
  const xl = motor === "xl"
  const cargadores = xl
    ? {
      1: { class_type: "UNETLoader", inputs: { unet_name: "acestep_v1.5_xl_sft_bf16.safetensors", weight_dtype: "default" } },
      10: { class_type: "DualCLIPLoader", inputs: { clip_name1: "qwen_0.6b_ace15.safetensors", clip_name2: "qwen_4b_ace15.safetensors", type: "ace", device: "default" } },
      11: { class_type: "VAELoader", inputs: { vae_name: "ace_1.5_vae.safetensors" } }
    }
    : { 1: { class_type: "CheckpointLoaderSimple", inputs: { ckpt_name: "ace_step_1.5_turbo_aio.safetensors" } } }
  const clip = xl ? ["10", 0] : ["1", 1]
  const vae = xl ? ["11", 0] : ["1", 2]
  return {
    ...cargadores,
    2: { class_type: "TextEncodeAceStepAudio1.5", inputs: {
      clip, tags, lyrics: letra, seed: semilla, bpm, duration: segundos, timesignature: compas, language: idioma,
      keyscale: tono, generate_audio_codes: true, cfg_scale: 2, temperature: 0.85, top_p: 0.9, top_k: 0, min_p: 0 } },
    3: { class_type: "ConditioningZeroOut", inputs: { conditioning: ["2", 0] } },
    ...(referencia
      ? {
        20: { class_type: "LoadAudio", inputs: { audio: subirReferencia(referencia) } },
        4: { class_type: "VAEEncodeAudio", inputs: { audio: ["20", 0], vae } }
      }
      : { 4: { class_type: "EmptyAceStep1.5LatentAudio", inputs: { seconds: segundos, batch_size: 1 } } }),
    5: { class_type: "ModelSamplingAuraFlow", inputs: { model: ["1", 0], shift: 3 } },
    6: { class_type: "KSampler", inputs: { model: ["5", 0], positive: ["2", 0], negative: ["3", 0], latent_image: ["4", 0],
      seed: semilla, steps: xl ? 50 : 8, cfg: xl ? 7 : 1, sampler_name: "euler", scheduler: "simple", denoise: referencia ? fuerza : 1 } },
    7: { class_type: "VAEDecodeAudio", inputs: { samples: ["6", 0], vae } },
    8: { class_type: "SaveAudioMP3", inputs: { audio: ["7", 0], filename_prefix: `club-race/${nombre}`, quality: "V0" } }
  }
}

const python = (...args) => execFileSync(PYTHON, ["-I", INSTRUMENTOS, ...args], { stdio: "inherit" })
const aislar = {}
for (const entrada of tanda) {
  const t0 = Date.now()
  const respuesta = await (await fetch(`${COMFY}/prompt`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ prompt: flujo(entrada) }) })).json()
  if (!respuesta.prompt_id) { console.error(entrada.nombre, JSON.stringify(respuesta, null, 1)); process.exit(1) }
  let resultado
  while (!resultado) {
    await new Promise(r => setTimeout(r, 2000))
    const h = (await (await fetch(`${COMFY}/history/${respuesta.prompt_id}`)).json())[respuesta.prompt_id]
    if (h?.status?.status_str === "error") { console.error(entrada.nombre, JSON.stringify(h.status, null, 1).slice(0, 2000)); process.exit(1) }
    resultado = h?.outputs?.["8"]?.audio?.[0]
  }
  const audio = await fetch(`${COMFY}/view?filename=${encodeURIComponent(resultado.filename)}&subfolder=${encodeURIComponent(resultado.subfolder)}&type=${resultado.type}`)
  const relativa = `${entrada.carpeta ?? `candidatos/${entrada.momento}`}/`
  const carpeta = new URL(relativa, SONIDOS)
  mkdirSync(carpeta, { recursive: true })
  const destino = new URL(`${entrada.nombre}.mp3`, carpeta)
  writeFileSync(destino, Buffer.from(await audio.arrayBuffer()))
  if (entrada.recortar) recortar(fileURLToPath(destino), entrada.recortar)
  if (entrada.aislar) (aislar[entrada.aislar] ??= []).push(fileURLToPath(destino))
  // "preparar": true quita la voz si se coló; "bpm_final": N además lo acelera a ese tempo (MiniMax sale más lento).
  if (entrada.preparar || entrada.bpm_final) python("preparar", String(entrada.bpm_final ?? 0), fileURLToPath(destino))
  console.log(`${relativa}${entrada.nombre}.mp3: ${((Date.now() - t0) / 1000).toFixed(0)} s`)
}

for (const [stem, archivos] of Object.entries(aislar)) python("aislar", stem, ...archivos)
if (tanda.some(e => !e.carpeta)) python("medir")
