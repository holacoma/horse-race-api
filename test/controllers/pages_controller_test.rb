require "test_helper"

class PagesControllerTest < ActionDispatch::IntegrationTest
  test "GET / renders the race page" do
    get root_path
    assert_response :ok
  end

  test "race page includes the animal selector" do
    get root_path
    assert_select "#animal-selector"
  end

  test "race page includes the track and controls" do
    get root_path
    assert_select "#track"
    assert_select "#btn-new"
    assert_select "#btn-start"
  end

  test "race page defines the ANIMALS config with horse and guinea_pig" do
    get root_path
    assert_match "horse:", response.body
    assert_match "guinea_pig:", response.body
  end

  test "race page has guinea pig frames available" do
    %w[1 2 3 4].each do |n|
      assert File.exist?(Rails.root.join("public/images/guinea_pig/frame_#{n}.png")),
             "frame_#{n}.png missing from public/images/guinea_pig/"
    end
  end

  test "race page has horse frames available" do
    %w[1 2 3 4 5].each do |n|
      assert File.exist?(Rails.root.join("public/images/horse/frame_#{n}.png")),
             "frame_#{n}.png missing from public/images/horse/"
    end
  end
end
