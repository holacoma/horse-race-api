import { Controller } from "@hotwired/stimulus"
import { sonarCuandoSePueda } from "sonidos"

// La ficha de un caballo: al llegar suena el riff de guitarra (apenas el navegador deje sonar).
export default class extends Controller {
  connect() {
    sonarCuandoSePueda("riff", 2500)
  }
}
