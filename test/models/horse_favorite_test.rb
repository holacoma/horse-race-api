require "test_helper"

class HorseFavoriteTest < ActiveSupport::TestCase
  setup do
    @user = User.create_guest!("rider1")
  end

  test "user can favorite a horse" do
    fav = HorseFavorite.create!(user: @user, horse_id: 1)
    assert fav.persisted?
  end

  test "user cannot favorite the same horse twice" do
    HorseFavorite.create!(user: @user, horse_id: 1)
    dup = HorseFavorite.new(user: @user, horse_id: 1)
    assert_not dup.valid?
    assert dup.errors[:horse_id].any?
  end

  test "different users can favorite the same horse" do
    user2 = User.create_guest!("rider2")
    HorseFavorite.create!(user: @user, horse_id: 1)
    fav2 = HorseFavorite.create!(user: user2, horse_id: 1)
    assert fav2.persisted?
  end

  test "favorite_horse_ids returns last 3" do
    4.times { |i| HorseFavorite.create!(user: @user, horse_id: i + 1) }
    ids = @user.favorite_horse_ids
    assert_equal 3, ids.size
  end

  test "favorite_horse_ids returns most recent first" do
    HorseFavorite.create!(user: @user, horse_id: 1)
    HorseFavorite.create!(user: @user, horse_id: 2)
    ids = @user.favorite_horse_ids
    assert_equal 2, ids.first
  end
end
