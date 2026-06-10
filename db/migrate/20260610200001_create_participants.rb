class CreateParticipants < ActiveRecord::Migration[8.1]
  def change
    create_table :participants do |t|
      t.references :race, null: false, foreign_key: true
      t.references :user, null: false, foreign_key: true
      t.integer :horse_id,   null: false
      t.string  :horse_name, null: false
      t.timestamps
    end

    add_index :participants, [ :race_id, :user_id ],  unique: true
    add_index :participants, [ :race_id, :horse_id ], unique: true
  end
end
