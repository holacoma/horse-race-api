# Bots: los personajes de config/bots.yml juegan solos para que el club siempre se sienta vivo. Cada 10 minutos arman la
# travesía y se suman a las travesías y a las salas de la gente (sin llenarlas). Las carreras de bots (salas nuevas
# cada pocos segundos) las arma el motor del lobby (Lobby, LobbyJob). Nunca se recargan: el que no puede pagar su
# apuesta queda quebrado hasta que le donen (BotsController). No figuran en «Los más ricos». Se apagan con CLUB_BOTS=0.
class BotsJob < ApplicationJob
  queue_as :default

  def perform
    return if ENV["CLUB_BOTS"] == "0"
    usuarios = Bot.asegurar_usuarios
    Bot.quebrar!(usuarios.values)
    activos = Bot.activos(usuarios)
    return if activos.empty?

    armar_travesia(activos) unless Race.travesia.abiertas.exists?
    sumarse(activos, usuarios.values)
  end

  private

  def armar_travesia(activos)
    bot, creador = activos.sample
    race = Race.armar_travesia!(dias: 1, creator: creador, capacity: 8, bet: bot.apuesta, pista: Race::PISTAS.keys.sample,
                                is_public: true, slug: Race.pick_room_name[:slug])
    sumar(race, creador)
  end

  # Cada travesía o sala de la gente con lugar recibe a lo sumo un bot por pasada, y siempre queda un lugar libre para
  # la gente. Las salas de bots son del lobby, que las llena él.
  def sumarse(activos, bots)
    Race.abiertas.where.not(creator: bots).or(Race.abiertas.travesia).includes(:participants).find_each do |race|
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
