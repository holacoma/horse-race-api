require "test_helper"

class BotsControllerTest < ActionDispatch::IntegrationTest
  include ActiveSupport::Testing::TimeHelpers

  setup do
    post guest_session_path, params: { username: "TestRider" }
    @me = User.find_by(username: "TestRider")
    @quebrado = User.create!(username: "Rey Fiado", bot: true, balance: 900, quebrado_desde: 1.hour.ago)
  end

  test "muestra el leaderboard y los quebrados con su formulario para donar" do
    get bots_path
    assert_response :ok
    assert_select "form[action='#{donar_bot_path(@quebrado)}']"
  end

  test "donar pasa plata al bot; al juntar el mínimo vuelve al club" do
    saldo = @me.balance
    post donar_bot_path(@quebrado), params: { monto: 100 }
    assert_equal saldo - 100, @me.reload.balance
    assert_equal 1_000, @quebrado.reload.balance
    assert_nil @quebrado.quebrado_desde
  end

  test "no se dona más de lo que tienes" do
    post donar_bot_path(@quebrado), params: { monto: @me.balance + 1 }
    assert_equal 900, @quebrado.reload.balance
  end

  test "apostar descuenta el saldo y aparece en tus apuestas" do
    travel_to Time.find_zone(Bot::ZONA).local(2026, 11, 11, 10) do
      bot = User.create!(username: "Don Bot", bot: true, balance: 2000)
      get bots_path
      assert_select "form[action='#{apostar_bot_path(bot)}']", 2
      saldo = @me.reload.balance
      post apostar_bot_path(bot), params: { mercado: "dia", monto: 50 }
      assert_redirected_to bots_path
      assert_equal saldo - 50, @me.reload.balance
      follow_redirect!
      assert_select ".apuesta-fila", /Don Bot/
    end
  end

  test "apostar rechaza montos bajo el mínimo y mercados cerrados" do
    travel_to Time.find_zone(Bot::ZONA).local(2026, 11, 11, 19) do
      bot = User.create!(username: "Don Bot", bot: true, balance: 2000)
      saldo = @me.reload.balance
      post apostar_bot_path(bot), params: { mercado: "temporada", monto: 5 }
      post apostar_bot_path(bot), params: { mercado: "dia", monto: 50 }
      assert_equal saldo, @me.reload.balance
      assert_equal 0, Apuesta.count
      assert flash[:alert].present?
    end
  end

  test "a un usuario que no es bot no se le apuesta" do
    post apostar_bot_path(@me), params: { mercado: "dia", monto: 50 }
    assert_response :not_found
  end
end
