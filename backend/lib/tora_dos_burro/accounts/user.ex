defmodule ToraDosBurro.Accounts.User do
  use Ecto.Schema
  import Ecto.Changeset

  @primary_key {:id, :binary_id, autogenerate: true}
  @foreign_key_type :binary_id

  schema "users" do
    field :username, :string
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

  @doc false
  def registration_changeset(user, attrs) do
    user
    |> cast(attrs, [:username, :email, :password, :display_name])
    |> validate_required([:username, :email, :password])
    |> validate_length(:username, min: 3, max: 32)
    |> validate_format(:username, ~r/^[a-zA-Z0-9_.]+$/,
      message: "só pode conter letras, números, underscore e ponto"
    )
    |> validate_format(:email, ~r/^[^\s]+@[^\s]+\.[^\s]+$/, message: "formato de email inválido")
    |> validate_length(:password, min: 8, max: 128)
    |> unsafe_validate_unique(:username, ToraDosBurro.Repo)
    |> unique_constraint(:username)
    |> unsafe_validate_unique(:email, ToraDosBurro.Repo)
    |> unique_constraint(:email)
    |> put_password_hash()
  end

  defp put_password_hash(
         %Ecto.Changeset{valid?: true, changes: %{password: password}} = changeset
       ) do
    change(changeset, password_hash: Argon2.hash_pwd_salt(password))
  end

  defp put_password_hash(changeset), do: changeset
end
