require "test_helper"

class RaceTest < ActiveSupport::TestCase
  test "new race defaults to pending status" do
    race = Race.create!
    assert race.pending?
  end

  test "status transitions: pending -> running -> finished" do
    race = Race.create!
    race.update!(status: :running)
    assert race.running?
    race.update!(status: :finished)
    assert race.finished?
  end

  test "slug is auto-generated on create" do
    race = Race.create!
    assert race.slug.present?
    assert_match(/\A[a-z0-9-]+\z/, race.slug)
  end

  test "slug must be unique" do
    race1 = Race.create!
    race2 = Race.new
    race2.slug = race1.slug
    assert_not race2.valid?
    assert race2.errors[:slug].any?
  end

  test "capacity must be between 2 and 12" do
    race = Race.new(capacity: 1)
    assert_not race.valid?
    race.capacity = 13
    assert_not race.valid?
    race.capacity = 6
    assert race.valid?
  end

  test "full? returns true when participants reach capacity" do
    user1 = User.create_guest!("rider1")
    user2 = User.create_guest!("rider2")
    race = Race.create!(capacity: 2)

    Participant.create!(race: race, user: user1, horse_id: 1, horse_name: "Secretariat")
    assert_not race.full?

    Participant.create!(race: race, user: user2, horse_id: 2, horse_name: "Man o' War")
    assert race.full?
  end

  test "available_horses excludes horses already taken" do
    user = User.create_guest!("rider")
    race = Race.create!
    Participant.create!(race: race, user: user, horse_id: 1, horse_name: "Secretariat")

    available_ids = race.available_horses.map(&:id)
    assert_not_includes available_ids, 1
    assert_includes available_ids, 2
  end

  test "build_with_participants returns a race with all horses by default" do
    race = Race.build_with_participants
    participants = race.instance_variable_get(:@participants)
    assert_equal Horse::CATALOG.length, participants.length
  end

  test "build_with_participants filters by horse_ids" do
    race = Race.build_with_participants(horse_ids: [ 1, 3 ])
    participants = race.instance_variable_get(:@participants)
    assert_equal 2, participants.length
    assert_equal [ 1, 3 ], participants.map(&:id)
  end
end
