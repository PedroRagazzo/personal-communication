import { useEffect, useState } from 'react'
import { useAuthStore } from '../stores/authStore'
import { useServersStore } from '../stores/serversStore'
import { useVoiceStore } from '../stores/voiceStore'
import { useGoLiveStore } from '../stores/goLiveStore'
import { useSettingsStore } from '../stores/settingsStore'
import { usePresenceStore } from '../stores/presenceStore'
import { ServerSidebar } from '../components/ServerSidebar'
import { ChannelList } from '../components/ChannelList'
import { ChatView } from '../components/ChatView'
import { VoicePanel } from '../components/VoicePanel'
import { SettingsModal } from '../components/SettingsModal'
import { MemberList } from '../components/MemberList'

// Shell autenticado: navegação entre servidores/canais (fatia 2), chat em
// tempo real (fatia 3), voz (fatia 4). Vídeo/tela/Go Live no cliente ainda
// faltam.
export function HomePage() {
  const user = useAuthStore((s) => s.user)
  const accessToken = useAuthStore((s) => s.accessToken)
  const logout = useAuthStore((s) => s.logout)

  const servers = useServersStore((s) => s.servers)
  const selectedServerId = useServersStore((s) => s.selectedServerId)
  const channels = useServersStore((s) => s.channels)
  const members = useServersStore((s) => s.members)
  const selectedChannelId = useServersStore((s) => s.selectedChannelId)
  const serversError = useServersStore((s) => s.error)
  const loadServers = useServersStore((s) => s.loadServers)
  const selectServer = useServersStore((s) => s.selectServer)
  const selectChannel = useServersStore((s) => s.selectChannel)
  const createChannel = useServersStore((s) => s.createChannel)
  const joinServer = useServersStore((s) => s.joinServer)

  const voiceChannelId = useVoiceStore((s) => s.channelId)
  const voiceStatus = useVoiceStore((s) => s.status)
  const voiceParticipants = useVoiceStore((s) => s.participants)
  const speakingUserIds = useVoiceStore((s) => s.speakingUserIds)
  const joinVoice = useVoiceStore((s) => s.join)
  const toggleMute = useVoiceStore((s) => s.toggleMute)
  const toggleDeafen = useVoiceStore((s) => s.toggleDeafen)
  const joinGoLive = useGoLiveStore((s) => s.join)

  const loadSettingsForUser = useSettingsStore((s) => s.loadForUser)
  const [settingsOpen, setSettingsOpen] = useState(false)

  const onlineUserIds = usePresenceStore((s) => s.onlineUserIds)
  const joinPresence = usePresenceStore((s) => s.join)

  useEffect(() => {
    if (accessToken) loadServers(accessToken)
  }, [accessToken, loadServers])

  // Presença de "quem está online" é por servidor (server:{id}, ver
  // presenceStore.ts) — reentra sempre que o servidor selecionado muda.
  useEffect(() => {
    if (selectedServerId) joinPresence(selectedServerId)
  }, [selectedServerId, joinPresence])

  // Configuração de microfone é por conta logada nesse aparelho (ver
  // settingsStore.ts) — carrega assim que sabe quem é, antes de qualquer
  // chance da pessoa entrar num canal de voz. `loadForUser` já registra
  // os atalhos salvos no processo main (window.api.shortcuts.set).
  useEffect(() => {
    if (user) loadSettingsForUser(user.id)
  }, [user, loadSettingsForUser])

  // Atalhos globais de mutar/ensurdecer (v1.7.0, settingsStore.ts registra
  // o acelerador no main; aqui só escuta quando um deles dispara de
  // verdade). Lê o status mais atual via getState() em vez do `voiceStatus`
  // do hook — o listener é registrado uma vez só, então uma referência
  // presa no closure ficaria desatualizada depois da primeira renderização.
  useEffect(() => {
    return window.api.shortcuts.onTriggered((action) => {
      if (useVoiceStore.getState().status !== 'connected') return
      if (action === 'mute') toggleMute()
      else toggleDeafen()
    })
  }, [toggleMute, toggleDeafen])

  if (!user || !accessToken) return null

  const selectedServer = servers.find((s) => s.id === selectedServerId) ?? null
  const selectedChannel = channels.find((c) => c.id === selectedChannelId) ?? null

  // Igual Discord: clicar num canal de voz já entra direto, sem precisar de
  // um botão "Conectar" separado (esse continua existindo no VoicePanel só
  // pra reconectar depois de um "Sair" manual, vendo o mesmo canal). Não
  // reentra à toa se já estiver conectado exatamente nesse canal.
  function handleSelectChannel(channelId: string): void {
    selectChannel(channelId)
    const channel = channels.find((c) => c.id === channelId)
    if (channel?.type === 'guild_voice' && voiceChannelId !== channelId) {
      joinVoice(channelId, user!.id)
      joinGoLive(channelId)
    }
  }

  return (
    <div className="flex h-full bg-void text-mist">
      <ServerSidebar
        servers={servers}
        selectedServerId={selectedServerId}
        error={serversError}
        onSelect={(id) => selectServer(accessToken, id)}
        onJoin={(code) => joinServer(accessToken, code)}
      />
      <ChannelList
        server={selectedServer}
        channels={channels}
        selectedChannelId={selectedChannelId}
        error={serversError}
        onSelect={handleSelectChannel}
        onCreate={(name, type) => createChannel(accessToken, name, type)}
        members={members}
        currentUserId={user.id}
        voiceChannelId={voiceChannelId}
        voiceStatus={voiceStatus}
        voiceParticipants={voiceParticipants}
        speakingUserIds={speakingUserIds}
      />
      <div className="flex flex-1 flex-col">
        <header className="flex items-center justify-between border-b border-line-soft bg-panel px-4 py-3">
          <span className="font-display text-sm font-bold tracking-wide text-mist">
            {selectedChannel ? (
              <>
                <span className="text-volt">{selectedChannel.type === 'guild_voice' ? '🔊' : '#'}</span>{' '}
                {selectedChannel.name}
              </>
            ) : (
              <span className="text-mist-faint">Selecione um canal</span>
            )}
          </span>
          <div className="flex items-center gap-3 text-sm">
            <span className="font-medium text-mist">
              {user.username}
              <span className="font-mono text-xs text-mist-dim">#{user.discriminator}</span>
            </span>
            <button
              onClick={() => setSettingsOpen(true)}
              title="Configurações"
              className="border border-line px-2.5 py-1 font-mono text-xs tracking-wide text-mist-dim transition hover:border-volt/60 hover:text-volt"
            >
              ⚙
            </button>
            <button
              onClick={() => logout()}
              className="border border-line px-3 py-1 font-mono text-xs tracking-wide text-mist-dim transition hover:border-plasma/60 hover:text-plasma"
            >
              SAIR
            </button>
          </div>
        </header>
        {selectedChannel && selectedChannel.type === 'guild_text' && (
          <ChatView
            channel={selectedChannel}
            accessToken={accessToken}
            currentUserId={user.id}
            members={members}
          />
        )}
        {selectedChannel && selectedChannel.type === 'guild_voice' && (
          <VoicePanel channel={selectedChannel} currentUserId={user.id} members={members} />
        )}
        {!selectedChannel && (
          <div className="rig-grid flex flex-1 items-center justify-center text-mist-faint">
            Nenhum canal selecionado
          </div>
        )}
      </div>

      <MemberList
        server={selectedServer}
        members={members}
        onlineUserIds={onlineUserIds}
        currentUserId={user.id}
      />

      {settingsOpen && <SettingsModal onClose={() => setSettingsOpen(false)} />}
    </div>
  )
}
