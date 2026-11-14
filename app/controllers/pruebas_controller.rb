# Banco de pruebas: la carrera intensa sin sala, sin apuesta y sin servidor. La simulación corre en el navegador
# (prueba_carrera_controller.js) para probar el poder, la música y la escena todas las veces que haga falta.
# En producción, solo para admins.
class PruebasController < WebController
  before_action :require_login
  before_action :solo_admin

  CABALLOS = 8

  def carrera
    mio = current_user.favorite_horse_id || 1
    otros = Horse.all.map(&:id).reject { |id| id == mio || Horse.elemento_de(id) == Horse.elemento_de(mio) }
    ids = [ mio, *otros.uniq { |id| Horse.elemento_de(id) }.sample(CABALLOS - 1) ]
    @caballos = ids.map { |id| Horse.find(id) }
    @mio = mio
    @pista = Race::PISTAS.key?(params[:pista]) ? params[:pista] : Race::PISTAS.keys.sample
  end

  private

  def solo_admin
    head :forbidden if Rails.env.production? && !current_user.admin?
  end
end
