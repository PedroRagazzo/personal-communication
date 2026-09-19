defmodule ToraDosBurro.Chat do
  @moduledoc """
  Contexto de chat: mensagens e reações. Mutações em tempo real acontecem
  via `ToraDosBurroWeb.ChatChannel` (que chama este contexto); REST só
  cobre histórico paginado. Ver docs/realtime.md.
  """

  import Ecto.Query

  alias ToraDosBurro.Repo
  alias ToraDosBurro.Accounts.User
  alias ToraDosBurro.Channels.Channel
  alias ToraDosBurro.Chat.{Message, MessageReaction}

  @default_page_size 50
  @max_page_size 100

  @doc """
  Histórico paginado por cursor: `:before` é o id de uma mensagem já vista,
  retorna as `:limit` mensagens anteriores a ela. Sem `:before`, retorna as
  mais recentes. Sempre em ordem cronológica (mais antiga primeiro).
  """
  def list_messages(%Channel{} = channel, opts \\ []) do
    limit = opts |> Keyword.get(:limit, @default_page_size) |> min(@max_page_size)
    before_id = Keyword.get(opts, :before)

    Message
    |> where([m], m.channel_id == ^channel.id)
    |> maybe_before(before_id)
    |> order_by([m], desc: m.seq)
    |> limit(^limit)
    |> preload([:attachments, :reactions])
    |> Repo.all()
    |> Enum.reverse()
  end

  defp maybe_before(query, nil), do: query

  defp maybe_before(query, before_id) do
    case Repo.get(Message, before_id) do
      nil -> query
      %Message{seq: seq} -> where(query, [m], m.seq < ^seq)
    end
  end

  def fetch_message(%Channel{} = channel, id) do
    case Repo.get_by(Message, id: id, channel_id: channel.id) do
      nil -> {:error, :not_found}
      message -> {:ok, Repo.preload(message, [:attachments, :reactions])}
    end
  end

  def create_message(%Channel{} = channel, %User{} = author, attrs) do
    %Message{channel_id: channel.id, author_id: author.id}
    |> Message.create_changeset(attrs)
    |> Repo.insert()
    |> preload_result()
  end

  def update_message(%Message{} = message, attrs) do
    message
    |> Message.update_changeset(attrs)
    |> Repo.update()
    |> preload_result()
  end

  defp preload_result({:ok, message}),
    do: {:ok, Repo.preload(message, [:attachments, :reactions])}

  defp preload_result(error), do: error

  def delete_message(%Message{} = message), do: Repo.delete(message)

  @doc "Idempotente: reagir de novo com o mesmo emoji não dá erro."
  def add_reaction(%Message{} = message, %User{} = user, emoji) do
    %MessageReaction{message_id: message.id, user_id: user.id}
    |> MessageReaction.changeset(%{emoji: emoji})
    |> Repo.insert(on_conflict: :nothing, conflict_target: [:message_id, :user_id, :emoji])
  end

  def remove_reaction(%Message{} = message, %User{} = user, emoji) do
    Repo.delete_all(
      from r in MessageReaction,
        where: r.message_id == ^message.id and r.user_id == ^user.id and r.emoji == ^emoji
    )

    :ok
  end
end
