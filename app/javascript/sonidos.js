// Sonidos y música de Club Race, sintetizados con Web Audio.
// Sin música por ahora (llegan archivos). La carrera es metal: al largar el tiempo se detiene (si hay un archivo
// public/sonidos/the-world.*, suena ese; si no, uno sintetizado), en la largada entra un riff de guitarra, la cuenta y la meta son golpes fuertes y el ganador tiene una fanfarria de guitarra.
// La UI (clic, carretes, monedas) queda chica, para dejarle lugar a lo demás.

let ctx = null
let master = null
let sfx = null
let reverb = null
let distorsion = null
let ruido = null
let theWorld = null

// Momento en que pega el golpe de "tiempo", para sincronizar lo visual.
export const GOLPE_TIEMPO = 0.6

// El navegador no deja sonar hasta que la persona toca algo: el contexto se crea o se reanuda con el primer gesto.
function audio() {
  if (!ctx) {
    const Ctx = window.AudioContext || window.webkitAudioContext
    if (!Ctx) return null
    ctx = new Ctx()
    // Fuerte pero sin saturar: todo pasa por un compresor.
    const compresor = ctx.createDynamicsCompressor()
    compresor.threshold.value = -16
    compresor.knee.value = 8
    compresor.ratio.value = 5
    compresor.attack.value = 0.004
    compresor.release.value = 0.2
    master = ctx.createGain()
    master.gain.value = 1.1
    master.connect(compresor).connect(ctx.destination)
    sfx = ctx.createGain()
    sfx.connect(master)
    reverb = ctx.createConvolver()
    reverb.buffer = impulso(2.6, 2.2)
    const wet = ctx.createGain()
    wet.gain.value = 0.5
    reverb.connect(wet).connect(master)
    distorsion = new Float32Array(2048).map((_, i) => Math.tanh(((i / 2047) * 2 - 1) * 10))
    ruido = buffer(2, () => Math.random() * 2 - 1)
    cargarTheWorld()
  }
  if (ctx.state === "suspended") ctx.resume().catch(() => {})
  return ctx
}
for (const type of ["pointerdown", "keydown", "touchstart"]) {
  addEventListener(type, audio, { capture: true, passive: true })
}

const ahora = () => ctx.currentTime

function buffer(seconds, sample, channels = 1) {
  const length = Math.floor(ctx.sampleRate * seconds)
  const b = ctx.createBuffer(channels, length, ctx.sampleRate)
  for (let c = 0; c < channels; c++) {
    const data = b.getChannelData(c)
    for (let i = 0; i < length; i++) data[i] = sample(i / length)
  }
  return b
}
const impulso = (seconds, decay) => buffer(seconds, x => (Math.random() * 2 - 1) * Math.pow(1 - x, decay), 2)

// El archivo de The World, si está (el layout lo anuncia con <meta name="sonido-the-world">).
function cargarTheWorld() {
  const url = document.querySelector('meta[name="sonido-the-world"]')?.content
  if (!url) return
  fetch(url).then(r => r.arrayBuffer()).then(data => ctx.decodeAudioData(data)).then(b => { theWorld = b }).catch(() => {})
}

// ── Piezas ──────────────────────────────────────────────────────────────────────────
function tono({ t = ahora(), type = "sine", freq, to = null, dur, gain = 0.2, attack = 0.005, wet = 0, out = sfx, detune = 0 }) {
  const osc = ctx.createOscillator()
  const env = ctx.createGain()
  osc.type = type
  osc.detune.value = detune
  osc.frequency.setValueAtTime(freq, t)
  if (to) osc.frequency.exponentialRampToValueAtTime(to, t + dur)
  env.gain.setValueAtTime(0.0001, t)
  env.gain.exponentialRampToValueAtTime(gain, t + attack)
  env.gain.exponentialRampToValueAtTime(0.0001, t + dur)
  osc.connect(env).connect(out)
  if (wet && out === sfx) { const send = ctx.createGain(); send.gain.value = wet; env.connect(send).connect(reverb) }
  osc.start(t)
  osc.stop(t + dur + 0.05)
}

function soplo({ t = ahora(), dur, gain = 0.2, filter = "bandpass", freq = 2000, sweep = null, q = 1, attack = 0.003, rise = false, wet = 0, out = sfx }) {
  const src = ctx.createBufferSource()
  src.buffer = ruido
  src.loop = true
  const f = ctx.createBiquadFilter()
  f.type = filter
  f.Q.value = q
  f.frequency.setValueAtTime(freq, t)
  if (sweep) f.frequency.exponentialRampToValueAtTime(sweep, t + dur)
  const env = ctx.createGain()
  env.gain.setValueAtTime(0.0001, t)
  if (rise) {
    // Al revés: crece hasta el final y se corta seco, como un platillo invertido.
    env.gain.exponentialRampToValueAtTime(gain, t + dur)
    env.gain.setValueAtTime(0.0001, t + dur + 0.01)
  } else {
    env.gain.exponentialRampToValueAtTime(gain, t + attack)
    env.gain.exponentialRampToValueAtTime(0.0001, t + dur)
  }
  src.connect(f).connect(env).connect(out)
  if (wet && out === sfx) { const send = ctx.createGain(); send.gain.value = wet; env.connect(send).connect(reverb) }
  src.start(t, Math.random())
  src.stop(t + dur + 0.05)
}

// Batería.
const bombo = (t, gain = 0.9, out = sfx) => {
  tono({ t, freq: 150, to: 42, dur: 0.32, gain, attack: 0.002, out })
  soplo({ t, dur: 0.015, gain: gain * 0.35, filter: "highpass", freq: 3000, out })
}
const caja = (t, gain = 0.6, out = sfx) => {
  soplo({ t, dur: 0.2, gain, freq: 1900, q: 0.7, out, wet: 0.15 })
  tono({ t, type: "triangle", freq: 190, to: 160, dur: 0.12, gain: gain * 0.5, out })
}
const platillo = (t, gain = 0.35, out = sfx) => soplo({ t, dur: 1.8, gain, filter: "highpass", freq: 5500, attack: 0.002, out, wet: 0.3 })
const charles = (t, gain = 0.1, out = sfx) => soplo({ t, dur: 0.045, gain, filter: "highpass", freq: 8000, out })
const tambor = (t, freq, gain = 0.9) => {
  tono({ t, freq, to: freq * 0.5, dur: 0.7, gain, attack: 0.003, wet: 0.4 })
  soplo({ t, dur: 0.18, gain: gain * 0.5, filter: "lowpass", freq: 900, wet: 0.3 })
}

// Guitarra distorsionada: power chord (raíz, quinta y octava) con dos voces desafinadas, distorsión y caja.
// Apagada (palm mute) es corta y oscura; abierta suena llena.
function guitarra(t, raiz, dur, { apagada = false, gain = 0.3, out = sfx } = {}) {
  const pre = ctx.createGain()
  pre.gain.value = 0.5
  const shaper = ctx.createWaveShaper()
  shaper.curve = distorsion
  shaper.oversample = "2x"
  const parlante = ctx.createBiquadFilter()
  parlante.type = "lowpass"
  parlante.frequency.value = apagada ? 1100 : 3600
  parlante.Q.value = 0.9
  const cuerpo = ctx.createBiquadFilter()
  cuerpo.type = "peaking"
  cuerpo.frequency.value = 110
  cuerpo.gain.value = 5
  const env = ctx.createGain()
  env.gain.setValueAtTime(0.0001, t)
  env.gain.exponentialRampToValueAtTime(gain, t + 0.004)
  env.gain.setValueAtTime(gain, t + dur * (apagada ? 0.35 : 0.75))
  env.gain.exponentialRampToValueAtTime(0.0001, t + dur)
  pre.connect(shaper).connect(parlante).connect(cuerpo).connect(env).connect(out)
  for (const f of [raiz, raiz * 1.5, raiz * 2]) {
    for (const cents of [-9, 9]) {
      const o = ctx.createOscillator()
      o.type = "sawtooth"
      o.frequency.value = f
      o.detune.value = cents
      o.connect(pre)
      o.start(t)
      o.stop(t + dur + 0.05)
    }
  }
}

// Afinación baja (drop D): las raíces de los power chords.
const NOTA = { D: 73.42, F: 87.31, G: 98.0, Gs: 103.83, A: 110.0, C: 130.81 / 2, Bb: 116.54 }
const DIECISEISAVO = 60 / 170 / 4

// ── Sonidos ────────────────────────────────────────────────────────────────────────
const SONIDOS = {
  // UI: chicos.
  click() { tono({ freq: 880, to: 520, dur: 0.07, gain: 0.1 }) },
  tic() {
    soplo({ dur: 0.03, gain: 0.14, freq: 2400, q: 6 })
    tono({ type: "triangle", freq: 1200, dur: 0.05, gain: 0.08 })
  },
  premio() {
    [1047, 1319, 1568].forEach((freq, i) => tono({ t: ahora() + i * 0.07, type: "triangle", freq, dur: 0.22, gain: 0.14, wet: 0.2 }))
  },
  // Un tintineo de moneda: parciales inarmónicos que caen rápido.
  moneda() {
    [[2350, 0.12], [3530, 0.07], [5170, 0.05]].forEach(([freq, gain]) => tono({ freq, dur: 0.35, gain, wet: 0.15 }))
    ;[[2350 * 1.06, 0.08], [3530 * 1.06, 0.05]].forEach(([freq, gain]) => tono({ t: ahora() + 0.08, freq, dur: 0.3, gain, wet: 0.15 }))
  },

  // La carrera: fuertes.
  // El mundo se detiene.
  tiempo() {
    if (theWorld) {
      const src = ctx.createBufferSource()
      src.buffer = theWorld
      src.connect(sfx)
      src.start()
      return
    }
    const t = ahora()
    const crece = GOLPE_TIEMPO
    soplo({ t, dur: crece, gain: 0.5, freq: 300, sweep: 7000, q: 0.7, rise: true })
    tono({ t, freq: 70, to: 300, dur: crece, gain: 0.18, attack: crece * 0.9 })
    tono({ t: t + crece, freq: 75, to: 30, dur: 1.6, gain: 1 })
    soplo({ t: t + crece, dur: 0.35, gain: 0.5, filter: "lowpass", freq: 1200, wet: 0.6 })
    // Campana: parciales de una campana real (1, 2.76, 5.40, 8.93), con mucha reverberación.
    ;[[1, 0.3], [2.76, 0.16], [5.4, 0.09], [8.93, 0.05]].forEach(([ratio, gain]) =>
      tono({ t: t + crece, freq: 196 * ratio, dur: 2.8, gain, wet: 0.9 }))
    tono({ t: t + crece + 0.1, freq: 55, dur: 3, gain: 0.12, attack: 0.4 })
    // El reloj: tic, tac, cada vez más lento y más bajo.
    ;[0.95, 1.4, 1.95, 2.65, 3.5].forEach((at, i) => {
      soplo({ t: t + at, dur: 0.03, gain: 0.22 - i * 0.035, freq: i % 2 ? 1500 : 2100, q: 6, wet: 0.5 })
      tono({ t: t + at, type: "triangle", freq: i % 2 ? 750 : 1050, dur: 0.05, gain: 0.12 - i * 0.02, wet: 0.5 })
    })
  },

  // 3, 2, 1: tambores graves que suben.
  cuenta(n) {
    const t = ahora()
    tambor(t, { 3: 62, 2: 74, 1: 88 }[n] || 70, 1)
    guitarra(t, NOTA.D, 0.5, { apagada: true, gain: 0.35 })
    platillo(t, 0.12)
  },

  // ¡Ya!: el riff de largada, dos compases.
  ya() {
    const t = ahora() + 0.02
    const s = DIECISEISAVO
    // [semicorchea, nota, duración en semicorcheas, apagada]
    const RIFF = [
      [0, "D", 1, 1], [1, "D", 1, 1], [2, "D", 1, 1], [3, "F", 2, 0], [5, "D", 1, 1], [6, "D", 1, 1], [7, "Gs", 2, 0],
      [9, "D", 1, 1], [10, "D", 1, 1], [11, "A", 2, 0], [13, "G", 1, 0], [14, "F", 2, 0],
      [16, "D", 8, 0], [24, "D", 1, 1], [25, "D", 1, 1], [26, "D", 1, 1], [27, "C", 2, 0], [29, "D", 1, 1], [30, "Bb", 2, 0]
    ]
    for (const [paso, nota, largo, apagada] of RIFF) {
      guitarra(t + paso * s, NOTA[nota], s * largo, { apagada: !!apagada, gain: 0.34 })
      bombo(t + paso * s, apagada ? 0.6 : 0.85)
    }
    ;[4, 12, 20, 28].forEach(paso => caja(t + paso * s, 0.6))
    platillo(t, 0.4)
    platillo(t + 16 * s, 0.4)
  },

  // Meta: un golpe y un acorde abierto que queda sonando.
  meta() {
    const t = ahora()
    bombo(t, 1)
    tambor(t, 50, 1)
    platillo(t, 0.5)
    guitarra(t, NOTA.D, 2.2, { gain: 0.38 })
  },

  // Ganador: fanfarria de power chords que sube.
  ganador() {
    const t = ahora()
    ;[["D", 0], ["F", 0.2], ["G", 0.4], ["A", 0.6]].forEach(([nota, at], i) => {
      guitarra(t + at, NOTA[nota], i === 3 ? 1.8 : 0.22, { gain: 0.34 })
      bombo(t + at, 0.8)
    })
    platillo(t + 0.6, 0.45)
    caja(t + 0.6, 0.6)
  }
}

export function sonar(nombre, ...args) {
  const fn = SONIDOS[nombre]
  if (!fn || !audio() || ctx.state !== "running") return false
  try { fn(...args) } catch (error) { console.warn("sonido", nombre, error) }
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

