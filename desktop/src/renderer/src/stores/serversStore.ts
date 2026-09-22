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
  createChannel: (
    accessToken: string,
    name: string,
    type: 'guild_text' | 'guild_voice'
  ) => Promise<boolean>
  joinServer: (accessToken: string, code: string) => Promise<boolean>
  addMember: (serverId: string, member: api.ServerMember) => void
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

  createChannel: async (accessToken, name, type) => {
    const serverId = get().selectedServerId
    if (!serverId) return false

    try {
      const channel = await api.createChannel(accessToken, serverId, { name, type })
      // Servidor não reordena por nome — novo canal só entra no fim da
      // lista, igual ao `position` default (0) que todo canal ganha por
      // enquanto (reordenar fica pra uma fatia futura).
      set((state) => ({ channels: [...state.channels, channel], selectedChannelId: channel.id, error: null }))
      return true
    } catch (err) {
      set({
        error:
          err instanceof api.ApiError && err.status === 403
            ? 'você não tem permissão para criar canais nesse servidor'
            : err instanceof Error
              ? err.message
              : 'erro desconhecido'
      })
      return false
    }
  },

  joinServer: async (accessToken, code) => {
    try {
      const server = await api.joinInvite(accessToken, code)
      // Servidor pode já estar na lista se o convite for pra um servidor do
      // qual a pessoa saiu e voltou a entrar — evita duplicar o ícone.
      set((state) => ({
        servers: state.servers.some((s) => s.id === server.id) ? state.servers : [...state.servers, server],
        error: null
      }))
      await get().selectServer(accessToken, server.id)
      return true
    } catch (err) {
      const reason = err instanceof api.ApiError ? err.message : null
      set({
        error:
          reason === 'not found'
            ? 'convite inválido ou não encontrado'
            : reason === 'expired'
              ? 'esse convite expirou'
              : reason === 'max_uses_reached'
                ? 'esse convite já atingiu o limite de usos'
                : reason === 'banned'
                  ? 'você foi banido desse servidor'
                  : reason === 'already_member'
                    ? 'você já é membro desse servidor'
                    : err instanceof Error
                      ? err.message
                      : 'erro desconhecido'
      })
      return false
    }
  },

  // Chamado por presenceStore.ts quando o evento `member:joined` chega no
  // topic `server:{id}` (v1.6.0, bug real reportado: gente nova aparecendo
  // como "desconhecido" no chat/voz e sumindo da barra de quem-está-online
  // — `members` só era buscado uma vez por seleção de servidor, nunca mais
  // atualizado). Ignora se for pra um servidor diferente do selecionado
  // agora (o listener no canal fica registrado mesmo depois de trocar de
  // servidor, já que o canal só é reaberto quando presenceStore.join troca
  // de topic — ver lá) ou se a pessoa já está na lista (evita duplicar
  // numa reconexão/resync).
  addMember: (serverId, member) => {
    const state = get()
    if (state.selectedServerId !== serverId) return
    if (state.members.some((m) => m.user.id === member.user.id)) return
    set({ members: [...state.members, member] })
  },

  reset: () => set(initialState)
}))
