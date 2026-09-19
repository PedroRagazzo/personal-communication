defmodule ToraDosBurro.Channels do
  @moduledoc """
  Contexto de canais: canais, categorias e permissões por canal
  (`permission_overwrites`). `guild_voice` já existe como tipo criável
  nesta fase (estrutura/metadados) — a mecânica de voz de verdade
  (WebRTC, entrar na sala) só chega na FASE 6. Ver docs/roadmap.md.
  """

  import Ecto.Query
  import Bitwise

  alias ToraDosBurro.Accounts.User
  alias ToraDosBurro.Repo
  alias ToraDosBurro.Servers
  alias ToraDosBurro.Servers.{Permissions, Server, ServerMember}
  alias ToraDosBurro.Channels.{Category, Channel, PermissionOverwrite}

  # -- Channels --

  def list_channels(%Server{} = server) do
    Channel
    |> where([c], c.server_id == ^server.id)
    |> order_by([c], asc: c.position, asc: c.inserted_at)
    |> Repo.all()
  end

  def fetch_channel(%Server{} = server, id) do
    case Repo.get_by(Channel, id: id, server_id: server.id) do
      nil -> {:error, :not_found}
      channel -> {:ok, channel}
    end
  end

  def fetch_channel(id) do
    case Repo.get(Channel, id) do
      nil -> {:error, :not_found}
      channel -> {:ok, channel}
    end
  end

  def create_channel(%Server{} = server, attrs) do
    %Channel{server_id: server.id} |> Channel.changeset(attrs) |> Repo.insert()
  end

  def update_channel(%Channel{} = channel, attrs) do
    channel |> Channel.changeset(attrs) |> Repo.update()
  end

  def delete_channel(%Channel{} = channel), do: Repo.delete(channel)

  # -- Categories --

  def list_categories(%Server{} = server) do
    Category
    |> where([c], c.server_id == ^server.id)
    |> order_by([c], asc: c.position, asc: c.inserted_at)
    |> Repo.all()
  end

  def fetch_category(%Server{} = server, id) do
    case Repo.get_by(Category, id: id, server_id: server.id) do
      nil -> {:error, :not_found}
      category -> {:ok, category}
    end
  end

  def create_category(%Server{} = server, attrs) do
    %Category{server_id: server.id} |> Category.changeset(attrs) |> Repo.insert()
  end

  def update_category(%Category{} = category, attrs) do
    category |> Category.changeset(attrs) |> Repo.update()
  end

  def delete_category(%Category{} = category), do: Repo.delete(category)

  # -- Permission overwrites --

  def list_overwrites(%Channel{} = channel) do
    Repo.all(from o in PermissionOverwrite, where: o.channel_id == ^channel.id)
  end

  @doc "Cria ou substitui o overwrite de `target_type`/`target_id` nesse canal."
  def put_overwrite(%Channel{} = channel, attrs) do
    target_type = attrs["target_type"] || attrs[:target_type]
    target_id = attrs["target_id"] || attrs[:target_id]

    case Repo.get_by(PermissionOverwrite,
           channel_id: channel.id,
           target_type: target_type,
           target_id: target_id
         ) do
      nil -> %PermissionOverwrite{channel_id: channel.id}
      existing -> existing
    end
    |> PermissionOverwrite.changeset(attrs)
    |> Repo.insert_or_update()
  end

  def delete_overwrite(%Channel{} = channel, target_type, target_id) do
    case Repo.get_by(PermissionOverwrite,
           channel_id: channel.id,
           target_type: target_type,
           target_id: target_id
         ) do
      nil -> {:error, :not_found}
      overwrite -> Repo.delete(overwrite)
    end
  end

  # -- Autorização por canal --

  @doc """
  Bitfield efetivo do membro *nesse canal*: parte da permissão efetiva do
  servidor (`Servers.effective_permissions/2`) e aplica os
  `permission_overwrites` por cima, na mesma ordem que o Discord usa:
  overwrite de `@everyone` -> overwrite dos outros cargos do membro (OR
  combinado) -> overwrite do membro específico (o que vale por último).
  `administrator` ignora overwrites completamente.
  """
  def channel_permissions(%Server{} = server, %Channel{} = channel, %ServerMember{} = member) do
    base = Servers.effective_permissions(server, member)

    if Permissions.has?(base, :administrator) do
      base
    else
      overwrites = list_overwrites(channel)
      default_role = Servers.default_role(server)
      member = if Ecto.assoc_loaded?(member.roles), do: member, else: Repo.preload(member, :roles)

      base
      |> apply_overwrite(find_overwrite(overwrites, "role", default_role && default_role.id))
      |> apply_role_overwrites(overwrites, Enum.map(member.roles, & &1.id))
      |> apply_overwrite(find_overwrite(overwrites, "member", member.user_id))
    end
  end

  defp find_overwrite(_overwrites, _type, nil), do: nil

  defp find_overwrite(overwrites, type, target_id) do
    Enum.find(overwrites, &(&1.target_type == type and &1.target_id == target_id))
  end

  defp apply_role_overwrites(base, overwrites, role_ids) do
    Enum.reduce(role_ids, base, fn role_id, acc ->
      apply_overwrite(acc, find_overwrite(overwrites, "role", role_id))
    end)
  end

  defp apply_overwrite(base, nil), do: base

  defp apply_overwrite(base, %PermissionOverwrite{allow: allow, deny: deny}) do
    (base &&& bnot(deny)) ||| allow
  end

  @doc "Autoriza `user` a agir em `channel` com `permission`. Dono do servidor sempre passa."
  def authorize(%Channel{} = channel, %User{} = user, permission) do
    with {:ok, server} <- Servers.fetch_server(channel.server_id) do
      cond do
        Servers.owner?(server, user) ->
          :ok

        true ->
          case Servers.fetch_member(server, user) do
            {:ok, member} ->
              perms = channel_permissions(server, channel, member)
              if Permissions.has?(perms, permission), do: :ok, else: {:error, :forbidden}

            {:error, _} ->
              {:error, :forbidden}
          end
      end
    end
  end
end
