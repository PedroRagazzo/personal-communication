defmodule ToraDosBurro.Servers.Server do
  use Ecto.Schema
  import Ecto.Changeset

  @primary_key {:id, :binary_id, autogenerate: true}
  @foreign_key_type :binary_id

  schema "servers" do
    field :name, :string
    field :icon_url, :string
    field :owner_id, :binary_id

    timestamps(type: :utc_datetime)
  end

  def changeset(server, attrs) do
    server
    |> cast(attrs, [:name, :icon_url])
    |> validate_required([:name])
    |> validate_length(:name, min: 2, max: 100)
  end
end
