require "test_helper"

class HorseFavoritesControllerTest < ActionDispatch::IntegrationTest
  setup do
    post guest_session_path, params: { username: "Rider" }
    @user = User.find_by(username: "Rider")
  end

  test "POST toggle creates favorite when not present" do
    assert_difference "HorseFavorite.count", 1 do
      post horse_favorites_path, params: { horse_id: 1 }, as: :json
    end
    assert_response :ok
    assert response.parsed_body["favorited"]
  end

  test "POST toggle destroys favorite when already present" do
    HorseFavorite.create!(user: @user, horse_id: 1)
    assert_difference "HorseFavorite.count", -1 do
      post horse_favorites_path, params: { horse_id: 1 }, as: :json
    end
    assert_response :ok
    assert_not response.parsed_body["favorited"]
  end

  test "POST with invalid horse_id returns 404" do
    post horse_favorites_path, params: { horse_id: 9999 }, as: :json
    assert_response :not_found
  end

  test "POST without session redirects to login" do
    delete logout_path
    post horse_favorites_path, params: { horse_id: 1 }, as: :json
    assert_redirected_to login_path
  end
end
