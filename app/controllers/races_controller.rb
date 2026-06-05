class RacesController < ApplicationController
  def create
    horse_ids = params[:horse_ids]&.map(&:to_i)
    race = Race.create!(status: :pending)
    render json: { id: race.id, status: race.status }, status: :created
  end

  def show
    race = Race.find(params[:id])
    render json: {
      id: race.id,
      status: race.status,
      winner_name: race.winner_name,
      horses: Horse.all.map { |h| { id: h.id, name: h.name } }
    }
  end

  def start
    race = Race.find(params[:id])

    if race.pending?
      race.update!(status: :running, started_at: Time.current)
      RaceSimulationJob.perform_later(race.id)
      render json: { id: race.id, status: race.status }
    else
      render json: { error: "Race already #{race.status}" }, status: :unprocessable_entity
    end
  end
end
