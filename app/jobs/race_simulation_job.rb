class RaceSimulationJob < ApplicationJob
  queue_as :default

  TICK_INTERVAL = 0.3
  # Aceleran como naves hasta unos 430 km/h: lo que dura la carrera sale de su distancia.
  ACCELERATION  = (14.0..20.0)
  TOP_SPEED     = (112.0..128.0)
  # Ritmo: los de atrás recuperan, cada uno tiene olas de velocidad propias (así se pasan una y otra vez) y al final
  # el pelotón se comprime para que nadie gane sobrado.
  CATCH_UP      = 0.08
  CATCH_UP_FINAL = 0.9         # cuánto recuperan los de atrás en el último tramo
  SURGE         = (-9.0..9.0)
  OLA           = 16.0         # m/s de más o de menos, según la ola de cada caballo
  MAX_SLOWDOWN  = 8.0
  # El poder lanzado: el caballo arde y acelera de a poco (sube durante IMPULSO_RAMPA y se apaga al final).
  IMPULSO       = 12.0
  IMPULSO_SEC   = 3.0
  IMPULSO_RAMPA = 1.5
  # Los apostadores y los bots también lanzan su poder, de vez en cuando: uno cada tantos segundos, en promedio.
  BOT_IMPULSO_CADA = 10.0
  BOT_IMPULSO_MIN  = 6.0
  # Contra jugadores, los bots (y apostadores de relleno) corren a esta fracción de su fuerza y no recuperan terreno:
  # un humano les gana casi siempre. Sin humanos en la carrera todos quedan parejos.
  BOT_FUERZA = 0.4
  COUNTDOWN_SEC = 4  # 3-2-1-GO antes de arrancar
  # La entrada en la vista 3D: primero un paneo por los cajones con los caballos como chibis (PANEO_SEC); después
  # The World, la transformación, la presentación y el 3, 2, 1 (13 s). PRELUDE_SEC es todo, hasta el ¡YA!.
  PANEO_SEC     = 4
  PRELUDE_SEC   = PANEO_SEC + 13

  def perform(race_id, countdown = COUNTDOWN_SEC)
    race = Race.find(race_id)
    return unless race.running?

    ventajas = race.ventajas_finales
    entries = race.participants.includes(:user).map do |p|
      rng = Random.new(race.id * 31 + p.horse_id)
      { participant: p, horse: Horse.find(p.horse_id), username: p.display_name, speed: 0.0,
        fase: rng.rand * 6.283, periodo: 2.2 + rng.rand * 2.6, impulsos: p.impulsos, impulso_desde: -100.0,
        bot: p.user.nil? || p.user.bot?, peor_puesto: 1, **race.fuerzas_de(p.horse_id) }.tap { |e| e[:horse].position = ventajas[p.horse_id].to_f }
    end

    return if entries.empty?

    entries.select { |e| e[:bot] }.each { |e| e[:top_speed] *= BOT_FUERZA; e[:acceleration] *= BOT_FUERZA; e[:sin_recuperar] = true } if entries.any? { |e| !e[:bot] }

    ActionCable.server.broadcast("race_#{race_id}", {
      type: "race_started",
      favoritos: race.favoritos,
      participants: entries.map { |e| { id: e[:horse].id, name: e[:horse].name, username: e[:username] } }
    })

    sleep countdown

    distance = race.distance.to_f
    clock = 0.0

    loop do
      leer_impulsos(entries, clock, race_id)
      impulsos_de_bots(entries, clock, race_id)
      advance(entries, distance, clock)
      anotar_puestos(entries)
      clock += TICK_INTERVAL

      # Por el canal va el porcentaje recorrido: las vistas no dependen de la distancia.
      ActionCable.server.broadcast("race_#{race_id}", {
        type: "progress",
        participants: entries.map { |e| { id: e[:horse].id, position: (e[:horse].position / distance * 100).round(2) } }
      })

      winner = first_to_arrive(entries, distance)

      if winner
        pozo = 0
        second = (entries - [ winner ]).max_by { |e| e[:reached] }
        Race.transaction do
          save_final_ranks(entries, winner)
          race.update!(status: :finished, winner_name: winner[:horse].name, finished_at: Time.current,
                       win_margin: second ? margen_al_cruzar(winner, second, distance) : nil,
                       winner_low_rank: winner[:peor_puesto])
          pozo = race.pagar_al_ganador!(winner[:participant])
        end

        ActionCable.server.broadcast("race_#{race_id}", {
          type: "finished",
          winner: { id: winner[:horse].id, name: winner[:horse].name, username: winner[:username] },
          pozo: pozo
        })

        break
      end

      sleep TICK_INTERVAL
    end
  end

  private

  # Los poderes lanzados llegan por la web (ImpulsosController) y quedan en la base.
  def leer_impulsos(entries, clock, race_id)
    actuales = Participant.where(id: entries.map { |e| e[:participant].id }).pluck(:id, :impulsos).to_h
    entries.each do |e|
      nuevos = actuales[e[:participant].id].to_i - e[:impulsos]
      next unless nuevos.positive?
      e[:impulsos] += nuevos
      lanzar(e, clock, race_id)
    end
  end

  # Los que no son jugadores (apostadores de relleno y bots) también lanzan, de vez en cuando y sin exagerar.
  def impulsos_de_bots(entries, clock, race_id)
    entries.each do |e|
      next unless e[:bot] && clock - e[:impulso_desde] > BOT_IMPULSO_MIN
      lanzar(e, clock, race_id) if rand < TICK_INTERVAL / BOT_IMPULSO_CADA
    end
  end

  # Todos los que miran ven arder al caballo.
  def lanzar(e, clock, race_id)
    e[:impulso_desde] = clock
    ActionCable.server.broadcast("race_#{race_id}", { type: "impulso", id: e[:horse].id, segundos: IMPULSO_SEC })
  end

  # Cuánto suma el poder ahora: sube de a poco y se apaga en el último medio segundo.
  def impulso(e, clock)
    t = clock - e[:impulso_desde]
    return 0.0 unless t >= 0 && t < IMPULSO_SEC
    IMPULSO * [ t / IMPULSO_RAMPA, 1.0 ].min * [ (IMPULSO_SEC - t) / 0.5, 1.0 ].min
  end

  def advance(entries, distance, clock)
    leader = entries.map { |e| e[:horse].position }.max
    avance = (leader / distance).clamp(0.0, 1.0)
    # En el último tercio los de atrás recuperan cada vez más: el pelotón llega junto.
    final = [ (avance - 0.6) / 0.4, 0 ].max**2
    catch_up = CATCH_UP + (CATCH_UP_FINAL - CATCH_UP) * final
    entries.each do |e|
      # En el final las olas se calman un poco: el pelotón llega apretado y se define por poco.
      ola = Math.sin(clock * 2 * Math::PI / e[:periodo] + e[:fase]) * OLA * (1 - 0.5 * final)
      impulso = impulso(e, clock)
      target = e[:top_speed] + (e[:sin_recuperar] ? 0 : (leader - e[:horse].position) * catch_up) + ola + impulso + rand(SURGE)
      e[:speed] += (target - e[:speed]).clamp(-MAX_SLOWDOWN, e[:acceleration] * TICK_INTERVAL + impulso)
      e[:previa] = e[:horse].position
      e[:reached] = e[:horse].position + e[:speed] * TICK_INTERVAL
      e[:horse].position = [ e[:reached], distance ].min
    end
  end

  # Metros que le faltaban al segundo en el instante en que el ganador cruzó (dentro del tick, interpolando): a 120 m/s
  # un tick son 36 m y comparar posiciones al final del tick exageraría la diferencia.
  def margen_al_cruzar(winner, second, distance)
    tramo = winner[:reached] - winner[:previa]
    f = tramo.positive? ? ((distance - winner[:previa]) / tramo).clamp(0.0, 1.0) : 1.0
    segundo = second[:previa] + (second[:reached] - second[:previa]) * f
    [ distance - segundo, 0.0 ].max.round(2)
  end

  # El peor puesto de cada uno durante la carrera: para saber si el ganador remontó.
  def anotar_puestos(entries)
    entries.sort_by { |e| -e[:horse].position }.each_with_index do |e, i|
      e[:peor_puesto] = [ e[:peor_puesto], i + 1 ].max if e[:horse].position.positive?
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
