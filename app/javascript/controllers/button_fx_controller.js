import { Controller } from "@hotwired/stimulus"

// Lo que dura la animación de clic antes de cambiar de página.
const HOLD_MS = 320
const CLEANUP_MS = 1500

// Dispara la animación de clic de cualquier [data-fx] (estilos en public/css/buttons.css).
// Los enlaces y los [data-fx-hold] esperan a que se vea antes de navegar.
export default class extends Controller {
  play(event) {
    const button = event.target.closest("[data-fx]")
    if (!button || button.disabled || button.classList.contains("taken")) return

    const newTab = event.ctrlKey || event.metaKey || event.shiftKey
    const holds = !newTab && button.matches("a[href], [data-fx-hold]")
    if (holds) event.preventDefault()
    if (holds && this.holding) return

    this.restartAnimation(button)
    if (holds) this.navigateAfterHold(button)
    else button.addEventListener("animationend", () => button.classList.remove("fx-click"), { once: true })
  }

  restartAnimation(button) {
    button.classList.remove("fx-click")
    void button.offsetWidth
    button.classList.add("fx-click")
  }

  navigateAfterHold(button) {
    this.holding = true
    setTimeout(() => {
      this.holding = false
      if (button.tagName === "A") window.location.assign(button.href)
      else button.form.requestSubmit(button)
      // Si la página sigue acá (formulario inválido o "atrás"), el botón vuelve a su estado normal.
      setTimeout(() => button.classList.remove("fx-click"), CLEANUP_MS)
    }, HOLD_MS)
  }
}
