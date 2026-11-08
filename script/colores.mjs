// Genera public/css/identidad.css: los colores de Club Race.
// Método: escalas de 12 pasos con un uso fijo por paso (como Radix), en OKLCH con el tono constante y el croma
// recortado al gamut sRGB; tokens semánticos encima; y 12 colores de caballo a la misma luminosidad,
// elegidos por máxima distancia perceptual (OKLab) entre ellos.
// Uso: node script/colores.mjs
import { writeFileSync } from "node:fs"

// ── OKLCH ↔ sRGB ───────────────────────────────────────────────────────────────────
const toLinear = c => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4)
const toGamma = c => (c <= 0.0031308 ? 12.92 * c : 1.055 * c ** (1 / 2.4) - 0.055)
function oklabToLinear([L, a, b]) {
  const l = (L + 0.3963377774 * a + 0.2158037573 * b) ** 3
  const m = (L - 0.1055613458 * a - 0.0638541728 * b) ** 3
  const s = (L - 0.0894841775 * a - 1.291485548 * b) ** 3
  return [
    4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s,
    -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s,
    -0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s
  ]
}
function linearToOklab([r, g, b]) {
  const l = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b)
  const m = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b)
  const s = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b)
  return [
    0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s,
    1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s,
    0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s
  ]
}
const lab = (L, C, H) => [L, C * Math.cos((H * Math.PI) / 180), C * Math.sin((H * Math.PI) / 180)]
const inGamut = rgb => rgb.every(v => v >= -1e-4 && v <= 1 + 1e-4)
// El croma más alto que entra en sRGB para esa luminosidad y ese tono.
function maxChroma(L, H) {
  let lo = 0, hi = 0.4
  for (let i = 0; i < 30; i++) {
    const mid = (lo + hi) / 2
    if (inGamut(oklabToLinear(lab(L, mid, H)))) lo = mid
    else hi = mid
  }
  return lo
}
const hex = (L, C, H) => "#" + oklabToLinear(lab(L, C, H))
  .map(v => Math.round(Math.min(1, Math.max(0, toGamma(v))) * 255).toString(16).padStart(2, "0")).join("")
const hexToOklab = h => linearToOklab([1, 3, 5].map(i => toLinear(parseInt(h.slice(i, i + 2), 16) / 255)))
const deltaE = (p, q) => Math.hypot(p[0] - q[0], p[1] - q[1], p[2] - q[2])
const luminance = h => [1, 3, 5].map(i => toLinear(parseInt(h.slice(i, i + 2), 16) / 255))
  .reduce((s, v, k) => s + v * [0.2126, 0.7152, 0.0722][k], 0)
const contrast = (a, b) => { const [x, y] = [luminance(a), luminance(b)].sort((p, q) => q - p); return (x + 0.05) / (y + 0.05) }
const f = (n, d = 3) => Number(n.toFixed(d))
const oklch = (L, C, H) => `oklch(${f(L)} ${f(C)} ${f(H, 1)})`


// ── Dos fases ───────────────────────────────────────────────────────────────────────
// Fuera de la carrera (lobby, apuestas, resultados): relajada y cálida, de día, redondeada.
// Durante la carrera: Tron, de noche, neón, recta y desbalanceada, cargada.
// Las primitivas son de las dos; cada fase tiene sus semánticos, su forma y su tipografía.

// Escalas de 12 pasos. 1–2 fondos · 3–5 elementos (normal, encima, presionado) · 6–8 bordes · 9–10 sólidos · 11–12 texto.
// Noche (oscuras): el fondo no es negro puro (#000 hace vibrar el texto claro), pero casi.
const NIGHT = {
  light: [0.145, 0.175, 0.215, 0.25, 0.285, 0.325, 0.385, 0.47, 0.7, 0.75, 0.83, 0.95],
  chroma: [0.1, 0.14, 0.26, 0.34, 0.4, 0.44, 0.5, 0.6, 1, 0.95, 0.7, 0.24],
  neutralLight: [0.145, 0.175, 0.215, 0.25, 0.285, 0.325, 0.385, 0.47, 0.6, 0.65, 0.8, 0.95],
  neutralChroma: [0.006, 0.008, 0.01, 0.012, 0.013, 0.014, 0.016, 0.018, 0.02, 0.02, 0.014, 0.006]
}
// Día (claras): crema y arena, colores más suaves y texto marrón oscuro en vez de negro.
const DAY = {
  light: [0.985, 0.968, 0.945, 0.92, 0.895, 0.865, 0.815, 0.745, 0.7, 0.655, 0.5, 0.32],
  chroma: [0.12, 0.18, 0.28, 0.36, 0.42, 0.46, 0.55, 0.65, 0.95, 0.95, 0.85, 0.55],
  neutralLight: [0.985, 0.965, 0.94, 0.915, 0.89, 0.86, 0.81, 0.73, 0.6, 0.53, 0.45, 0.28],
  neutralChroma: [0.01, 0.014, 0.02, 0.024, 0.027, 0.03, 0.032, 0.036, 0.04, 0.04, 0.036, 0.03]
}
// Noche: neutro apenas cálido, hacia el cobre de Hyperdemon. Arena: neutro de día, cálido. Fuego: la marca.
const HUES = { fuego: { hue: 45, peak: 0.24 }, rojo: { hue: 25, peak: 0.24 }, verde: { hue: 150, peak: 0.22 }, ambar: { hue: 80, peak: 0.2 }, cian: { hue: 210, peak: 0.16 }, rosa: { hue: 350, peak: 0.2 } }
const build = (curve, hue, peak) => curve.light.map((L, i) => {
  const max = maxChroma(L, hue)
  return { L, C: Math.min(Math.min(peak, max) * curve.chroma[i], max), H: hue }
})
const scales = {
  noche: NIGHT.neutralLight.map((L, i) => ({ L, C: NIGHT.neutralChroma[i], H: 55 })),
  ...Object.fromEntries(Object.entries(HUES).map(([name, s]) => [name, build(NIGHT, s.hue, s.peak)])),
  arena: DAY.neutralLight.map((L, i) => ({ L, C: DAY.neutralChroma[i], H: 80 })),
  ...Object.fromEntries(Object.entries(HUES).map(([name, s]) => [`${name}-dia`, build(DAY, s.hue, s.peak * 0.85)]))
}
const NIGHT_SCALES = ["noche", ...Object.keys(HUES)]
const DAY_SCALES = ["arena", ...Object.keys(HUES).map(n => `${n}-dia`)]
// ── Caballos: 11 tonos a la misma distancia, más el blanco ──────────────────────────────
// Con 12 colores a una sola luminosidad nada parece neón (el amarillo sale oliva, el naranja pastel). Cada tono va
// cerca de la luminosidad donde alcanza su croma máximo, acotada a 0,68–0,86 para que ninguno quede apagado.
// Se arranca en el naranja del fuego (sale exacto #fe6a00) y se reparten los demás cada 360/11 grados.
const HORSE_LIGHT = [0.68, 0.86]
const HORSE_CHROMA = 0.2
function cusp(H) {
  let best = { L: 0, C: 0 }
  for (let L = 0.3; L <= 0.99; L += 0.005) { const C = maxChroma(L, H); if (C > best.C) best = { L, C } }
  return best.L
}
const ORDER = ["fuego", "roca", "veneno", "naturaleza", "viento", "hielo", "agua", "metal", "electricidad", "cosmos", "sombra"]
const horses = ORDER.map((name, i) => {
  const H = (45 + (i * 360) / 11) % 360
  const L = Math.min(HORSE_LIGHT[1], Math.max(HORSE_LIGHT[0], cusp(H)))
  const C = Math.min(HORSE_CHROMA, maxChroma(L, H))
  return { name, H, L, C, hex: hex(L, C, H) }
})
horses.push({ name: "luz", H: 0, L: 1, C: 0, hex: "#ffffff" })
const BG = hex(...Object.values(scales.noche[0]))
horses.forEach(h => {
  h.contrast = contrast(h.hex, BG)
  h.nearest = Math.min(...horses.filter(o => o !== h).map(o => deltaE(hexToOklab(h.hex), hexToOklab(o.hex))))
})

// De día los neones no se leen sobre crema: cada caballo tiene además su tinta, el mismo tono más oscuro.
const DAY_BG = hex(...Object.values(scales.arena[0]))
horses.forEach(h => {
  const L = h.name === "luz" ? 0.45 : 0.56
  const C = h.name === "luz" ? 0.02 : Math.min(0.17, maxChroma(L, h.H))
  h.ink = hex(L, C, h.name === "luz" ? 80 : h.H)
  h.inkContrast = contrast(h.ink, DAY_BG)
})

// Ruido como imagen SVG (feTurbulence): grano para las superficies. color = r g b del grano, alpha = cuánto se ve.
const noise = (frequency, color, alpha) => {
  const [r, g, b] = color.split(" ")
  const svg = `<svg xmlns='http://www.w3.org/2000/svg' width='240' height='240'><filter id='n'><feTurbulence type='fractalNoise' baseFrequency='${frequency}' numOctaves='3' stitchTiles='stitch'/><feColorMatrix values='0 0 0 0 ${r} 0 0 0 0 ${g} 0 0 0 0 ${b} 0 0 0 ${alpha} 0'/></filter><rect width='100%' height='100%' filter='url(%23n)'/></svg>`
  return `url("data:image/svg+xml;utf8,${svg}")`
}

// ── Semánticos por fase ─────────────────────────────────────────────────────────────
const semantic = (n, accent, ink, family, brand = "fuego") => ({
  "fondo": `var(--${n}-1)`, "superficie": `var(--${n}-2)`, "superficie-alta": `var(--${n}-3)`,
  "elemento": `var(--${n}-3)`, "elemento-encima": `var(--${n}-4)`, "elemento-presionado": `var(--${n}-5)`,
  "borde-sutil": `var(--${n}-6)`, "borde": `var(--${n}-7)`, "borde-fuerte": `var(--${n}-8)`,
  "texto": `var(--${n}-12)`, "texto-suave": `var(--${n}-11)`, "texto-apagado": `var(--${n}-${family === "dia" ? 10 : 9})`,
  "acento": `var(--${accent(brand)}-9)`, "acento-encima": `var(--${accent(brand)}-10)`, "acento-texto": `var(--${accent(brand)}-11)`,
  "acento-fondo": `var(--${accent(brand)}-3)`, "acento-borde": `var(--${accent(brand)}-7)`, "sobre-acento": ink,
  "peligro": `var(--${accent("rojo")}-9)`, "peligro-texto": `var(--${accent("rojo")}-11)`, "peligro-fondo": `var(--${accent("rojo")}-3)`,
  "exito": `var(--${accent("verde")}-9)`, "exito-texto": `var(--${accent("verde")}-11)`, "exito-fondo": `var(--${accent("verde")}-3)`,
  "aviso": `var(--${accent("ambar")}-9)`, "aviso-texto": `var(--${accent("ambar")}-11)`, "aviso-fondo": `var(--${accent("ambar")}-3)`,
  "info": `var(--${accent("cian")}-9)`, "info-texto": `var(--${accent("cian")}-11)`, "info-fondo": `var(--${accent("cian")}-3)`,
  "foco": `var(--${accent("cian")}-9)`
})
const PHASES = {
  fuera: {
    selector: ':root, [data-fase="fuera"]',
    note: "Fuera de la carrera: de día y kawaii, como una novela visual (Doki Doki): rosa, redondeada, con lunares y corazones, y un costado oscuro (lo tuyo y la regla van en negro, carmesí y letra gótica). Sin brillos; la altura se marca con sombra.",
    colors: semantic("arena", n => `${n}-dia`, "var(--arena-12)", "dia", "rosa"),
    rest: {
      "radio": "18px", "radio-chico": "10px", "corte": "0px", "borde-ancho": "2px",
      "borde-marcado": "2px", "recorte": "none", "recorte-etiqueta": "none",
      "sombra": "0 3px 0 var(--rosa-dia-6), 0 8px 18px color-mix(in oklch, var(--rosa-dia-9) 16%, transparent)",
      "sombra-presionada": "0 1px 0 var(--rosa-dia-6)",
      // Lunares rosas de fondo, como el menú de una novela visual.
      "patron": "radial-gradient(circle, color-mix(in oklch, var(--rosa-dia-7) 75%, transparent) 3.2px, transparent 3.8px) 0 0 / 30px 30px",
      "fuente-titulo": "\"Mochiy Pop One\", \"Fredoka\", system-ui, sans-serif",
      "fuente-texto": "\"Nunito\", system-ui, sans-serif",
      "fuente-gotica": "\"Grenze Gotisch\", Georgia, serif",
      "titulo-espaciado": "0.01em", "titulo-mayusculas": "none",
      // Textura de papel gastado, apenas: la calma se conserva. Las piezas, un poco giradas, como pegadas a mano.
      "textura": noise(0.65, "0.36 0.27 0.16", 0.5), "textura-opacidad": "0.35", "textura-mezcla": "multiply",
      "rayas": "none", "giro": "0.7deg"
    }
  },
  carrera: {
    selector: '[data-fase="carrera"]',
    note: "Durante la carrera: gótico y sucio (Devil May Cry). De noche, tinta y no luz, recta y desbalanceada: sin bordes redondos, cajas asimétricas y letra gótica en los títulos.",
    // Las acciones principales van en un solo color por fase: carmesí de noche (el naranja queda para el caballo de fuego).
    // Bordes apenas sobre la superficie: líneas finas que separan, no que marcan.
    colors: { ...semantic("noche", n => n, "var(--noche-1)", "noche", "rojo"),
      "acento": "var(--carmesi)", "acento-encima": "oklch(0.62 0.22 25)", "sobre-acento": "var(--noche-12)",
      "borde-sutil": "var(--noche-4)", "borde": "var(--noche-5)", "borde-fuerte": "var(--noche-7)" },
    rest: {
      "radio": "0px", "radio-chico": "0px", "corte": "16px", "borde-ancho": "1px",
      // Desbalanceado: un lado marcado más grueso y una esquina cortada; las etiquetas, con el borde derecho inclinado.
      "borde-marcado": "3px",
      "recorte": "polygon(0 0, calc(100% - var(--corte)) 0, 100% var(--corte), 100% 100%, calc(var(--corte) * 0.6) 100%, 0 calc(100% - var(--corte) * 0.6))",
      "recorte-etiqueta": "polygon(0 0, 100% 0, calc(100% - 10px) 100%, 0 100%)",
      "sombra": "none", "sombra-presionada": "none", "patron": "none",
      "fuente-titulo": "\"Chakra Petch\", system-ui, sans-serif",
      "fuente-texto": "\"Chakra Petch\", system-ui, sans-serif",
      "fuente-gotica": "\"Grenze Gotisch\", Georgia, serif",
      "titulo-espaciado": "0.16em", "titulo-mayusculas": "uppercase",
      // Gótico y sucio (Devil May Cry), no buena onda, ni cyberpunk, ni Hotline Miami: tinta y no luz. Grano y piezas torcidas; sin trama de puntos de fondo.
      "textura": noise(0.9, "1 1 1", 0.55), "textura-opacidad": "0.16", "textura-mezcla": "overlay",
      "rayas": "none",
      // Tinta, no luz: de noche los halos son sombras duras desplazadas, como en un cómic impreso.
      "halo-suave": "2px 2px 0 var(--noche-1)",
      "halo-medio": "3px 3px 0 var(--noche-1), 5px 5px 0 var(--carmesi)",
      "halo-fuerte": "4px 4px 0 var(--noche-1), 8px 7px 0 var(--carmesi)",
      "brillo-acento": "4px 4px 0 var(--noche-1)",
      "linea-de-luz": "0 3px 0 var(--noche-1)", "giro": "1.4deg"
    }
  }
}

// ── CSS ────────────────────────────────────────────────────────────────────────────
const lines = []
lines.push("/* Club Race · Identidad. Generado por script/colores.mjs: cambiar ahí y volver a correrlo. */")
lines.push('@import url("https://fonts.googleapis.com/css2?family=Chakra+Petch:wght@500;600;700&family=Fredoka:wght@500;600;700&family=Grenze+Gotisch:wght@600;800&family=Mochiy+Pop+One&family=Nunito:wght@500;700;800&display=swap");')
lines.push("")
lines.push(":root {")
lines.push("  /* Primitivas: escalas de 12 pasos, compartidas por las dos fases.")
lines.push("     1–2 fondos · 3–5 elementos (normal, encima, presionado) · 6–8 bordes · 9–10 sólidos · 11–12 texto")
lines.push("     De noche: noche (neutro), fuego (marca), rojo, verde, ámbar, cian. De día: arena (neutro) y las mismas con -dia. */")
for (const [name, steps] of Object.entries(scales)) {
  lines.push(`  ${steps.map((s, i) => `--${name}-${i + 1}: ${oklch(s.L, s.C, s.H)};`).join(" ")}`)
}
lines.push("")
lines.push("  /* Caballos: 11 tonos a la misma distancia más el blanco, cada uno cerca de su croma máximo. En hex: la escena 3D los lee de acá.")
lines.push("     -tinta: el mismo tono, más oscuro, para fondos claros. */")
horses.forEach(h => lines.push(`  --caballo-${h.name}: ${h.hex}; --caballo-${h.name}-tinta: ${h.ink}; /* ${oklch(h.L, h.C, h.H)} · ΔE al más cercano ${f(h.nearest)} · contraste ${f(h.contrast, 1)}:1 de noche, tinta ${f(h.inkContrast, 1)}:1 de día */`))
lines.push("")
lines.push("  /* Luz (de noche): el brillo es un acento, no la forma de marcar altura. */")
lines.push("  --brillo-acento: 0 0 6px color-mix(in oklch, var(--acento) 70%, transparent), 0 0 18px color-mix(in oklch, var(--acento) 35%, transparent);")
lines.push("  --brillo-foco: 0 0 0 2px var(--fondo), 0 0 0 4px var(--foco), 0 0 14px color-mix(in oklch, var(--foco) 50%, transparent);")
lines.push("  --linea-de-luz: 0 0 1px var(--acento), 0 0 8px color-mix(in oklch, var(--acento) 55%, transparent);")
lines.push("  /* Carmesí: el rojo con filo de la carrera, más oscuro y saturado que el rojo de los estados. */")
lines.push("  --carmesi: oklch(0.56 0.22 25);")
lines.push("  /* Franjas: rojo, negro y blanco de corte duro, quietas. Para la meta, los bordes marcados y los carteles. */")
lines.push("  --franjas: repeating-linear-gradient(-55deg, var(--carmesi) 0 9px, var(--noche-1) 9px 15px, var(--noche-12) 15px 18px, var(--noche-1) 18px 24px);")
lines.push("  /* Ecos: copias secas y corridas, en negro y carmesí, con un filo frío del otro lado. */")
lines.push("  --ecos: 3px 3px 0 var(--noche-1), 6px 5px 0 var(--carmesi), -2px 0 0 color-mix(in oklch, var(--caballo-hielo) 55%, transparent);")
lines.push("  /* Halos de neón: toman el color del elemento (currentColor). En text-shadow o box-shadow; borde fino, nunca relleno grande. */")
lines.push("  --halo-suave: 0 0 1px currentColor, 0 0 6px color-mix(in oklch, currentColor 50%, transparent);")
lines.push("  --halo-medio: 0 0 1px currentColor, 0 0 8px color-mix(in oklch, currentColor 70%, transparent), 0 0 22px color-mix(in oklch, currentColor 35%, transparent);")
lines.push("  --halo-fuerte: 0 0 1px currentColor, 0 0 4px currentColor, 0 0 14px color-mix(in oklch, currentColor 80%, transparent), 0 0 40px color-mix(in oklch, currentColor 45%, transparent);")
lines.push("}")
for (const [name, phase] of Object.entries(PHASES)) {
  lines.push("")
  lines.push(`/* ${phase.note} */`)
  lines.push(`${phase.selector} {`)
  lines.push(`  color-scheme: ${name === "carrera" ? "dark" : "light"};`)
  Object.entries(phase.colors).forEach(([k, v]) => lines.push(`  --${k}: ${v};`))
  Object.entries(phase.rest).forEach(([k, v]) => lines.push(`  --${k}: ${v};`))
  lines.push("}")
}
lines.push("")
lines.push("/* De día: latido (corazones y brillitos que laten) y susto (algo raro asoma un instante, como en Doki Doki). */")
lines.push("@keyframes latido { 0%, 100% { scale: 1; rotate: -8deg } 50% { scale: 1.35; rotate: 8deg } }")
lines.push("@keyframes susto { 0%, 94%, 100% { color: var(--acento); filter: none; translate: 0 } 94.6% { color: var(--noche-1); filter: contrast(2); translate: 6px 0 } 95.2% { color: var(--carmesi); filter: invert(1); translate: -4px 0 } 95.8% { color: var(--noche-1); filter: none; translate: 2px 2px } }")
writeFileSync(new URL("../public/css/identidad.css", import.meta.url), lines.join("\n") + "\n")

// ── Controles ──────────────────────────────────────────────────────────────────────
const hx = s => hex(s.L, s.C, s.H)
const pair = (a, b) => f(contrast(hx(a), hx(b)), 1)
console.log("noche: texto", pair(scales.noche[11], scales.noche[1]), "suave", pair(scales.noche[10], scales.noche[1]), "apagado", pair(scales.noche[8], scales.noche[1]), "sobre acento", pair(scales.noche[0], scales.fuego[8]))
console.log("rosa:  sobre acento", pair(scales.arena[11], scales["rosa-dia"][8]), "acento-texto", pair(scales["rosa-dia"][10], scales.arena[1]))
console.log("día:   texto", pair(scales.arena[11], scales.arena[1]), "suave", pair(scales.arena[10], scales.arena[1]), "apagado", pair(scales.arena[9], scales.arena[1]), "sobre acento", pair(scales.arena[11], scales["fuego-dia"][8]))
for (const name of [...NIGHT_SCALES, ...DAY_SCALES]) console.log(name.padEnd(10), scales[name].map(hx).join(" "))
horses.forEach(h => console.log(h.name.padEnd(13), h.hex, "tinta", h.ink, `${f(h.inkContrast, 1)}:1`))
