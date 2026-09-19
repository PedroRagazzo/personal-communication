defmodule ToraDosBurroWeb.BanJSON do
  alias ToraDosBurro.Servers.Ban

  def show(%{ban: ban}), do: %{ban: data(ban)}

  def data(%Ban{} = ban) do
    %{id: ban.id, user_id: ban.user_id, moderator_id: ban.moderator_id, reason: ban.reason}
  end
end
