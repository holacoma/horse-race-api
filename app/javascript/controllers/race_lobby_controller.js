import { Controller } from "@hotwired/stimulus"
import { sonar, sonarCuandoSePueda, GOLPE_TIEMPO } from "sonidos"

const CLOSE_ANIMATION_MS = 150
// Mismo orden que ELEMENTS en public/prototipos/carrera3d/caballo-pro.js y que RacesHelper: el color es el del carril.
const ELEMENTOS = ["fuego", "hielo", "electricidad", "agua", "viento", "roca", "sombra", "luz", "veneno", "metal", "naturaleza", "cosmos"]

// La sala y la carrera son la misma pantalla. La escena 3D se arma al entrar, con un carril por lugar: los caballos
// esperan en la largada y aparecen a medida que alguien se une. Al largar, la sala se corre y empieza el preludio.
export default class extends Controller {
  static values = {
    raceId: Number,
    raceSlug: String,
    animalType: String,
    capacity: Number,
    participantCount: Number,
    favoriteIds: Array,
    bettorNames: Array
  }

  static targets = ["participantsList", "playersCount", "statusBar", "horsePicker", "pickerCards",
                     "btnStart", "apostadorSection", "profileOverlay", "profilePopup", "panel", "cargando",
                     "tuCaballo", "tuCaballoNombre", "tuChibi", "corte", "results",
                     "ppAvatarWrap", "ppUsername", "ppProfileLink", "ppRaces", "ppWins", "ppFavs"]

  connect() {
    this.data3d = JSON.parse(document.getElementById("race-data").textContent)
    this.myHorseId = this.data3d.myHorseId
    this.pending = []
    this.setupWebSocket()
    this.buildScene()
  }

  disconnect() {
    if (this.socket) this.socket.close()
    this.race?.stop()
  }

  // ── Escena 3D ─────────────────────────────────────────────────────────────────────
  async buildScene() {
    // Solo en esta página: three.js y el modelo se cargan acá, no en el resto del juego.
    const [{ createRace }, { loadHorseModel }] = await Promise.all([
      import("/prototipos/carrera3d/escena.js?v=4"),
      import("/prototipos/carrera3d/caballo-pro.js")
    ])
    const horseModel = await loadHorseModel().catch(error => { console.error(error); return null })
    const data = this.data3d
    this.race = createRace({
      participants: data.participants,
      slots: data.capacity,
      distance: data.distance,
      horseModel,
      myId: data.myHorseId,
      showFps: false,
      onCount: text => (text === "¡YA!" ? sonar("ya") : sonar("cuenta", Number(text))),
      onCross: () => sonar("meta"),
      onCelebrate: () => { this.resultsTarget.hidden = false; sonar("ganador") },
      onDone: () => this.goToResults()
    })
    window.__sala = { race: this.race }
    // Lo que llegó mientras cargaba la escena.
    this.pending.splice(0).forEach(fn => fn())
    if (data.running) this.race.startIn(data.secondsToStart ?? 0)
    // Entró con la carrera recién largada (por ejemplo, con "Jugar ya"): el tiempo se detiene igual.
    if (data.running && (data.secondsToStart ?? 0) > 11) sonarCuandoSePueda("tiempo", 2500)
    this.race.run()
    this.cargandoTarget.hidden = true
  }

  whenReady(fn) {
    if (this.race) fn()
    else this.pending.push(fn)
  }

  // ── Canal de la carrera ────────────────────────────────────────────────────────────
  setupWebSocket() {
    const wsUrl = (location.protocol === "https:" ? "wss:" : "ws:") + "//" + location.host + "/cable"
    this.socket = new WebSocket(wsUrl)
    const identifier = JSON.stringify({ channel: "RaceChannel", race_id: this.raceIdValue })

    this.socket.onopen = () => this.socket.send(JSON.stringify({ command: "subscribe", identifier }))
    this.socket.onmessage = event => {
      const msg = JSON.parse(event.data)
      if (msg.type === "welcome" || msg.type === "ping" || msg.type === "confirm_subscription") return
      const data = msg.message
      if (!data) return

      if (data.type === "player_joined") {
        this.addParticipant(data.participant)
      } else if (data.type === "race_started") {
        this.onRaceStarted()
      } else if (data.type === "progress") {
        this.whenReady(() => this.race.tick(data.participants))
      } else if (data.type === "finished") {
        this.whenReady(() => this.race.finish(data.winner))
      }
    }
    this.socket.onerror = () => console.error("WebSocket error")
  }

  addParticipant(p) {
    if (document.querySelector(`#participants-list [data-horse-id="${p.horse_id}"]`)) return
    sonar("moneda")
    // El elemento es del caballo (mismo cálculo que Horse.elemento_de): de ahí su color y su chibi.
    const elemento = ELEMENTOS[(Number(p.horse_id) - 1) % ELEMENTOS.length]
    const div = document.createElement("div")
    div.className = "participant-row recien"
    div.dataset.horseId = p.horse_id
    const color = `var(--caballo-${elemento})`
    div.style.setProperty("--c", color)
    const chibi = `/images/chibis/${elemento}.webp`
    div.innerHTML = `<img class="p-chibi" alt="" src="${chibi}"><span class="p-horse nombre-caballo"></span><span class="p-username"></span>`
    if (String(p.horse_id) === String(this.myHorseId)) { this.tuCaballoTarget.style.setProperty("--c", color); this.tuChibiTarget.src = chibi }
    div.querySelector(".p-username").textContent = `de ${p.username}`
    div.querySelector(".p-horse").textContent = p.horse_name
    if (p.profile_username) {
      const button = document.createElement("button")
      Object.assign(button, { className: "profile-btn", title: "Ver perfil", textContent: "👤" })
      button.dataset.fx = "profile"
      button.dataset.action = "click->race-lobby#openProfilePopup"
      button.dataset.username = p.profile_username
      div.append(button)
    }
    this.participantsListTarget.appendChild(div)

    // Ese caballo, y cualquiera de su mismo elemento, ya no se puede elegir ni sumar.
    document.querySelectorAll(`.picker-card[data-horse-id="${p.horse_id}"], .picker-card[data-elemento="${elemento}"]`).forEach(el => el.remove())

    this.participantCountValue += 1
    this.playersCountTarget.textContent = `${this.participantCountValue}/${this.capacityValue} jugadores`
    const remaining = this.capacityValue - this.participantCountValue
    this.statusBarTarget.textContent = remaining <= 0 ? "¡Sala lista!" : `Esperando ${remaining} jugador${remaining === 1 ? "" : "es"} más…`
    this.statusBarTarget.classList.toggle("ready", remaining <= 0)

    // El caballo aparece en la largada.
    this.whenReady(() => this.race.join({ id: p.horse_id, name: p.horse_name, username: p.username, element: elemento }))
  }

  copyLink(event) {
    const button = event.currentTarget
    const input = document.getElementById("share-link")
    navigator.clipboard?.writeText(input.value).catch(() => { input.select(); document.execCommand("copy") })
    button.dataset.label ||= button.textContent
    button.textContent = "¡Copiado!"
    clearTimeout(this.copiedTimeout)
    this.copiedTimeout = setTimeout(() => { button.textContent = button.dataset.label }, 1200)
  }

  // ── Elegir caballo y sumar caballos: sin esperas, uno atrás de otro ────────────────────
  pickHorse(event) {
    const card = event.currentTarget
    if (card.classList.contains("picking") || this.pickingHorse) return
    this.pickingHorse = true
    card.classList.add("picking")
    this.postParticipant({ horse_id: card.dataset.horseId })
      .then(data => {
        if (!data.ok) throw new Error(data.error || "No se pudo elegir ese caballo")
        this.horsePickerTarget.remove()
        this.myHorseId = data.participant.horse_id
        this.tuCaballoNombreTarget.textContent = data.participant.horse_name
        // Si el aviso de llegada ya pintó su fila, su color es el de tu caballo.
        const row = this.participantsListTarget.querySelector(`[data-horse-id="${this.myHorseId}"]`)
        if (row) {
          this.tuCaballoTarget.style.setProperty("--c", row.style.getPropertyValue("--c"))
          this.tuChibiTarget.src = row.querySelector(".p-chibi").src
        }
        this.tuCaballoTarget.hidden = false
        this.whenReady(() => this.race.setMine(data.participant.horse_id))
      })
      .catch(error => { card.classList.add("taken"); this.aviso(error.message) })
      .finally(() => { this.pickingHorse = false; card.classList.remove("picking") })
  }

  addApostador(event) {
    const card = event.currentTarget
    if (card.classList.contains("picking")) return
    card.classList.add("picking")
    const input = document.getElementById("apostador-name-input")
    const typed = input?.value.trim()
    if (input) input.value = ""
    const name = typed || this.nextBettorName()
    this.postParticipant({ horse_id: card.dataset.horseId, guest_name: name })
      .then(data => { if (!data.ok) throw new Error(data.error || "No se pudo sumar ese caballo") })
      .catch(error => { card.classList.remove("picking"); this.aviso(error.message) })
  }

  nextBettorName() {
    this.bettorNames ||= [...this.bettorNamesValue]
    return this.bettorNames.shift()
  }

  postParticipant(body) {
    return fetch(`/races/${this.raceSlugValue}/participants`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-CSRF-Token": this.csrfToken() },
      body: JSON.stringify(body)
    }).then(r => r.json())
  }

  startRace() {
    const btn = this.btnStartTarget
    btn.disabled = true
    btn.textContent = "Largando…"
    fetch(`/races/${this.raceSlugValue}/start`, { method: "POST", headers: { "X-CSRF-Token": this.csrfToken() } })
      .then(r => r.json())
      .then(data => {
        if (data.error) throw new Error(data.error)
        this.onRaceStarted()
      })
      .catch(error => { btn.disabled = false; btn.textContent = "Largar"; this.aviso(error.message) })
  }

  // ── Largada: la sala se corre con un corte seco y la escena pasa al preludio ─────────────
  onRaceStarted() {
    if (this.started) return
    this.started = true
    // El mundo se detiene: el sonido crece y el corte cruza justo con el golpe.
    sonarCuandoSePueda("tiempo")
    const cut = this.corteTarget
    setTimeout(() => {
      cut.classList.remove("ya")
      void cut.offsetWidth
      cut.classList.add("ya")
    }, GOLPE_TIEMPO * 1000 - 160)
    // El cambio de fase, justo cuando el bloque tapa la pantalla.
    setTimeout(() => {
      document.documentElement.dataset.fase = "carrera"
      this.element.classList.add("en-carrera")
    }, GOLPE_TIEMPO * 1000)
    this.whenReady(() => this.race.startIn(13))
  }

  goToResults() {
    const url = this.data3d.resultsUrl
    // La transición entre páginas (view transitions) la hace un fundido, sin corte.
    location.assign(url)
  }

  aviso(text) {
    this.statusBarTarget.textContent = text
    this.statusBarTarget.classList.add("error")
    clearTimeout(this.avisoTimeout)
    this.avisoTimeout = setTimeout(() => this.statusBarTarget.classList.remove("error"), 2500)
  }

  // ── Perfil emergente ───────────────────────────────────────────────────────────────
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

    fetch(`/profiles/${username}.json`, { headers: { "X-CSRF-Token": this.csrfToken() } })
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
    // Se cierra después de la animación de clic de la cruz, que si no queda oculta antes de empezar.
    setTimeout(() => this.profileOverlayTarget.classList.remove("open"), CLOSE_ANIMATION_MS)
  }

  csrfToken() {
    const meta = document.querySelector('meta[name="csrf-token"]')
    return meta ? meta.content : ""
  }
}
