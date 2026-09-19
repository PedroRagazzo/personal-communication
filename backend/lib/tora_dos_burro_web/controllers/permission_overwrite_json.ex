defmodule ToraDosBurroWeb.PermissionOverwriteJSON do
  alias ToraDosBurro.Channels.PermissionOverwrite

  def index(%{overwrites: overwrites}),
    do: %{permission_overwrites: Enum.map(overwrites, &data/1)}

  def show(%{overwrite: overwrite}), do: %{permission_overwrite: data(overwrite)}

  def data(%PermissionOverwrite{} = overwrite) do
    %{
      target_type: overwrite.target_type,
      target_id: overwrite.target_id,
      allow: overwrite.allow,
      deny: overwrite.deny
    }
  end
end
