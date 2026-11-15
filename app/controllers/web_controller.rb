class WebController < ActionController::Base
  layout "application"
  helper_method :current_user, :logged_in?
  before_action :vencer_sesion_inactiva
  after_action :marcar_visita

  # Lo mismo que la cookie, del lado del servidor: una cookie vieja guardada no vale después de 7 días sin venir.
  SESION_INACTIVA = 7.days

  private

  def current_user
    @current_user ||= User.find_by(id: session[:user_id])
  end

  def vencer_sesion_inactiva
    visto = session[:visto_en]
    reset_session if visto && Time.zone.at(visto) < SESION_INACTIVA.ago
  end

  def marcar_visita
    session[:visto_en] = Time.current.to_i if session[:user_id]
  end

  def logged_in?
    current_user.present?
  end

  def require_login
    redirect_to login_path unless logged_in?
  end
end
