import { Controller } from "@hotwired/stimulus"

// Filtra una grilla por nombre mientras se escribe (elegir favorito).
export default class extends Controller {
  static targets = ["item", "vacio"]

  filtrar(event) {
    const texto = event.target.value.trim().toLowerCase()
    let visibles = 0
    this.itemTargets.forEach(item => {
      const ve = !texto || item.dataset.nombre.includes(texto)
      item.hidden = !ve
      if (ve) visibles++
    })
    if (this.hasVacioTarget) this.vacioTarget.hidden = visibles > 0
  }
}
