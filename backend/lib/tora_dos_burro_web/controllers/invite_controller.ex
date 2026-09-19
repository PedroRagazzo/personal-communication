defmodule ToraDosBurroWeb.InviteController do
  use ToraDosBurroWeb, :controller

  alias ToraDosBurro.Servers

  action_fallback ToraDosBurroWeb.FallbackController

  def create(conn, %{"server_id" => server_id} = params) do
    user = current_user(conn)
    invite_params = Map.get(params, "invite", %{})

    with {:ok, server} <- Servers.fetch_server(server_id),
         :ok <- Servers.authorize(server, user, :create_invite),
         {:ok, invite} <- Servers.create_invite(server, user, invite_params) do
      conn
      |> put_status(:created)
      |> render(:show, invite: invite)
    end
  end

  @doc "Preview público de um convite — não exige autenticação nem ser membro."
  def show(conn, %{"code" => code}) do
    with {:ok, invite} <- Servers.fetch_invite_by_code(code) do
      render(conn, :show, invite: invite)
    end
  end

  def join(conn, %{"code" => code}) do
    with {:ok, invite} <- Servers.fetch_invite_by_code(code),
         {:ok, server} <- Servers.use_invite(invite, current_user(conn)) do
      conn
      |> put_view(json: ToraDosBurroWeb.ServerJSON)
      |> render(:show, server: server)
    end
  end

  defp current_user(conn), do: Guardian.Plug.current_resource(conn)
end
