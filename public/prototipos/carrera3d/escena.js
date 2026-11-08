// Escena de la carrera. No sabe de dónde vienen los datos: recibe las mismas posiciones que manda
// RaceSimulationJob (porcentaje recorrido, cada 0,3 s) y el ganador, ya sea del servidor o del simulador.
// Una unidad de la escena es un metro: la pista se construye según la distancia de la carrera.
import * as THREE from "three"
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js"
import { buildHorse, shared, toon } from "./caballo.js"
import { buildProHorse } from "./caballo-pro.js"

const RENDER_DELAY = 0.34 // se dibuja apenas en el pasado para interpolar entre dos mensajes del servidor
const OPENING_SECONDS = 3.2
const SHOT_SECONDS = 4.5 // una toma cada varios segundos: a esta velocidad, cortes por metros serían un parpadeo
const FIRE_DELAY = 0.25 // la llamarada arranca justo después del ¡YA!
const FIRE_SECONDS = 2
const FIRE_CASCADE = 0.14 // segundos entre un carril y el siguiente
const ARRIVAL_SECONDS = 2.4 // antes de cruzar, la cámara se planta pasando la meta
// En estas tomas importa ver a todos: sin árboles en cuadro, y los efectos que deforman y barren la imagen bajan mucho.
const WIDE_SHOTS = new Set(["peloton", "recta", "llegada"])
const TOP_SPEED = 120 // m/s, para escalar los efectos de velocidad
const CRUISE_BRAKE = 55 // m/s² al pasar la meta
export const PRELUDE_SECONDS = 13 // 10 de presentación y 3, 2, 1
const WORLD_FROM = 1.0 // cuándo se abre la grieta, dentro del preludio
const WORLD_SECONDS = 2.8
const LANE = 2.3
// El final se ve tres veces: en vivo con un paneo total, y dos repeticiones desde otros ángulos.
const PAN_SECONDS = 2.8
const REPLAY_SECONDS = 2.6
const REPLAY_RATE = 0.28 // velocidad de la repetición respecto del tiempo real de carrera
const REPLAY_BEFORE = 0.5 // cuánto antes de cruzar arranca cada repetición, en tiempo de carrera
const PAN_RATE = 0.14
const CELEBRATE_AFTER = PAN_SECONDS + REPLAY_SECONDS * 2
const finishStage = crossedFor => {
  if (crossedFor < 0) return null
  if (crossedFor < PAN_SECONDS) return "paneo"
  if (crossedFor < PAN_SECONDS + REPLAY_SECONDS) return "replay-bajo"
  if (crossedFor < CELEBRATE_AFTER) return "replay-perfil"
  return "festejo"
}

const clamp = (x, a, b) => Math.min(b, Math.max(a, x))
const smooth = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t) }
const damp = (a, b, rate, dt) => a + (b - a) * (1 - Math.exp(-rate * dt))
const seeded = s => () => {
  s |= 0; s = s + 0x6D2B79F5 | 0
  let t = Math.imul(s ^ s >>> 15, 1 | s)
  t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t
  return ((t ^ t >>> 14) >>> 0) / 4294967296
}

const NOISE = `
  float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
  float noise(vec2 p) {
    vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
    return mix(mix(hash(i), hash(i + vec2(1, 0)), f.x), mix(hash(i + vec2(0, 1)), hash(i + vec2(1, 1)), f.x), f.y);
  }
  float fbm(vec2 p) { float v = 0.0, a = 0.5; for (int i = 0; i < 5; i++) { v += a * noise(p); p = p * 2.03 + 3.1; a *= 0.5; } return v; }
`

function textTexture(lines, { width = 1024, height = 200, bg = "#ffc61a", fg = "#1a1020", font = 110 } = {}) {
  const canvas = document.createElement("canvas")
  canvas.width = width; canvas.height = height
  const c = canvas.getContext("2d")
  c.fillStyle = bg; c.fillRect(0, 0, width, height)
  c.fillStyle = fg; c.font = `900 ${font}px system-ui, sans-serif`
  c.textAlign = "center"; c.textBaseline = "middle"
  c.fillText(lines, width / 2, height / 2 + 6)
  const texture = new THREE.CanvasTexture(canvas)
  texture.colorSpace = THREE.SRGBColorSpace
  texture.anisotropy = 4
  return texture
}

export function createRace({ participants, slots = null, distance = 2000, horseModel = null, myId = null, capture = false, onCelebrate = null, onDone = null, onCount = null, onCross = null, showFps = true }) {
  const FINISH = distance
  // La recta final crece con la carrera, con tope: unos 6 segundos a toda velocidad.
  const STRETCH = Math.min(700, Math.max(38, distance * 0.3))
  const STRETCH_FROM = FINISH - STRETCH
  const STRETCH_FULL = FINISH - STRETCH * 0.35

  const renderer = new THREE.WebGLRenderer({ antialias: false, preserveDrawingBuffer: capture, powerPreference: "high-performance" })
  renderer.setPixelRatio(Math.min(devicePixelRatio, 1.75))
  renderer.info.autoReset = false // el total del cuadro incluye varias pasadas
  document.body.prepend(renderer.domElement)

  // Un carril por lugar: en la sala los caballos aparecen en la largada a medida que alguien se une (join).
  const N = Math.max(1, slots ?? 0, participants.length)
  const WIDTH = N * LANE + 2.4
  const scene = new THREE.Scene()
  const camera = new THREE.PerspectiveCamera(45, 1, 0.1, 900)

  const uI = { value: 0 }
  const uT = shared.uTime
  const uWorld = { value: 0 } // 0 hipódromo de día, 1 inframundo
  const uWave = { value: -100 } // radio de la onda que cambia el piso, desde la salida
  const uSpeed = { value: 0 } // 0 parado, 1 a toda velocidad
  const uPostI = { value: 0 } // la intensidad que llega al piso y al postproceso, menor en las tomas generales
  const uClear = { value: 0 } // 1 en las tomas donde lo importante es leer a los caballos
  const signMaterials = []
  const mountainDay = new THREE.Color(0x8fb7d8), mountainHell = new THREE.Color(0x0b0407)
  const mountainMaterial = new THREE.MeshBasicMaterial({ color: mountainDay.clone() })

  const fogDay = new THREE.Color(0xbfe9ff)
  const fogHell = new THREE.Color(0x060208)
  scene.fog = new THREE.Fog(fogDay.clone(), 90, 340)

  const hemiDay = new THREE.Color(0xffffff), hemiHell = new THREE.Color(0xff9a55)
  const groundDay = new THREE.Color(0xa8c98a), groundHell = new THREE.Color(0x4a1020)
  const sunDay = new THREE.Color(0xfff0d0), sunHell = new THREE.Color(0xffc488)
  const hemi = new THREE.HemisphereLight(0xffffff, 0xa8c98a, 1.55)
  const sun = new THREE.DirectionalLight(0xfff0d0, 2.5)
  sun.position.set(-30, 60, 45)
  scene.add(hemi, sun)

  buildSky()
  buildGround()
  const scenery = buildRailsAndScenery()
  // Tribunas donde importan: donde frena y festeja el ganador, en la meta y justo antes.
  const grandstands = [0, 1, 2]
    .map(i => FINISH + 170 - i * 184)
    .filter(x => x > -40)
    .map(buildGrandstand)
  buildGates()

  // Todos se arman al cargar (así sus shaders se compilan juntos); los que no corren quedan ocultos. Con el modelo hay
  // uno por elemento: cada caballo tiene siempre el suyo, y al entrar toma el de su elemento y el próximo carril.
  const POOL = horseModel ? Math.max(N, 12) : N
  const pool = Array.from({ length: POOL }, (_, i) => {
    const h = horseModel ? buildProHorse(horseModel, i) : buildHorse(i)
    h.x = 0
    h.v = 0
    h.z = (i - (N - 1) / 2) * LANE
    h.history = []
    h.rank = i
    h.active = false
    h.root.position.set(0, 0, h.z)
    scene.add(h.root)
    return h
  })
  // Antes de largar, en la sala, cada caballo se ve como su chibi (un cartel que mira a cámara). Al largar explota,
  // uno tras otro, con un destello de su color, y aparece en llamas.
  const texturas = new THREE.TextureLoader()
  const destello = (() => {
    const c = document.createElement("canvas"); c.width = c.height = 128
    const g = c.getContext("2d"), grad = g.createRadialGradient(64, 64, 0, 64, 64, 64)
    grad.addColorStop(0, "rgba(255,255,255,1)"); grad.addColorStop(0.35, "rgba(255,255,255,.85)"); grad.addColorStop(1, "rgba(255,255,255,0)")
    g.fillStyle = grad; g.fillRect(0, 0, 128, 128)
    const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t
  })()
  const EXPLOSION = { cascada: 0.16, dura: 0.6 }
  function chibiDe(h) {
    if (!h.element || h.chibi) return h.chibi
    const s = new THREE.Sprite(new THREE.SpriteMaterial({ transparent: true, depthWrite: false }))
    texturas.load(`/images/chibis/${h.element}.webp`, t => {
      t.colorSpace = THREE.SRGBColorSpace
      s.material.map = t; s.material.needsUpdate = true
      s.scale.set(2.6 * t.image.width / t.image.height, 2.6, 1)
    })
    s.scale.set(2.6, 2.6, 1); s.position.set(0, 1.35, 0)
    h.root.add(s); h.chibi = s
    return s
  }
  function verChibi(h, chibi) {
    const s = chibiDe(h)
    if (!s) return
    h.root.children.forEach(c => { if (c !== s && !c.userData.sombra && c !== h.boom) c.visible = !chibi })
    s.visible = chibi
  }
  function explotar(h) {
    verChibi(h, false)
    const m = new THREE.SpriteMaterial({ map: destello, color: h.silk, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending })
    h.boom = new THREE.Sprite(m); h.boom.position.set(0, 1.4, 0); h.boom.userData.desde = state.clock
    h.root.add(h.boom)
  }
  // Preludio: los 3 favoritos se presentan uno tras otro, cada uno unos 2,3 s, a partir de los 2,2 s.
  const FAVORITOS = { desde: 2.2, cada: 2.6, dura: 2.3 }
  function presentarFavoritos() {
    const t = state.clock - state.preludeStart
    if (state.started || !state.favoritos || !(t >= 0)) return hud.favorito(null)
    const i = Math.floor((t - FAVORITOS.desde) / FAVORITOS.cada)
    const dentro = (t - FAVORITOS.desde) - i * FAVORITOS.cada < FAVORITOS.dura
    const h = i >= 0 && dentro ? horses.find(x => x.id === state.favoritos[i]) : null
    hud.favorito(h || null, i + 1)
  }

  function actualizarExplosiones() {
    if (state.countdownEnd === null) return
    horses.forEach((h, i) => {
      if (h.chibi?.visible && state.clock >= state.explotaDesde + i * EXPLOSION.cascada) explotar(h)
      if (!h.boom) return
      const u = (state.clock - h.boom.userData.desde) / EXPLOSION.dura
      if (u >= 1) { h.root.remove(h.boom); h.boom.material.dispose(); h.boom = null; return }
      const k = 1 - Math.pow(1 - u, 3)
      h.boom.scale.setScalar(0.5 + 7 * k)
      h.boom.material.opacity = 1 - u
    })
  }
  const horses = []
  let mine = null
  // Todos arden; la cámara de la transformación va con el tuyo.
  let fireHorse = null
  const pickFireHorse = () => { fireHorse = mine?.setFire ? mine : horses.find(h => h.setFire) || null }
  function join(p) {
    if (horses.some(h => h.id === p.id)) return
    const h = pool.find(h => !h.active && p.element && h.element === p.element) || pool.find(h => !h.active)
    if (!h) return
    const lane = horses.length
    h.z = (lane - (N - 1) / 2) * LANE
    h.rank = lane
    h.root.position.z = h.z
    Object.assign(h, { id: p.id, name: p.name, username: p.username, active: true })
    if (state.countdownEnd === null) verChibi(h, true)
    h.root.visible = true
    horses.push(h)
    if (h.id === myId) mine = h
    pickFireHorse()
    hud.activate(h)
  }
  function setMine(id) {
    myId = id
    mine = horses.find(h => h.id === id) || null
    pickFireHorse()
    hud.markMine()
  }
  // Tomas que se turnan durante la carrera: una general, una de cerca, y así.
  const SHOTS = ["peloton", "heroe", "tele", "peloton", "arco", "peloton", "cola"]

  const dust = buildDust()
  const confetti = buildConfetti()
  const post = buildPost()
  const hud = buildHud()

  const state = {
    clock: 0, rt: 0, timeScale: 1, intensity: 0, impact: 0, portal: 0,
    countdownEnd: null, preludeStart: Infinity, started: false, winner: null, crossedAt: null, lastTick: null,
    tape: [], resume: null, crossRt: 0, impactStage: null,
    leaderX: 0, leaderOffset: 0, lastLeader: null, raceStart: null, celebrating: false, doneFired: false, shot: null, shotChanged: 0,
    order: horses, clarity: 0, span: 0, gapSecond: 0, gapThird: 0, arrival: null
  }
  // Los que ya estaban en la sala entran después de armar el estado (join mira si la carrera largó).
  participants.forEach(join)

  // ── Datos ─────────────────────────────────────────────────────────────────────────
  // Si la página abre tarde, el preludio ya va avanzado y se entra directo al inframundo.
  function startIn(seconds) {
    // Larga ahora: explotan. Si la página abre con la carrera ya avanzada, aparecen en llamas sin explotar.
    state.explotaDesde = state.clock + 0.55
    if (seconds < PRELUDE_SECONDS - 1.5) horses.forEach(h => verChibi(h, false))
    state.countdownEnd = state.clock + seconds
    state.preludeStart = state.countdownEnd - PRELUDE_SECONDS
  }

  // La largada suena una vez: con el cartel "¡YA!" o, si la carrera arranca antes de mostrarlo, con el primer avance.
  function ya() {
    if (state.yaFired) return
    state.yaFired = true
    onCount?.("¡YA!")
  }

  function tick(list) {
    if (!state.started) { state.raceStart = state.clock; ya() }
    state.started = true
    state.lastTick = state.rt
    list.forEach(({ id, position }) => {
      const h = horses.find(x => x.id === id)
      if (!h) return
      const meters = (position / 100) * FINISH
      if (!h.history.length) {
        // Si la página se abrió con la carrera en marcha, aparece donde va: no corre de golpe desde la salida.
        const lateJoin = meters > 15
        if (lateJoin) h.x = meters
        h.history.push({ t: state.rt - 0.3, x: lateJoin ? meters : 0 })
      }
      const previous = h.history[h.history.length - 1]
      if (meters >= FINISH && h.lastV > 0) {
        // El servidor corta la posición en la meta: se calcula cuándo llega en realidad, sin que frene antes de cruzarla.
        h.history.push({ t: Math.min(state.rt, previous.t + (FINISH - previous.x) / h.lastV), x: FINISH })
      } else {
        if (state.rt > previous.t) h.lastV = (meters - previous.x) / (state.rt - previous.t)
        h.history.push({ t: state.rt, x: meters })
      }
    })
  }

  function finish(winner) {
    state.winner = horses.find(h => h.id === winner.id) || null
    if (!state.winner) return
    const lastEntry = h => h.history[h.history.length - 1]
    const arrival = h => lastEntry(h)?.t ?? Infinity
    const order = [...horses].sort((a, b) => (b === state.winner) - (a === state.winner) || last(b) - last(a) || arrival(a) - arrival(b))
    order.forEach((h, i) => { h.finalRank = i + 1 })
    // Varios pueden llegar en el mismo mensaje: a la vista, nadie cruza antes que el ganador anunciado.
    const winnerAt = arrival(state.winner)
    order.slice(1).forEach(h => {
      const entry = lastEntry(h)
      if (entry && entry.x >= FINISH && entry.t <= winnerAt) entry.t = winnerAt + 0.03 * (h.finalRank - 1)
    })
  }

  const last = h => (h.history.length ? h.history[h.history.length - 1].x : 0)

  function sample(h, t) {
    const list = h.history
    if (!list.length) return 0
    if (t <= list[0].t) return list[0].x
    for (let i = list.length - 1; i >= 0; i--) {
      if (list[i].t <= t) {
        const a = list[i], b = list[i + 1]
        // Sin datos nuevos sigue a su velocidad: al terminar la carrera, siempre; si solo se demora un mensaje, poco.
        // Reconectando: siguen corriendo a su velocidad hasta 8 s, sin cruzar la meta (eso lo dice el servidor).
        if (!b) {
          if (state.winner) return a.x + (h.lastV || 0) * (t - a.t)
          const x = a.x + (h.lastV || 0) * Math.min(t - a.t, state.reconectando ? 8 : 0.5)
          return state.reconectando ? Math.min(x, FINISH - 4) : x
        }
        return a.x + (b.x - a.x) * ((t - a.t) / (b.t - a.t))
      }
    }
    return list[0].x
  }

  // ── Bucle ─────────────────────────────────────────────────────────────────────────
  function step(realDt) {
    state.clock += realDt
    uT.value = state.clock
    const crossedFor = state.crossedAt === null ? -1 : state.clock - state.crossedAt

    const stage = finishStage(crossedFor)
    const replaying = stage === "replay-bajo" || stage === "replay-perfil"
    if (stage === "paneo") state.timeScale = PAN_RATE
    else if (replaying) state.timeScale = 0
    else if (stage === "festejo") state.timeScale = damp(state.timeScale, 1, 4, realDt)
    const dt = realDt * state.timeScale
    state.rt += dt

    const racing = state.crossedAt === null
    if (replaying) {
      // Se vuelve a ver el cruce con lo grabado. Al terminar, cada caballo retoma donde quedó.
      state.resume ??= horses.map(h => h.x)
      const stageT = crossedFor - PAN_SECONDS - (stage === "replay-perfil" ? REPLAY_SECONDS : 0)
      const cursor = state.crossRt - REPLAY_BEFORE + stageT * REPLAY_RATE
      const frame = state.tape.find(f => f.t >= cursor) ?? state.tape[state.tape.length - 1]
      horses.forEach((h, i) => { h.x = frame.x[i]; h.v = frame.v[i] })
      if (cursor >= state.crossRt && state.impactStage !== stage) {
        state.impactStage = stage
        state.impact = 1
      }
    } else {
      if (state.resume) {
        horses.forEach((h, i) => { h.x = state.resume[i] })
        state.resume = null
      }
      horses.forEach(h => {
        const before = h.x
        if (racing) {
          h.x = damp(h.x, sample(h, state.rt - RENDER_DELAY), 11, dt)
        } else {
          // Pasada la meta, frenan de a poco desde la velocidad que traían.
          // El ganador frena más suave: termina adelante y solo, con espacio para festejar.
        const brake = CRUISE_BRAKE * (h === state.winner ? 0.75 : 1.2)
        h.coast = Math.max(0, (h.coast ?? h.v) - brake * dt)
          h.x += h.coast * dt
        }
        if (dt > 0) h.v = damp(h.v, (h.x - before) / dt, 7, dt)
      })
      if (stage !== "festejo") {
        state.tape.push({ t: state.rt, x: horses.map(h => h.x), v: horses.map(h => h.v) })
        while (state.tape.length && state.tape[0].t < state.rt - 2.5) state.tape.shift()
      }
    }

    if (!horses.length) {
      // Sala vacía: todavía no hay a quién seguir; se ve la largada.
      waitingFrame(realDt)
      return
    }
    const leader = horses.reduce((best, h) => (h.x > best.x ? h : best), horses[0])
    // La cámara sigue al puntero sin retraso: a esta velocidad, cualquier demora deja a los caballos atrás de ella.
    // Solo se suaviza el salto cuando cambia quién va primero.
    if (state.lastLeader && leader !== state.lastLeader) state.leaderOffset = state.leaderX - leader.x
    state.lastLeader = leader
    state.leaderOffset = damp(state.leaderOffset, 0, 4, dt)
    state.leaderX = leader.x + state.leaderOffset
    state.leader = leader
    state.order = [...horses].sort((a, b) => b.x - a.x)
    uSpeed.value = !stage ? Math.min(1, Math.abs(leader.v) / TOP_SPEED) : 0
    if (racing && state.started && state.arrival === null && FINISH - leader.x < Math.max(30, Math.abs(leader.v) * ARRIVAL_SECONDS)) {
      state.arrival = { from: leader.x }
    }

    // Arden desde el principio. Al largar la llama se aviva, en cascada: primero el tuyo, después carril por carril.
    // Sube rápido y se apaga despacio.
    const fireSince = state.countdownEnd === null ? -1 : state.clock - state.countdownEnd - FIRE_DELAY
    const fireLane = horses.indexOf(fireHorse)
    horses.forEach((h, i) => {
      const x = (fireSince - Math.abs(i - fireLane) * FIRE_CASCADE) / FIRE_SECONDS
      h.setFire?.(x > 0 && x < 1 ? Math.sin(Math.PI * Math.sqrt(x)) : 0)
    })

    if (state.winner && racing && state.winner.x >= FINISH - 0.4) {
      state.crossedAt = state.clock
      if (!state.crossFired) { state.crossFired = true; onCross?.(state.winner) }
      state.crossRt = state.rt
      state.impact = 1
    }

    // Intensidad: sube con la distancia del puntero, se sostiene en el final y se corta de golpe en el festejo.
    let goal = smooth(STRETCH_FROM, STRETCH_FULL, leader.x)
    if (stage) goal = stage === "festejo" ? 0 : 0.85
    state.intensity = damp(state.intensity, goal, stage === "festejo" ? 14 : 5, realDt)
    state.impact = Math.max(0, state.impact - realDt / 0.22)
    uI.value = state.intensity

    if (crossedFor > CELEBRATE_AFTER && !state.celebrating) {
      state.celebrating = true
      confetti.start(state.winner)
      hud.showWin(state.winner)
      onCelebrate?.(state.winner)
    }
    if (crossedFor > CELEBRATE_AFTER + 6 && !state.doneFired) {
      state.doneFired = true
      onDone?.()
    }

    // En la sala, sin largada a la vista, el preludio no empezó: un número finito (con -Infinity el piso da NaN y se ve negro).
    const preludeT = state.countdownEnd === null ? -1000 : state.clock - state.preludeStart
    const entering = smooth(WORLD_FROM, WORLD_FROM + WORLD_SECONDS, preludeT)
    uWorld.value = state.started ? 1 : entering
    uWave.value = state.started ? 1e6 : ((preludeT - WORLD_FROM) / WORLD_SECONDS) * (FINISH + 450)
    state.portal = state.started ? 0 : Math.sin(Math.PI * entering)

    const motion = replaying ? realDt * REPLAY_RATE : dt
    animateHorses(realDt, motion)
    dust.update(motion)
    confetti.update(realDt)
    actualizarExplosiones()
    presentarFavoritos()
    placeCamera(realDt)
    updateLighting()
    hud.update()
    render(realDt)
  }

  function animateHorses(realDt, dt) {
    horses.forEach(h => {
      const metersPerSecond = Math.abs(h.v)
      const speed = Math.min(1.1, metersPerSecond / 11)
      // Las patas tienen tope: a 400 km/h, a ritmo real serían un parpadeo.
      h.stride += Math.min(metersPerSecond, 32) * dt * 0.62
      h.animate(dt, h.stride, speed, uIDrama(), metersPerSecond)
      h.root.position.x = h.x

      // El ganador da tres saltos que se apagan, y queda quieto. Parados, todos respiran.
      if (h === state.winner && state.celebrating && metersPerSecond < 3) {
        h.hop = (h.hop || 0) + realDt * 6.5
        const left = Math.max(0, 1 - h.hop / (Math.PI * 3))
        h.root.position.y = Math.abs(Math.sin(h.hop)) * 0.8 * left
      } else {
        h.root.position.y = 0
      }
      const calm = 1 - Math.min(1, metersPerSecond / 2)
      h.root.scale.y = 1 + Math.sin(state.clock * 2.6 + h.z) * 0.014 * calm
      h.root.rotation.x = Math.sin(state.clock * 1.3 + h.z) * 0.006 * calm

      if (speed > 0.4) {
        h.dustIn = (h.dustIn ?? 0) - dt
        if (h.dustIn < 0) {
          h.dustIn = 0.035
          dust.emit(h.x - 0.8 + Math.random() * 1.4, h.z + (Math.random() - 0.5) * 0.7, speed)
        }
      }
    })
  }

  const uIDrama = () => state.intensity

  function updateLighting() {
    const i = uI.value
    const w = uWorld.value
    const c = state.clarity
    uPostI.value = i * (1 - 0.75 * c)
    mountainMaterial.color.copy(mountainDay).lerp(mountainHell, w)
    scene.fog.color.copy(fogDay).lerp(fogHell, w)
    // En las tomas generales la niebla se aleja: si no, se come a los últimos caballos.
    scene.fog.near = 90 - 66 * w - 8 * i + 130 * c
    scene.fog.far = 340 - 215 * w - 60 * i + 560 * c
    hemi.intensity = 1.55 - 1.2 * w
    hemi.color.copy(hemiDay).lerp(hemiHell, w)
    hemi.groundColor.copy(groundDay).lerp(groundHell, w)
    sun.intensity = 2.5 - 1.35 * w
    sun.color.copy(sunDay).lerp(sunHell, w)
    // Borde dorado en el inframundo; en la recta final se enciende hacia el rojo y el violeta.
    shared.uRimColor.value.setRGB(0.12 + 0.85 * w + 0.5 * i, 0.08 + 0.34 * w - 0.1 * i, 0.08 + 0.04 * w + 0.8 * i)
    grandstands.forEach(stand => { stand.visible = i < 0.94 || c > 0.5 })
    signMaterials.forEach(material => material.color.setScalar(1 - 0.62 * w))
    shared.uHorseRim.value = 0.45 + 1.1 * w + 0.5 * i
  }

  // ── Cámara: cortes secos por tramo, como un resumen de carrera anime ──────────────
  function waitingFrame(realDt) {
    const t = state.clock
    camera.position.set(7.5 + Math.sin(t * 0.07) * 1.6, 2.2, WIDTH / 2 + 2.6)
    camera.lookAt(-0.6, 1.25, -WIDTH * 0.08)
    camera.fov = 48
    camera.updateProjectionMatrix()
    state.shot = "sala"
    updateLighting()
    hud.update()
    render(realDt)
  }

  function placeCamera(dt) {
    const L = state.leaderX
    const leader = state.leader
    const n = horses.length
    const mean = horses.reduce((s, h) => s + h.x, 0) / n
    const f = (L + mean) / 2
    const crossedFor = state.crossedAt === null ? -1 : state.clock - state.crossedAt
    const z = leader.z
    const i = state.intensity
    // Cuánto hay que encuadrar: de primero a último, y de primero a segundo y tercero para la pelea por llegar.
    state.span = damp(state.span, L - state.order[n - 1].x, 3, dt)
    state.gapSecond = damp(state.gapSecond, L - state.order[Math.min(1, n - 1)].x, 4, dt)
    state.gapThird = damp(state.gapThird, L - state.order[Math.min(2, n - 1)].x, 3, dt)

    // Transformación: por delante y del lado de afuera, sin otros caballos en medio, mientras la luz lo recorre.
    const fireShot = () => {
      const h = fireHorse
      const u = smooth(-0.8, FIRE_DELAY + FIRE_SECONDS, state.clock - state.countdownEnd)
      const side = h.z < 0 ? -1 : 1
      return {
        pos: [h.x + 6.6 - 2.6 * u, 0.95 + 0.55 * u, h.z + side * (1.5 + 0.8 * u)],
        look: [h.x - 0.3 * u, 1.55, h.z],
        fov: 38 + 12 * u
      }
    }

    let shot, pos, look, fov
    let roll = 0
    const stage = finishStage(crossedFor)
    if (stage === "festejo") {
      const w = state.winner
      // Bajo y por delante del ganador: los demás vienen de atrás y no cruzan la cámara.
      const a = 1.1 - (crossedFor - CELEBRATE_AFTER) * 0.06
      shot = "festejo"
      pos = [w.x + Math.sin(a) * 9, 1, w.z + Math.cos(a) * 9]
      look = [w.x + 0.4, 3, w.z] // el caballo queda abajo del cuadro: el cartel del ganador va arriba
      fov = 36
      roll = -0.05
    } else if (stage === "paneo") {
      // Paneo total: la cámara barre media vuelta alrededor de la meta mientras pasa todo el grupo.
      // Arranca mirando al ganador, para que lo primero que se vea después de cruzar sea él.
      const u = crossedFor / PAN_SECONDS
      const a = Math.PI * (0.88 - 0.76 * u)
      const w = state.winner
      const onWinner = 1 - smooth(0.35, 0.8, u)
      shot = "final-paneo"
      pos = [FINISH + Math.cos(a) * 22, 4.5 - 3.2 * u, Math.sin(a) * 22]
      look = [FINISH + 8 * u + (w.x - FINISH - 8 * u) * onWinner, 1.6, w.z * onWinner]
      fov = 52
      roll = (0.5 - u) * 0.18
    } else if (stage === "replay-bajo") {
      // Primera repetición: a ras del piso, pasando la meta, con el ganador viniendo encima.
      const u = (crossedFor - PAN_SECONDS) / REPLAY_SECONDS
      const w = state.winner
      shot = "final-bajo"
      pos = [FINISH + 12, 0.2, w.z + 2.2]
      look = [w.x + 1, 1.9, w.z]
      fov = 28
      roll = -0.18 + 0.12 * u
    } else if (stage === "replay-perfil") {
      // Segunda repetición: la cámara gira alrededor del ganador mientras cruza y se aleja subiendo, como en F-Zero X:
      // arranca cerca, de atrás y al costado, y termina lejos y en alto, con la meta y el resto de la pista en cuadro.
      const u = (crossedFor - PAN_SECONDS - REPLAY_SECONDS) / REPLAY_SECONDS
      const s = smooth(0, 1, u)
      const w = state.winner
      const a = Math.PI * (1.15 - 0.85 * s)
      const r = 6 + 16 * s
      shot = "final-giro"
      pos = [w.x + Math.cos(a) * r, 2 + 8 * s, w.z + Math.sin(a) * r]
      look = [w.x + 1 + 3 * s, 1.4, w.z]
      fov = 40 + 12 * s
      roll = 0.04 - 0.08 * u
    } else if (state.countdownEnd === null && !state.started) {
      // En la sala: la cámara pasea despacio frente a la largada mientras los caballos esperan, descansando.
      const t = state.clock
      shot = "sala"
      pos = [7.5 + Math.sin(t * 0.07) * 1.6, 2.2 + Math.sin(t * 0.11) * 0.25, WIDTH / 2 + 2.6]
      look = [-0.6, 1.25, -WIDTH * 0.08]
      fov = 48
    } else if (!state.started || L < 1) {
      // Preludio: del aire a la cara de los caballos, y recién después el 3, 2, 1.
      const t = state.clock - state.preludeStart
      const span = (from, to) => Math.min(1, Math.max(0, (t - from) / (to - from)))
      if (t < 3.6) {
        const u = span(0, 3.6)
        shot = "preludio-aire"
        pos = [80 - 66 * u, 27 - 14 * u, WIDTH * 0.95]
        look = [36 - 34 * u, 0.5, 0]
        fov = 54
      } else if (t < 6.4) {
        const zp = -WIDTH / 2 + WIDTH * span(3.6, 6.4)
        shot = "preludio-paneo"
        pos = [7.5, 1.9, zp + 1.4]
        look = [0.4, 1.8, zp]
        fov = 42
      } else if (t < 8) {
        const h = mine || horses[0]
        shot = "preludio-cara"
        pos = [h.x + 4.4 + span(6.4, 8) * 0.5, 1.2, h.z + 1.6]
        look = [h.x + 1.8, 1.95, h.z]
        fov = 30
        roll = 0.12
      } else if (t < 9) {
        const h = horses[Math.floor(horses.length / 2)] || horses[0]
        shot = "preludio-cara"
        pos = [h.x + 4.4, 1, h.z - 1.8]
        look = [h.x + 1.8, 1.95, h.z]
        fov = 28
        roll = -0.14
      } else if (t < 10) {
        shot = "preludio-baja"
        pos = [9 - span(9, 10) * 0.8, 0.32, 1.2]
        look = [0, 1.8, 0]
        fov = 48
      } else if (t < PRELUDE_SECONDS - 0.8 || !fireHorse) {
        shot = "salida"
        pos = [11 - state.clock * 0.02, 2.1, WIDTH / 2 + 4.5]
        look = [0, 1.7, 0]
        fov = 42
      } else {
        shot = "transformacion"
        ;({ pos, look, fov } = fireShot())
      }
    } else if (state.clock - state.raceStart < OPENING_SECONDS) {
      if (fireHorse) {
        shot = "transformacion"
        ;({ pos, look, fov } = fireShot())
      } else {
        // Largada: desde atrás, casi en el suelo, viéndolos alejarse entre el polvo.
        shot = "general"
        pos = [f - 11, 0.45, WIDTH * 0.3]
        look = [f + 10, 2.8, 0]
        fov = 60
        roll = 0.08
      }
    } else if (state.arrival) {
      // Llegada: de atrás y hacia el centro de la pista, a tres cuartos: se ve el cuerpo del puntero, y adelante el arco de la meta.
      // Si el perseguidor viene cerca, la cámara retrocede lo justo para tenerlo en cuadro.
      const back = clamp(state.gapSecond * 0.6 + 6.5, 7, 15)
      const inward = z > 0 ? -1 : 1
      shot = "llegada"
      pos = [L - back, 2.3 + back * 0.13, z + inward * (2.6 + back * 0.28)]
      look = [L + 14, 1.8, z + inward * 0.6]
      fov = 46
    } else if (L >= STRETCH_FROM) {
      // Recta final: por delante y en alto, con el puntero bien grande y los que lo persiguen detrás.
      const back = clamp(state.gapThird * 0.45 + 9, 10, 26)
      shot = "recta"
      pos = [L + back * 0.72, 2.2 + back * 0.24, WIDTH / 2 + 1.5 + back * 0.34]
      look = [L - state.gapThird * 0.3, 1.1, z * 0.35]
      fov = 44
    } else {
      const elapsed = (state.clock - state.raceStart - OPENING_SECONDS) / SHOT_SECONDS
      const u = elapsed - Math.floor(elapsed)
      shot = SHOTS[Math.floor(elapsed) % SHOTS.length]
      if (shot === "peloton") {
        // Todos en cuadro: por delante del puntero y en alto, mirando hacia atrás. Adelante se ven grandes y el resto se aleja.
        pos = [L + 13 + state.span * 0.06, 6.5 + state.span * 0.1, WIDTH / 2 + 4 + state.span * 0.12]
        look = [L - state.span * 0.28, 0.6, 0]
        fov = 46
      } else if (shot === "heroe") {
        // Desde el piso, por delante, con el caballo de fuego creciendo sobre la cámara.
        const h = fireHorse || leader
        const side = h.z < 0 ? -1 : 1
        pos = [h.x + 9 - 1.8 * u, 0.22, h.z + side * (2.4 - 1.8 * u)]
        look = [h.x + 0.6, 1.8, h.z]
        fov = 30 - 6 * u
        roll = -0.14 + 0.1 * u
      } else if (shot === "arco") {
        // Media vuelta por delante del puntero, inclinándose con el giro.
        const a = 1.2 - 2.4 * u
        pos = [L + Math.cos(a) * 9.5, 1 + 1.9 * Math.abs(Math.sin(a)), z + Math.sin(a) * 9.5]
        look = [L + 0.4, 1.7, z]
        fov = 40
        roll = Math.sin(a) * 0.2
      } else if (shot === "tele") {
        // De perfil con lente larga: el caballo llena el cuadro y el fondo pasa barrido.
        pos = [L - 0.5 + 1.5 * u, 3.6, WIDTH / 2 + 16]
        look = [L, 1.25, z]
        fov = 15
        roll = 0.07
      } else {
        // Detrás de tu caballo y a ras del piso, viendo lo que tiene adelante.
        const h = mine || leader
        pos = [h.x - 6.5, 0.7, h.z - 1.15]
        look = [h.x + 8, 2, h.z + 0.3]
        fov = 60
        roll = -0.1 + 0.2 * u
      }
    }

    // Cada toma es un corte: lo que le pertenece cambia de golpe junto con ella.
    const wide = WIDE_SHOTS.has(shot)
    state.clarity = wide || shot === "transformacion" ? 1 : 0
    uClear.value = state.clarity
    uSpeed.value *= 1 - 0.85 * state.clarity
    scenery.trees.visible = !wide
    // Las cámaras pegadas al caballo de fuego van entre él y la baranda: de ese lado, la baranda taparía la imagen.
    const hugging = fireHorse && (shot === "transformacion" || shot === "heroe")
    scenery.rails.forEach(rail => { rail.visible = !(hugging && rail.userData.side === Math.sign(fireHorse.z)) })
    // Vibración de cámara en mano, más fuerte al final. Las tomas generales van firmes.
    const shake = (0.005 + 0.05 * i) * (1 - state.clarity)
    const t = state.clock
    camera.position.set(
      pos[0] + Math.sin(t * 23) * shake,
      pos[1] + Math.sin(t * 31 + 1) * shake,
      pos[2] + Math.cos(t * 19) * shake
    )
    camera.lookAt(look[0], look[1], look[2])
    camera.rotateZ(roll)
    if (shot !== state.shot) { state.shot = shot; state.shotChanged = t }
    camera.fov = fov * (1 + 0.22 * uSpeed.value) // proporcional: las lentes largas siguen siendo largas
    camera.updateProjectionMatrix()
    return dt
  }

  // ── Mundo ─────────────────────────────────────────────────────────────────────────
  function buildSky() {
    const material = new THREE.ShaderMaterial({
      side: THREE.BackSide, depthWrite: false, fog: false,
      uniforms: { uI: uPostI, uT, uWorld, uClear },
      vertexShader: "varying vec3 vDir; void main(){ vDir = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }",
      fragmentShader: `
        varying vec3 vDir; uniform float uI, uT, uWorld, uClear;
        ${NOISE}
        vec3 prism(float t) { return 0.5 + 0.5 * cos(6.28318 * (t + vec3(0.0, 0.33, 0.67))); }
        void main() {
          vec3 d = normalize(vDir);
          float h = max(d.y, 0.0);
          vec3 day = mix(vec3(0.72, 0.9, 1.0), vec3(0.16, 0.5, 0.95), pow(h, 0.55));
          vec2 cp = d.xz / max(d.y + 0.14, 0.02);
          float clouds = smoothstep(0.52, 0.68, fbm(cp * 0.55 + vec2(uT * 0.012, 0.0)));
          float edge = smoothstep(0.62, 0.74, fbm(cp * 0.55 + vec2(uT * 0.012, 0.0) + 0.05));
          day = mix(day, mix(vec3(0.78, 0.82, 0.95), vec3(1.0), edge), clouds * smoothstep(0.0, 0.14, d.y));
          float sun = max(dot(d, normalize(vec3(-0.5, 0.62, 0.6))), 0.0);
          day += vec3(1.0, 0.85, 0.55) * (pow(sun, 260.0) * 1.8 + pow(sun, 7.0) * 0.14);
          if (d.y < 0.0) day = vec3(0.74, 0.92, 1.0);

          // Inframundo: negro con nubes de cobre y estrellas.
          float az = atan(d.z, d.x);
          vec3 hell = vec3(0.004, 0.001, 0.006);
          float nebula = fbm(vec2(az * 1.6, d.y * 3.0) + vec2(uT * 0.015, 0.0));
          hell += vec3(0.34, 0.075, 0.02) * pow(nebula, 3.2) * 0.75;
          hell += vec3(0.5, 0.02, 0.05) * pow(fbm(vec2(az * 3.1, d.y * 6.0) - uT * 0.02), 5.0) * 1.0;
          vec3 cell = floor(d * 170.0);
          float star = step(0.9965, hash(cell.xy + cell.z * 17.0));
          hell += vec3(1.0, 0.85, 0.7) * star * smoothstep(-0.02, 0.2, d.y);

          // La grieta: un desgarro de arcoíris con el centro blanco, que cruza el cielo.
          float open = smoothstep(0.0, 0.5, uWorld);
          float s = dot(d, normalize(vec3(-0.34, 0.42, 0.84)));
          float wobble = (fbm(vec2(az * 4.0, uT * 0.12)) - 0.5) * 0.15;
          float x = (s + wobble) / max(0.002, 0.035 + 0.05 * open + 0.03 * uI);
          vec3 rift = prism(x * 0.42 + 0.5 - uT * 0.03) * exp(-x * x * 0.55) * 2.6;
          rift += vec3(1.0, 0.97, 0.9) * exp(-x * x * 9.0) * 3.2;

          // Boca dorada en el horizonte, hacia donde corre la carrera.
          vec3 ahead = normalize(vec3(1.0, 0.14, 0.0));
          float toward = max(dot(d, ahead), 0.0);
          float angle = atan(d.y - ahead.y, d.z);
          float rays = pow(abs(sin(angle * 15.0 + fbm(vec2(angle * 3.0, uT * 0.2)) * 5.0)), 10.0);
          // En las tomas generales se apaga bastante: es de lo más brillante de la imagen y le saca la vista a los caballos.
          hell += vec3(1.0, 0.56, 0.14) * (pow(toward, 60.0) * 2.4 + rays * pow(toward, 9.0) * 0.8) * (1.0 - 0.8 * uClear);

          // Recta final: anillos de oro y prisma que vienen hacia la cámara.
          float r = acos(clamp(dot(d, ahead), -1.0, 1.0));
          float fold = abs(mod(angle + uT * 0.16, 0.5236) - 0.2618);
          float n = fbm(vec2(cos(fold), sin(fold)) * r * 3.4 + vec2(-uT * 0.9, 0.0));
          float rings = smoothstep(0.35, 0.95, sin(r * 26.0 - uT * 5.5 + n * 7.0));
          vec3 trip = mix(vec3(1.0, 0.5, 0.12), prism(r * 0.7 + n - uT * 0.12), smoothstep(0.42, 0.72, n)) * rings;
          trip *= smoothstep(0.08, 0.7, r) * 1.15;

          vec3 under = hell + rift * open * (1.0 - 0.72 * uClear) + trip * uI;
          gl_FragColor = vec4(mix(day, under, uWorld), 1.0);
        }`
    })
    const dome = new THREE.Mesh(new THREE.SphereGeometry(700, 48, 32), material)
    dome.renderOrder = -1
    // Siempre se dibuja: si la cámara salta lejos (entrar a mitad de carrera), si no quedaría sin cielo para siempre.
    dome.frustumCulled = false
    dome.onBeforeRender = () => dome.position.copy(camera.position)
    scene.add(dome)
  }

  function buildGround() {
    const material = new THREE.ShaderMaterial({
      uniforms: {
        uI: uPostI, uT, uWorld, uWave, uClear,
        uW: { value: WIDTH / 2 },
        uLane: { value: LANE },
        uN: { value: N },
        uFog: { value: scene.fog.color },
        uFogRange: { value: new THREE.Vector2() }
      },
      vertexShader: "varying vec3 vW; void main(){ vec4 w = modelMatrix * vec4(position, 1.0); vW = w.xyz; gl_Position = projectionMatrix * viewMatrix * w; }",
      fragmentShader: `
        varying vec3 vW; uniform float uI, uT, uW, uLane, uN, uWorld, uWave, uClear; uniform vec3 uFog; uniform vec2 uFogRange;
        ${NOISE}
        vec3 prism(float t) { return 0.5 + 0.5 * cos(6.28318 * (t + vec3(0.0, 0.33, 0.67))); }
        float line(float v, float w) { return 1.0 - smoothstep(0.0, w, abs(v)); }
        void main() {
          vec2 p = vW.xz;
          float n = fbm(p * 0.35), fine = fbm(p * 3.2);
          // Pasto cortado a franjas.
          float stripe = step(0.5, fract(floor((p.y + 400.0) / 7.0) * 0.5 + floor((p.x + 400.0) / 14.0) * 0.5));
          vec3 grass = mix(vec3(0.20, 0.55, 0.13), vec3(0.28, 0.66, 0.17), stripe);
          grass *= 0.86 + 0.28 * n;
          // Arena con surcos a lo largo de la pista.
          float furrow = sin(p.y * 14.0 + fbm(p * vec2(0.08, 1.6)) * 6.0) * 0.5 + 0.5;
          vec3 dirt = mix(vec3(0.60, 0.33, 0.14), vec3(0.72, 0.43, 0.20), furrow * 0.5 + fine * 0.5);
          float edge = smoothstep(uW + 0.2, uW - 0.25, abs(p.y));
          vec3 calm = mix(grass, dirt, edge);
          float lanes = 0.0;
          float lz = (p.y + uN * uLane * 0.5) / uLane;
          lanes = line(fract(lz + 0.5) - 0.5, 0.025) * edge;
          calm = mix(calm, vec3(0.93, 0.76, 0.5), lanes * 0.42);
          float marks = line(fract(p.x / 10.0 + 0.5) - 0.5, 0.012);
          calm = mix(calm, vec3(0.42, 0.21, 0.08), marks * edge * 0.5);

          // Inframundo: piso casi negro con vetas de oro; la pista como bronce oscuro con surcos.
          float ridge = 1.0 - abs(2.0 * fbm(p * 0.42 + 4.0) - 1.0);
          float fine2 = 1.0 - abs(2.0 * fbm(p * 1.7 + 9.0) - 1.0);
          float pulse = 0.72 + 0.28 * sin(p.x * 0.35 - uT * 2.0);
          vec3 veinGold = vec3(1.0, 0.5, 0.1) * (pow(ridge, 48.0) * 1.3 + pow(fine2, 70.0) * 0.3) * pulse;
          vec3 veinRed = vec3(0.75, 0.02, 0.05) * pow(ridge, 18.0) * 0.5;
          // En las tomas generales la lava de afuera se apaga y la pista se aclara: el ojo tiene que ir a los caballos.
          vec3 land = vec3(0.006, 0.002, 0.004) + (veinRed + veinGold * 0.7) * (1.0 - 0.86 * uClear);
          vec3 bronze = vec3(0.034, 0.013, 0.006) * (0.45 + 0.9 * furrow) * (0.6 + 0.8 * fine) * (1.0 + 1.5 * uClear);
          vec3 track = bronze + veinGold * 0.22 * (1.0 - 0.6 * uClear);
          vec3 hell = mix(land, track, edge);
          hell += vec3(1.5, 0.82, 0.25) * lanes * 0.3 * edge;
          hell += vec3(0.7, 0.3, 0.07) * marks * edge * 0.2;
          // Recta final: las vetas se encienden y las líneas se vuelven prisma, corriendo hacia atrás.
          hell += veinGold * uI * mix(1.0 - uClear, 1.0, edge);
          hell += prism(p.x * 0.05 - uT * 0.9 + p.y * 0.08) * lanes * uI * 2.0;
          float gx = line(fract(p.x / 6.0 + uT * 1.4) - 0.5, 0.05);
          hell += vec3(1.0, 0.42, 0.08) * gx * edge * uI * 0.45;

          // La onda que cambia el mundo sale de la salida y barre el piso, con un frente de arcoíris.
          float fromStart = length(p);
          float changed = smoothstep(uWave + 1.0, uWave - 26.0, fromStart);
          vec3 col = mix(calm, hell, changed);
          float front = (fromStart - uWave) / 11.0;
          float band = exp(-front * front) * step(uWave, 1e5) * step(0.0, uWave);
          col += (prism(front * 0.6 - uT * 0.3) * 2.6 + vec3(1.0, 0.85, 0.6) * exp(-front * front * 7.0) * 3.0) * band;

          float dist = length(vW - cameraPosition);
          col = mix(col, uFog, smoothstep(uFogRange.x, uFogRange.y, dist));
          gl_FragColor = vec4(col, 1.0);
        }`
    })
    const ground = new THREE.Mesh(new THREE.PlaneGeometry(FINISH + 1300, 800), material)
    ground.rotation.x = -Math.PI / 2
    ground.position.x = FINISH / 2
    ground.onBeforeRender = () => material.uniforms.uFogRange.value.set(scene.fog.near, scene.fog.far)
    scene.add(ground)
  }

  function buildRailsAndScenery() {
    const white = toon(0xffffff)
    const rail = new THREE.CylinderGeometry(0.075, 0.075, FINISH + 620, 8)
    rail.rotateZ(Math.PI / 2)
    const postGeo = new THREE.CylinderGeometry(0.06, 0.075, 1.25, 8)
    const postCount = Math.ceil((FINISH + 590) / 2.5)
    const rails = [-1, 1].map(side => {
      const group = new THREE.Group()
      group.userData.side = side
      const z = side * (WIDTH / 2 + 0.25)
      const top = new THREE.Mesh(rail, white)
      top.position.set(FINISH / 2 + 190, 1.25, z)
      group.add(top)
      const posts = new THREE.InstancedMesh(postGeo, white, postCount)
      const m = new THREE.Matrix4()
      for (let i = 0; i < postCount; i++) posts.setMatrixAt(i, m.makeTranslation(-90 + i * 2.5, 0.62, z))
      group.add(posts)
      scene.add(group)
      return group
    })

    const r = seeded(11)
    const trunkGeo = new THREE.CylinderGeometry(0.32, 0.55, 3.4, 10)
    const crownGeo = mergeGeometries([
      new THREE.IcosahedronGeometry(2.7, 3),
      new THREE.IcosahedronGeometry(2.0, 3).translate(1.5, 0.8, 0.6),
      new THREE.IcosahedronGeometry(1.9, 3).translate(-1.3, 0.9, -0.7),
      new THREE.IcosahedronGeometry(1.7, 3).translate(0.2, 1.9, 0.2)
    ])
    const COUNT = Math.min(500, Math.round((150 * (FINISH + 240)) / 340))
    const trunks = new THREE.InstancedMesh(trunkGeo, toon(0x7a4f2e), COUNT)
    const crowns = new THREE.InstancedMesh(crownGeo, toon(0xffffff), COUNT)
    const hues = [0x2f9e29, 0x54c22d, 0x1f8a55, 0xffa91f, 0xff8fb0, 0x8ed11f]
    const m = new THREE.Matrix4()
    const c = new THREE.Color()
    for (let i = 0; i < COUNT; i++) {
      const x = -70 + r() * (FINISH + 540)
      // Del lado de la tribuna solo arrancan detrás de ella.
      const z = r() < 0.5 ? WIDTH / 2 + 26 + r() * 90 : -(WIDTH / 2 + 34 + r() * 90)
      const s = 0.9 + r() * 1.1
      trunks.setMatrixAt(i, m.makeScale(s, s, s).setPosition(x, 1.7 * s, z))
      crowns.setMatrixAt(i, m.makeScale(s, s, s).setPosition(x, 5 * s, z))
      crowns.setColorAt(i, c.setHex(hues[Math.floor(r() * hues.length)]))
    }
    const trees = new THREE.Group()
    trees.add(trunks, crowns)
    scene.add(trees)

    // Sierras a lo lejos.
    for (let x = -150; x < FINISH + 400; x += 42) {
      const mountain = new THREE.Mesh(new THREE.ConeGeometry(70 + r() * 70, 60 + r() * 60, 8), mountainMaterial)
      mountain.position.set(x, 22, -(230 + r() * 60))
      scene.add(mountain)
    }
    return { rails, trees }
  }

  function buildGrandstand(centerX) {
    const stand = new THREE.Group()
    const length = 130
    const baseZ = -(WIDTH / 2 + 6)
    const concrete = toon(0xdfd5c6)
    const rows = 11
    const rowDepth = 1.2
    const rowRise = 0.72
    for (let i = 0; i < rows; i++) {
      const row = new THREE.Mesh(new THREE.BoxGeometry(length, rowRise * (i + 1) + 1, rowDepth), i % 2 ? concrete : toon(0xc9beac))
      row.position.set(0, (rowRise * (i + 1) + 1) / 2, -i * rowDepth)
      stand.add(row)
    }
    // Techo con columnas.
    const roof = new THREE.Mesh(new THREE.BoxGeometry(length + 4, 0.5, rows * rowDepth + 5), toon(0xff2d6f))
    roof.position.set(0, rowRise * rows + 8, -rows * rowDepth / 2 + 1)
    roof.rotation.x = -0.06
    stand.add(roof)
    for (let i = 0; i <= 8; i++) {
      const column = new THREE.Mesh(new THREE.BoxGeometry(0.5, rowRise * rows + 8, 0.5), toon(0xfff4e2))
      column.position.set(-length / 2 + i * (length / 8), (rowRise * rows + 8) / 2, -rows * rowDepth + 0.5)
      stand.add(column)
    }

    // El público son calaveras que saltan en ola. Las cuencas van en la propia geometría, con color de vértice.
    const paint = (geometry, hex) => {
      const part = geometry.index ? geometry.toNonIndexed() : geometry
      const color = new THREE.Color(hex)
      const colors = new Float32Array(part.attributes.position.count * 3)
      for (let i = 0; i < colors.length; i += 3) color.toArray(colors, i)
      part.setAttribute("color", new THREE.BufferAttribute(colors, 3))
      part.deleteAttribute("uv")
      return part
    }
    const skull = mergeGeometries([
      paint(new THREE.IcosahedronGeometry(0.31, 1).scale(1, 1.05, 1.02).translate(0, 0.62, 0), 0xffffff),
      paint(new THREE.BoxGeometry(0.3, 0.17, 0.26).translate(0, 0.3, 0.05), 0xffffff),
      paint(new THREE.IcosahedronGeometry(0.095, 0).translate(-0.115, 0.6, 0.26), 0x050002),
      paint(new THREE.IcosahedronGeometry(0.095, 0).translate(0.115, 0.6, 0.26), 0x050002),
      paint(new THREE.IcosahedronGeometry(0.05, 0).translate(0, 0.46, 0.3), 0x050002)
    ])
    // Sin brillo de borde y apagándose en la recta final: miles de puntos brillantes se ven como estática.
    const crowdMaterial = new THREE.MeshLambertMaterial({ color: 0xffffff, vertexColors: true })
    crowdMaterial.onBeforeCompile = shader => {
      shader.uniforms.uTime = uT
      shader.uniforms.uI = uI
      shader.uniforms.uWorld = uWorld
      shader.vertexShader = shader.vertexShader
        .replace("#include <common>", "#include <common>\nuniform float uTime; uniform float uI;")
        .replace("#include <begin_vertex>", `#include <begin_vertex>
          float wave = sin(uTime * (5.0 + 5.0 * uI) + instanceMatrix[3].x * 0.35 + instanceMatrix[3].z * 1.3);
          transformed.y += max(0.0, wave) * (0.28 + 0.34 * uI);`)
      shader.fragmentShader = shader.fragmentShader
        .replace("#include <common>", "#include <common>\nuniform float uI; uniform float uWorld;")
        .replace("#include <color_fragment>", "#include <color_fragment>\ndiffuseColor.rgb *= (1.0 - 0.45 * uWorld) * (1.0 - 0.95 * smoothstep(0.0, 0.55, uI));")
    }
    crowdMaterial.customProgramCacheKey = () => "crowd"
    const r = seeded(5)
    const perRow = 95
    const crowd = new THREE.InstancedMesh(skull, crowdMaterial, perRow * rows)
    const m = new THREE.Matrix4()
    const c = new THREE.Color()
    const bones = [0xf4ecd8, 0xe6d9b8, 0xd8c79e, 0xfff6e6, 0xc9b78c]
    for (let i = 0; i < rows; i++) {
      for (let j = 0; j < perRow; j++) {
        const x = -length / 2 + (j + r() * 0.8) * (length / perRow)
        const s = 1.25 + r() * 0.5
        m.makeScale(s, s, s).setPosition(x, rowRise * (i + 1) + 1, -i * rowDepth + (r() - 0.5) * 0.3)
        crowd.setMatrixAt(i * perRow + j, m)
        crowd.setColorAt(i * perRow + j, c.setHex(bones[Math.floor(r() * bones.length)]))
      }
    }
    stand.add(crowd)

    // Cartelería con los chistes de la casa.
    const ads = ["FIADO HOY, MAÑANA PAGO", "CASI GANO SEGUROS", "TÍA FORTUNA PRÉSTAMOS", "APUESTA Y REZA", "EL CABULERO"]
    ads.forEach((text, i) => {
      const signMaterial = new THREE.MeshBasicMaterial({ map: textTexture(text, { font: 92, bg: i % 2 ? "#ff2d6f" : "#ffc61a", fg: i % 2 ? "#fff" : "#1a1020" }) })
      signMaterials.push(signMaterial)
      const board = new THREE.Mesh(new THREE.PlaneGeometry(22, 2.3), signMaterial)
      board.position.set(-length / 2 + 14 + i * 26, 1.1, 0.72)
      stand.add(board)
    })

    // Banderas sobre el techo.
    const flagGeo = new THREE.PlaneGeometry(2.8, 1.5, 16, 4)
    flagGeo.translate(1.4, 0, 0)
    for (let i = 0; i < 10; i++) {
      const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 4.4, 6), toon(0xffffff))
      const x = -length / 2 + i * (length / 9)
      const y = rowRise * rows + 10
      pole.position.set(x, y, -3)
      stand.add(pole)
      const flagMaterial = new THREE.MeshToonMaterial({ color: shirtsAt(i), side: THREE.DoubleSide })
      flagMaterial.onBeforeCompile = shader => {
        shader.uniforms.uTime = uT
        shader.vertexShader = shader.vertexShader
          .replace("#include <common>", "#include <common>\nuniform float uTime;")
          .replace("#include <begin_vertex>", `#include <begin_vertex>
            transformed.z += sin(position.x * 2.6 - uTime * 8.0 + ${i.toFixed(1)}) * 0.2 * (position.x / 2.8);
            transformed.y += sin(position.x * 1.9 - uTime * 5.5) * 0.09 * (position.x / 2.8);`)
      }
      flagMaterial.customProgramCacheKey = () => `flag-${i}`
      const flag = new THREE.Mesh(flagGeo, flagMaterial)
      flag.position.set(x, y + 1.4, -3)
      stand.add(flag)
    }

    stand.position.set(centerX, 0, baseZ)
    scene.add(stand)
    return stand

    function shirtsAt(i) { return [0xff2d6f, 0xffc61a, 0x18c5b6, 0x7b2ff7, 0xffffff][i % 5] }
  }

  function buildGates() {
    // Línea a cuadros en la meta.
    const canvas = document.createElement("canvas")
    const cells = Math.round(WIDTH / 0.5)
    canvas.width = 64; canvas.height = 32 * cells
    const c = canvas.getContext("2d")
    for (let y = 0; y < cells; y++) for (let x = 0; x < 2; x++) {
      c.fillStyle = (x + y) % 2 ? "#14081c" : "#ffffff"
      c.fillRect(x * 32, y * 32, 32, 32)
    }
    const checker = new THREE.CanvasTexture(canvas)
    checker.magFilter = THREE.NearestFilter
    checker.colorSpace = THREE.SRGBColorSpace
    const line = new THREE.Mesh(new THREE.PlaneGeometry(1, WIDTH), new THREE.MeshBasicMaterial({ map: checker }))
    line.rotation.x = -Math.PI / 2
    line.position.set(FINISH + 1, 0.03, 0)
    scene.add(line)

    const arch = (x, text, color) => {
      const group = new THREE.Group()
      for (const side of [-1, 1]) {
        const column = new THREE.Mesh(new THREE.CylinderGeometry(0.28, 0.34, 8.6, 14), toon(color))
        column.position.set(0, 4.3, side * (WIDTH / 2 + 0.9))
        group.add(column)
      }
      const board = new THREE.Mesh(
        new THREE.BoxGeometry(0.3, 1.9, WIDTH + 2.6),
        [0, 0, 0, 0, 1, 2].map(i => new THREE.MeshBasicMaterial(
          i ? { map: textTexture(text, { width: 2048, height: 200, font: 150 }) } : { color: 0xffc61a }
        ))
      )
      board.material[0].map = textTexture(text, { width: 2048, height: 200, font: 150 })
      board.material[1].map = textTexture(text, { width: 2048, height: 200, font: 150 })
      board.position.y = 8.2
      group.add(board)
      group.position.x = x
      scene.add(group)
    }
    arch(FINISH + 1, "M E T A", 0xff2d6f)

    // Arcos de luz sobre la pista: al pasar zumbando son los que hacen sentir la velocidad.
    const count = Math.max(0, Math.floor((FINISH - 60) / 70))
    if (count) {
      const ring = new THREE.TorusGeometry(WIDTH / 2 + 1.4, 0.13, 8, 44, Math.PI)
      ring.rotateY(Math.PI / 2)
      const rings = new THREE.InstancedMesh(ring, new THREE.MeshBasicMaterial({ color: 0xffffff }), count)
      const m = new THREE.Matrix4()
      const c = new THREE.Color()
      for (let i = 0; i < count; i++) {
        rings.setMatrixAt(i, m.makeTranslation(60 + i * 70, 0, 0))
        rings.setColorAt(i, c.setHSL((i * 0.083) % 1, 1, 0.55).multiplyScalar(2.4))
      }
      scene.add(rings)
    }
    arch(-3, "¡ L A R G A R O N !", 0x18c5b6)
  }

  function buildDust() {
    const COUNT = 700
    const positions = new Float32Array(COUNT * 3)
    const ages = new Float32Array(COUNT).fill(9)
    const seeds = new Float32Array(COUNT)
    const velocities = new Float32Array(COUNT * 3)
    const geometry = new THREE.BufferGeometry()
    geometry.setAttribute("position", new THREE.BufferAttribute(positions, 3))
    geometry.setAttribute("aAge", new THREE.BufferAttribute(ages, 1))
    geometry.setAttribute("aSeed", new THREE.BufferAttribute(seeds, 1))
    const material = new THREE.ShaderMaterial({
      transparent: true, depthWrite: false,
      uniforms: { uI, uWorld, uScale: { value: 1 } },
      vertexShader: `
        attribute float aAge, aSeed; varying float vLife; uniform float uScale;
        void main() {
          vLife = clamp(1.0 - aAge / 1.15, 0.0, 1.0);
          vec4 mv = modelViewMatrix * vec4(position, 1.0);
          gl_PointSize = uScale * (0.5 + (1.0 - vLife) * 1.5 + aSeed * 0.5) / -mv.z;
          gl_Position = projectionMatrix * mv;
        }`,
      fragmentShader: `
        varying float vLife; uniform float uI, uWorld;
        void main() {
          float d = length(gl_PointCoord - 0.5);
          if (d > 0.5) discard;
          float a = pow(smoothstep(0.5, 0.0, d), 1.6) * vLife * (0.5 - 0.28 * uWorld);
          // En el inframundo el polvo es ceniza de cobre, no tierra clara.
          vec3 day = mix(vec3(0.86, 0.68, 0.46), vec3(0.42, 0.14, 0.04), uWorld);
          vec3 night = vec3(1.4, 0.2, 1.1);
          gl_FragColor = vec4(mix(day, night, uI), a);
        }`
    })
    const points = new THREE.Points(geometry, material)
    points.frustumCulled = false
    scene.add(points)
    let cursor = 0
    return {
      emit(x, z, speed) {
        const i = cursor++ % COUNT
        positions[i * 3] = x; positions[i * 3 + 1] = 0.1; positions[i * 3 + 2] = z
        velocities[i * 3] = -1 - Math.random() * 3 * speed
        velocities[i * 3 + 1] = 0.5 + Math.random() * 1.6
        velocities[i * 3 + 2] = (Math.random() - 0.5) * 1.2
        ages[i] = 0
        seeds[i] = Math.random()
      },
      update(dt) {
        material.uniforms.uScale.value = renderer.domElement.height * 0.75
        for (let i = 0; i < COUNT; i++) {
          if (ages[i] > 2) continue
          ages[i] += dt
          positions[i * 3] += velocities[i * 3] * dt
          positions[i * 3 + 1] += velocities[i * 3 + 1] * dt
          positions[i * 3 + 2] += velocities[i * 3 + 2] * dt
          velocities[i * 3 + 1] *= 1 - 1.5 * dt
        }
        geometry.attributes.position.needsUpdate = true
        geometry.attributes.aAge.needsUpdate = true
        geometry.attributes.aSeed.needsUpdate = true
      }
    }
  }

  function buildConfetti() {
    const COUNT = 420
    const mesh = new THREE.InstancedMesh(
      new THREE.PlaneGeometry(0.075, 0.12),
      new THREE.MeshBasicMaterial({ side: THREE.DoubleSide }),
      COUNT
    )
    mesh.frustumCulled = false
    // Presente desde el principio, sin dibujar nada: si su material se compila al festejar, la imagen se traba ahí.
    const colors = [0xff2d6f, 0xffc61a, 0x18c5b6, 0x7b2ff7, 0x2f7bff, 0xffffff]
    const c = new THREE.Color()
    for (let i = 0; i < COUNT; i++) mesh.setColorAt(i, c.setHex(colors[i % colors.length]))
    mesh.count = 0
    scene.add(mesh)
    const parts = []
    const dummy = new THREE.Object3D()
    return {
      start(winner) {
        mesh.count = COUNT
        for (let i = 0; i < COUNT; i++) {
          parts[i] = {
            p: new THREE.Vector3(winner.x + (Math.random() - 0.5) * 14, 7 + Math.random() * 12, winner.z + (Math.random() - 0.5) * 12),
            r: new THREE.Vector3(Math.random() * 6, Math.random() * 6, Math.random() * 6),
            s: 0.8 + Math.random() * 1.1,
            w: Math.random() * 6
          }
        }
      },
      update(dt) {
        if (!mesh.count) return
        parts.forEach((part, i) => {
          part.p.y -= part.s * 3 * dt
          part.p.x += Math.sin(state.clock * 2 + part.w) * dt * 0.9
          part.r.x += dt * 4; part.r.y += dt * 3
          if (part.p.y < 0.1) part.p.y = 13
          dummy.position.copy(part.p)
          dummy.rotation.set(part.r.x, part.r.y, part.r.z)
          dummy.updateMatrix()
          mesh.setMatrixAt(i, dummy.matrix)
        })
        mesh.instanceMatrix.needsUpdate = true
      }
    }
  }

  // ── Postproceso: brillo, estelas, caleidoscopio en los bordes y cuadro de impacto ─
  function buildPost() {
    const options = { type: THREE.HalfFloatType, wrapS: THREE.MirroredRepeatWrapping, wrapT: THREE.MirroredRepeatWrapping }
    const rtScene = new THREE.WebGLRenderTarget(4, 4, { ...options, samples: 4 })
    const rtBloomA = new THREE.WebGLRenderTarget(4, 4, { type: THREE.HalfFloatType })
    const rtBloomB = new THREE.WebGLRenderTarget(4, 4, { type: THREE.HalfFloatType })
    let rtCurrent = new THREE.WebGLRenderTarget(4, 4, options)
    let rtPrevious = new THREE.WebGLRenderTarget(4, 4, options)

    const vertexShader = "varying vec2 vUv; void main(){ vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }"
    const quadScene = new THREE.Scene()
    const quadCamera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1)
    const quad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2))
    quadScene.add(quad)

    const blurMaterial = new THREE.ShaderMaterial({
      uniforms: { tMap: { value: null }, uDir: { value: new THREE.Vector2() }, uBright: { value: 0 } },
      vertexShader,
      fragmentShader: `
        uniform sampler2D tMap; uniform vec2 uDir; uniform float uBright; varying vec2 vUv;
        vec3 pick(vec2 uv) {
          vec3 c = texture2D(tMap, uv).rgb;
          if (uBright > 0.5) { float l = max(c.r, max(c.g, c.b)); c *= smoothstep(0.82, 1.5, l); }
          return c;
        }
        void main() {
          vec3 c = pick(vUv) * 0.227;
          c += (pick(vUv + uDir * 1.385) + pick(vUv - uDir * 1.385)) * 0.316;
          c += (pick(vUv + uDir * 3.231) + pick(vUv - uDir * 3.231)) * 0.07;
          gl_FragColor = vec4(c, 1.0);
        }`
    })

    const compositeMaterial = new THREE.ShaderMaterial({
      uniforms: {
        tScene: { value: rtScene.texture }, tBloom: { value: rtBloomB.texture }, tPrev: { value: null },
        uI: uPostI, uT, uWorld, uSpeed, uAspect: { value: 1 }, uImpact: { value: 0 }, uLens: { value: 0 }, uPortal: { value: 0 }
      },
      vertexShader,
      fragmentShader: `
        uniform sampler2D tScene, tBloom, tPrev; uniform float uI, uT, uWorld, uSpeed, uAspect, uImpact, uLens, uPortal; varying vec2 vUv;
        ${NOISE}
        void main() {
          vec2 asp = vec2(uAspect, 1.0);
          vec2 p = (vUv - 0.5) * asp;
          float r = length(p);
          float ang = atan(p.y, p.x);

          // Lente curva: como mirar a través de una esfera, con el centro limpio para seguir la carrera.
          vec2 q = p * (1.0 + uLens * r * r) / (1.0 + uLens * 0.32);

          vec2 dir = normalize(p + 1e-4) * (0.0035 * uWorld + 0.011 * uI) * smoothstep(0.2, 0.9, r) / asp;
          vec2 uv = q / asp + 0.5;
          // Desenfoque radial con la velocidad: el centro queda nítido y los bordes se estiran hacia afuera.
          float pull = uSpeed * uSpeed * 0.075 * smoothstep(0.1, 0.62, r);
          vec3 col = vec3(0.0);
          for (int i = 0; i < 7; i++) {
            float f = 1.0 - pull * float(i) / 6.0;
            vec2 s = (uv - 0.5) * f + 0.5;
            col += vec3(texture2D(tScene, s + dir).r, texture2D(tScene, s).g, texture2D(tScene, s - dir).b);
          }
          col /= 7.0;

          col += texture2D(tBloom, uv).rgb * (0.28 + 0.4 * uWorld + 0.6 * uI);
          col += vec3(1.0, 0.72, 0.36) * uPortal * 0.2 * smoothstep(1.0, 0.1, r);

          // Estelas: lo del cuadro anterior, un poco agrandado, sigue brillando detrás.
          // Solo lejos del centro: ahí están los caballos, y tienen que seguir nítidos.
          vec2 pp = (vUv - 0.5) * 0.978;
          float cs = cos(0.003), sn = sin(0.003);
          pp = vec2(pp.x * cs - pp.y * sn, pp.x * sn + pp.y * cs);
          vec3 prev = texture2D(tPrev, pp + 0.5).rgb;
          col = mix(col, max(col, prev * 0.86), uI * 0.8 * smoothstep(0.14, 0.46, r));

          // Líneas de velocidad, más densas hacia los bordes.
          float lines = noise(vec2(ang * 42.0, uT * 2.2));
          col += vec3(1.1, 0.9, 1.3) * smoothstep(0.76, 0.92, lines) * smoothstep(0.34, 0.95, r) * (uI * 0.55 + uSpeed * uSpeed * 0.32);

          // Borde oscuro de la esfera y colores más duros y saturados, como en las referencias.
          col *= 1.0 - smoothstep(0.5, 1.08, r) * (0.1 + 0.7 * uWorld + 0.1 * uI);
          float gray = dot(col, vec3(0.3, 0.59, 0.11));
          col = max(mix(vec3(gray), col, 1.0 + 0.38 * uWorld), 0.0);
          vec3 clamped = min(col, vec3(1.0));
          col = mix(col, clamped * clamped * (3.0 - 2.0 * clamped) + max(col - 1.0, 0.0), 0.4 * uWorld);

          // Cuadro de impacto al cruzar la meta: blanco y negro con líneas radiales, una sola vez.
          if (uImpact > 0.001) {
            float l = dot(texture2D(tScene, vUv).rgb, vec3(0.3, 0.59, 0.11));
            float ink = step(0.42, l);
            float burst = smoothstep(0.55, 0.75, noise(vec2(ang * 30.0, 3.7))) * smoothstep(0.12, 0.6, r);
            vec3 impact = mix(vec3(0.03, 0.0, 0.06), vec3(1.0, 0.97, 0.9), clamp(ink + burst, 0.0, 1.0));
            col = mix(col, impact, smoothstep(0.0, 0.25, uImpact));
          }
          gl_FragColor = vec4(col, 1.0);
        }`
    })

    const blitMaterial = new THREE.ShaderMaterial({
      uniforms: { tMap: { value: null } },
      vertexShader,
      fragmentShader: `
        uniform sampler2D tMap; varying vec2 vUv;
        void main() {
          gl_FragColor = vec4(texture2D(tMap, vUv).rgb, 1.0);
          #include <colorspace_fragment>
        }`
    })

    const pass = (material, target) => {
      quad.material = material
      renderer.setRenderTarget(target)
      renderer.render(quadScene, quadCamera)
    }

    return {
      // Con el mismo destino que al dibujar: si no, compila otra variante y la de verdad se traba cuando entra en cuadro.
      compile() {
        renderer.setRenderTarget(rtScene)
        renderer.compile(scene, camera)
        renderer.setRenderTarget(null)
      },
      resize(w, h) {
        rtScene.setSize(w, h)
        rtCurrent.setSize(w, h)
        rtPrevious.setSize(w, h)
        rtBloomA.setSize(w >> 2, h >> 2)
        rtBloomB.setSize(w >> 2, h >> 2)
        compositeMaterial.uniforms.uAspect.value = w / h
      },
      run(impact) {
        renderer.info.reset()
        renderer.setRenderTarget(rtScene)
        renderer.render(scene, camera)

        const texel = 1 / rtBloomA.width, texelY = 1 / rtBloomA.height
        blurMaterial.uniforms.tMap.value = rtScene.texture
        blurMaterial.uniforms.uBright.value = 1
        blurMaterial.uniforms.uDir.value.set(texel, 0)
        pass(blurMaterial, rtBloomA)
        blurMaterial.uniforms.tMap.value = rtBloomA.texture
        blurMaterial.uniforms.uBright.value = 0
        blurMaterial.uniforms.uDir.value.set(0, texelY)
        pass(blurMaterial, rtBloomB)

        compositeMaterial.uniforms.tPrev.value = rtPrevious.texture
        compositeMaterial.uniforms.uImpact.value = impact
        compositeMaterial.uniforms.uLens.value = lensAmount()
        compositeMaterial.uniforms.uPortal.value = state.portal
        pass(compositeMaterial, rtCurrent)

        blitMaterial.uniforms.tMap.value = rtCurrent.texture
        pass(blitMaterial, null)

        const swap = rtPrevious
        rtPrevious = rtCurrent
        rtCurrent = swap
      }
    }
  }

  function render() {
    post.run(state.impact)
  }

  function lensAmount() {
    return (uWorld.value * 0.5 + uI.value * 0.6 + state.portal * 0.4) * (1 - 0.8 * state.clarity)
  }

  // ── Interfaz ──────────────────────────────────────────────────────────────────────
  function buildHud() {
    const make = (cls, parent = document.body) => {
      const el = document.createElement("div")
      el.className = cls
      parent.appendChild(el)
      return el
    }
    const rank = make("hud hud-rank")
    const count = make("hud hud-count")
    const win = make("hud hud-win")
    // Tarjeta de presentación de un favorito, a pantalla completa, durante el preludio.
    const fav = make("hud hud-favorito")
    let favActual = null
    const reco = make("hud hud-reco")
    reco.textContent = "Reconectando…"
    const fps = showFps ? make("hud hud-fps") : null
    let nextList = 0
    let frames = 0
    let lastFps = performance.now()
    const hex = n => `#${n.toString(16).padStart(6, "0")}`

    // Mapa de la carrera: un carril por caballo, de la salida a la meta.
    const map = make("hud hud-map")
    const pins = pool.map(h => {
      const lane = make("map-lane", map)
      lane.style.display = "none"
      const slide = make("map-slide", lane)
      const pin = make("map-pin", slide)
      pin.style.background = hex(h.silk)
      return { h, lane, slide, pin }
    })
    make("map-goal", map)

    // Quién va primero y a cuánto está de llegar.
    const lead = make("hud hud-lead")
    const leadDot = document.createElement("i")
    const leadName = document.createElement("b")
    const leadInfo = document.createElement("small")
    lead.append(leadDot, leadName, leadInfo)

    // Puesto sobre cada caballo. Se proyecta a mano y se corrige por la lente del postproceso.
    const tags = new Map(pool.map(h => {
      const tag = make("hud hud-tag")
      tag.style.setProperty("--c", hex(h.silk))
      return [h, tag]
    }))
    const point = new THREE.Vector3()
    const unlens = (x, y) => {
      const amount = lensAmount()
      const s = Math.hypot(x * 0.5 * camera.aspect, y * 0.5)
      if (amount < 0.001 || s < 1e-5) return [x, y]
      const target = s * (1 + 0.32 * amount)
      let r = s
      for (let k = 0; k < 4; k++) r -= (r + amount * r * r * r - target) / (1 + 3 * amount * r * r)
      return [x * (r / s), y * (r / s)]
    }
    const placeTags = () => {
      const finale = state.shot === "final-paneo" // en las repeticiones el caballo llena el cuadro y el cartel ya dice quién es
      const everyone = state.shot === "peloton"
      const contenders = state.shot === "recta" || state.shot === "llegada"
      const leaderOnly = state.shot === "tele" || state.shot === "arco"
      camera.updateMatrixWorld()
      horses.forEach(h => {
        const tag = tags.get(h)
        const rank = state.order.indexOf(h) + 1
        let show = finale ? h === state.winner : everyone || (contenders && rank <= 3) || (leaderOnly && rank === 1)
        if (show) {
          point.set(h.x, 3.05, h.z).project(camera)
          show = point.z < 1 && Math.abs(point.x) < 1 && Math.abs(point.y) < 1
        }
        tag.style.opacity = show ? 1 : 0
        if (!show) return
        const first = finale || rank === 1
        const label = first ? `1.º ${h.name}` : String(rank)
        if (tag.textContent !== label) tag.textContent = label
        tag.classList.toggle("first", first)
        const [x, y] = unlens(point.x, point.y)
        tag.style.transform = `translate(${((x + 1) * 0.5 * innerWidth).toFixed(1)}px, ${((1 - y) * 0.5 * innerHeight).toFixed(1)}px) translate(-50%, -100%)`
      })
    }

    return {
      activate(h) {
        const pin = pins.find(p => p.h === h)
        pin.lane.style.display = ""
        pin.pin.classList.toggle("mine", h === mine)
      },
      markMine() { pins.forEach(p => p.pin.classList.toggle("mine", p.h === mine)) },
      update() {
        // En la sala, antes de largar, la pantalla es de la sala: sin HUD.
        document.body.classList.toggle("esperando", state.countdownEnd === null && !state.started)
        const crossed = state.crossedAt !== null
        map.style.opacity = state.started && !state.celebrating ? 1 : 0
        pins.forEach(({ h, slide, pin }) => {
          if (!h.active) return
          slide.style.transform = `translateX(${clamp((h.x / FINISH) * 100, 0, 100).toFixed(2)}%)`
          pin.classList.toggle("lead", h === state.leader)
        })
        placeTags()
        frames++
        const now = performance.now()
        if (fps && now - lastFps > 500) {
          const info = renderer.info.render
          fps.textContent = `${Math.round((frames * 1000) / (now - lastFps))} FPS · ${Math.round(info.triangles / 1000)}k triángulos`
          frames = 0; lastFps = now
        }
        const left = state.countdownEnd === null ? Infinity : state.countdownEnd - state.clock
        // Durante el preludio la pantalla es del hipódromo: sin lista ni números hasta el 3, 2, 1.
        rank.style.opacity = state.started || left <= 3 ? 1 : 0
        if (state.countdownEnd !== null && state.clock < state.countdownEnd + 0.5 && !state.started) {
          const text = left > 3 ? "" : left > 0 ? String(Math.ceil(left)) : "¡YA!"
          if (text !== count.textContent) { count.textContent = text; if (text === "¡YA!") ya(); else if (text) onCount?.(text) }
        } else if (state.started && state.clock) {
          count.textContent = ""
        }
        if (state.clock < nextList) return
        nextList = state.clock + 0.2
        const sorted = [...horses].sort((a, b) => b.x - a.x)
        rank.innerHTML = sorted.map((h, i) =>
          `<div class="${h === mine ? "mine" : ""}"><b>${i + 1}</b><i style="background:${hex(h.silk)}"></i><span></span><em></em></div>`).join("")
        // Texto puesto aparte: los nombres los escriben los usuarios.
        rank.querySelectorAll("span").forEach((span, i) => { span.textContent = `${sorted[i].name} · ${sorted[i].username}` })
        if (state.started) rank.querySelectorAll("em").forEach((em, i) => { em.textContent = i ? `+${Math.round(sorted[0].x - sorted[i].x)} m` : "" })
        const remaining = Math.max(0, Math.ceil(FINISH - state.leaderX))

        const fighting = !crossed && (state.shot === "recta" || state.shot === "llegada")
        const announced = crossed && !state.celebrating && state.winner
        lead.style.opacity = fighting || announced ? 1 : 0
        if (fighting || announced) {
          const h = announced ? state.winner : sorted[0]
          leadDot.style.background = hex(h.silk)
          lead.style.setProperty("--c", hex(h.silk))
          leadName.textContent = announced ? `¡Gana ${h.name}!` : h.name
          leadInfo.textContent = announced ? `apuesta de ${h.username}` : (sorted[1] ? `a ${remaining} m · 2.º ${sorted[1].name} a ${Math.round(sorted[0].x - sorted[1].x)} m` : `a ${remaining} m`)
        }
      },
      reconectando(si) { reco.classList.toggle("show", si) },
      favorito(h, puesto) {
        if (h === favActual) return
        favActual = h
        if (!h) { fav.classList.remove("show"); return }
        fav.textContent = ""
        fav.style.setProperty("--c", hex(h.silk))
        const img = document.createElement("img")
        img.src = `/images/retratos/${h.element}.webp`
        img.alt = ""
        const texto = document.createElement("div")
        texto.className = "favorito-texto"
        const etiqueta = document.createElement("small")
        etiqueta.textContent = `Favorito n.º ${puesto}`
        const nombre = document.createElement("b")
        nombre.textContent = h.name
        const de = document.createElement("span")
        de.textContent = `${h.element[0].toUpperCase()}${h.element.slice(1)} · de ${h.username}`
        texto.append(etiqueta, nombre, de)
        fav.append(img, texto)
        fav.classList.remove("show"); void fav.offsetWidth; fav.classList.add("show")
      },
      showWin(h) {
        // La misma portada de victoria que en resultados: la del elemento del ganador, con el texto encima.
        win.textContent = ""
        if (h.element) {
          win.classList.add("con-portada")
          win.style.setProperty("--portada", `url("/images/retratos/victoria-${h.element}.webp")`)
          win.style.setProperty("--portada-anim", `url("/images/retratos/victoria-${h.element}-anim.webp")`)
        }
        const texto = document.createElement("div")
        texto.className = "hud-win-texto"
        texto.append(h === mine ? "¡Ganaste!" : `¡Ganó ${h.name}!`)
        const small = document.createElement("small")
        small.textContent = h === mine ? `con ${h.name}` : `apuesta de ${h.username}`
        texto.append(small)
        win.append(texto)
        win.classList.add("show")
      }
    }
  }

  function resize() {
    const w = innerWidth, h = innerHeight
    renderer.setSize(w, h)
    const pr = renderer.getPixelRatio()
    shared.uViewHeight.value = Math.floor(h * pr)
    post.resize(Math.floor(w * pr), Math.floor(h * pr))
    camera.aspect = w / h
  }
  addEventListener("resize", resize)
  resize()
  // Todo se compila al cargar: lo que recién entra en cuadro cerca de la meta, como la tribuna, trababa la imagen al llegar.
  post.compile()
  // Compilados: los lugares todavía vacíos se ocultan hasta que alguien se una.
  pool.forEach(h => { h.root.visible = h.active })

  const horseMorphActive = () => pool[0].root.children[0].children[0]?.morphTargetInfluences?.filter(v => v > 0.01).length ?? 0

  let frame = null
  function run() {
    let last = performance.now()
    const loop = now => {
      step(Math.min(0.1, (now - last) / 1000))
      last = now
      frame = requestAnimationFrame(loop)
    }
    frame = requestAnimationFrame(loop)
  }

  return {
    step, run, tick, finish, startIn, join, setMine,
    setFavoritos(ids) { state.favoritos = ids.map(Number) },
    setConectado(si) { state.reconectando = !si; hud.reconectando(!si) },
    stop() { if (frame) cancelAnimationFrame(frame) },
    // Para probar y grabar.
    debugCamera(pos, look, fov = 35) {
      renderer.setRenderTarget(null)
      camera.position.set(...pos); camera.lookAt(...look); camera.fov = fov; camera.updateProjectionMatrix()
      post.run(0)
    },
    info: () => ({
      started: state.started,
      leader: Math.max(...horses.map(h => h.x)),
      lastTickPositions: horses.map(h => last(h)),
      intensity: state.intensity,
      shot: state.shot,
      winner: state.winner?.name ?? null,
      crossed: state.crossedAt !== null,
      celebrating: state.celebrating,
      influences: horseMorphActive(),
      winnerSpeed: state.winner ? Math.abs(state.winner.v) : null,
      winnerHeight: state.winner ? state.winner.root.position.y : null,
      closestToCamera: Math.min(...horses.map(h => camera.position.distanceTo(new THREE.Vector3(h.x, 1.4, h.z)))),
      triangles: renderer.info.render.triangles,
      calls: renderer.info.render.calls,
      programs: renderer.info.programs?.length ?? 0
    }),
    horses
  }
}
