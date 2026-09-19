defmodule ToraDosBurroWeb.AuthPipeline do
  use Guardian.Plug.Pipeline,
    otp_app: :tora_dos_burro,
    module: ToraDosBurro.Guardian,
    error_handler: ToraDosBurroWeb.AuthErrorHandler

  plug Guardian.Plug.VerifyHeader, scheme: "Bearer"
  plug Guardian.Plug.EnsureAuthenticated
  plug Guardian.Plug.LoadResource
end
