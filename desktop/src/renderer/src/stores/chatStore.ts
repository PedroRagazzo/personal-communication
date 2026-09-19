import { create } from 'zustand'
import type { Channel } from 'phoenix'
import * as api from '../services/api'
import { getSocket } from '../services/socket'

interface ChatState {
  channelId: string | null
  messages: api.ChatMessage[]
  loading: boolean
  error: string | null
  joinChannel: (accessToken: string, channelId: string) => Promise<void>
  leaveChannel: () => void
  sendMessage: (content: string) => void
  reset: () => void
}

// A conexão do Phoenix Channel em si não é serializável/não pertence ao
// estado do zustand (é um objeto com callbacks, sockets) — fica fora,
// módulo-level, igual ao socket em `services/socket.ts`.
let phoenixChannel: Channel | null = null

export const useChatStore = create<ChatState>((set, get) => ({
  channelId: null,
  messages: [],
  loading: false,
  error: null,

  joinChannel: async (accessToken, channelId) => {
    get().leaveChannel()
    set({ channelId, messages: [], loading: true, error: null })

    try {
      const messages = await api.listMessages(accessToken, channelId)
      // Se o usuário já trocou de canal de novo enquanto isso carregava,
      // não pisa no estado do canal novo.
      if (get().channelId !== channelId) return
      set({ messages, loading: false })
    } catch (err) {
      if (get().channelId !== channelId) return
      set({ error: err instanceof Error ? err.message : 'erro desconhecido', loading: false })
      return
    }

    const socket = getSocket()
    if (!socket) return

    const channel = socket.channel(`channel:${channelId}`, {})
    channel.on('message:create', (payload: api.ChatMessage) => {
      set((state) =>
        state.channelId === channelId ? { messages: [...state.messages, payload] } : state
      )
    })
    channel.join()
    phoenixChannel = channel
  },

  leaveChannel: () => {
    phoenixChannel?.leave()
    phoenixChannel = null
    set({ channelId: null, messages: [] })
  },

  sendMessage: (content) => {
    const trimmed = content.trim()
    if (!trimmed || !phoenixChannel) return

    phoenixChannel.push('message:create', { content: trimmed }).receive('error', (resp) => {
      set({ error: api.flattenErrors((resp as { errors?: unknown })?.errors ?? resp) })
    })
  },

  reset: () => {
    phoenixChannel?.leave()
    phoenixChannel = null
    set({ channelId: null, messages: [], loading: false, error: null })
  }
}))
