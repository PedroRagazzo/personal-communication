# This file is responsible for configuring your application
# and its dependencies with the aid of the Config module.
#
# This configuration file is loaded before any dependency and
# is restricted to this project.

# General application configuration
import Config

config :tora_dos_burro,
  ecto_repos: [ToraDosBurro.Repo],
  generators: [timestamp_type: :utc_datetime, binary_id: true]

# Configure the endpoint
config :tora_dos_burro, ToraDosBurroWeb.Endpoint,
  url: [host: "localhost"],
  adapter: Bandit.PhoenixAdapter,
  render_errors: [
    formats: [json: ToraDosBurroWeb.ErrorJSON],
    layout: false
  ],
  pubsub_server: ToraDosBurro.PubSub,
  live_view: [signing_salt: "AvOpWtgL"]

# Configure Elixir's Logger
config :logger, :default_formatter,
  format: "$time $metadata[$level] $message\n",
  metadata: [:request_id]

# Use Jason for JSON parsing in Phoenix
config :phoenix, :json_library, Jason

# Guardian (JWT) — ver docs/security.md. secret_key é definido por ambiente
# (dev.exs/test.exs têm um valor fixo de desenvolvimento; runtime.exs lê de
# GUARDIAN_SECRET_KEY em produção).
config :tora_dos_burro, ToraDosBurro.Guardian, issuer: "tora_dos_burro"

# guardian_db — rastreia tokens emitidos para permitir revogação/rotação
# reais (Guardian sozinho é stateless). Ver migration create_guardian_tokens.
config :guardian, Guardian.DB,
  repo: ToraDosBurro.Repo,
  schema_name: "guardian_tokens"

# Import environment specific config. This must remain at the bottom
# of this file so it overrides the configuration defined above.
import_config "#{config_env()}.exs"
