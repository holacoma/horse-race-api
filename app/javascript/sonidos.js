// Sonidos y música de Club Race: solo los archivos generados con IA y elegidos en el soundboard (public/sonidos/juego/)
// y The World (public/sonidos/the-world.mp3). Nada sintetizado: si un sonido no tiene archivo, no suena.
// La música de la carrera empieza justo cuando termina The World, suena durante la presentación y su parte principal
// (después del solo de batería) cae justo en el ¡YA!. Se apaga en el festejo. Se puede apagar desde afuera (🎵).
// Los archivos se bajan y decodifican apenas abre la página, así el primer sonido ya es el nuevo.

let ctx = null
let master = null
let sfx = null
let theWorld = null
const archivos = {}
let musica = null
let bus = null // la música pasa por acá: así se apaga sin tocar los efectos
let pista = "pradera"
let finTheWorld = 0 // cuándo termina The World (reloj del audio)
let yaEn = null // cuándo es el ¡YA! (performance.now)
let reintentoMusica = null

// Dónde entra la parte principal de cada tema (después del solo de batería), en segundos del archivo. Medido con
// ffmpeg (golpe del bombo y el platillo después del redoble). Un tema sin medir empieza en el ¡YA!.
const PRINCIPAL = { "musica-carrera": 10.44 }

// Música sí o no: la elige cada uno (botón 🎵 fuera de la carrera) y queda en este navegador.
const MUSICA = "clubrace:musica"
let musicaSi = (() => { try { return localStorage.getItem(MUSICA) !== "no" } catch { return true } })()
export const hayMusica = () => musicaSi
export function activarMusica(si) {
  musicaSi = si
  try { localStorage.setItem(MUSICA, si ? "si" : "no") } catch {}
  if (bus) bus.gain.setTargetAtTime(si ? 1 : 0, ctx.currentTime, 0.08)
}

// Momento en que pega el golpe de "tiempo", para sincronizar lo visual.
export const GOLPE_TIEMPO = 0.6

// Música por pista: musica-<pista>.mp3 si existe; si no, la de siempre (musica-carrera).
export function elegirPista(nombre) { pista = nombre || "pradera" }

const ARCHIVOS = ["click", "tic", "moneda", "premio", "cuenta", "ya", "meta", "ganador", "relincho", "riff",
  "musica-carrera", "musica-pradera", "musica-desierto", "musica-nevado"]

// El contexto se crea al cargar (queda en pausa) para decodificar ya; el navegador lo deja sonar con el primer gesto.
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
    bus = ctx.createGain()
    bus.gain.value = musicaSi ? 1 : 0
    bus.connect(master)
    ctx.addEventListener("statechange", agendarMusica)
    cargar()
  }
  if (ctx.state === "suspended") ctx.resume().catch(() => {})
  return ctx
}
for (const type of ["pointerdown", "keydown", "touchstart"]) {
  addEventListener(type, audio, { capture: true, passive: true })
}

const ahora = () => ctx.currentTime

// Solo los que existen (los lista el layout), más The World si está.
function cargar() {
  const hay = document.querySelector('meta[name="sonidos-juego"]')?.content.split(" ")
  const bajar = (url, guardar) => fetch(url)
    .then(r => (r.ok ? r.arrayBuffer() : Promise.reject(new Error(r.status))))
    .then(data => ctx.decodeAudioData(data))
    .then(guardar)
    .catch(() => {})
  for (const nombre of ARCHIVOS.filter(n => !hay || hay.includes(n))) bajar(`/sonidos/juego/${nombre}.mp3`, b => { archivos[nombre] = b })
  const tw = document.querySelector('meta[name="sonido-the-world"]')?.content
  if (tw) bajar(tw, b => { theWorld = b })
}
if (document.readyState === "loading") addEventListener("DOMContentLoaded", audio, { once: true })
else audio()

function tocar(buffer, { t = ahora(), rate = 1, gain = 1, out = sfx, desde = 0 } = {}) {
  const src = ctx.createBufferSource()
  src.buffer = buffer
  src.playbackRate.value = rate
  const g = ctx.createGain()
  g.gain.value = gain
  // Empezar a mitad del archivo: un fundido cortito para que no haga clic.
  if (desde > 0) { g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(gain, t + 0.12) }
  src.connect(g).connect(out)
  src.start(t, desde)
  return { src, g }
}

// Suena un archivo si está; devuelve si sonó.
const archivo = (nombre, opciones) => !!archivos[nombre] && !!tocar(archivos[nombre], opciones)

// La música se agenda contra el ¡YA!: empieza cuando termina The World (o ya, si no suena), desde el punto del tema
// que hace que la parte principal caiga en el ¡YA!. Si el audio recién se pudo activar después del ¡YA! (el navegador
// lo bloquea hasta el primer toque en la página), entra desde la parte principal: nunca a la mitad del tema.
// El navegador no deja sonar nada hasta que se toca la página (por ejemplo, si se abrió un link directo).
export const audioBloqueado = () => !audio() || ctx.state !== "running"

// Si al empezar la carrera el audio sigue bloqueado, un aviso lo pide; se va solo al primer toque o tecla.
export function avisarSinSonido() {
  if (!audioBloqueado() || document.querySelector(".sin-sonido")) return
  const aviso = document.createElement("button")
  aviso.type = "button"
  aviso.className = "sin-sonido"
  aviso.textContent = "🔊 Toca la pantalla o presiona una tecla para activar el sonido"
  document.body.append(aviso)
  const listo = () => { if (ctx.state === "running") { aviso.remove(); ctx.removeEventListener("statechange", listo) } }
  ctx.addEventListener("statechange", listo)
}

export function programarMusica(segundosAlYa) {
  yaEn = performance.now() + segundosAlYa * 1000
  clearInterval(reintentoMusica)
  // Hasta que el archivo esté bajado y el audio activo (lo activa el primer toque).
  reintentoMusica = setInterval(() => {
    agendarMusica()
    if (musica || !yaEn || performance.now() > yaEn + 60_000) clearInterval(reintentoMusica)
  }, 200)
  agendarMusica()
}

function agendarMusica() {
  if (musica || !yaEn || !ctx || ctx.state !== "running") return
  const tema = archivos[`musica-${pista}`] ? `musica-${pista}` : "musica-carrera"
  const buffer = archivos[tema]
  if (!buffer) return
  const tYa = Math.max(ahora() + (yaEn - performance.now()) / 1000, ahora() + 0.02)
  const base = tYa - (PRINCIPAL[tema] ?? 0) // cuándo tendría que haber empezado el archivo desde cero
  const inicio = Math.max(base, finTheWorld, ahora() + 0.02)
  const desde = inicio - base
  if (desde >= buffer.duration) return
  musica = tocar(buffer, { t: inicio, desde, gain: 0.7, out: bus })
  window.__musica = { inicio, desde, tYa, tema, finTheWorld, yaEn, ahora: ahora(), perf: performance.now() } // para las pruebas
}

// Se terminó (festejo): se apaga y se olvida el ¡YA!.
function pararMusica(fundido = 1.5) {
  yaEn = null
  clearInterval(reintentoMusica)
  cortarMusica(fundido)
}

// Solo apaga lo que suena (o lo que estaba por sonar); el ¡YA! agendado sigue en pie.
function cortarMusica(fundido) {
  if (!musica) return
  const { src, g } = musica
  musica = null
  const t = ahora()
  g.gain.cancelScheduledValues(t)
  g.gain.setValueAtTime(g.gain.value, t)
  g.gain.linearRampToValueAtTime(0.0001, t + fundido)
  src.stop(t + fundido + 0.05)
}

// Cada sonido del juego, desde su archivo. Devuelven si sonaron.
const SONIDOS = {
  click: () => archivo("click", { gain: 0.6 }),
  tic: () => archivo("tic", { gain: 0.7 }),
  // El carrete: un tic por fila que pasa, parejo mientras gira y cada vez más espaciado al frenar.
  rodar(giraMs, frenaMs, carrete = 0) {
    if (!archivos.tic) return false
    const t0 = ahora()
    let t = 0
    let paso = 1 / 16
    while (t < (giraMs + frenaMs) / 1000) {
      tocar(archivos.tic, { t: t0 + t, gain: 0.45, rate: carrete ? 0.92 : 1 })
      if (t > giraMs / 1000) paso *= 1.35
      t += paso
    }
    return true
  },
  moneda: () => archivo("moneda", { gain: 0.8 }),
  premio: () => archivo("premio", { gain: 0.8 }),
  // El mundo se detiene: The World. Corta la música que estuviera sonando y, si la de esta carrera ya estaba agendada,
  // la vuelve a agendar para que entre cuando The World termine. Si The World todavía no bajó, no toca nada: la
  // música agendada sigue en pie (antes se borraba y entraba recién en el ¡YA!).
  tiempo() {
    if (!theWorld) return false
    cortarMusica(0.3)
    tocar(theWorld)
    finTheWorld = ahora() + theWorld.duration
    if (yaEn) programarMusica((yaEn - performance.now()) / 1000)
    return true
  },
  // 3, 2, 1: el mismo golpe, un poco más agudo en cada número.
  cuenta: n => archivo("cuenta", { rate: { 3: 1, 2: 1.06, 1: 1.12 }[n] ?? 1 }),
  // El ¡YA! ya no tiene efecto propio: lo marca la música. Si nadie la agendó (se entró sobre la hora), entra ahora,
  // en su parte principal.
  ya() {
    if (!musica && !yaEn) programarMusica(0)
    return true
  },
  meta: () => archivo("meta"),
  ganador() {
    pararMusica(1.2)
    return archivo("ganador")
  },
  // Cada favorito se presenta con su relincho (si hay archivo), con el tono un poco cambiado.
  relincho: n => archivo("relincho", { rate: 0.9 + ((n * 7) % 5) * 0.06 }),
  // El riff de la ficha de un caballo: su archivo o, si no hay, el del inicio (sin la música detrás).
  riff: () => archivo("riff") || archivo("ya")
}

export function sonar(nombre, ...args) {
  const fn = SONIDOS[nombre]
  if (!fn || !audio() || ctx.state !== "running") return false
  let sono = false
  try { sono = fn(...args) } catch (error) { console.warn("sonido", nombre, error) }
  // Registro de lo que sonó, para las pruebas.
  if (sono) window.__sonados = [...(window.__sonados || []), nombre]
  return sono
}

// Si todavía no se puede sonar (nadie tocó la página o no bajó el archivo), suena apenas se pueda, una vez y si no
// pasó demasiado.
export function sonarCuandoSePueda(nombre, vence = 1500) {
  if (sonar(nombre)) return
  const hasta = performance.now() + vence
  let sono = false
  const intento = () => { if (!sono && performance.now() < hasta) sono = sonar(nombre) }
  for (const type of ["pointerdown", "keydown"]) addEventListener(type, intento, { once: true, passive: true })
  const c = audio()
  if (c) c.resume().then(intento).catch(() => {})
  const reintento = setInterval(() => { intento(); if (sono || performance.now() >= hasta) clearInterval(reintento) }, 150)
}
