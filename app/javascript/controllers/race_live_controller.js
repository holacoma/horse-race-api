import { Controller } from "@hotwired/stimulus"

const GALLOP_FRAME_MS = 60
const RESULTS_DELAY_MS = 3000 // deja ver al ganador cruzar la meta y leer el cartel

export default class extends Controller {
  static values  = { raceId: Number, animalType: String, resultsUrl: String }
  static targets = ["countdown", "track", "winnerBanner"]

  connect() {
    this.frameIndex   = 0
    this.animInterval = null
    this.hueRotations = [0, 55, 110, 170, 220, 285]
    this.animalCfg = {
      horse:      { frameCount: 5, basePath: "/images/horse/frame_",      spriteStyle: "transform:scaleX(-1)" },
      guinea_pig: { frameCount: 4, basePath: "/images/guinea_pig/frame_", spriteStyle: "transform:scaleX(1)" }
    }
    this.setupWebSocket()
    this.renderTrack(this.loadParticipants())
    this.fitTrack()
    this.showCountdown()
  }

  // El alto de los carriles descuenta lo que la página ocupa arriba y abajo de la pista (ver race-live.css).
  fitTrack() {
    const track = this.trackTarget
    const above = track.getBoundingClientRect().top + window.scrollY
    const below = parseFloat(getComputedStyle(track.closest(".app-main")).paddingBottom)
    track.style.setProperty("--page-chrome", `${above + below}px`)
  }

  disconnect() {
    if (this.socket) this.socket.close()
    clearInterval(this.animInterval)
    clearTimeout(this.resultsTimeout)
  }

  loadParticipants() {
    const el = document.getElementById("race-participants-data")
    return el ? JSON.parse(el.textContent) : []
  }

  setupWebSocket() {
    const wsUrl = (location.protocol === "https:" ? "wss:" : "ws:") + "//" + location.host + "/cable"
    this.socket  = new WebSocket(wsUrl)
    const id     = JSON.stringify({ channel: "RaceChannel", race_id: this.raceIdValue })
    this.socket.onopen    = () => this.socket.send(JSON.stringify({ command: "subscribe", identifier: id }))
    this.socket.onmessage = (event) => {
      const msg = JSON.parse(event.data)
      if (msg.type === "welcome" || msg.type === "ping" || msg.type === "confirm_subscription") return
      const data = msg.message
      if (!data) return
      if (data.type === "progress") data.participants.forEach(p => this.moveHorse(p.id, p.position))
      if (data.type === "finished") this.onFinished(data.winner)
    }
  }

  renderTrack(participants) {
    const cfg = this.animalCfg[this.animalTypeValue] || this.animalCfg.horse
    this.trackTarget.style.setProperty("--lanes", participants.length)
    this.trackTarget.innerHTML = participants.map((p, i) => {
      const hue = this.hueRotations[i % this.hueRotations.length]
      return `<div class="lane-row">
        <span class="lane-label" title="${p.username} — ${p.name}"><b>${p.username}</b><small>${p.name}</small></span>
        <div class="track-wrap" id="wrap-${p.id}">
          <div class="track-bg"></div>
          <div class="horse-unit" id="horse-${p.id}">
            <img class="horse-sprite"
                 src="${cfg.basePath}1.png"
                 style="filter:hue-rotate(${hue}deg);${cfg.spriteStyle}">
          </div>
        </div>
      </div>`
    }).join("")
  }

  showCountdown() {
    const el    = this.countdownTarget
    el.style.display = "block"
    const steps = ["3", "2", "1", "🏁 GO!"]
    let i = 0
    el.textContent = steps[0]
    const iv = setInterval(() => {
      i++
      if (i < steps.length) {
        el.textContent = steps[i]
      } else {
        clearInterval(iv)
        el.style.display = "none"
        this.startAnimation()
      }
    }, 1000)
  }

  startAnimation() {
    if (this.animInterval) return
    const cfg = this.animalCfg[this.animalTypeValue] || this.animalCfg.horse
    this.animInterval = setInterval(() => {
      this.frameIndex = (this.frameIndex + 1) % cfg.frameCount
      // Cada caballo en su propio paso: sincronizados parecen un solo caballo repetido.
      document.querySelectorAll(".horse-sprite").forEach((el, i) => {
        el.src = cfg.basePath + ((this.frameIndex + i) % cfg.frameCount + 1) + ".png"
      })
    }, GALLOP_FRAME_MS)
  }

  moveHorse(horseId, position) {
    const unit = document.getElementById("horse-" + horseId)
    if (!unit) return
    // Scale positions 0-100 to 0-85% of track so pos=100 lands exactly at the finish stripe (right:15%)
    unit.style.left = `calc(${(position * 0.85).toFixed(2)}% - ${(position / 100).toFixed(4)} * var(--horse-w))`
  }

  onFinished(winner) {
    // Banner appears exactly as winner's nose crosses the finish stripe (pos 100 = finish line)
    const banner = this.winnerBannerTarget
    banner.textContent = `🏆 Ganador: ${winner.username} (${winner.name})`
    banner.style.display = "block"
    banner.style.animation = "pop 0.3s ease-out"

    // Coast winner through the remaining 15% of track, then stop
    const winnerUnit = document.getElementById("horse-" + winner.id)
    if (winnerUnit) {
      winnerUnit.style.transition = "left 1.2s ease-out"
      winnerUnit.style.left = "calc(100% - var(--horse-w))"
    }
    setTimeout(() => {
      clearInterval(this.animInterval)
      this.animInterval = null
    }, 1400)
    this.resultsTimeout = setTimeout(() => window.location.assign(this.resultsUrlValue), RESULTS_DELAY_MS)
  }
}
