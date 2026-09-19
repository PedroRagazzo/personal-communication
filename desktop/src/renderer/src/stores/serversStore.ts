import { create } from 'zustand'
import * as api from '../services/api'

interface ServersState {
  servers: api.ServerSummary[]
  selectedServerId: string | null
  channels: api.ChannelSummary[]
  members: api.ServerMember[]
  selectedChannelId: string | null
  loadingServers: boolean
  loadingChannels: boolean
  error: string | null
  loadServers: (accessToken: string) => Promise<void>
  selectServer: (accessToken: string, serverId: string) => Promise<void>
  selectChannel: (channelId: string) => void
  reset: () => void
}

const initialState = {
  servers: [] as api.ServerSummary[],
  selectedServerId: null as string | null,
  channels: [] as api.ChannelSummary[],
  members: [] as api.ServerMember[],
  selectedChannelId: null as string | null,
  loadingServers: false,
  loadingChannels: false,
  error: null as string | null
}

export const useServersStore = create<ServersState>((set, get) => ({
  ...initialState,

  loadServers: async (accessToken) => {
    set({ loadingServers: true, error: null })
    try {
      const servers = await api.listServers(accessToken)
      set({ servers, loadingServers: false })
    } catch (err) {
      set({ error: err instanceof Error ? err.message : 'erro desconhecido', loadingServers: false })
    }
  },

  selectServer: async (accessToken, serverId) => {
    if (get().selectedServerId === serverId) return
    set({
      selectedServerId: serverId,
      channels: [],
      members: [],
      selectedChannelId: null,
      loadingChannels: true,
      error: null
    })
    try {
      // Precisa dos membros pra resolver author_id -> username#discriminator
      // no chat (a mensagem em si só traz o id, ver docs/api.md).
      const [channels, members] = await Promise.all([
        api.listChannels(accessToken, serverId),
        api.listMembers(accessToken, serverId)
      ])
      if (get().selectedServerId !== serverId) return
      set({ channels, members, loadingChannels: false })
    } catch (err) {
      if (get().selectedServerId !== serverId) return
      set({ error: err instanceof Error ? err.message : 'erro desconhecido', loadingChannels: false })
    }
  },

  selectChannel: (channelId) => set({ selectedChannelId: channelId }),

  reset: () => set(initialState)
}))
