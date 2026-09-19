defmodule ToraDosBurroWeb.UserSocket do
  @moduledoc """
  Entrada do WebSocket. Autentica via token Guardian passado como connect
  param (`?token=...`) — não como header, que o navegador não permite
  customizar no handshake de WS. Ver docs/security.md.
  """

  use Phoenix.Socket

  channel "channel:*", ToraDosBurroWeb.ChatChannel

  @impl true
  def connect(%{"token" => token}, socket, _connect_info) do
    with {:ok, claims} <- ToraDosBurro.Guardian.decode_and_verify(token),
         {:ok, user} <- ToraDosBurro.Guardian.resource_from_claims(claims) do
      {:ok, assign(socket, :current_user, user)}
    else
      _ -> :error
    end
  end

  def connect(_params, _socket, _connect_info), do: :error

  @impl true
  def id(socket), do: "user_socket:#{socket.assigns.current_user.id}"
end
