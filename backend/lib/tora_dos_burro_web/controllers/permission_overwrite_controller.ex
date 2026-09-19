defmodule ToraDosBurroWeb.PermissionOverwriteController do
  use ToraDosBurroWeb, :controller

  alias ToraDosBurro.Channels

  action_fallback ToraDosBurroWeb.FallbackController

  def index(conn, %{"channel_id" => channel_id}) do
    user = current_user(conn)

    with {:ok, channel} <- Channels.fetch_channel(channel_id),
         :ok <- Channels.authorize(channel, user, :manage_roles) do
      render(conn, :index, overwrites: Channels.list_overwrites(channel))
    end
  end

  @doc """
  Cria ou substitui o overwrite (upsert). Body: `target_type` (`role` ou
  `member`), `target_id`, `allow`, `deny` (bitfields, ver
  ToraDosBurro.Servers.Permissions).
  """
  def put(conn, %{"channel_id" => channel_id} = params) do
    user = current_user(conn)

    with {:ok, channel} <- Channels.fetch_channel(channel_id),
         :ok <- Channels.authorize(channel, user, :manage_roles),
         {:ok, overwrite} <-
           Channels.put_overwrite(channel, Map.take(params, ~w(target_type target_id allow deny))) do
      render(conn, :show, overwrite: overwrite)
    end
  end

  def delete(conn, %{"channel_id" => channel_id, "target_type" => type, "target_id" => target_id}) do
    user = current_user(conn)

    with {:ok, channel} <- Channels.fetch_channel(channel_id),
         :ok <- Channels.authorize(channel, user, :manage_roles),
         {:ok, _} <- Channels.delete_overwrite(channel, type, target_id) do
      send_resp(conn, :no_content, "")
    end
  end

  defp current_user(conn), do: Guardian.Plug.current_resource(conn)
end
