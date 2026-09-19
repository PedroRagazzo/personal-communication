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
  editMessage: (id: string, content: string) => void
  deleteMessage: (id: string) => void
  addReaction: (messageId: string, emoji: string) => void
  removeReaction: (messageId: string, emoji: string) => void
  reset: () => void
}

// A conexão do Phoenix Channel em si não é serializável/não pertence ao
// estado do zustand (é um objeto com callbacks, sockets) — fica fora,
// módulo-level, igual ao socket em `services/socket.ts`.
let phoenixChannel: Channel | null = null

// Aplica um evento de reação (add/remove) no array `reactions` de uma
// mensagem — mesma agregação por emoji que o backend já manda em
// `MessageJSON.data/1`, só que incremental (o broadcast de
// message:reaction/message:reaction:remove manda só a reação que mudou,
// não o resumo inteiro de novo).
function applyReaction(
  reactions: api.MessageReaction[],
  emoji: string,
  userId: string,
  add: boolean
): api.MessageReaction[] {
  const existing = reactions.find((r) => r.emoji === emoji)

  if (add) {
    if (existing) {
      if (existing.user_ids.includes(userId)) return reactions
      return reactions.map((r) =>
        r.emoji === emoji ? { ...r, count: r.count + 1, user_ids: [...r.user_ids, userId] } : r
      )
    }
    return [...reactions, { emoji, count: 1, user_ids: [userId] }]
  }

  if (!existing) return reactions
  const user_ids = existing.user_ids.filter((id) => id !== userId)
  if (user_ids.length === 0) return reactions.filter((r) => r.emoji !== emoji)
  return reactions.map((r) => (r.emoji === emoji ? { ...r, count: user_ids.length, user_ids } : r))
}

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
    channel.on('message:update', (payload: api.ChatMessage) => {
      set((state) =>
        state.channelId === channelId
          ? { messages: state.messages.map((m) => (m.id === payload.id ? payload : m)) }
          : state
      )
    })
    channel.on('message:delete', (payload: { id: string }) => {
      set((state) =>
        state.channelId === channelId
          ? { messages: state.messages.filter((m) => m.id !== payload.id) }
          : state
      )
    })
    channel.on(
      'message:reaction',
      (payload: { message_id: string; emoji: string; user_id: string }) => {
        set((state) =>
          state.channelId === channelId
            ? {
                messages: state.messages.map((m) =>
                  m.id === payload.message_id
                    ? { ...m, reactions: applyReaction(m.reactions, payload.emoji, payload.user_id, true) }
                    : m
                )
              }
            : state
        )
      }
    )
    channel.on(
      'message:reaction:remove',
      (payload: { message_id: string; emoji: string; user_id: string }) => {
        set((state) =>
          state.channelId === channelId
            ? {
                messages: state.messages.map((m) =>
                  m.id === payload.message_id
                    ? { ...m, reactions: applyReaction(m.reactions, payload.emoji, payload.user_id, false) }
                    : m
                )
              }
            : state
        )
      }
    )
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

  editMessage: (id, content) => {
    const trimmed = content.trim()
    if (!trimmed || !phoenixChannel) return

    phoenixChannel.push('message:update', { id, content: trimmed }).receive('error', (resp) => {
      set({ error: api.flattenErrors((resp as { errors?: unknown })?.errors ?? resp) })
    })
  },

  deleteMessage: (id) => {
    phoenixChannel?.push('message:delete', { id }).receive('error', (resp) => {
      set({ error: api.flattenErrors((resp as { errors?: unknown })?.errors ?? resp) })
    })
  },

  addReaction: (messageId, emoji) => {
    phoenixChannel?.push('message:reaction', { message_id: messageId, emoji })
  },

  removeReaction: (messageId, emoji) => {
    phoenixChannel?.push('message:reaction:remove', { message_id: messageId, emoji })
  },

  reset: () => {
    phoenixChannel?.leave()
    phoenixChannel = null
    set({ channelId: null, messages: [], loading: false, error: null })
  }
}))
