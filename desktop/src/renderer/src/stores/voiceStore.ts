import { create } from 'zustand'
import { Presence } from 'phoenix'
import type { Channel } from 'phoenix'
import { getSocket } from '../services/socket'
import { MeshManager } from '../webrtc/MeshManager'
import { SpeakingDetector } from '../webrtc/SpeakingDetector'
import { useSettingsStore } from './settingsStore'
import { playJoinVoiceSound, playLeaveVoiceSound, playMuteSound, playUnmuteSound } from '../services/soundCues'
import { limitAudioTrack } from '../webrtc/audioLimiter'

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
  // v1.4.0 — diz pra quem recebe se a track de áudio extra dessa pessoa
  // (além do mic, que já manda uma sempre) é som do PC compartilhado junto
  // da tela, não o microfone. Ver a desambiguação em onRemoteTrack abaixo.
  screen_sharing_audio: boolean
  joined_at: number
}

export interface VoiceParticipant extends PresenceMeta {
  userId: string
}

type SystemAudioSource = 'screenshare' | 'golive'

interface VoiceState {
  status: 'idle' | 'connecting' | 'connected'
  channelId: string | null
  participants: VoiceParticipant[]
  localMuted: boolean
  localDeafened: boolean
  // Sem relação com mute/deafen (que também mexem no mic) — só reprodução
  // local. Ligado enquanto QUALQUER captura de som do PC estiver ativa —
  // Go Live (goLiveStore.startGoLive) ou a própria tela compartilhada aqui
  // (startScreenShare, v1.4.0): sem isso, o áudio de voz que o app está
  // tocando pelos alto-falantes entraria na captura de loopback do sistema
  // e voltaria pra quem está assistindo — inclusive pra quem já ouve a
  // mesma voz ao vivo pela chamada, um eco duplicado. Derivado de
  // `activeSystemAudioSources` (module-level, abaixo) em vez de um bool
  // solto — as duas fontes podem estar ativas ao mesmo tempo (transmitindo
  // Go Live E compartilhando tela com som), e só faz sentido desmutar
  // quando a ÚLTIMA delas parar, não a primeira.
  localPlaybackMuted: boolean
  localAudioStream: MediaStream | null
  remoteAudioStreams: Record<string, MediaStream>
  // Volume (0–2, ou seja 0–200%) por pessoa — mic remoto e tela remota,
  // ajustado pelo menu de botão direito em VoicePanel.tsx. Sem entrada pra
  // um id = 100% (padrão). Não é resetado por watch/unwatch, só em leave() —
  // é uma preferência da sessão, não algo que deveria voltar ao padrão só
  // porque a pessoa parou e voltou a compartilhar a tela.
  remoteMicVolumes: Record<string, number>
  remoteScreenVolumes: Record<string, number>
  speakingUserIds: Set<string>
  screenSharing: boolean
  localScreenStream: MediaStream | null
  screenShareQuality: ScreenShareQuality | null
  // Preservado separado da própria track de áudio porque
  // updateScreenShareQuality recaptura a fonte (nova getDisplayMedia) e
  // precisa saber se deve pedir som de novo.
  screenShareIncludesAudio: boolean
  remoteScreenStreams: Record<string, MediaStream>
  videoEnabled: boolean
  localCameraStream: MediaStream | null
  remoteCameraStreams: Record<string, MediaStream>
  error: string | null
  join: (channelId: string, currentUserId: string) => Promise<void>
  leave: () => void
  toggleMute: () => void
  toggleDeafen: () => void
  startScreenShare: (sourceId: string, quality: ScreenShareQuality, includeAudio: boolean) => Promise<void>
  updateScreenShareQuality: (quality: ScreenShareQuality) => Promise<void>
  stopScreenShare: () => void
  toggleVideo: () => Promise<void>
  setMicSensitivity: (value: number) => void
  setRemoteMicVolume: (peerId: string, volume: number) => void
  setRemoteScreenVolume: (peerId: string, volume: number) => void
  // Chamadas pelo goLiveStore e por essa própria store (startScreenShare/
  // stopScreenShare) — ver o comentário de `localPlaybackMuted` acima e de
  // `activeSystemAudioSources` abaixo.
  addSystemAudioSource: (source: SystemAudioSource) => void
  removeSystemAudioSource: (source: SystemAudioSource) => void
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
// Quem está ativamente capturando som do sistema agora (ver
// localPlaybackMuted acima) — contador por origem, não um bool: só desmuta
// a reprodução local quando o conjunto fica vazio.
const activeSystemAudioSources = new Set<SystemAudioSource>()
// Limiter aplicado ao áudio de sistema da tela compartilhada (v1.7.0, ver
// webrtc/audioLimiter.ts) — guardado à parte porque a track crua fica FORA
// do `stream` normal depois de aplicado (removida e trocada pela versão
// limitada, pra continuar dentro do mesmo MediaStream e preservar o
// agrupamento por msid com a track de vídeo — ver MeshManager.ts), então
// só isso aqui ainda tem a referência pra parar ela de verdade depois.
let screenAudioLimiter: { rawTrack: MediaStreamTrack; cleanup: () => void } | null = null

function applyScreenAudioLimiter(stream: MediaStream): void {
  const rawTrack = stream.getAudioTracks()[0]
  if (!rawTrack) return
  const { track: limitedTrack, cleanup } = limitAudioTrack(rawTrack)
  stream.removeTrack(rawTrack)
  stream.addTrack(limitedTrack)
  screenAudioLimiter = { rawTrack, cleanup }
}

function stopScreenAudioLimiter(): void {
  if (!screenAudioLimiter) return
  screenAudioLimiter.rawTrack.stop()
  screenAudioLimiter.cleanup()
  screenAudioLimiter = null
}

export const useVoiceStore = create<VoiceState>((set, get) => ({
  status: 'idle',
  channelId: null,
  participants: [],
  localMuted: false,
  localDeafened: false,
  localPlaybackMuted: false,
  localAudioStream: null,
  remoteAudioStreams: {},
  remoteMicVolumes: {},
  remoteScreenVolumes: {},
  speakingUserIds: new Set(),
  screenSharing: false,
  localScreenStream: null,
  screenShareQuality: null,
  screenShareIncludesAudio: false,
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
            // v1.4.0: agora existem duas origens possíveis de áudio por
            // peer — o mic (sempre presente desde o início da chamada) e o
            // som da tela compartilhada (só chega bem depois, se/quando a
            // pessoa ligar "com áudio" — MeshManager.setScreenAudioTrack
            // usa o MESMO MediaStream local da track de vídeo da tela, então
            // aqui as duas chegam como o MESMO objeto `stream` já usado em
            // remoteScreenStreams[peerId], se o vídeo já tiver chegado antes
            // — daí o primeiro teste abaixo). Se ainda não deu tempo (áudio
            // chegando antes do vídeo), cai pro Presence, igual à
            // desambiguação de vídeo logo adiante.
            const state = get()
            const participant = state.participants.find((p) => p.userId === peerId)
            // O mic já existe desde o início da chamada, bem antes de
            // alguém poder ligar "som da tela" — por isso o teste de
            // fallback compara contra a REFERÊNCIA do stream do mic já
            // conhecido (não só "existe algum"), senão o caso mais comum
            // (mic já conectado, som da tela chega depois) cairia no `!`
            // (mic existe) e classificaria errado.
            const isScreenAudio =
              state.remoteScreenStreams[peerId] === stream ||
              (participant?.screen_sharing_audio && state.remoteAudioStreams[peerId] !== stream)

            if (isScreenAudio) {
              set((s) => ({ remoteScreenStreams: { ...s.remoteScreenStreams, [peerId]: stream } }))
              return
            }

            detector.watch(peerId, stream)
            set((s) => ({ remoteAudioStreams: { ...s.remoteAudioStreams, [peerId]: stream } }))
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
              const screenStream = state.remoteScreenStreams[peerId]
              const screenAudioTrack = screenStream?.getAudioTracks().find((t) => t.id === trackId)
              if (screenAudioTrack) {
                // Só o áudio da tela terminou — a track de vídeo (se ainda
                // ativa) continua no mesmo MediaStream normalmente.
                screenStream.removeTrack(screenAudioTrack)
                return { remoteScreenStreams: { ...state.remoteScreenStreams } }
              }
              if (state.remoteAudioStreams[peerId]?.getTracks().some((t) => t.id === trackId)) {
                detector.unwatch(peerId)
                const rest = { ...state.remoteAudioStreams }
                delete rest[peerId]
                return { remoteAudioStreams: rest }
              }
              return {}
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

      // Bug real reportado (v1.7.1): quem já estava na call via câmera/tela
      // de outra pessoa que depois desligou ficava com um tile pequeno
      // travado (último frame congelado) pro resto da chamada — nunca
      // sumia. Causa: câmera/tela usam replaceTrack(null) pra desligar, de
      // propósito, pra nunca renegociar (ver o comentário no topo de
      // MeshManager.ts) — mas replaceTrack(null) só deixa a track do
      // RECEPTOR "muted", nunca "ended", e só 'ended' dispara
      // onRemoteTrackEnded (que é quem limpa remoteCameraStreams/
      // remoteScreenStreams). Corrigido aqui, não lá: Presence já é a
      // fonte de verdade de "esse peer está com câmera/tela ligada?" (é o
      // que já desambigua qual track é qual, logo abaixo) — reaproveitada
      // pra também limpar o que o evento de track nunca limpou sozinho.
      // Exige AS DUAS coisas (Presence dizendo que desligou E a track já
      // `muted` de verdade) antes de apagar, não só uma — só Presence
      // arriscaria apagar um compartilhamento novo e válido ainda a
      // caminho (a classificação em onRemoteTrack roda numa corrida
      // parecida, ver o comentário lá) já que esse evento dispara UMA vez
      // só; apagar cedo demais o perderia pra sempre, sem nada que
      // reponha depois.
      set((state) => {
        let cameraStreams: typeof state.remoteCameraStreams | null = null
        let screenStreams: typeof state.remoteScreenStreams | null = null
        for (const participant of list) {
          const camera = state.remoteCameraStreams[participant.userId]
          if (!participant.video && camera && camera.getVideoTracks().every((t) => t.muted)) {
            cameraStreams ??= { ...state.remoteCameraStreams }
            delete cameraStreams[participant.userId]
          }
          const screen = state.remoteScreenStreams[participant.userId]
          if (!participant.screen_sharing && screen && screen.getVideoTracks().every((t) => t.muted)) {
            screenStreams ??= { ...state.remoteScreenStreams }
            delete screenStreams[participant.userId]
          }
        }
        if (!cameraStreams && !screenStreams) return {}
        return {
          ...(cameraStreams && { remoteCameraStreams: cameraStreams }),
          ...(screenStreams && { remoteScreenStreams: screenStreams })
        }
      })
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
    playJoinVoiceSound()
  },

  leave: () => {
    // `join()` sempre chama `leave()` primeiro, como reset defensivo — sem
    // esse `wasActive`, o som de "saiu da call" tocaria toda vez que a
    // pessoa entrasse pela primeira vez (nunca esteve conectada de
    // verdade, nada foi "deixado"). Só toca quando havia algo real pra
    // deixar (conectado ou tentando conectar); trocar de canal ainda soa
    // como sair+entrar, igual ao Discord.
    const wasActive = get().status !== 'idle'
    mesh?.destroy()
    mesh = null
    speakingDetector?.destroy()
    speakingDetector = null
    phoenixChannel?.leave()
    phoenixChannel = null
    lastScreenSourceId = null
    stopScreenAudioLimiter()
    activeSystemAudioSources.clear()
    set({
      status: 'idle',
      channelId: null,
      participants: [],
      localAudioStream: null,
      remoteAudioStreams: {},
      remoteMicVolumes: {},
      remoteScreenVolumes: {},
      speakingUserIds: new Set(),
      localMuted: false,
      localDeafened: false,
      localPlaybackMuted: false,
      screenSharing: false,
      localScreenStream: null,
      screenShareQuality: null,
      screenShareIncludesAudio: false,
      remoteScreenStreams: {},
      videoEnabled: false,
      localCameraStream: null,
      remoteCameraStreams: {}
    })
    if (wasActive) playLeaveVoiceSound()
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
    if (muted) playMuteSound()
    else playUnmuteSound()
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

  startScreenShare: async (sourceId, quality, includeAudio) => {
    const channel = phoenixChannel
    if (!channel || !mesh) return
    set({ error: null })

    await window.api.screenShare.selectSource(sourceId, includeAudio)

    let stream: MediaStream
    let audioCaptureFailed = false
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
        },
        audio: includeAudio
      })
    } catch (err) {
      if (!includeAudio) {
        set({
          error:
            err instanceof Error ? `compartilhamento de tela: ${err.message}` : 'falha ao capturar a tela'
        })
        return
      }
      // Mesma limitação de hardware documentada no Go Live (goLiveStore.ts,
      // startGoLive) — loopback de áudio do Windows falha (NotReadableError)
      // em algumas placas/dispositivos de áudio USB/sem fio. Em vez de
      // travar o compartilhamento inteiro por causa só do som, tenta de
      // novo sem pedir áudio.
      await window.api.screenShare.selectSource(sourceId, false)
      try {
        stream = await navigator.mediaDevices.getDisplayMedia({
          video: {
            width: { ideal: quality.width },
            height: { ideal: quality.height },
            frameRate: { ideal: quality.frameRate }
          }
        })
        audioCaptureFailed = true
      } catch (videoErr) {
        set({
          error:
            videoErr instanceof Error
              ? `compartilhamento de tela: ${videoErr.message}`
              : 'falha ao capturar a tela'
        })
        return
      }
    }

    const audioIncluded = includeAudio && !audioCaptureFailed

    // Sem limite de compartilhamentos simultâneos por sala (servidor único,
    // ~20 pessoas, não público) — `screen_share:start` sempre responde ok,
    // mas ainda usa push/reply em vez de fire-and-forget pra não perder um
    // erro genérico de canal (rede caiu, etc.).
    const ok = await new Promise<boolean>((resolve) => {
      channel
        .push('screen_share:start', { include_audio: audioIncluded })
        .receive('ok', () => resolve(true))
        .receive('error', () => resolve(false))
    })

    if (!ok) {
      stream.getTracks().forEach((track) => track.stop())
      set({ error: 'não foi possível compartilhar a tela' })
      return
    }

    if (audioIncluded) applyScreenAudioLimiter(stream)
    mesh.setScreenTrack(stream)
    mesh.setScreenAudioTrack(audioIncluded ? stream : null)
    const track = stream.getVideoTracks()[0]
    if (track) {
      track.onended = () => get().stopScreenShare()
    }
    lastScreenSourceId = sourceId
    if (audioIncluded) get().addSystemAudioSource('screenshare')
    set({
      screenSharing: true,
      localScreenStream: stream,
      screenShareQuality: quality,
      screenShareIncludesAudio: audioIncluded,
      error: audioCaptureFailed
        ? 'não foi possível capturar o som do PC nesse dispositivo de áudio — compartilhando só a tela'
        : null
    })
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

    const includeAudio = get().screenShareIncludesAudio

    // Para a captura atual ANTES de pedir a nova — testado ao vivo: se a
    // antiga ainda está viva no momento do getDisplayMedia, o Chromium
    // reaproveita a sessão de captura já em andamento pra essa mesma fonte
    // e ignora os novos parâmetros de resolução/fps por completo (a troca
    // "funcionava" do lado do sender — track id novo, sem erro — mas o
    // vídeo de verdade nunca mudava de qualidade pro peer remoto).
    current.getTracks().forEach((track) => track.stop())
    stopScreenAudioLimiter()

    await window.api.screenShare.selectSource(lastScreenSourceId, includeAudio)

    let stream: MediaStream
    let audioCaptureFailed = false
    try {
      stream = await navigator.mediaDevices.getDisplayMedia({
        video: {
          width: { ideal: quality.width },
          height: { ideal: quality.height },
          frameRate: { ideal: quality.frameRate }
        },
        audio: includeAudio
      })
    } catch (err) {
      if (!includeAudio) {
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
      // Mesma limitação de hardware do startScreenShare/Go Live — tenta de
      // novo só com vídeo em vez de derrubar o compartilhamento inteiro.
      await window.api.screenShare.selectSource(lastScreenSourceId, false)
      try {
        stream = await navigator.mediaDevices.getDisplayMedia({
          video: {
            width: { ideal: quality.width },
            height: { ideal: quality.height },
            frameRate: { ideal: quality.frameRate }
          }
        })
        audioCaptureFailed = true
      } catch (videoErr) {
        get().stopScreenShare()
        set({
          error:
            videoErr instanceof Error
              ? `qualidade da tela: ${videoErr.message}`
              : 'falha ao mudar a qualidade da tela'
        })
        return
      }
    }

    const audioIncluded = includeAudio && !audioCaptureFailed
    if (audioIncluded) applyScreenAudioLimiter(stream)
    mesh.setScreenTrack(stream)
    mesh.setScreenAudioTrack(audioIncluded ? stream : null)
    if (includeAudio && !audioIncluded) get().removeSystemAudioSource('screenshare')

    const track = stream.getVideoTracks()[0]
    if (track) {
      track.onended = () => get().stopScreenShare()
    }
    set({
      localScreenStream: stream,
      screenShareQuality: quality,
      screenShareIncludesAudio: audioIncluded,
      error: audioCaptureFailed
        ? 'não foi possível manter o som do PC nessa qualidade — continuando só com a tela'
        : null
    })
  },

  stopScreenShare: () => {
    mesh?.setScreenTrack(null)
    mesh?.setScreenAudioTrack(null)
    stopScreenAudioLimiter()
    if (get().screenShareIncludesAudio) get().removeSystemAudioSource('screenshare')
    phoenixChannel?.push('screen_share:stop', {})
    lastScreenSourceId = null
    set({
      screenSharing: false,
      localScreenStream: null,
      screenShareQuality: null,
      screenShareIncludesAudio: false
    })
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

  // Botão direito num participante da call (VoicePanel.tsx) — só afeta a
  // reprodução local do RemoteAudio dessa pessoa, nunca o que ela manda de
  // verdade (não existe "volume de envio" no WebRTC, só o que cada ouvinte
  // escolhe localmente).
  setRemoteMicVolume: (peerId, volume) => {
    set((state) => ({ remoteMicVolumes: { ...state.remoteMicVolumes, [peerId]: volume } }))
  },

  // Idem, mas pro som de uma tela compartilhada remota.
  setRemoteScreenVolume: (peerId, volume) => {
    set((state) => ({ remoteScreenVolumes: { ...state.remoteScreenVolumes, [peerId]: volume } }))
  },

  // Chamadas pelo goLiveStore (Go Live) e por essa própria store (tela com
  // som) — ver o comentário de `localPlaybackMuted`/`activeSystemAudioSources`
  // acima. Um Set em vez de um bool porque as duas origens podem estar
  // ativas ao mesmo tempo.
  addSystemAudioSource: (source) => {
    activeSystemAudioSources.add(source)
    set({ localPlaybackMuted: true })
  },

  removeSystemAudioSource: (source) => {
    activeSystemAudioSources.delete(source)
    set({ localPlaybackMuted: activeSystemAudioSources.size > 0 })
  }
}))
