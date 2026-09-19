defmodule ToraDosBurroWeb.ChannelJSON do
  alias ToraDosBurro.Channels.Channel

  def index(%{channels: channels}), do: %{channels: Enum.map(channels, &data/1)}
  def show(%{channel: channel}), do: %{channel: data(channel)}

  def data(%Channel{} = channel) do
    %{
      id: channel.id,
      name: channel.name,
      topic: channel.topic,
      type: channel.type,
      position: channel.position
    }
  end
end
