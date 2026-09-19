defmodule ToraDosBurro.Chat.MessageReaction do
  use Ecto.Schema
  import Ecto.Changeset

  @primary_key {:id, :binary_id, autogenerate: true}
  @foreign_key_type :binary_id

  schema "message_reactions" do
    field :emoji, :string

    belongs_to :message, ToraDosBurro.Chat.Message
    belongs_to :user, ToraDosBurro.Accounts.User

    timestamps(type: :utc_datetime)
  end

  def changeset(reaction, attrs) do
    reaction
    |> cast(attrs, [:emoji])
    |> validate_required([:emoji])
    |> validate_length(:emoji, max: 32)
  end
end
