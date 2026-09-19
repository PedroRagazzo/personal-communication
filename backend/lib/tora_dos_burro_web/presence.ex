defmodule ToraDosBurroWeb.Presence do
  @moduledoc """
  Fonte da verdade para "quem está em qual sala de voz" e o estado
  mute/deafen de cada um — CRDT replicado no cluster BEAM via PubSub,
  nunca persistido em tabela (ver docs/database.md e docs/realtime.md).
  """

  use Phoenix.Presence,
    otp_app: :tora_dos_burro,
    pubsub_server: ToraDosBurro.PubSub
end
