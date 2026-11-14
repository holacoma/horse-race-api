class AddDistanceToRaces < ActiveRecord::Migration[8.1]
  def change
    add_column :races, :distance, :integer, default: 200, null: false
  end
end
