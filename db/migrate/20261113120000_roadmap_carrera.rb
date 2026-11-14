# Roadmap de Club Race: favorito único, usuario especial, bots, carreras largas (travesías), horario de largada,
# pistas, cómo ganó cada carrera e impulsos de la carrera intensa.
class RoadmapCarrera < ActiveRecord::Migration[8.1]
  def up
    change_table :users, bulk: true do |t|
      t.integer :favorite_horse_id
      t.boolean :admin, default: false, null: false
      t.boolean :bot, default: false, null: false
    end

    change_table :races, bulk: true do |t|
      t.string   :kind, default: "carrera", null: false
      t.string   :pista, default: "pradera", null: false
      t.datetime :starts_at   # carrera: hora límite para largar; travesía: largada
      t.datetime :ends_at     # travesía: cuándo termina
      t.float    :win_margin  # metros entre el ganador y el segundo al cruzar
      t.integer  :winner_low_rank # el peor puesto que tuvo el ganador durante la carrera
      t.string   :largada     # "antes" (la largó el creador antes de la hora) o "a_tiempo" (sola, a la hora)
    end
    add_index :races, [ :kind, :status ]

    change_table :participants, bulk: true do |t|
      t.float    :travesia_offset, default: 0.0, null: false
      t.integer  :impulsos, default: 0, null: false
      t.datetime :ultimo_impulso_at
    end

    # El favorito pasa a ser uno solo: el último que cada uno marcó.
    execute <<~SQL
      UPDATE users SET favorite_horse_id = f.horse_id
      FROM (SELECT DISTINCT ON (user_id) user_id, horse_id FROM horse_favorites ORDER BY user_id, created_at DESC) f
      WHERE users.id = f.user_id
    SQL
  end

  def down
    remove_index :races, [ :kind, :status ]
    change_table(:participants, bulk: true) { |t| t.remove :travesia_offset, :impulsos, :ultimo_impulso_at }
    change_table(:races, bulk: true) { |t| t.remove :kind, :pista, :starts_at, :ends_at, :win_margin, :winner_low_rank, :largada }
    change_table(:users, bulk: true) { |t| t.remove :favorite_horse_id, :admin, :bot }
  end
end
