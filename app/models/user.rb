class User < ApplicationRecord
  # Un carrete por lista en la tragamonedas de invitado: el nombre es título + apodo.
  GUEST_NAME_REELS = [
    %w[Don Doña Capitán Doctor Conde Lady Barón Tío Tía Señor Rey Jinete],
    [ "Corazonada", "Fiado", "Sin Plata", "del Vuelto", "Propina", "Galope",
      "Sin Suerte", "Quiniela", "Deuda", "Pérdidas", "del Empate", "en Cuotas" ]
  ].freeze

  has_many :horse_favorites, dependent: :destroy

  validates :username, presence: true

  def self.from_omniauth(auth)
    find_or_create_by(provider: auth.provider, uid: auth.uid) do |u|
      u.username   = auth.info.name
      u.email      = auth.info.email
      u.avatar_url = auth.info.image
    end
  end

  def self.create_guest!(username)
    create!(username: username)
  end

  def guest?
    provider.nil?
  end

  def favorite_horse_ids
    horse_favorites.order(created_at: :desc).limit(3).pluck(:horse_id)
  end
end
