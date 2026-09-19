defmodule ToraDosBurroWeb.VoiceChannelTest do
  use ToraDosBurroWeb.ChannelCase, async: true

  alias ToraDosBurro.{Accounts, Channels, Guardian, Servers}

  setup do
    {:ok, owner} = register("voiceowner")
    {:ok, other} = register("voiceother")
    {:ok, stranger} = register("voicestranger")

    {:ok, server} = Servers.create_server(owner, %{"name" => "Servidor"})
    {:ok, _member} = Servers.join_server(server, other)

    {:ok, voice_channel} =
      Channels.create_channel(server, %{"name" => "Sala 1", "type" => "guild_voice"})

    {:ok, text_channel} = Channels.create_channel(server, %{"name" => "geral"})

    %{
      owner: owner,
      other: other,
      stranger: stranger,
      server: server,
      voice_channel: voice_channel,
      text_channel: text_channel
    }
  end

  defp register(username) do
    Accounts.register_user(%{
      "username" => username,
      "email" => "#{username}@example.com",
      "password" => "senha-super-segura"
    })
  end

  defp connect_as(user) do
    {:ok, token, _claims} = Guardian.encode_and_sign(user, %{}, token_type: "access")
    {:ok, socket} = connect(ToraDosBurroWeb.UserSocket, %{"token" => token})
    socket
  end

  test "membro entra, e quem entra depois ve quem ja estava no presence_state", %{
    owner: owner,
    other: other,
    voice_channel: channel
  } do
    owner_id = owner.id
    other_id = other.id

    owner_socket = connect_as(owner)
    {:ok, _, _owner_voice} = subscribe_and_join(owner_socket, "voice:#{channel.id}", %{})
    assert_push "presence_state", %{^owner_id => _}

    other_socket = connect_as(other)
    {:ok, _, _other_voice} = subscribe_and_join(other_socket, "voice:#{channel.id}", %{})
    assert_push "presence_state", %{^owner_id => _, ^other_id => _}
  end

  test "canal de texto não aceita join em voice:", %{owner: owner, text_channel: channel} do
    owner_socket = connect_as(owner)

    assert {:error, %{reason: "forbidden"}} =
             subscribe_and_join(owner_socket, "voice:#{channel.id}", %{})
  end

  test "quem não é membro do servidor não consegue entrar", %{
    stranger: stranger,
    voice_channel: channel
  } do
    stranger_socket = connect_as(stranger)

    assert {:error, %{reason: "forbidden"}} =
             subscribe_and_join(stranger_socket, "voice:#{channel.id}", %{})
  end

  test "sdp offer é retransmitido só para os outros, com from/to corretos", %{
    owner: owner,
    other: other,
    voice_channel: channel
  } do
    owner_id = owner.id
    other_id = other.id

    owner_socket = connect_as(owner)
    {:ok, _, owner_voice} = subscribe_and_join(owner_socket, "voice:#{channel.id}", %{})

    other_socket = connect_as(other)
    {:ok, _, _other_voice} = subscribe_and_join(other_socket, "voice:#{channel.id}", %{})

    push(owner_voice, "sdp:offer", %{"to" => other_id, "sdp" => "fake-sdp-offer"})

    assert_broadcast "sdp:offer", %{to: ^other_id, from: ^owner_id, sdp: "fake-sdp-offer"}
  end

  test "ice candidate é retransmitido", %{owner: owner, other: other, voice_channel: channel} do
    owner_id = owner.id
    other_id = other.id

    owner_socket = connect_as(owner)
    {:ok, _, owner_voice} = subscribe_and_join(owner_socket, "voice:#{channel.id}", %{})

    other_socket = connect_as(other)
    {:ok, _, _other_voice} = subscribe_and_join(other_socket, "voice:#{channel.id}", %{})

    push(owner_voice, "ice:candidate", %{"to" => other_id, "candidate" => "fake-candidate"})

    assert_broadcast "ice:candidate", %{
      to: ^other_id,
      from: ^owner_id,
      candidate: "fake-candidate"
    }
  end

  test "mudar mute/deafen atualiza a metadata de presença", %{
    owner: owner,
    other: other,
    voice_channel: channel
  } do
    owner_id = owner.id

    owner_socket = connect_as(owner)
    {:ok, _, owner_voice} = subscribe_and_join(owner_socket, "voice:#{channel.id}", %{})

    other_socket = connect_as(other)
    {:ok, _, _other_voice} = subscribe_and_join(other_socket, "voice:#{channel.id}", %{})

    push(owner_voice, "state:update", %{"muted" => true, "deafened" => false})

    assert_broadcast "presence_diff", %{joins: %{^owner_id => %{metas: [%{muted: true}]}}}
  end

  test "sair remove da presença", %{owner: owner, other: other, voice_channel: channel} do
    Process.flag(:trap_exit, true)
    owner_id = owner.id

    owner_socket = connect_as(owner)
    {:ok, _, owner_voice} = subscribe_and_join(owner_socket, "voice:#{channel.id}", %{})

    other_socket = connect_as(other)
    {:ok, _, _other_voice} = subscribe_and_join(other_socket, "voice:#{channel.id}", %{})

    close(owner_voice)

    assert_broadcast "presence_diff", %{leaves: %{^owner_id => _}}
  end

  describe "vídeo (FASE 7)" do
    test "habilitar e desabilitar vídeo atualiza a metadata de presença", %{
      owner: owner,
      other: other,
      voice_channel: channel
    } do
      owner_id = owner.id

      owner_socket = connect_as(owner)
      {:ok, _, owner_voice} = subscribe_and_join(owner_socket, "voice:#{channel.id}", %{})

      other_socket = connect_as(other)
      {:ok, _, _other_voice} = subscribe_and_join(other_socket, "voice:#{channel.id}", %{})

      ref = push(owner_voice, "video:enable", %{})
      assert_reply ref, :ok
      assert_broadcast "presence_diff", %{joins: %{^owner_id => %{metas: [%{video: true}]}}}

      ref2 = push(owner_voice, "video:disable", %{})
      assert_reply ref2, :ok
      assert_broadcast "presence_diff", %{joins: %{^owner_id => %{metas: [%{video: false}]}}}
    end

    test "quinto participante não consegue habilitar vídeo quando já há 4", %{
      owner: owner,
      server: server,
      voice_channel: channel
    } do
      members =
        for suffix <- ["m1", "m2", "m3"] do
          {:ok, user} = register("videocap#{suffix}")
          {:ok, _} = Servers.join_server(server, user)
          user
        end

      voices =
        Enum.map([owner | members], fn user ->
          socket = connect_as(user)
          {:ok, _, voice} = subscribe_and_join(socket, "voice:#{channel.id}", %{})
          voice
        end)

      Enum.each(voices, fn voice ->
        ref = push(voice, "video:enable", %{})
        assert_reply ref, :ok
      end)

      {:ok, fifth_user} = register("videocapm4")
      {:ok, _} = Servers.join_server(server, fifth_user)
      fifth_socket = connect_as(fifth_user)
      {:ok, _, fifth_voice} = subscribe_and_join(fifth_socket, "voice:#{channel.id}", %{})

      ref = push(fifth_voice, "video:enable", %{})
      assert_reply ref, :error, %{reason: "video_limit_reached"}
    end

    test "reenviar video:enable pra quem já tem vídeo não conta em dobro (idempotente)", %{
      owner: owner,
      server: server,
      voice_channel: channel
    } do
      members =
        for suffix <- ["idm1", "idm2", "idm3"] do
          {:ok, user} = register("videoidem#{suffix}")
          {:ok, _} = Servers.join_server(server, user)
          user
        end

      voices =
        Enum.map([owner | members], fn user ->
          socket = connect_as(user)
          {:ok, _, voice} = subscribe_and_join(socket, "voice:#{channel.id}", %{})
          voice
        end)

      Enum.each(voices, fn voice ->
        ref = push(voice, "video:enable", %{})
        assert_reply ref, :ok
      end)

      [owner_voice | _] = voices
      ref = push(owner_voice, "video:enable", %{})
      assert_reply ref, :ok
    end
  end

  describe "compartilhamento de tela (FASE 8)" do
    test "primeiro a compartilhar consegue, e aparece na presença", %{
      owner: owner,
      other: other,
      voice_channel: channel
    } do
      owner_id = owner.id

      owner_socket = connect_as(owner)
      {:ok, _, owner_voice} = subscribe_and_join(owner_socket, "voice:#{channel.id}", %{})

      other_socket = connect_as(other)
      {:ok, _, _other_voice} = subscribe_and_join(other_socket, "voice:#{channel.id}", %{})

      ref = push(owner_voice, "screen_share:start", %{})
      assert_reply ref, :ok

      assert_broadcast "presence_diff",
                       %{joins: %{^owner_id => %{metas: [%{screen_sharing: true}]}}}
    end

    test "segunda pessoa não consegue compartilhar enquanto a primeira ainda está", %{
      owner: owner,
      other: other,
      voice_channel: channel
    } do
      owner_socket = connect_as(owner)
      {:ok, _, owner_voice} = subscribe_and_join(owner_socket, "voice:#{channel.id}", %{})

      other_socket = connect_as(other)
      {:ok, _, other_voice} = subscribe_and_join(other_socket, "voice:#{channel.id}", %{})

      ref = push(owner_voice, "screen_share:start", %{})
      assert_reply ref, :ok

      ref2 = push(other_voice, "screen_share:start", %{})
      assert_reply ref2, :error, %{reason: "screen_share_in_use"}
    end

    test "reenviar screen_share:start pra quem já está compartilhando é idempotente", %{
      owner: owner,
      other: other,
      voice_channel: channel
    } do
      owner_socket = connect_as(owner)
      {:ok, _, owner_voice} = subscribe_and_join(owner_socket, "voice:#{channel.id}", %{})

      other_socket = connect_as(other)
      {:ok, _, _other_voice} = subscribe_and_join(other_socket, "voice:#{channel.id}", %{})

      ref = push(owner_voice, "screen_share:start", %{})
      assert_reply ref, :ok

      ref2 = push(owner_voice, "screen_share:start", %{})
      assert_reply ref2, :ok
    end

    test "parar libera para outra pessoa compartilhar", %{
      owner: owner,
      other: other,
      voice_channel: channel
    } do
      owner_socket = connect_as(owner)
      {:ok, _, owner_voice} = subscribe_and_join(owner_socket, "voice:#{channel.id}", %{})

      other_socket = connect_as(other)
      {:ok, _, other_voice} = subscribe_and_join(other_socket, "voice:#{channel.id}", %{})

      ref = push(owner_voice, "screen_share:start", %{})
      assert_reply ref, :ok

      ref2 = push(owner_voice, "screen_share:stop", %{})
      assert_reply ref2, :ok

      ref3 = push(other_voice, "screen_share:start", %{})
      assert_reply ref3, :ok
    end
  end
end
