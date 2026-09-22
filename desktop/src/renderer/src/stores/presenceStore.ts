import { create } from 'zustand'
import { Presence } from 'phoenix'
import type { Channel } from 'phoenix'
import { getSocket } from '../services/socket'
import { useServersStore } from './serversStore'
import type { ServerMember } from '../services/api'

// Presença de "quem está online no app" — topic `server:{id}`, diferente
// de `voice:{id}` (quem está numa chamada específica, ver voiceStore.ts).
// Sem eventos client->server nenhum, só join + Presence; o servidor decide
// quem pode entrar (precisa ser membro, ver server_channel.ex).
interface PresenceState {
  serverId: string | null
  onlineUserIds: Set<string>
  join: (serverId: string) => void
  leave: () => void
}

let phoenixChannel: Channel | null = null

export const usePresenceStore = create<PresenceState>((set, get) => ({
  serverId: null,
  onlineUserIds: new Set(),

  join: (serverId) => {
    if (get().serverId === serverId) return
    get().leave()
    set({ serverId, onlineUserIds: new Set() })

    const socket = getSocket()
    if (!socket) return

    const channel = socket.channel(`server:${serverId}`, {})
    const presence = new Presence(channel)
    presence.onSync(() => {
      set({ onlineUserIds: new Set(presence.list<string>((userId) => userId)) })
    })

    // v1.6.0 — quem já está com esse servidor selecionado recebe ao vivo
    // quem entrou agora (ver Servers.notify_member_joined no backend),
    // em vez de só descobrir na próxima vez que reselecionar o servidor.
    channel.on('member:joined', (payload: { member: ServerMember }) => {
      useServersStore.getState().addMember(serverId, payload.member)
    })

    channel.join()
    phoenixChannel = channel
  },

  leave: () => {
    phoenixChannel?.leave()
    phoenixChannel = null
    set({ serverId: null, onlineUserIds: new Set() })
  }
}))
