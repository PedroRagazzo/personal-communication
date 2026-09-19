defmodule ToraDosBurro.Repo.Migrations.CreateUsers do
  use Ecto.Migration

  def change do
    create table(:users, primary_key: false) do
      add :id, :binary_id, primary_key: true
      add :username, :string, null: false
      add :discriminator, :string, null: false
      add :email, :string, null: false
      add :password_hash, :string, null: false
      add :display_name, :string
      add :avatar_url, :string
      add :status, :string, null: false, default: "offline"
      add :custom_status_text, :string
      add :last_seen_at, :utc_datetime

      timestamps(type: :utc_datetime)
    end

    create unique_index(:users, [:username, :discriminator])
    create unique_index(:users, [:email])
  end
end
