class ChangeDefaultDistanceOnRaces < ActiveRecord::Migration[8.1]
  def change
    change_column_default :races, :distance, from: 200, to: 2000
  end
end
