defmodule ToraDosBurroWeb.GoLiveChannelTest do
  use ToraDosBurroWeb.ChannelCase, async: true

  alias ToraDosBurro.{Accounts, Channels, Guardian, Servers}
  alias ToraDosBurro.Servers.Permissions

  setup do
    {:ok, owner} = register("live_owner")
    {:ok, other} = register("live_other")

    {:ok, server} = Servers.create_server(owner, %{"name" => "Servidor"})
    {:ok, _member} = Servers.join_server(server, other)

    {:ok, voice_channel} =
      Channels.create_channel(server, %{"name" => "Sala 1", "type" => "guild_voice"})

    {:ok, text_channel} = Channels.create_channel(server, %{"name" => "geral"})

    %{
      owner: owner,
      other: other,
      server: server,
      voice_channel: voice_channel,
      text_channel: text_channel
    }
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

  test "join devolve token subscriber-only (canPublish: false)", %{
    owner: owner,
    voice_channel: channel
  } do
    socket = connect_as(owner)

    assert {:ok, %{token: token}, _live} = subscribe_and_join(socket, "live:#{channel.id}", %{})
    assert {:ok, claims} = Joken.peek_claims(token)
    assert claims["video"]["canPublish"] == false
  end

  test "canal de texto não aceita join em live:", %{owner: owner, text_channel: channel} do
    socket = connect_as(owner)

    assert {:error, %{reason: "forbidden"}} =
             subscribe_and_join(socket, "live:#{channel.id}", %{})
  end

  test "quem entra depois vê no presence_state quem já estava", %{
    owner: owner,
    other: other,
    voice_channel: channel
  } do
    owner_id = owner.id

    owner_socket = connect_as(owner)
    {:ok, _, _owner_live} = subscribe_and_join(owner_socket, "live:#{channel.id}", %{})

    other_socket = connect_as(other)
    {:ok, _, _other_live} = subscribe_and_join(other_socket, "live:#{channel.id}", %{})

    assert_push "presence_state", %{^owner_id => _}
  end

  test "golive:start devolve token publisher e atualiza presence para live: true", %{
    owner: owner,
    other: other,
    voice_channel: channel
  } do
    owner_id = owner.id

    owner_socket = connect_as(owner)
    {:ok, _, owner_live} = subscribe_and_join(owner_socket, "live:#{channel.id}", %{})

    other_socket = connect_as(other)
    {:ok, _, _other_live} = subscribe_and_join(other_socket, "live:#{channel.id}", %{})

    ref = push(owner_live, "golive:start", %{})
    assert_reply ref, :ok, %{token: token}
    assert {:ok, claims} = Joken.peek_claims(token)
    assert claims["video"]["canPublish"] == true

    assert_broadcast "presence_diff", %{joins: %{^owner_id => %{metas: [%{live: true}]}}}
  end

  test "golive:stop volta live para false", %{owner: owner, voice_channel: channel} do
    owner_id = owner.id
    owner_socket = connect_as(owner)
    {:ok, _, owner_live} = subscribe_and_join(owner_socket, "live:#{channel.id}", %{})

    ref = push(owner_live, "golive:start", %{})
    assert_reply ref, :ok, %{}

    ref2 = push(owner_live, "golive:stop", %{})
    assert_reply ref2, :ok

    assert_broadcast "presence_diff", %{joins: %{^owner_id => %{metas: [%{live: false}]}}}
  end

  test "múltiplos streamers na mesma sala ao mesmo tempo é permitido (sem limite de 1, diferente da FASE 8)",
       %{owner: owner, other: other, voice_channel: channel} do
    owner_socket = connect_as(owner)
    {:ok, _, owner_live} = subscribe_and_join(owner_socket, "live:#{channel.id}", %{})

    other_socket = connect_as(other)
    {:ok, _, other_live} = subscribe_and_join(other_socket, "live:#{channel.id}", %{})

    ref = push(owner_live, "golive:start", %{})
    assert_reply ref, :ok, %{}

    ref2 = push(other_live, "golive:start", %{})
    assert_reply ref2, :ok, %{}
  end

  test "golive:start nega quando o membro não tem :stream", %{
    server: server,
    other: other,
    voice_channel: channel
  } do
    default_role = Servers.default_role(server)

    assert {:ok, _} =
             Channels.put_overwrite(channel, %{
               "target_type" => "role",
               "target_id" => default_role.id,
               "deny" => Permissions.combine([:stream])
             })

    other_socket = connect_as(other)
    {:ok, _, other_live} = subscribe_and_join(other_socket, "live:#{channel.id}", %{})

    ref = push(other_live, "golive:start", %{})
    assert_reply ref, :error, %{reason: "forbidden"}
  end
end
