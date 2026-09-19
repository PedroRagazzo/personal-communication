defmodule ToraDosBurro.GoLive.LiveKitToken do
  @moduledoc """
  Gera access tokens JWT (HS256) para o LiveKit, na forma exata documentada em
  https://docs.livekit.io/home/server/generating-tokens/ — claims `iss`/`sub`/
  `exp`/`nbf` mais um grant `video` com `room`/`roomJoin`/`canPublish`/
  `canSubscribe`/`canPublishData`. Assinado com `joken` (`Joken.Signer.create/2`
  + `Joken.generate_and_sign/3`, API confirmada via hexdocs).

  Decisão de não usar o pacote hex `livekit`: é mantido por terceiro (não a
  LiveKit), cobre só ~60-70% da API e não tem release recente — para só gerar
  um token, a forma do claim (confirmada na doc oficial) é simples o bastante
  pra não valer o risco dessa dependência. Ver docs/media.md.

  Não chama a Room Service API (`CreateRoom` etc.): uma sala do LiveKit é
  criada automaticamente no primeiro join autenticado com token válido
  (`roomJoin: true`), então gerar o token já basta para este escopo.
  """

  @ttl_seconds 3600

  @doc """
  Token para `identity` entrar na sala `room`. `can_publish?` diferencia um
  token de streamer (`golive:start`, FASE 9) de um de apenas assistir
  (join simples). Retorna `{:ok, token}` ou `{:error, reason}`.
  """
  def generate(room, identity, can_publish?) do
    config = Application.fetch_env!(:tora_dos_burro, __MODULE__)
    now = System.system_time(:second)

    claims = %{
      "iss" => Keyword.fetch!(config, :api_key),
      "sub" => identity,
      "nbf" => now,
      "exp" => now + @ttl_seconds,
      "video" => %{
        "room" => room,
        "roomJoin" => true,
        "canPublish" => can_publish?,
        "canSubscribe" => true,
        "canPublishData" => can_publish?
      }
    }

    signer = Joken.Signer.create("HS256", Keyword.fetch!(config, :api_secret))

    case Joken.generate_and_sign(%{}, claims, signer) do
      {:ok, token, _claims} -> {:ok, token}
      {:error, reason} -> {:error, reason}
    end
  end

  @doc "URL do servidor LiveKit que o cliente deve usar para conectar (ex.: `ws://localhost:7880`)."
  def server_url do
    :tora_dos_burro
    |> Application.fetch_env!(__MODULE__)
    |> Keyword.fetch!(:url)
  end
end
