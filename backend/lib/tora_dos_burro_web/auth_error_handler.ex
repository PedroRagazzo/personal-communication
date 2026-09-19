defmodule ToraDosBurroWeb.AuthErrorHandler do
  @behaviour Guardian.Plug.ErrorHandler

  import Plug.Conn

  @impl Guardian.Plug.ErrorHandler
  def auth_error(conn, {type, _reason}, _opts) do
    conn
    |> put_status(:unauthorized)
    |> Phoenix.Controller.json(%{errors: %{detail: to_string(type)}})
  end
end
