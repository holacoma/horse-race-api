class RacesController < WebController
  layout false
  before_action :require_login
  before_action :set_race, only: [ :show, :start ]

  def index
    @races = Race.where(is_public: true, status: :pending)
                 .includes(:participants, :creator)
                 .order(created_at: :desc)
  end

  def new
    @race = Race.new
    @race.generate_slug
  end

  def create
    @race = Race.new(race_params)
    @race.creator = current_user
    if @race.save
      redirect_to race_path(@race)
    else
      render :new, status: :unprocessable_entity
    end
  end

  def show
    @participants         = @race.participants.includes(:user)
    @available_horses     = @race.available_horses.sample(4)
    @my_participant       = @race.participants.find_by(user: current_user)
    @is_creator           = @race.creator_id == current_user.id
    @all_available_horses = @race.available_horses.sample(@race.capacity) if @is_creator
  end

  def start
    if @race.pending?
      @race.update!(status: :running, started_at: Time.current)
      RaceSimulationJob.perform_later(@race.id)
      render json: { id: @race.id, status: @race.status }
    else
      render json: { error: "Race already #{@race.status}" }, status: :unprocessable_entity
    end
  end

  private

  def set_race
    @race = Race.find_by!(slug: params[:slug])
  end

  def race_params
    params.require(:race).permit(:slug, :capacity, :animal_type, :is_public)
  end
end
