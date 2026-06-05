Rails.application.routes.draw do
  get "up" => "rails/health#show", as: :rails_health_check

  root "pages#race"

  resources :races, only: [:create, :show] do
    member do
      post :start
    end
  end

  mount ActionCable.server => "/cable"
end
