defmodule ToraDosBurro.Accounts do
  @moduledoc """
  Contexto de contas: cadastro e autenticação de usuários.
  """

  alias ToraDosBurro.Repo
  alias ToraDosBurro.Accounts.User

  def get_user(id) do
    Repo.get(User, id)
  end

  def get_user_by_email(email) when is_binary(email) do
    Repo.get_by(User, email: email)
  end

  def register_user(attrs) do
    %User{}
    |> User.registration_changeset(attrs)
    |> Repo.insert()
  end

  @doc """
  Autentica por email/senha.

  Roda o hash mesmo quando o usuário não existe (`Argon2.no_user_verify/0`)
  para não vazar, por tempo de resposta, quais emails estão cadastrados.
  """
  def authenticate_user(email, password) do
    user = get_user_by_email(email)

    cond do
      user && Argon2.verify_pass(password, user.password_hash) ->
        {:ok, user}

      user ->
        {:error, :unauthorized}

      true ->
        Argon2.no_user_verify()
        {:error, :unauthorized}
    end
  end
end
