class RaceSimulationJob < ApplicationJob
  queue_as :default

  TICK_INTERVAL = 0.3
  # Aceleran como naves hasta unos 430 km/h: lo que dura la carrera sale de su distancia.
  ACCELERATION  = (14.0..20.0)
  TOP_SPEED     = (112.0..128.0)
  CATCH_UP      = 0.05         # los de atrás recuperan algo, para que haya pelea hasta el final
  SURGE         = (-14.0..14.0)
  MAX_SLOWDOWN  = 8.0
  COUNTDOWN_SEC = 4  # 3-2-1-GO antes de arrancar
  PRELUDE_SEC   = 13 # vista 3D: presentación de la pista y 3-2-1

  def perform(race_id, countdown = COUNTDOWN_SEC)
    race = Race.find(race_id)
    return unless race.running?

    entries = race.participants.includes(:user).map do |p|
      { participant: p, horse: Horse.find(p.horse_id), username: p.display_name,
        speed: 0.0, **race.fuerzas_de(p.horse_id) }
    end

    return if entries.empty?

    ActionCable.server.broadcast("race_#{race_id}", {
      type: "race_started",
      favoritos: race.favoritos,
      participants: entries.map { |e| { id: e[:horse].id, name: e[:horse].name, username: e[:username] } }
    })

    sleep countdown

    distance = race.distance.to_f

    loop do
      advance(entries, distance)

      # Por el canal va el porcentaje recorrido: las vistas no dependen de la distancia.
      ActionCable.server.broadcast("race_#{race_id}", {
        type: "progress",
        participants: entries.map { |e| { id: e[:horse].id, position: (e[:horse].position / distance * 100).round(2) } }
      })

      winner = first_to_arrive(entries, distance)

      if winner
        Race.transaction do
          save_final_ranks(entries, winner)
          race.update!(status: :finished, winner_name: winner[:horse].name, finished_at: Time.current)
        end

        ActionCable.server.broadcast("race_#{race_id}", {
          type: "finished",
          winner: { id: winner[:horse].id, name: winner[:horse].name, username: winner[:username] }
        })

        break
      end

      sleep TICK_INTERVAL
    end
  end

  private

  def advance(entries, distance)
    leader = entries.map { |e| e[:horse].position }.max
    entries.each do |e|
      target = e[:top_speed] + (leader - e[:horse].position) * CATCH_UP + rand(SURGE)
      e[:speed] += (target - e[:speed]).clamp(-MAX_SLOWDOWN, e[:acceleration] * TICK_INTERVAL)
      e[:reached] = e[:horse].position + e[:speed] * TICK_INTERVAL
      e[:horse].position = [ e[:reached], distance ].min
    end
  end

  # A esta velocidad varios cruzan la meta en el mismo tick: gana el que más la pasó, no el primero de la lista.
  def first_to_arrive(entries, distance)
    entries.select { |e| e[:reached] >= distance }.max_by { |e| e[:reached] }
  end

  # El ganador anunciado siempre queda primero.
  def save_final_ranks(entries, winner)
    others = (entries - [ winner ]).sort_by { |e| -e[:reached] }
    [ winner, *others ].each.with_index(1) { |e, rank| e[:participant].update!(final_rank: rank) }
  end
end
