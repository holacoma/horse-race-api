import { Controller } from "@hotwired/stimulus"
import { hayMusica, activarMusica } from "sonidos"

// El botón 🎵 de la barra de arriba: la música de las carreras, sí o no. Queda guardado en este navegador.
export default class extends Controller {
  static targets = ["boton"]

  connect() { this.pintar() }

  alternar() {
    activarMusica(!hayMusica())
    this.pintar()
  }

  pintar() {
    const si = hayMusica()
    this.botonTarget.textContent = si ? "🎵" : "🔇"
    this.botonTarget.setAttribute("aria-pressed", si)
    this.botonTarget.title = si ? "Música de las carreras: sí (toca para apagarla)" : "Música de las carreras: no (toca para encenderla)"
  }
}
