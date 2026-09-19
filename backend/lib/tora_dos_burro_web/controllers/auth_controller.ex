defmodule ToraDosBurroWeb.AuthController do
  use ToraDosBurroWeb, :controller

  alias ToraDosBurro.Accounts
  alias ToraDosBurro.Guardian

  action_fallback ToraDosBurroWeb.FallbackController

  def register(conn, %{"user" => user_params}) do
    with {:ok, user} <- Accounts.register_user(user_params) do
      conn
      |> put_status(:created)
      |> render(:tokens, tokens(user))
    end
  end

  def login(conn, %{"email" => email, "password" => password}) do
    with {:ok, user} <- Accounts.authenticate_user(email, password) do
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

  defp tokens(user) do
    {:ok, access_token, _claims} =
      Guardian.encode_and_sign(user, %{}, token_type: "access", ttl: {15, :minutes})

    {:ok, refresh_token, _claims} =
      Guardian.encode_and_sign(user, %{}, token_type: "refresh", ttl: {30, :days})

    %{user: user, access_token: access_token, refresh_token: refresh_token}
  end
end
