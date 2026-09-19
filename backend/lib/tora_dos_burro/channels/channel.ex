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

    belongs_to :server, ToraDosBurro.Servers.Server
    belongs_to :category, ToraDosBurro.Channels.Category

    timestamps(type: :utc_datetime)
  end

  @doc """
  `type` aceita `guild_voice` desde já (estrutura/metadados da FASE 5), mas
  a mecânica de voz de verdade (entrar na sala, WebRTC) só chega na FASE 6.
  `dm`/`group_dm` ficam para o fast-follow de Amigos/DM (ver roadmap.md).
  """
  def changeset(channel, attrs) do
    channel
    |> cast(attrs, [:name, :topic, :position, :type, :category_id])
    |> validate_required([:name])
    |> validate_length(:name, min: 1, max: 100)
    |> validate_inclusion(:type, @types)
    |> foreign_key_constraint(:category_id)
  end
end
