class Race < ApplicationRecord
  SLUG_ADJECTIVES = %w[swift bold wild dark golden silver crimson].freeze
  SLUG_ANIMALS    = %w[fox wolf hawk eagle tiger bear].freeze

  enum :status, { pending: 0, running: 1, finished: 2 }

  belongs_to :creator, class_name: "User", optional: true
  has_many   :participants, dependent: :destroy
  has_many   :users, through: :participants

  validates :slug, presence: true, uniqueness: true,
                   format: { with: /\A[a-z0-9-]+\z/, message: "solo letras minúsculas, números y guiones" }
  validates :capacity, inclusion: { in: 2..12 }

  before_validation :generate_slug, on: :create

  def to_param = slug

  def full? = participants.count >= capacity

  def start!
    return false unless pending?
    update!(status: :running, started_at: Time.current)
    RaceSimulationJob.perform_later(id)
    true
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

  def self.build_with_participants(horse_ids: nil)
    horses = horse_ids ? Horse.all.select { |h| horse_ids.include?(h.id) } : Horse.all
    race = new
    race.instance_variable_set(:@participants, horses)
    race
  end
end
