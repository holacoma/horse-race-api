# Qué instante de la carrera (segundos del reloj del servidor) estaba viendo el jugador al lanzar su poder: el servidor
# lo juzga contra eso y no contra el momento en que le llega el mensaje (la red del teléfono tarda).
class AddImpulsoVistoToParticipants < ActiveRecord::Migration[8.1]
  def change
    add_column :participants, :impulso_visto, :float
  end
end
