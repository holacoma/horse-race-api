# El club de los bots: su leaderboard y los quebrados, a los que la gente les puede donar plata.
class BotsController < WebController
  before_action :require_login

  def index
    @leaderboard = User.bots.where(quebrado_desde: nil).order(balance: :desc).limit(20)
    @quebrados = User.bots.where.not(quebrado_desde: nil).order(:quebrado_desde)
  end

  # Pasa plata de tu saldo al bot. Cuando junta Bot::VUELVE_CON, vuelve al club.
  def donar
    bot = User.bots.find(params[:id])
    monto = params[:monto].to_i
    return redirect_to(bots_path, alert: "Elige cuánto donar.") unless monto.positive?

    User.transaction do
      cobrado = User.where(id: current_user.id).where("balance >= ?", monto).update_all([ "balance = balance - ?", monto ])
      raise ActiveRecord::Rollback unless cobrado == 1
      bot.increment!(:balance, monto)
      bot.update!(quebrado_desde: nil) if bot.balance >= Bot::VUELVE_CON
    end
    redirect_to bots_path, notice: bot.reload.quebrado_desde ? "Donaste #{monto} USD a #{bot.username}." : "#{bot.username} vuelve al club."
  end
end
