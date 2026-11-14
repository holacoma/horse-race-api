import { Controller } from "@hotwired/stimulus"
import { sonar, sonarCuandoSePueda, programarMusica, elegirPista, audioBloqueado } from "sonidos"

// Banco de pruebas de la carrera intensa: la misma escena 3D y el mismo poder (_flechas) que la sala, pero la
// carrera se simula acá, en el navegador, con las mismas reglas que RaceSimulationJob. Sin sala, sin apuesta y sin
// servidor: se puede correr una y otra vez. Con ?presentacion=1 pasa por The World, la presentación y la cuenta.
// El registro de la esquina muestra cada tecla, cada gesto y cada cambio de estado del poder.
const TICK = 0.3
const ACELERACION = [14, 20], PUNTA = [112, 128], SURGE = 9, OLA = 16, MAX_FRENO = 8
const CATCH_UP = 0.08, CATCH_UP_FINAL = 0.9
const IMPULSO = 12, IMPULSO_SEC = 3, IMPULSO_RAMPA = 1.5
// Dificultad de los rivales (0 a 100): cuántas veces por segundo lanza cada uno, en promedio. 40 es lo de la carrera
// real (RaceSimulationJob::BOT_IMPULSO_CADA = 10 s); 100, cada 4 s; 0, nunca. Queda guardada en este navegador.
const LANZA_POR_SEGUNDO_MAX = 0.25
const DIFICULTAD = "clubrace:banco-dificultad"
const PRESENTACION_SEC = 13
const entre = ([a, b]) => a + Math.random() * (b - a)

export default class extends Controller {
  static targets = ["cargando", "registro", "dificultad", "dificultadTexto", "empezar"]

  connect() {
    this.datos = JSON.parse(document.getElementById("prueba-data").textContent)
    elegirPista(this.datos.pista)
    this.alLanzar = event => this.lanzar(this.datos.myHorseId, `tú (carta de ${event.detail.flechas})`)
    document.addEventListener("poder:lanzado", this.alLanzar)
    try { const d = localStorage.getItem(DIFICULTAD); if (d !== null) this.dificultadTarget.value = d } catch {}
    this.dificultad()
    this.espiar()
    this.armar()
  }

  disconnect() {
    clearInterval(this.reloj)
    document.removeEventListener("poder:lanzado", this.alLanzar)
    removeEventListener("keydown", this.tecla, true)
    removeEventListener("touchend", this.gesto, true)
    this.observador?.disconnect()
    this.race?.stop()
  }

  async armar() {
    const [{ createRace }, { loadHorseModel }] = await Promise.all([
      import("/prototipos/carrera3d/escena.js?v=24"),
      import("/prototipos/carrera3d/caballo-pro.js")
    ])
    const horseModel = await loadHorseModel().catch(error => { console.error(error); return null })
    const d = this.datos
    this.race = createRace({
      participants: d.participants,
      slots: d.participants.length,
      distance: d.distance,
      horseModel,
      myId: d.myHorseId,
      showFps: false,
      onCount: text => {
        if (text !== "¡YA!") return sonar("cuenta", Number(text))
        sonar("ya")
        document.dispatchEvent(new CustomEvent("carrera:inicio", { detail: { mio: true } }))
        this.correr()
      },
      onCross: () => sonar("meta"),
      onCelebrate: () => sonar("ganador"),
      onDone: () => {},
      resultadosUrl: location.href,
      apuesta: 0,
      pista: d.pista
    })
    window.__prueba = this
    this.race.run()
    await document.fonts.ready
    this.cargandoTarget.hidden = true
    // Con el audio bloqueado (link abierto directo, sin tocar la página) no sonaría nada: se empieza con un toque.
    if (audioBloqueado()) {
      this.empezarTarget.hidden = false
      await new Promise(r => this.empezarTarget.addEventListener("click", r, { once: true }))
      this.empezarTarget.hidden = true
    }
    if (d.presentacion) {
      // Como en la sala: paneo de los chibis, después The World y la transformación.
      this.race.setFavoritos(d.participants.slice(0, 3).map(p => p.id))
      this.race.startIn(d.paneo + PRESENTACION_SEC)
      programarMusica(d.paneo + PRESENTACION_SEC)
      setTimeout(() => sonarCuandoSePueda("tiempo"), d.paneo * 1000)
    } else {
      this.race.setFavoritos([])
      this.race.startIn(3.5)
      programarMusica(3.5)
    }
  }

  // ── La simulación (igual que RaceSimulationJob, pero en la página) ─────────────────────
  correr() {
    this.reloj0 = performance.now()
    this.clock = 0
    this.entradas = this.datos.participants.map(p => ({
      id: p.id, nombre: p.name, pos: 0, speed: 0, previa: 0, reached: 0,
      aceleracion: entre(ACELERACION), punta: entre(PUNTA), fase: Math.random() * 6.283, periodo: 2.2 + Math.random() * 2.6,
      desde: -100, bot: p.id !== this.datos.myHorseId
    }))
    this.reloj = setInterval(() => this.tick(), TICK * 1000)
  }

  tick() {
    const distancia = this.datos.distance
    if (this.cada) {
      const minimo = Math.min(6, this.cada * 0.6)
      this.entradas.forEach(e => {
        if (e.bot && this.clock - e.desde > minimo && Math.random() < TICK / this.cada) this.lanzar(e.id, e.nombre)
      })
    }
    const lider = Math.max(...this.entradas.map(e => e.pos))
    const avance = Math.min(Math.max(lider / distancia, 0), 1)
    const final = Math.max((avance - 0.6) / 0.4, 0) ** 2
    const catchUp = CATCH_UP + (CATCH_UP_FINAL - CATCH_UP) * final
    this.entradas.forEach(e => {
      const ola = Math.sin(this.clock * 2 * Math.PI / e.periodo + e.fase) * OLA * (1 - 0.5 * final)
      const impulso = this.impulso(e)
      const objetivo = e.punta + (lider - e.pos) * catchUp + ola + impulso + (Math.random() * 2 - 1) * SURGE
      e.speed += Math.min(Math.max(objetivo - e.speed, -MAX_FRENO), e.aceleracion * TICK + impulso)
      e.previa = e.pos
      e.reached = e.pos + e.speed * TICK
      e.pos = Math.min(e.reached, distancia)
    })
    this.clock += TICK
    this.race.tick(this.entradas.map(e => ({ id: e.id, position: Math.round(e.pos / distancia * 10000) / 100 })))
    const llegaron = this.entradas.filter(e => e.reached >= distancia)
    if (!llegaron.length) return
    clearInterval(this.reloj)
    const ganador = llegaron.reduce((a, b) => (b.reached > a.reached ? b : a))
    const p = this.datos.participants.find(x => x.id === ganador.id)
    document.dispatchEvent(new CustomEvent("carrera:termino"))
    this.anotar(`Ganó ${p.name}`)
    this.race.finish({ id: p.id, name: p.name, username: p.username }, 0)
  }

  impulso(e) {
    const t = this.clock - e.desde
    if (t < 0 || t >= IMPULSO_SEC) return 0
    return IMPULSO * Math.min(t / IMPULSO_RAMPA, 1) * Math.min((IMPULSO_SEC - t) / 0.5, 1)
  }

  lanzar(id, quien) {
    const e = this.entradas?.find(x => x.id === id)
    if (!e) return
    e.desde = this.clock
    this.race.encender(id, IMPULSO_SEC)
    this.anotar(`🔥 lanza ${quien}`)
  }

  // ── El registro: qué llega del teclado y de los dedos, y qué hace el poder con eso ───────────
  espiar() {
    this.tecla = event => {
      if (["ArrowLeft", "ArrowUp", "ArrowDown", "ArrowRight", " ", "a", "w", "s", "d"].includes(event.key)) {
        this.anotar(`tecla ${event.key === " " ? "Espacio" : event.key}${event.repeat ? " (repetida)" : ""}`)
      }
    }
    addEventListener("keydown", this.tecla, true)
    this.gesto = event => this.anotar(`toque fin (${event.changedTouches.length})`)
    addEventListener("touchend", this.gesto, true)
    const poder = this.element.querySelector(".poder")
    this.observador = new MutationObserver(() => {
      const estado = poder.dataset.estado
      if (estado !== this.estadoAnterior) this.anotar(`poder: ${estado}`)
      this.estadoAnterior = estado
    })
    this.observador.observe(poder, { attributes: true, attributeFilter: ["data-estado"] })
  }

  anotar(texto) {
    const t = this.reloj0 ? ((performance.now() - this.reloj0) / 1000).toFixed(1) : "–"
    const li = document.createElement("li")
    li.textContent = `${t} s · ${texto}`
    this.registroTarget.prepend(li)
    while (this.registroTarget.children.length > 14) this.registroTarget.lastChild.remove()
  }

  dificultad() {
    const d = Number(this.dificultadTarget.value)
    this.cada = d > 0 ? 1 / (LANZA_POR_SEGUNDO_MAX * d / 100) : 0
    this.dificultadTextoTarget.textContent = d > 0 ? `${d} · cada ~${Math.round(this.cada)} s` : "0 · no lanzan"
    try { localStorage.setItem(DIFICULTAD, String(d)) } catch {}
  }

  guiaDeNuevo() {
    try { localStorage.removeItem("clubrace:guia-flechas") } catch {}
    location.reload()
  }
}
