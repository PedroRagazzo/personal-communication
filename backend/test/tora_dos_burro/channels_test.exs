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
end
