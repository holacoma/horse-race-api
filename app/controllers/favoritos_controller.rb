# Elegir tu favorito: el caballo que te espera en el inicio y con el que entrás en «Jugar ya». Uno solo.
class FavoritosController < WebController
  before_action :require_login

  def edit
    # Los tres caballos de cada elemento van juntos.
    @caballos = Horse.all.sort_by { |h| [ Horse::ELEMENTOS.index(h.elemento), h.id ] }
  end

  def update
    horse = Horse.find(params[:horse_id].to_i)
    return redirect_to(favorito_path, alert: "Ese caballo no existe.") unless horse
    current_user.update!(favorite_horse_id: horse.id)
    redirect_to(params[:volver] == "ficha" ? caballo_path(horse.id) : root_path)
  end
end
