require "test_helper"

class BotsControllerTest < ActionDispatch::IntegrationTest
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
end
