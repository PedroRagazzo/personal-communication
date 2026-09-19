defmodule ToraDosBurro.Channels.PermissionOverwrite do
  use Ecto.Schema
  import Ecto.Changeset

  @primary_key {:id, :binary_id, autogenerate: true}
  @foreign_key_type :binary_id

  @target_types ~w(role member)

  schema "permission_overwrites" do
    field :target_type, :string
    field :target_id, :binary_id
    field :allow, :integer, default: 0
    field :deny, :integer, default: 0

    belongs_to :channel, ToraDosBurro.Channels.Channel

    timestamps(type: :utc_datetime)
  end

  def changeset(overwrite, attrs) do
    overwrite
    |> cast(attrs, [:target_type, :target_id, :allow, :deny])
    |> validate_required([:target_type, :target_id])
    |> validate_inclusion(:target_type, @target_types)
    |> validate_number(:allow, greater_than_or_equal_to: 0)
    |> validate_number(:deny, greater_than_or_equal_to: 0)
    |> unique_constraint([:channel_id, :target_type, :target_id])
  end
end
