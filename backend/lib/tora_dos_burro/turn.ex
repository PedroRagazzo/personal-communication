defmodule ToraDosBurro.Turn do
  @moduledoc """
  Credenciais TURN efêmeras via TURN REST API — mecanismo `use-auth-secret`
  do coturn (https://github.com/coturn/coturn/wiki/turnserver, confirmado
  na wiki oficial, não inventado): `username = "<expiração_unix>:<label>"`,
  `password = base64(hmac_sha1(segredo, username))`. Nunca usuário/senha
  estático — evita que o TURN vire um relay aberto explorável por
  terceiros. Segredo compartilhado com `docker/coturn/turnserver.conf`
  (`static-auth-secret`). Ver docs/security.md.
  """

  # 24h: uma chamada de voz pode durar a sessão inteira; credenciais
  # curtas demais expirariam no meio de uma renegociação/refresh do
  # allocation TURN. Ainda assim efêmero, não estático.
  @ttl_seconds 24 * 60 * 60

  @doc "Credenciais para `user_id` usar como RTCIceServer (urls/username/credential)."
  def credentials(user_id) do
    config = Application.fetch_env!(:tora_dos_burro, __MODULE__)
    secret = Keyword.fetch!(config, :secret)
    url = Keyword.fetch!(config, :url)

    expiry = System.system_time(:second) + @ttl_seconds
    username = "#{expiry}:#{user_id}"
    credential = :crypto.mac(:hmac, :sha, secret, username) |> Base.encode64()

    %{urls: url, username: username, credential: credential}
  end
end
