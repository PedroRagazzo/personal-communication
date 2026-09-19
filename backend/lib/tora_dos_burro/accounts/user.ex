defmodule ToraDosBurro.Accounts.User do
  use Ecto.Schema
  import Ecto.Changeset

  @primary_key {:id, :binary_id, autogenerate: true}
  @foreign_key_type :binary_id

  schema "users" do
    field :username, :string
    field :discriminator, :string
    field :email, :string
    field :password, :string, virtual: true, redact: true
    field :password_hash, :string, redact: true
    field :display_name, :string
    field :avatar_url, :string

    field :status, Ecto.Enum,
      values: [:online, :idle, :dnd, :invisible, :offline],
      default: :offline

    field :custom_status_text, :string
    field :last_seen_at, :utc_datetime

    timestamps(type: :utc_datetime)
  end

  @doc """
  Changeset de cadastro. `discriminator` propositalmente não entra no
  `cast/3` — é sempre atribuído pelo `ToraDosBurro.Accounts.register_user/1`,
  nunca escolhido pelo cliente (estilo Discord: `username#0001`, o mesmo
  username pode se repetir com discriminators diferentes).

  `email` é opcional — o cliente hoje só pede usuário+senha (login usa
  `username#discriminator`, não email); o campo continua existindo no
  schema para uma fatia futura de confirmação/recuperação de senha (ver
  docs/roadmap.md), mas nada obriga ou valida quando ausente.
  """
  def registration_changeset(user, attrs) do
    user
    |> cast(attrs, [:username, :email, :password, :display_name])
    |> validate_required([:username, :password])
    |> validate_length(:username, min: 3, max: 32)
    |> validate_format(:username, ~r/^[a-zA-Z0-9_.]+$/,
      message: "só pode conter letras, números, underscore e ponto"
    )
    |> maybe_validate_email()
    |> validate_length(:password, min: 8, max: 128)
    |> unique_constraint(:discriminator, name: :users_username_discriminator_index)
    |> put_password_hash()
  end

  defp maybe_validate_email(changeset) do
    if get_change(changeset, :email) do
      changeset
      |> validate_format(:email, ~r/^[^\s]+@[^\s]+\.[^\s]+$/,
        message: "formato de email inválido"
      )
      |> unsafe_validate_unique(:email, ToraDosBurro.Repo)
      |> unique_constraint(:email)
    else
      changeset
    end
  end

  defp put_password_hash(
         %Ecto.Changeset{valid?: true, changes: %{password: password}} = changeset
       ) do
    change(changeset, password_hash: Argon2.hash_pwd_salt(password))
  end

  defp put_password_hash(changeset), do: changeset
end
