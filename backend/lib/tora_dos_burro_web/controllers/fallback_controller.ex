defmodule ToraDosBurroWeb.FallbackController do
  use ToraDosBurroWeb, :controller

  def call(conn, {:error, %Ecto.Changeset{} = changeset}) do
    conn
    |> put_status(:unprocessable_entity)
    |> put_view(json: ToraDosBurroWeb.ChangesetJSON)
    |> render(:error, changeset: changeset)
  end

  def call(conn, {:error, :unauthorized}) do
    conn
    |> put_status(:unauthorized)
    |> json(%{errors: %{detail: "invalid email or password"}})
  end

  def call(conn, {:error, :forbidden}) do
    conn
    |> put_status(:forbidden)
    |> json(%{errors: %{detail: "forbidden"}})
  end

  def call(conn, {:error, :not_found}) do
    conn
    |> put_status(:not_found)
    |> json(%{errors: %{detail: "not found"}})
  end

  # Demais erros de negócio (:not_member, :banned, :already_member,
  # :owner_cannot_leave, :cannot_delete_default_role, :expired,
  # :max_uses_reached, ...): 422 com o próprio átomo como detalhe.
  def call(conn, {:error, reason}) when is_atom(reason) do
    conn
    |> put_status(:unprocessable_entity)
    |> json(%{errors: %{detail: to_string(reason)}})
  end
end
