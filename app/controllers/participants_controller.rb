class ParticipantsController < WebController
  before_action :require_login

  def create
    race  = Race.find_by!(slug: params[:race_slug])
    horse = Horse.find(params[:horse_id].to_i)

    return render json: { error: "Caballo no encontrado" }, status: :not_found unless horse

    if params[:guest_name].present?
      return render json: { error: "Solo el creador puede agregar apostadores" }, status: :forbidden \
        unless race.creator_id == current_user.id

      participant = race.participants.build(
        name: params[:guest_name].strip,
        horse_id: horse.id,
        horse_name: horse.name
      )
    else
      participant = race.participants.build(
        user: current_user,
        horse_id: horse.id,
        horse_name: horse.name
      )
    end

    unless participant.save
      return render json: { error: participant.errors.full_messages.first }, status: :conflict
    end

    ActionCable.server.broadcast("race_#{race.id}", {
      type: "player_joined",
      participant: { username: participant.display_name, horse_name: horse.name, horse_id: horse.id }
    })

    render json: { ok: true, participant: { horse_name: horse.name, display_name: participant.display_name } }
  end
end
