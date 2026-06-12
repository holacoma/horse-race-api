class RacesController < WebController
  before_action :require_login
  before_action :set_race, only: [ :show, :start, :live ]

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
    redirect_to live_race_path(@race) and return if @race.running?
    @participants         = @race.participants.includes(:user)
    @my_participant       = @race.participants.find_by(user: current_user)
    @is_creator           = @race.creator_id == current_user.id
    @all_available_horses = @race.available_horses.sample(@race.capacity) if @is_creator

    favorite_ids   = current_user.favorite_horse_ids
    available      = @race.available_horses
    fav_available  = available.select { |h| favorite_ids.include?(h.id) }
    others         = available.reject { |h| favorite_ids.include?(h.id) }.sample(4 - fav_available.size)
    @available_horses    = fav_available + others
    @favorite_horse_ids  = favorite_ids
  end

  def live
    redirect_to race_path(@race) and return unless @race.running? || @race.finished?
    @participants    = @race.participants.includes(:user).order(:created_at)
    @my_participant  = @race.participants.find_by(user: current_user)
    @participants_json = @participants.map { |p| { id: p.horse_id, name: p.horse_name, username: p.display_name } }
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
    params.require(:race).permit(:slug, :capacity, :animal_type, :is_public)
  end
end
