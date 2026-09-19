defmodule ToraDosBurroWeb.MessageController do
  use ToraDosBurroWeb, :controller

  alias ToraDosBurro.{Channels, Chat}

  action_fallback ToraDosBurroWeb.FallbackController

  @doc "Histórico paginado: ?before=<message_id>&limit=<n> (padrão 50, máx 100)."
  def index(conn, %{"channel_id" => channel_id} = params) do
    user = current_user(conn)

    with {:ok, channel} <- Channels.fetch_channel(channel_id),
         :ok <- Channels.authorize(channel, user, :view_channels) do
      opts = [before: params["before"], limit: parse_limit(params["limit"])]
      render(conn, :index, messages: Chat.list_messages(channel, opts))
    end
  end

  defp parse_limit(nil), do: 50

  defp parse_limit(value) do
    case Integer.parse(value) do
      {n, _} when n > 0 -> n
      _ -> 50
    end
  end

  defp current_user(conn), do: Guardian.Plug.current_resource(conn)
end
