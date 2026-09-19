defmodule ToraDosBurroWeb.UserController do
  use ToraDosBurroWeb, :controller

  def me(conn, _params) do
    user = Guardian.Plug.current_resource(conn)

    json(conn, %{
      id: user.id,
      username: user.username,
      discriminator: user.discriminator,
      email: user.email,
      display_name: user.display_name,
      status: user.status
    })
  end
end
