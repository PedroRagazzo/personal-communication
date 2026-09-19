defmodule ToraDosBurro.Servers.Invite do
  use Ecto.Schema
  import Ecto.Changeset

  @primary_key {:id, :binary_id, autogenerate: true}
  @foreign_key_type :binary_id

  schema "invites" do
    field :code, :string
    field :max_uses, :integer
    field :uses, :integer, default: 0
    field :expires_at, :utc_datetime

    belongs_to :server, ToraDosBurro.Servers.Server
    belongs_to :creator, ToraDosBurro.Accounts.User

    timestamps(type: :utc_datetime)
  end

  @doc false
  def changeset(invite, attrs) do
    invite
    |> cast(attrs, [:max_uses, :expires_at])
    |> validate_number(:max_uses, greater_than: 0)
    |> put_code()
  end

  defp put_code(changeset) do
    if get_field(changeset, :code) do
      changeset
    else
      put_change(changeset, :code, generate_code())
    end
  end

  defp generate_code do
    :crypto.strong_rand_bytes(6) |> Base.url_encode64(padding: false) |> binary_part(0, 8)
  end
end
