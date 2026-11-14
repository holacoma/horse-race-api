// La música de la carrera (app/javascript/sonidos.js), con un audio falso y un reloj a mano.
// Correr: node --test test/javascript/   (o bin/rails test:js)
import { test } from "node:test"
import assert from "node:assert/strict"

const PRINCIPAL = 10.44 // parte principal de musica-carrera (después del solo de batería)
const THE_WORLD = 3.96

// Un navegador mínimo: AudioContext que anota cada sonido que empieza, fetch que se puede demorar y un reloj propio.
function navegador({ estado = "running" } = {}) {
  const reloj = { ms: 0 }
  const gesto = { hubo: estado === "running" } // el navegador deja sonar recién después de un toque
  const sonidos = [] // { nombre, t, desde, cortado }
  const pendientes = {}
  const param = () => ({ value: 0, setValueAtTime() {}, linearRampToValueAtTime() {}, cancelScheduledValues() {}, setTargetAtTime() {} })
  const nodo = () => ({ gain: param(), threshold: param(), knee: param(), ratio: param(), attack: param(), release: param(), connect: n => n })
  class Ctx {
    constructor() { this.state = estado; this.destination = {}; this.oyentes = [] }
    get currentTime() { return reloj.ms / 1000 }
    createDynamicsCompressor() { return nodo() }
    createGain() { return nodo() }
    createBufferSource() {
      const fuente = { buffer: null, playbackRate: param(), connect: n => n }
      fuente.start = (t, desde = 0) => { fuente.registro = { nombre: fuente.buffer.nombre, t, desde, cortado: false }; sonidos.push(fuente.registro) }
      fuente.stop = () => { fuente.registro.cortado = true }
      return fuente
    }
    decodeAudioData(datos) { return Promise.resolve(datos) }
    resume() {
      if (gesto.hubo && this.state !== "running") { this.state = "running"; this.oyentes.forEach(f => f()) }
      return Promise.resolve()
    }
    addEventListener(_, f) { this.oyentes.push(f) }
    removeEventListener() {}
  }
  const duraciones = { "musica-carrera": 60, "the-world": THE_WORLD, cuenta: 0.4, ya: 1 }
  const g = globalThis
  g.window = g
  g.AudioContext = Ctx
  g.addEventListener = () => {}
  g.localStorage = { getItem: () => null, setItem() {} }
  g.document = {
    readyState: "complete",
    querySelector: sel => (sel.includes("sonidos-juego") ? { content: "musica-carrera cuenta ya" }
      : sel.includes("sonido-the-world") ? { content: "/sonidos/the-world.mp3" } : null)
  }
  Object.defineProperty(g, "performance", { value: { now: () => reloj.ms }, configurable: true })
  // Cada archivo baja cuando se lo suelta (soltar("the-world")); los demás, al toque.
  g.fetch = url => {
    const nombre = url.split("/").pop().replace(".mp3", "")
    const datos = { nombre, duration: duraciones[nombre] ?? 1 }
    const respuesta = { ok: true, arrayBuffer: () => Promise.resolve(datos) }
    if (nombre !== "the-world") return Promise.resolve(respuesta)
    return new Promise(r => { pendientes[nombre] = () => r(respuesta) })
  }
  const soltar = async nombre => { pendientes[nombre]?.(); await vaciar() }
  const avanzar = async segundos => { reloj.ms += segundos * 1000; await vaciar() }
  const tocarPagina = async () => { gesto.hubo = true; await vaciar() }
  return { reloj, sonidos, soltar, avanzar, tocarPagina }
}
const vaciar = () => new Promise(r => setImmediate(r))
let n = 0
const cargarSonidos = async () => { const m = await import(`../../app/javascript/sonidos.js?n=${++n}`); await vaciar(); return m }
const musicaQueQueda = sonidos => sonidos.filter(s => s.nombre === "musica-carrera" && !s.cortado)

test("la música empieza al terminar The World y la parte principal cae en el ¡YA!, aunque The World baje tarde", async () => {
  const nav = navegador()
  const m = await cargarSonidos()
  // Empieza la carrera: el ¡YA! es en 13 s. The World todavía no bajó (primer intento, falla).
  m.programarMusica(13)
  assert.equal(m.sonar("tiempo"), false)
  // Ese intento fallido no puede borrar la música agendada (era el bug: entraba recién en el ¡YA!).
  assert.equal(musicaQueQueda(nav.sonidos).length, 1)
  // Medio segundo después baja The World y suena.
  await nav.avanzar(0.5)
  await nav.soltar("the-world")
  assert.equal(m.sonar("tiempo"), true)
  const [musica] = musicaQueQueda(nav.sonidos)
  const finTheWorld = 0.5 + THE_WORLD
  assert.ok(Math.abs(musica.t - finTheWorld) < 0.01, `empieza al terminar The World (${musica.t} vs ${finTheWorld})`)
  const golpe = musica.t + (PRINCIPAL - musica.desde)
  assert.ok(Math.abs(golpe - 13) < 0.01, `la parte principal cae en el ¡YA! (${golpe})`)
})

test("en el ¡YA! no suena ningún efecto: la música lo marca", async () => {
  const nav = navegador()
  const m = await cargarSonidos()
  m.programarMusica(13)
  await nav.avanzar(13)
  m.sonar("ya")
  assert.deepEqual(nav.sonidos.filter(s => s.nombre === "ya"), [])
})

test("si el audio se activa después del ¡YA!, la música entra desde la parte principal, no a la mitad", async () => {
  const nav = navegador({ estado: "suspended" })
  const m = await cargarSonidos()
  m.programarMusica(13)
  assert.equal(musicaQueQueda(nav.sonidos).length, 0) // bloqueado: nada suena
  // Primer toque 7 s después del ¡YA!: el audio se activa (cualquier sonido llama a audio(), que lo reanuda).
  await nav.avanzar(20)
  await nav.tocarPagina()
  m.sonar("click")
  await vaciar()
  const [musica] = musicaQueQueda(nav.sonidos)
  assert.ok(musica, "suena")
  assert.ok(Math.abs(musica.desde - PRINCIPAL) < 0.01, `desde la parte principal (${musica.desde})`)
})
