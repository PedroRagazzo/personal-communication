defmodule ToraDosBurroWeb.VoiceChannel do
  @moduledoc """
  Tópico `voice:{channel_id}` — só sinalização (SDP/ICE) e presença
  (mute/deafen/vídeo). O transporte de áudio/vídeo em si é WebRTC direto
  entre os clientes (mesh); o Phoenix nunca vê um byte de mídia. Ver
  docs/media.md.

  `sdp:offer`/`sdp:answer`/`ice:candidate` carregam um campo `to` (user_id
  do destinatário) e são retransmitidos para todo o tópico via
  `broadcast_from!` — cada cliente ignora mensagens cujo `to` não é o
  próprio id. Mesh pequeno (até ~8 participantes só-áudio, por isso), então
  esse fan-out é aceitável; um SFU (fora do escopo desta fase) resolveria
  isso de outro jeito.

  Vídeo (FASE 7) reaproveita esse mesmo canal — ligar câmera é só mais uma
  track na mesma peer connection. `video:enable` é limitado a um número
  máximo de participantes com vídeo por sala (`@max_video_participants`),
  checado no servidor no momento de habilitar (não só no join), nunca
  decidido só no cliente. O relay de SDP/ICE já existente cobre a
  renegociação da nova track.

  Compartilhamento de tela (FASE 8) também reaproveita esse canal — nunca
  passa pelo WebSocket, só a `ScreenTrack` em si via WebRTC.
  `screen_share:start`/`stop` são só metadata (`screen_sharing` no
  Presence) e sempre têm sucesso — **sem limite de compartilhamentos
  simultâneos por sala**, decisão deliberada (servidor único, ~20 pessoas,
  não público — ver `docs/roadmap.md`) mesmo sabendo que cada
  compartilhamento simultâneo é mais uma track de vídeo que todo mundo na
  chamada precisa decodificar (mesh, não SFU); diferente do vídeo, que
  mantém `@max_video_participants` por esse exato motivo.
  """

  use ToraDosBurroWeb, :channel

  alias ToraDosBurro.Channels
  alias ToraDosBurroWeb.Presence

  @max_video_participants 4

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
        video: false,
        screen_sharing: false,
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

  def handle_in("video:enable", _params, socket) do
    user_id = socket.assigns.current_user.id

    if video_count(socket) >= @max_video_participants and not has_video?(socket, user_id) do
      {:reply, {:error, %{reason: "video_limit_reached"}}, socket}
    else
      {:ok, _} = Presence.update(socket, user_id, &Map.put(&1, :video, true))
      {:reply, :ok, socket}
    end
  end

  def handle_in("video:disable", _params, socket) do
    user_id = socket.assigns.current_user.id
    {:ok, _} = Presence.update(socket, user_id, &Map.put(&1, :video, false))
    {:reply, :ok, socket}
  end

  def handle_in("screen_share:start", _params, socket) do
    user_id = socket.assigns.current_user.id
    {:ok, _} = Presence.update(socket, user_id, &Map.put(&1, :screen_sharing, true))
    {:reply, :ok, socket}
  end

  def handle_in("screen_share:stop", _params, socket) do
    user_id = socket.assigns.current_user.id
    {:ok, _} = Presence.update(socket, user_id, &Map.put(&1, :screen_sharing, false))
    {:reply, :ok, socket}
  end

  defp relay(socket, event, payload) do
    broadcast_from!(socket, event, Map.put(payload, :from, socket.assigns.current_user.id))
  end

  defp video_count(socket) do
    socket
    |> Presence.list()
    |> Enum.count(fn {_user_id, %{metas: [meta | _]}} -> meta[:video] == true end)
  end

  defp has_video?(socket, user_id) do
    case Presence.list(socket)[user_id] do
      %{metas: [%{video: true} | _]} -> true
      _ -> false
    end
  end
end
