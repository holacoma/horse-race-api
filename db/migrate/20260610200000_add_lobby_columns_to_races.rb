class AddLobbyColumnsToRaces < ActiveRecord::Migration[8.1]
  ADJECTIVES = %w[swift bold wild dark golden silver crimson].freeze
  ANIMALS    = %w[fox wolf hawk eagle tiger bear].freeze

  def up
    add_column :races, :slug,        :string
    add_column :races, :capacity,    :integer, null: false, default: 6
    add_column :races, :animal_type, :string,  null: false, default: "horse"
    add_column :races, :is_public,   :boolean, null: false, default: true
    add_column :races, :creator_id,  :bigint

    # Backfill unique slugs for existing rows
    execute("SELECT id FROM races WHERE slug IS NULL").each do |row|
      slug = generate_unique_slug
      execute("UPDATE races SET slug = '#{slug}' WHERE id = #{row['id']}")
    end

    change_column_null :races, :slug, false, ""
    change_column_default :races, :slug, ""

    add_index  :races, :slug, unique: true
    add_foreign_key :races, :users, column: :creator_id
  end

  def down
    remove_foreign_key :races, column: :creator_id
    remove_index :races, :slug
    remove_column :races, :slug
    remove_column :races, :capacity
    remove_column :races, :animal_type
    remove_column :races, :is_public
    remove_column :races, :creator_id
  end

  private

  def generate_unique_slug
    loop do
      slug = "#{ADJECTIVES.sample}-#{ANIMALS.sample}-#{rand(100)}"
      result = execute("SELECT 1 FROM races WHERE slug = '#{slug}' LIMIT 1")
      return slug if result.ntuples == 0
    end
  end
end
