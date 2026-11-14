class RacesController < WebController
  before_action :require_login
  before_action :set_race, only: [ :show, :start, :live, :live3d, :results, :estado, :adelantar ]

  def index
    @races = Race.abiertas.includes(:participants, :creator).order(created_at: :desc).limit(8)
    @ranking   = User.ranking.limit(5)
    @saldo     = current_user.reload.balance
    @temporada = Temporada.actual
    @favorito  = current_user.favorite_horse && Caballo.new(current_user.favorite_horse)
    @recientes = Race.finished.where(is_public: true).order(finished_at: :desc).limit(3).includes(:participants)
    @nueva     = Race.new(pista: "pradera")
    @room_name = Race.pick_room_name
  end

  # El ranking completo: los que más plata tienen (solo cuentas de Google; los invitados son de una visita).
  def ranking
    @ranking = User.ranking.limit(50)
  end

  def new
    @race = Race.new
    @room_name = Race.pick_room_name
  end

  # Armar una sala: una carrera (larga sola a la hora límite que se elija) o una travesía (dura días).
  def create
    @race = if params.dig(:race, :kind) == "travesia"
      Race.armar_travesia!(dias: params.dig(:race, :dias), **race_params.except(:kind, :distance).to_h.symbolize_keys, creator: current_user)
    else
      Race.new(race_params.except(:kind)).tap do |race|
        race.creator = current_user
        espera = params.dig(:race, :espera).to_i
        race.starts_at = espera.minutes.from_now if Race::ESPERAS.include?(espera)
        race.save
      end
    end
    if @race.persisted?
      redirect_to race_path(@race)
    else
      @room_name = Race.pick_room_name
      render :new, status: :unprocessable_entity
    end
  rescue ActiveRecord::RecordInvalid => e
    @race = e.record
    @room_name = Race.pick_room_name
    render :new, status: :unprocessable_entity
  end

  # La travesía en curso, para refrescar su HUD: posiciones (km) y cuánto falta.
  def estado
    render json: {
      status: @race.status, kind: @race.kind, segundosParaLargar: @race.segundos_para_largar,
      avance: (@race.travesia_avance if @race.travesia?),
      posiciones: (@race.travesia_posiciones.map { |id, km| { id: id, km: km.round(2) } } if @race.travesia?)
    }
  end

  # Solo para el usuario especial: adelantar la travesía hasta justo antes de la parte intensa, para ver la transición.
  def adelantar
    return head(:forbidden) unless current_user.admin?
    @race.adelantar_al_final!
    redirect_to race_path(@race)
  end

  # La sala y la carrera son la misma pantalla: la carrera 3D ya está en la sala, con los caballos esperando en la
  # largada, y al largar la interfaz se corre. Si se abre con la carrera en marcha, entra directo a la carrera.
  def show
    redirect_to results_race_path(@race) and return if @race.finished?
    @participants         = @race.participants.includes(:user).order(:created_at)
    @my_participant       = @race.participants.find_by(user: current_user)
    @is_creator           = @race.creator_id == current_user.id
    # Para elegir y para sumar, un caballo por elemento: así cada opción se ve distinta.
    @all_available_horses = @race.available_horses.shuffle.uniq(&:elemento).first(@race.capacity) if @is_creator

    favorite_ids   = current_user.favorite_horse_ids
    available      = @race.available_horses
    fav_available  = available.select { |h| favorite_ids.include?(h.id) }
    others         = available.reject { |h| favorite_ids.include?(h.id) }.shuffle
    @available_horses    = (fav_available + others).uniq(&:elemento).first([ fav_available.size, 4 ].max)
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
  # Si ya estás en una sala que no terminó, se vuelve a esa: un caballo por jugador.
  # Los lugares que quedan libres se llenan al toque con apostadores y la carrera larga: no se espera a nadie.
  def jugar
    race = Race.carrera.where(status: %i[pending running]).joins(:participants).where(participants: { user_id: current_user.id })
               .order(created_at: :desc).first
    unless race
      saldo = current_user.reload.balance
      return redirect_to(root_path, alert: "Te quedaste sin fondos: no puedes apostar.") if saldo < Race::BET_RANGE.min
      # Solo salas cuya apuesta te alcance; si no hay, abre una con la apuesta base (o lo que te quede).
      race = Race.carrera.abiertas.where("bet <= ?", saldo).order(created_at: :desc).includes(:participants)
                 .detect { |r| r.participants.size < r.capacity }
      race ||= Race.create!(capacity: 6, distance: 2000, bet: [ Race.new.bet, saldo ].min, is_public: true,
                            creator: current_user, slug: Race.pick_room_name[:slug])
      favorites = current_user.favorite_horse_ids
      horse = race.available_horses.find { |h| favorites.include?(h.id) } || race.available_horses.sample
      race.participants.create!(user: current_user, horse_id: horse.id, horse_name: horse.name).announce_joined
    end
    llenar_y_largar(race) if race.pending?
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

  def llenar_y_largar(race)
    race.llenar_con_apostadores!.start!
  end

  def set_race
    @race = Race.find_by!(slug: params[:slug])
  end

  def race_params
    params.require(:race).permit(:slug, :capacity, :distance, :bet, :animal_type, :is_public, :pista, :kind)
  end
end
