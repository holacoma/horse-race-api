require "test_helper"

class RacesControllerTest < ActionDispatch::IntegrationTest
  test "POST /races creates a pending race" do
    assert_difference "Race.count", 1 do
      post races_path, as: :json
    end
    assert_response :created
    body = response.parsed_body
    assert body["id"].present?
    assert_equal "pending", body["status"]
  end

  test "GET /races/:id returns race with all horses" do
    race = Race.create!
    get race_path(race), as: :json
    assert_response :ok
    body = response.parsed_body
    assert_equal race.id, body["id"]
    assert_equal "pending", body["status"]
    assert_equal 6, body["horses"].length
    assert body["horses"].first.key?("id")
    assert body["horses"].first.key?("name")
  end

  test "POST /races/:id/start transitions race to running" do
    race = Race.create!(status: :pending)
    assert_enqueued_with(job: RaceSimulationJob) do
      post start_race_path(race), as: :json
    end
    assert_response :ok
    assert_equal "running", response.parsed_body["status"]
    assert race.reload.running?
  end

  test "POST /races/:id/start rejects a race that is already running" do
    race = Race.create!(status: :running)
    post start_race_path(race), as: :json
    assert_response :unprocessable_entity
    assert response.parsed_body["error"].present?
  end

  test "POST /races/:id/start rejects a finished race" do
    race = Race.create!(status: :finished)
    post start_race_path(race), as: :json
    assert_response :unprocessable_entity
  end
end
