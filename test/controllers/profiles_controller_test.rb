require "test_helper"

class ProfilesControllerTest < ActionDispatch::IntegrationTest
  setup do
    post guest_session_path, params: { username: "Rider" }
    @user = User.find_by(username: "Rider")
  end

  test "GET show returns 200 for own profile" do
    get profile_path(@user.username)
    assert_response :ok
  end

  test "GET show returns 200 for another user's profile" do
    other = User.create_guest!("OtherRider")
    get profile_path(other.username)
    assert_response :ok
  end

  test "GET show returns 404 for nonexistent username" do
    get profile_path("nobody")
    assert_response :not_found
  end

  test "GET show redirects to login when not logged in" do
    delete logout_path
    get profile_path(@user.username)
    assert_redirected_to login_path
  end

  test "GET show own profile renders when user has no favorites" do
    get profile_path(@user.username)
    assert_response :ok
    assert_select "body"
  end

  test "GET show own profile renders when user has favorited all horses" do
    Horse::CATALOG.each { |h| HorseFavorite.create!(user: @user, horse_id: h[:id]) }
    get profile_path(@user.username)
    assert_response :ok
  end

  test "profile shows race history" do
    race = Race.create!(creator: @user, status: :finished, winner_name: "Secretariat", finished_at: Time.current)
    Participant.create!(race: race, user: @user, horse_id: 1, horse_name: "Secretariat")

    get profile_path(@user.username)
    assert_response :ok
    assert_match "Secretariat", response.body
  end
end
