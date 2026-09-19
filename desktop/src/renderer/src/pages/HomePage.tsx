import { useEffect } from 'react'
import { useAuthStore } from '../stores/authStore'
import { useServersStore } from '../stores/serversStore'
import { ServerSidebar } from '../components/ServerSidebar'
import { ChannelList } from '../components/ChannelList'

// Shell autenticado (FASE 11, fatia 2): navegação entre servidores e
// canais. Chat/voz/vídeo/tela/Go Live no cliente chegam nas próximas
// fatias — a área principal é só um placeholder por enquanto.
export function HomePage() {
  const user = useAuthStore((s) => s.user)
  const accessToken = useAuthStore((s) => s.accessToken)
  const logout = useAuthStore((s) => s.logout)

  const servers = useServersStore((s) => s.servers)
  const selectedServerId = useServersStore((s) => s.selectedServerId)
  const channels = useServersStore((s) => s.channels)
  const selectedChannelId = useServersStore((s) => s.selectedChannelId)
  const loadServers = useServersStore((s) => s.loadServers)
  const selectServer = useServersStore((s) => s.selectServer)
  const selectChannel = useServersStore((s) => s.selectChannel)

  useEffect(() => {
    if (accessToken) loadServers(accessToken)
  }, [accessToken, loadServers])

  if (!user || !accessToken) return null

  const selectedServer = servers.find((s) => s.id === selectedServerId) ?? null
  const selectedChannel = channels.find((c) => c.id === selectedChannelId) ?? null

  return (
    <div className="flex h-screen bg-neutral-900 text-neutral-100">
      <ServerSidebar
        servers={servers}
        selectedServerId={selectedServerId}
        onSelect={(id) => selectServer(accessToken, id)}
      />
      <ChannelList
        server={selectedServer}
        channels={channels}
        selectedChannelId={selectedChannelId}
        onSelect={selectChannel}
      />
      <div className="flex flex-1 flex-col">
        <header className="flex items-center justify-between border-b border-neutral-800 px-4 py-3">
          <span className="font-semibold">
            {selectedChannel ? (
              <>
                <span className="text-neutral-500">{selectedChannel.type === 'guild_voice' ? '🔊' : '#'}</span>{' '}
                {selectedChannel.name}
              </>
            ) : (
              <span className="text-neutral-500">Selecione um canal</span>
            )}
          </span>
          <div className="flex items-center gap-3 text-sm text-neutral-400">
            <span>
              {user.username}
              <span className="text-neutral-600">#{user.discriminator}</span>
            </span>
            <button
              onClick={() => logout()}
              className="rounded bg-neutral-800 px-3 py-1 transition hover:bg-neutral-700"
            >
              Sair
            </button>
          </div>
        </header>
        <div className="flex flex-1 items-center justify-center text-neutral-600">
          {selectedChannel ? 'Chat chega na próxima fatia da FASE 11' : 'Nenhum canal selecionado'}
        </div>
      </div>
    </div>
  )
}
