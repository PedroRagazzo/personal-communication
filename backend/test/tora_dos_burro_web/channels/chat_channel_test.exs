defmodule ToraDosBurroWeb.ChatChannelTest do
  use ToraDosBurroWeb.ChannelCase, async: true

  alias ToraDosBurro.{Accounts, Channels, Guardian, Servers}

  setup do
    {:ok, owner} = register("chanowner")
    {:ok, other} = register("chanother")
    {:ok, stranger} = register("chanstranger")

    {:ok, server} = Servers.create_server(owner, %{"name" => "Servidor"})
    {:ok, _member} = Servers.join_server(server, other)
    {:ok, channel} = Channels.create_channel(server, %{"name" => "geral"})

    %{owner: owner, other: other, stranger: stranger, channel: channel}
  end

  defp register(username) do
    Accounts.register_user(%{
      "username" => username,
      "email" => "#{username}@example.com",
      "password" => "senha-super-segura"
    })
  end

  defp connect_as(user) do
    {:ok, token, _claims} = Guardian.encode_and_sign(user, %{}, token_type: "access")
    {:ok, socket} = connect(ToraDosBurroWeb.UserSocket, %{"token" => token})
    socket
  end

  test "membro consegue entrar e trocar mensagem em tempo real", %{
    owner: owner,
    other: other,
    channel: channel
  } do
    owner_socket = connect_as(owner)
    other_socket = connect_as(other)

    {:ok, _reply, owner_channel} = subscribe_and_join(owner_socket, "channel:#{channel.id}", %{})
    {:ok, _reply, _other_channel} = subscribe_and_join(other_socket, "channel:#{channel.id}", %{})

    ref = push(owner_channel, "message:create", %{"content" => "oi pessoal"})
    assert_reply ref, :ok, %{content: "oi pessoal"}
    assert_broadcast "message:create", %{content: "oi pessoal"}
  end

  test "quem não é membro do servidor não consegue entrar no canal", %{
    stranger: stranger,
    channel: channel
  } do
    stranger_socket = connect_as(stranger)

    assert {:error, %{reason: "forbidden"}} =
             subscribe_and_join(stranger_socket, "channel:#{channel.id}", %{})
  end

  test "editar mensagem de outro membro sem permissão falha", %{
    owner: owner,
    other: other,
    channel: channel
  } do
    owner_socket = connect_as(owner)
    other_socket = connect_as(other)

    {:ok, _, owner_channel} = subscribe_and_join(owner_socket, "channel:#{channel.id}", %{})
    {:ok, _, other_channel} = subscribe_and_join(other_socket, "channel:#{channel.id}", %{})

    ref = push(owner_channel, "message:create", %{"content" => "original"})
    assert_reply ref, :ok, %{id: message_id}

    ref2 =
      push(other_channel, "message:update", %{"id" => message_id, "content" => "hackeado"})

    assert_reply ref2, :error, %{reason: "forbidden"}
  end

  test "autor consegue editar e apagar a própria mensagem", %{owner: owner, channel: channel} do
    owner_socket = connect_as(owner)
    {:ok, _, owner_channel} = subscribe_and_join(owner_socket, "channel:#{channel.id}", %{})

    ref = push(owner_channel, "message:create", %{"content" => "original"})
    assert_reply ref, :ok, %{id: message_id}

    ref2 = push(owner_channel, "message:update", %{"id" => message_id, "content" => "editada"})
    assert_reply ref2, :ok, %{content: "editada"}
    assert_broadcast "message:update", %{content: "editada"}

    ref3 = push(owner_channel, "message:delete", %{"id" => message_id})
    assert_reply ref3, :ok
    assert_broadcast "message:delete", %{id: ^message_id}
  end

  test "reação é retransmitida para o canal", %{owner: owner, other: other, channel: channel} do
    owner_socket = connect_as(owner)
    other_socket = connect_as(other)

    {:ok, _, owner_channel} = subscribe_and_join(owner_socket, "channel:#{channel.id}", %{})
    {:ok, _, other_channel} = subscribe_and_join(other_socket, "channel:#{channel.id}", %{})

    ref = push(owner_channel, "message:create", %{"content" => "oi"})
    assert_reply ref, :ok, %{id: message_id}

    ref2 = push(other_channel, "message:reaction", %{"message_id" => message_id, "emoji" => "👍"})
    assert_reply ref2, :ok
    assert_broadcast "message:reaction", %{emoji: "👍"}
  end

  test "digitação é retransmitida só para os outros (broadcast_from)", %{
    owner: owner,
    other: other,
    channel: channel
  } do
    owner_id = owner.id
    owner_socket = connect_as(owner)
    other_socket = connect_as(other)

    {:ok, _, owner_channel} = subscribe_and_join(owner_socket, "channel:#{channel.id}", %{})
    {:ok, _, _other_channel} = subscribe_and_join(other_socket, "channel:#{channel.id}", %{})

    push(owner_channel, "typing:start", %{})

    assert_broadcast "typing:start", %{user_id: ^owner_id}
  end
end
