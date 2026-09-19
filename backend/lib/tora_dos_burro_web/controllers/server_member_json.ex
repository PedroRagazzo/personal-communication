defmodule ToraDosBurroWeb.ServerMemberJSON do
  alias ToraDosBurro.Servers.ServerMember

  def index(%{members: members}), do: %{members: Enum.map(members, &data/1)}
  def show(%{member: member}), do: %{member: data(member)}

  def data(%ServerMember{} = member) do
    %{
      id: member.id,
      nickname: member.nickname,
      joined_at: member.joined_at,
      user: %{
        id: member.user.id,
        username: member.user.username,
        discriminator: member.user.discriminator
      },
      roles: Enum.map(member.roles, &%{id: &1.id, name: &1.name})
    }
  end
end
