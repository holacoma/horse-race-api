# Un bot sin plata queda quebrado (ya no se recarga solo) hasta que la gente le done lo suficiente.
class AddQuebradoDesdeToUsers < ActiveRecord::Migration[8.1]
  def change
    add_column :users, :quebrado_desde, :datetime
  end
end
