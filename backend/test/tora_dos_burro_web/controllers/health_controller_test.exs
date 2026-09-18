defmodule ToraDosBurroWeb.HealthControllerTest do
  use ToraDosBurroWeb.ConnCase, async: true

  test "GET /api/v1/health returns status ok", %{conn: conn} do
    conn = get(conn, ~p"/api/v1/health")
    assert json_response(conn, 200) == %{"status" => "ok"}
  end
end
