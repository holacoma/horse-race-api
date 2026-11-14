# Una temporada dura 5 días y empieza a medianoche de Chile. No se guarda: sale del calendario.
# Cuenta las victorias de cada caballo en las carreras que terminaron dentro de ella.
class Temporada
  DURACION = 5.days
  INICIO   = Time.find_zone("America/Santiago").local(2026, 11, 1)

  attr_reader :numero

  def self.actual(at = Time.current) = new(((at - INICIO) / DURACION).floor + 1)

  def initialize(numero)
    @numero = numero
  end

  def desde = INICIO + (numero - 1) * DURACION
  def hasta = desde + DURACION

  # Día de la temporada, del 1 al 5.
  def dia(at = Time.current) = (((at - desde) / 1.day).floor + 1).clamp(1, 5)
  def dias_restantes(at = Time.current) = ((hasta - at) / 1.day).ceil.clamp(0, 5)

  # [[horse_id, victorias, podios], ...] de mejor a peor.
  def tabla
    @tabla ||= begin
      rows = Caballo.participaciones_terminadas.where(races: { finished_at: desde...hasta })
                    .pluck(:horse_id, :final_rank, :horse_name, "races.winner_name")
      puntos = Hash.new { |h, k| h[k] = [ 0, 0 ] }
      rows.each do |horse_id, rank, nombre, ganador|
        puesto = Caballo.puesto(rank, nombre, ganador)
        puntos[horse_id][0] += 1 if puesto == 1
        puntos[horse_id][1] += 1 if puesto && puesto <= 3
      end
      puntos.map { |id, (v, p)| [ id, v, p ] }.sort_by { |id, v, p| [ -v, -p, id ] }
    end
  end

  def lider
    fila = tabla.first
    fila && fila[1].positive? ? Horse.find(fila[0]) : nil
  end

  # Puesto del caballo en la temporada; nil si todavía no corrió en ella.
  def puesto_de(horse_id)
    i = tabla.index { |id, _, _| id == horse_id }
    i && i + 1
  end
end
