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

    # Preview público de convite — não exige login nem ser membro.
    get "/invites/:code", InviteController, :show
  end

  scope "/api/v1", ToraDosBurroWeb do
    pipe_through [:api, :auth]

    get "/users/me", UserController, :me

    get "/servers", ServerController, :index
    post "/servers", ServerController, :create
    get "/servers/:id", ServerController, :show
    patch "/servers/:id", ServerController, :update
    delete "/servers/:id", ServerController, :delete
    post "/servers/:server_id/leave", ServerController, :leave

    get "/servers/:server_id/members", ServerMemberController, :index
    delete "/servers/:server_id/members/:user_id", ServerMemberController, :delete
    put "/servers/:server_id/members/:user_id/roles/:role_id", ServerMemberController, :add_role

    delete "/servers/:server_id/members/:user_id/roles/:role_id",
           ServerMemberController,
           :remove_role

    get "/servers/:server_id/roles", RoleController, :index
    post "/servers/:server_id/roles", RoleController, :create
    patch "/servers/:server_id/roles/:id", RoleController, :update
    delete "/servers/:server_id/roles/:id", RoleController, :delete

    post "/servers/:server_id/invites", InviteController, :create
    post "/invites/:code/join", InviteController, :join

    post "/servers/:server_id/bans", BanController, :create
    delete "/servers/:server_id/bans/:user_id", BanController, :delete

    get "/servers/:server_id/channels", ChannelController, :index
    post "/servers/:server_id/channels", ChannelController, :create
    patch "/servers/:server_id/channels/:id", ChannelController, :update
    delete "/servers/:server_id/channels/:id", ChannelController, :delete

    get "/channels/:channel_id/messages", MessageController, :index

    get "/servers/:server_id/categories", CategoryController, :index
    post "/servers/:server_id/categories", CategoryController, :create
    patch "/servers/:server_id/categories/:id", CategoryController, :update
    delete "/servers/:server_id/categories/:id", CategoryController, :delete

    get "/channels/:channel_id/permission_overwrites", PermissionOverwriteController, :index
    put "/channels/:channel_id/permission_overwrites", PermissionOverwriteController, :put

    delete "/channels/:channel_id/permission_overwrites/:target_type/:target_id",
           PermissionOverwriteController,
           :delete
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
