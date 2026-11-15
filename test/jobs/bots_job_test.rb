require "test_helper"

class BotsJobTest < ActiveJob::TestCase
  # A las 15 h de Chile siempre hay bots despiertos (config/bots.yml garantiza 30 por hora).
  setup { travel_to Time.find_zone(Bot::ZONA).local(2026, 11, 14, 15) }

  test "crea un usuario por cada bot de config/bots.yml, con el saldo inicial" do
    BotsJob.perform_now
    assert_equal Bot.todos.size, User.bots.where(username: Bot.todos.map(&:nombre)).count
    refute_includes User.ranking, User.bots.first
  end

  test "solo juegan los despiertos: arman la travesía y no carreras (eso es del lobby)" do
    BotsJob.perform_now
    travesia = Race.travesia.abiertas.last
    assert travesia.creator.bot?
    assert Bot.de(travesia.creator).despierto?
    assert_not Race.carrera.exists?
  end

  test "el que no puede pagar queda quebrado y no juega; no se recarga" do
    BotsJob.perform_now
    pobre = User.bots.first
    pobre.update!(balance: 5)
    BotsJob.perform_now
    assert pobre.reload.quebrado_desde
    assert_equal 5, pobre.balance
  end

  test "se apagan con CLUB_BOTS=0" do
    ENV["CLUB_BOTS"] = "0"
    assert_no_difference("Race.count") { BotsJob.perform_now }
  ensure
    ENV.delete("CLUB_BOTS")
  end
end
