defmodule ToraDosBurro.Accounts do
  @moduledoc """
  Contexto de contas: cadastro e autenticação de usuários.
  """

  import Ecto.Query

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

  defp get_users_by_username(username) when is_binary(username) do
    Repo.all(from u in User, where: u.username == ^username)
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

  @doc """
  Autentica só por username + senha (sem discriminator) — caminho normal de
  login pedido pelo usuário. Username não é único sozinho (dois usuários
  podem escolher o mesmo nome, ver `insert_with_discriminator/2`), então:
  nenhuma conta com esse nome -> `:unauthorized` (mesmo timing-safe no-op de
  sempre); uma só -> autentica normalmente; duas ou mais -> `:ambiguous_username`,
  pra o cliente pedir o discriminator só nesse caso raro e cair no
  `authenticate_user/3` acima. Nunca tenta a senha contra várias contas pra
  "adivinhar" qual é — isso poderia logar alguém na conta errada se, por
  coincidência, duas pessoas com o mesmo nome tiverem a mesma senha.
  """
  def authenticate_user(username, password) do
    case get_users_by_username(username) do
      [] ->
        Argon2.no_user_verify()
        {:error, :unauthorized}

      [user] ->
        if Argon2.verify_pass(password, user.password_hash) do
          {:ok, user}
        else
          {:error, :unauthorized}
        end

      [_ | _] ->
        {:error, :ambiguous_username}
    end
  end
end
