require "test_helper"

class ParticipantTest < ActiveSupport::TestCase
  setup do
    @race  = Race.create!
    @user1 = User.create_guest!("rider1")
    @user2 = User.create_guest!("rider2")
  end

  test "a user cannot join the same race twice" do
    Participant.create!(race: @race, user: @user1, horse_id: 1, horse_name: "Secretariat")

    duplicate = Participant.new(race: @race, user: @user1, horse_id: 2, horse_name: "Frankel")
    assert_not duplicate.valid?
    assert duplicate.errors[:race_id].any?
  end

  test "two users cannot take the same horse in the same race" do
    Participant.create!(race: @race, user: @user1, horse_id: 1, horse_name: "Secretariat")

    conflict = Participant.new(race: @race, user: @user2, horse_id: 1, horse_name: "Secretariat")
    assert_not conflict.valid?
    assert conflict.errors[:horse_id].any?
  end

  test "different users can take different horses in the same race" do
    p1 = Participant.create!(race: @race, user: @user1, horse_id: 1, horse_name: "Secretariat")
    p2 = Participant.create!(race: @race, user: @user2, horse_id: 2, horse_name: "Frankel")

    assert p1.persisted?
    assert p2.persisted?
  end

  test "guest participant requires a name" do
    guest = Participant.new(race: @race, horse_id: 3, horse_name: "Seabiscuit")
    assert_not guest.valid?
    assert guest.errors[:name].any?
  end

  test "guest participant is valid with a name" do
    guest = Participant.create!(race: @race, name: "Juan", horse_id: 3, horse_name: "Seabiscuit")
    assert guest.persisted?
  end

  test "two guests can take different horses in the same race" do
    Participant.create!(race: @race, name: "Juan", horse_id: 1, horse_name: "Secretariat")
    guest2 = Participant.create!(race: @race, name: "Maria", horse_id: 2, horse_name: "Frankel")
    assert guest2.persisted?
  end

  test "display_name returns username for registered users" do
    p = Participant.create!(race: @race, user: @user1, horse_id: 1, horse_name: "Secretariat")
    assert_equal "rider1", p.display_name
  end

  test "display_name returns name for guest participants" do
    p = Participant.create!(race: @race, name: "Juan", horse_id: 1, horse_name: "Secretariat")
    assert_equal "Juan", p.display_name
  end
end
