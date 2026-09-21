import Config

# Force using SSL in production. This also sets the "strict-security-transport" header,
# known as HSTS. If you have a health check endpoint, you may want to exclude it below.
# Note `:force_ssl` is required to be set at compile-time.
#
# "2.28.229.48" (VPS deste deploy) na exclusão: esse deploy ainda não tem
# domínio/certificado (decisão do usuário, ver docs/roadmap.md), então o
# backend responde só em HTTP puro por enquanto — sem essa exclusão, TODA
# requisição batia num redirect 301 pra https:// que não existe. Remover
# daqui quando um domínio real (com TLS de verdade) entrar.
config :tora_dos_burro, ToraDosBurroWeb.Endpoint,
  force_ssl: [
    rewrite_on: [:x_forwarded_proto],
    exclude: [
      # paths: ["/health"],
      hosts: ["localhost", "127.0.0.1", "2.28.229.48"]
    ]
  ]

# Do not print debug messages in production
config :logger, level: :info

# Runtime production configuration, including reading
# of environment variables, is done on config/runtime.exs.
