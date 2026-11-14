# Bots: los personajes de config/bots.yml juegan solos para que el club siempre se sienta vivo. Los que están en su
# horario arman carreras y travesías y se suman a salas abiertas, también a las de la gente (sin llenarlas). Nunca se
# recargan: el que no puede pagar su apuesta queda quebrado hasta que le donen (BotsController). No figuran en
# «Los más ricos». Se apagan con CLUB_BOTS=0.
class BotsJob < ApplicationJob
  queue_as :default

  SALAS_DE_BOTS = 2 # carreras abiertas armadas por bots a la vez

  def perform
    return if ENV["CLUB_BOTS"] == "0"
    usuarios = asegurar_bots
    quebrar(usuarios.values)
    activos = Bot.todos.select(&:despierto?).filter_map do |bot|
      user = usuarios[bot.nombre]
      [ bot, user ] if user.quebrado_desde.nil?
    end
    return if activos.empty?

    armar_carrera(activos.sample) if Race.carrera.abiertas.where(creator: usuarios.values).count < SALAS_DE_BOTS
    armar_travesia(activos) unless Race.travesia.abiertas.exists?
    sumarse(activos)
  end

  private

  def asegurar_bots
    existentes = User.bots.where(username: Bot.todos.map(&:nombre)).index_by(&:username)
    Bot.todos.to_h do |bot|
      [ bot.nombre, existentes[bot.nombre] || User.bots.create!(username: bot.nombre, balance: Bot::SALDO_INICIAL) ]
    end
  end

  def quebrar(usuarios)
    minima = Bot::APUESTA.values.min
    User.where(id: usuarios.map(&:id), quebrado_desde: nil).where("balance < ?", minima).update_all(quebrado_desde: Time.current)
  end

  def armar_carrera(activo)
    bot, creador = activo
    race = Race.create!(creator: creador, capacity: rand(4..8), bet: bot.apuesta, distance: [ 1500, 2000, 3000 ].sample,
                        pista: Race::PISTAS.keys.sample, is_public: true, starts_at: rand(3..6).minutes.from_now,
                        slug: Race.pick_room_name[:slug])
    sumar(race, creador)
  end

  def armar_travesia(activos)
    bot, creador = activos.sample
    race = Race.armar_travesia!(dias: 1, creator: creador, capacity: 8, bet: bot.apuesta, pista: Race::PISTAS.keys.sample,
                                is_public: true, slug: Race.pick_room_name[:slug])
    sumar(race, creador)
  end

  # Cada sala abierta con lugar recibe a lo sumo un bot por pasada, y siempre queda un lugar libre para la gente.
  def sumarse(activos)
    Race.abiertas.includes(:participants).find_each do |race|
      next if race.participants.size >= race.capacity - 1
      ocupados = race.participants.map(&:user_id)
      candidato = activos.shuffle.find { |bot, user| !ocupados.include?(user.id) && user.balance >= race.bet && race.bet <= bot.apuesta * 2 }
      sumar(race, candidato.last) if candidato && rand < 0.5
    end
  end

  def sumar(race, user)
    horse = race.available_horses.sample or return
    participante = race.participants.create(user: user, horse_id: horse.id, horse_name: horse.name)
    participante.announce_joined if participante.persisted?
  end
end
