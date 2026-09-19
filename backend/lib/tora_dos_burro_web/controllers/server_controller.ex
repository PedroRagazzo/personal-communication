defmodule ToraDosBurroWeb.ServerController do
  use ToraDosBurroWeb, :controller

  alias ToraDosBurro.Servers

  action_fallback ToraDosBurroWeb.FallbackController

  def index(conn, _params) do
    servers = Servers.list_servers_for_user(current_user(conn))
    render(conn, :index, servers: servers)
  end

  def create(conn, %{"server" => server_params}) do
    with {:ok, server} <- Servers.create_server(current_user(conn), server_params) do
      conn
      |> put_status(:created)
      |> render(:show, server: server)
    end
  end

  def show(conn, %{"id" => id}) do
    user = current_user(conn)

    with {:ok, server} <- Servers.fetch_server(id),
         :ok <- Servers.authorize(server, user, :view_channels) do
      render(conn, :show, server: server)
    end
  end

  def update(conn, %{"id" => id} = params) do
    user = current_user(conn)

    with {:ok, server} <- Servers.fetch_server(id),
         :ok <- Servers.authorize(server, user, :manage_server),
         {:ok, updated} <- Servers.update_server(server, params) do
      render(conn, :show, server: updated)
    end
  end

  def delete(conn, %{"id" => id}) do
    user = current_user(conn)

    with {:ok, server} <- Servers.fetch_server(id),
         :ok <- owner_only(server, user),
         {:ok, _} <- Servers.delete_server(server) do
      send_resp(conn, :no_content, "")
    end
  end

  def leave(conn, %{"server_id" => id}) do
    with {:ok, server} <- Servers.fetch_server(id),
         {:ok, _} <- Servers.leave_server(server, current_user(conn)) do
      send_resp(conn, :no_content, "")
    end
  end

  defp owner_only(server, user) do
    if Servers.owner?(server, user), do: :ok, else: {:error, :forbidden}
  end

  defp current_user(conn), do: Guardian.Plug.current_resource(conn)
end
