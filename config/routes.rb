Rails.application.routes.draw do
  get "up" => "rails/health#show", as: :rails_health_check

  root "races#index"
  post "/jugar", to: "races#jugar", as: :jugar
  get  "/ranking", to: "races#ranking", as: :ranking

  get    "/login",                   to: "sessions#new",           as: :login
  get    "/auth/:provider/callback", to: "sessions#oauth_callback"
  post   "/sessions/guest",          to: "sessions#create_guest",  as: :guest_session
  delete "/logout",                  to: "sessions#destroy",       as: :logout

  resources :races, param: :slug, only: [ :index, :new, :create, :show ] do
    member do
      post :start
      get  :live
      get  :results
      get  :live3d unless Rails.env.production?
      get  :estado
      post :adelantar
    end
    resources :participants, only: [ :create ]
    resource  :impulso, only: [ :create ]
  end

  resources :profiles, param: :username, only: [ :show ]

  get   "/favorito",    to: "favoritos#edit",   as: :favorito
  patch "/favorito",    to: "favoritos#update"
  get   "/caballos/:id", to: "caballos#show",   as: :caballo

  # Banco de pruebas de la carrera (en producción, solo admins).
  get "/pruebas/carrera", to: "pruebas#carrera", as: :prueba_carrera

  unless Rails.env.production?
    get  "/prototipo3d", to: "prototipos#carrera3d", as: :prototipo3d
    post "/prototipo3d", to: "prototipos#crear_carrera"
    get  "/prototipos/sonidos/candidatos", to: "sonidos#candidatos"
    post "/prototipos/sonidos/elegir",     to: "sonidos#elegir"
    post "/prototipos/sonidos/descartar",  to: "sonidos#descartar"
    post "/prototipos/sonidos/nota",       to: "sonidos#nota"
    post "/prototipos/sonidos/marcas",     to: "sonidos#marcas"
    post "/prototipos/sonidos/mezcla",     to: "sonidos#mezcla"
  end

  mount ActionCable.server => "/cable"
end
