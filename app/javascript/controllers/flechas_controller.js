import { Controller } from "@hotwired/stimulus"
import { sonar } from "sonidos"

// El poder de la carrera intensa.
// 1. A la izquierda, tres cartas fijas (corta, media, larga) y un resaltado que pasa de una a otra cada 0,2 s, siempre
//    en el mismo orden: se puede calcular. La barra espaciadora (en el teléfono, el botón del centro) elige.
//    Se elige la carta que estaba resaltada un instante antes (COMPENSA_MS): lo que tarda una persona en reaccionar.
//    Sin eso, con 250 ms de reacción salía siempre la siguiente (banco de pruebas, 0 de 12).
// 2. Recién elegida se ven sus flechas; en orden, cargan el poder: teclado (flechas o WASD) o, en el teléfono,
//    deslizando el dedo. Un error reinicia la carta.
// 3. Cargado, la barra espaciadora (o el botón) lo lanza: el caballo arde y acelera.
// La carta decide cuánto esperar para lanzar el siguiente: la corta, mucho; la larga, casi nada. Mientras se espera
// se puede elegir y cargar la próxima, pero no lanzarla. La guía aparece solo en la primera carrera.
const FLECHAS = ["izquierda", "arriba", "abajo", "derecha"]
const SIMBOLO = { izquierda: "←", arriba: "↑", abajo: "↓", derecha: "→" }
const TECLA = { ArrowLeft: "izquierda", ArrowUp: "arriba", ArrowDown: "abajo", ArrowRight: "derecha", a: "izquierda", w: "arriba", s: "abajo", d: "derecha" }
const DESLIZA = { izquierda: "a la izquierda", arriba: "hacia arriba", abajo: "hacia abajo", derecha: "a la derecha" }
// Igual que ImpulsosController::CARTAS.
const CARTAS = [
  { tipo: "corta", nombre: "Corta", flechas: 3, espera: 12 },
  { tipo: "media", nombre: "Media", flechas: 5, espera: 6 },
  { tipo: "larga", nombre: "Larga", flechas: 8, espera: 1 }
]
const ROTA_MS = 200
const COMPENSA_MS = 200
const MIN_DESLIZ = 28
const GUIA_VISTA = "clubrace:guia-flechas"
const guiaVista = () => { try { return localStorage.getItem(GUIA_VISTA) === "1" } catch { return false } }
const marcarGuiaVista = () => { try { localStorage.setItem(GUIA_VISTA, "1") } catch {} }
const azar = n => Array.from({ length: n }, () => FLECHAS[Math.floor(Math.random() * 4)])

export default class extends Controller {
  static targets = ["cartas", "carga", "accion", "accionTexto", "espera", "guia", "guiaTexto", "gesto", "boton", "grito"]
  static values = { url: String, prueba: Boolean }

  connect() {
    this.tactil = matchMedia("(pointer: coarse)").matches || "ontouchstart" in window
    this.element.classList.toggle("tactil", this.tactil)
    this.alIniciar = event => this.activar(event.detail?.mio)
    this.alTerminar = () => this.desactivar()
    document.addEventListener("carrera:inicio", this.alIniciar)
    document.addEventListener("carrera:termino", this.alTerminar)
    this.teclas = event => {
      if (this.element.hidden) return
      if (event.code === "Space") { event.preventDefault(); if (!event.repeat) this.espacio(); return }
      const flecha = TECLA[event.key]
      if (!flecha) return
      event.preventDefault()
      if (!event.repeat) this.recibir(flecha)
    }
    this.toque = event => { const t = event.changedTouches[0]; this.inicio = { x: t.clientX, y: t.clientY } }
    this.suelta = event => {
      if (!this.inicio) return
      const t = event.changedTouches[0]
      const dx = t.clientX - this.inicio.x, dy = t.clientY - this.inicio.y
      this.inicio = null
      if (Math.max(Math.abs(dx), Math.abs(dy)) < MIN_DESLIZ) return
      this.recibir(Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? "derecha" : "izquierda") : (dy > 0 ? "abajo" : "arriba"))
    }
    this.sinScroll = event => { if (!this.element.hidden && !event.target.closest(".poder-boton")) event.preventDefault() }
  }

  disconnect() {
    document.removeEventListener("carrera:inicio", this.alIniciar)
    document.removeEventListener("carrera:termino", this.alTerminar)
    this.desactivar()
  }

  activar(mio) {
    if (!mio || this.activo) return
    this.activo = true
    this.conGuia = !guiaVista()
    this.listoDesde = 0 // hasta cuándo hay que esperar para lanzar (ms)
    this.element.hidden = false
    addEventListener("keydown", this.teclas)
    addEventListener("touchstart", this.toque, { passive: true })
    addEventListener("touchend", this.suelta, { passive: true })
    addEventListener("touchmove", this.sinScroll, { passive: false })
    this.rotar()
  }

  desactivar() {
    this.activo = false
    this.element.hidden = true
    clearInterval(this.rueda)
    clearInterval(this.cuentaEspera)
    removeEventListener("keydown", this.teclas)
    removeEventListener("touchstart", this.toque)
    removeEventListener("touchend", this.suelta)
    removeEventListener("touchmove", this.sinScroll)
  }

  // 1. El resaltado pasa de carta en carta; cada una con su combinación ya sorteada (se ve al elegirla).
  rotar() {
    this.estado = "eligiendo"
    this.mazo = CARTAS.map(c => ({ ...c, combo: azar(c.flechas) }))
    this.frente = Math.floor(Math.random() * 3)
    this.historial = [{ t: performance.now(), i: this.frente }]
    this.paso = 0
    this.elegida = null
    clearInterval(this.rueda)
    this.rueda = setInterval(() => {
      this.frente = (this.frente + 1) % 3
      this.historial.push({ t: performance.now(), i: this.frente })
      if (this.historial.length > 4) this.historial.shift()
      this.marcarFrente()
    }, ROTA_MS)
    this.pintar()
  }

  // La carta que estaba resaltada en el instante t.
  frenteEn(t) {
    let i = this.historial[0].i
    for (const h of this.historial) if (h.t <= t) i = h.i
    return i
  }

  // La barra espaciadora (o el botón del centro): elige la carta, o lanza el poder si está cargado.
  espacio() {
    if (!this.activo) return
    if (this.estado === "eligiendo") {
      clearInterval(this.rueda)
      this.frente = this.frenteEn(performance.now() - COMPENSA_MS)
      this.elegida = this.mazo[this.frente]
      this.estado = "cargando"
      this.paso = 0
      sonar("click")
    } else if (this.estado === "cargado") {
      if (performance.now() < this.listoDesde) return this.sacudir()
      this.lanzar()
      return
    }
    this.pintar()
  }

  // 2. Las flechas de la carta elegida cargan el poder.
  recibir(flecha) {
    if (this.estado !== "cargando") return
    if (flecha === this.elegida.combo[this.paso]) {
      this.paso++
      sonar("tic")
      if (this.paso === this.elegida.combo.length) {
        this.estado = "cargado"
        sonar("premio")
      }
    } else {
      this.paso = 0
      this.sacudir()
    }
    this.pintar()
  }

  // 3. Lanzar: lo avisa el servidor a todos (la escena hace arder al caballo con el mensaje «impulso»).
  async lanzar() {
    const carta = this.elegida
    this.estado = "lanzando"
    marcarGuiaVista()
    this.conGuia = false
    this.gritoTarget.classList.remove("ve"); void this.gritoTarget.offsetWidth
    this.gritoTarget.classList.add("ve")
    if (this.pruebaValue) {
      // Banco de pruebas: sin servidor, la página hace arder al caballo.
      this.dispatch("lanzado", { prefix: "poder", detail: { flechas: carta.flechas } })
    } else {
      const token = document.querySelector('meta[name="csrf-token"]')?.content
      await fetch(this.urlValue, {
        method: "POST", headers: { "Content-Type": "application/json", "X-CSRF-Token": token, Accept: "application/json" },
        body: JSON.stringify({ flechas: carta.flechas })
      }).catch(() => null)
    }
    this.listoDesde = performance.now() + carta.espera * 1000
    const barra = this.esperaTarget.firstElementChild
    this.esperaTarget.hidden = false
    barra.style.transition = "none"; barra.style.width = "100%"; void barra.offsetWidth
    barra.style.transition = `width ${carta.espera}s linear`; barra.style.width = "0%"
    // Mientras se espera, el botón dice cuánto falta (y al terminar, se vuelve a pintar).
    clearInterval(this.cuentaEspera)
    this.cuentaEspera = setInterval(() => {
      if (performance.now() >= this.listoDesde) { clearInterval(this.cuentaEspera); this.esperaTarget.hidden = true }
      this.pintar(false)
    }, 250)
    if (this.activo) this.rotar()
  }

  sacudir() {
    this.element.classList.remove("error"); void this.element.offsetWidth
    this.element.classList.add("error")
  }

  pintar(conCartas = true) {
    if (conCartas) this.pintarCartas()
    const falta = Math.ceil((this.listoDesde - performance.now()) / 1000)
    const esperando = falta > 0
    const total = this.elegida ? this.elegida.combo.length : 1
    this.cargaTarget.style.height = `${this.estado === "cargando" || this.estado === "cargado" ? (this.paso / total) * 100 : 0}%`
    this.element.dataset.estado = this.estado
    const texto = this.estado === "eligiendo" ? "elige una carta"
      : this.estado === "cargando" ? "carga el poder"
      : esperando ? `lanzas en ${falta} s` : "¡lanza!"
    this.accionTextoTarget.textContent = texto
    this.botonTarget.textContent = this.estado === "eligiendo" ? "Elegir"
      : this.estado === "cargado" ? (esperando ? `En ${falta} s` : "¡Lanzar!") : "Desliza"
    this.botonTarget.disabled = this.estado === "cargando" || this.estado === "lanzando"
    this.element.classList.toggle("listo", this.estado === "cargado" && !esperando)
    this.pintarGuia()
  }

  // Las tres cartas siempre en el mismo lugar. Eligiendo, cada una muestra su largo; elegida, sus flechas.
  pintarCartas() {
    const eligiendo = this.estado === "eligiendo"
    this.cartasTarget.innerHTML = this.mazo.map((c, i) => {
      const lugar = eligiendo ? (i === this.frente ? "frente" : "") : (c === this.elegida ? "elegida" : "fuera")
      const largo = `<span class="largo">${"<i></i>".repeat(c.flechas)}<b>${c.flechas}</b></span>`
      const flechas = c === this.elegida
        ? `<div class="flechas">${c.combo.map((f, j) => {
            const clase = j < this.paso ? "hecha" : this.estado === "cargando" && j === this.paso ? "actual" : ""
            return `<kbd class="${clase}">${SIMBOLO[f]}</kbd>`
          }).join("")}</div>`
        : largo
      return `<div class="poder-carta ${c.tipo} ${lugar}" data-i="${i}"><span class="tipo">${c.nombre}</span>${flechas}<span class="despues">espera <b>${c.espera} s</b></span></div>`
    }).join("")
  }

  // Solo mueve el resaltado (sin volver a armar las cartas): cada 0,2 s.
  marcarFrente() {
    this.cartasTarget.querySelectorAll(".poder-carta").forEach(el => el.classList.toggle("frente", Number(el.dataset.i) === this.frente))
  }

  // La guía (solo la primera carrera): qué hacer ahora, bien marcado.
  pintarGuia() {
    const flecha = this.estado === "cargando" ? this.elegida.combo[this.paso] : null
    this.guiaTarget.hidden = !this.conGuia
    this.element.classList.toggle("aprendiendo", !!this.conGuia)
    if (this.conGuia) {
      this.guiaTextoTarget.textContent = this.estado === "eligiendo"
        ? (this.tactil ? "Toca el botón de abajo para elegir la carta resaltada" : "Presiona ESPACIO para elegir la carta resaltada")
        : this.estado === "cargando"
          ? (this.tactil ? `Desliza el dedo ${DESLIZA[flecha]}, en cualquier parte de la pantalla` : `Presiona la flecha ${SIMBOLO[flecha]} del teclado`)
          : (this.tactil ? "¡Cargado! Toca el botón de abajo para lanzarlo" : "¡Cargado! Presiona ESPACIO para lanzarlo")
    }
    this.gestoTarget.dataset.flecha = flecha || ""
    this.gestoTarget.hidden = !this.tactil || !this.conGuia || !flecha
  }
}
