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

  test "el favorito es uno solo: el que eligió" do
    @user.update!(favorite_horse_id: 26)
    assert_equal [ 26 ], @user.favorite_horse_ids
    assert_equal "El Pistolero", @user.favorite_horse.name
  end

  test "sin favorito no hay ids" do
    assert_equal [], @user.favorite_horse_ids
    assert_nil @user.favorite_horse
  end
end
