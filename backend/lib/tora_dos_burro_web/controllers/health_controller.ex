defmodule ToraDosBurroWeb.HealthController do
  use ToraDosBurroWeb, :controller

  def index(conn, _params) do
    json(conn, %{status: "ok"})
  end
end
