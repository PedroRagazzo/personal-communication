defmodule ToraDosBurroWeb.MessageJSON do
  alias ToraDosBurro.Chat.Message

  def index(%{messages: messages}), do: %{messages: Enum.map(messages, &data/1)}
  def show(%{message: message}), do: %{message: data(message)}

  def data(%Message{} = message) do
    %{
      id: message.id,
      channel_id: message.channel_id,
      author_id: message.author_id,
      content: message.content,
      reply_to_id: message.reply_to_id,
      edited_at: message.edited_at,
      inserted_at: message.inserted_at,
      attachments: Enum.map(attachments(message), &attachment_data/1),
      reactions: reaction_summary(message)
    }
  end

  defp attachments(%Message{attachments: %Ecto.Association.NotLoaded{}}), do: []
  defp attachments(%Message{attachments: attachments}), do: attachments

  defp attachment_data(attachment) do
    %{
      id: attachment.id,
      filename: attachment.filename,
      content_type: attachment.content_type,
      size_bytes: attachment.size_bytes
    }
  end

  defp reaction_summary(%Message{reactions: %Ecto.Association.NotLoaded{}}), do: []

  defp reaction_summary(%Message{reactions: reactions}) do
    reactions
    |> Enum.group_by(& &1.emoji)
    |> Enum.map(fn {emoji, list} ->
      %{emoji: emoji, count: length(list), user_ids: Enum.map(list, & &1.user_id)}
    end)
  end
end
