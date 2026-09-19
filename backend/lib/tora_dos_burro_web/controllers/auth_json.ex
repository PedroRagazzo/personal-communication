defmodule ToraDosBurroWeb.AuthJSON do
  alias ToraDosBurro.Accounts.User

  def tokens(%{user: user, access_token: access_token, refresh_token: refresh_token}) do
    %{
      access_token: access_token,
      refresh_token: refresh_token,
      user: user_json(user)
    }
  end

  defp user_json(%User{} = user) do
    %{id: user.id, username: user.username, email: user.email, display_name: user.display_name}
  end
end
