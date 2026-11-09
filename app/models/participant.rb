class Participant < ApplicationRecord
  belongs_to :race
  belongs_to :user, optional: true

  validates :race_id, uniqueness: { scope: :user_id, message: "ya eres participante de esta sala" },
                      if: -> { user_id.present? }
  validates :horse_id, uniqueness: { scope: :race_id, message: "ese caballo ya fue tomado" }
  validates :name, presence: true, unless: -> { user_id.present? }
  validate :elemento_libre, on: :create
  # Entrar cuesta la apuesta base de la sala. A un jugador se le descuenta de su saldo (si no le alcanza, no entra);
  # los apostadores de relleno también ponen la suya, así el pozo vale la pena aunque juegues con bots.
  before_create :pagar_apuesta

  def pagar_apuesta
    self.stake = race.bet
    return unless user_id
    cobrado = User.where(id: user_id).where("balance >= ?", stake).update_all([ "balance = balance - ?", stake ])
    return if cobrado == 1
    errors.add(:base, "No te alcanza: la apuesta de esta sala es #{stake} USD y tenés #{user.reload.balance} USD")
    throw :abort
  end

  # En una sala no se repiten elementos: cada caballo se distingue por su color.
  def elemento_libre
    elemento = Horse.elemento_de(horse_id)
    otros = race.participants.where.not(id: id).pluck(:horse_id)
    errors.add(:horse_id, "ya hay un caballo de #{elemento} en la sala") if otros.any? { |h| Horse.elemento_de(h) == elemento }
  end

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
