defmodule ToraDosBurro.ChannelsTest do
  use ToraDosBurro.DataCase, async: true

  alias ToraDosBurro.{Accounts, Channels, Servers}

  defp create_owner_and_server(suffix) do
    {:ok, owner} =
      Accounts.register_user(%{
        "username" => "owner#{suffix}",
        "email" => "owner#{suffix}@example.com",
        "password" => "senha-super-segura"
      })

    {:ok, server} = Servers.create_server(owner, %{"name" => "Servidor #{suffix}"})
    {owner, server}
  end

  describe "create_channel/2 e list_channels/1" do
    test "cria um canal de texto e lista" do
      {_owner, server} = create_owner_and_server(1)

      assert {:ok, channel} = Channels.create_channel(server, %{"name" => "geral"})
      assert channel.type == "guild_text"
      assert [%{id: id}] = Channels.list_channels(server)
      assert id == channel.id
    end

    test "rejeita tipo inválido" do
      {_owner, server} = create_owner_and_server(2)

      assert {:error, changeset} =
               Channels.create_channel(server, %{"name" => "x", "type" => "invalido"})

      assert "is invalid" in errors_on(changeset).type
    end
  end

  describe "update_channel/2 e delete_channel/1" do
    test "atualiza nome e apaga" do
      {_owner, server} = create_owner_and_server(3)
      assert {:ok, channel} = Channels.create_channel(server, %{"name" => "geral"})

      assert {:ok, updated} = Channels.update_channel(channel, %{"name" => "geral-renomeado"})
      assert updated.name == "geral-renomeado"

      assert {:ok, _} = Channels.delete_channel(updated)
      assert {:error, :not_found} = Channels.fetch_channel(server, channel.id)
    end
  end

  describe "categorias" do
    test "cria, lista, atualiza e apaga" do
      {_owner, server} = create_owner_and_server(4)

      assert {:ok, category} = Channels.create_category(server, %{"name" => "Texto"})
      assert [%{id: id}] = Channels.list_categories(server)
      assert id == category.id

      assert {:ok, updated} = Channels.update_category(category, %{"name" => "Voz"})
      assert updated.name == "Voz"

      assert {:ok, _} = Channels.delete_category(updated)
      assert {:error, :not_found} = Channels.fetch_category(server, category.id)
    end

    test "canal pode ser associado a uma categoria" do
      {_owner, server} = create_owner_and_server(5)
      assert {:ok, category} = Channels.create_category(server, %{"name" => "Texto"})

      assert {:ok, channel} =
               Channels.create_channel(server, %{"name" => "geral", "category_id" => category.id})

      assert channel.category_id == category.id
    end
  end

  describe "permission_overwrites e Channels.authorize/3" do
    setup do
      {owner, server} = create_owner_and_server(6)

      {:ok, member_user} =
        Accounts.register_user(%{
          "username" => "member6",
          "email" => "member6@example.com",
          "password" => "senha-super-segura"
        })

      {:ok, member} = Servers.join_server(server, member_user)
      {:ok, channel} = Channels.create_channel(server, %{"name" => "geral"})

      %{owner: owner, server: server, member_user: member_user, member: member, channel: channel}
    end

    test "sem overwrite, usa a permissão efetiva normal do servidor", %{
      channel: channel,
      member_user: member_user
    } do
      assert :ok = Channels.authorize(channel, member_user, :view_channels)
    end

    test "overwrite de @everyone negando view_channels bloqueia membro comum", %{
      server: server,
      channel: channel,
      member_user: member_user
    } do
      default_role = Servers.default_role(server)

      assert {:ok, _} =
               Channels.put_overwrite(channel, %{
                 "target_type" => "role",
                 "target_id" => default_role.id,
                 "deny" => Servers.Permissions.combine([:view_channels])
               })

      assert {:error, :forbidden} = Channels.authorize(channel, member_user, :view_channels)
    end

    test "overwrite de cargo específico permitindo supera o deny de @everyone", %{
      server: server,
      channel: channel,
      member_user: member_user,
      member: member
    } do
      default_role = Servers.default_role(server)

      assert {:ok, _} =
               Channels.put_overwrite(channel, %{
                 "target_type" => "role",
                 "target_id" => default_role.id,
                 "deny" => Servers.Permissions.combine([:view_channels])
               })

      assert {:ok, special_role} =
               Servers.create_role(server, %{"name" => "VIP", "permissions" => 0})

      assert {:ok, _} = Servers.assign_role(member, special_role)

      assert {:ok, _} =
               Channels.put_overwrite(channel, %{
                 "target_type" => "role",
                 "target_id" => special_role.id,
                 "allow" => Servers.Permissions.combine([:view_channels])
               })

      assert :ok = Channels.authorize(channel, member_user, :view_channels)
    end

    test "overwrite de membro específico é a última palavra, mesmo com cargo permitindo", %{
      server: server,
      channel: channel,
      member_user: member_user,
      member: member
    } do
      assert {:ok, special_role} =
               Servers.create_role(server, %{
                 "name" => "VIP",
                 "permissions" => Servers.Permissions.combine([:view_channels])
               })

      assert {:ok, _} = Servers.assign_role(member, special_role)
      assert :ok = Channels.authorize(channel, member_user, :view_channels)

      assert {:ok, _} =
               Channels.put_overwrite(channel, %{
                 "target_type" => "member",
                 "target_id" => member_user.id,
                 "deny" => Servers.Permissions.combine([:view_channels])
               })

      assert {:error, :forbidden} = Channels.authorize(channel, member_user, :view_channels)
    end

    test "administrator ignora overwrites completamente", %{
      server: server,
      channel: channel,
      member_user: member_user,
      member: member
    } do
      assert {:ok, admin_role} =
               Servers.create_role(server, %{
                 "name" => "Admin",
                 "permissions" => Servers.Permissions.combine([:administrator])
               })

      assert {:ok, _} = Servers.assign_role(member, admin_role)

      default_role = Servers.default_role(server)

      assert {:ok, _} =
               Channels.put_overwrite(channel, %{
                 "target_type" => "role",
                 "target_id" => default_role.id,
                 "deny" => Servers.Permissions.combine([:view_channels])
               })

      assert {:ok, _} =
               Channels.put_overwrite(channel, %{
                 "target_type" => "member",
                 "target_id" => member_user.id,
                 "deny" => Servers.Permissions.combine([:view_channels])
               })

      assert :ok = Channels.authorize(channel, member_user, :view_channels)
    end

    test "dono do servidor sempre autorizado, mesmo com deny explícito", %{
      server: server,
      channel: channel,
      owner: owner
    } do
      default_role = Servers.default_role(server)

      assert {:ok, _} =
               Channels.put_overwrite(channel, %{
                 "target_type" => "role",
                 "target_id" => default_role.id,
                 "deny" => Servers.Permissions.combine([:view_channels])
               })

      assert :ok = Channels.authorize(channel, owner, :view_channels)
    end
  end
end
