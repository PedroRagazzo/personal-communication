defmodule ToraDosBurro.Servers.Role do
  use Ecto.Schema
  import Ecto.Changeset

  @primary_key {:id, :binary_id, autogenerate: true}
  @foreign_key_type :binary_id

  schema "roles" do
    field :name, :string
    field :color, :string
    field :permissions, :integer, default: 0
    field :position, :integer, default: 0
    field :is_default, :boolean, default: false

    belongs_to :server, ToraDosBurro.Servers.Server

    timestamps(type: :utc_datetime)
  end

  @doc false
  def changeset(role, attrs) do
    role
    |> cast(attrs, [:name, :color, :permissions, :position])
    |> validate_required([:name])
    |> validate_length(:name, min: 1, max: 32)
    |> validate_number(:permissions, greater_than_or_equal_to: 0)
  end
end
