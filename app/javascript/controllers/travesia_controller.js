import { Controller } from "@hotwired/stimulus"

// Travesía en curso: cada tanto pide las posiciones al servidor, actualiza la tabla y la barra, y le pasa los
// kilómetros a la escena 3D para que los chibis se separen igual que en la tabla.
export default class extends Controller {
  static targets = ["lista", "barra"]
  static values = { url: String }

  connect() {
    this.pedir()
    this.intervalo = setInterval(() => this.pedir(), 20000)
  }

  disconnect() { clearInterval(this.intervalo) }

  async pedir() {
    const r = await fetch(this.urlValue, { headers: { Accept: "application/json" } }).catch(() => null)
    if (!r?.ok) return
    const estado = await r.json()
    if (estado.status !== "pending") return
    window.__sala?.race?.setTravesia(estado.posiciones)
    if (this.hasBarraTarget) this.barraTarget.style.width = `${(estado.avance * 100).toFixed(1)}%`
    if (!this.hasListaTarget) return
    const filas = new Map([...this.listaTarget.children].map(li => [Number(li.dataset.id), li]))
    const lider = estado.posiciones[0]?.km ?? 0
    estado.posiciones.forEach((p, i) => {
      const li = filas.get(Number(p.id))
      if (!li) return
      li.querySelector("b").textContent = `${i + 1}.º`
      li.lastElementChild.textContent = i === 0 ? "líder" : `a ${(lider - p.km).toFixed(1).replace(".", ",")} km`
      this.listaTarget.append(li)
    })
  }
}
