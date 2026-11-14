import { Controller } from "@hotwired/stimulus"

// Cuentas regresivas en vivo («larga en 1:20»): cada reloj trae la hora a la que llega a cero (segundos Unix).
export default class extends Controller {
  static targets = ["reloj"]

  connect() {
    this.tick()
    this.intervalo = setInterval(() => this.tick(), 1000)
  }

  disconnect() { clearInterval(this.intervalo) }

  tick() {
    const ahora = Date.now() / 1000
    this.relojTargets.forEach(reloj => {
      const quedan = Math.max(0, Math.round(Number(reloj.dataset.hasta) - ahora))
      const h = Math.floor(quedan / 3600), m = Math.floor((quedan % 3600) / 60), s = quedan % 60
      const texto = h > 0 ? `${h} h ${String(m).padStart(2, "0")} min` : `${m}:${String(s).padStart(2, "0")}`
      reloj.textContent = `${reloj.dataset.prefijo} ${texto}`
    })
  }
}
