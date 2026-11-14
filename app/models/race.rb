class Race < ApplicationRecord
  SLUG_ADJECTIVES = %w[swift bold wild dark golden silver crimson].freeze
  SLUG_ANIMALS    = %w[fox wolf hawk eagle tiger bear].freeze
  DISTANCE_RANGE  = (100..20_000)
  BET_RANGE       = (1..1000) # USD por caballo; 40 por defecto
  PREMIO_MULTIPLICADOR = 2    # el ganador cobra el doble del pozo
  # Hora límite para largar: si el creador larga antes, cada jugador cobra un bono; si se espera a la hora y larga
  # sola, el premio se multiplica por 10.
  BONO_ANTICIPADO      = 20
  PREMIO_A_TIEMPO      = 10
  ESPERAS              = [ 2, 5, 10, 15 ].freeze # minutos que se pueden elegir al armar la sala
  PISTAS = {
    "pradera" => "Pradera", "desierto" => "Desierto", "nevado" => "Nevado"
  }.freeze
  # Travesía: dura días; los caballos avanzan solos y al final la carrera se pone intensa.
  TRAVESIA_DIAS       = (1..3)
  TRAVESIA_FINAL      = 2.minutes  # lo que dura la parte intensa, preludio incluido
  TRAVESIA_DISTANCIA  = 12_000     # metros de la parte intensa
  TRAVESIA_KMH        = 30.0       # a qué ritmo avanza el pelotón
  TRAVESIA_VENTAJA    = 0.04       # la ventaja que se trae, como mucho, en fracción de la recta final
  # Más nombres que la capacidad máxima de una sala (12), para que nunca se agoten.
  BETTOR_NAMES = [
    "Don Corazonada", "Doña Suerte", "Tío Quiniela", "Juan Sin Suerte", "Capitán Deuda",
    "Doctor Fiado", "Conde del Vuelto", "Lady Propina", "Barón Sin Plata", "Mañana Pago",
    "Pago en Cuotas", "Casi Gano", "Ganador Moral", "Otra Vez Pierdo", "Todo al Rojo",
    "El Que Invita", "El Cabulero", "Sin Un Peso", "Apuesta y Reza", "La Última y Me Voy",
    "Yo Te Avisé", "Dame Otra", "Hoy Sí Gano", "El Sabelotodo", "Tía Fortuna",
    "Don Fiado", "Señor Pérdidas", "Vuelvo Mañana", "Rey del Empate", "Pierde y Paga"
  ].freeze
  # Un carrete por lista en la tragamonedas de "Nueva sala": el nombre es lugar + apodo.
  ROOM_NAME_REELS = [
    %w[Cuadra Hipódromo Establo Club Pista Rancho Corral Taberna Garito Salón Picadero Potrero],
    [ "del Fiado", "Sin Plata", "de Suerte", "del Vuelto", "Mañana Pago", "de Deuda",
      "del Empate", "Sin Salida", "Casi Gano", "y Reza", "Pierde Todo", "a Crédito" ]
  ].freeze

  enum :status, { pending: 0, running: 1, finished: 2 }
  enum :kind, { carrera: "carrera", travesia: "travesia" }

  belongs_to :creator, class_name: "User", optional: true
  has_many   :participants, dependent: :destroy
  has_many   :users, through: :participants

  validates :slug, presence: true, uniqueness: true,
                   format: { with: /\A[a-z0-9-]+\z/, message: "solo letras minúsculas, números y guiones" }
  validates :capacity, inclusion: { in: 2..12 }
  # El máximo solo evita que un valor enviado a mano deje un job corriendo durante horas.
  validates :distance, numericality: { only_integer: true, in: DISTANCE_RANGE }
  validates :bet, numericality: { only_integer: true, in: BET_RANGE }
  validates :pista, inclusion: { in: PISTAS.keys }
  validates :ends_at, presence: true, if: :travesia?

  scope :abiertas, -> { where(is_public: true, status: :pending) }

  before_validation :generate_slug, on: :create
  after_create_commit :agendar

  def to_param = slug

  # Lo que pasa solo: la largada a la hora límite, la recta final de la travesía y los avisos de antes.
  def agendar
    if travesia?
      TravesiaFinalJob.set(wait_until: final_desde).perform_later(id)
      AvisoJob.set(wait_until: final_desde - 5.minutes).perform_later(id) if final_desde - 5.minutes > Time.current
    elsif starts_at
      LargadaJob.set(wait_until: starts_at).perform_later(id)
      AvisoJob.set(wait_until: starts_at - 1.minute).perform_later(id) if starts_at - 1.minute > Time.current
    end
  end

  def full? = participants.count >= capacity

  def available_bettor_names = BETTOR_NAMES - participants.pluck(:name)

  def random_bettor_name = available_bettor_names.sample

  # Lo apostado por todos los que entraron.
  def pozo = participants.sum(:stake)

  # El ganador cobra el doble de todo lo apostado: así el juego genera dinero. Si ganó un apostador de relleno,
  # no cobra nadie.
  def premio = pozo * (largada == "a_tiempo" ? PREMIO_A_TIEMPO : PREMIO_MULTIPLICADOR)

  def pagar_al_ganador!(ganador)
    monto = premio
    ganador.update!(payout: monto)
    User.where(id: ganador.user_id).update_all([ "balance = balance + ?", monto ]) if ganador.user_id
    monto
  end

  # Largar. Con hora límite: antes de la hora, bono para cada jugador; a la hora (la larga LargadaJob), premio x10.
  def start!(countdown: RaceSimulationJob::PRELUDE_SEC, a_tiempo: false)
    return false unless pending?
    modo = modo_de_largada(a_tiempo)
    transaction do
      update!(status: :running, started_at: Time.current, largada: modo)
      pagar_bono_anticipado! if modo == "antes"
    end
    RaceSimulationJob.perform_later(id, countdown)
    true
  end

  def modo_de_largada(a_tiempo)
    return if travesia?
    return "a_tiempo" if a_tiempo
    "antes" if starts_at && Time.current < starts_at
  end

  def pagar_bono_anticipado!
    User.where(id: participants.where.not(user_id: nil).select(:user_id)).update_all([ "balance = balance + ?", BONO_ANTICIPADO ])
  end

  # Segundos que faltan para la hora límite (carrera) o para que se ponga intensa (travesía).
  def segundos_para_largar(at = Time.current)
    hora = travesia? ? final_desde : starts_at
    hora && [ (hora - at).round, 0 ].max
  end

  # Los lugares libres se llenan con apostadores de relleno.
  def llenar_con_apostadores!
    (capacity - participants.count).times do |i|
      horse = available_horses.sample or break
      participants.create!(name: random_bettor_name || "Apostador #{i + 1}", horse_id: horse.id, horse_name: horse.name).announce_joined
    end
    reload
  end

  # ── Travesía ──────────────────────────────────────────────────────────────────────────────────────────────────────

  def self.armar_travesia!(dias:, **atributos)
    dias = dias.to_i.clamp(TRAVESIA_DIAS.min, TRAVESIA_DIAS.max)
    ahora = Time.current
    create!(**atributos, kind: :travesia, distance: TRAVESIA_DISTANCIA, starts_at: ahora, ends_at: ahora + dias.days)
  end

  def travesia_dias = travesia? ? ((ends_at - starts_at) / 1.day).round : nil
  def travesia_dia(at = Time.current) = (((at - starts_at) / 1.day).floor + 1).clamp(1, travesia_dias)
  # Cuándo empieza la parte intensa: la recta final se corre en vivo, del lado dark.
  def final_desde = ends_at - TRAVESIA_FINAL
  def travesia_avance(at = Time.current) = ((at - starts_at) / (final_desde - starts_at)).clamp(0.0, 1.0)

  # Kilómetros recorridos por cada caballo: [horse_id, km]. Sale de una fórmula con semilla, igual para todos los que
  # miran: el pelotón avanza parejo, cada uno sube y baja con olas de horas (así hay sobrepasos) y al final se juntan.
  def travesia_posiciones(at = Time.current)
    hasta = [ at, final_desde ].min
    participants.map { |p| [ p.horse_id, travesia_km(p.horse_id, hasta) + p.travesia_offset ] }.sort_by { |_, km| -km }
  end

  def travesia_km(horse_id, at)
    horas = [ (at - starts_at) / 1.hour, 0 ].max
    total = (final_desde - starts_at) / 1.hour
    p = (horas / total).clamp(0.0, 1.0)
    rng = Random.new(id * 104_729 + horse_id.to_i)
    sesgo = (rng.rand - 0.5) * 0.6 # km/h de más o de menos
    olas = [ 7.0, 3.1, 1.3 ].sum { |periodo| Math.sin(2 * Math::PI * horas / periodo + rng.rand * 6.283) * periodo / 7.0 }
    juntarse = 1 - 0.85 * p**2
    TRAVESIA_KMH * horas + (sesgo * horas + 4.0 * olas) * juntarse
  end

  # El que entra tarde arranca a la par del último.
  def offset_para_nuevo(horse_id, at = Time.current)
    otros = participants.where.not(horse_id: horse_id).map { |p| travesia_km(p.horse_id, at) + p.travesia_offset }
    return 0.0 if otros.empty? || at < starts_at + 1.minute
    otros.min - travesia_km(horse_id, at) - 0.2
  end

  # Metros de ventaja con que cada caballo empieza la parte intensa: lo que traía, comprimido.
  def ventajas_finales
    return {} unless travesia?
    pos = travesia_posiciones(final_desde).to_h
    min, max = pos.values.minmax
    rango = (max - min).positive? ? max - min : 1.0
    pos.transform_values { |km| ((km - min) / rango * TRAVESIA_VENTAJA * distance).round(1) }
  end

  # Adelantar al final (usuario especial): la parte intensa empieza en unos segundos.
  def adelantar_al_final!(en: 20.seconds)
    return false unless travesia? && pending?
    update!(ends_at: Time.current + en + TRAVESIA_FINAL)
    TravesiaFinalJob.set(wait_until: final_desde).perform_later(id)
    AvisoJob.perform_later(id)
    true
  end

  # Las carreras terminadas antes de guardar final_rank solo conocen al ganador.
  def results
    participants.includes(:user).sort_by do |participant|
      [ participant.final_rank || capacity + 1, participant.horse_name == winner_name ? 0 : 1 ]
    end
  end

  # Las fuerzas de cada caballo salen de una semilla de la carrera, no del azar al largar: así se sabe de antemano
  # quiénes son los favoritos (los más rápidos), aunque el empuje de cada tramo siga siendo al azar.
  def fuerzas_de(horse_id)
    rng = Random.new(id * 7919 + horse_id.to_i)
    { acceleration: rng.rand(RaceSimulationJob::ACCELERATION), top_speed: rng.rand(RaceSimulationJob::TOP_SPEED) }
  end

  def favoritos(cuantos = 3)
    participants.map(&:horse_id).sort_by { |h| f = fuerzas_de(h); [ -f[:top_speed], -f[:acceleration] ] }.first(cuantos)
  end

  # Libres: ni el caballo ni su elemento están en la sala, así no se repiten colores en la carrera.
  def available_horses
    taken = participants.pluck(:horse_id)
    elementos = taken.map { |id| Horse.elemento_de(id) }
    Horse.all.reject { |h| taken.include?(h.id) || elementos.include?(h.elemento) }
  end

  # Un nombre elegido en la tragamonedas que ya usó otra sala lleva un número: "rancho-sin-salida-2".
  def generate_slug
    if slug.present?
      base = slug
      n = 1
      self.slug = "#{base}-#{n += 1}" while Race.exists?(slug: slug)
      return
    end
    loop do
      self.slug = "#{SLUG_ADJECTIVES.sample}-#{SLUG_ANIMALS.sample}-#{rand(100)}"
      break unless Race.exists?(slug: slug)
    end
  end

  # Las salas no se borran y hay 144 combinaciones: agotadas, el nombre lleva un sufijo en la URL.
  def self.pick_room_name
    taken = pluck(:slug)
    free  = ROOM_NAME_REELS.first.product(ROOM_NAME_REELS.last)
                           .reject { |words| taken.include?(words.join(" ").parameterize) }
    words = free.sample || ROOM_NAME_REELS.map(&:sample)
    slug  = words.join(" ").parameterize
    slug  = "#{slug}-#{SecureRandom.hex(2)}" if free.empty?

    { words: words, slug: slug }
  end

  def self.build_with_participants(horse_ids: nil)
    horses = horse_ids ? Horse.all.select { |h| horse_ids.include?(h.id) } : Horse.all
    race = new
    race.instance_variable_set(:@participants, horses)
    race
  end
end
