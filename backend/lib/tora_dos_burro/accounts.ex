defmodule ToraDosBurro.Accounts do
  @moduledoc """
  Contexto de contas: cadastro e autenticação de usuários.
  """

  alias ToraDosBurro.Repo
  alias ToraDosBurro.Accounts.User

  def get_user(id) do
    Repo.get(User, id)
  end

  def fetch_user(id) do
    case get_user(id) do
      nil -> {:error, :not_found}
      user -> {:ok, user}
    end
  end

  def get_user_by_email(email) when is_binary(email) do
    Repo.get_by(User, email: email)
  end

  def get_user_by_username_and_discriminator(username, discriminator)
      when is_binary(username) and is_binary(discriminator) do
    Repo.get_by(User, username: username, discriminator: discriminator)
  end

  @max_discriminator_attempts 20

  @doc """
  Cadastra um usuário, atribuindo automaticamente um discriminator
  (estilo `usuario#0001`) disponível para o username escolhido — o mesmo
  username pode se repetir com discriminators diferentes.
  """
  def register_user(attrs) do
    changeset = User.registration_changeset(%User{}, attrs)

    if changeset.valid? do
      insert_with_discriminator(changeset, @max_discriminator_attempts)
    else
      {:error, %{changeset | action: :insert}}
    end
  end

  defp insert_with_discriminator(changeset, 0) do
    {:error,
     Ecto.Changeset.add_error(
       changeset,
       :username,
       "não tem discriminators disponíveis no momento, tente outro nome"
     )}
  end

  defp insert_with_discriminator(changeset, attempts_left) do
    discriminator = :rand.uniform(9999) |> Integer.to_string() |> String.pad_leading(4, "0")
    attempt = Ecto.Changeset.put_change(changeset, :discriminator, discriminator)

    case Repo.insert(attempt) do
      {:error, %Ecto.Changeset{errors: errors} = failed} ->
        if Keyword.has_key?(errors, :discriminator) do
          insert_with_discriminator(changeset, attempts_left - 1)
        else
          {:error, failed}
        end

      ok ->
        ok
    end
  end

  @doc """
  Autentica por `username#discriminator` + senha — não por email (o cliente
  não pede/guarda email do usuário; ver docs/security.md).

  Roda o hash mesmo quando o usuário não existe (`Argon2.no_user_verify/0`)
  para não vazar, por tempo de resposta, quais contas existem.
  """
  def authenticate_user(username, discriminator, password) do
    user = get_user_by_username_and_discriminator(username, discriminator)

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
