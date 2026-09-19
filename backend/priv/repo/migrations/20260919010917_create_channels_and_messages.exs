defmodule ToraDosBurro.Repo.Migrations.CreateChannelsAndMessages do
  use Ecto.Migration

  @moduledoc """
  Cria um `channels` mínimo (só o necessário para o chat da FASE 4 —
  `category_id` fica sem FK por enquanto, `categories` não existe até a
  FASE 5, que também traz o tipo `guild_voice` de verdade e reordenação) e
  as tabelas de mensagens. Ver docs/database.md e docs/roadmap.md.
  """

  def change do
    create table(:channels, primary_key: false) do
      add :id, :binary_id, primary_key: true
      add :server_id, references(:servers, type: :binary_id, on_delete: :delete_all), null: false
      add :category_id, :binary_id
      add :type, :string, null: false, default: "guild_text"
      add :name, :string, null: false
      add :topic, :string
      add :position, :integer, null: false, default: 0

      timestamps(type: :utc_datetime)
    end

    create index(:channels, [:server_id])

    create table(:messages, primary_key: false) do
      add :id, :binary_id, primary_key: true
      # Ordem de exibição usa `seq`, não `inserted_at`: `id` é UUID (não
      # ordenável por tempo) e timestamp — mesmo em usec — pode empatar
      # entre mensagens seguidas dependendo da resolução do relógio do SO.
      # `bigserial` é monotônico de verdade, sem depender de clock. Mesma
      # ideia por trás dos IDs "snowflake" do Discord. Ver Chat.list_messages/2.
      add :seq, :bigserial, primary_key: false

      add :channel_id, references(:channels, type: :binary_id, on_delete: :delete_all),
        null: false

      add :author_id, references(:users, type: :binary_id, on_delete: :nilify_all)
      add :content, :text, null: false
      add :reply_to_id, references(:messages, type: :binary_id, on_delete: :nilify_all)
      add :edited_at, :utc_datetime

      timestamps(type: :utc_datetime)
    end

    create unique_index(:messages, [:seq])
    create index(:messages, [:channel_id, :seq])

    create table(:message_attachments, primary_key: false) do
      add :id, :binary_id, primary_key: true

      add :message_id, references(:messages, type: :binary_id, on_delete: :delete_all),
        null: false

      add :object_key, :string, null: false
      add :filename, :string, null: false
      add :content_type, :string, null: false
      add :size_bytes, :integer, null: false

      timestamps(type: :utc_datetime)
    end

    create table(:message_reactions, primary_key: false) do
      add :id, :binary_id, primary_key: true

      add :message_id, references(:messages, type: :binary_id, on_delete: :delete_all),
        null: false

      add :user_id, references(:users, type: :binary_id, on_delete: :delete_all), null: false
      add :emoji, :string, null: false

      timestamps(type: :utc_datetime)
    end

    create unique_index(:message_reactions, [:message_id, :user_id, :emoji])
  end
end
