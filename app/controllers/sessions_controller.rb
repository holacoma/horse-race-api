class SessionsController < WebController
  def new
    redirect_to root_path if logged_in?
  end

  def oauth_callback
    user = User.from_omniauth(request.env["omniauth.auth"])
    session[:user_id] = user.id
    redirect_to root_path
  end

  def create_guest
    username = params[:username].to_s.strip
    if username.present?
      user = User.create_guest!(username)
      session[:user_id] = user.id
      redirect_to root_path
    else
      flash[:error] = "Ingresá un nombre para continuar"
      redirect_to login_path
    end
  end

  def destroy
    session.delete(:user_id)
    redirect_to login_path
  end
end
