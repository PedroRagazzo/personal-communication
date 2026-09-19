defmodule ToraDosBurro.ChatTest do
  use ToraDosBurro.DataCase, async: true

  alias ToraDosBurro.{Accounts, Channels, Chat, Servers}

  defp setup_channel(suffix) do
    {:ok, owner} =
      Accounts.register_user(%{
        "username" => "chatowner#{suffix}",
        "email" => "chatowner#{suffix}@example.com",
        "password" => "senha-super-segura"
      })

    {:ok, server} = Servers.create_server(owner, %{"name" => "Servidor Chat #{suffix}"})
    {:ok, channel} = Channels.create_channel(server, %{"name" => "geral"})
    {owner, channel}
  end

  describe "create_message/3" do
    test "cria mensagem associada ao autor e ao canal" do
      {owner, channel} = setup_channel(1)

      assert {:ok, message} = Chat.create_message(channel, owner, %{"content" => "oi"})
      assert message.content == "oi"
      assert message.author_id == owner.id
      assert message.channel_id == channel.id
    end

    test "rejeita conteúdo vazio" do
      {owner, channel} = setup_channel(2)
      assert {:error, changeset} = Chat.create_message(channel, owner, %{"content" => ""})
      assert "can't be blank" in errors_on(changeset).content
    end
  end

  describe "update_message/2" do
    test "edita e marca edited_at" do
      {owner, channel} = setup_channel(3)
      assert {:ok, message} = Chat.create_message(channel, owner, %{"content" => "original"})
      assert is_nil(message.edited_at)

      assert {:ok, updated} = Chat.update_message(message, %{"content" => "editada"})
      assert updated.content == "editada"
      assert updated.edited_at != nil
    end
  end

  describe "list_messages/2 (paginação)" do
    test "retorna em ordem cronológica e respeita o cursor `before`" do
      {owner, channel} = setup_channel(4)

      messages =
        for i <- 1..5 do
          {:ok, m} = Chat.create_message(channel, owner, %{"content" => "msg #{i}"})
          m
        end

      assert Enum.map(Chat.list_messages(channel), & &1.content) ==
               Enum.map(messages, & &1.content)

      third = Enum.at(messages, 2)

      before_contents =
        channel
        |> Chat.list_messages(before: third.id)
        |> Enum.map(& &1.content)

      assert before_contents == ["msg 1", "msg 2"]
    end
  end

  describe "reações" do
    test "adicionar, reagir de novo é idempotente, e remover" do
      {owner, channel} = setup_channel(5)
      assert {:ok, message} = Chat.create_message(channel, owner, %{"content" => "oi"})

      assert {:ok, _} = Chat.add_reaction(message, owner, "👍")
      assert {:ok, _} = Chat.add_reaction(message, owner, "👍")

      assert {:ok, reloaded} = Chat.fetch_message(channel, message.id)
      assert length(reloaded.reactions) == 1

      assert :ok = Chat.remove_reaction(message, owner, "👍")
      assert {:ok, reloaded2} = Chat.fetch_message(channel, message.id)
      assert reloaded2.reactions == []
    end
  end
end
