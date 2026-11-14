# Avisa a todos los que tienen el juego abierto que una carrera está por empezar.
class AvisoJob < ApplicationJob
  queue_as :default

  def perform(race_id)
    race = Race.find_by(id: race_id)
    return unless race&.pending? && race.is_public
    segundos = race.segundos_para_largar
    return if segundos.nil? || segundos > 6.minutes
    cuerpo = race.travesia? ? "La travesía se pone intensa en #{(segundos / 60.0).ceil} min" : "Inicia en #{segundos} s"
    ActionCable.server.broadcast("avisos", { type: "por_empezar", titulo: race.slug.tr("-", " "), cuerpo: cuerpo,
                                             url: Rails.application.routes.url_helpers.race_path(race) })
  end
end
