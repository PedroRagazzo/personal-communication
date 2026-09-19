defmodule ToraDosBurroWeb.BanController do
  use ToraDosBurroWeb, :controller

  alias ToraDosBurro.{Accounts, Servers}

  action_fallback ToraDosBurroWeb.FallbackController

  def create(conn, %{"server_id" => server_id, "user_id" => user_id} = params) do
    actor = current_user(conn)
    ban_params = Map.take(params, ["reason"])

    with {:ok, server} <- Servers.fetch_server(server_id),
         :ok <- Servers.authorize(server, actor, :ban_members),
         {:ok, target} <- Accounts.fetch_user(user_id),
         {:ok, ban} <- Servers.create_ban(server, actor, target, ban_params) do
      conn
      |> put_status(:created)
      |> render(:show, ban: ban)
    end
  end

  def delete(conn, %{"server_id" => server_id, "user_id" => user_id}) do
    actor = current_user(conn)

    with {:ok, server} <- Servers.fetch_server(server_id),
         :ok <- Servers.authorize(server, actor, :ban_members),
         {:ok, target} <- Accounts.fetch_user(user_id),
         {:ok, _} <- Servers.remove_ban(server, target) do
      send_resp(conn, :no_content, "")
    end
  end

  defp current_user(conn), do: Guardian.Plug.current_resource(conn)
end
