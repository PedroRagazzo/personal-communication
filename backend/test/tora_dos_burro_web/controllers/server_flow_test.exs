defmodule ToraDosBurroWeb.ServerFlowTest do
  use ToraDosBurroWeb.ConnCase, async: true

  alias ToraDosBurro.Accounts

  defp register_and_login(suffix) do
    attrs = %{
      "username" => "flow#{suffix}",
      "email" => "flow#{suffix}@example.com",
      "password" => "senha-super-segura"
    }

    {:ok, user} = Accounts.register_user(attrs)
    {:ok, token, _claims} = ToraDosBurro.Guardian.encode_and_sign(user, %{}, token_type: "access")
    {user, token}
  end

  defp auth_conn(token) do
    build_conn() |> put_req_header("authorization", "Bearer #{token}")
  end

  test "criar servidor, convidar, entrar, listar membros, atribuir cargo, expulsar e banir" do
    {_owner, owner_token} = register_and_login(1)
    {invitee, invitee_token} = register_and_login(2)
    {troublemaker, troublemaker_token} = register_and_login(3)

    create_conn =
      auth_conn(owner_token)
      |> post(~p"/api/v1/servers", server: %{"name" => "Servidor de Teste"})

    %{"server" => %{"id" => server_id}} = json_response(create_conn, 201)

    invite_conn = auth_conn(owner_token) |> post(~p"/api/v1/servers/#{server_id}/invites", %{})
    %{"invite" => %{"code" => code}} = json_response(invite_conn, 201)

    preview_conn = get(build_conn(), ~p"/api/v1/invites/#{code}")
    assert %{"invite" => %{"server" => %{"id" => ^server_id}}} = json_response(preview_conn, 200)

    join_conn = auth_conn(invitee_token) |> post(~p"/api/v1/invites/#{code}/join")
    assert %{"server" => %{"id" => ^server_id}} = json_response(join_conn, 200)

    join_conn2 = auth_conn(troublemaker_token) |> post(~p"/api/v1/invites/#{code}/join")
    json_response(join_conn2, 200)

    members_conn = auth_conn(owner_token) |> get(~p"/api/v1/servers/#{server_id}/members")
    assert %{"members" => members} = json_response(members_conn, 200)
    assert length(members) == 3

    forbidden_conn =
      auth_conn(invitee_token)
      |> post(~p"/api/v1/servers/#{server_id}/roles", role: %{"name" => "Mod"})

    assert json_response(forbidden_conn, 403)

    role_conn =
      auth_conn(owner_token)
      |> post(~p"/api/v1/servers/#{server_id}/roles",
        role: %{"name" => "Mod", "permissions" => 64}
      )

    %{"role" => %{"id" => role_id}} = json_response(role_conn, 201)

    assign_conn =
      auth_conn(owner_token)
      |> put(~p"/api/v1/servers/#{server_id}/members/#{invitee.id}/roles/#{role_id}")

    assert %{"member" => %{"roles" => [%{"name" => "Mod"}]}} = json_response(assign_conn, 200)

    kick_conn =
      auth_conn(invitee_token)
      |> delete(~p"/api/v1/servers/#{server_id}/members/#{troublemaker.id}")

    assert response(kick_conn, 204)

    ban_conn =
      auth_conn(owner_token)
      |> post(~p"/api/v1/servers/#{server_id}/bans", user_id: troublemaker.id, reason: "spam")

    assert json_response(ban_conn, 201)

    rejoin_conn = auth_conn(troublemaker_token) |> post(~p"/api/v1/invites/#{code}/join")
    assert json_response(rejoin_conn, 422)
  end

  test "GET /servers lista só os servidores do usuário autenticado" do
    {_owner, owner_token} = register_and_login(4)
    {_stranger, stranger_token} = register_and_login(5)

    create_conn =
      auth_conn(owner_token) |> post(~p"/api/v1/servers", server: %{"name" => "Meu Servidor"})

    %{"server" => %{"id" => server_id}} = json_response(create_conn, 201)

    owner_list_conn = auth_conn(owner_token) |> get(~p"/api/v1/servers")
    assert %{"servers" => [%{"id" => ^server_id}]} = json_response(owner_list_conn, 200)

    stranger_list_conn = auth_conn(stranger_token) |> get(~p"/api/v1/servers")
    assert %{"servers" => []} = json_response(stranger_list_conn, 200)
  end
end
