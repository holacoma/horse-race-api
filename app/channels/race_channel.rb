class RaceChannel < ApplicationCable::Channel
  def subscribed
    race = Race.find_by(id: params[:race_id])
    reject unless race
    stream_from "race_#{params[:race_id]}"
  end

  def unsubscribed
  end
end
