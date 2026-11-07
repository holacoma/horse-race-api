Rails.application.routes.draw do
  get "up" => "rails/health#show", as: :rails_health_check

  root "races#index"

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
    end
    resources :participants, only: [ :create ]
  end

  resources :profiles, param: :username, only: [ :show ]
  resources :horse_favorites, only: [ :create, :destroy ]

  get "/horses/search", to: "horses#search"

  unless Rails.env.production?
    get  "/prototipo3d", to: "prototipos#carrera3d", as: :prototipo3d
    post "/prototipo3d", to: "prototipos#crear_carrera"
  end

  mount ActionCable.server => "/cable"
end
