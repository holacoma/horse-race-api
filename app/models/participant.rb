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

  # Avisa a la sala que alguien se sumó: la lista lo agrega y su caballo aparece en la largada 3D.
  def announce_joined
    ActionCable.server.broadcast("race_#{race_id}", {
      type: "player_joined",
      participant: { username: display_name, horse_name: horse_name, horse_id: horse_id, profile_username: user&.username }
    })
  end
end
