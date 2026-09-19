defmodule ToraDosBurroWeb.ServerJSON do
  alias ToraDosBurro.Servers.Server

  def show(%{server: server}), do: %{server: data(server)}

  def data(%Server{} = server) do
    %{id: server.id, name: server.name, icon_url: server.icon_url, owner_id: server.owner_id}
  end
end
