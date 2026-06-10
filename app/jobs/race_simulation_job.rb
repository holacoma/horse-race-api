class RaceSimulationJob < ApplicationJob
  queue_as :default

  TICK_INTERVAL = 0.3
  FINISH_LINE   = 100.0
  COUNTDOWN_SEC = 4  # 3-2-1-GO antes de arrancar

  def perform(race_id)
    race = Race.find(race_id)
    return unless race.running?

    entries = race.participants.includes(:user).map do |p|
      { horse: Horse.find(p.horse_id), username: p.display_name }
    end

    return if entries.empty?

    ActionCable.server.broadcast("race_#{race_id}", {
      type: "race_started",
      participants: entries.map { |e| { id: e[:horse].id, name: e[:horse].name, username: e[:username] } }
    })

    sleep COUNTDOWN_SEC

    loop do
      entries.each { |e| e[:horse].position = [ e[:horse].position + rand(1.0..8.0), FINISH_LINE ].min }

      ActionCable.server.broadcast("race_#{race_id}", {
        type: "progress",
        participants: entries.map { |e| { id: e[:horse].id, position: e[:horse].position.round(2) } }
      })

      winner = entries.find { |e| e[:horse].position >= FINISH_LINE }

      if winner
        race.update!(status: :finished, winner_name: winner[:horse].name, finished_at: Time.current)

        ActionCable.server.broadcast("race_#{race_id}", {
          type: "finished",
          winner: { id: winner[:horse].id, name: winner[:horse].name, username: winner[:username] }
        })

        break
      end

      sleep TICK_INTERVAL
    end
  end
end
