defmodule ToraDosBurro.Servers.Ban do
  use Ecto.Schema
  import Ecto.Changeset

  @primary_key {:id, :binary_id, autogenerate: true}
  @foreign_key_type :binary_id

  schema "bans" do
    field :reason, :string

    belongs_to :server, ToraDosBurro.Servers.Server
    belongs_to :user, ToraDosBurro.Accounts.User
    belongs_to :moderator, ToraDosBurro.Accounts.User

    timestamps(type: :utc_datetime)
  end

  @doc false
  def changeset(ban, attrs) do
    cast(ban, attrs, [:reason])
  end
end
