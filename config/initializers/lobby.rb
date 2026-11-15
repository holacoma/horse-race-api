# En desarrollo el adaptador es :async y no hay tareas recurrentes: al levantar el servidor se enciende el latido del
# lobby (en producción lo enciende el vigía de config/recurring.yml).
if Rails.env.development?
  Rails.application.config.after_initialize do
    LobbyJob.set(wait: 3.seconds).perform_later if defined?(Rails::Server) && ENV["CLUB_BOTS"] != "0"
  end
end
