defmodule ToraDosBurroWeb.AuthControllerTest do
  use ToraDosBurroWeb.ConnCase, async: true

  alias ToraDosBurro.Accounts

  @user_attrs %{
    "username" => "pedro",
    "password" => "senha-super-segura"
  }

  describe "POST /api/v1/auth/register" do
    test "cria o usuário (sem email) e devolve tokens", %{conn: conn} do
      conn = post(conn, ~p"/api/v1/auth/register", user: @user_attrs)

      assert %{
               "access_token" => access_token,
               "refresh_token" => refresh_token,
               "user" => %{
                 "username" => "pedro",
                 "email" => nil,
                 "discriminator" => discriminator
               }
             } = json_response(conn, 201)

      assert is_binary(access_token)
      assert is_binary(refresh_token)
      assert discriminator =~ ~r/^\d{4}$/
    end

    test "devolve 422 com dados inválidos", %{conn: conn} do
      conn = post(conn, ~p"/api/v1/auth/register", user: %{@user_attrs | "password" => "curta"})
      assert %{"errors" => %{"password" => _}} = json_response(conn, 422)
    end
  end

  describe "POST /api/v1/auth/login" do
    setup do
      {:ok, user} = Accounts.register_user(@user_attrs)
      %{user: user}
    end

    test "autentica com username, discriminator e senha corretos", %{conn: conn, user: user} do
      conn =
        post(conn, ~p"/api/v1/auth/login",
          username: user.username,
          discriminator: user.discriminator,
          password: "senha-super-segura"
        )

      assert %{"access_token" => _, "refresh_token" => _} = json_response(conn, 200)
    end

    test "rejeita senha errada", %{conn: conn, user: user} do
      conn =
        post(conn, ~p"/api/v1/auth/login",
          username: user.username,
          discriminator: user.discriminator,
          password: "errada"
        )

      assert json_response(conn, 401)
    end
  end

  describe "fluxo completo: registrar -> acessar rota protegida -> refresh -> logout" do
    test "token de acesso libera /users/me, refresh emite novo access token, logout revoga o refresh",
         %{conn: conn} do
      conn = post(conn, ~p"/api/v1/auth/register", user: @user_attrs)

      %{"access_token" => access_token, "refresh_token" => refresh_token} =
        json_response(conn, 201)

      me_conn =
        build_conn()
        |> put_req_header("authorization", "Bearer #{access_token}")
        |> get(~p"/api/v1/users/me")

      assert %{"username" => "pedro"} = json_response(me_conn, 200)

      no_token_conn = get(build_conn(), ~p"/api/v1/users/me")
      assert json_response(no_token_conn, 401)

      refresh_conn = post(build_conn(), ~p"/api/v1/auth/refresh", refresh_token: refresh_token)
      assert %{"access_token" => new_access_token} = json_response(refresh_conn, 200)
      assert is_binary(new_access_token)

      logout_conn = post(build_conn(), ~p"/api/v1/auth/logout", refresh_token: refresh_token)
      assert response(logout_conn, 204)

      revoked_conn = post(build_conn(), ~p"/api/v1/auth/refresh", refresh_token: refresh_token)
      assert json_response(revoked_conn, 401)
    end
  end
end
