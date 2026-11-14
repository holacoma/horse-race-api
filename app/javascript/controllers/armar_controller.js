import { Controller } from "@hotwired/stimulus"

// Armar una sala: según el tipo (carrera o travesía) se ven unos campos u otros y cambia el resumen.
export default class extends Controller {
  static targets = ["resumen", "boton"]
  static values = { tipo: String }

  connect() { this.mostrar(this.tipoValue || "carrera") }

  elegir(event) { this.mostrar(event.target.value) }

  mostrar(tipo) {
    this.element.querySelectorAll("[data-solo]").forEach(campo => {
      const ve = campo.dataset.solo === tipo
      campo.hidden = !ve
      campo.querySelectorAll("input, select").forEach(input => { input.disabled = !ve })
    })
    if (this.hasBotonTarget) this.botonTarget.value = tipo === "travesia" ? "Crear travesía" : "Crear sala"
    if (this.hasResumenTarget) {
      this.resumenTarget.textContent = tipo === "travesia"
        ? "Larga ahora · corren como stickers durante días · en los últimos minutos se pone intensa"
        : "Inicia cuando se llena, cuando tú la inicies o sola a la hora elegida"
    }
  }
}
