require "test_helper"

class LiquidarApuestasJobTest < ActiveJob::TestCase
  include ActiveSupport::Testing::TimeHelpers

  test "liquida lo vencido" do
    zona = Time.find_zone(Bot::ZONA)
    travel_to zona.local(2026, 11, 1, 10)
    bot = User.create!(username: "Bot A", bot: true, balance: 3000)
    user = User.create!(username: "u1")
    Apuesta.apostar(user: user, bot: bot, mercado: "dia", monto: 100)
    travel_to zona.local(2026, 11, 2, 0, 5)
    LiquidarApuestasJob.perform_now
    assert_equal "ganada", Apuesta.last.estado
  ensure
    travel_back
  end
end
