defmodule ToraDosBurroWeb.RoleJSON do
  alias ToraDosBurro.Servers.Role

  def index(%{roles: roles}), do: %{roles: Enum.map(roles, &data/1)}
  def show(%{role: role}), do: %{role: data(role)}

  def data(%Role{} = role) do
    %{
      id: role.id,
      name: role.name,
      color: role.color,
      permissions: role.permissions,
      position: role.position,
      is_default: role.is_default
    }
  end
end
