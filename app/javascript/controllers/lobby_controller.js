import { Controller } from "@hotwired/stimulus"

// Las salas abiertas del inicio en vivo: aparecen las nuevas, se actualizan los lugares y se van las que arrancan.
// El servidor manda la tarjeta ya armada (races/_sala); aquí solo se ajusta al saldo de quien mira.
export default class extends Controller {
  static targets = ["salas", "vacio"]
  static MAXIMO = 8

  connect() {
    this.cerrado = false
    this.conectar()
  }

  disconnect() {
    this.cerrado = true
    this.socket?.close()
  }

  conectar() {
    const socket = new WebSocket((location.protocol === "https:" ? "wss:" : "ws:") + "//" + location.host + "/cable")
    this.socket = socket
    const identifier = JSON.stringify({ channel: "LobbyChannel" })
    socket.onopen = () => socket.send(JSON.stringify({ command: "subscribe", identifier }))
    socket.onmessage = event => {
      const msg = JSON.parse(event.data).message
      if (msg?.type === "sala") this.poner(msg)
      if (msg?.type === "sala_cerrada") this.quitar(msg.slug)
    }
    socket.onclose = () => { if (!this.cerrado) setTimeout(() => this.conectar(), 3000) }
  }

  tarjeta(slug) {
    return this.salasTarget.querySelector(`[data-slug="${CSS.escape(slug)}"]`)
  }

  poner({ slug, html }) {
    const plantilla = document.createElement("template")
    plantilla.innerHTML = html.trim()
    const nueva = plantilla.content.firstElementChild
    this.ajustar(nueva)
    const actual = this.tarjeta(slug)
    if (actual) {
      actual.replaceWith(nueva)
    } else {
      nueva.classList.add("recien-llegada")
      this.salasTarget.prepend(nueva)
      while (this.salasTarget.children.length > this.constructor.MAXIMO) this.salasTarget.lastElementChild.remove()
    }
    this.vaciar()
  }

  quitar(slug) {
    this.tarjeta(slug)?.remove()
    this.vaciar()
  }

  vaciar() {
    this.vacioTarget.hidden = this.salasTarget.children.length > 0
  }

  ajustar(tarjeta) {
    const saldo = Number(this.salasTarget.dataset.saldo)
    const alcanza = Number(tarjeta.dataset.bet) <= saldo
    tarjeta.classList.toggle("sin-saldo", !alcanza)
    tarjeta.querySelector(".room-unirse").textContent = alcanza ? "Unirse" : "No te alcanza"
  }
}
