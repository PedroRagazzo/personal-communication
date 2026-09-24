defmodule ToraDosBurro.ReleaseTest do
  use ToraDosBurro.DataCase, async: true

  import ExUnit.CaptureIO

  alias ToraDosBurro.{Accounts, Channels, Chat, Release, Repo, Servers}
  alias ToraDosBurro.Accounts.User
  alias ToraDosBurro.Chat.Message
  alias ToraDosBurro.Servers.Server

  setup do
    {:ok, owner} = register("dono")
    {:ok, keeper} = register("fica")
    {:ok, other} = register("outro")
    {:ok, stranger} = register("estranho")

    {:ok, server} = Servers.create_server(owner, %{"name" => "TORA DOS BURRO"})
    {:ok, _} = Servers.join_server(server, keeper)
    {:ok, _} = Servers.join_server(server, other)

    # Servidor de um terceiro em que a conta mantida nem é membro.
    {:ok, stranger_server} = Servers.create_server(stranger, %{"name" => "servidor-de-teste"})

    {:ok, channel} = Channels.create_channel(server, %{"name" => "geral"})
    {:ok, message} = Chat.create_message(channel, owner, %{"content" => "oi"})

    %{
      owner: owner,
      keeper: keeper,
      server: server,
      stranger_server: stranger_server,
      message: message
    }
  end

  defp register(username) do
    Accounts.register_user(%{"username" => username, "password" => "senha-super-segura"})
  end

  defp wipe(keep, opts \\ []) do
    with_io(fn -> Release.wipe_users_except(keep, opts) end)
  end

  test "sem confirm: true só simula, não muda nada", %{keeper: keeper} do
    {result, output} = wipe(keeper.discriminator)

    assert result == {:dry_run, 3}
    assert output =~ "Fica: fica##{keeper.discriminator}"
    assert output =~ "TORA DOS BURRO"
    assert Repo.aggregate(User, :count) == 4
  end

  test "apaga todo mundo menos a conta mantida, que herda os servidores", %{
    keeper: keeper,
    server: server,
    stranger_server: stranger_server,
    message: message
  } do
    {result, _output} = wipe(keeper.discriminator, confirm: true)

    assert result == {:ok, 3}
    assert [%User{id: kept_id}] = Repo.all(User)
    assert kept_id == keeper.id

    assert Repo.get!(Server, server.id).owner_id == keeper.id
    assert Repo.get!(Server, stranger_server.id).owner_id == keeper.id
    assert {:ok, _} = Servers.fetch_member(Repo.get!(Server, stranger_server.id), keeper)

    assert %Message{author_id: nil, content: "oi"} = Repo.get!(Message, message.id)
  end

  test "aceita usuario#numero também", %{keeper: keeper} do
    {result, _output} = wipe("fica##{keeper.discriminator}", confirm: true)
    assert result == {:ok, 3}
  end

  test "conta não encontrada não muda nada" do
    {result, output} = wipe("0000", confirm: true)

    assert result == {:error, :not_found}
    assert output =~ "nada foi alterado"
    assert Repo.aggregate(User, :count) == 4
  end

  test "discriminator repetido entre usernames diferentes pede usuario#numero", %{
    owner: owner,
    keeper: keeper
  } do
    Repo.update_all(from(u in User, where: u.id == ^owner.id),
      set: [discriminator: keeper.discriminator]
    )

    {result, output} = wipe(keeper.discriminator, confirm: true)

    assert result == {:error, :ambiguous}
    assert output =~ "usuario#numero"
    assert Repo.aggregate(User, :count) == 4
  end
end
