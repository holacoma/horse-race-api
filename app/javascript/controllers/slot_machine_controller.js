import { Controller } from "@hotwired/stimulus"
import { sonar } from "sonidos"

// Tragamonedas de un formulario. Cada carrete se gira de a una palabra (flechas o rueda del mouse) para elegir
// el nombre; la palanca sortea sin enviar. Al enviar: si elegiste o sorteaste, entra con ese nombre; si no, gira y
// entra con lo que salga. Si los carretes traen data-result, el servidor ya eligió el nombre y completó el campo.

// Filas que recorre cada carrete: el segundo gira más, para revelar el nombre de a poco.
const REEL_ROWS = [14, 26]
const ROWS_PER_SECOND = 16
const WINDUP = { ms: 120, px: 8 }
const BRAKE = { ms: 380, rows: 3, easing: "cubic-bezier(0.25, 0.47, 0.5, 1)" }
const REBOUND = { ms: 130, px: 10 }
const REVEAL_PAUSE = 1000
const CHOSEN_PAUSE = 450
const NUDGE = { ms: 170, easing: "cubic-bezier(0.3, 1.5, 0.5, 1)" }
const WHEEL_GAP_MS = 110

const sample = words => words[Math.floor(Math.random() * words.length)]
const cell = text => Object.assign(document.createElement("div"), { className: "slot-cell", textContent: text })
// Igual que String#parameterize de Rails para estas palabras: sin tildes, minúsculas y guiones.
const slugify = text => text.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase()
  .replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "")

export default class extends Controller {
  static targets = ["machine", "display", "reel", "field", "button"]
  static values = { format: { type: String, default: "text" } }

  connect() {
    this.touched = false
    this.nudges = []
    this.index = this.reelTargets.map(reel => {
      const middle = reel.querySelector(".slot-strip").children[1]?.textContent.trim()
      return Math.max(0, this.words(reel).indexOf(middle))
    })
  }

  words(reel) { return JSON.parse(reel.dataset.words) }
  current() { return this.reelTargets.map((reel, i) => this.words(reel)[this.index[i]]) }
  formatted() {
    const name = this.current().join(" ")
    return this.formatValue === "slug" ? slugify(name) : name
  }

  nudge({ params: { reel, step } }) { this.turn(reel, step) }

  wheel(event) {
    event.preventDefault()
    const now = performance.now()
    if (now - (this.lastWheel || 0) < WHEEL_GAP_MS) return
    this.lastWheel = now
    this.turn(this.reelTargets.indexOf(event.currentTarget), Math.sign(event.deltaY) || 1)
  }

  // Corre un carrete una palabra: la tira trae dos de cada lado y se desliza una fila, con un rebote corto.
  turn(r, step) {
    if (this.busy || r < 0) return
    const reel = this.reelTargets[r]
    const words = this.words(reel)
    const n = words.length
    const i = (this.index[r] + step + n) % n
    const at = d => words[(((i + d) % n) + n) % n]
    const strip = reel.querySelector(".slot-strip")
    const row = strip.firstElementChild.offsetHeight
    this.index[r] = i

    this.nudges[r]?.cancel()
    strip.replaceChildren(...[-2, -1, 0, 1, 2].map(d => cell(at(d))))
    const animation = strip.animate(
      [{ transform: `translateY(${(step - 1) * row}px)` }, { transform: `translateY(${-row}px)` }],
      { duration: NUDGE.ms, easing: NUDGE.easing }
    )
    this.nudges[r] = animation
    sonar("tic")
    animation.finished.then(() => strip.replaceChildren(...[-1, 0, 1].map(d => cell(at(d))))).catch(() => {})
    this.chose()
  }

  chose() {
    this.touched = true
    this.displayTarget.textContent = this.current().join(" ")
  }

  // La palanca sortea un nombre y lo deja elegido; no envía.
  async shuffle() {
    if (this.busy) return
    await this.roll(true)
    this.chose()
    this.machineTarget.classList.add("won")
    sonar("premio")
  }

  async spin(event) {
    event.preventDefault()
    if (this.busy) return
    const chosen = this.touched
    if (!chosen) await this.roll(false)
    if (chosen || !this.fieldTarget.value) this.fieldTarget.value = this.formatted()

    this.busy = true
    this.buttonTarget.disabled = true
    this.buttonTarget.classList.replace("is-primary", "is-disabled")
    this.machineTarget.classList.add("won")
    sonar("premio")
    setTimeout(() => this.element.submit(), chosen ? CHOSEN_PAUSE : REVEAL_PAUSE)
  }

  // Al volver con "atrás" el navegador restaura la página ya girada y con el botón deshabilitado.
  restore(event) {
    if (event.persisted) window.location.reload()
  }

  async roll(random) {
    this.busy = true
    this.machineTarget.classList.remove("won")
    this.machineTarget.classList.add("spinning")
    this.displayTarget.textContent = "GIRANDO..."
    this.revealed = []
    await Promise.all(this.reelTargets.map((reel, i) => this.spinReel(reel, i, random)))
    this.machineTarget.classList.remove("spinning")
    this.busy = false
  }

  async spinReel(reel, index, random) {
    const strip = reel.querySelector(".slot-strip")
    const words = this.words(reel)
    const word = (!random && reel.dataset.result) || sample(words)
    const rows = this.prependRows(strip, words, word, REEL_ROWS[index % REEL_ROWS.length])
    const rowHeight = strip.firstElementChild.offsetHeight
    const distance = rowHeight * rows

    const spinMs = ((rows - BRAKE.rows) / ROWS_PER_SECOND) * 1000
    const stopAt = WINDUP.ms + spinMs + BRAKE.ms
    const total = stopAt + REBOUND.ms
    const translate = y => `translateY(${y}px)`

    reel.classList.add("spinning")
    setTimeout(() => this.reelStopped(reel, index, word), stopAt)

    // Cae hasta y = 0, que es donde queda la tira sin transformar.
    await strip.animate([
      { transform: translate(-distance), offset: 0, easing: "ease-out" },
      { transform: translate(-distance - WINDUP.px), offset: WINDUP.ms / total, easing: "linear" },
      { transform: translate(-BRAKE.rows * rowHeight), offset: (WINDUP.ms + spinMs) / total, easing: BRAKE.easing },
      { transform: translate(REBOUND.px), offset: stopAt / total, easing: "ease-in-out" },
      { transform: translate(0), offset: 1 }
    ], { duration: total }).finished

    // Queda con sus vecinas de la lista, para seguir girándolo de a una palabra.
    const n = words.length
    const i = Math.max(0, words.indexOf(word))
    this.index[index] = i
    strip.replaceChildren(...[-1, 0, 1].map(d => cell(words[(((i + d) % n) + n) % n])))
    return word
  }

  // Agrega arriba las filas que van a pasar, sin palabras iguales a la vista, y devuelve cuántas son.
  prependRows(strip, words, word, count) {
    const pick = excluded => sample(words.filter(w => !excluded.includes(w)))

    // De abajo hacia arriba: arranca desde lo que ya se ve y termina con la palabra en la fila del medio.
    const rows = [...strip.children].slice(0, 2).map(c => c.textContent).reverse()
    const start = rows.length
    for (let i = 0; i < count - 2; i++) {
      const nearEnd = i >= count - 4 ? [word] : []
      rows.push(pick([...rows.slice(-2), ...nearEnd]))
    }
    rows.push(word)
    rows.push(pick(rows.slice(-2)))

    const added = rows.slice(start).reverse().map(cell)
    strip.prepend(...added)
    return added.length
  }

  reelStopped(reel, index, word) {
    reel.classList.remove("spinning")
    sonar("tic")
    this.revealed[index] = word
    this.displayTarget.textContent = this.revealed.filter(Boolean).join(" ")
    this.machineTarget.animate(
      [{ transform: "translateY(0)" }, { transform: "translateY(3px)" }, { transform: "translateY(0)" }],
      { duration: 90 }
    )
  }
}
