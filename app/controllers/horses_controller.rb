class HorsesController < WebController
  before_action :require_login

  def search
    q = params[:q].to_s.strip.downcase
    favorited_ids = Set.new(current_user.horse_favorites.pluck(:horse_id))
    available = Horse.all.reject { |h| favorited_ids.include?(h.id) }
    horses = q.present? ? available.select { |h| h.name.downcase.include?(q) }.first(5) : available.first(5)
    render partial: "horses/search_results", locals: {
      horses: horses,
      query: params[:q].to_s,
      favorited_all: available.empty?
    }
  end
end
