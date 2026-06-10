class Participant < ApplicationRecord
  belongs_to :race
  belongs_to :user, optional: true

  validates :race_id, uniqueness: { scope: :user_id, message: "ya eres participante de esta sala" },
                      if: -> { user_id.present? }
  validates :horse_id, uniqueness: { scope: :race_id, message: "ese caballo ya fue tomado" }
  validates :name, presence: true, unless: -> { user_id.present? }

  def display_name
    user&.username || name
  end
end
