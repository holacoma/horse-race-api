class Race < ApplicationRecord
  enum :status, { pending: 0, running: 1, finished: 2 }

  def self.build_with_participants(horse_ids: nil)
    horses = horse_ids ? Horse.all.select { |h| horse_ids.include?(h.id) } : Horse.all
    race = new
    race.instance_variable_set(:@participants, horses)
    race
  end
end
