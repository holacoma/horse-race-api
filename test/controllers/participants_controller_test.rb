require "test_helper"

class ParticipantsControllerTest < ActionDispatch::IntegrationTest
  setup do
    post guest_session_path, params: { username: "Rider" }
    @creator = User.find_by(username: "Rider")
    @race = Race.create!(creator: @creator)
  end

  test "POST join with valid horse creates participant" do
    assert_difference "Participant.count", 1 do
      post race_participants_path(@race), params: { horse_id: 1 }, as: :json
    end
    assert_response :ok
    assert response.parsed_body["ok"]
  end

  test "POST join with already taken horse returns 409" do
    other_user = User.create_guest!("other")
    Participant.create!(race: @race, user: other_user, horse_id: 1, horse_name: "Secretariat")

    post race_participants_path(@race), params: { horse_id: 1 }, as: :json
    assert_response :conflict
    assert response.parsed_body["error"].present?
  end

  test "POST join twice by same user returns conflict" do
    post race_participants_path(@race), params: { horse_id: 1 }, as: :json
    assert_response :ok

    post race_participants_path(@race), params: { horse_id: 2 }, as: :json
    assert_response :conflict
  end

  test "POST join without session redirects to login" do
    delete logout_path
    post race_participants_path(@race), params: { horse_id: 1 }, as: :json
    assert_redirected_to login_path
  end

  test "creator can add a guest apostador" do
    assert_difference "Participant.count", 1 do
      post race_participants_path(@race), params: { horse_id: 1, guest_name: "Juan" }, as: :json
    end
    assert_response :ok
    assert_equal "Juan", Participant.last.display_name
  end

  test "non-creator cannot add guest apostador" do
    delete logout_path
    post guest_session_path, params: { username: "OtherRider" }

    post race_participants_path(@race), params: { horse_id: 1, guest_name: "Juan" }, as: :json
    assert_response :forbidden
  end
end
