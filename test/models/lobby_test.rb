require "test_helper"

class LobbyTest < ActiveSupport::TestCase
  include ActionCable::TestHelper
  include ActiveJob::TestHelper

  # A las 15 h de Chile siempre hay bots despiertos.
  setup { travel_to Time.find_zone(Bot::ZONA).local(2026, 11, 14, 15) }
  teardown { ENV.delete("CLUB_BOTS") }

  def salas = Race.carrera.abiertas.where(creator: User.bots)

  # Minitest 6 ya no trae stubs: se reemplaza el sorteo de la apuesta mientras dura el bloque.
  def con_apuesta(monto)
    original = Lobby.method(:apuesta_al_azar)
    Lobby.define_singleton_method(:apuesta_al_azar) { |*| monto }
    yield
  ensure
    Lobby.define_singleton_method(:apuesta_al_azar, original)
  end

  test "crea una sala la primera vez y después una cada 10 a 20 segundos, hasta el tope" do
    con_apuesta(40) do
      Lobby.tick
      assert_equal 1, salas.count
      travel 9.seconds
      Lobby.tick
      assert_equal 1, salas.count
      travel 11.seconds # 20 s: ya toca
      Lobby.tick
      assert_equal 2, salas.count
      20.times { travel 21.seconds; Lobby.tick }
      assert_operator salas.count, :<=, Lobby::SALAS_MAXIMAS
    end
  end

  test "la sala tiene entre 6 y 12 lugares, una apuesta válida y la arma un bot despierto" do
    con_apuesta(40) { Lobby.tick }
    sala = salas.first
    assert_includes Lobby::LUGARES, sala.capacity
    assert Bot.de(sala.creator).despierto?
    assert sala.is_public
    assert_nil sala.starts_at
  end

  test "la apuesta al azar va de 40 a 10.000 y casi siempre es barata" do
    apuestas = Array.new(500) { Lobby.apuesta_al_azar }
    assert apuestas.all? { |a| a.between?(40, 10_000) }
    assert_operator apuestas.count { |a| a <= 1_000 }, :>, 300
    assert_operator apuestas.max, :>, 3_000
  end

  test "suma un bot cada 5 a 10 segundos, solo los que no están en otra sala" do
    con_apuesta(40) do
      Lobby.tick
      sala = salas.first
      inicial = sala.participants.count
      travel 4.seconds
      Lobby.tick
      assert_equal inicial, sala.participants.count
      travel 7.seconds
      Lobby.tick
      assert_equal inicial + 1, sala.participants.count
      ids = Participant.where(race: Race.abiertas).pluck(:user_id)
      assert_equal ids.uniq, ids
    end
  end

  test "solo entran los que pueden pagar: sin plata no entra nadie ni se rellena" do
    User.bots.update_all(balance: 1_000)
    con_apuesta(5_000) do
      Lobby.tick
      sala = salas.first
      assert_equal 0, sala.participants.count
      travel 11.seconds
      Lobby.tick
      assert_equal 0, sala.participants.count
      User.bots.first.update!(balance: 6_000)
      Bot.asegurar_usuarios # no recarga a nadie
      travel 11.seconds
      Lobby.tick
      assert_equal 1, sala.participants.reload.count
      assert_equal 5_000, sala.participants.first.stake
    end
  end

  test "a lo sumo una sala abierta con apuesta que nadie puede pagar" do
    Bot.asegurar_usuarios
    User.bots.update_all(balance: 1_000)
    con_apuesta(9_000) do
      6.times { Lobby.tick; travel 21.seconds }
    end
    assert_operator salas.count, :>, 1
    assert_equal 1, salas.where("bet > 1000").count
  end

  test "al completarse la sala, la carrera se inicia sola" do
    con_apuesta(40) do
      Lobby.tick
      sala = salas.first
      sala.update_columns(capacity: 2)
      assert_predicate sala.reload, :pending?
      travel 11.seconds
      assert_enqueued_with(job: RaceSimulationJob) { Lobby.tick }
      assert_predicate sala.reload, :running?
      assert_equal 2, sala.participants.count
    end
  end

  test "con CLUB_BOTS=0 no hace nada" do
    ENV["CLUB_BOTS"] = "0"
    assert_no_difference("Race.count") { Lobby.tick }
    assert_no_enqueued_jobs { LobbyJob.perform_now }
  end

  test "el inicio se entera: sala nueva, lugar ocupado y sala que larga" do
    assert_broadcasts("lobby", 1) { con_apuesta(40) { Lobby.tick } }
    sala = salas.first
    assert_broadcasts("lobby", 1) { sala.update!(status: :running) }
  end
end

class LobbyJobTest < ActiveJob::TestCase
  test "se reprograma solo un segundo después" do
    travel_to Time.find_zone(Bot::ZONA).local(2026, 11, 14, 15)
    assert_enqueued_with(job: LobbyJob, at: 1.second.from_now) { LobbyJob.perform_now }
    assert_operator Race.count, :>=, 1
  end
end
