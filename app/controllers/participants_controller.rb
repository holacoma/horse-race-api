class ParticipantsController < WebController
  before_action :require_login

  def create
    race  = Race.find_by!(slug: params[:race_slug])
    horse = Horse.find(params[:horse_id].to_i)

    return render json: { error: "Caballo no encontrado" }, status: :not_found unless horse

    if params.key?(:guest_name)
      return render json: { error: "Solo el creador puede agregar apostadores" }, status: :forbidden \
        unless race.creator_id == current_user.id

      participant = race.participants.build(
        name: params[:guest_name].to_s.strip.presence || race.random_bettor_name,
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

    participant.announce_joined

    race.reload.start! if race.full? && race.pending?

    render json: { ok: true, race_started: race.running?, participant: { horse_id: horse.id, horse_name: horse.name, display_name: participant.display_name } }
  end
end
