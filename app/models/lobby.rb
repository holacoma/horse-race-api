# El lobby vivo: un motor que arma salas públicas de carrera con bots y las va llenando de a poco, para que el inicio
# siempre tenga movimiento. LobbyJob lo mueve cada segundo; todo el ritmo sale de la base (hora de la última sala o del
# último participante) y la "suerte" de cada espera es determinista (semilla = id), así que no hace falta estado en
# memoria y un reinicio no cambia nada.
#
#   - Cada 10–20 s nace una sala (hasta SALAS_MAXIMAS abiertas) armada por un bot despierto y no quebrado.
#   - Cada 5–10 s entra a cada sala un bot que pueda pagar y no esté en otra sala abierta. Si nadie puede, no entra
#     nadie: sin hora límite ni relleno. Al completarse, la carrera larga por el mismo camino que una sala llena.
#   - A lo sumo una sala abierta tiene una apuesta que ningún bot despierto puede pagar.
class Lobby
  SALAS_MAXIMAS = 6
  LUGARES       = (6..12)
  NUEVA_SALA    = (10.0..20.0) # segundos entre una sala y la siguiente
  NUEVO_BOT     = (5.0..10.0)  # segundos entre un bot y el siguiente en una sala
  APUESTA_MIN   = 40
  APUESTA_MAX   = 10_000

  def self.activo? = ENV["CLUB_BOTS"] != "0"

  def self.tick(ahora = Time.current) = new(ahora).tick

  def initialize(ahora = Time.current)
    @ahora = ahora
  end

  def tick
    return unless self.class.activo?
    @usuarios = Bot.asegurar_usuarios
    Bot.quebrar!(@usuarios.values)
    @activos = Bot.activos(@usuarios)
    return if @activos.empty?

    armar_sala if toca_sala?
    salas_abiertas.each { |race| sumar_bot(race) }
  end

  # Apuesta al azar entre 40 y 10.000, sesgada a lo barato (tres de cada cuatro quedan bajo los 1.000).
  def self.apuesta_al_azar(azar = Random)
    (APUESTA_MIN * (APUESTA_MAX.fdiv(APUESTA_MIN)**(azar.rand**2))).round(-1).clamp(APUESTA_MIN, APUESTA_MAX)
  end

  private

  def bots = @usuarios.values

  def salas_abiertas = Race.carrera.abiertas.where(creator: bots).includes(:participants).order(:id).to_a

  def toca_sala?
    return false if salas_abiertas.size >= SALAS_MAXIMAS
    ultima = Race.carrera.where(creator: bots).order(:id).last
    ultima.nil? || @ahora >= ultima.created_at + Random.new(ultima.id).rand(NUEVA_SALA)
  end

  # Cuánta plata tiene el más rico de los que juegan: más que eso, nadie paga.
  def tope_de_pago = @activos.map { |_, user| user.balance }.max

  def hay_sala_imposible? = salas_abiertas.any? { |race| race.bet > tope_de_pago }

  def armar_sala
    bot, creador = @activos.sample
    apuesta = self.class.apuesta_al_azar
    apuesta = [ tope_de_pago, APUESTA_MIN ].max if apuesta > tope_de_pago && hay_sala_imposible?
    race = Race.create!(creator: creador, capacity: rand(LUGARES), bet: apuesta, distance: [ 1500, 2000, 3000 ].sample,
                        pista: Race::PISTAS.keys.sample, is_public: true, slug: Race.pick_room_name[:slug])
    sumar(race, creador) if creador.balance >= apuesta
    bot
  end

  def sumar_bot(race)
    lista = race.participants.size
    return if lista >= race.capacity
    desde = race.participants.map(&:created_at).max || race.created_at
    return if @ahora < desde + Random.new((race.id * 100) + lista).rand(NUEVO_BOT)

    ocupados = Participant.where(race: Race.abiertas).where(user_id: bots.map(&:id)).pluck(:user_id)
    candidato = @activos.map(&:last).shuffle.find { |user| !ocupados.include?(user.id) && user.balance >= race.bet }
    sumar(race, candidato) if candidato
  end

  # Mismo camino que una sala llena en ParticipantsController: al completarse, larga.
  def sumar(race, user)
    horse = race.available_horses.sample or return
    participante = race.participants.create(user: user, horse_id: horse.id, horse_name: horse.name)
    return unless participante.persisted?
    participante.announce_joined
    race.reload.start! if race.full? && race.pending?
  end
end
