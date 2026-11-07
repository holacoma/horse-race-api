require "test_helper"

class RacesControllerTest < ActionDispatch::IntegrationTest
  setup do
    post guest_session_path, params: { username: "TestRider" }
  end

  test "GET / without session redirects to login" do
    delete logout_path
    get root_path
    assert_redirected_to login_path
  end

  test "GET /races lists public pending rooms" do
    Race.create!(is_public: true, status: :pending)
    get races_path
    assert_response :ok
    assert_select ".room-card"
  end

  test "GET /races/new renders the create form" do
    get new_race_path
    assert_response :ok
    assert_select "form"
    assert_select "input[name='race[slug]']"
    assert_select "select[name='race[capacity]']"
    assert_select "select[name='race[animal_type]']"
  end

  test "GET /races/new offers the slot machine with the chosen room name" do
    get new_race_path

    reels = css_select("form.pixel-form .slot-reel")
    assert_equal Race::ROOM_NAME_REELS, reels.map { |reel| JSON.parse(reel["data-words"]) }
    assert_select "input[type=text][name='race[slug]']", 0

    slug = css_select("input[type=hidden][name='race[slug]']").first["value"]
    assert_equal reels.map { |reel| reel["data-result"] }.join(" ").parameterize, slug
  end

  test "pick_room_name skips names already taken" do
    all_names = Race::ROOM_NAME_REELS.first.product(Race::ROOM_NAME_REELS.last)
    last_free = all_names.last
    all_names[0...-1].each { |words| Race.create!(slug: words.join(" ").parameterize) }

    assert_equal last_free, Race.pick_room_name[:words]
    assert_match(/\A[a-z0-9-]+\z/, Race.pick_room_name[:slug])
  end

  test "pick_room_name still gives a free slug when every name is taken" do
    Race::ROOM_NAME_REELS.first.product(Race::ROOM_NAME_REELS.last)
                         .each { |words| Race.create!(slug: words.join(" ").parameterize) }

    assert Race.new(slug: Race.pick_room_name[:slug]).valid?
  end

  test "POST /races creates a race and redirects to lobby" do
    assert_difference "Race.count", 1 do
      post races_path, params: { race: { slug: "test-room-1", capacity: 4, animal_type: "horse", is_public: "1" } }
    end
    assert_redirected_to race_path(Race.last)
  end

  test "POST /races guarda la distancia elegida" do
    post races_path, params: { race: { slug: "larga-1", capacity: 4, distance: 800, animal_type: "horse", is_public: "1" } }

    assert_equal 800, Race.find_by(slug: "larga-1").distance
  end

  test "POST /races rechaza una distancia fuera de rango" do
    assert_no_difference "Race.count" do
      post races_path, params: { race: { slug: "eterna-1", capacity: 4, distance: 999_999, animal_type: "horse", is_public: "1" } }
    end
    assert_response :unprocessable_entity
  end

  test "GET /races/new ofrece elegir la distancia" do
    get new_race_path
    assert_select "input[type=number][name='race[distance]'][value='2000']"
  end

  test "POST /races with invalid slug re-renders form" do
    post races_path, params: { race: { slug: "INVALID SLUG!", capacity: 4, animal_type: "horse", is_public: "1" } }
    assert_response :unprocessable_entity
  end

  test "GET /races/:slug shows the lobby" do
    race = Race.create!
    get race_path(race)
    assert_response :ok
    assert_select "#participants-list"
    assert_select "#horse-picker"
  end

  test "GET /races/:slug gives default bettor names only to the creator" do
    creator = User.find_by(username: "TestRider")
    race = Race.create!(creator: creator)
    race.participants.create!(name: "Doña Suerte", horse_id: 1, horse_name: "Secretariat")

    get race_path(race)
    names = JSON.parse(css_select("[data-controller='race-lobby']").first["data-race-lobby-bettor-names-value"])
    assert_includes names, "Don Fiado"
    assert_not_includes names, "Doña Suerte"

    get race_path(Race.create!)
    names = JSON.parse(css_select("[data-controller='race-lobby']").first["data-race-lobby-bettor-names-value"])
    assert_empty names
  end

  test "GET /races/:slug/results shows positions in order and how to go back" do
    me = User.find_by(username: "TestRider")
    race = Race.create!(status: :finished, winner_name: "Rayo", finished_at: Time.current)
    race.participants.create!(name: "Otra", horse_id: 1, horse_name: "Rayo", final_rank: 1)
    race.participants.create!(user: me, horse_id: 2, horse_name: "Trueno", final_rank: 2)

    get results_race_path(race)

    assert_response :ok
    assert_equal [ "Rayo", "Trueno" ], css_select(".results-horse").map { |e| e.text.strip }
    assert_select "h1", /Ganó Otra/
    assert_select ".results-my-position", /puesto 2/
    assert_select ".results-row.is-me .results-horse", "Trueno"
    assert_select "a[href='#{races_path}']"
    assert_select "a[href='#{new_race_path}']"
  end

  test "GET /races/:slug/results congratulates the winner" do
    me = User.find_by(username: "TestRider")
    race = Race.create!(status: :finished, winner_name: "Trueno", finished_at: Time.current)
    race.participants.create!(user: me, horse_id: 2, horse_name: "Trueno", final_rank: 1)

    get results_race_path(race)

    assert_select "h1", /Ganaste/
  end

  test "results puts the winner first in races finished before ranks were saved" do
    race = Race.create!(status: :finished, winner_name: "Trueno", finished_at: Time.current)
    race.participants.create!(name: "Otra", horse_id: 1, horse_name: "Rayo")
    race.participants.create!(name: "Uno", horse_id: 2, horse_name: "Trueno")

    assert_equal "Trueno", race.results.first.horse_name
  end

  test "a finished race always leads to its results" do
    race = Race.create!(status: :finished, winner_name: "Rayo", finished_at: Time.current)

    get race_path(race)
    assert_redirected_to results_race_path(race)

    get live_race_path(race)
    assert_redirected_to results_race_path(race)
  end

  test "results of an unfinished race go back to the lobby" do
    race = Race.create!(status: :pending)

    get results_race_path(race)
    assert_redirected_to race_path(race)
  end

  test "POST /races/:slug/start transitions race to running" do
    race = Race.create!(status: :pending)
    assert_enqueued_with(job: RaceSimulationJob) do
      post start_race_path(race), as: :json
    end
    assert_response :ok
    assert_equal "running", response.parsed_body["status"]
    assert race.reload.running?
  end

  test "POST /races/:slug/start rejects an already running race" do
    race = Race.create!(status: :running)
    post start_race_path(race), as: :json
    assert_response :unprocessable_entity
    assert response.parsed_body["error"].present?
  end
end
