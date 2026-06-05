class RaceSimulationJob < ApplicationJob
  queue_as :default

  TICK_INTERVAL = 0.3
  FINISH_LINE = 100.0

  def perform(race_id)
    race = Race.find(race_id)
    return unless race.running?

    horses = Horse.all

    loop do
      horses.each { |h| h.position = [h.position + rand(1.0..8.0), FINISH_LINE].min }

      ActionCable.server.broadcast("race_#{race_id}", {
        type: "progress",
        participants: horses.map { |h| { id: h.id, name: h.name, position: h.position.round(2) } }
      })

      winner = horses.find { |h| h.position >= FINISH_LINE }

      if winner
        race.update!(status: :finished, winner_name: winner.name, finished_at: Time.current)

        ActionCable.server.broadcast("race_#{race_id}", {
          type: "finished",
          winner: { id: winner.id, name: winner.name }
        })

        break
      end

      sleep TICK_INTERVAL
    end
  end
end
