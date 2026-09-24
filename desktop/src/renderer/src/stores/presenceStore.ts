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
  // v1.8.0 — quem está em cada canal de voz (channelId -> userIds), visível
  // sem precisar entrar na call. Vem de uma meta extra `voice_channel_id`
  // que o próprio VoiceChannel registra neste mesmo tópico (ver
  // voice_channel.ex) — mesma chave (user_id) da meta de "online".
  voiceOccupancy: Record<string, string[]>
  join: (serverId: string) => void
  leave: () => void
}

let phoenixChannel: Channel | null = null

export const usePresenceStore = create<PresenceState>((set, get) => ({
  serverId: null,
  onlineUserIds: new Set(),
  voiceOccupancy: {},

  join: (serverId) => {
    if (get().serverId === serverId) return
    get().leave()
    set({ serverId, onlineUserIds: new Set(), voiceOccupancy: {} })

    const socket = getSocket()
    if (!socket) return

    const channel = socket.channel(`server:${serverId}`, {})
    const presence = new Presence(channel)
    presence.onSync(() => {
      const entries = presence.list<{ userId: string; metas: { voice_channel_id?: string }[] }>(
        (userId, pres) => ({ userId, metas: pres.metas })
      )
      const voiceOccupancy: Record<string, string[]> = {}
      for (const { userId, metas } of entries) {
        for (const meta of metas) {
          if (!meta.voice_channel_id) continue
          const occupants = (voiceOccupancy[meta.voice_channel_id] ??= [])
          if (!occupants.includes(userId)) occupants.push(userId)
        }
      }
      set({ onlineUserIds: new Set(entries.map((e) => e.userId)), voiceOccupancy })
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
    set({ serverId: null, onlineUserIds: new Set(), voiceOccupancy: {} })
  }
}))
