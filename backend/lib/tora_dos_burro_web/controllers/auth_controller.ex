defmodule ToraDosBurroWeb.AuthController do
  use ToraDosBurroWeb, :controller

  alias ToraDosBurro.Accounts
  alias ToraDosBurro.Guardian
  alias ToraDosBurro.Servers

  action_fallback ToraDosBurroWeb.FallbackController

  def register(conn, %{"user" => user_params}) do
    with {:ok, user} <- Accounts.register_user(user_params) do
      maybe_join_default_server(user)

      conn
      |> put_status(:created)
      |> render(:tokens, tokens(user))
    end
  end

  # Cláusula mais específica primeiro — senão o pattern do login sem
  # discriminator (abaixo) também bateria quando o cliente manda os três
  # campos, já que casamento de mapa não exige "só essas chaves".
  def login(conn, %{
        "username" => username,
        "discriminator" => discriminator,
        "password" => password
      }) do
    with {:ok, user} <- Accounts.authenticate_user(username, discriminator, password) do
      render(conn, :tokens, tokens(user))
    end
  end

  # Caminho normal pedido pelo usuário: só username + senha. Só cai pra
  # exigir discriminator se `Accounts.authenticate_user/2` responder
  # `:ambiguous_username` (duas contas com o mesmo nome) — o cliente então
  # reenvia pra cláusula acima.
  def login(conn, %{"username" => username, "password" => password}) do
    with {:ok, user} <- Accounts.authenticate_user(username, password) do
      render(conn, :tokens, tokens(user))
    end
  end

  def refresh(conn, %{"refresh_token" => refresh_token}) do
    with {:ok, _old_stuff, {new_access_token, _claims}} <-
           Guardian.exchange(refresh_token, "refresh", "access") do
      json(conn, %{access_token: new_access_token})
    else
      {:error, _reason} ->
        conn
        |> put_status(:unauthorized)
        |> json(%{errors: %{detail: "invalid or expired refresh token"}})
    end
  end

  def logout(conn, %{"refresh_token" => refresh_token}) do
    Guardian.revoke(refresh_token)
    send_resp(conn, :no_content, "")
  end

  # App tem um único servidor de acesso pra todo mundo (sem convite prévio) —
  # se `:default_server_id` estiver configurado (ver runtime.exs), toda
  # conta nova já entra automaticamente nele. Não configurado (dev/test) ou
  # apontando pra um servidor que não existe: no-op, cadastro segue normal
  # (o app volta a se comportar como antes, só sem o auto-join).
  defp maybe_join_default_server(user) do
    with server_id when is_binary(server_id) <-
           Application.get_env(:tora_dos_burro, :default_server_id),
         {:ok, server} <- Servers.fetch_server(server_id),
         {:ok, member} <- Servers.join_server(server, user) do
      Servers.notify_member_joined(server, member, user)
    end
  end

  defp tokens(user) do
    {:ok, access_token, _claims} =
      Guardian.encode_and_sign(user, %{}, token_type: "access", ttl: {15, :minutes})

    {:ok, refresh_token, _claims} =
      Guardian.encode_and_sign(user, %{}, token_type: "refresh", ttl: {30, :days})

    %{user: user, access_token: access_token, refresh_token: refresh_token}
  end
end
