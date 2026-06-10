require "test_helper"

class PagesControllerTest < ActionDispatch::IntegrationTest
  test "horse frames exist" do
    %w[1 2 3 4 5].each do |n|
      assert File.exist?(Rails.root.join("public/images/horse/frame_#{n}.png")),
             "frame_#{n}.png missing from public/images/horse/"
    end
  end

  test "guinea pig frames exist" do
    %w[1 2 3 4].each do |n|
      assert File.exist?(Rails.root.join("public/images/guinea_pig/frame_#{n}.png")),
             "frame_#{n}.png missing from public/images/guinea_pig/"
    end
  end
end
