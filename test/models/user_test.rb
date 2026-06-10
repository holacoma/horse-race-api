require "test_helper"

class UserTest < ActiveSupport::TestCase
  def mock_auth(uid: "123", name: "Ezequiel", email: "ez@example.com", image: "http://img.test/a.jpg")
    OpenStruct.new(
      provider: "google",
      uid: uid,
      info: OpenStruct.new(name: name, email: email, image: image)
    )
  end

  test "from_omniauth creates a new user with OAuth data" do
    auth = mock_auth
    user = User.from_omniauth(auth)
    assert user.persisted?
    assert_equal "google",            user.provider
    assert_equal "123",               user.uid
    assert_equal "Ezequiel",          user.username
    assert_equal "ez@example.com",    user.email
    assert_equal "http://img.test/a.jpg", user.avatar_url
  end

  test "from_omniauth returns existing user on second call" do
    auth = mock_auth
    first  = User.from_omniauth(auth)
    second = User.from_omniauth(auth)
    assert_equal first.id, second.id
    assert_equal 1, User.where(provider: "google", uid: "123").count
  end

  test "create_guest! creates a user without provider" do
    user = User.create_guest!("Rider123")
    assert user.persisted?
    assert_equal "Rider123", user.username
    assert_nil user.provider
    assert_nil user.uid
  end

  test "guest? returns true for guest users" do
    user = User.create_guest!("Anon")
    assert user.guest?
  end

  test "guest? returns false for OAuth users" do
    user = User.from_omniauth(mock_auth(uid: "456"))
    assert_not user.guest?
  end

  test "username is required" do
    user = User.new
    assert_not user.valid?
    assert user.errors[:username].present?
  end
end
