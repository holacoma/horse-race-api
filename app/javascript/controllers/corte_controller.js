import { Controller } from "@hotwired/stimulus"
import { sonar } from "sonidos"

// Ir a una pantalla del lado dark (la ficha de un caballo): el corte carmesí de la largada cruza la pantalla y,
// tapada, se cambia de página. Del otro lado el corte termina de cruzar (ficha.css). Nunca hay un estado intermedio.
export default class extends Controller {
  ir(event) {
    if (event.metaKey || event.ctrlKey || event.shiftKey || event.button > 0) return
    event.preventDefault()
    const destino = event.currentTarget.href
    const corte = document.createElement("div")
    corte.className = "corte-va"
    corte.setAttribute("aria-hidden", "true")
    document.body.append(corte)
    sonar("riff")
    setTimeout(() => { window.location.assign(destino) }, 380)
  }
}
