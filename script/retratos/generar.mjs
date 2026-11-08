// Le pide a ComfyUI (http://127.0.0.1:8188) una tanda de imágenes con SDXL y las guarda en ./salida.
// Uso: node generar.mjs tanda.json   (cada entrada: { nombre, prompt, ancho, alto, semilla })
import { readFileSync, writeFileSync, mkdirSync } from "node:fs"

const COMFY = "http://127.0.0.1:8188"
const MODELO = "animagine-xl-3.1.safetensors"
const CALIDAD = "masterpiece, best quality, very aesthetic, absurdres"
// Extras por tanda con la variable NEGATIVO_EXTRA (por ejemplo, para los chibis: fondos de color).
const NEGATIVO = ["1girl, 1boy, girl, boy, multiple girls, human face, humanoid, anime character, nsfw, lowres, bad anatomy, extra legs, five legs, extra limbs, missing legs, extra heads, two heads, deformed face, malformed head, disfigured, mutated, fused, deformed, text, watermark, signature, jpeg artifacts, blurry, human, person, rider", process.env.NEGATIVO_EXTRA].filter(Boolean).join(", ")

const tanda = JSON.parse(readFileSync(process.argv[2], "utf8"))
const salida = new URL("./salida/", import.meta.url)
mkdirSync(salida, { recursive: true })

function flujo({ prompt, ancho = 1024, alto = 1024, semilla = 1 }) {
  return {
    1: { class_type: "CheckpointLoaderSimple", inputs: { ckpt_name: MODELO } },
    2: { class_type: "CLIPTextEncode", inputs: { clip: ["1", 1], text: `${prompt}, ${CALIDAD}` } },
    3: { class_type: "CLIPTextEncode", inputs: { clip: ["1", 1], text: NEGATIVO } },
    4: { class_type: "EmptyLatentImage", inputs: { width: ancho, height: alto, batch_size: 1 } },
    5: { class_type: "KSampler", inputs: { model: ["1", 0], positive: ["2", 0], negative: ["3", 0], latent_image: ["4", 0],
      seed: semilla, steps: 28, cfg: 6, sampler_name: "euler_ancestral", scheduler: "normal", denoise: 1 } },
    6: { class_type: "VAEDecode", inputs: { samples: ["5", 0], vae: ["1", 2] } },
    7: { class_type: "SaveImage", inputs: { images: ["6", 0], filename_prefix: "clubrace" } }
  }
}

const espera = ms => new Promise(r => setTimeout(r, ms))

for (const item of tanda) {
  const t0 = Date.now()
  const { prompt_id } = await (await fetch(`${COMFY}/prompt`, { method: "POST", headers: { "content-type": "application/json" },
    body: JSON.stringify({ prompt: flujo(item) }) })).json()
  let imagen
  while (!imagen) {
    await espera(1500)
    const historia = await (await fetch(`${COMFY}/history/${prompt_id}`)).json()
    imagen = historia[prompt_id]?.outputs?.["7"]?.images?.[0]
  }
  const archivo = await fetch(`${COMFY}/view?filename=${encodeURIComponent(imagen.filename)}&subfolder=${encodeURIComponent(imagen.subfolder)}&type=${imagen.type}`)
  writeFileSync(new URL(`${item.nombre}.png`, salida), Buffer.from(await archivo.arrayBuffer()))
  console.log(`${item.nombre}: ${((Date.now() - t0) / 1000).toFixed(1)} s`)
}
