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
end
