import { Controller } from "@hotwired/stimulus"

export default class extends Controller {
  static targets = ["btnNew", "btnStart", "statusText", "track", "winnerBanner",
                     "animalSelector", "controls", "horsePicker", "pickerCards",
                     "timerFill", "timerText"]

  connect() {
    this.hueRotations = [0, 55, 110, 170, 220, 285]
    this.frameRateMs = 110
    this.frameIndex = 0
    this.animInterval = null
    this.raceId = null
    this.socket = null
    this.selectedAnimal = "guinea_pig"
    this.myHorse = null
    this.pickerTimer = null

    this.animals = {
      horse: {
        label: "Caballos", emoji: "🐴",
        frameCount: 5,
        basePath: "/images/horse/frame_",
        createElement: (id, hue) =>
          `<img class="horse-sprite" id="horse-${id}" src="/images/horse/frame_1.png" style="filter: hue-rotate(${hue}deg)">`,
        updateFrame: (el, i) => { el.src = `/images/horse/frame_${i + 1}.png` }
      },
      guinea_pig: {
        label: "Cobayas", emoji: "🐹",
        frameCount: 4,
        basePath: "/images/guinea_pig/frame_",
        createElement: (id, hue) =>
          `<img class="horse-sprite" id="horse-${id}" src="/images/guinea_pig/frame_1.png" style="transform: scaleX(1); height: auto; filter: hue-rotate(${hue}deg)">`,
        updateFrame: (el, i) => { el.src = `/images/guinea_pig/frame_${i + 1}.png` }
      }
    }

    this.horseCatalog = [
      { id: 1, name: "Thunder" }, { id: 2, name: "Lightning" },
      { id: 3, name: "Storm" },   { id: 4, name: "Blaze" },
      { id: 5, name: "Shadow" },  { id: 6, name: "Spirit" }
    ]

    this.setupAnimalSelector()
    this.renderPicker()
  }

  disconnect() {
    if (this.socket) this.socket.close()
    if (this.animInterval) clearInterval(this.animInterval)
    if (this.pickerTimer) clearInterval(this.pickerTimer)
  }

  setupAnimalSelector() {
    this.animalSelectorTarget.innerHTML = `<select id="animal-select">
      ${Object.keys(this.animals).map(key => {
        const a = this.animals[key]
        return `<option value="${key}">${a.emoji} ${a.label}</option>`
      }).join("")}
    </select>`
    const select = document.getElementById("animal-select")
    select.value = this.selectedAnimal
    select.addEventListener("change", () => { this.selectedAnimal = select.value })
  }

  renderPicker() {
    const shuffled = this.horseCatalog.slice().sort(() => Math.random() - 0.5)
    const horses = shuffled.slice(0, 4)
    const cfg = this.animals[this.selectedAnimal]
    this.pickerCardsTarget.innerHTML = horses.map((h, i) => {
      const hue = this.hueRotations[i % this.hueRotations.length]
      return `<div class="picker-card" data-id="${h.id}" data-action="click->race-page#selectHorse" data-horse-index="${i}">
        <img src="${cfg.basePath}1.png" style="filter: hue-rotate(${hue}deg)">
        <div class="card-name">${h.name}</div>
      </div>`
    }).join("")
    this.currentHorses = horses
    this.startPickerTimer(horses)
  }

  selectHorse(event) {
    const idx = parseInt(event.currentTarget.dataset.horseIndex)
    this.doSelectHorse(this.currentHorses[idx])
  }

  doSelectHorse(horse) {
    this.myHorse = horse
    clearInterval(this.pickerTimer)
    this.pickerTimer = null
    this.horsePickerTarget.style.display = "none"
    this.controlsTarget.style.display = "flex"
    this.animalSelectorTarget.style.display = "flex"
  }

  startPickerTimer(horses) {
    let seconds = 10
    this.timerFillTarget.style.width = "100%"
    this.pickerTimer = setInterval(() => {
      seconds -= 1
      this.timerFillTarget.style.width = (seconds / 10 * 100) + "%"
      this.timerTextTarget.textContent = `${seconds} segundos para elegir`
      if (seconds <= 0) {
        clearInterval(this.pickerTimer)
        this.pickerTimer = null
        const random = horses[Math.floor(Math.random() * horses.length)]
        this.doSelectHorse(random)
      }
    }, 1000)
  }

  newRace() {
    this.btnNewTarget.disabled = true
    this.btnStartTarget.disabled = true
    this.animalSelectorTarget.style.display = "none"
    this.winnerBannerTarget.style.display = "none"
    this.stopAnimation()
    this.frameIndex = 0
    this.setStatus("Creando carrera...")

    fetch("/races", { method: "POST", headers: { "Content-Type": "application/json" } })
      .then(r => r.json())
      .then(data => {
        this.raceId = data.id
        return fetch("/races/" + this.raceId)
      })
      .then(r => r.json())
      .then(raceData => {
        this.renderTrack(raceData.horses)
        this.preloadFrames(this.animals[this.selectedAnimal])
        this.connectToRace(this.raceId)
        this.setStatus(`Carrera #${this.raceId} lista`)
        this.btnStartTarget.disabled = false
      })
      .catch(err => {
        this.setStatus(`Error: ${err.message}`)
        this.btnNewTarget.disabled = false
        this.animalSelectorTarget.style.display = "flex"
      })
  }

  startRace() {
    this.btnStartTarget.disabled = true
    this.btnNewTarget.disabled = true
    this.startAnimation()
    this.setStatus("Corriendo...")

    fetch(`/races/${this.raceId}/start`, { method: "POST" })
      .catch(err => {
        this.setStatus(`Error al iniciar: ${err.message}`)
        this.stopAnimation()
      })
  }

  connectToRace(id) {
    if (this.socket) this.socket.close()
    const wsUrl = (location.protocol === "https:" ? "wss:" : "ws:") + "//" + location.host + "/cable"
    this.socket = new WebSocket(wsUrl)
    const identifier = JSON.stringify({ channel: "RaceChannel", race_id: id })

    this.socket.onopen = () => {
      this.socket.send(JSON.stringify({ command: "subscribe", identifier }))
    }

    this.socket.onmessage = (event) => {
      const msg = JSON.parse(event.data)
      if (msg.type === "welcome" || msg.type === "ping" || msg.type === "confirm_subscription") return
      const data = msg.message
      if (!data) return

      if (data.type === "progress") {
        data.participants.forEach(p => this.moveHorse(p.id, p.position))
      } else if (data.type === "finished") {
        this.stopAnimation()
        this.winnerBannerTarget.textContent = `Ganador: ${data.winner.name}`
        this.winnerBannerTarget.style.display = "block"
        this.setStatus("Carrera terminada")
        this.btnNewTarget.disabled = false
        this.animalSelectorTarget.style.display = "flex"
        this.socket.close()
      }
    }

    this.socket.onerror = () => this.setStatus("Error de conexion WebSocket")
  }

  renderTrack(horses) {
    this.trackTarget.innerHTML = horses.map((h, i) => {
      const hue = this.hueRotations[i % this.hueRotations.length]
      const isMine = this.myHorse && this.myHorse.id === h.id
      const labelClass = "lane-label" + (isMine ? " my-horse" : "")
      const labelText = (isMine ? "★ " : "") + h.name
      return `<div class="lane-row">
        <span class="${labelClass}">${labelText}</span>
        <div class="track-wrap" id="wrap-${h.id}">
          <div class="track-bg"></div>
          ${this.animals[this.selectedAnimal].createElement(h.id, hue)}
        </div>
      </div>`
    }).join("")
  }

  startAnimation() {
    if (this.animInterval) return
    const cfg = this.animals[this.selectedAnimal]
    this.animInterval = setInterval(() => {
      this.frameIndex = (this.frameIndex + 1) % cfg.frameCount
      document.querySelectorAll(".horse-sprite").forEach(el => cfg.updateFrame(el, this.frameIndex))
    }, this.frameRateMs)
  }

  stopAnimation() {
    clearInterval(this.animInterval)
    this.animInterval = null
  }

  moveHorse(horseId, position) {
    const img = document.getElementById("horse-" + horseId)
    const wrap = document.getElementById("wrap-" + horseId)
    if (!img || !wrap) return
    const maxLeft = wrap.offsetWidth - img.offsetWidth
    img.style.left = Math.max(0, position / 100 * maxLeft) + "px"
  }

  preloadFrames(cfg) {
    for (let i = 1; i <= cfg.frameCount; i++) {
      (new Image()).src = cfg.basePath + i + ".png"
    }
  }

  setStatus(text) { this.statusTextTarget.textContent = text }
}
