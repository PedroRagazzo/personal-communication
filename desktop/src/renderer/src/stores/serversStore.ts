import { create } from 'zustand'
import * as api from '../services/api'

interface ServersState {
  servers: api.ServerSummary[]
  selectedServerId: string | null
  channels: api.ChannelSummary[]
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
      selectedChannelId: null,
      loadingChannels: true,
      error: null
    })
    try {
      const channels = await api.listChannels(accessToken, serverId)
      set({ channels, loadingChannels: false })
    } catch (err) {
      set({ error: err instanceof Error ? err.message : 'erro desconhecido', loadingChannels: false })
    }
  },

  selectChannel: (channelId) => set({ selectedChannelId: channelId }),

  reset: () => set(initialState)
}))
