# El latido del lobby vivo (ver Lobby): corre un tick cada segundo y se reprograma solo. Para que nunca haya dos
# cadenas de ticks (reinicios, el vigía de config/recurring.yml que lo enciende cada minuto):
#   - un lock de advisory de Postgres sirve para que dos ticks no corran a la vez, y
#   - antes de reprogramarse, el tick mira que no haya otro LobbyJob más viejo sin terminar y sin fallar en la cola;
#     si lo hay, esa cadena sigue y esta termina. El vigía, entonces, solo "arranca" una cadena cuando no queda ninguna.
class LobbyJob < ApplicationJob
  queue_as :default

  LOCK = 7_204_511 # clave del advisory lock
  CADA = 1.second

  def perform
    return unless Lobby.activo?
    conexion = ActiveRecord::Base.connection
    ActiveRecord::Base.transaction do
      next unless conexion.select_value("SELECT pg_try_advisory_xact_lock(#{LOCK})")
      next if otra_cadena?
      begin
        Lobby.tick
      ensure
        self.class.set(wait: CADA).perform_later
      end
    end
  end

  private

  def otra_cadena?
    return false unless ActiveJob::Base.queue_adapter_name == "solid_queue"
    SolidQueue::Job.where(class_name: "LobbyJob", finished_at: nil).where.missing(:failed_execution)
                   .where(id: ...provider_job_id.to_i).exists?
  end
end
