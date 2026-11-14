class ProfilesController < WebController
  before_action :require_login

  def show
    @profile_user   = current_user.username == params[:username] ? current_user : User.find_by!(username: params[:username])
    @is_own_profile = @profile_user == current_user
    @favorito       = @profile_user.favorite_horse
    @race_history   = Participant.where(user: @profile_user)
                                 .joins(:race)
                                 .where(races: { status: :finished })
                                 .includes(:race)
                                 .order("races.finished_at DESC")

    respond_to do |format|
      format.html
      format.json do
        wins = @race_history.count { |p| p.race.winner_name == p.horse_name }
        render json: {
          username: @profile_user.username,
          avatar_url: @profile_user.avatar_url,
          favorites: [ @favorito&.name ].compact,
          total_races: @race_history.size,
          wins: wins
        }
      end
    end
  end
end
