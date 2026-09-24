defmodule ToraDosBurro.Release do
  @moduledoc """
  Used for executing DB release tasks when run in production without Mix
  installed.
  """
  @app :tora_dos_burro

  import Ecto.Query

  alias ToraDosBurro.Accounts.User
  alias ToraDosBurro.Repo
  alias ToraDosBurro.Servers
  alias ToraDosBurro.Servers.Server

  @doc """
  Apaga todas as contas menos uma — pedido do usuário pra limpar as contas
  de teste acumuladas em produção. `keep` é `"usuario#1234"` ou só o
  discriminator (`"1234"`, precisa bater com exatamente uma conta).

  Servidores das contas apagadas passam pra conta mantida antes do delete:
  `servers.owner_id` é NOT NULL (apesar do `on_delete: :nilify_all`), então
  apagar um dono sem isso faz o banco recusar o DELETE inteiro. Mensagens
  das contas apagadas ficam, sem autor (`author_id` nilify).

  Sem `confirm: true` só mostra o que faria. Em produção não existe `mix`
  no container (só o release), então roda via `eval`:

      /app/bin/tora_dos_burro eval 'ToraDosBurro.Release.wipe_users_except("6983")'
      /app/bin/tora_dos_burro eval 'ToraDosBurro.Release.wipe_users_except("6983", confirm: true)'
  """
  def wipe_users_except(keep, opts \\ []) do
    load_app()
    confirm? = Keyword.get(opts, :confirm, false)

    {:ok, result, _} =
      Ecto.Migrator.with_repo(Repo, fn _ -> do_wipe_users_except(keep, confirm?) end)

    result
  end

  defp do_wipe_users_except(keep, confirm?) do
    with {:ok, keeper} <- find_keeper(keep) do
      doomed = Repo.all(from u in User, where: u.id != ^keeper.id, order_by: u.inserted_at)
      doomed_ids = Enum.map(doomed, & &1.id)
      servers = Repo.all(from s in Server, where: s.owner_id in ^doomed_ids)

      IO.puts("Fica: #{tag(keeper)}")
      IO.puts("Saem (#{length(doomed)}): #{Enum.map_join(doomed, ", ", &tag/1)}")
      IO.puts("Servidores que passam pra #{tag(keeper)}: #{server_names(servers)}")

      if confirm? do
        apply_wipe(keeper, doomed_ids, servers)
      else
        IO.puts("Simulação — nada foi alterado. Rode de novo com confirm: true pra apagar.")
        {:dry_run, length(doomed)}
      end
    end
  end

  defp apply_wipe(keeper, doomed_ids, servers) do
    result =
      Repo.transaction(fn ->
        Repo.update_all(from(s in Server, where: s.owner_id in ^doomed_ids),
          set: [owner_id: keeper.id]
        )

        for server <- servers do
          case Servers.join_server(server, keeper) do
            {:ok, _} -> :ok
            {:error, :already_member} -> :ok
            {:error, reason} -> Repo.rollback({server.name, reason})
          end
        end

        {count, _} = Repo.delete_all(from u in User, where: u.id in ^doomed_ids)
        count
      end)

    case result do
      {:ok, count} ->
        IO.puts("Pronto: #{count} conta(s) apagada(s). Mensagens delas continuam, sem autor.")
        {:ok, count}

      {:error, {server_name, reason}} ->
        IO.puts(
          "Nada foi alterado: não deu pra pôr #{tag(keeper)} em #{server_name} (#{reason})."
        )

        {:error, reason}
    end
  end

  defp find_keeper(keep) do
    query =
      case String.split(keep, "#", parts: 2) do
        [username, discriminator] ->
          from u in User, where: u.username == ^username and u.discriminator == ^discriminator

        [discriminator] ->
          from u in User, where: u.discriminator == ^discriminator
      end

    case Repo.all(query) do
      [user] ->
        {:ok, user}

      [] ->
        IO.puts("Nenhuma conta encontrada pra #{keep} — nada foi alterado.")
        {:error, :not_found}

      users ->
        IO.puts(
          "Mais de uma conta bate com #{keep} (#{Enum.map_join(users, ", ", &tag/1)}) — " <>
            "use usuario#numero. Nada foi alterado."
        )

        {:error, :ambiguous}
    end
  end

  defp tag(%User{username: username, discriminator: discriminator}),
    do: "#{username}##{discriminator}"

  defp server_names([]), do: "nenhum"
  defp server_names(servers), do: Enum.map_join(servers, ", ", & &1.name)

  def migrate do
    load_app()

    for repo <- repos() do
      {:ok, _, _} = Ecto.Migrator.with_repo(repo, &Ecto.Migrator.run(&1, :up, all: true))
    end
  end

  def rollback(repo, version) do
    load_app()
    {:ok, _, _} = Ecto.Migrator.with_repo(repo, &Ecto.Migrator.run(&1, :down, to: version))
  end

  defp repos do
    Application.fetch_env!(@app, :ecto_repos)
  end

  defp load_app do
    # Many platforms require SSL when connecting to the database
    Application.ensure_all_started(:ssl)
    Application.ensure_loaded(@app)
  end
end
