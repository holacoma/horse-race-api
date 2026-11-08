// Sonidos de Club Race, sintetizados con Web Audio (sin archivos).
// Uno grande: "tiempo", el mundo que se detiene al largar. El resto, cortos y simples, para dejarle lugar.
//   click   botones
//   tic     carretes de la tragamonedas y la cuenta 3, 2, 1
//   ya      la largada, después de la cuenta
//   premio  la tragamonedas da un nombre
//   moneda  llega un caballo a la sala
//   meta    el ganador cruza la meta
//   ganador el festejo

let ctx = null
let master = null
let reverb = null

// El navegador no deja sonar hasta que la persona toca algo: el contexto se crea o se reanuda con el primer gesto.
function audio() {
  if (!ctx) {
    const Ctx = window.AudioContext || window.webkitAudioContext
    if (!Ctx) return null
    ctx = new Ctx()
    master = ctx.createGain()
    master.gain.value = 0.8
    master.connect(ctx.destination)
    reverb = ctx.createConvolver()
    reverb.buffer = impulse(2.6, 2.2)
    const wet = ctx.createGain()
    wet.gain.value = 0.55
    reverb.connect(wet).connect(master)
  }
  if (ctx.state === "suspended") ctx.resume().catch(() => {})
  return ctx
}
for (const type of ["pointerdown", "keydown", "touchstart"]) {
  addEventListener(type, audio, { capture: true, passive: true })
}

function impulse(seconds, decay) {
  const length = Math.floor(ctx.sampleRate * seconds)
  const buffer = ctx.createBuffer(2, length, ctx.sampleRate)
  for (let c = 0; c < 2; c++) {
    const data = buffer.getChannelData(c)
    for (let i = 0; i < length; i++) data[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / length, decay)
  }
  return buffer
}

function noiseBuffer(seconds) {
  const length = Math.floor(ctx.sampleRate * seconds)
  const buffer = ctx.createBuffer(1, length, ctx.sampleRate)
  const data = buffer.getChannelData(0)
  for (let i = 0; i < length; i++) data[i] = Math.random() * 2 - 1
  return buffer
}

// Un tono con envolvente: sube en `attack` y cae exponencial hasta `start + dur`.
function tone({ type = "sine", freq, to = null, at = 0, dur, gain = 0.2, attack = 0.005, wet = 0, out = master }) {
  const t = ctx.currentTime + at
  const osc = ctx.createOscillator()
  const env = ctx.createGain()
  osc.type = type
  osc.frequency.setValueAtTime(freq, t)
  if (to) osc.frequency.exponentialRampToValueAtTime(to, t + dur)
  env.gain.setValueAtTime(0.0001, t)
  env.gain.exponentialRampToValueAtTime(gain, t + attack)
  env.gain.exponentialRampToValueAtTime(0.0001, t + dur)
  osc.connect(env).connect(out)
  if (wet) { const send = ctx.createGain(); send.gain.value = wet; env.connect(send).connect(reverb) }
  osc.start(t)
  osc.stop(t + dur + 0.05)
}

// Ruido filtrado con envolvente; `sweep` mueve la frecuencia del filtro de `freq` a `sweep`.
function noise({ at = 0, dur, gain = 0.2, filter = "bandpass", freq = 2000, sweep = null, q = 1, attack = 0.003, rise = false, wet = 0 }) {
  const t = ctx.currentTime + at
  const src = ctx.createBufferSource()
  src.buffer = noiseBuffer(dur + 0.1)
  const f = ctx.createBiquadFilter()
  f.type = filter
  f.Q.value = q
  f.frequency.setValueAtTime(freq, t)
  if (sweep) f.frequency.exponentialRampToValueAtTime(sweep, t + dur)
  const env = ctx.createGain()
  if (rise) {
    // Al revés: crece hasta el final y se corta seco, como un platillo invertido.
    env.gain.setValueAtTime(0.0001, t)
    env.gain.exponentialRampToValueAtTime(gain, t + dur)
    env.gain.setValueAtTime(0.0001, t + dur + 0.01)
  } else {
    env.gain.setValueAtTime(0.0001, t)
    env.gain.exponentialRampToValueAtTime(gain, t + attack)
    env.gain.exponentialRampToValueAtTime(0.0001, t + dur)
  }
  src.connect(f).connect(env).connect(master)
  if (wet) { const send = ctx.createGain(); send.gain.value = wet; env.connect(send).connect(reverb) }
  src.start(t)
  src.stop(t + dur + 0.1)
}

const tick = (at, freq, gain, wet = 0) => {
  noise({ at, dur: 0.03, gain, freq, q: 6, wet })
  tone({ type: "triangle", freq: freq * 0.5, at, dur: 0.05, gain: gain * 0.6, wet })
}

const SONIDOS = {
  click() { tone({ freq: 880, to: 520, dur: 0.07, gain: 0.08 }) },

  tic() { tick(0, 2400, 0.12) },

  ya() {
    tone({ type: "triangle", freq: 660, to: 1320, dur: 0.18, gain: 0.16 })
    noise({ dur: 0.25, gain: 0.08, filter: "highpass", freq: 3000 })
  },

  premio() {
    [1047, 1319, 1568].forEach((freq, i) => tone({ type: "triangle", freq, at: i * 0.07, dur: 0.22, gain: 0.12, wet: 0.2 }))
  },

  // Un tintineo de moneda: parciales inarmónicos que caen rápido.
  moneda() {
    [[2350, 0.1], [3530, 0.06], [5170, 0.04]].forEach(([freq, gain]) => tone({ freq, dur: 0.35, gain, wet: 0.15 }))
    ;[[2350 * 1.06, 0.07], [3530 * 1.06, 0.04]].forEach(([freq, gain]) => tone({ freq, at: 0.08, dur: 0.3, gain, wet: 0.15 }))
  },

  meta() {
    tone({ freq: 90, to: 40, dur: 0.6, gain: 0.5 })
    noise({ dur: 0.35, gain: 0.25, filter: "lowpass", freq: 1500, wet: 0.4 })
  },

  ganador() {
    [784, 1047, 1319, 1568].forEach((freq, i) =>
      tone({ type: "triangle", freq, at: i * 0.09, dur: i === 3 ? 0.7 : 0.18, gain: 0.13, wet: 0.3 }))
  },

  // El mundo se detiene: crece al revés, golpe grave con campana metálica, y un reloj que se frena hasta quedar quieto.
  tiempo() {
    const swell = 0.6
    noise({ dur: swell, gain: 0.35, freq: 300, sweep: 7000, q: 0.7, rise: true })
    tone({ freq: 70, to: 300, dur: swell, gain: 0.12, attack: swell * 0.9 })

    tone({ freq: 75, to: 32, at: swell, dur: 1.4, gain: 0.7 })
    noise({ at: swell, dur: 0.3, gain: 0.35, filter: "lowpass", freq: 1200, wet: 0.6 })
    // Campana: parciales de una campana real (1, 2.76, 5.40, 8.93), con mucha reverberación.
    ;[[1, 0.22], [2.76, 0.12], [5.4, 0.07], [8.93, 0.04]].forEach(([ratio, gain]) =>
      tone({ freq: 196 * ratio, at: swell, dur: 2.6, gain, wet: 0.9 }))
    // Zumbido quieto mientras el tiempo está parado.
    tone({ freq: 55, at: swell + 0.1, dur: 3, gain: 0.08, attack: 0.4 })

    // El reloj: tic, tac, cada vez más lento y más bajo.
    ;[0.95, 1.4, 1.95, 2.65, 3.5].forEach((at, i) => tick(at, i % 2 ? 1500 : 2100, 0.16 - i * 0.025, 0.5))
  }
}

// Momento en que pega el golpe de "tiempo", para sincronizar lo visual.
export const GOLPE_TIEMPO = 0.6

export function sonar(nombre) {
  const fn = SONIDOS[nombre]
  if (!fn || !audio() || ctx.state !== "running") return false
  try { fn() } catch (error) { console.warn("sonido", nombre, error) }
  // Registro de lo que sonó, para las pruebas.
  window.__sonados = [...(window.__sonados || []), nombre]
  return true
}

// Si todavía no se puede sonar (nadie tocó la página), suena apenas se pueda, una vez y si no pasó demasiado.
export function sonarCuandoSePueda(nombre, vence = 1500) {
  if (sonar(nombre)) return
  const hasta = performance.now() + vence
  let sono = false
  const intento = () => { if (!sono && performance.now() < hasta) sono = sonar(nombre) }
  for (const type of ["pointerdown", "keydown"]) addEventListener(type, intento, { once: true, passive: true })
  const c = audio()
  if (c) c.resume().then(intento).catch(() => {})
}
