defmodule ToraDosBurro.Servers.ServerMember do
  use Ecto.Schema
  import Ecto.Changeset

  @primary_key {:id, :binary_id, autogenerate: true}
  @foreign_key_type :binary_id

  schema "server_members" do
    field :nickname, :string
    field :joined_at, :utc_datetime

    belongs_to :server, ToraDosBurro.Servers.Server
    belongs_to :user, ToraDosBurro.Accounts.User

    many_to_many :roles, ToraDosBurro.Servers.Role,
      join_through: "member_roles",
      join_keys: [server_member_id: :id, role_id: :id],
      on_replace: :delete
  end

  @doc false
  def changeset(member, attrs) do
    member
    |> cast(attrs, [:nickname])
    |> validate_length(:nickname, max: 32)
  end
end
