# La ficha de un caballo: la pantalla «seria», del lado dark, con su ilustración, sus números y cómo ganó.
class CaballosController < WebController
  before_action :require_login

  def show
    horse = Horse.find(params[:id].to_i) or raise ActiveRecord::RecordNotFound
    @caballo   = Caballo.new(horse)
    @temporada = Temporada.actual
    @es_favorito = current_user.favorite_horse_id == horse.id
  end
end
