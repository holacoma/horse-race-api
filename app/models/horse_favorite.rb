class HorseFavorite < ApplicationRecord
  belongs_to :user
  validates :horse_id, uniqueness: { scope: :user_id }
end
