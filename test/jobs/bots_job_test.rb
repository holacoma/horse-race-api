require "test_helper"

class BotsJobTest < ActiveJob::TestCase
  test "los bots arman una carrera con hora límite y una travesía, y apuestan en ellas" do
    BotsJob.perform_now
    carrera = Race.carrera.abiertas.last
    assert carrera.starts_at > Time.current
    assert carrera.creator.bot?
    assert carrera.participants.all? { |p| p.user&.bot? }
    assert Race.travesia.abiertas.exists?
    refute_includes User.ranking, carrera.creator
  end

  test "no amontonan salas: si ya hay una de bots abierta, no arman otra" do
    BotsJob.perform_now
    assert_no_difference("Race.count") { BotsJob.perform_now }
  end

  test "se apagan con CLUB_BOTS=0" do
    ENV["CLUB_BOTS"] = "0"
    assert_no_difference("Race.count") { BotsJob.perform_now }
  ensure
    ENV.delete("CLUB_BOTS")
  end
end
