class User < ApplicationRecord
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
end
