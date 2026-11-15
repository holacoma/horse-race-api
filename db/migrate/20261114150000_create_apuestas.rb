# Apuestas por bots: «el día» (qué bot termina con más plata) y «la temporada» (qué bot va primero al cerrarla).
# El pozo del torneo acumula lo que no se reparte; el torneo de fin de temporada se diseña después.
class CreateApuestas < ActiveRecord::Migration[8.1]
  def change
    create_table :apuestas do |t|
      t.references :user, null: false, foreign_key: true
      t.references :bot, null: false, foreign_key: { to_table: :users }
      t.string :mercado, null: false
      t.integer :temporada, null: false
      t.date :fecha
      t.integer :monto, null: false
      t.integer :impuesto, null: false, default: 0
      t.string :estado, null: false, default: "abierta"
      t.integer :pago, null: false, default: 0
      t.references :ganador, foreign_key: { to_table: :users }
      t.datetime :liquidada_en
      t.timestamps
    end
    add_index :apuestas, [ :mercado, :temporada, :fecha, :estado ]

    create_table :pozos_torneo do |t|
      t.integer :temporada, null: false, index: { unique: true }
      t.integer :monto, null: false, default: 0
      t.timestamps
    end
  end
end
