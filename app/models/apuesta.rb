# Una apuesta por un bot, en uno de dos mercados con pozo común (parimutuel):
#   dia       — qué bot termina el día (00:00 Chile) con más plata; se apuesta hasta las 18:00 de ese día; solo bots no quebrados.
#   temporada — qué bot va primero por plata al cerrar la temporada; se apuesta hasta el final de su día 2; también quebrados.
# Cada apuesta paga 10 % de impuesto (sale de circulación). Los que aciertan se reparten el resto del mercado en proporción
# a lo apostado; si nadie acierta (o sobra un redondeo), va al pozo del torneo de la temporada.
class Apuesta < ApplicationRecord
  self.table_name = "apuestas"

  MINIMO = 20
  IMPUESTO = 10 # por ciento
  HORA_CIERRE_DIA = 18
  DIAS_TEMPORADA = 2
  MERCADOS = %w[dia temporada].freeze
  ESTADOS = %w[abierta ganada perdida].freeze

  belongs_to :user
  belongs_to :bot, class_name: "User"
  belongs_to :ganador, class_name: "User", optional: true

  validates :mercado, inclusion: { in: MERCADOS }
  validates :estado, inclusion: { in: ESTADOS }
  validates :monto, numericality: { only_integer: true, greater_than_or_equal_to: MINIMO }
  validates :fecha, presence: true, if: -> { mercado == "dia" }
  validate :bot_valido, on: :create
  validate :mercado_abierto, on: :create

  scope :abiertas, -> { where(estado: "abierta") }
  scope :de_mercado, ->(mercado, temporada, fecha) { where(mercado: mercado, temporada: temporada, fecha: mercado == "dia" ? fecha : nil) }

  def self.hoy(at = Time.current) = at.in_time_zone(Bot::ZONA).to_date

  # Hasta cuándo se puede apostar en el mercado que corresponde a `at`.
  def self.cierre(mercado, at = Time.current)
    if mercado == "dia"
      hoy(at).in_time_zone(Bot::ZONA).change(hour: HORA_CIERRE_DIA)
    else
      Temporada.actual(at).desde + DIAS_TEMPORADA.days
    end
  end

  def self.abierto?(mercado, at = Time.current) = at < cierre(mercado, at)

  # Cuándo se liquida el mercado de esta apuesta: pasada la medianoche del día, o al cerrar la temporada.
  def self.vence(mercado, temporada, fecha)
    mercado == "dia" ? fecha.next_day.in_time_zone(Bot::ZONA) : Temporada.new(temporada).hasta
  end

  # Clave del mercado vigente: [mercado, temporada, fecha].
  def self.clave_actual(mercado, at = Time.current)
    [ mercado, Temporada.actual(at).numero, mercado == "dia" ? hoy(at) : nil ]
  end

  # Cobra y crea la apuesta de forma atómica. Devuelve la apuesta (con errores si no se pudo).
  def self.apostar(user:, bot:, mercado:, monto:)
    monto, at = monto.to_i, Time.current
    apuesta = new(user: user, bot: bot, mercado: mercado, monto: monto, impuesto: monto * IMPUESTO / 100,
                  temporada: Temporada.actual(at).numero, fecha: (hoy(at) if mercado == "dia"))
    transaction do
      raise ActiveRecord::Rollback unless apuesta.valid?

      cobrado = User.where(id: user.id).where("balance >= ?", monto).update_all([ "balance = balance - ?", monto ])
      unless cobrado == 1
        apuesta.errors.add(:monto, "supera tu saldo")
        raise ActiveRecord::Rollback
      end
      apuesta.save!
      user.reload
    end
    apuesta
  end

  # Total apostado, neto de impuesto, en un mercado.
  def self.pozo(mercado, temporada, fecha) = de_mercado(mercado, temporada, fecha).sum("monto - impuesto")

  # Lo que pagaría hoy una apuesta de `monto` por `bot` si gana: su parte del pozo con ella dentro.
  def self.pagaria(mercado, temporada, fecha, bot, monto)
    neto = monto - monto * IMPUESTO / 100
    mercado_abierto = de_mercado(mercado, temporada, fecha)
    pozo = mercado_abierto.sum("monto - impuesto") + neto
    en_bot = mercado_abierto.where(bot_id: bot.id).sum("monto - impuesto") + neto
    pozo * neto / en_bot
  end

  # Liquida todos los mercados vencidos que sigan con apuestas abiertas. Idempotente.
  def self.liquidar_vencidas(at = Time.current)
    abiertas.distinct.pluck(:mercado, :temporada, :fecha).count do |mercado, temporada, fecha|
      liquidar(mercado, temporada, fecha, at) if vence(mercado, temporada, fecha) <= at
    end
  end

  def self.liquidar(mercado, temporada, fecha, at = Time.current)
    return false if vence(mercado, temporada, fecha) > at

    transaction do
      apuestas = de_mercado(mercado, temporada, fecha).abiertas.lock.order(:id).to_a
      next false if apuestas.empty?

      ganador = User.bots.order(balance: :desc, id: :asc).first
      next false unless ganador

      acertadas, falladas = apuestas.partition { |a| a.bot_id == ganador.id }
      neto = apuestas.sum { |a| a.monto - a.impuesto }
      base = acertadas.sum(&:monto)
      repartido = 0
      acertadas.each do |a|
        pago = neto * a.monto / base
        repartido += pago
        User.where(id: a.user_id).update_all([ "balance = balance + ?", pago ])
        a.update!(estado: "ganada", pago: pago, ganador: ganador, liquidada_en: at)
      end
      falladas.each { |a| a.update!(estado: "perdida", pago: 0, ganador: ganador, liquidada_en: at) }
      PozoTorneo.sumar(temporada, neto - repartido)
      true
    end
  end

  def abierta? = estado == "abierta"

  private

  def bot_valido
    errors.add(:bot, "no es un bot del club") unless bot&.bot?
    errors.add(:bot, "está quebrado: solo se apuesta por él a la temporada") if bot&.quebrado_desde && mercado == "dia"
  end

  def mercado_abierto
    errors.add(:base, "Este mercado ya cerró.") if MERCADOS.include?(mercado) && !self.class.abierto?(mercado)
  end
end
