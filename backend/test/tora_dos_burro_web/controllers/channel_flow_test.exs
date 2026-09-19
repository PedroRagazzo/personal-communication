defmodule ToraDosBurroWeb.ChannelFlowTest do
  use ToraDosBurroWeb.ConnCase, async: true

  alias ToraDosBurro.{Accounts, Chat, Guardian, Servers}

  defp register_and_login(suffix) do
    attrs = %{
      "username" => "chflow#{suffix}",
      "email" => "chflow#{suffix}@example.com",
      "password" => "senha-super-segura"
    }

    {:ok, user} = Accounts.register_user(attrs)
    {:ok, token, _claims} = Guardian.encode_and_sign(user, %{}, token_type: "access")
    {user, token}
  end

  defp auth_conn(token), do: build_conn() |> put_req_header("authorization", "Bearer #{token}")

  test "criar canal via REST, listar, e paginar histórico de mensagens" do
    {owner, owner_token} = register_and_login(1)
    {:ok, server} = Servers.create_server(owner, %{"name" => "Servidor REST"})

    create_conn =
      auth_conn(owner_token)
      |> post(~p"/api/v1/servers/#{server.id}/channels", channel: %{"name" => "geral"})

    assert %{"channel" => %{"id" => channel_id, "name" => "geral"}} =
             json_response(create_conn, 201)

    index_conn = auth_conn(owner_token) |> get(~p"/api/v1/servers/#{server.id}/channels")
    assert %{"channels" => [%{"id" => ^channel_id}]} = json_response(index_conn, 200)

    {:ok, channel} = ToraDosBurro.Channels.fetch_channel(channel_id)

    for i <- 1..5 do
      {:ok, _} = Chat.create_message(channel, owner, %{"content" => "msg #{i}"})
    end

    history_conn =
      auth_conn(owner_token) |> get(~p"/api/v1/channels/#{channel_id}/messages?limit=3")

    assert %{"messages" => messages} = json_response(history_conn, 200)
    assert length(messages) == 3
    assert Enum.map(messages, & &1["content"]) == ["msg 3", "msg 4", "msg 5"]
  end
end
