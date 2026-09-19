defmodule ToraDosBurro.GoLiveTest do
  use ToraDosBurro.DataCase, async: true

  alias ToraDosBurro.{Accounts, Channels, GoLive, Servers}
  alias ToraDosBurro.Servers.Permissions

  defp create_owner_and_server(suffix) do
    {:ok, owner} =
      Accounts.register_user(%{
        "username" => "golive_owner#{suffix}",
        "email" => "golive_owner#{suffix}@example.com",
        "password" => "senha-super-segura"
      })

    {:ok, server} = Servers.create_server(owner, %{"name" => "Servidor #{suffix}"})

    {:ok, channel} =
      Channels.create_channel(server, %{"name" => "Sala 1", "type" => "guild_voice"})

    {owner, server, channel}
  end

  defp add_member(server, suffix) do
    {:ok, user} =
      Accounts.register_user(%{
        "username" => "golive_member#{suffix}",
        "email" => "golive_member#{suffix}@example.com",
        "password" => "senha-super-segura"
      })

    {:ok, member} = Servers.join_server(server, user)
    {user, member}
  end

  describe "watch_stream/2" do
    test "membro comum (tem :connect por padrão) recebe token subscriber-only" do
      {_owner, server, channel} = create_owner_and_server(1)
      {user, _member} = add_member(server, 1)

      assert {:ok, token} = GoLive.watch_stream(channel, user)
      assert {:ok, claims} = Joken.peek_claims(token)

      assert claims["sub"] == user.id
      assert claims["video"]["room"] == "golive-#{channel.id}"
      assert claims["video"]["roomJoin"] == true
      assert claims["video"]["canPublish"] == false
      assert claims["video"]["canSubscribe"] == true
    end
  end

  describe "start_stream/2" do
    test "membro comum (tem :stream por padrão) recebe token publisher" do
      {_owner, server, channel} = create_owner_and_server(2)
      {user, _member} = add_member(server, 2)

      assert {:ok, token} = GoLive.start_stream(channel, user)
      assert {:ok, claims} = Joken.peek_claims(token)

      assert claims["sub"] == user.id
      assert claims["video"]["room"] == "golive-#{channel.id}"
      assert claims["video"]["canPublish"] == true
      assert claims["video"]["canPublishData"] == true
    end

    test "token é assinado com o segredo configurado" do
      {_owner, server, channel} = create_owner_and_server(3)
      {user, _member} = add_member(server, 3)

      assert {:ok, token} = GoLive.start_stream(channel, user)

      config = Application.fetch_env!(:tora_dos_burro, ToraDosBurro.GoLive.LiveKitToken)
      signer = Joken.Signer.create("HS256", Keyword.fetch!(config, :api_secret))
      assert {:ok, _claims} = Joken.Signer.verify(token, signer)
    end

    test "nega quando o overwrite do canal remove :stream do membro", %{} do
      {_owner, server, channel} = create_owner_and_server(4)
      {user, _member} = add_member(server, 4)

      default_role = Servers.default_role(server)

      assert {:ok, _} =
               Channels.put_overwrite(channel, %{
                 "target_type" => "role",
                 "target_id" => default_role.id,
                 "deny" => Permissions.combine([:stream])
               })

      assert {:error, :forbidden} = GoLive.start_stream(channel, user)
    end

    test "dono do servidor sempre pode ir ao vivo, mesmo com deny explícito" do
      {owner, server, channel} = create_owner_and_server(5)
      default_role = Servers.default_role(server)

      assert {:ok, _} =
               Channels.put_overwrite(channel, %{
                 "target_type" => "role",
                 "target_id" => default_role.id,
                 "deny" => Permissions.combine([:stream])
               })

      assert {:ok, _token} = GoLive.start_stream(channel, owner)
    end
  end
end
