defmodule ToraDosBurro.Channels do
  @moduledoc """
  Contexto de canais. Nesta fase só `guild_text`: criação/listagem básica
  para o chat da FASE 4 existir. Categorias, canal de voz de verdade e
  reordenação chegam na FASE 5 — ver docs/roadmap.md.
  """

  import Ecto.Query

  alias ToraDosBurro.Repo
  alias ToraDosBurro.Servers.Server
  alias ToraDosBurro.Channels.Channel

  def list_channels(%Server{} = server) do
    Channel
    |> where([c], c.server_id == ^server.id)
    |> order_by([c], asc: c.position, asc: c.inserted_at)
    |> Repo.all()
  end

  def fetch_channel(%Server{} = server, id) do
    case Repo.get_by(Channel, id: id, server_id: server.id) do
      nil -> {:error, :not_found}
      channel -> {:ok, channel}
    end
  end

  def fetch_channel(id) do
    case Repo.get(Channel, id) do
      nil -> {:error, :not_found}
      channel -> {:ok, channel}
    end
  end

  def create_channel(%Server{} = server, attrs) do
    %Channel{server_id: server.id} |> Channel.changeset(attrs) |> Repo.insert()
  end

  def update_channel(%Channel{} = channel, attrs) do
    channel |> Channel.changeset(attrs) |> Repo.update()
  end

  def delete_channel(%Channel{} = channel), do: Repo.delete(channel)
end
