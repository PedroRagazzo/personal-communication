defmodule ToraDosBurroWeb.ServerChannelTest do
  use ToraDosBurroWeb.ChannelCase, async: true

  alias ToraDosBurro.{Accounts, Guardian, Servers}

  setup do
    {:ok, owner} = register("serverowner")
    {:ok, other} = register("serverother")
    {:ok, stranger} = register("serverstranger")

    {:ok, server} = Servers.create_server(owner, %{"name" => "Servidor"})
    {:ok, _member} = Servers.join_server(server, other)

    %{owner: owner, other: other, stranger: stranger, server: server}
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

  test "membro entra e recebe presence_state; quem entra depois ve quem ja estava", %{
    owner: owner,
    other: other,
    server: server
  } do
    owner_id = owner.id
    other_id = other.id

    owner_socket = connect_as(owner)
    {:ok, _, _owner_channel} = subscribe_and_join(owner_socket, "server:#{server.id}", %{})
    assert_push "presence_state", %{^owner_id => _}

    other_socket = connect_as(other)
    {:ok, _, _other_channel} = subscribe_and_join(other_socket, "server:#{server.id}", %{})
    assert_push "presence_state", %{^owner_id => _, ^other_id => _}
  end

  test "quem não é membro do servidor não consegue entrar", %{stranger: stranger, server: server} do
    stranger_socket = connect_as(stranger)

    assert {:error, %{reason: "forbidden"}} =
             subscribe_and_join(stranger_socket, "server:#{server.id}", %{})
  end

  test "servidor inexistente também é forbidden (não vaza not_found)", %{owner: owner} do
    owner_socket = connect_as(owner)
    fake_id = Ecto.UUID.generate()

    assert {:error, %{reason: "forbidden"}} =
             subscribe_and_join(owner_socket, "server:#{fake_id}", %{})
  end

  test "sair remove da presença do servidor", %{owner: owner, other: other, server: server} do
    Process.flag(:trap_exit, true)
    owner_id = owner.id

    owner_socket = connect_as(owner)
    {:ok, _, owner_channel} = subscribe_and_join(owner_socket, "server:#{server.id}", %{})

    other_socket = connect_as(other)
    {:ok, _, _other_channel} = subscribe_and_join(other_socket, "server:#{server.id}", %{})

    close(owner_channel)

    assert_broadcast "presence_diff", %{leaves: %{^owner_id => _}}
  end

  describe "member:joined (v1.6.0)" do
    test "quem já está no servidor recebe o membro novo ao vivo, via convite", %{
      owner: owner,
      server: server
    } do
      owner_socket = connect_as(owner)
      {:ok, _, _owner_channel} = subscribe_and_join(owner_socket, "server:#{server.id}", %{})

      {:ok, newcomer} = register("servernewcomer")
      newcomer_id = newcomer.id
      {:ok, invite} = Servers.create_invite(server, owner, %{})

      assert {:ok, _server} = Servers.use_invite(invite, newcomer)

      assert_broadcast "member:joined", %{
        member: %{user: %{id: ^newcomer_id, username: "servernewcomer"}}
      }
    end

    test "convite que dá rollback de verdade (usuário banido) não avisa ninguém", %{
      owner: owner,
      server: server
    } do
      owner_socket = connect_as(owner)
      {:ok, _, _owner_channel} = subscribe_and_join(owner_socket, "server:#{server.id}", %{})

      {:ok, banned_user} = register("serverbannedinvite")
      {:ok, _ban} = Servers.create_ban(server, owner, banned_user)
      {:ok, invite} = Servers.create_invite(server, owner, %{})

      # join_server/2 falha dentro da transação (usuário banido) — força
      # um rollback de verdade, diferente do cond-check de max_uses/expirado
      # no topo de use_invite/2, que nem chega a abrir transação. Confirma
      # que notify_member_joined/3 só dispara DEPOIS de um commit real, não
      # de dentro da transação em si (ver o comentário na implementação).
      assert {:error, :banned} = Servers.use_invite(invite, banned_user)
      refute_broadcast "member:joined", %{}
    end
  end
end
