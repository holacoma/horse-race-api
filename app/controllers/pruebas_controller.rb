# Banco de pruebas: la carrera intensa sin sala, sin apuesta y sin servidor. La simulación corre en el navegador
# (prueba_carrera_controller.js) para probar el poder, la música y la escena todas las veces que haga falta.
# Sin login: no toca la base ni la plata de nadie.
class PruebasController < WebController
  CABALLOS = 8

  def carrera
    cuantos = params[:caballos].to_i.clamp(2, CABALLOS) if params[:caballos].present?
    cuantos ||= CABALLOS
    mio = current_user&.favorite_horse_id || 1
    otros = Horse.all.map(&:id).reject { |id| id == mio || Horse.elemento_de(id) == Horse.elemento_de(mio) }
    ids = [ mio, *otros.uniq { |id| Horse.elemento_de(id) }.sample(cuantos - 1) ]
    @caballos = ids.map { |id| Horse.find(id) }
    @mio = mio
    @pista = Race::PISTAS.key?(params[:pista]) ? params[:pista] : Race::PISTAS.keys.sample
  end
end
