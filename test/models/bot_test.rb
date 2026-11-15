require "test_helper"

class BotTest < ActiveSupport::TestCase
  test "de(nil) no se cae: el relleno no es bot del club" do
    assert_nil Bot.de(nil)
  end

  test "config/bots.yml trae 50 fáciles, 35 normales y 15 difíciles" do
    assert_equal({ "facil" => 50, "normal" => 35, "dificil" => 15 }, Bot.todos.map(&:dificultad).tally.slice("facil", "normal", "dificil"))
  end

  test "la fuerza crece con la dificultad" do
    assert_operator Bot::FUERZA["facil"], :<, Bot::FUERZA["normal"]
    assert_operator Bot::FUERZA["normal"], :<, Bot::FUERZA["dificil"]
  end
end
