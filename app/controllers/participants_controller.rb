class ParticipantsController < WebController
  before_action :require_login

  def create
    race  = Race.find_by!(slug: params[:race_slug])
    horse = Horse.find(params[:horse_id].to_i)

    return render json: { error: "Caballo no encontrado" }, status: :not_found unless horse

    participant = race.participants.build(user: current_user, horse_id: horse.id, horse_name: horse.name)

    unless participant.save
      return render json: { error: participant.errors.full_messages.first }, status: :conflict
    end

    ActionCable.server.broadcast("race_#{race.id}", {
      type: "player_joined",
      participant: { username: current_user.username, horse_name: horse.name, horse_id: horse.id }
    })

    render json: { ok: true, participant: { horse_name: horse.name } }
  end
end
