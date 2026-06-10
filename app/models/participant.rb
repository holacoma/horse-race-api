class Participant < ApplicationRecord
  belongs_to :race
  belongs_to :user

  validates :race_id, uniqueness: { scope: :user_id,  message: "ya eres participante de esta sala" }
  validates :horse_id, uniqueness: { scope: :race_id, message: "ese caballo ya fue tomado" }
end
