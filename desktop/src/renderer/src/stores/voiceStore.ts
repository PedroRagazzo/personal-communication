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
  localDeafened: boolean
  remoteAudioStreams: Record<string, MediaStream>
  screenSharing: boolean
  localScreenStream: MediaStream | null
  remoteScreenStreams: Record<string, MediaStream>
  videoEnabled: boolean
  localCameraStream: MediaStream | null
  remoteCameraStreams: Record<string, MediaStream>
  error: string | null
  join: (channelId: string, currentUserId: string) => Promise<void>
  leave: () => void
  toggleMute: () => void
  toggleDeafen: () => void
  startScreenShare: (sourceId: string) => Promise<void>
  stopScreenShare: () => void
  toggleVideo: () => Promise<void>
}

let phoenixChannel: Channel | null = null
let mesh: MeshManager | null = null

export const useVoiceStore = create<VoiceState>((set, get) => ({
  status: 'idle',
  channelId: null,
  participants: [],
  localMuted: false,
  localDeafened: false,
  remoteAudioStreams: {},
  screenSharing: false,
  localScreenStream: null,
  remoteScreenStreams: {},
  videoEnabled: false,
  localCameraStream: null,
  remoteCameraStreams: {},
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
        // Sem transceiver fixo por slot (ver webrtc/MeshManager.ts) — pra
        // vídeo, desambigua câmera vs tela usando o que o Presence já diz
        // sobre esse peer (video/screen_sharing). Isso funciona porque
        // toggleVideo/startScreenShare abaixo sempre atualizam o Presence
        // ANTES de anexar a track de verdade, então quando a track chega
        // aqui o Presence já reflete o que ela é.
        onRemoteTrack: (peerId, track, stream) => {
          if (track.kind === 'audio') {
            set((state) => ({ remoteAudioStreams: { ...state.remoteAudioStreams, [peerId]: stream } }))
            return
          }

          set((state) => {
            const participant = state.participants.find((p) => p.userId === peerId)
            const hasCamera = !!state.remoteCameraStreams[peerId]
            const hasScreen = !!state.remoteScreenStreams[peerId]

            const isScreen = participant?.screen_sharing && !hasScreen
            const isCamera = !isScreen && participant?.video && !hasCamera

            if (isScreen) {
              return { remoteScreenStreams: { ...state.remoteScreenStreams, [peerId]: stream } }
            }
            if (isCamera) {
              return { remoteCameraStreams: { ...state.remoteCameraStreams, [peerId]: stream } }
            }
            // Presence ainda não chegou/desatualizado — usa o slot livre.
            return hasScreen
              ? { remoteCameraStreams: { ...state.remoteCameraStreams, [peerId]: stream } }
              : { remoteScreenStreams: { ...state.remoteScreenStreams, [peerId]: stream } }
          })
        },
        onRemoteTrackEnded: (peerId, kind, trackId) => {
          if (kind === 'audio') {
            set((state) => {
              const rest = { ...state.remoteAudioStreams }
              delete rest[peerId]
              return { remoteAudioStreams: rest }
            })
            return
          }

          set((state) => {
            if (state.remoteCameraStreams[peerId]?.getVideoTracks().some((t) => t.id === trackId)) {
              const rest = { ...state.remoteCameraStreams }
              delete rest[peerId]
              return { remoteCameraStreams: rest }
            }
            if (state.remoteScreenStreams[peerId]?.getVideoTracks().some((t) => t.id === trackId)) {
              const rest = { ...state.remoteScreenStreams }
              delete rest[peerId]
              return { remoteScreenStreams: rest }
            }
            return {}
          })
        },
        onPeerRemoved: (peerId) => {
          set((state) => {
            const audio = { ...state.remoteAudioStreams }
            const screen = { ...state.remoteScreenStreams }
            const camera = { ...state.remoteCameraStreams }
            delete audio[peerId]
            delete screen[peerId]
            delete camera[peerId]
            return { remoteAudioStreams: audio, remoteScreenStreams: screen, remoteCameraStreams: camera }
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
    // De propósito, `presence.onLeave` NÃO derruba a peer connection.
    // `Presence.update` (usado por mute/deafen/video/screen_sharing, ver
    // voice_channel.ex) já manda o leave+join do mesmo par de metas num
    // diff atômico do lado do servidor — mas a computação desse diff é
    // assíncrona (Phoenix.Presence roda cada `handle_diff` numa Task), e
    // sob rajada de updates próximos (ex.: ligar câmera e, segundos
    // depois, ligar tela) as tasks podem terminar fora de ordem, fazendo
    // o cliente enxergar um "leave" sem o join correspondente ainda
    // aplicado — mesmo a pessoa nunca tendo saído de verdade. Confirmado
    // ao vivo: isso derrubava a peer connection inteira no meio de uma
    // chamada, corrompendo a negociação seguinte (m-lines fora de ordem).
    // Quem decide se um peer realmente sumiu é o próprio WebRTC — quando
    // a conexão para de verdade, `connectionstatechange` vira 'failed'
    // (ver MeshManager.addPeer) e o cleanup acontece por ali.

    try {
      await new Promise<void>((resolve, reject) => {
        channel
          .join()
          // TURN entra como fallback do STUN público já embutido no
          // MeshManager — credenciais efêmeras (ver backend/Turn),
          // válidas só pra essa sessão de voz.
          .receive('ok', (resp: { turn?: RTCIceServer }) => {
            if (resp?.turn) meshManager.addIceServer(resp.turn)
            resolve()
          })
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
      localDeafened: false,
      screenSharing: false,
      localScreenStream: null,
      remoteScreenStreams: {},
      videoEnabled: false,
      localCameraStream: null,
      remoteCameraStreams: {}
    })
  },

  toggleMute: () => {
    const wasMuted = get().localMuted
    const muted = !wasMuted
    // Desmutar enquanto ensurdecido também desensurdece — igual ao
    // Discord: ficar sem ouvir nada mas falando de novo seria um estado
    // confuso de deixar acontecer silenciosamente.
    const deafened = muted ? get().localDeafened : false
    mesh?.setMuted(muted)
    phoenixChannel?.push('state:update', { muted, deafened })
    set({ localMuted: muted, localDeafened: deafened })
  },

  toggleDeafen: () => {
    const deafened = !get().localDeafened
    // Ensurdecer força mute junto (não faz sentido continuar transmitindo
    // sem conseguir ouvir a resposta); desensurdecer não desmuta sozinho —
    // precisa de uma ação separada, pra nunca voltar a falar sem querer.
    const muted = deafened ? true : get().localMuted
    mesh?.setMuted(muted)
    phoenixChannel?.push('state:update', { muted, deafened })
    set({ localDeafened: deafened, localMuted: muted })
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

    // Sem limite de compartilhamentos simultâneos por sala (servidor único,
    // ~20 pessoas, não público) — `screen_share:start` sempre responde ok,
    // mas ainda usa push/reply em vez de fire-and-forget pra não perder um
    // erro genérico de canal (rede caiu, etc.).
    const ok = await new Promise<boolean>((resolve) => {
      channel
        .push('screen_share:start', {})
        .receive('ok', () => resolve(true))
        .receive('error', () => resolve(false))
    })

    if (!ok) {
      stream.getTracks().forEach((track) => track.stop())
      set({ error: 'não foi possível compartilhar a tela' })
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
  },

  toggleVideo: async () => {
    if (get().videoEnabled) {
      mesh?.setCameraTrack(null)
      phoenixChannel?.push('video:disable', {})
      set({ videoEnabled: false, localCameraStream: null })
      return
    }

    const channel = phoenixChannel
    if (!channel || !mesh) return
    set({ error: null })

    // Reivindica o slot no servidor (cap de 4 participantes com vídeo,
    // ver docs/media.md) ANTES de ligar a câmera — diferente da tela, não
    // tem nenhuma escolha de UI pra "desperdiçar" aqui, então falhar rápido
    // é melhor do que piscar a câmera à toa se a sala já estiver cheia.
    const reply = await new Promise<{ ok: boolean; reason?: string }>((resolve) => {
      channel
        .push('video:enable', {})
        .receive('ok', () => resolve({ ok: true }))
        .receive('error', (resp: { reason?: string }) => resolve({ ok: false, reason: resp?.reason }))
    })

    if (!reply.ok) {
      set({
        error:
          reply.reason === 'video_limit_reached'
            ? 'limite de 4 participantes com vídeo atingido nessa sala'
            : 'não foi possível ativar a câmera'
      })
      return
    }

    let stream: MediaStream
    try {
      stream = await navigator.mediaDevices.getUserMedia({ video: true })
    } catch (err) {
      phoenixChannel?.push('video:disable', {})
      set({ error: err instanceof Error ? `câmera: ${err.message}` : 'falha ao acessar a câmera' })
      return
    }

    mesh.setCameraTrack(stream)
    set({ videoEnabled: true, localCameraStream: stream })
  }
}))
