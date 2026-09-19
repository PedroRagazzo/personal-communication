defmodule ToraDosBurro.Channels.Channel do
  use Ecto.Schema
  import Ecto.Changeset

  @primary_key {:id, :binary_id, autogenerate: true}
  @foreign_key_type :binary_id

  @types ~w(guild_text guild_voice dm group_dm)

  schema "channels" do
    field :type, :string, default: "guild_text"
    field :name, :string
    field :topic, :string
    field :position, :integer, default: 0
    field :category_id, :binary_id

    belongs_to :server, ToraDosBurro.Servers.Server

    timestamps(type: :utc_datetime)
  end

  @doc """
  `type` só aceita `guild_text` nesta fase — `guild_voice` chega de verdade
  na FASE 6, `dm`/`group_dm` no fast-follow de Amigos/DM (ver roadmap.md).
  """
  def changeset(channel, attrs) do
    channel
    |> cast(attrs, [:name, :topic, :position, :type])
    |> validate_required([:name])
    |> validate_length(:name, min: 1, max: 100)
    |> validate_inclusion(:type, @types)
  end
end
