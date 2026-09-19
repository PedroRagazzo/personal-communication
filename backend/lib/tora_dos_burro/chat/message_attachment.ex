defmodule ToraDosBurro.Chat.MessageAttachment do
  use Ecto.Schema
  import Ecto.Changeset

  @primary_key {:id, :binary_id, autogenerate: true}
  @foreign_key_type :binary_id

  schema "message_attachments" do
    field :object_key, :string
    field :filename, :string
    field :content_type, :string
    field :size_bytes, :integer

    belongs_to :message, ToraDosBurro.Chat.Message

    timestamps(type: :utc_datetime)
  end

  def changeset(attachment, attrs) do
    attachment
    |> cast(attrs, [:object_key, :filename, :content_type, :size_bytes])
    |> validate_required([:object_key, :filename, :content_type, :size_bytes])
  end
end
