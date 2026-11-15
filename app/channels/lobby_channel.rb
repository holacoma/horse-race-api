# El inicio en vivo: salas que aparecen, lugares que se ocupan y salas que arrancan (ver Race#anunciar_en_lobby).
class LobbyChannel < ApplicationCable::Channel
  def subscribed
    stream_from "lobby"
  end
end
