defmodule ToraDosBurroWeb.AuthControllerDefaultServerTest do
  # async: false de propósito — mexe em Application.put_env(:tora_dos_burro,
  # :default_server_id, ...), que é estado global; não é seguro misturar com
  # os outros testes de AuthControllerTest (esses continuam async: true).
  use ToraDosBurroWeb.ConnCase, async: false

  alias ToraDosBurro.{Accounts, Servers}

  setup do
    {:ok, owner} =
      Accounts.register_user(%{"username" => "dono", "password" => "senha-super-segura"})

    {:ok, server} = Servers.create_server(owner, %{"name" => "TORA DOS BURRO"})

    Application.put_env(:tora_dos_burro, :default_server_id, server.id)
    on_exit(fn -> Application.delete_env(:tora_dos_burro, :default_server_id) end)

    %{server: server}
  end

  test "cadastro entra automaticamente no servidor default configurado", %{
    conn: conn,
    server: server
  } do
    conn =
      post(conn, ~p"/api/v1/auth/register",
        user: %{"username" => "novato", "password" => "senha-super-segura"}
      )

    %{"user" => %{"id" => user_id}} = json_response(conn, 201)

    {:ok, user} = Accounts.fetch_user(user_id)
    assert {:ok, _member} = Servers.fetch_member(server, user)
  end

  test "cadastro não quebra se DEFAULT_SERVER_ID apontar pra um servidor inexistente", %{
    conn: conn
  } do
    Application.put_env(:tora_dos_burro, :default_server_id, Ecto.UUID.generate())

    conn =
      post(conn, ~p"/api/v1/auth/register",
        user: %{"username" => "novato2", "password" => "senha-super-segura"}
      )

    assert %{"access_token" => _} = json_response(conn, 201)
  end
end
