class Race < ApplicationRecord
  SLUG_ADJECTIVES = %w[swift bold wild dark golden silver crimson].freeze
  SLUG_ANIMALS    = %w[fox wolf hawk eagle tiger bear].freeze
  DISTANCE_RANGE  = (100..20_000)
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

  belongs_to :creator, class_name: "User", optional: true
  has_many   :participants, dependent: :destroy
  has_many   :users, through: :participants

  validates :slug, presence: true, uniqueness: true,
                   format: { with: /\A[a-z0-9-]+\z/, message: "solo letras minúsculas, números y guiones" }
  validates :capacity, inclusion: { in: 2..12 }
  # El máximo solo evita que un valor enviado a mano deje un job corriendo durante horas.
  validates :distance, numericality: { only_integer: true, in: DISTANCE_RANGE }

  before_validation :generate_slug, on: :create

  def to_param = slug

  def full? = participants.count >= capacity

  def available_bettor_names = BETTOR_NAMES - participants.pluck(:name)

  def random_bettor_name = available_bettor_names.sample

  def start!(countdown: RaceSimulationJob::PRELUDE_SEC)
    return false unless pending?
    update!(status: :running, started_at: Time.current)
    RaceSimulationJob.perform_later(id, countdown)
    true
  end

  # Las carreras terminadas antes de guardar final_rank solo conocen al ganador.
  def results
    participants.includes(:user).sort_by do |participant|
      [ participant.final_rank || capacity + 1, participant.horse_name == winner_name ? 0 : 1 ]
    end
  end

  def available_horses
    taken = participants.pluck(:horse_id)
    Horse.all.reject { |h| taken.include?(h.id) }
  end

  def generate_slug
    return if slug.present?
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
