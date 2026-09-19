defmodule ToraDosBurro.Repo.Migrations.CreateCategoriesAndPermissionOverwrites do
  use Ecto.Migration

  @moduledoc """
  FASE 5: categorias de verdade (com FK em `channels.category_id`, que
  existia sem constraint desde a FASE 4) e `permission_overwrites` — a
  peça que faltava para canais privados/públicos e permissões por canal.
  Ver docs/database.md.
  """

  def change do
    create table(:categories, primary_key: false) do
      add :id, :binary_id, primary_key: true
      add :server_id, references(:servers, type: :binary_id, on_delete: :delete_all), null: false
      add :name, :string, null: false
      add :position, :integer, null: false, default: 0

      timestamps(type: :utc_datetime)
    end

    create index(:categories, [:server_id])

    alter table(:channels) do
      modify :category_id, references(:categories, type: :binary_id, on_delete: :nilify_all),
        from: :binary_id
    end

    create table(:permission_overwrites, primary_key: false) do
      add :id, :binary_id, primary_key: true

      add :channel_id, references(:channels, type: :binary_id, on_delete: :delete_all),
        null: false

      add :target_type, :string, null: false
      add :target_id, :binary_id, null: false
      add :allow, :bigint, null: false, default: 0
      add :deny, :bigint, null: false, default: 0

      timestamps(type: :utc_datetime)
    end

    create unique_index(:permission_overwrites, [:channel_id, :target_type, :target_id])
  end
end
