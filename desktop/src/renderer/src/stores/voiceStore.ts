import { create } from 'zustand'
import { Presence } from 'phoenix'
import type { Channel } from 'phoenix'
import { getSocket } from '../services/socket'
import { MeshManager } from '../webrtc/MeshManager'

interface PresenceMeta {
  user_id: string
  muted: boolean
  deafened: boolean
  video: boolean
  screen_sharing: boolean
  joined_at: number
}

export interface VoiceParticipant extends PresenceMeta {
  userId: string
}

interface VoiceState {
  status: 'idle' | 'connecting' | 'connected'
  channelId: string | null
  participants: VoiceParticipant[]
  localMuted: boolean
  remoteAudioStreams: Record<string, MediaStream>
  screenSharing: boolean
  localScreenStream: MediaStream | null
  remoteScreenStreams: Record<string, MediaStream>
  error: string | null
  join: (channelId: string, currentUserId: string) => Promise<void>
  leave: () => void
  toggleMute: () => void
  startScreenShare: (sourceId: string) => Promise<void>
  stopScreenShare: () => void
}

let phoenixChannel: Channel | null = null
let mesh: MeshManager | null = null

export const useVoiceStore = create<VoiceState>((set, get) => ({
  status: 'idle',
  channelId: null,
  participants: [],
  localMuted: false,
  remoteAudioStreams: {},
  screenSharing: false,
  localScreenStream: null,
  remoteScreenStreams: {},
  error: null,

  join: async (channelId, currentUserId) => {
    get().leave()
    set({ status: 'connecting', channelId, error: null })

    const socket = getSocket()
    if (!socket) {
      set({ status: 'idle', channelId: null, error: 'sem conexão com o servidor' })
      return
    }

    let localStream: MediaStream
    try {
      localStream = await navigator.mediaDevices.getUserMedia({ audio: true })
    } catch (err) {
      set({
        status: 'idle',
        channelId: null,
        error: err instanceof Error ? `microfone: ${err.message}` : 'falha ao acessar o microfone'
      })
      return
    }

    const channel = socket.channel(`voice:${channelId}`, {})

    const meshManager = new MeshManager(
      currentUserId,
      (toUserId, event, payload) => {
        channel.push(event, { to: toUserId, ...payload })
      },
      {
        onRemoteTrack: (peerId, track, stream) => {
          if (track.kind === 'audio') {
            set((state) => ({ remoteAudioStreams: { ...state.remoteAudioStreams, [peerId]: stream } }))
          } else {
            set((state) => ({ remoteScreenStreams: { ...state.remoteScreenStreams, [peerId]: stream } }))
          }
        },
        onRemoteTrackEnded: (peerId, kind) => {
          set((state) => {
            if (kind === 'audio') {
              const rest = { ...state.remoteAudioStreams }
              delete rest[peerId]
              return { remoteAudioStreams: rest }
            }
            const rest = { ...state.remoteScreenStreams }
            delete rest[peerId]
            return { remoteScreenStreams: rest }
          })
        },
        onPeerRemoved: (peerId) => {
          set((state) => {
            const audio = { ...state.remoteAudioStreams }
            const screen = { ...state.remoteScreenStreams }
            delete audio[peerId]
            delete screen[peerId]
            return { remoteAudioStreams: audio, remoteScreenStreams: screen }
          })
        }
      }
    )
    meshManager.setLocalStream(localStream)

    // Cada evento é relayado pra sala inteira (broadcast_from!, ver
    // voice_channel.ex) — cada cliente precisa filtrar pelo `to`, senão o
    // sinal endereçado a outra pessoa também seria processado aqui.
    channel.on('sdp:offer', (payload: { to: string; from: string; sdp: unknown }) => {
      if (payload.to === currentUserId) meshManager.handleSignal(payload.from, 'sdp:offer', payload)
    })
    channel.on('sdp:answer', (payload: { to: string; from: string; sdp: unknown }) => {
      if (payload.to === currentUserId) meshManager.handleSignal(payload.from, 'sdp:answer', payload)
    })
    channel.on('ice:candidate', (payload: { to: string; from: string; candidate: unknown }) => {
      if (payload.to === currentUserId) meshManager.handleSignal(payload.from, 'ice:candidate', payload)
    })

    const presence = new Presence(channel)
    presence.onSync(() => {
      const list = presence.list<VoiceParticipant>((userId, pres) => ({
        userId,
        ...(pres.metas[0] as PresenceMeta)
      }))
      set({ participants: list })

      for (const participant of list) {
        if (participant.userId !== currentUserId) meshManager.addPeer(participant.userId)
      }
    })
    presence.onLeave((userId) => {
      if (userId) meshManager.removePeer(userId)
    })

    try {
      await new Promise<void>((resolve, reject) => {
        channel
          .join()
          .receive('ok', () => resolve())
          .receive('error', (resp) => reject(resp))
      })
    } catch {
      meshManager.destroy()
      set({ status: 'idle', channelId: null, error: 'não foi possível entrar no canal de voz' })
      return
    }

    mesh = meshManager
    phoenixChannel = channel
    set({ status: 'connected' })
  },

  leave: () => {
    mesh?.destroy()
    mesh = null
    phoenixChannel?.leave()
    phoenixChannel = null
    set({
      status: 'idle',
      channelId: null,
      participants: [],
      remoteAudioStreams: {},
      localMuted: false,
      screenSharing: false,
      localScreenStream: null,
      remoteScreenStreams: {}
    })
  },

  toggleMute: () => {
    const muted = !get().localMuted
    mesh?.setMuted(muted)
    // O handler `state:update` no backend sempre espera os dois campos
    // juntos (usa default false pra quem faltar) — deafen ainda não existe
    // no cliente, então sempre manda false.
    phoenixChannel?.push('state:update', { muted, deafened: false })
    set({ localMuted: muted })
  },

  startScreenShare: async (sourceId) => {
    const channel = phoenixChannel
    if (!channel || !mesh) return
    set({ error: null })

    await window.api.screenShare.selectSource(sourceId)

    let stream: MediaStream
    try {
      // Dispara o handler de main (setDisplayMediaRequestHandler), que já
      // sabe qual fonte liberar por causa do selectSource acima.
      stream = await navigator.mediaDevices.getDisplayMedia({ video: true })
    } catch (err) {
      set({
        error: err instanceof Error ? `compartilhamento de tela: ${err.message}` : 'falha ao capturar a tela'
      })
      return
    }

    // Só reivindica o slot no servidor DEPOIS que o usuário já escolheu a
    // fonte — se alguém já está compartilhando, ele não passa pela escolha
    // de janela à toa.
    const reply = await new Promise<{ ok: boolean; reason?: string }>((resolve) => {
      channel
        .push('screen_share:start', {})
        .receive('ok', () => resolve({ ok: true }))
        .receive('error', (resp: { reason?: string }) => resolve({ ok: false, reason: resp?.reason }))
    })

    if (!reply.ok) {
      stream.getTracks().forEach((track) => track.stop())
      set({
        error:
          reply.reason === 'screen_share_in_use'
            ? 'alguém já está compartilhando a tela nessa sala'
            : 'não foi possível compartilhar a tela'
      })
      return
    }

    mesh.setScreenTrack(stream)
    const track = stream.getVideoTracks()[0]
    if (track) {
      track.onended = () => get().stopScreenShare()
    }
    set({ screenSharing: true, localScreenStream: stream })
  },

  stopScreenShare: () => {
    mesh?.setScreenTrack(null)
    phoenixChannel?.push('screen_share:stop', {})
    set({ screenSharing: false, localScreenStream: null })
  }
}))
