Rails.application.routes.draw do
  get "up" => "rails/health#show", as: :rails_health_check

  root "pages#race"

  get    "/login",                   to: "sessions#new",           as: :login
  get    "/auth/:provider/callback", to: "sessions#oauth_callback"
  post   "/sessions/guest",          to: "sessions#create_guest",  as: :guest_session
  delete "/logout",                  to: "sessions#destroy",       as: :logout

  resources :races, only: [:create, :show] do
    member do
      post :start
    end
  end

  mount ActionCable.server => "/cable"
end
