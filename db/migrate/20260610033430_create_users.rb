class CreateUsers < ActiveRecord::Migration[8.1]
  def change
    create_table :users do |t|
      t.string :username,    null: false
      t.string :email
      t.string :provider
      t.string :uid
      t.string :avatar_url

      t.timestamps
    end

    add_index :users, [:provider, :uid], unique: true,
              where: "provider IS NOT NULL", name: "index_users_on_provider_and_uid"
  end
end
