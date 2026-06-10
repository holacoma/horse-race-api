class ProfilesController < WebController
  layout false
  before_action :require_login

  def show
    @profile_user = User.find_by!(username: params[:username])
    @favorites = @profile_user.horse_favorites.order(created_at: :desc)
                              .map { |f| Horse.find(f.horse_id) }.compact
    @my_favorites = current_user == @profile_user ? @profile_user.horse_favorites.pluck(:horse_id) : []
    @race_history = Participant.where(user: @profile_user)
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
          favorites: @favorites.first(3).map(&:name),
          total_races: @race_history.size,
          wins: wins
        }
      end
    end
  end
end
