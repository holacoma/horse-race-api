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

  test "build_with_participants returns a race with all horses by default" do
    race = Race.build_with_participants
    participants = race.instance_variable_get(:@participants)
    assert_equal 6, participants.length
  end

  test "build_with_participants filters by horse_ids" do
    race = Race.build_with_participants(horse_ids: [1, 3])
    participants = race.instance_variable_get(:@participants)
    assert_equal 2, participants.length
    assert_equal [1, 3], participants.map(&:id)
  end
end
