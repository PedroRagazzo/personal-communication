import { useEffect } from 'react'
import { useAuthStore } from '../stores/authStore'
import { useServersStore } from '../stores/serversStore'
import { ServerSidebar } from '../components/ServerSidebar'
import { ChannelList } from '../components/ChannelList'
import { ChatView } from '../components/ChatView'
import { VoicePanel } from '../components/VoicePanel'

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

  useEffect(() => {
    if (accessToken) loadServers(accessToken)
  }, [accessToken, loadServers])

  if (!user || !accessToken) return null

  const selectedServer = servers.find((s) => s.id === selectedServerId) ?? null
  const selectedChannel = channels.find((c) => c.id === selectedChannelId) ?? null

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
        onSelect={selectChannel}
        onCreate={(name, type) => createChannel(accessToken, name, type)}
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
    </div>
  )
}
