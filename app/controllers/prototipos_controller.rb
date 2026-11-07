# Prototipo de la carrera en 3D: arma de un clic una carrera real, con su job y su Action Cable.
class PrototiposController < WebController
  before_action :require_login

  def carrera3d
  end

  def crear_carrera
    count = params[:caballos].to_i.clamp(2, 12)
    distance = params[:distancia].to_i.clamp(Race::DISTANCE_RANGE)
    horses = Horse.all.sample(count)
    bettors = Race::BETTOR_NAMES.sample(count)

    race = Race.create!(slug: Race.pick_room_name[:slug], capacity: count, distance: distance, is_public: false, creator: current_user)
    race.participants.create!(user: current_user, horse_id: horses.first.id, horse_name: horses.first.name)
    horses.drop(1).each_with_index do |horse, i|
      race.participants.create!(name: bettors[i], horse_id: horse.id, horse_name: horse.name)
    end
    race.start!(countdown: RaceSimulationJob::PRELUDE_SEC)

    redirect_to live3d_race_path(race)
  end
end
