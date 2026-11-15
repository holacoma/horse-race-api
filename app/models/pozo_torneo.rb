# Lo que las apuestas dejan sin repartir en una temporada; el torneo de brackets de su final saldrá de aquí.
class PozoTorneo < ApplicationRecord
  self.table_name = "pozos_torneo"

  def self.monto_de(temporada) = find_by(temporada: temporada)&.monto.to_i

  def self.sumar(temporada, monto)
    return if monto <= 0

    pozo = find_or_create_by!(temporada: temporada)
    where(id: pozo.id).update_all([ "monto = monto + ?", monto ])
  end
end
