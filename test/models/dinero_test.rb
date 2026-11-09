require "test_helper"

# Dinero: todos empiezan con 1000 USD, entrar a una sala cuesta su apuesta base y el ganador se lleva el pozo.
class DineroTest < ActiveSupport::TestCase
  setup do
    @race  = Race.create!(capacity: 4, bet: 40)
    @user  = User.create!(username: "Jinete", provider: "google_oauth2", uid: "1")
    @otra  = User.create!(username: "Rival", provider: "google_oauth2", uid: "2")
  end

  test "un jugador nuevo empieza con 1000 USD y una sala con apuesta de 40" do
    assert_equal 1000, User.create!(username: "Nuevo").balance
    assert_equal 40, Race.new.bet
  end

  test "entrar a una sala descuenta la apuesta y la guarda como lo puesto" do
    p = @race.participants.create!(user: @user, horse_id: 1, horse_name: "Uno")
    assert_equal 960, @user.reload.balance
    assert_equal 40, p.stake
  end

  test "los apostadores de relleno también ponen la apuesta, sin descontarle a nadie" do
    p = @race.participants.create!(name: "Don Fiado", horse_id: 1, horse_name: "Uno")
    assert_equal 40, p.stake
  end

  test "sin saldo suficiente no se entra y no se descuenta nada" do
    @user.update!(balance: 30)
    p = @race.participants.create(user: @user, horse_id: 1, horse_name: "Uno")
    assert_not p.persisted?
    assert_match "No te alcanza", p.errors.full_messages.first
    assert_equal 30, @user.reload.balance
  end

  test "el ganador cobra el doble de todo lo apostado" do
    ganador = @race.participants.create!(user: @user, horse_id: 1, horse_name: "Uno")
    @race.participants.create!(user: @otra, horse_id: 2, horse_name: "Dos")
    @race.participants.create!(name: "Don Fiado", horse_id: 3, horse_name: "Tres")
    assert_equal 240, @race.pagar_al_ganador!(ganador)
    assert_equal 960 + 240, @user.reload.balance
    assert_equal 960, @otra.reload.balance
    assert_equal 240, ganador.reload.payout
  end

  test "la carrera simulada le paga al ganador al terminar" do
    @race.participants.create!(user: @user, horse_id: 1, horse_name: "Uno")
    @race.participants.create!(user: @otra, horse_id: 2, horse_name: "Dos")
    @race.update!(status: :running)
    job = RaceSimulationJob.new
    job.define_singleton_method(:sleep) { |*| }
    job.perform(@race.id)
    ganador = @race.reload.results.first
    assert_equal 160, ganador.payout
    assert_equal 1120, ganador.user.reload.balance
  end

  test "el ranking es solo de cuentas de Google, de más a menos dinero" do
    User.create!(username: "Invitado rico", balance: 99_999)
    @otra.update!(balance: 2000)
    assert_equal [ @otra, @user ], User.ranking.to_a.first(2)
    assert_not_includes User.ranking.map(&:username), "Invitado rico"
  end
end
