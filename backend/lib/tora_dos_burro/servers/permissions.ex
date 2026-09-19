defmodule ToraDosBurro.Servers.Permissions do
  @moduledoc """
  Bitfield de permissões (estilo Discord): cada permissão é uma potência de
  2, combinadas com OR bit a bit num único inteiro guardado em
  `roles.permissions`. `:administrator` sempre libera tudo. Ver docs/security.md
  — toda checagem acontece no servidor, nunca a partir de uma claim do cliente.
  """

  import Bitwise

  @flags [
    view_channels: 0x1,
    send_messages: 0x2,
    manage_messages: 0x4,
    connect: 0x8,
    speak: 0x10,
    create_invite: 0x20,
    kick_members: 0x40,
    ban_members: 0x80,
    manage_roles: 0x100,
    manage_channels: 0x200,
    manage_server: 0x400,
    administrator: 0x800
  ]

  @doc "Lista de nomes de permissão válidos."
  def names, do: Keyword.keys(@flags)

  @doc "Combina uma lista de nomes de permissão num único bitfield."
  def combine(names) when is_list(names) do
    Enum.reduce(names, 0, fn name, acc -> bor(acc, flag!(name)) end)
  end

  @doc "Permissões padrão de um membro comum (o role `@everyone` do servidor)."
  def default_member_permissions do
    combine([:view_channels, :send_messages, :connect, :speak, :create_invite])
  end

  @doc "Verifica se `bitfield` contém `permission` (ou é administrator)."
  def has?(bitfield, permission) when is_integer(bitfield) and is_atom(permission) do
    flag = flag!(permission)
    (bitfield &&& flag!(:administrator)) == flag!(:administrator) or (bitfield &&& flag) == flag
  end

  defp flag!(name), do: Keyword.fetch!(@flags, name)
end
