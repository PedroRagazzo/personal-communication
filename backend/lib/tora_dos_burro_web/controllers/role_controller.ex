defmodule ToraDosBurroWeb.RoleController do
  use ToraDosBurroWeb, :controller

  alias ToraDosBurro.Servers

  action_fallback ToraDosBurroWeb.FallbackController

  def index(conn, %{"server_id" => server_id}) do
    user = current_user(conn)

    with {:ok, server} <- Servers.fetch_server(server_id),
         :ok <- Servers.authorize(server, user, :view_channels) do
      render(conn, :index, roles: Servers.list_roles(server))
    end
  end

  def create(conn, %{"server_id" => server_id, "role" => role_params}) do
    user = current_user(conn)

    with {:ok, server} <- Servers.fetch_server(server_id),
         :ok <- Servers.authorize(server, user, :manage_roles),
         {:ok, role} <- Servers.create_role(server, role_params) do
      conn
      |> put_status(:created)
      |> render(:show, role: role)
    end
  end

  def update(conn, %{"server_id" => server_id, "id" => id} = params) do
    user = current_user(conn)

    with {:ok, server} <- Servers.fetch_server(server_id),
         :ok <- Servers.authorize(server, user, :manage_roles),
         {:ok, role} <- Servers.fetch_role(server, id),
         {:ok, updated} <- Servers.update_role(role, params) do
      render(conn, :show, role: updated)
    end
  end

  def delete(conn, %{"server_id" => server_id, "id" => id}) do
    user = current_user(conn)

    with {:ok, server} <- Servers.fetch_server(server_id),
         :ok <- Servers.authorize(server, user, :manage_roles),
         {:ok, role} <- Servers.fetch_role(server, id),
         {:ok, _} <- Servers.delete_role(role) do
      send_resp(conn, :no_content, "")
    end
  end

  defp current_user(conn), do: Guardian.Plug.current_resource(conn)
end
