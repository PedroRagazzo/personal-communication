defmodule ToraDosBurro.Repo do
  use Ecto.Repo,
    otp_app: :tora_dos_burro,
    adapter: Ecto.Adapters.Postgres
end
