import Config

# Configure your database
#
# The MIX_TEST_PARTITION environment variable can be used
# to provide built-in test partitioning in CI environment.
# Run `mix help test` for more information.
config :tora_dos_burro, ToraDosBurro.Repo,
  username: "tora",
  password: "tora_dev_password",
  hostname: "localhost",
  database: "tora_dos_burro_test#{System.get_env("MIX_TEST_PARTITION")}",
  pool: Ecto.Adapters.SQL.Sandbox,
  pool_size: System.schedulers_online() * 2

# We don't run a server during test. If one is required,
# you can enable the server option below.
config :tora_dos_burro, ToraDosBurroWeb.Endpoint,
  http: [ip: {127, 0, 0, 1}, port: 4002],
  secret_key_base: "VZ6sRkYgwTeKjFs/TLY0ui10RLH0XLJQu6FE/UvzLv2tYawLLc3gQXNae3whmMMF",
  server: false

# Print only warnings and errors during test
config :logger, level: :warning

# Guardian (JWT) — chave só de teste. Gerada com `mix guardian.gen.secret`.
config :tora_dos_burro, ToraDosBurro.Guardian,
  secret_key: "h1rfvt_LPguB1djZfedINNexR2iPDwZ9M3hOzpGyTLhFediqscycGshtHVOJBz5c"

# argon2 mais rápido em teste (não precisa do custo total de produção)
config :argon2_elixir, t_cost: 1, m_cost: 8

# Initialize plugs at runtime for faster test compilation
config :phoenix, :plug_init_mode, :runtime

# Sort query params output of verified routes for robust url comparisons
config :phoenix,
  sort_verified_routes_query_params: true
