defmodule ToraDosBurroWeb.ServerJSON do
  alias ToraDosBurro.Servers.Server

  def index(%{servers: servers}), do: %{servers: Enum.map(servers, &data/1)}
  def show(%{server: server}), do: %{server: data(server)}

  def data(%Server{} = server) do
    %{id: server.id, name: server.name, icon_url: server.icon_url, owner_id: server.owner_id}
  end
end
