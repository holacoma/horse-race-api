module RacesHelper
  # El color de cada caballo es el del elemento de su carril, en el orden en que entró a la sala.
  # Mismo orden que ELEMENTS en public/prototipos/carrera3d/caballo-pro.js.
  ELEMENTOS_POR_CARRIL = %w[fuego hielo electricidad agua viento roca sombra luz veneno metal naturaleza cosmos].freeze

  def color_de_carril(index, tinta: false)
    "var(--caballo-#{ELEMENTOS_POR_CARRIL[index % ELEMENTOS_POR_CARRIL.size]}#{'-tinta' if tinta})"
  end

  # Dibujo del caballo, estilo Spider-Verse: color plano, una capa corrida como error de impresión, trama de puntos
  # en la sombra y contorno grueso de tinta. Sin color, queda en tinta (para elegir, antes de tener carril).
  # Las piezas están en shared/_dibujo_defs; el mismo marcado lo arma race_lobby_controller para los que llegan.
  def dibujo_caballo(color = nil, clase: nil)
    tag.svg(class: [ "dibujo-caballo", clase ], viewBox: "-8 0 112 104", style: ("--c: #{color}" if color), aria: { hidden: true }) do
      safe_join([
        tag.use(href: "#dc-cabeza", class: "dc-desfase", transform: "translate(5 -3)"),
        tag.use(href: "#dc-cabeza", class: "dc-pelo"),
        tag.g(tag.rect(x: -10, y: -10, width: 120, height: 120, fill: "url(#dc-puntos)", opacity: "0.5"), "clip-path": "url(#dc-recorte)", mask: "url(#dc-mascara)"),
        tag.use(href: "#dc-crin", class: "dc-crin"),
        tag.use(href: "#dc-cabeza", class: "dc-linea"),
        tag.use(href: "#dc-detalle")
      ])
    end
  end
end
