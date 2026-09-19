defmodule ToraDosBurro.GoLive do
  @moduledoc """
  Contexto de Go Live (FASE 9): emite tokens de acesso ao LiveKit. Nenhuma
  lógica de permissão nova — reaproveita `Channels.authorize/3` (mesma
  checagem no servidor, revalidada a cada ação, nunca a partir de claim do
  cliente). Quem está ao vivo/assistindo é estado efêmero em
  `ToraDosBurroWeb.Presence` (ver `ToraDosBurroWeb.GoLiveChannel`), igual à
  voz — nunca persistido em tabela.
  """

  alias ToraDosBurro.Accounts.User
  alias ToraDosBurro.Channels
  alias ToraDosBurro.Channels.Channel
  alias ToraDosBurro.GoLive.LiveKitToken

  @doc "Autoriza `:stream` e gera um token de publisher para `user` ir ao vivo em `channel`."
  def start_stream(%Channel{} = channel, %User{} = user) do
    with :ok <- Channels.authorize(channel, user, :stream) do
      LiveKitToken.generate(room_name(channel), user.id, true)
    end
  end

  @doc "Autoriza `:connect` e gera um token de apenas assistir à transmissão de `channel`."
  def watch_stream(%Channel{} = channel, %User{} = user) do
    with :ok <- Channels.authorize(channel, user, :connect) do
      LiveKitToken.generate(room_name(channel), user.id, false)
    end
  end

  defp room_name(%Channel{id: id}), do: "golive-#{id}"
end
