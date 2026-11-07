import { Controller } from "@hotwired/stimulus"

// Tragamonedas de un formulario: gira, deja el nombre en el campo y envía. El nombre lo elige el
// servidor si los carretes traen data-result (y ya completó el campo); si no, sale al azar acá.

// Filas que recorre cada carrete: el segundo gira más, para revelar el nombre de a poco.
const REEL_ROWS = [14, 26]
const ROWS_PER_SECOND = 16
const WINDUP = { ms: 120, px: 8 }
const BRAKE = { ms: 380, rows: 3, easing: "cubic-bezier(0.25, 0.47, 0.5, 1)" }
const REBOUND = { ms: 130, px: 10 }
const REVEAL_PAUSE = 1000
const VISIBLE_ROWS = 3

const sample = words => words[Math.floor(Math.random() * words.length)]

export default class extends Controller {
  static targets = ["machine", "display", "reel", "field", "button"]

  async spin(event) {
    event.preventDefault()
    if (this.spinning) return
    this.spinning = true

    this.buttonTarget.disabled = true
    this.buttonTarget.classList.replace("is-primary", "is-disabled")
    this.machineTarget.classList.add("spinning")
    this.displayTarget.textContent = "GIRANDO..."

    this.revealed = []
    const words = await Promise.all(this.reelTargets.map((reel, i) => this.spinReel(reel, i)))

    this.fieldTarget.value ||= words.join(" ")
    this.machineTarget.classList.remove("spinning")
    this.machineTarget.classList.add("won")
    setTimeout(() => this.element.submit(), REVEAL_PAUSE)
  }

  // Al volver con "atrás" el navegador restaura la página ya girada y con el botón deshabilitado.
  restore(event) {
    if (event.persisted) window.location.reload()
  }

  async spinReel(reel, index) {
    const strip = reel.querySelector(".slot-strip")
    const word = reel.dataset.result || sample(JSON.parse(reel.dataset.words))
    const rows = this.prependRows(strip, reel, word, REEL_ROWS[index])
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

    return word
  }

  // Agrega arriba las filas que van a pasar, sin palabras iguales a la vista, y devuelve cuántas son.
  prependRows(strip, reel, word, count) {
    const words = JSON.parse(reel.dataset.words)
    const pick = excluded => sample(words.filter(w => !excluded.includes(w)))

    // De abajo hacia arriba: arranca desde lo que ya se ve y termina con la palabra en la fila del medio.
    const rows = [...strip.children].slice(0, 2).map(cell => cell.textContent).reverse()
    const start = rows.length
    for (let i = 0; i < count - 2; i++) {
      const nearEnd = i >= count - 4 ? [word] : []
      rows.push(pick([...rows.slice(-2), ...nearEnd]))
    }
    rows.push(word)
    rows.push(pick(rows.slice(-2)))

    const added = rows.slice(start).reverse().map(text => {
      const cell = document.createElement("div")
      cell.className = "slot-cell"
      cell.textContent = text
      return cell
    })
    strip.prepend(...added)
    return added.length
  }

  reelStopped(reel, index, word) {
    reel.classList.remove("spinning")
    this.revealed[index] = word
    this.displayTarget.textContent = this.revealed.filter(Boolean).join(" ")
    this.machineTarget.animate(
      [{ transform: "translateY(0)" }, { transform: "translateY(3px)" }, { transform: "translateY(0)" }],
      { duration: 90 }
    )
  }
}
