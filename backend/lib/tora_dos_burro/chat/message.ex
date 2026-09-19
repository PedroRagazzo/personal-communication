defmodule ToraDosBurro.Chat.Message do
  use Ecto.Schema
  import Ecto.Changeset

  @primary_key {:id, :binary_id, autogenerate: true}
  @foreign_key_type :binary_id

  schema "messages" do
    # Monotônico (bigserial), gerado pelo Postgres — usado para ordenar
    # (ver Chat.list_messages/2). `read_after_writes` faz o Ecto reler o
    # valor gerado pelo banco depois do insert.
    field :seq, :integer, read_after_writes: true
    field :content, :string
    field :edited_at, :utc_datetime

    belongs_to :channel, ToraDosBurro.Channels.Channel
    belongs_to :author, ToraDosBurro.Accounts.User
    belongs_to :reply_to, __MODULE__

    has_many :attachments, ToraDosBurro.Chat.MessageAttachment
    has_many :reactions, ToraDosBurro.Chat.MessageReaction

    timestamps(type: :utc_datetime)
  end

  def create_changeset(message, attrs) do
    message
    |> cast(attrs, [:content, :reply_to_id])
    |> validate_required([:content])
    |> validate_length(:content, min: 1, max: 4000)
  end

  def update_changeset(message, attrs) do
    message
    |> cast(attrs, [:content])
    |> validate_required([:content])
    |> validate_length(:content, min: 1, max: 4000)
    |> put_change(:edited_at, DateTime.utc_now() |> DateTime.truncate(:second))
  end
end
