# Liquida las apuestas por bots que ya vencieron: el día al pasar las 00:00 de Chile y la temporada al cerrarla.
class LiquidarApuestasJob < ApplicationJob
  queue_as :default

  def perform = Apuesta.liquidar_vencidas
end
