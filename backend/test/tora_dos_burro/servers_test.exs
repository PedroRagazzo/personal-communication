defmodule ToraDosBurro.ServersTest do
  use ToraDosBurro.DataCase, async: true

  alias ToraDosBurro.{Accounts, Servers}

  defp create_user(suffix) do
    {:ok, user} =
      Accounts.register_user(%{
        "username" => "user#{suffix}",
        "email" => "user#{suffix}@example.com",
        "password" => "senha-super-segura"
      })

    user
  end

  describe "create_server/2" do
    test "cria o servidor, o cargo @everyone e entra o dono como membro" do
      owner = create_user(1)

      assert {:ok, server} = Servers.create_server(owner, %{"name" => "Meu Servidor"})
      assert server.owner_id == owner.id

      assert [role] = Servers.list_roles(server)
      assert role.is_default
      assert role.name == "@everyone"

      assert {:ok, member} = Servers.fetch_member(server, owner)
      assert member.user.id == owner.id
    end
  end

  describe "join_server/2 e leave_server/2" do
    setup do
      owner = create_user(2)
      {:ok, server} = Servers.create_server(owner, %{"name" => "Servidor"})
      %{owner: owner, server: server, other: create_user(3)}
    end

    test "outro usuário consegue entrar", %{server: server, other: other} do
      assert {:ok, _member} = Servers.join_server(server, other)
      assert {:ok, _} = Servers.fetch_member(server, other)
    end

    test "não deixa entrar duas vezes", %{server: server, other: other} do
      assert {:ok, _} = Servers.join_server(server, other)
      assert {:error, :already_member} = Servers.join_server(server, other)
    end

    test "usuário banido não consegue entrar", %{server: server, owner: owner, other: other} do
      assert {:ok, _ban} = Servers.create_ban(server, owner, other)
      assert {:error, :banned} = Servers.join_server(server, other)
    end

    test "dono não consegue sair do próprio servidor", %{server: server, owner: owner} do
      assert {:error, :owner_cannot_leave} = Servers.leave_server(server, owner)
    end

    test "membro comum consegue sair", %{server: server, other: other} do
      assert {:ok, _} = Servers.join_server(server, other)
      assert {:ok, _} = Servers.leave_server(server, other)
      assert {:error, :not_member} = Servers.fetch_member(server, other)
    end
  end

  describe "cargos e permissões" do
    setup do
      owner = create_user(4)
      {:ok, server} = Servers.create_server(owner, %{"name" => "Servidor"})
      member_user = create_user(5)
      {:ok, member} = Servers.join_server(server, member_user)
      %{owner: owner, server: server, member_user: member_user, member: member}
    end

    test "membro comum não tem permissão de administração", %{server: server, member_user: user} do
      assert {:error, :forbidden} = Servers.authorize(server, user, :manage_server)
    end

    test "dono sempre autorizado, mesmo sem cargo extra", %{server: server, owner: owner} do
      assert :ok = Servers.authorize(server, owner, :manage_server)
      assert :ok = Servers.authorize(server, owner, :ban_members)
    end

    test "atribuir um cargo com permissão libera a ação", %{
      server: server,
      member: member,
      member_user: user
    } do
      assert {:ok, role} =
               Servers.create_role(server, %{
                 "name" => "Mod",
                 "permissions" => Servers.Permissions.combine([:kick_members])
               })

      assert {:ok, _updated} = Servers.assign_role(member, role)
      assert :ok = Servers.authorize(server, user, :kick_members)
    end

    test "remover o cargo tira a permissão de novo", %{
      server: server,
      member: member,
      member_user: user
    } do
      assert {:ok, role} =
               Servers.create_role(server, %{
                 "name" => "Mod",
                 "permissions" => Servers.Permissions.combine([:kick_members])
               })

      assert {:ok, updated} = Servers.assign_role(member, role)
      assert :ok = Servers.authorize(server, user, :kick_members)

      assert {:ok, _} = Servers.remove_role(updated, role)
      assert {:error, :forbidden} = Servers.authorize(server, user, :kick_members)
    end
  end

  describe "convites" do
    setup do
      owner = create_user(6)
      {:ok, server} = Servers.create_server(owner, %{"name" => "Servidor"})
      %{owner: owner, server: server, other: create_user(7)}
    end

    test "cria convite e outro usuário resgata", %{server: server, owner: owner, other: other} do
      assert {:ok, invite} = Servers.create_invite(server, owner, %{})
      assert {:ok, joined_server} = Servers.use_invite(invite, other)
      assert joined_server.id == server.id
      assert {:ok, _} = Servers.fetch_member(server, other)
    end

    test "convite expirado não deixa entrar", %{server: server, owner: owner, other: other} do
      past = DateTime.utc_now() |> DateTime.add(-60, :second) |> DateTime.truncate(:second)
      assert {:ok, invite} = Servers.create_invite(server, owner, %{"expires_at" => past})
      assert {:error, :expired} = Servers.use_invite(invite, other)
    end

    test "convite com limite de usos esgotado não deixa entrar", %{
      server: server,
      owner: owner,
      other: other
    } do
      assert {:ok, invite} = Servers.create_invite(server, owner, %{"max_uses" => 1})
      assert {:ok, _} = Servers.use_invite(invite, other)

      third = create_user(8)
      assert {:ok, refreshed} = Servers.fetch_invite_by_code(invite.code)
      assert {:error, :max_uses_reached} = Servers.use_invite(refreshed, third)
    end
  end

  describe "banimento" do
    setup do
      owner = create_user(9)
      {:ok, server} = Servers.create_server(owner, %{"name" => "Servidor"})
      other = create_user(10)
      {:ok, _member} = Servers.join_server(server, other)
      %{owner: owner, server: server, other: other}
    end

    test "banir remove o membro e impede reentrada", %{
      server: server,
      owner: owner,
      other: other
    } do
      assert {:ok, _ban} = Servers.create_ban(server, owner, other)
      assert {:error, :not_member} = Servers.fetch_member(server, other)
      assert {:error, :banned} = Servers.join_server(server, other)
    end

    test "remover o banimento permite reentrar", %{server: server, owner: owner, other: other} do
      assert {:ok, _ban} = Servers.create_ban(server, owner, other)
      assert {:ok, _} = Servers.remove_ban(server, other)
      assert {:ok, _} = Servers.join_server(server, other)
    end
  end
end
