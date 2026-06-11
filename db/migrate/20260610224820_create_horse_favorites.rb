class CreateHorseFavorites < ActiveRecord::Migration[8.1]
  def change
    create_table :horse_favorites do |t|
      t.references :user, null: false, foreign_key: true
      t.integer    :horse_id, null: false
      t.timestamps
    end
    add_index :horse_favorites, [ :user_id, :horse_id ], unique: true
  end
end
