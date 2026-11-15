require "test_helper"

class SesionRecordadaTest < ActionDispatch::IntegrationTest
  setup { post guest_session_path, params: { username: "Recordado" } }

  test "la cookie de sesión vence en 7 días, no al cerrar el navegador" do
    cookie = Array(response.headers["set-cookie"]).flat_map { _1.split("\n") }.find { |c| c.start_with?("_horse_race_session=") }
    assert cookie, "debe setear la cookie de sesión"
    assert_in_delta 7.days.from_now, Time.httpdate(cookie[/expires=([^;]+)/i, 1]), 1.minute
  end

  test "volver antes de 7 días renueva la sesión" do
    travel 6.days
    get root_path
    travel 6.days
    get root_path
    assert_equal User.find_by(username: "Recordado").id, session[:user_id]
  end

  test "más de 7 días sin venir cierra la sesión" do
    travel 8.days
    get root_path
    assert_nil session[:user_id]
  end
end
