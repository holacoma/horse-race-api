# A la hora límite, la carrera larga sola: se llenan los lugares libres y el premio se multiplica por 10.
class LargadaJob < ApplicationJob
  queue_as :default

  def perform(race_id)
    race = Race.find_by(id: race_id)
    return unless race&.carrera? && race.pending? && race.starts_at
    return if race.starts_at > Time.current + 2.seconds # se cambió la hora: lo largará otro aviso
    race.llenar_con_apostadores!
    race.start!(a_tiempo: true)
  end
end
