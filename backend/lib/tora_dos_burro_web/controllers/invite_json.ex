defmodule ToraDosBurroWeb.InviteJSON do
  alias ToraDosBurro.Servers.Invite

  def show(%{invite: invite}), do: %{invite: data(invite)}

  def data(%Invite{} = invite) do
    %{
      code: invite.code,
      max_uses: invite.max_uses,
      uses: invite.uses,
      expires_at: invite.expires_at,
      server: server_summary(invite.server)
    }
  end

  defp server_summary(%Ecto.Association.NotLoaded{}), do: nil
  defp server_summary(nil), do: nil
  defp server_summary(server), do: %{id: server.id, name: server.name, icon_url: server.icon_url}
end
