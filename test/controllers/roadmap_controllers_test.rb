require "test_helper"

# Pantallas y acciones nuevas del roadmap: inicio, favorito, ficha, armar sala, travesía, impulsos y avisos.
class RoadmapControllersTest < ActionDispatch::IntegrationTest
  include ActiveJob::TestHelper

  setup do
    post guest_session_path, params: { username: "TestRider" }
    @me = User.find_by(username: "TestRider")
  end

  test "el inicio muestra la temporada, tu favorito y lo recién corrido, todo del lado light" do
    @me.update!(favorite_horse_id: 26)
    race = Race.create!(status: :finished, finished_at: Time.current, winner_name: "El Pistolero")
    race.participants.create!(name: "Otra", horse_id: 26, horse_name: "El Pistolero", final_rank: 1)
    get root_path
    assert_response :ok
    assert_select "html[data-fase='fuera']"
    assert_select ".temporada", /Temporada/
    assert_select ".tu-favorito a[href='#{caballo_path(26)}']"
    assert_select ".tu-favorito a[href='#{favorito_path}']", "Cambiar"
    assert_select ".ultimas", /El Pistolero/
    assert_select "dialog#armar-sala form input[name='race[kind]']", 2
  end

  test "sin favorito, el inicio invita a elegir uno" do
    get root_path
    assert_select "a.tu-favorito[href='#{favorito_path}']", /Elige tu caballo/
  end

  test "elegir favorito muestra los 36 caballos y marca el tuyo" do
    @me.update!(favorite_horse_id: 26)
    get favorito_path
    assert_response :ok
    assert_select ".elegir-caballo", Horse::CATALOG.size
    assert_select ".elegir-caballo.es-favorito", /El Pistolero/
  end

  test "cambiar de favorito lo guarda y vuelve al inicio (o a la ficha)" do
    patch favorito_path, params: { horse_id: 31 }
    assert_redirected_to root_path
    assert_equal 31, @me.reload.favorite_horse_id
    patch favorito_path, params: { horse_id: 2, volver: "ficha" }
    assert_redirected_to caballo_path(2)
  end

  test "Jugar ya entra con tu favorito" do
    @me.update!(favorite_horse_id: 26)
    post jugar_path
    assert_equal 26, Participant.find_by(user: @me).horse_id
  end

  test "la ficha del caballo es del lado dark y ofrece hacerlo tu favorito" do
    get caballo_path(31)
    assert_response :ok
    assert_select "html[data-fase='carrera']"
    assert_select ".ficha-nombre", "El Relámpago"
    assert_select "form[action='#{favorito_path}'] button", /Hacerlo mi favorito/
    @me.update!(favorite_horse_id: 31)
    get caballo_path(31)
    assert_select ".ficha-etiqueta", "Tu favorito"
    assert_select "a[href='#{favorito_path}']", /Cambiar favorito/
  end

  test "armar una carrera con hora límite" do
    post races_path, params: { race: { kind: "carrera", slug: "con-hora", capacity: 4, distance: 2000, bet: 40, pista: "desierto", espera: 5 } }
    race = Race.find_by!(slug: "con-hora")
    assert race.carrera?
    assert_equal "desierto", race.pista
    assert_in_delta 5.minutes.from_now, race.starts_at, 5
  end

  test "armar una travesía" do
    post races_path, params: { race: { kind: "travesia", slug: "larga", capacity: 6, bet: 40, pista: "nevado", dias: 3 } }
    race = Race.find_by!(slug: "larga")
    assert_redirected_to race_path(race)
    assert race.travesia?
    assert_equal 3, race.travesia_dias
  end

  test "la sala de una travesía trae sus posiciones y el HUD light, sin botón de largar" do
    race = Race.armar_travesia!(dias: 1, creator: @me, slug: "trav")
    race.participants.create!(user: @me, horse_id: 26, horse_name: "El Pistolero")
    get race_path(race)
    assert_response :ok
    assert_select ".trav-hud .trav-pos li.tu", /El Pistolero/
    assert_select "#btn-start", 0
    assert_select ".adelantar", 0 # solo el usuario especial
    datos = JSON.parse(css_select("#race-data").first.text)
    assert_equal "travesia", datos["kind"]
    assert_equal 26, datos["travesia"]["posiciones"].first["id"]
  end

  test "el estado de la travesía da los kilómetros de cada uno" do
    race = Race.armar_travesia!(dias: 1, slug: "trav2")
    race.participants.create!(name: "A", horse_id: 26, horse_name: "El Pistolero")
    get estado_race_path(race), as: :json
    json = response.parsed_body
    assert_equal "pending", json["status"]
    assert_equal [ 26 ], json["posiciones"].map { |p| p["id"] }
  end

  test "solo el usuario especial puede adelantar una travesía" do
    race = Race.armar_travesia!(dias: 2, slug: "trav3")
    post adelantar_race_path(race)
    assert_response :forbidden
    @me.update!(admin: true)
    post adelantar_race_path(race)
    assert_redirected_to race_path(race)
    assert_in_delta 20.seconds.from_now, race.reload.final_desde, 3
  end

  test "el poder se lanza solo con la carrera corriendo y la carta decide la espera para el siguiente" do
    race = Race.create!(slug: "flechas")
    race.participants.create!(user: @me, horse_id: 1, horse_name: "Uno")
    post race_impulso_path(race), params: { flechas: 8 }, as: :json
    assert_response :unprocessable_entity
    race.update!(status: :running, started_at: Time.current)
    post race_impulso_path(race), params: { flechas: 8 }, as: :json
    assert_response :unprocessable_entity # todavía en el preludio
    race.update!(started_at: 20.seconds.ago)
    post race_impulso_path(race), params: { flechas: 4 }, as: :json
    assert_response :unprocessable_entity # no hay carta de 4
    post race_impulso_path(race), params: { flechas: 3 }, as: :json
    assert_response :ok
    assert_equal 1, race.participants.first.reload.impulsos
    travel 7.seconds do
      post race_impulso_path(race), params: { flechas: 8 }, as: :json
      assert_response :too_many_requests # la corta obliga a esperar 12 s
    end
    travel 13.seconds do
      post race_impulso_path(race), params: { flechas: 8 }, as: :json
      assert_response :ok
    end
  end

  test "el poder guarda el instante que el jugador veía, si es un número" do
    race = Race.create!(slug: "visto", status: :running, started_at: 20.seconds.ago)
    participant = race.participants.create!(user: @me, horse_id: 1, horse_name: "Uno")
    post race_impulso_path(race), params: { flechas: 8, visto: 41.7 }, as: :json
    assert_response :ok
    assert_in_delta 41.7, participant.reload.impulso_visto, 0.001
    travel 2.seconds do
      post race_impulso_path(race), params: { flechas: 8, visto: "basura" }, as: :json
      assert_response :ok
    end
    assert_nil participant.reload.impulso_visto
  end

  test "el perfil muestra el favorito en vez de administrar una lista" do
    @me.update!(favorite_horse_id: 26)
    get profile_path(@me.username)
    assert_select ".perfil-favorito[href='#{caballo_path(26)}']", /El Pistolero/
  end
end
