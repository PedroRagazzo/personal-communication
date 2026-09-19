defmodule ToraDosBurroWeb.ChannelController do
  use ToraDosBurroWeb, :controller

  alias ToraDosBurro.{Channels, Servers}

  action_fallback ToraDosBurroWeb.FallbackController

  def index(conn, %{"server_id" => server_id}) do
    user = current_user(conn)

    with {:ok, server} <- Servers.fetch_server(server_id),
         :ok <- Servers.authorize(server, user, :view_channels) do
      render(conn, :index, channels: Channels.list_channels(server))
    end
  end

  def create(conn, %{"server_id" => server_id, "channel" => channel_params}) do
    user = current_user(conn)

    with {:ok, server} <- Servers.fetch_server(server_id),
         :ok <- Servers.authorize(server, user, :manage_channels),
         {:ok, channel} <- Channels.create_channel(server, channel_params) do
      conn
      |> put_status(:created)
      |> render(:show, channel: channel)
    end
  end

  def update(conn, %{"server_id" => server_id, "id" => id} = params) do
    user = current_user(conn)

    with {:ok, server} <- Servers.fetch_server(server_id),
         :ok <- Servers.authorize(server, user, :manage_channels),
         {:ok, channel} <- Channels.fetch_channel(server, id),
         {:ok, updated} <- Channels.update_channel(channel, params) do
      render(conn, :show, channel: updated)
    end
  end

  def delete(conn, %{"server_id" => server_id, "id" => id}) do
    user = current_user(conn)

    with {:ok, server} <- Servers.fetch_server(server_id),
         :ok <- Servers.authorize(server, user, :manage_channels),
         {:ok, channel} <- Channels.fetch_channel(server, id),
         {:ok, _} <- Channels.delete_channel(channel) do
      send_resp(conn, :no_content, "")
    end
  end

  defp current_user(conn), do: Guardian.Plug.current_resource(conn)
end
