import { create } from 'zustand'
import { Presence } from 'phoenix'
import type { Channel } from 'phoenix'
import { getSocket } from '../services/socket'
import { MeshManager } from '../webrtc/MeshManager'
import { SpeakingDetector } from '../webrtc/SpeakingDetector'
import { useSettingsStore } from './settingsStore'

export interface ScreenShareQuality {
  width: number
  height: number
  frameRate: number
}

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
  // Sem relação com mute/deafen (que também mexem no mic) — só reprodução
  // local. Ligado pelo goLiveStore enquanto a pessoa transmite a própria
  // tela COM som do PC (ver startGoLive): sem isso, o áudio de voz que o
  // app está tocando pelos alto-falantes entraria na captura de loopback
  // do sistema e voltaria pra quem está assistindo — inclusive pra quem
  // já ouve a mesma voz ao vivo pela chamada, um eco duplicado.
  localPlaybackMuted: boolean
  localAudioStream: MediaStream | null
  remoteAudioStreams: Record<string, MediaStream>
  speakingUserIds: Set<string>
  screenSharing: boolean
  localScreenStream: MediaStream | null
  screenShareQuality: ScreenShareQuality | null
  remoteScreenStreams: Record<string, MediaStream>
  videoEnabled: boolean
  localCameraStream: MediaStream | null
  remoteCameraStreams: Record<string, MediaStream>
  error: string | null
  join: (channelId: string, currentUserId: string) => Promise<void>
  leave: () => void
  toggleMute: () => void
  toggleDeafen: () => void
  startScreenShare: (sourceId: string, quality: ScreenShareQuality) => Promise<void>
  updateScreenShareQuality: (quality: ScreenShareQuality) => Promise<void>
  stopScreenShare: () => void
  toggleVideo: () => Promise<void>
  setMicSensitivity: (value: number) => void
  setLocalPlaybackMuted: (muted: boolean) => void
}

let phoenixChannel: Channel | null = null
let mesh: MeshManager | null = null
let speakingDetector: SpeakingDetector | null = null
// Guardada pra poder recapturar a MESMA fonte com novos parâmetros de
// qualidade sem reabrir o ScreenSharePicker (ver updateScreenShareQuality
// abaixo) — o handler do main (setDisplayMediaRequestHandler) consome
// `pendingScreenSourceId` a cada chamada (main/index.ts), então cada
// recaptura precisa chamar selectSource de novo com o mesmo id.
let lastScreenSourceId: string | null = null

export const useVoiceStore = create<VoiceState>((set, get) => ({
  status: 'idle',
  channelId: null,
  participants: [],
  localMuted: false,
  localDeafened: false,
  localPlaybackMuted: false,
  localAudioStream: null,
  remoteAudioStreams: {},
  speakingUserIds: new Set(),
  screenSharing: false,
  localScreenStream: null,
  screenShareQuality: null,
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

    // Cancelamento de eco/ruído são constraints de captura (Configurações →
    // Microfone, ver settingsStore.ts) — lidas aqui uma vez, no momento de
    // entrar; ajustar depois de já estar na chamada usa applyConstraints()
    // direto na track (SettingsModal.tsx), sem precisar recapturar nem
    // reentrar no canal.
    const micSettings = useSettingsStore.getState().mic
    let localStream: MediaStream
    try {
      localStream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: micSettings.echoCancellation,
          noiseSuppression: micSettings.noiseSuppression
        }
      })
    } catch (err) {
      set({
        status: 'idle',
        channelId: null,
        error: err instanceof Error ? `microfone: ${err.message}` : 'falha ao acessar o microfone'
      })
      return
    }

    const channel = socket.channel(`voice:${channelId}`, {})

    // Indicador de fala de verdade (nível de áudio), não só "não mutado" —
    // ver webrtc/SpeakingDetector.ts. Observa o mic local desde já; cada
    // peer remoto entra em onRemoteTrack (áudio) abaixo, assim que a track
    // chega.
    const detector = new SpeakingDetector(
      (speaking) => set({ speakingUserIds: speaking }),
      micSettings.micSensitivity
    )
    detector.watch(currentUserId, localStream)

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
            detector.watch(peerId, stream)
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
            detector.unwatch(peerId)
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
          detector.unwatch(peerId)
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
      detector.destroy()
      set({ status: 'idle', channelId: null, error: 'não foi possível entrar no canal de voz' })
      return
    }

    mesh = meshManager
    phoenixChannel = channel
    speakingDetector = detector
    set({ status: 'connected', localAudioStream: localStream })
  },

  leave: () => {
    mesh?.destroy()
    mesh = null
    speakingDetector?.destroy()
    speakingDetector = null
    phoenixChannel?.leave()
    phoenixChannel = null
    lastScreenSourceId = null
    set({
      status: 'idle',
      channelId: null,
      participants: [],
      localAudioStream: null,
      remoteAudioStreams: {},
      speakingUserIds: new Set(),
      localMuted: false,
      localDeafened: false,
      localPlaybackMuted: false,
      screenSharing: false,
      localScreenStream: null,
      screenShareQuality: null,
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

  startScreenShare: async (sourceId, quality) => {
    const channel = phoenixChannel
    if (!channel || !mesh) return
    set({ error: null })

    await window.api.screenShare.selectSource(sourceId)

    let stream: MediaStream
    try {
      // Dispara o handler de main (setDisplayMediaRequestHandler), que já
      // sabe qual fonte liberar por causa do selectSource acima. `ideal`
      // (não `exact`) pra resolução/fps de propósito — vira um pedido, não
      // uma trava: uma tela física menor que o pedido (ex.: 1440p pedido
      // numa tela 1080p) não deve fazer o compartilhamento falhar inteiro.
      stream = await navigator.mediaDevices.getDisplayMedia({
        video: {
          width: { ideal: quality.width },
          height: { ideal: quality.height },
          frameRate: { ideal: quality.frameRate }
        }
      })
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
    lastScreenSourceId = sourceId
    set({ screenSharing: true, localScreenStream: stream, screenShareQuality: quality })
  },

  // Muda resolução/fps já transmitindo: recaptura a MESMA fonte (guardada
  // acima) nos novos parâmetros e troca a track com mesh.setScreenTrack.
  // Como o RTCRtpSender de tela já existe (negociado no início do
  // compartilhamento), isso é só um replaceTrack local em cada peer — sem
  // renegociação e sem precisar avisar o servidor (screen_share:start já
  // foi confirmado, ninguém trocou quem está compartilhando).
  updateScreenShareQuality: async (quality) => {
    const current = get().localScreenStream
    if (!get().screenSharing || !mesh || !lastScreenSourceId || !current) return
    set({ error: null })

    // Para a captura atual ANTES de pedir a nova — testado ao vivo: se a
    // antiga ainda está viva no momento do getDisplayMedia, o Chromium
    // reaproveita a sessão de captura já em andamento pra essa mesma fonte
    // e ignora os novos parâmetros de resolução/fps por completo (a troca
    // "funcionava" do lado do sender — track id novo, sem erro — mas o
    // vídeo de verdade nunca mudava de qualidade pro peer remoto).
    current.getTracks().forEach((track) => track.stop())

    await window.api.screenShare.selectSource(lastScreenSourceId)

    let stream: MediaStream
    try {
      stream = await navigator.mediaDevices.getDisplayMedia({
        video: {
          width: { ideal: quality.width },
          height: { ideal: quality.height },
          frameRate: { ideal: quality.frameRate }
        }
      })
    } catch (err) {
      // A captura antiga já foi parada acima — não tem como manter o
      // compartilhamento anterior rodando, então encerra de vez (mesma
      // limpeza de stopScreenShare, inclusive avisando o servidor) em vez
      // de deixar um estado "compartilhando" com uma track morta.
      get().stopScreenShare()
      set({
        error:
          err instanceof Error ? `qualidade da tela: ${err.message}` : 'falha ao mudar a qualidade da tela'
      })
      return
    }

    mesh.setScreenTrack(stream)
    const track = stream.getVideoTracks()[0]
    if (track) {
      track.onended = () => get().stopScreenShare()
    }
    set({ localScreenStream: stream, screenShareQuality: quality })
  },

  stopScreenShare: () => {
    mesh?.setScreenTrack(null)
    phoenixChannel?.push('screen_share:stop', {})
    lastScreenSourceId = null
    set({ screenSharing: false, localScreenStream: null, screenShareQuality: null })
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
  },

  // O SpeakingDetector é privado desse módulo (variável `speakingDetector`
  // acima) — essa é a única forma de ajustar o limiar já em chamada,
  // chamada pelo SettingsModal.tsx a cada mudança no slider. Sem efeito
  // (e sem erro) se não estiver conectado; a próxima chamada já entra com
  // o valor novo de qualquer forma, lido do settingsStore em join().
  setMicSensitivity: (value) => {
    speakingDetector?.setThreshold(value)
  },

  // Chamado pelo goLiveStore, não por UI direta — ver o comentário de
  // `localPlaybackMuted` na interface acima.
  setLocalPlaybackMuted: (muted) => {
    set({ localPlaybackMuted: muted })
  }
}))
