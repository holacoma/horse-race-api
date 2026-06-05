class SetupRaces < ActiveRecord::Migration[8.1]
  def up
    drop_table :horses, if_exists: true
    drop_table :races, if_exists: true

    create_table :races do |t|
      t.integer :status, null: false, default: 0
      t.string :winner_name
      t.datetime :started_at
      t.datetime :finished_at

      t.timestamps
    end
  end

  def down
    drop_table :races
  end
end
