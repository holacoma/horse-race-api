# Lo que un caballo hizo en todas sus carreras terminadas: para su ficha y para el inicio. No se guarda nada aparte.
class Caballo
  attr_reader :horse

  delegate :id, :name, :elemento, to: :horse

  def self.participaciones_terminadas
    Participant.joins(:race).where(races: { status: Race.statuses[:finished] })
  end

  # Las carreras viejas no guardaban el puesto: solo se sabe quién ganó.
  def self.puesto(final_rank, horse_name, winner_name)
    final_rank || (horse_name == winner_name ? 1 : nil)
  end

  def initialize(horse)
    @horse = horse
  end

  def participaciones
    @participaciones ||= self.class.participaciones_terminadas.where(horse_id: id).includes(:race)
                             .order("races.finished_at DESC").to_a
  end

  def puestos = @puestos ||= participaciones.map { |p| self.class.puesto(p.final_rank, p.horse_name, p.race.winner_name) }

  def carreras  = participaciones.size
  def victorias = puestos.count(1)
  def podios    = puestos.count { |p| p && p <= 3 }
  # Victorias seguidas, contando desde la última carrera.
  def racha     = puestos.take_while { |p| p == 1 }.size
  def ultimas(n = 8) = puestos.first(n)

  # Lo que ganó (o perdió) ese jugador apostando a este caballo: lo cobrado menos lo apostado.
  def te_hizo_ganar(user)
    participaciones.select { |p| p.user_id == user.id }.sum { |p| p.payout - p.stake }
  end

  # Cómo ganó cada victoria, la más nueva primero.
  def como_gano(n = 3)
    participaciones.each_with_index.select { |_, i| puestos[i] == 1 }.first(n).map do |p, _|
      { titulo: self.class.como_gano(p.race), sala: p.race.slug, cuando: p.race.finished_at, cobro: p.payout,
        rivales: p.race.capacity - 1 }
    end
  end

  def self.como_gano(race)
    margen, peor = race.win_margin, race.winner_low_rank
    if peor && peor >= 4 then "Remontó del #{peor}.º al 1.º"
    elsif margen && margen < 6 then "Ganó por una cabeza" # a 120 m/s, 6 m son 0,05 s
    elsif peor == 1 then "De punta a punta"
    elsif margen then "Ganó por #{margen.round} m"
    else "Ganó"
    end
  end
end
