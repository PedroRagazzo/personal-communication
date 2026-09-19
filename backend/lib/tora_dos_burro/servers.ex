defmodule ToraDosBurro.Servers do
  @moduledoc """
  Contexto de servidores: criação, membros, cargos, convites e banimentos.

  Toda permissão é checada aqui, no servidor — nunca a partir de uma claim
  do cliente (ver docs/security.md). `authorize/3` é o ponto único de
  checagem usado pelos controllers.
  """

  import Ecto.Query

  alias ToraDosBurro.Repo
  alias ToraDosBurro.Accounts.User
  alias ToraDosBurro.Servers.{Ban, Invite, Permissions, Role, Server, ServerMember}

  # -- Servers --

  def fetch_server(id) do
    case Repo.get(Server, id) do
      nil -> {:error, :not_found}
      server -> {:ok, server}
    end
  end

  @doc """
  Cria o servidor, o cargo padrão `@everyone` e já entra o dono como membro
  — as três coisas numa transação só.
  """
  def create_server(%User{} = owner, attrs) do
    Repo.transaction(fn ->
      with {:ok, server} <-
             %Server{owner_id: owner.id} |> Server.changeset(attrs) |> Repo.insert(),
           {:ok, _default_role} <- create_default_role(server),
           {:ok, _member} <- do_add_member(server, owner) do
        server
      else
        {:error, reason} -> Repo.rollback(reason)
      end
    end)
  end

  defp create_default_role(%Server{} = server) do
    %Role{server_id: server.id, is_default: true}
    |> Role.changeset(%{
      name: "@everyone",
      permissions: Permissions.default_member_permissions()
    })
    |> Repo.insert()
  end

  def update_server(%Server{} = server, attrs) do
    server |> Server.changeset(attrs) |> Repo.update()
  end

  def delete_server(%Server{} = server), do: Repo.delete(server)

  # -- Membership --

  def list_members(%Server{} = server) do
    ServerMember
    |> where([m], m.server_id == ^server.id)
    |> preload([:user, :roles])
    |> Repo.all()
  end

  def get_member(%Server{} = server, %User{} = user) do
    case Repo.get_by(ServerMember, server_id: server.id, user_id: user.id) do
      nil -> nil
      member -> Repo.preload(member, [:user, :roles])
    end
  end

  def fetch_member(%Server{} = server, %User{} = user) do
    case get_member(server, user) do
      nil -> {:error, :not_member}
      member -> {:ok, member}
    end
  end

  def join_server(%Server{} = server, %User{} = user) do
    cond do
      banned?(server, user) -> {:error, :banned}
      get_member(server, user) -> {:error, :already_member}
      true -> do_add_member(server, user)
    end
  end

  defp do_add_member(%Server{} = server, %User{} = user) do
    %ServerMember{
      server_id: server.id,
      user_id: user.id,
      joined_at: DateTime.utc_now() |> DateTime.truncate(:second)
    }
    |> Repo.insert()
  end

  def leave_server(%Server{owner_id: owner_id}, %User{id: owner_id}) do
    {:error, :owner_cannot_leave}
  end

  def leave_server(%Server{} = server, %User{} = user) do
    case get_member(server, user) do
      nil -> {:error, :not_member}
      member -> Repo.delete(member)
    end
  end

  def remove_member(%ServerMember{} = member), do: Repo.delete(member)

  # -- Roles --

  def list_roles(%Server{} = server) do
    Role
    |> where([r], r.server_id == ^server.id)
    |> order_by([r], asc: r.position)
    |> Repo.all()
  end

  def fetch_role(%Server{} = server, id) do
    case Repo.get_by(Role, id: id, server_id: server.id) do
      nil -> {:error, :not_found}
      role -> {:ok, role}
    end
  end

  def create_role(%Server{} = server, attrs) do
    %Role{server_id: server.id} |> Role.changeset(attrs) |> Repo.insert()
  end

  def update_role(%Role{} = role, attrs) do
    role |> Role.changeset(attrs) |> Repo.update()
  end

  def delete_role(%Role{is_default: true}), do: {:error, :cannot_delete_default_role}
  def delete_role(%Role{} = role), do: Repo.delete(role)

  def assign_role(%ServerMember{} = member, %Role{} = role) do
    member = Repo.preload(member, :roles)

    member
    |> Ecto.Changeset.change()
    |> Ecto.Changeset.put_assoc(:roles, Enum.uniq_by([role | member.roles], & &1.id))
    |> Repo.update()
  end

  def remove_role(%ServerMember{} = member, %Role{} = role) do
    member = Repo.preload(member, :roles)

    member
    |> Ecto.Changeset.change()
    |> Ecto.Changeset.put_assoc(:roles, Enum.reject(member.roles, &(&1.id == role.id)))
    |> Repo.update()
  end

  # -- Permissions --

  def owner?(%Server{} = server, %User{} = user), do: server.owner_id == user.id

  @doc "O cargo `@everyone` do servidor — sempre existe, criado junto com o servidor."
  def default_role(%Server{} = server) do
    Repo.get_by(Role, server_id: server.id, is_default: true)
  end

  @doc """
  Bitfield efetivo de permissões do membro: cargo padrão `@everyone` + cargos
  extras combinados via OR bit a bit. O dono do servidor tem acesso total
  independente de cargo (ver `authorize/3`, não passa por aqui).
  """
  def effective_permissions(%Server{} = server, %ServerMember{} = member) do
    member = if Ecto.assoc_loaded?(member.roles), do: member, else: Repo.preload(member, :roles)

    [default_role(server) | member.roles]
    |> Enum.reject(&is_nil/1)
    |> Enum.reduce(0, fn role, acc -> Bitwise.bor(acc, role.permissions) end)
  end

  @doc "Autoriza `user` a agir em `server` com `permission`. Dono sempre passa."
  def authorize(%Server{} = server, %User{} = user, permission) do
    if owner?(server, user) do
      :ok
    else
      case fetch_member(server, user) do
        {:ok, member} ->
          if Permissions.has?(effective_permissions(server, member), permission),
            do: :ok,
            else: {:error, :forbidden}

        {:error, _} ->
          {:error, :forbidden}
      end
    end
  end

  # -- Invites --

  def create_invite(%Server{} = server, %User{} = creator, attrs) do
    %Invite{server_id: server.id, creator_id: creator.id}
    |> Invite.changeset(attrs)
    |> Repo.insert()
  end

  def fetch_invite_by_code(code) do
    case Repo.get_by(Invite, code: code) do
      nil -> {:error, :not_found}
      invite -> {:ok, Repo.preload(invite, :server)}
    end
  end

  @doc "Resgata um convite: valida validade/limite de usos e entra o usuário no servidor."
  def use_invite(%Invite{} = invite, %User{} = user) do
    cond do
      expired?(invite) ->
        {:error, :expired}

      invite.max_uses && invite.uses >= invite.max_uses ->
        {:error, :max_uses_reached}

      true ->
        Repo.transaction(fn ->
          with {:ok, server} <- fetch_server(invite.server_id),
               {:ok, _member} <- join_server(server, user),
               {:ok, _invite} <- Repo.update(Ecto.Changeset.change(invite, uses: invite.uses + 1)) do
            server
          else
            {:error, reason} -> Repo.rollback(reason)
          end
        end)
    end
  end

  defp expired?(%Invite{expires_at: nil}), do: false

  defp expired?(%Invite{expires_at: expires_at}),
    do: DateTime.compare(DateTime.utc_now(), expires_at) == :gt

  # -- Bans --

  def banned?(%Server{} = server, %User{} = user) do
    Repo.exists?(from b in Ban, where: b.server_id == ^server.id and b.user_id == ^user.id)
  end

  @doc "Bane o usuário (e expulsa, se ele for membro) numa transação só."
  def create_ban(%Server{} = server, %User{} = moderator, %User{} = user, attrs \\ %{}) do
    Repo.transaction(fn ->
      with {:ok, ban} <-
             %Ban{server_id: server.id, user_id: user.id, moderator_id: moderator.id}
             |> Ban.changeset(attrs)
             |> Repo.insert() do
        case get_member(server, user) do
          nil -> :ok
          member -> Repo.delete(member)
        end

        ban
      else
        {:error, reason} -> Repo.rollback(reason)
      end
    end)
  end

  def remove_ban(%Server{} = server, %User{} = user) do
    case Repo.get_by(Ban, server_id: server.id, user_id: user.id) do
      nil -> {:error, :not_found}
      ban -> Repo.delete(ban)
    end
  end
end
