# Dinero: cada jugador empieza con 1000 USD; cada sala fija su apuesta base (40 USD por defecto); al entrar se paga la
# apuesta (stake) y el ganador se lleva el pozo (payout). Los apostadores de relleno también apuestan.
class AddMoney < ActiveRecord::Migration[8.1]
  def change
    add_column :users, :balance, :integer, null: false, default: 1000
    add_index  :users, :balance
    add_column :races, :bet, :integer, null: false, default: 40
    add_column :participants, :stake, :integer, null: false, default: 0
    add_column :participants, :payout, :integer, null: false, default: 0
  end
end
