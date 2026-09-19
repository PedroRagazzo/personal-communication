defmodule ToraDosBurroWeb.ChannelCase do
  @moduledoc """
  This module defines the test case to be used by channel tests
  (`ToraDosBurroWeb.ChatChannel` etc.), backed by Ecto's SQL Sandbox the
  same way `DataCase`/`ConnCase` are.
  """

  use ExUnit.CaseTemplate

  using do
    quote do
      import Phoenix.ChannelTest
      import ToraDosBurroWeb.ChannelCase

      @endpoint ToraDosBurroWeb.Endpoint
    end
  end

  setup tags do
    ToraDosBurro.DataCase.setup_sandbox(tags)
    :ok
  end
end
