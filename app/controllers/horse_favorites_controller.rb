class HorseFavoritesController < WebController
  before_action :require_login

  def create
    horse = Horse.find(params[:horse_id].to_i)
    return render json: { error: "Caballo no encontrado" }, status: :not_found unless horse

    fav = current_user.horse_favorites.find_or_initialize_by(horse_id: horse.id)
    if fav.new_record?
      fav.save!
      render json: { favorited: true }
    else
      fav.destroy
      render json: { favorited: false }
    end
  end

  def destroy
    fav = current_user.horse_favorites.find(params[:id])
    fav.destroy
    render json: { favorited: false }
  end
end
