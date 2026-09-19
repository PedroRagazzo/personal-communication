defmodule ToraDosBurro.Repo.Migrations.CreateServers do
  use Ecto.Migration

  def change do
    create table(:servers, primary_key: false) do
      add :id, :binary_id, primary_key: true
      add :name, :string, null: false
      add :icon_url, :string
      add :owner_id, references(:users, type: :binary_id, on_delete: :nilify_all), null: false

      timestamps(type: :utc_datetime)
    end

    create index(:servers, [:owner_id])

    create table(:roles, primary_key: false) do
      add :id, :binary_id, primary_key: true
      add :server_id, references(:servers, type: :binary_id, on_delete: :delete_all), null: false
      add :name, :string, null: false
      add :color, :string
      add :permissions, :bigint, null: false, default: 0
      add :position, :integer, null: false, default: 0
      add :is_default, :boolean, null: false, default: false

      timestamps(type: :utc_datetime)
    end

    create index(:roles, [:server_id])

    create table(:server_members, primary_key: false) do
      add :id, :binary_id, primary_key: true
      add :server_id, references(:servers, type: :binary_id, on_delete: :delete_all), null: false
      add :user_id, references(:users, type: :binary_id, on_delete: :delete_all), null: false
      add :nickname, :string
      add :joined_at, :utc_datetime, null: false
    end

    create unique_index(:server_members, [:server_id, :user_id])
    create index(:server_members, [:user_id])

    create table(:member_roles, primary_key: false) do
      add :server_member_id,
          references(:server_members, type: :binary_id, on_delete: :delete_all),
          null: false

      add :role_id, references(:roles, type: :binary_id, on_delete: :delete_all), null: false
    end

    create unique_index(:member_roles, [:server_member_id, :role_id])

    create table(:invites, primary_key: false) do
      add :id, :binary_id, primary_key: true
      add :code, :string, null: false
      add :server_id, references(:servers, type: :binary_id, on_delete: :delete_all), null: false
      add :creator_id, references(:users, type: :binary_id, on_delete: :nilify_all)
      add :max_uses, :integer
      add :uses, :integer, null: false, default: 0
      add :expires_at, :utc_datetime

      timestamps(type: :utc_datetime)
    end

    create unique_index(:invites, [:code])

    create table(:bans, primary_key: false) do
      add :id, :binary_id, primary_key: true
      add :server_id, references(:servers, type: :binary_id, on_delete: :delete_all), null: false
      add :user_id, references(:users, type: :binary_id, on_delete: :delete_all), null: false
      add :moderator_id, references(:users, type: :binary_id, on_delete: :nilify_all)
      add :reason, :string

      timestamps(type: :utc_datetime)
    end

    create unique_index(:bans, [:server_id, :user_id])
  end
end
