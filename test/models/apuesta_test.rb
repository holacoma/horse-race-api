require "test_helper"

class ApuestaTest < ActiveSupport::TestCase
  include ActiveSupport::Testing::TimeHelpers

  setup do
    # Temporada 1 empieza el 1/11/2026 00:00 Chile; el día 3 de ella (5/11 al 6/11) ya cerró la apuesta a la temporada.
    @zona = Time.find_zone(Bot::ZONA)
    travel_to @zona.local(2026, 11, 1, 10) # temporada 1, día 1, 10:00
    @a = User.create!(username: "Bot A", bot: true, balance: 3000)
    @b = User.create!(username: "Bot B", bot: true, balance: 2000)
    @q = User.create!(username: "Bot Q", bot: true, balance: 10, quebrado_desde: 1.hour.ago)
    @u1 = User.create!(username: "u1", balance: 1000)
    @u2 = User.create!(username: "u2", balance: 1000)
    @u3 = User.create!(username: "u3", balance: 1000)
  end

  teardown { travel_back }

  test "apostar descuenta el monto, guarda el impuesto del 10 % y suma a lo apostado" do
    apuesta = Apuesta.apostar(user: @u1, bot: @a, mercado: "dia", monto: 100)
    assert apuesta.persisted?
    assert_equal 900, @u1.reload.balance
    assert_equal 10, apuesta.impuesto
    assert_equal 90, Apuesta.apostado("dia", 1, Apuesta.hoy)
  end

  test "mínimo de 20 y sin máximo salvo el saldo" do
    refute Apuesta.apostar(user: @u1, bot: @a, mercado: "dia", monto: 19).persisted?
    assert Apuesta.apostar(user: @u1, bot: @a, mercado: "dia", monto: 20).persisted?
    apuesta = Apuesta.apostar(user: @u1, bot: @a, mercado: "temporada", monto: 981)
    refute apuesta.persisted?
    assert_includes apuesta.errors[:monto], "supera tu saldo"
    assert Apuesta.apostar(user: @u1, bot: @a, mercado: "temporada", monto: 980).persisted?
    assert_equal 0, @u1.reload.balance
  end

  test "solo bots; al día no los quebrados, a la temporada sí" do
    refute Apuesta.apostar(user: @u1, bot: @u2, mercado: "dia", monto: 20).persisted?
    refute Apuesta.apostar(user: @u1, bot: @q, mercado: "dia", monto: 20).persisted?
    assert Apuesta.apostar(user: @u1, bot: @q, mercado: "temporada", monto: 20).persisted?
  end

  test "mercado desconocido no apuesta ni cobra" do
    refute Apuesta.apostar(user: @u1, bot: @a, mercado: "semana", monto: 20).persisted?
    assert_equal 1000, @u1.reload.balance
  end

  test "al día se apuesta hasta las 18:00 de Chile" do
    travel_to @zona.local(2026, 11, 1, 17, 59)
    assert Apuesta.apostar(user: @u1, bot: @a, mercado: "dia", monto: 20).persisted?
    travel_to @zona.local(2026, 11, 1, 18, 0)
    refute Apuesta.apostar(user: @u1, bot: @a, mercado: "dia", monto: 20).persisted?
    assert_equal 980, @u1.reload.balance
  end

  test "a la temporada se apuesta hasta el final del día 2" do
    travel_to @zona.local(2026, 11, 2, 23, 59)
    assert Apuesta.apostar(user: @u1, bot: @a, mercado: "temporada", monto: 20).persisted?
    travel_to @zona.local(2026, 11, 3, 0, 0)
    refute Apuesta.apostar(user: @u1, bot: @a, mercado: "temporada", monto: 20).persisted?
  end

  test "pagaría: el doble de lo neto (1,8 × monto)" do
    assert_equal 180, Apuesta.pagaria(100)
    assert_equal 36, Apuesta.pagaria(20)
  end

  test "liquidación: quien acierta cobra 1,8 × su apuesta; lo neto de los que fallan va al torneo" do
    Apuesta.apostar(user: @u1, bot: @a, mercado: "dia", monto: 100)
    Apuesta.apostar(user: @u2, bot: @a, mercado: "dia", monto: 300)
    Apuesta.apostar(user: @u3, bot: @b, mercado: "dia", monto: 200) # neto 180, pierde
    travel_to @zona.local(2026, 11, 2, 0, 5)

    assert_equal 1, Apuesta.liquidar_vencidas
    assert_equal 900 + 180, @u1.reload.balance
    assert_equal 700 + 540, @u2.reload.balance
    assert_equal 800, @u3.reload.balance
    assert_equal %w[ganada ganada perdida], Apuesta.order(:id).pluck(:estado)
    assert_equal 180, PozoTorneo.monto_de(1)
  end

  test "sin ganadores todo lo neto va al torneo" do
    Apuesta.apostar(user: @u1, bot: @b, mercado: "dia", monto: 100)
    Apuesta.apostar(user: @u2, bot: @q, mercado: "temporada", monto: 50)
    travel_to @zona.local(2026, 11, 2, 0, 5)

    Apuesta.liquidar_vencidas
    assert_equal 90, PozoTorneo.monto_de(1)
    assert_equal "perdida", Apuesta.find_by(mercado: "dia").estado
    assert_equal "abierta", Apuesta.find_by(mercado: "temporada").estado # la temporada aún no cierra
  end

  test "es idempotente y no liquida antes de la medianoche" do
    Apuesta.apostar(user: @u1, bot: @a, mercado: "dia", monto: 100)
    travel_to @zona.local(2026, 11, 1, 23, 59)
    assert_equal 0, Apuesta.liquidar_vencidas
    travel_to @zona.local(2026, 11, 2, 0, 1)
    assert_equal 1, Apuesta.liquidar_vencidas
    saldo = @u1.reload.balance
    assert_equal 0, Apuesta.liquidar_vencidas
    assert_equal saldo, @u1.reload.balance
  end

  test "la temporada se liquida al cerrar, con un quebrado que va primero" do
    @q.update!(balance: 9999)
    Apuesta.apostar(user: @u1, bot: @q, mercado: "temporada", monto: 100)
    travel_to @zona.local(2026, 11, 5, 23, 59)
    assert_equal 0, Apuesta.liquidar_vencidas
    travel_to @zona.local(2026, 11, 6, 0, 1)
    Apuesta.liquidar_vencidas
    assert_equal 900 + 180, @u1.reload.balance
  end
end
