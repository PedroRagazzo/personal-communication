defmodule ToraDosBurroWeb.Router do
  use ToraDosBurroWeb, :router

  pipeline :api do
    plug :accepts, ["json"]
  end

  pipeline :auth do
    plug ToraDosBurroWeb.AuthPipeline
  end

  scope "/api/v1", ToraDosBurroWeb do
    pipe_through :api

    get "/health", HealthController, :index

    post "/auth/register", AuthController, :register
    post "/auth/login", AuthController, :login
    post "/auth/refresh", AuthController, :refresh
    post "/auth/logout", AuthController, :logout
  end

  scope "/api/v1", ToraDosBurroWeb do
    pipe_through [:api, :auth]

    get "/users/me", UserController, :me
  end

  # Enable LiveDashboard in development
  if Application.compile_env(:tora_dos_burro, :dev_routes) do
    # If you want to use the LiveDashboard in production, you should put
    # it behind authentication and allow only admins to access it.
    # If your application does not have an admins-only section yet,
    # you can use Plug.BasicAuth to set up some basic authentication
    # as long as you are also using SSL (which you should anyway).
    import Phoenix.LiveDashboard.Router

    scope "/dev" do
      pipe_through [:fetch_session, :protect_from_forgery]

      live_dashboard "/dashboard", metrics: ToraDosBurroWeb.Telemetry
    end
  end
end
