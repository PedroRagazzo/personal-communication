defmodule ToraDosBurro.Repo.Migrations.CreateGuardianTokens do
  use Ecto.Migration

  @moduledoc """
  Schema padrao exigido pela lib guardian_db para rastrear/revogar tokens
  JWT emitidos pelo Guardian. Ver docs/security.md.
  """

  def change do
    create table(:guardian_tokens, primary_key: false) do
      add :jti, :string, primary_key: true
      add :aud, :string, primary_key: true
      add :typ, :string
      add :iss, :string
      add :sub, :string
      add :exp, :bigint
      add :jwt, :text
      add :claims, :map

      timestamps(type: :utc_datetime)
    end
  end
end
