require "test_helper"

class RaceSimulationJobTest < ActiveJob::TestCase
  include ActionCable::TestHelper

  setup do
    @race = Race.create!(status: :running, capacity: 4)
    Horse.all.first(4).each_with_index do |horse, i|
      @race.participants.create!(name: "Jugador #{i}", horse_id: horse.id, horse_name: horse.name)
    end
  end

  def run_race
    job = RaceSimulationJob.new
    job.define_singleton_method(:sleep) { |*| }
    job.perform(@race.id)
  end

  test "saves every finishing position with the announced winner first" do
    run_race

    results = @race.reload.results
    assert @race.finished?
    assert_equal [ 1, 2, 3, 4 ], results.map(&:final_rank)
    assert_equal @race.winner_name, results.first.horse_name
  end

  test "si varios cruzan en el mismo tick gana el que más pasó la meta, no el primero de la lista" do
    entries = [ { name: "primero de la lista", reached: 101.0 }, { name: "el que más avanzó", reached: 130.0 }, { name: "no llegó", reached: 90.0 } ]

    winner = RaceSimulationJob.new.send(:first_to_arrive, entries, 100.0)

    assert_equal "el que más avanzó", winner[:name]
    assert_nil RaceSimulationJob.new.send(:first_to_arrive, [ { reached: 99.0 } ], 100.0)
  end

  test "lo que dura la carrera sale de su distancia y el canal manda el porcentaje recorrido" do
    @race.update!(distance: 400)

    ticks = capture_broadcasts("race_#{@race.id}") { run_race }.select { |m| m["type"] == "progress" }

    leader = ticks.map { |tick| tick["participants"].map { |p| p["position"] }.max }
    assert_equal 100.0, leader.last
    # Aceleran: el último tramo recorre más que el primero.
    assert_operator leader[-2] - leader[-3], :>, leader[1] - leader[0]
    assert_operator leader.first, :<, 1
  end

  # Ritmo: muchos sobrepasos y llegadas cerradas, nadie gana sobrado.
  test "el pelotón llega junto y el líder cambia varias veces" do
    margenes, cambios = [], []
    8.times do
      race = Race.create!(status: :running, capacity: 6, distance: 2000)
      Horse.all.sample(6).uniq(&:elemento).each { |h| race.participants.create!(name: "J#{h.id}", horse_id: h.id, horse_name: h.name) }
      @race = race
      ticks = capture_broadcasts("race_#{race.id}") { run_race }.select { |m| m["type"] == "progress" }
      lideres = ticks.map { |t| t["participants"].max_by { |p| p["position"] }["id"] }
      cambios << lideres.each_cons(2).count { |a, b| a != b }
      margenes << race.reload.win_margin
    end
    puts "
margen promedio #{(margenes.sum / margenes.size).round(1)} m · cambios de líder #{cambios.inspect}"
    assert_operator margenes.sum / margenes.size, :<, 18 # metros al cruzar: a 120 m/s, 0,15 s
    assert_operator cambios.sum / cambios.size.to_f, :>=, 2
  end

  test "guarda el margen y el peor puesto del ganador para contar cómo ganó" do
    run_race
    @race.reload
    assert_operator @race.win_margin, :>=, 0
    assert_includes 1..4, @race.winner_low_rank
  end

  test "el poder lanzado acelera de a poco y todos ven arder al caballo" do
    job = RaceSimulationJob.new
    p = @race.participants.first
    entries = [ { participant: p, horse: Horse.find(p.horse_id), impulsos: 0, impulso_desde: -100.0, bot: false } ]
    p.update!(impulsos: 1)
    avisos = capture_broadcasts("race_#{@race.id}") { job.send(:leer_impulsos, entries, 5.0, @race.id) }
    assert_equal [ "impulso" ], avisos.map { |m| m["type"] }
    sube = [ 5.3, 5.9, 6.4 ].map { |t| job.send(:impulso, entries.first, t) }
    assert_equal sube, sube.sort, "acelera de a poco"
    assert_equal 0.0, job.send(:impulso, entries.first, 5.0 + RaceSimulationJob::IMPULSO_SEC + 0.1)
  end

  test "los apostadores también lanzan su poder de vez en cuando, los jugadores no" do
    avisos = capture_broadcasts("race_#{@race.id}") { run_race }.select { |m| m["type"] == "impulso" }
    assert_operator avisos.size, :>, 0
    user = User.create!(username: "jugadora")
    @race = Race.create!(status: :running, capacity: 2)
    @race.participants.create!(user: user, horse_id: 1, horse_name: "Uno")
    @race.participants.create!(user: User.create!(username: "otra"), horse_id: 2, horse_name: "Dos")
    assert_empty capture_broadcasts("race_#{@race.id}") { run_race }.select { |m| m["type"] == "impulso" }
  end
end
