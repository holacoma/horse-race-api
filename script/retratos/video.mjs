// Anima una imagen con LTX-Video en ComfyUI (imagen a video) y guarda un webp animado en ./videos.
// Uso: node video.mjs <imagen.png> <nombre> "<prompt de movimiento>" [semilla]
import { readFileSync, writeFileSync, mkdirSync } from "node:fs"
import { basename } from "node:path"

const COMFY = "http://127.0.0.1:8188"
const [imagen, nombre, movimiento, semilla = "7"] = process.argv.slice(2)
const NEGATIVO = "worst quality, inconsistent motion, blurry, jittery, distorted, deformed, morphing, extra legs, extra heads, melting, text, watermark, human, person"
const salida = new URL("./videos/", import.meta.url)
mkdirSync(salida, { recursive: true })

// 1. Subir la imagen.
const form = new FormData()
form.append("image", new Blob([readFileSync(imagen)], { type: "image/png" }), basename(imagen))
form.append("overwrite", "true")
const subida = await (await fetch(`${COMFY}/upload/image`, { method: "POST", body: form })).json()

// 2. Imagen a video: 768x512, 97 cuadros (unos 4 s a 24 fps).
const flujo = {
  1: { class_type: "CheckpointLoaderSimple", inputs: { ckpt_name: "ltx-video-2b-v0.9.5.safetensors" } },
  2: { class_type: "CLIPLoader", inputs: { clip_name: "t5xxl_fp8_e4m3fn.safetensors", type: "ltxv" } },
  3: { class_type: "CLIPTextEncode", inputs: { clip: ["2", 0], text: movimiento } },
  4: { class_type: "CLIPTextEncode", inputs: { clip: ["2", 0], text: NEGATIVO } },
  5: { class_type: "LoadImage", inputs: { image: subida.name } },
  6: { class_type: "LTXVImgToVideo", inputs: { positive: ["3", 0], negative: ["4", 0], vae: ["1", 2], image: ["5", 0],
    width: 768, height: 512, length: 97, batch_size: 1, strength: 1 } },
  7: { class_type: "LTXVConditioning", inputs: { positive: ["6", 0], negative: ["6", 1], frame_rate: 24 } },
  8: { class_type: "ModelSamplingLTXV", inputs: { model: ["1", 0], max_shift: 2.05, base_shift: 0.95, latent: ["6", 2] } },
  9: { class_type: "LTXVScheduler", inputs: { steps: 30, max_shift: 2.05, base_shift: 0.95, stretch: true, terminal: 0.1, latent: ["6", 2] } },
  10: { class_type: "KSamplerSelect", inputs: { sampler_name: "euler" } },
  11: { class_type: "SamplerCustom", inputs: { model: ["8", 0], add_noise: true, noise_seed: Number(semilla), cfg: 3,
    positive: ["7", 0], negative: ["7", 1], sampler: ["10", 0], sigmas: ["9", 0], latent_image: ["6", 2] } },
  12: { class_type: "VAEDecode", inputs: { samples: ["11", 0], vae: ["1", 2] } },
  13: { class_type: "SaveAnimatedWEBP", inputs: { images: ["12", 0], filename_prefix: `video-${nombre}`, fps: 24, lossless: false, quality: 85, method: "default" } }
}

const t0 = Date.now()
const respuesta = await (await fetch(`${COMFY}/prompt`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ prompt: flujo }) })).json()
if (!respuesta.prompt_id) { console.error(JSON.stringify(respuesta, null, 1)); process.exit(1) }
let resultado
while (!resultado) {
  await new Promise(r => setTimeout(r, 3000))
  const h = (await (await fetch(`${COMFY}/history/${respuesta.prompt_id}`)).json())[respuesta.prompt_id]
  if (h?.status?.status_str === "error") { console.error(JSON.stringify(h.status, null, 1).slice(0, 2000)); process.exit(1) }
  resultado = h?.outputs?.["13"]?.images?.[0]
}
const archivo = await fetch(`${COMFY}/view?filename=${encodeURIComponent(resultado.filename)}&subfolder=${encodeURIComponent(resultado.subfolder)}&type=${resultado.type}`)
writeFileSync(new URL(`${nombre}.webp`, salida), Buffer.from(await archivo.arrayBuffer()))
console.log(`${nombre}: ${((Date.now() - t0) / 1000).toFixed(0)} s`)
