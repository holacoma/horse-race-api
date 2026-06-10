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

  test "POST /races creates a race and redirects to lobby" do
    assert_difference "Race.count", 1 do
      post races_path, params: { race: { slug: "test-room-1", capacity: 4, animal_type: "horse", is_public: "1" } }
    end
    assert_redirected_to race_path(Race.last)
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
