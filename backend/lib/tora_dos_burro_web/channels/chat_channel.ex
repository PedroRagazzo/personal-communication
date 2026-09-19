defmodule ToraDosBurroWeb.ChatChannel do
  @moduledoc """
  Tópico `channel:{channel_id}` — chat de texto em tempo real. Ver
  docs/realtime.md para o fluxo completo e a nomenclatura dos eventos.
  """

  use ToraDosBurroWeb, :channel

  alias ToraDosBurro.{Channels, Chat, Servers}

  @impl true
  def join("channel:" <> channel_id, _params, socket) do
    user = socket.assigns.current_user

    with {:ok, channel} <- Channels.fetch_channel(channel_id),
         {:ok, server} <- Servers.fetch_server(channel.server_id),
         :ok <- Servers.authorize(server, user, :view_channels) do
      {:ok, assign(socket, channel: channel, server: server)}
    else
      _ -> {:error, %{reason: "forbidden"}}
    end
  end

  @impl true
  def handle_in("message:create", params, socket) do
    attrs = Map.take(params, ["content", "reply_to_id"])

    case Chat.create_message(socket.assigns.channel, socket.assigns.current_user, attrs) do
      {:ok, message} ->
        payload = ToraDosBurroWeb.MessageJSON.data(message)
        broadcast!(socket, "message:create", payload)
        {:reply, {:ok, payload}, socket}

      {:error, changeset} ->
        {:reply, {:error, ToraDosBurroWeb.ChangesetJSON.error(%{changeset: changeset})}, socket}
    end
  end

  def handle_in("message:update", %{"id" => id, "content" => content}, socket) do
    with {:ok, message} <- Chat.fetch_message(socket.assigns.channel, id),
         :ok <- authorize_message_edit(socket, message),
         {:ok, updated} <- Chat.update_message(message, %{"content" => content}) do
      payload = ToraDosBurroWeb.MessageJSON.data(updated)
      broadcast!(socket, "message:update", payload)
      {:reply, {:ok, payload}, socket}
    else
      {:error, %Ecto.Changeset{} = changeset} ->
        {:reply, {:error, ToraDosBurroWeb.ChangesetJSON.error(%{changeset: changeset})}, socket}

      {:error, reason} ->
        {:reply, {:error, %{reason: to_string(reason)}}, socket}
    end
  end

  def handle_in("message:delete", %{"id" => id}, socket) do
    with {:ok, message} <- Chat.fetch_message(socket.assigns.channel, id),
         :ok <- authorize_message_edit(socket, message),
         {:ok, _} <- Chat.delete_message(message) do
      broadcast!(socket, "message:delete", %{id: id})
      {:reply, :ok, socket}
    else
      {:error, reason} -> {:reply, {:error, %{reason: to_string(reason)}}, socket}
    end
  end

  def handle_in("message:reaction", %{"message_id" => id, "emoji" => emoji}, socket) do
    user = socket.assigns.current_user

    with {:ok, message} <- Chat.fetch_message(socket.assigns.channel, id),
         {:ok, _reaction} <- Chat.add_reaction(message, user, emoji) do
      payload = %{message_id: id, emoji: emoji, user_id: user.id}
      broadcast!(socket, "message:reaction", payload)
      {:reply, :ok, socket}
    else
      {:error, reason} -> {:reply, {:error, %{reason: inspect(reason)}}, socket}
    end
  end

  def handle_in("typing:start", _params, socket) do
    broadcast_from!(socket, "typing:start", %{user_id: socket.assigns.current_user.id})
    {:noreply, socket}
  end

  def handle_in("typing:stop", _params, socket) do
    broadcast_from!(socket, "typing:stop", %{user_id: socket.assigns.current_user.id})
    {:noreply, socket}
  end

  defp authorize_message_edit(socket, message) do
    user = socket.assigns.current_user

    if message.author_id == user.id do
      :ok
    else
      Servers.authorize(socket.assigns.server, user, :manage_messages)
    end
  end
end
