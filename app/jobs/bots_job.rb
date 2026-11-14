# Bots: juegan solos para que el juego siempre se sienta vivo. Cada tanto arman una carrera con hora límite (larga
# sola a los pocos minutos, con lugar para que entre gente) y, si no hay ninguna, una travesía. Apuestan como
# cualquiera. No figuran en el ranking (no son cuentas de Google). Se apagan con CLUB_BOTS=0.
class BotsJob < ApplicationJob
  queue_as :default

  NOMBRES = [ "Tía Quiniela", "Don Corazonada", "Capitán Galope", "Lady Propina", "Barón del Empate", "Rey Fiado" ].freeze
  SALDO_MINIMO = 500
  SALDO_INICIAL = 5_000

  def perform
    return if ENV["CLUB_BOTS"] == "0"
    bots = asegurar_bots
    armar_carrera(bots) unless Race.carrera.abiertas.where(creator: bots).exists?
    armar_travesia(bots) unless Race.travesia.abiertas.exists?
  end

  private

  def asegurar_bots
    NOMBRES.first(4).map do |nombre|
      bot = User.bots.find_or_create_by!(username: nombre) { |u| u.balance = SALDO_INICIAL }
      bot.update!(balance: SALDO_INICIAL) if bot.balance < SALDO_MINIMO
      bot
    end
  end

  def armar_carrera(bots)
    creador = bots.sample
    race = Race.create!(creator: creador, capacity: rand(4..8), bet: [ 20, 40, 60 ].sample, distance: [ 1500, 2000, 3000 ].sample,
                        pista: Race::PISTAS.keys.sample, is_public: true, starts_at: rand(3..6).minutes.from_now,
                        slug: Race.pick_room_name[:slug])
    sumar(race, ([ creador ] + bots.sample(rand(1..2))).uniq)
  end

  def armar_travesia(bots)
    creador = bots.sample
    race = Race.armar_travesia!(dias: 1, creator: creador, capacity: 8, bet: 40, pista: Race::PISTAS.keys.sample,
                                is_public: true, slug: Race.pick_room_name[:slug])
    sumar(race, ([ creador ] + bots.sample(2)).uniq)
  end

  def sumar(race, jugadores)
    jugadores.each do |bot|
      horse = race.available_horses.sample or break
      race.participants.create!(user: bot, horse_id: horse.id, horse_name: horse.name).announce_joined
    end
  end
end
