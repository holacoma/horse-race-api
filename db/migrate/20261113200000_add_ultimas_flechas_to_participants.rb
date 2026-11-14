# Cuántas flechas tenía la última carta que lanzó cada jugador: de eso sale cuánto tiene que esperar para la siguiente.
class AddUltimasFlechasToParticipants < ActiveRecord::Migration[8.1]
  def change
    add_column :participants, :ultimas_flechas, :integer
  end
end
