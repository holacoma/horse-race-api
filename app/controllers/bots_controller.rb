# El club de los bots: su leaderboard y los quebrados, a los que la gente les puede donar plata.
class BotsController < WebController
  before_action :require_login

  def index
    @leaderboard = User.bots.where(quebrado_desde: nil).order(balance: :desc).limit(20)
    @quebrados = User.bots.where.not(quebrado_desde: nil).order(:quebrado_desde)
    @temporada = Temporada.actual
    @mercados = Apuesta::MERCADOS.index_with do |mercado|
      _, temporada, fecha = Apuesta.clave_actual(mercado)
      { abierto: Apuesta.abierto?(mercado), cierre: Apuesta.cierre(mercado), apostado: Apuesta.apostado(mercado, temporada, fecha),
        temporada: temporada, fecha: fecha }
    end
    @pozo_torneo = PozoTorneo.monto_de(@temporada.numero)
    @mis_apuestas = current_user.apuestas.includes(:bot, :ganador).order(id: :desc).limit(30)
  end

  # Apuesta por un bot en «el día» o «la temporada»; se descuenta del saldo al apostar.
  def apostar
    bot = User.bots.find(params[:id])
    apuesta = Apuesta.apostar(user: current_user, bot: bot, mercado: params[:mercado].to_s, monto: params[:monto])
    if apuesta.persisted?
      redirect_to bots_path, notice: "Apostaste #{apuesta.monto} USD por #{bot.username} (#{apuesta.mercado == 'dia' ? 'el día' : 'la temporada'})."
    else
      redirect_to bots_path, alert: apuesta.errors.full_messages.to_sentence
    end
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
