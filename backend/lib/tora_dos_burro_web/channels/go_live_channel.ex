defmodule ToraDosBurroWeb.GoLiveChannel do
  @moduledoc """
  Tópico `live:{channel_id}` — Go Live (FASE 9). Diferente de `voice:` (FASE
  6-8), aqui o Phoenix não retransmite SDP/ICE nenhum: mídia vai direto
  cliente <-> LiveKit (SFU), fora do WebSocket. O papel deste Channel é só
  autorizar e devolver tokens do LiveKit, e rastrear quem está ao vivo via
  Presence (efêmero, igual à voz — nunca persistido).

  `join` já autoriza `:connect` e devolve um token *subscriber-only* (dá pra
  assistir). `golive:start` eleva para um token *publisher*, checando
  `:stream` nesse momento (não só no join) — mesmo padrão que `video:enable`
  já usa na FASE 7. Sem limite de "1 streamer por sala": esse limite existe
  na FASE 8 por causa do mesh (cada peer decodifica uma track a mais por
  compartilhamento); com SFU, múltiplos publishers na mesma sala é uso normal,
  então não haveria razão técnica real para recriar aquele limite aqui.
  """

  use ToraDosBurroWeb, :channel

  alias ToraDosBurro.{Channels, GoLive}
  alias ToraDosBurro.GoLive.LiveKitToken
  alias ToraDosBurroWeb.Presence

  @impl true
  def join("live:" <> channel_id, _params, socket) do
    user = socket.assigns.current_user

    with {:ok, channel} <- Channels.fetch_channel(channel_id),
         :ok <- ensure_voice_channel(channel),
         {:ok, token} <- GoLive.watch_stream(channel, user) do
      send(self(), :after_join)

      {:ok, %{token: token, url: LiveKitToken.server_url()}, assign(socket, channel: channel)}
    else
      _ -> {:error, %{reason: "forbidden"}}
    end
  end

  defp ensure_voice_channel(%{type: "guild_voice"}), do: :ok
  defp ensure_voice_channel(_), do: {:error, :not_voice_channel}

  @impl true
  def handle_info(:after_join, socket) do
    user_id = socket.assigns.current_user.id

    {:ok, _} =
      Presence.track(socket, user_id, %{
        user_id: user_id,
        live: false,
        started_at: nil
      })

    push(socket, "presence_state", Presence.list(socket))
    {:noreply, socket}
  end

  @impl true
  def handle_in("golive:start", _params, socket) do
    channel = socket.assigns.channel
    user = socket.assigns.current_user

    case GoLive.start_stream(channel, user) do
      {:ok, token} ->
        {:ok, _} =
          Presence.update(socket, user.id, fn meta ->
            Map.merge(meta, %{live: true, started_at: System.system_time(:second)})
          end)

        {:reply, {:ok, %{token: token, url: LiveKitToken.server_url()}}, socket}

      {:error, :forbidden} ->
        {:reply, {:error, %{reason: "forbidden"}}, socket}
    end
  end

  def handle_in("golive:stop", _params, socket) do
    user_id = socket.assigns.current_user.id

    {:ok, _} =
      Presence.update(socket, user_id, fn meta ->
        Map.merge(meta, %{live: false, started_at: nil})
      end)

    {:reply, :ok, socket}
  end
end
