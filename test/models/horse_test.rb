require "test_helper"

class HorseTest < ActiveSupport::TestCase
  test "all returns 6 horses" do
    assert_equal 6, Horse.all.length
  end

  test "all returns Horse instances with id and name" do
    horses = Horse.all
    assert horses.all? { |h| h.id.present? && h.name.present? }
  end

  test "each horse starts at position zero" do
    Horse.all.each do |horse|
      assert_equal 0.0, horse.position
    end
  end

  test "find returns the correct horse" do
    horse = Horse.find(1)
    assert_equal 1, horse.id
    assert_equal "Thunder", horse.name
  end

  test "find returns nil for unknown id" do
    assert_nil Horse.find(999)
  end

  test "position is mutable" do
    horse = Horse.find(1)
    horse.position = 42.5
    assert_equal 42.5, horse.position
  end
end
