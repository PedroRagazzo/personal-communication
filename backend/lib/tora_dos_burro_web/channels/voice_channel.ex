defmodule ToraDosBurroWeb.VoiceChannel do
  @moduledoc """
  Tópico `voice:{channel_id}` — só sinalização (SDP/ICE) e presença
  (mute/deafen). O transporte de áudio em si é WebRTC direto entre os
  clientes (mesh); o Phoenix nunca vê um byte de mídia. Ver docs/media.md.

  `sdp:offer`/`sdp:answer`/`ice:candidate` carregam um campo `to` (user_id
  do destinatário) e são retransmitidos para todo o tópico via
  `broadcast_from!` — cada cliente ignora mensagens cujo `to` não é o
  próprio id. Mesh pequeno (até ~8 participantes só-áudio, por isso), então
  esse fan-out é aceitável; um SFU (fora do escopo desta fase) resolveria
  isso de outro jeito.
  """

  use ToraDosBurroWeb, :channel

  alias ToraDosBurro.Channels
  alias ToraDosBurroWeb.Presence

  @impl true
  def join("voice:" <> channel_id, _params, socket) do
    user = socket.assigns.current_user

    with {:ok, channel} <- Channels.fetch_channel(channel_id),
         :ok <- ensure_voice_channel(channel),
         :ok <- Channels.authorize(channel, user, :connect) do
      send(self(), :after_join)
      {:ok, assign(socket, channel: channel)}
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
        muted: false,
        deafened: false,
        joined_at: System.system_time(:second)
      })

    push(socket, "presence_state", Presence.list(socket))
    {:noreply, socket}
  end

  @impl true
  def handle_in("sdp:offer", %{"to" => to_id, "sdp" => sdp}, socket) do
    relay(socket, "sdp:offer", %{to: to_id, sdp: sdp})
    {:noreply, socket}
  end

  def handle_in("sdp:answer", %{"to" => to_id, "sdp" => sdp}, socket) do
    relay(socket, "sdp:answer", %{to: to_id, sdp: sdp})
    {:noreply, socket}
  end

  def handle_in("ice:candidate", %{"to" => to_id, "candidate" => candidate}, socket) do
    relay(socket, "ice:candidate", %{to: to_id, candidate: candidate})
    {:noreply, socket}
  end

  def handle_in("state:update", params, socket) do
    user_id = socket.assigns.current_user.id
    muted = Map.get(params, "muted", false)
    deafened = Map.get(params, "deafened", false)

    {:ok, _} =
      Presence.update(socket, user_id, fn meta ->
        Map.merge(meta, %{muted: muted, deafened: deafened})
      end)

    {:noreply, socket}
  end

  defp relay(socket, event, payload) do
    broadcast_from!(socket, event, Map.put(payload, :from, socket.assigns.current_user.id))
  end
end
