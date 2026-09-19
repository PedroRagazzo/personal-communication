defmodule ToraDosBurro.Application do
  # See https://elixir.hexdocs.pm/Application.html
  # for more information on OTP Applications
  @moduledoc false

  use Application

  @impl true
  def start(_type, _args) do
    children = [
      ToraDosBurroWeb.Telemetry,
      ToraDosBurro.Repo,
      {DNSCluster, query: Application.get_env(:tora_dos_burro, :dns_cluster_query) || :ignore},
      {Phoenix.PubSub, name: ToraDosBurro.PubSub},
      ToraDosBurroWeb.Presence,
      # Start a worker by calling: ToraDosBurro.Worker.start_link(arg)
      # {ToraDosBurro.Worker, arg},
      # Start to serve requests, typically the last entry
      ToraDosBurroWeb.Endpoint
    ]

    # See https://elixir.hexdocs.pm/Supervisor.html
    # for other strategies and supported options
    opts = [strategy: :one_for_one, name: ToraDosBurro.Supervisor]
    Supervisor.start_link(children, opts)
  end

  # Tell Phoenix to update the endpoint configuration
  # whenever the application is updated.
  @impl true
  def config_change(changed, _new, removed) do
    ToraDosBurroWeb.Endpoint.config_change(changed, removed)
    :ok
  end
end
