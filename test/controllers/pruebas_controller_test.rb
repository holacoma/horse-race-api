require "test_helper"

# El banco de pruebas: la carrera intensa sin sala ni servidor, con el poder real en modo prueba.
class PruebasControllerTest < ActionDispatch::IntegrationTest
  setup do
    post guest_session_path, params: { username: "Banco" }
    @me = User.find_by(username: "Banco")
  end

  test "arma la carrera con tu favorito y siete rivales de otros elementos, del lado dark" do
    @me.update!(favorite_horse_id: 26)
    get prueba_carrera_path(pista: "nevado")
    assert_response :ok
    assert_select "html[data-fase='carrera']"
    assert_select ".poder[data-flechas-prueba-value='true'][data-flechas-url-value='']"
    datos = JSON.parse(css_select("#prueba-data").first.text)
    assert_equal 26, datos["myHorseId"]
    assert_equal "nevado", datos["pista"]
    assert_equal 8, datos["participants"].size
    assert_equal 8, datos["participants"].map { |p| p["element"] }.uniq.size
  end

  test "en producción, solo los admins" do
    Rails.env.define_singleton_method(:production?) { true }
    get prueba_carrera_path
    assert_response :forbidden
    @me.update!(admin: true)
    get prueba_carrera_path
    assert_response :ok
  ensure
    Rails.env.singleton_class.send(:remove_method, :production?)
  end
end
