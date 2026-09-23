defmodule Mix.Tasks.WipeAllUsers do
  @moduledoc """
  Apaga TODOS os usuários do banco — ação única, pedida explicitamente
  pelo usuário (incluindo a própria conta dele), com backup antes.

  Pelas regras de FK (`priv/repo/migrations/20260919003227_create_servers.exs`):
  - `server_members`, `message_reactions`: `on_delete: :delete_all` — somem junto.
  - `servers.owner_id`, `messages.author_id`, `bans.moderator_id`, etc.:
    `on_delete: :nilify_all` — as linhas continuam, só ficam sem dono/autor.
  Ou seja: servidores e mensagens SOBREVIVEM (órfãos), só as contas em si
  (e o vínculo de quem é membro de quê) desaparecem.

  Backup em duas camadas, nessa ordem:
  1. `pg_dump` do banco inteiro, se o binário existir no container (best
     effort — a imagem de release não tem garantia de trazer client tools
     de Postgres; se faltar, avisa e segue só com a camada 2, não trava).
  2. Um JSON com id/username/discriminator/email/display_name/inserted_at
     de cada usuário (sem `password_hash` — não tem valor nenhum num
     manifesto de leitura, só aumentaria a exposição de algo sensível à toa).

  Uso (exige a flag, não roda por acidente):

      mix wipe_all_users --confirm

  Os arquivos de backup ficam no filesystem do container — copie pra fora
  (ex.: `docker cp`, ou a própria função de backup do Dokploy pro Postgres
  gerenciado, se existir) antes de qualquer redeploy, já que o filesystem
  do container não é garantido persistir entre deploys.
  """
  use Mix.Task
  alias ToraDosBurro.Accounts.User
  alias ToraDosBurro.Repo

  @shortdoc "Apaga todos os usuários do banco (com backup antes) — requer --confirm"

  @impl Mix.Task
  def run(args) do
    unless "--confirm" in args do
      Mix.raise("""
      Isso apaga TODOS os usuários do banco. Rode de novo com --confirm \
      só quando tiver certeza:

          mix wipe_all_users --confirm
      """)
    end

    Mix.Task.run("app.start")

    users = Repo.all(User)
    count = length(users)
    Mix.shell().info("#{count} usuário(s) encontrado(s) antes de apagar.")

    timestamp = DateTime.utc_now() |> DateTime.to_iso8601() |> String.replace(~r/[:.]/, "-")

    pg_dump_backup(timestamp)
    json_backup(users, timestamp)

    {deleted, _} = Repo.delete_all(User)
    Mix.shell().info("Pronto: #{deleted} usuário(s) apagado(s).")
  end

  defp pg_dump_backup(timestamp) do
    path = Path.join(System.tmp_dir!(), "tora_backup_#{timestamp}.sql")

    case System.fetch_env("DATABASE_URL") do
      {:ok, database_url} ->
        case System.cmd("pg_dump", [database_url, "-f", path], stderr_to_stdout: true) do
          {_output, 0} ->
            Mix.shell().info("Backup completo (pg_dump) salvo em #{path}")

          {output, _code} ->
            Mix.shell().error("pg_dump falhou, seguindo só com o backup em JSON:\n#{output}")
        end

      :error ->
        Mix.shell().error("DATABASE_URL não encontrado, pulando pg_dump.")
    end
  rescue
    e in ErlangError ->
      Mix.shell().error(
        "pg_dump não disponível nesse container (#{Exception.message(e)}), seguindo só com o backup em JSON."
      )
  end

  defp json_backup(users, timestamp) do
    path = Path.join(System.tmp_dir!(), "tora_users_backup_#{timestamp}.json")

    data =
      Enum.map(users, fn u ->
        %{
          id: u.id,
          username: u.username,
          discriminator: u.discriminator,
          email: u.email,
          display_name: u.display_name,
          inserted_at: u.inserted_at
        }
      end)

    File.write!(path, Jason.encode!(data, pretty: true))
    Mix.shell().info("Manifesto (sem senha) salvo em #{path}")
  end
end
