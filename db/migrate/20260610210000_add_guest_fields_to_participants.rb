class AddGuestFieldsToParticipants < ActiveRecord::Migration[8.1]
  def change
    change_column_null :participants, :user_id, true
    add_column :participants, :name, :string
  end
end
