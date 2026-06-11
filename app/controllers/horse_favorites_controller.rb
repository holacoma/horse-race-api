class HorseFavoritesController < WebController
  before_action :require_login

  def create
    horse = Horse.find(params[:horse_id].to_i)
    return render json: { error: "Caballo no encontrado" }, status: :not_found unless horse

    fav = current_user.horse_favorites.find_or_initialize_by(horse_id: horse.id)
    fav.new_record? ? fav.save! : fav.destroy

    if request.headers["HX-Request"]
      render_htmx_response
    else
      render json: { favorited: current_user.horse_favorites.exists?(horse_id: horse.id) }
    end
  end

  def destroy
    fav = current_user.horse_favorites.find(params[:id])
    fav.destroy
    render json: { favorited: false }
  end

  private

  def render_htmx_response
    q = params[:q].to_s.strip.downcase
    favorites = current_user.horse_favorites.order(created_at: :desc).map { |f| Horse.find(f.horse_id) }.compact
    favorited_ids = Set.new(favorites.map(&:id))
    available = Horse.all.reject { |h| favorited_ids.include?(h.id) }
    search_results = q.present? ? available.select { |h| h.name.downcase.include?(q) }.first(5) : available.first(5)
    render partial: "horse_favorites/section", locals: {
      favorites: favorites,
      is_own_profile: true,
      query: params[:q].to_s,
      search_results: search_results,
      favorited_all: available.empty?
    }
  end
end
