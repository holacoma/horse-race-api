require "test_helper"

class PrototiposControllerTest < ActionDispatch::IntegrationTest
  setup do
    post guest_session_path, params: { username: "Rider3D" }
    @me = User.find_by(username: "Rider3D")
  end

  test "crea una carrera real, privada y en marcha, conmigo adentro" do
    assert_enqueued_with(job: RaceSimulationJob) do
      post prototipo3d_path, params: { caballos: 5 }
    end

    race = Race.order(:id).last
    assert_redirected_to live3d_race_path(race)
    assert race.running?
    assert_not race.is_public
    assert_equal @me, race.creator
    assert_equal 5, race.participants.count
    assert race.participants.exists?(user: @me)
  end

  test "la cantidad de caballos se limita a lo que admite una sala" do
    post prototipo3d_path, params: { caballos: 99 }
    assert_equal 12, Race.order(:id).last.participants.count
  end

  test "usa la distancia elegida y la lleva al rango permitido" do
    post prototipo3d_path, params: { caballos: 2, distancia: 800 }
    assert_equal 800, Race.order(:id).last.distance

    post prototipo3d_path, params: { caballos: 2, distancia: 999_999 }
    assert_equal Race::DISTANCE_RANGE.max, Race.order(:id).last.distance
  end

  test "la vista 3D recibe los datos de la carrera real" do
    race = Race.create!(status: :running, started_at: Time.current, creator: @me)
    race.participants.create!(user: @me, horse_id: 1, horse_name: "Rayo")
    race.participants.create!(name: "</script><b>Otra", horse_id: 2, horse_name: "Trueno")

    get live3d_race_path(race)

    assert_response :ok
    data = JSON.parse(css_select("#race-data").first.text)
    assert_equal race.id, data["raceId"]
    assert_equal race.distance, data["distance"]
    assert_equal 1, data["myHorseId"]
    assert_equal results_race_path(race), data["resultsUrl"]
    assert_equal [ "Rayo", "Trueno" ], data["participants"].map { |p| p["name"] }
    assert_includes data["participants"].map { |p| p["username"] }, "</script><b>Otra"
    assert_operator data["secondsToStart"], :<=, RaceSimulationJob::PRELUDE_SEC
  end

  test "la vista 3D de una carrera terminada lleva a los resultados" do
    race = Race.create!(status: :finished, winner_name: "Rayo", finished_at: Time.current)
    get live3d_race_path(race)
    assert_redirected_to results_race_path(race)
  end

  test "la vista 3D de una carrera sin empezar lleva al lobby" do
    race = Race.create!(status: :pending)
    get live3d_race_path(race)
    assert_redirected_to race_path(race)
  end

  test "sin sesión no se puede crear" do
    delete logout_path
    post prototipo3d_path, params: { caballos: 3 }
    assert_redirected_to login_path
  end
end
