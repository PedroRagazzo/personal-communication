defmodule ToraDosBurroWeb.CategoryController do
  use ToraDosBurroWeb, :controller

  alias ToraDosBurro.{Channels, Servers}

  action_fallback ToraDosBurroWeb.FallbackController

  def index(conn, %{"server_id" => server_id}) do
    user = current_user(conn)

    with {:ok, server} <- Servers.fetch_server(server_id),
         :ok <- Servers.authorize(server, user, :view_channels) do
      render(conn, :index, categories: Channels.list_categories(server))
    end
  end

  def create(conn, %{"server_id" => server_id, "category" => category_params}) do
    user = current_user(conn)

    with {:ok, server} <- Servers.fetch_server(server_id),
         :ok <- Servers.authorize(server, user, :manage_channels),
         {:ok, category} <- Channels.create_category(server, category_params) do
      conn
      |> put_status(:created)
      |> render(:show, category: category)
    end
  end

  def update(conn, %{"server_id" => server_id, "id" => id} = params) do
    user = current_user(conn)

    with {:ok, server} <- Servers.fetch_server(server_id),
         :ok <- Servers.authorize(server, user, :manage_channels),
         {:ok, category} <- Channels.fetch_category(server, id),
         {:ok, updated} <- Channels.update_category(category, params) do
      render(conn, :show, category: updated)
    end
  end

  def delete(conn, %{"server_id" => server_id, "id" => id}) do
    user = current_user(conn)

    with {:ok, server} <- Servers.fetch_server(server_id),
         :ok <- Servers.authorize(server, user, :manage_channels),
         {:ok, category} <- Channels.fetch_category(server, id),
         {:ok, _} <- Channels.delete_category(category) do
      send_resp(conn, :no_content, "")
    end
  end

  defp current_user(conn), do: Guardian.Plug.current_resource(conn)
end
