class AddFinalRankToParticipants < ActiveRecord::Migration[8.1]
  def change
    add_column :participants, :final_rank, :integer
  end
end
