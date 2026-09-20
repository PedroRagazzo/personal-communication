import { create } from 'zustand'
import { Presence } from 'phoenix'
import type { Channel } from 'phoenix'
import { Room, RoomEvent, type RemoteTrack, type RemoteParticipant } from 'livekit-client'
import { getSocket } from '../services/socket'

// Go Live (FASE 9 no backend, FASE 11 fatia 10 aqui): diferente de
// voiceStore.ts, aqui não existe mesh nenhum — mídia vai direto
// cliente <-> LiveKit (SFU), nunca pelo Phoenix. O Channel `live:{id}`
// só autoriza e devolve tokens (ver GoLiveChannel no backend); a conexão
// de mídia de verdade é o `Room` do `livekit-client`, biblioteca
// oficial da LiveKit (`livekit/client-sdk-js`).
//
// Entrar no canal de voz já entra aqui também (ver VoicePanel.tsx) —
// conecta ao LiveKit com um token *subscriber-only*, então qualquer
// stream que já esteja ao vivo aparece na hora (autoSubscribe é padrão
// do Room.connect). "Ir ao vivo" troca pra um token *publisher*: o
// token de assistir não tem permissão de publicar, então vira
// desconectar+reconectar com o token novo (não existe upgrade de
// permissão numa conexão já aberta na API do LiveKit) — feito no mesmo
// objeto `Room`, não precisa recriar.
interface PresenceMeta {
  user_id: string
  live: boolean
  started_at: number | null
}

export interface GoLiveParticipant extends PresenceMeta {
  userId: string
}

interface GoLiveState {
  status: 'idle' | 'connecting' | 'connected'
  channelId: string | null
  participants: GoLiveParticipant[]
  isLive: boolean
  localStream: MediaStream | null
  remoteStreams: Record<string, MediaStream>
  error: string | null
  join: (channelId: string) => Promise<void>
  leave: () => void
  startGoLive: (sourceId: string) => Promise<void>
  stopGoLive: () => void
}

let phoenixChannel: Channel | null = null
let room: Room | null = null

export const useGoLiveStore = create<GoLiveState>((set, get) => ({
  status: 'idle',
  channelId: null,
  participants: [],
  isLive: false,
  localStream: null,
  remoteStreams: {},
  error: null,

  join: async (channelId) => {
    get().leave()
    set({ status: 'connecting', channelId, error: null })

    const socket = getSocket()
    if (!socket) {
      set({ status: 'idle', channelId: null, error: 'sem conexão com o servidor' })
      return
    }

    const channel = socket.channel(`live:${channelId}`, {})
    const liveRoom = new Room()

    liveRoom.on(RoomEvent.TrackSubscribed, (track: RemoteTrack, _pub, participant: RemoteParticipant) => {
      if (track.kind !== 'video') return
      const stream = track.mediaStream ?? new MediaStream([track.mediaStreamTrack])
      set((state) => ({ remoteStreams: { ...state.remoteStreams, [participant.identity]: stream } }))
    })
    liveRoom.on(RoomEvent.TrackUnsubscribed, (_track: RemoteTrack, _pub, participant: RemoteParticipant) => {
      set((state) => {
        const rest = { ...state.remoteStreams }
        delete rest[participant.identity]
        return { remoteStreams: rest }
      })
    })

    // `join` do GoLiveChannel devolve {token, url} na própria resposta do
    // join (3-tuple {:ok, payload, socket} no backend), não via evento
    // separado — diferente de voice:{id}, que só confirma :ok.
    let token: string
    let url: string
    try {
      const resp = await new Promise<{ token: string; url: string }>((resolve, reject) => {
        channel
          .join()
          .receive('ok', (r: { token: string; url: string }) => resolve(r))
          .receive('error', (r) => reject(r))
      })
      token = resp.token
      url = resp.url
    } catch {
      set({ status: 'idle', channelId: null, error: 'não foi possível entrar no canal de Go Live' })
      return
    }

    try {
      await liveRoom.connect(url, token)
    } catch (err) {
      channel.leave()
      set({
        status: 'idle',
        channelId: null,
        error: err instanceof Error ? `Go Live: ${err.message}` : 'não foi possível conectar ao LiveKit'
      })
      return
    }

    const presence = new Presence(channel)
    presence.onSync(() => {
      const list = presence.list<GoLiveParticipant>((userId, pres) => ({
        userId,
        ...(pres.metas[0] as PresenceMeta)
      }))
      set({ participants: list })
    })

    phoenixChannel = channel
    room = liveRoom
    set({ status: 'connected', channelId, participants: [], error: null })
  },

  leave: () => {
    const stream = get().localStream
    stream?.getTracks().forEach((track) => track.stop())
    room?.disconnect()
    room = null
    phoenixChannel?.leave()
    phoenixChannel = null
    set({
      status: 'idle',
      channelId: null,
      participants: [],
      isLive: false,
      localStream: null,
      remoteStreams: {},
      error: null
    })
  },

  startGoLive: async (sourceId) => {
    const channel = phoenixChannel
    if (!channel || !room) return
    set({ error: null })

    await window.api.screenShare.selectSource(sourceId)

    let stream: MediaStream
    try {
      stream = await navigator.mediaDevices.getDisplayMedia({ video: true })
    } catch (err) {
      set({ error: err instanceof Error ? `Go Live: ${err.message}` : 'falha ao capturar a tela' })
      return
    }

    const reply = await new Promise<{ ok: boolean; token?: string; url?: string }>((resolve) => {
      channel
        .push('golive:start', {})
        .receive('ok', (r: { token: string; url: string }) => resolve({ ok: true, ...r }))
        .receive('error', () => resolve({ ok: false }))
    })

    if (!reply.ok || !reply.token || !reply.url) {
      stream.getTracks().forEach((track) => track.stop())
      set({ error: 'não foi possível iniciar a transmissão' })
      return
    }

    try {
      await room.disconnect()
      await room.connect(reply.url, reply.token)
      await room.localParticipant.publishTrack(stream.getVideoTracks()[0])
    } catch (err) {
      stream.getTracks().forEach((track) => track.stop())
      phoenixChannel?.push('golive:stop', {})
      set({ error: err instanceof Error ? `Go Live: ${err.message}` : 'falha ao transmitir' })
      return
    }

    const track = stream.getVideoTracks()[0]
    if (track) track.onended = () => get().stopGoLive()

    set({ isLive: true, localStream: stream })
  },

  stopGoLive: () => {
    const stream = get().localStream
    const track = stream?.getVideoTracks()[0]
    if (track && room) room.localParticipant.unpublishTrack(track)
    stream?.getTracks().forEach((t) => t.stop())
    phoenixChannel?.push('golive:stop', {})
    set({ isLive: false, localStream: null })
  }
}))
