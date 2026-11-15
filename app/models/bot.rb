# Un bot del club: su personaje (nombre, frase, horario y estilo) sale de config/bots.yml; su plata vive en su User.
# Estados del día: durmiendo (fuera de su horario), despierto (juega) y quebrado (sin plata hasta que le donen).
class Bot
  ARCHIVO = Rails.root.join("config/bots.yml")
  ZONA = "America/Santiago"
  SALDO_INICIAL = 1_000
  VUELVE_CON = 1_000 # un quebrado vuelve al club cuando junta esto en donaciones
  APUESTA = { "prudente" => 20, "normal" => 40, "arriesgado" => 100 }.freeze

  attr_reader :nombre, :personaje, :despierta, :duerme, :estilo, :dificultad

  FUERZA = { "facil" => 0.4, "normal" => 0.7, "dificil" => 1.0 }

  def self.todos = @todos ||= YAML.load_file(ARCHIVO).map { |datos| new(**datos.symbolize_keys) }
  def self.de(user) = user && todos.find { |bot| bot.nombre == user.username }

  def initialize(nombre:, personaje:, despierta:, duerme:, estilo:, dificultad: "facil")
    @nombre, @personaje, @despierta, @duerme, @estilo, @dificultad = nombre, personaje, despierta, duerme, estilo, dificultad
  end

  # duerme puede ser menor que despierta: el horario cruza la medianoche.
  def despierto?(hora = Time.current.in_time_zone(ZONA).hour)
    despierta < duerme ? hora >= despierta && hora < duerme : hora >= despierta || hora < duerme
  end

  def apuesta = APUESTA.fetch(estilo, 40)
end
