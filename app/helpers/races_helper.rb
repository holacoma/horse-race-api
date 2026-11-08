module RacesHelper
  # El color de cada caballo es el del elemento de su carril, en el orden en que entró a la sala.
  # Mismo orden que ELEMENTS en public/prototipos/carrera3d/caballo-pro.js.
  ELEMENTOS_POR_CARRIL = %w[fuego hielo electricidad agua viento roca sombra luz veneno metal naturaleza cosmos].freeze

  def color_de_carril(index, tinta: false)
    "var(--caballo-#{ELEMENTOS_POR_CARRIL[index % ELEMENTOS_POR_CARRIL.size]}#{'-tinta' if tinta})"
  end
end
