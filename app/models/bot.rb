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

  # Los usuarios de todos los bots (se crean la primera vez), por nombre.
  def self.asegurar_usuarios
    existentes = User.bots.where(username: todos.map(&:nombre)).index_by(&:username)
    todos.to_h { |bot| [ bot.nombre, existentes[bot.nombre] || User.bots.create!(username: bot.nombre, balance: SALDO_INICIAL) ] }
  end

  # El que no puede pagar ni la apuesta más chica queda quebrado hasta que le donen.
  def self.quebrar!(usuarios)
    User.where(id: usuarios.map(&:id), quebrado_desde: nil).where("balance < ?", APUESTA.values.min).update_all(quebrado_desde: Time.current)
  end

  # [bot, usuario] de los que juegan ahora: despiertos y no quebrados.
  def self.activos(usuarios)
    todos.select(&:despierto?).filter_map do |bot|
      user = usuarios[bot.nombre]
      [ bot, user ] if user.quebrado_desde.nil?
    end
  end
end
