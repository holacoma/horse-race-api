# Al llegar la parte intensa de una travesía, larga la recta final: se llenan los lugares libres y corre la carrera
# de siempre, cada caballo con la ventaja que traía.
class TravesiaFinalJob < ApplicationJob
  queue_as :default

  def perform(race_id)
    race = Race.find_by(id: race_id)
    return unless race&.travesia? && race.pending?
    return if race.final_desde > Time.current + 2.seconds # la adelantaron o la atrasaron: hay otro aviso en cola
    race.llenar_con_apostadores!
    race.start!
  end
end
