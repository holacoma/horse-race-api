module RacesHelper
  # Todo sale del elemento del caballo (Horse#elemento): color, chibi, retrato y portada.
  def elemento_de(horse_id) = Horse.elemento_de(horse_id)

  # Retrato del caballo (public/images/retratos, generados con script/retratos).
  def retrato_de(horse_id, clase: "results-retrato")
    image_tag("/images/retratos/#{elemento_de(horse_id)}.webp", alt: "", class: clase, loading: "lazy")
  end

  # El caballo chibi, con borde transparente (public/images/chibis): así se ve en la sala, antes de largar.
  def chibi_de(horse_id, clase: "p-chibi") = image_tag("/images/chibis/#{elemento_de(horse_id)}.webp", alt: "", class: clase)

  def color_de(horse_id, tinta: false) = "var(--caballo-#{elemento_de(horse_id)}#{-tinta if tinta})"

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
