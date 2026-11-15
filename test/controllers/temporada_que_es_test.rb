require "test_helper"

class TemporadaQueEsTest < ActionDispatch::IntegrationTest
  test "el inicio explica qué es la temporada" do
    post guest_session_path, params: { username: "Curioso" }
    get root_path
    assert_select "details.temporada-que-es summary", "¿Qué es?"
    assert_select "details.temporada-que-es p", /5 días/
  end
end
