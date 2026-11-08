class RacesController < WebController
  before_action :require_login
  before_action :set_race, only: [ :show, :start, :live, :live3d, :results ]

  def index
    @races = Race.where(is_public: true, status: :pending)
                 .includes(:participants, :creator)
                 .order(created_at: :desc)
  end

  def new
    @race = Race.new
    @room_name = Race.pick_room_name
  end

  def create
    @race = Race.new(race_params)
    @race.creator = current_user
    if @race.save
      redirect_to race_path(@race)
    else
      @room_name = Race.pick_room_name
      render :new, status: :unprocessable_entity
    end
  end

  # La sala y la carrera son la misma pantalla: la carrera 3D ya está en la sala, con los caballos esperando en la
  # largada, y al largar la interfaz se corre. Si se abre con la carrera en marcha, entra directo a la carrera.
  def show
    redirect_to results_race_path(@race) and return if @race.finished?
    @participants         = @race.participants.includes(:user).order(:created_at)
    @my_participant       = @race.participants.find_by(user: current_user)
    @is_creator           = @race.creator_id == current_user.id
    @all_available_horses = @race.available_horses.sample(@race.capacity) if @is_creator

    favorite_ids   = current_user.favorite_horse_ids
    available      = @race.available_horses
    fav_available  = available.select { |h| favorite_ids.include?(h.id) }
    others         = available.reject { |h| favorite_ids.include?(h.id) }.sample(4 - fav_available.size)
    @available_horses    = fav_available + others
    @favorite_horse_ids  = favorite_ids
    @seconds_to_start    = @race.running? ? [ @race.started_at + RaceSimulationJob::PRELUDE_SEC - Time.current, 0 ].max : nil
  end

  # La carrera 2D quedó reemplazada por la 3D de la sala.
  def live
    redirect_to results_race_path(@race) and return if @race.finished?
    redirect_to race_path(@race)
  end

  # Prototipo: la misma carrera real que `live`, dibujada en 3D.
  def live3d
    redirect_to results_race_path(@race) and return if @race.finished?
    redirect_to race_path(@race) and return unless @race.running?
    participants = @race.participants.includes(:user).order(:created_at)
    @participants_json = participants.map { |p| { id: p.horse_id, name: p.horse_name, username: p.display_name } }
    @my_horse_id = participants.find { |p| p.user_id == current_user.id }&.horse_id
    @seconds_to_start = [ @race.started_at + RaceSimulationJob::PRELUDE_SEC - Time.current, 0 ].max
    render layout: false
  end

  def results
    redirect_to race_path(@race) and return unless @race.finished?
    @results        = @race.results
    @my_participant = @results.find { |participant| participant.user_id == current_user.id }
    # Mismo color que en la pista, que los asigna por orden de llegada a la sala.
    @lane_index     = @results.sort_by(&:created_at).each_with_index.to_h
  end

  # Jugar ya: te suma a la sala abierta más reciente con lugar, o abre una, y te pone un caballo en la largada
  # (uno de tus favoritos si hay alguno libre). Desde la sala se pueden sumar más.
  # Si ya estás en una sala que no terminó, volvés a esa: un caballo por jugador.
  def jugar
    mine = Race.where(status: %i[pending running]).joins(:participants).where(participants: { user_id: current_user.id })
               .order(created_at: :desc).first
    return redirect_to race_path(mine) if mine

    race = Race.where(is_public: true, status: :pending).order(created_at: :desc).includes(:participants)
               .detect { |r| r.participants.size < r.capacity }
    race ||= Race.create!(capacity: 6, distance: 2000, is_public: true, creator: current_user, slug: Race.pick_room_name[:slug])
    favorites = current_user.favorite_horse_ids
    horse = race.available_horses.find { |h| favorites.include?(h.id) } || race.available_horses.sample
    race.participants.create!(user: current_user, horse_id: horse.id, horse_name: horse.name).announce_joined
    race.reload.start! if race.full? && race.pending?
    redirect_to race_path(race)
  end

  def start
    if @race.start!
      render json: { id: @race.id, status: @race.status, race_started: true }
    else
      render json: { error: "Race already #{@race.status}" }, status: :unprocessable_entity
    end
  end

  private

  def set_race
    @race = Race.find_by!(slug: params[:slug])
  end

  def race_params
    params.require(:race).permit(:slug, :capacity, :distance, :animal_type, :is_public)
  end
end
