# Avisos para todos los que tienen el juego abierto (por ejemplo, una carrera a punto de empezar).
class AvisosChannel < ApplicationCable::Channel
  def subscribed
    stream_from "avisos"
  end
end
