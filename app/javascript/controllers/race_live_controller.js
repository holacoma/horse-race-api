import { Controller } from "@hotwired/stimulus"

export default class extends Controller {
  static values  = { raceId: Number, animalType: String }
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
    this.showCountdown()
  }

  disconnect() {
    if (this.socket) this.socket.close()
    clearInterval(this.animInterval)
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
    this.trackTarget.innerHTML = participants.map((p, i) => {
      const hue = this.hueRotations[i % this.hueRotations.length]
      return `<div class="lane-row">
        <span class="lane-label" title="${p.username} — ${p.name}">${p.username}</span>
        <div class="track-wrap" id="wrap-${p.id}">
          <div class="track-bg"></div>
          <img class="horse-sprite" id="horse-${p.id}"
               src="${cfg.basePath}1.png"
               style="filter:hue-rotate(${hue}deg);${cfg.spriteStyle}">
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
      document.querySelectorAll(".horse-sprite").forEach(el => {
        el.src = cfg.basePath + (this.frameIndex + 1) + ".png"
      })
    }, 110)
  }

  moveHorse(horseId, position) {
    const img = document.getElementById("horse-" + horseId)
    if (!img) return
    // calc(P% - P*1.64px) maps 0→left:0, 100→left:calc(100%-164px)
    // without reading offsetWidth at all
    img.style.left = `calc(${position}% - ${(position * 1.64).toFixed(2)}px)`
  }

  onFinished(winner) {
    clearInterval(this.animInterval)
    this.animInterval = null
    const banner = this.winnerBannerTarget
    banner.textContent = `🏆 Ganador: ${winner.username} (${winner.name})`
    banner.style.display = "block"
    banner.style.animation = "pop 0.3s ease-out"
  }
}
