require "test_helper"

# Lo del roadmap que vive en los modelos: temporadas, estadísticas del caballo, hora límite de largada y travesías.
class RoadmapTest < ActiveSupport::TestCase
  include ActiveJob::TestHelper

  def terminar(race, ganador_id, otros)
    race.update!(status: :finished, finished_at: Time.current, winner_name: Horse.find(ganador_id).name)
    race.participants.create!(name: "A", horse_id: ganador_id, horse_name: Horse.find(ganador_id).name, final_rank: 1)
    otros.each_with_index { |id, i| race.participants.create!(name: "B#{i}", horse_id: id, horse_name: Horse.find(id).name, final_rank: i + 2) }
    race
  end

  # ── Temporadas ─────────────────────────────────────────────────────────────────────────────────────────────────

  test "una temporada dura 5 días y empieza a medianoche de Chile" do
    t = Temporada.actual(Temporada::INICIO + 6.days + 3.hours)
    assert_equal 2, t.numero
    assert_equal 2, t.dia(Temporada::INICIO + 6.days + 3.hours)
    assert_equal Temporada::INICIO + 5.days, t.desde
    assert_equal 0, t.desde.in_time_zone("America/Santiago").hour
  end

  test "el líder de la temporada es el caballo con más victorias en ella" do
    terminar(Race.create!, 26, [ 1, 3 ])
    terminar(Race.create!, 26, [ 3 ])
    terminar(Race.create!, 3, [ 26 ])
    t = Temporada.actual
    assert_equal "El Pistolero", t.lider.name
    assert_equal 1, t.puesto_de(26)
    assert_equal 2, t.puesto_de(3)
    assert_nil t.puesto_de(30)
  end

  # ── El caballo ─────────────────────────────────────────────────────────────────────────────────────────────────

  test "cuenta carreras, victorias, podios, racha y sus últimos puestos" do
    travel_to(3.hours.ago) { terminar(Race.create!, 3, [ 26, 1 ]) } # 2.º (la más vieja)
    travel_to(2.hours.ago) { terminar(Race.create!, 26, [ 1 ]) }
    terminar(Race.create!, 26, [ 3 ]) # la más nueva
    caballo = Caballo.new(Horse.find(26))
    assert_equal 3, caballo.carreras
    assert_equal 2, caballo.victorias
    assert_equal 3, caballo.podios
    assert_equal 2, caballo.racha
    assert_equal [ 1, 1, 2 ], caballo.ultimas
  end

  test "cuenta cómo ganó según el margen y el peor puesto del ganador" do
    assert_equal "Remontó del 5.º al 1.º", Caballo.como_gano(Race.new(win_margin: 20, winner_low_rank: 5))
    assert_equal "Ganó por una cabeza", Caballo.como_gano(Race.new(win_margin: 2, winner_low_rank: 2))
    assert_equal "De punta a punta", Caballo.como_gano(Race.new(win_margin: 30, winner_low_rank: 1))
    assert_equal "Ganó", Caballo.como_gano(Race.new)
  end

  test "lo que te hizo ganar es lo cobrado menos lo apostado con ese caballo" do
    user = User.create!(username: "apostadora")
    race = Race.create!(bet: 40)
    race.participants.create!(user: user, horse_id: 26, horse_name: "El Pistolero")
    race.update!(status: :finished, finished_at: Time.current, winner_name: "El Pistolero")
    race.participants.first.update!(final_rank: 1, payout: 80)
    assert_equal 40, Caballo.new(Horse.find(26)).te_hizo_ganar(user)
  end

  # ── Hora límite de largada ─────────────────────────────────────────────────────────────────────────────────────

  test "si el creador larga antes de la hora, cada jugador cobra el bono" do
    user = User.create!(username: "jugadora", balance: 1000)
    race = Race.create!(starts_at: 5.minutes.from_now)
    race.participants.create!(user: user, horse_id: 1, horse_name: "Uno")
    race.start!
    assert_equal "antes", race.reload.largada
    assert_equal 1000 - 40 + Race::BONO_ANTICIPADO, user.reload.balance
  end

  test "a la hora límite larga sola, se llena y el premio se multiplica por 10" do
    race = Race.create!(starts_at: 1.second.from_now, capacity: 4)
    race.participants.create!(name: "Uno", horse_id: 1, horse_name: "Uno")
    travel 2.seconds do
      LargadaJob.perform_now(race.id)
    end
    race.reload
    assert race.running?
    assert_equal "a_tiempo", race.largada
    assert_equal 4, race.participants.count
    assert_equal race.pozo * Race::PREMIO_A_TIEMPO, race.premio
  end

  test "armar una carrera con hora límite agenda su largada y su aviso" do
    assert_enqueued_with(job: LargadaJob) { Race.create!(starts_at: 5.minutes.from_now) }
  end

  # ── Travesías ──────────────────────────────────────────────────────────────────────────────────────────────────

  def travesia(dias: 2)
    race = Race.armar_travesia!(dias: dias, capacity: 6)
    [ 26, 31, 28 ].each { |id| race.participants.create!(name: "J#{id}", horse_id: id, horse_name: Horse.find(id).name) }
    race
  end

  test "una travesía dura días, larga al crearse y agenda su parte intensa" do
    race = nil
    assert_enqueued_with(job: TravesiaFinalJob) { race = travesia(dias: 2) }
    assert race.travesia?
    assert_equal 2, race.travesia_dias
    assert_equal Race::TRAVESIA_DISTANCIA, race.distance
    assert_in_delta 2.days - Race::TRAVESIA_FINAL, race.final_desde - race.starts_at, 1
  end

  test "las posiciones de una travesía son las mismas para todos y el pelotón se junta al final" do
    race = travesia
    a = race.travesia_posiciones(race.starts_at + 10.hours)
    assert_equal a, race.reload.travesia_posiciones(race.starts_at + 10.hours)
    km = a.map(&:last)
    assert_in_delta 300, km.max, 30 # unos 30 km/h
    separacion = ->(t) { pos = race.travesia_posiciones(t).map(&:last); pos.max - pos.min }
    assert_operator separacion.(race.final_desde), :<, separacion.(race.starts_at + 20.hours) + 1
  end

  test "el que entra tarde a una travesía arranca a la par del último" do
    race = travesia
    travel 8.hours do
      ultimo = race.travesia_posiciones.last.last
      race.participants.create!(name: "Tarde", horse_id: 33, horse_name: "El Último")
      tarde = race.reload.travesia_posiciones.to_h[33]
      assert_in_delta ultimo - 0.2, tarde, 0.5
    end
  end

  test "la parte intensa empieza con la ventaja que se traía, comprimida" do
    race = travesia
    ventajas = race.ventajas_finales
    assert_equal 0.0, ventajas.values.min
    assert_in_delta Race::TRAVESIA_VENTAJA * race.distance, ventajas.values.max, 0.1
  end

  test "adelantar al final deja la parte intensa a segundos y la recta final larga sola" do
    race = travesia
    assert race.adelantar_al_final!(en: 0.seconds)
    assert_in_delta Time.current, race.final_desde, 2
    TravesiaFinalJob.perform_now(race.id)
    assert race.reload.running?
    assert_equal race.capacity, race.participants.count
  end

  test "una travesía no larga antes de tiempo aunque se llene" do
    race = travesia
    TravesiaFinalJob.perform_now(race.id)
    assert race.reload.pending?
  end
end
