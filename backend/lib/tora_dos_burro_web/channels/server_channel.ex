defmodule ToraDosBurroWeb.ServerChannel do
  @moduledoc """
  Tópico `server:{server_id}` — presença de "quem está online no app",
  não confundir com `voice:{id}` (que é quem está numa chamada específica).
  Todo cliente entra aqui assim que seleciona um servidor (única coisa que
  esse canal faz — sem eventos client->server, só join + Presence), e sai
  ao trocar de servidor ou deslogar.
  """

  use ToraDosBurroWeb, :channel

  alias ToraDosBurro.Servers
  alias ToraDosBurroWeb.Presence

  @impl true
  def join("server:" <> server_id, _params, socket) do
    user = socket.assigns.current_user

    with {:ok, server} <- Servers.fetch_server(server_id),
         {:ok, _member} <- Servers.fetch_member(server, user) do
      send(self(), :after_join)
      {:ok, socket}
    else
      _ -> {:error, %{reason: "forbidden"}}
    end
  end

  @impl true
  def handle_info(:after_join, socket) do
    user_id = socket.assigns.current_user.id

    {:ok, _} = Presence.track(socket, user_id, %{online_at: System.system_time(:second)})

    push(socket, "presence_state", Presence.list(socket))
    {:noreply, socket}
  end
end
