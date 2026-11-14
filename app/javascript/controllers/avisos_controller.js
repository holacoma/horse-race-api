import { Controller } from "@hotwired/stimulus"
import { sonar } from "sonidos"

// Avisos para todos los que tienen el juego abierto: una carrera a punto de largar o una travesía que se pone
// intensa. Se ven como un cartel arriba y, si diste permiso y estás en otra pestaña, como notificación del sistema.
export default class extends Controller {
  static targets = ["permiso"]

  connect() {
    this.conectar()
    if (this.hasPermisoTarget) this.permisoTarget.hidden = !("Notification" in window) || Notification.permission !== "default"
  }

  disconnect() {
    this.cerrado = true
    this.socket?.close()
  }

  conectar() {
    const socket = new WebSocket((location.protocol === "https:" ? "wss:" : "ws:") + "//" + location.host + "/cable")
    this.socket = socket
    const identifier = JSON.stringify({ channel: "AvisosChannel" })
    socket.onopen = () => socket.send(JSON.stringify({ command: "subscribe", identifier }))
    socket.onmessage = event => {
      const msg = JSON.parse(event.data).message
      if (msg?.type === "por_empezar") this.mostrar(msg)
    }
    socket.onclose = () => { if (!this.cerrado) setTimeout(() => this.conectar(), 5000) }
  }

  // Si ya estás en esa sala, no hace falta avisarte.
  mostrar({ titulo, cuerpo, url }) {
    if (location.pathname === url) return
    if (document.hidden && "Notification" in window && Notification.permission === "granted") {
      const n = new Notification(`Club Race · ${titulo}`, { body: cuerpo, tag: url })
      n.onclick = () => { window.focus(); location.assign(url) }
      return
    }
    const cartel = document.createElement("a")
    cartel.className = "aviso-carrera"
    cartel.href = url
    cartel.innerHTML = "<b></b><span></span>"
    cartel.querySelector("b").textContent = titulo
    cartel.querySelector("span").textContent = cuerpo
    document.body.append(cartel)
    sonar("moneda")
    setTimeout(() => cartel.remove(), 9000)
  }

  pedirPermiso() {
    Notification.requestPermission().then(() => {
      if (this.hasPermisoTarget) this.permisoTarget.hidden = true
    })
  }
}
