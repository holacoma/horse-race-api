import { Controller } from "@hotwired/stimulus"

export default class extends Controller {
  static values = {
    raceId: Number,
    raceSlug: String,
    animalType: String,
    capacity: Number,
    participantCount: Number,
    favoriteIds: Array
  }

  static targets = ["participantsList", "playersCount", "statusBar", "horsePicker",
                     "pickerCards", "raceSection", "countdown", "track", "winnerBanner",
                     "btnStart", "apostadorSection", "profileOverlay", "profilePopup",
                     "ppAvatarWrap", "ppUsername", "ppProfileLink", "ppRaces", "ppWins", "ppFavs"]

  connect() {
    this.hueRotations = [0, 55, 110, 170, 220, 285]
    this.frameIndex = 0
    this.animInterval = null

    this.animalCfg = {
      horse: {
        frameCount: 5,
        basePath: "/images/horse/frame_",
        spriteStyle: "transform: scaleX(-1);",
        spriteHeight: "132px"
      },
      guinea_pig: {
        frameCount: 4,
        basePath: "/images/guinea_pig/frame_",
        spriteStyle: "transform: scaleX(1); height: auto;",
        spriteHeight: "auto"
      }
    }

    this.setupWebSocket()
  }

  disconnect() {
    if (this.socket) this.socket.close()
    if (this.animInterval) clearInterval(this.animInterval)
  }

  setupWebSocket() {
    const wsUrl = (location.protocol === "https:" ? "wss:" : "ws:") + "//" + location.host + "/cable"
    this.socket = new WebSocket(wsUrl)
    const identifier = JSON.stringify({ channel: "RaceChannel", race_id: this.raceIdValue })

    this.socket.onopen = () => {
      this.socket.send(JSON.stringify({ command: "subscribe", identifier }))
    }

    this.socket.onmessage = (event) => {
      const msg = JSON.parse(event.data)
      if (msg.type === "welcome" || msg.type === "ping" || msg.type === "confirm_subscription") return
      const data = msg.message
      if (!data) return

      if (data.type === "player_joined") {
        const p = data.participant
        this.addParticipant(p.username, p.horse_name, p.horse_id, p.profile_username)
      } else if (data.type === "race_started") {
        this.onRaceStarted(data.participants)
      } else if (data.type === "progress") {
        data.participants.forEach(p => this.moveHorse(p.id, p.position))
      } else if (data.type === "finished") {
        this.onFinished(data.winner)
      }
    }

    this.socket.onerror = () => console.error("WebSocket error")
  }

  addParticipant(username, horseName, horseId, profileUsername) {
    const div = document.createElement("div")
    div.className = "participant-row"
    const profileBtn = profileUsername
      ? `<button class="profile-btn" data-action="click->race-lobby#openProfilePopup" data-username="${profileUsername}" title="Ver perfil">👤</button>`
      : ""
    div.innerHTML = `<span class="p-username">${username}</span><span class="p-horse">🐎 ${horseName}</span>${profileBtn}`
    this.participantsListTarget.appendChild(div)

    document.querySelectorAll(`[data-horse-id="${horseId}"]`).forEach(el => el.remove())

    this.participantCountValue += 1
    this.playersCountTarget.textContent = `${this.participantCountValue}/${this.capacityValue} jugadores`

    const remaining = this.capacityValue - this.participantCountValue
    if (remaining <= 0) {
      this.statusBarTarget.textContent = "¡Sala lista!"
      this.statusBarTarget.className = "ready"
    } else {
      this.statusBarTarget.textContent = `Esperando ${remaining} jugador${remaining === 1 ? "" : "es"} más…`
    }
  }

  copyLink() {
    const input = document.getElementById("share-link")
    input.select()
    document.execCommand("copy")
  }

  pickHorse(event) {
    const horseId = event.currentTarget.dataset.horseId
    const card = event.currentTarget
    if (card.classList.contains("taken")) return

    fetch(`/races/${this.raceSlugValue}/participants`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-CSRF-Token": this.csrfToken() },
      body: JSON.stringify({ horse_id: horseId })
    })
      .then(r => r.json())
      .then(data => {
        if (data.race_started) {
          window.location.href = "/races/" + this.raceSlugValue + "/live"
        } else if (data.ok) {
          this.horsePickerTarget.style.display = "none"
        } else {
          alert(data.error || "No se pudo elegir ese caballo")
          card.classList.add("taken")
        }
      })
      .catch(() => alert("Error de red, intentá de nuevo"))
  }

  addApostador(event) {
    const horseId = event.currentTarget.dataset.horseId
    const nameInput = document.getElementById("apostador-name-input")
    if (!nameInput) return
    const name = nameInput.value.trim()
    if (!name) {
      nameInput.focus()
      nameInput.style.borderColor = "#b91c1c"
      setTimeout(() => { nameInput.style.borderColor = "" }, 1500)
      return
    }

    fetch(`/races/${this.raceSlugValue}/participants`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-CSRF-Token": this.csrfToken() },
      body: JSON.stringify({ horse_id: horseId, guest_name: name })
    })
      .then(r => r.json())
      .then(data => {
        if (data.ok) {
          nameInput.value = ""
        } else {
          alert(data.error || "No se pudo agregar el apostador")
        }
      })
      .catch(() => alert("Error de red, intentá de nuevo"))
  }

  startRace() {
    const btn = this.btnStartTarget
    btn.disabled = true
    btn.textContent = "Iniciando…"
    fetch(`/races/${this.raceSlugValue}/start`, {
      method: "POST",
      headers: { "X-CSRF-Token": this.csrfToken() }
    })
      .then(r => r.json())
      .then(data => {
        if (data.race_started) {
          window.location.href = "/races/" + this.raceSlugValue + "/live"
        } else if (data.error) {
          btn.disabled = false
          btn.textContent = "🏁 Comenzar carrera"
          alert(data.error)
        }
      })
      .catch(() => {
        btn.disabled = false
        btn.textContent = "🏁 Comenzar carrera"
      })
  }

  openProfilePopup(event) {
    const username = event.currentTarget.dataset.username
    this.profileOverlayTarget.classList.add("open")
    this.profilePopupTarget.classList.add("loading")
    this.ppUsernameTarget.textContent = username
    this.ppProfileLinkTarget.href = `/profiles/${username}`
    this.ppRacesTarget.textContent = "—"
    this.ppWinsTarget.textContent = "—"
    this.ppFavsTarget.innerHTML = ""
    this.ppAvatarWrapTarget.innerHTML = ""

    fetch(`/profiles/${username}.json`, {
      headers: { "X-CSRF-Token": this.csrfToken() }
    })
      .then(r => r.json())
      .then(data => {
        this.profilePopupTarget.classList.remove("loading")
        this.ppRacesTarget.textContent = data.total_races
        this.ppWinsTarget.textContent = data.wins
        this.ppAvatarWrapTarget.innerHTML = data.avatar_url
          ? `<img class="pp-avatar" src="${data.avatar_url}" alt="${username}">`
          : `<div class="pp-avatar-placeholder">${username[0].toUpperCase()}</div>`
        this.ppFavsTarget.innerHTML = (data.favorites && data.favorites.length > 0)
          ? data.favorites.map(name => `<span class="pp-fav-chip">⭐ ${name}</span>`).join("")
          : '<span class="pp-no-favs">Sin favoritos aún</span>'
      })
      .catch(() => this.profilePopupTarget.classList.remove("loading"))
  }

  closeProfilePopup(event) {
    if (event && event.target !== this.profileOverlayTarget) return
    this.profileOverlayTarget.classList.remove("open")
  }

  closePopupBtn() {
    this.profileOverlayTarget.classList.remove("open")
  }

  onRaceStarted(_participants) {
    window.location.href = "/races/" + this.raceSlugValue + "/live"
  }

  onFinished(winner) {
    this.stopAnimation()
    const banner = this.winnerBannerTarget
    banner.textContent = `🏆 Ganador: ${winner.username} (${winner.name})`
    banner.style.display = "block"
    banner.style.animation = "pop 0.3s ease-out"
  }

  preloadFrames() {
    const cfg = this.animalCfg[this.animalTypeValue] || this.animalCfg.horse
    for (let i = 1; i <= cfg.frameCount; i++) {
      (new Image()).src = cfg.basePath + i + ".png"
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
               style="filter: hue-rotate(${hue}deg); ${cfg.spriteStyle}">
        </div>
      </div>`
    }).join("")
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

  showCountdown(callback) {
    const el = this.countdownTarget
    el.style.display = "block"
    const steps = ["3", "2", "1", "🏁 GO!"]
    let i = 0
    el.textContent = steps[0]
    const interval = setInterval(() => {
      i++
      if (i < steps.length) {
        el.textContent = steps[i]
      } else {
        clearInterval(interval)
        el.style.display = "none"
        callback()
      }
    }, 1000)
  }

  csrfToken() {
    const meta = document.querySelector('meta[name="csrf-token"]')
    return meta ? meta.content : ""
  }
}
