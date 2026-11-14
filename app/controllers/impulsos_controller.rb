# El poder de la carrera intensa. Se elige una de tres cartas (corta, media o larga), se hacen sus flechas para
# cargarlo y se lanza: tu caballo arde y acelera. La carta decide cuánto hay que esperar para lanzar el siguiente:
# la corta (3 flechas) obliga a esperar más; la larga (8), casi nada. Solo con la carrera corriendo (desde el ¡YA!).
class ImpulsosController < WebController
  before_action :require_login

  # Flechas de cada carta → segundos de espera después de lanzarla.
  CARTAS = { 3 => 12.0, 5 => 6.0, 8 => 1.0 }.freeze

  def self.espera(flechas) = CARTAS.fetch(flechas, CARTAS.values.max)

  # `visto` es el segundo de la carrera que mostraba la pantalla al lanzar (el `t` de los mensajes «progress»). El
  # simulador lo usa para no castigar la demora de la red (ver RaceSimulationJob::COMPENSA_MAX).

  def create
    race = Race.find_by!(slug: params[:race_slug])
    participant = race.participants.find_by(user: current_user)
    return render(json: { error: "No corres en esta carrera" }, status: :forbidden) unless participant
    return render(json: { error: "La carrera no está corriendo" }, status: :unprocessable_entity) unless corriendo?(race)

    flechas = params[:flechas].to_i
    return render(json: { error: "Esa carta no existe" }, status: :unprocessable_entity) unless CARTAS.key?(flechas)
    anterior = participant.ultimo_impulso_at
    if anterior && Time.current - anterior < self.class.espera(participant.ultimas_flechas || 3)
      return render(json: { error: "Todavía no" }, status: :too_many_requests)
    end
    participant.update!(impulsos: participant.impulsos + 1, ultimo_impulso_at: Time.current, ultimas_flechas: flechas,
                        impulso_visto: Float(params[:visto], exception: false))
    render json: { ok: true, espera: self.class.espera(flechas) }
  end

  private

  # Corriendo de verdad: pasado el preludio (presentación y 3, 2, 1), no apenas se largó.
  def corriendo?(race) = race.running? && race.started_at && Time.current >= race.started_at + RaceSimulationJob::PRELUDE_SEC
end
