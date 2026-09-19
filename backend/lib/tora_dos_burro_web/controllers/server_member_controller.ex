defmodule ToraDosBurroWeb.ServerMemberController do
  use ToraDosBurroWeb, :controller

  alias ToraDosBurro.{Accounts, Servers}

  action_fallback ToraDosBurroWeb.FallbackController

  def index(conn, %{"server_id" => server_id}) do
    user = current_user(conn)

    with {:ok, server} <- Servers.fetch_server(server_id),
         :ok <- Servers.authorize(server, user, :view_channels) do
      render(conn, :index, members: Servers.list_members(server))
    end
  end

  def delete(conn, %{"server_id" => server_id, "user_id" => user_id}) do
    actor = current_user(conn)

    with {:ok, server} <- Servers.fetch_server(server_id),
         :ok <- Servers.authorize(server, actor, :kick_members),
         {:ok, target} <- Accounts.fetch_user(user_id),
         {:ok, member} <- Servers.fetch_member(server, target),
         {:ok, _} <- Servers.remove_member(member) do
      send_resp(conn, :no_content, "")
    end
  end

  def add_role(conn, %{"server_id" => server_id, "user_id" => user_id, "role_id" => role_id}) do
    with {:ok, member} <- authorize_and_fetch_member(conn, server_id, user_id),
         {:ok, server} <- Servers.fetch_server(server_id),
         {:ok, role} <- Servers.fetch_role(server, role_id),
         {:ok, updated} <- Servers.assign_role(member, role) do
      render(conn, :show, member: updated)
    end
  end

  def remove_role(conn, %{"server_id" => server_id, "user_id" => user_id, "role_id" => role_id}) do
    with {:ok, member} <- authorize_and_fetch_member(conn, server_id, user_id),
         {:ok, server} <- Servers.fetch_server(server_id),
         {:ok, role} <- Servers.fetch_role(server, role_id),
         {:ok, updated} <- Servers.remove_role(member, role) do
      render(conn, :show, member: updated)
    end
  end

  defp authorize_and_fetch_member(conn, server_id, user_id) do
    actor = current_user(conn)

    with {:ok, server} <- Servers.fetch_server(server_id),
         :ok <- Servers.authorize(server, actor, :manage_roles),
         {:ok, target} <- Accounts.fetch_user(user_id) do
      Servers.fetch_member(server, target)
    end
  end

  defp current_user(conn), do: Guardian.Plug.current_resource(conn)
end
