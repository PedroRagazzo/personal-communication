import { create } from 'zustand'
import { Presence } from 'phoenix'
import type { Channel } from 'phoenix'
import {
  Room,
  RoomEvent,
  type RemoteTrack,
  type RemoteTrackPublication,
  type RemoteParticipant
} from 'livekit-client'
import { getSocket } from '../services/socket'
import { useVoiceStore } from './voiceStore'
import { playLiveStartSound, playLiveStopSound } from '../services/soundCues'
import { limitAudioTrack } from '../webrtc/audioLimiter'

// Go Live (FASE 9 no backend, FASE 11 fatia 10 aqui): diferente de
// voiceStore.ts, aqui não existe mesh nenhum — mídia vai direto
// cliente <-> LiveKit (SFU), nunca pelo Phoenix. O Channel `live:{id}`
// só autoriza e devolve tokens (ver GoLiveChannel no backend); a conexão
// de mídia de verdade é o `Room` do `livekit-client`, biblioteca
// oficial da LiveKit (`livekit/client-sdk-js`).
//
// Entrar no canal de voz já entra aqui também (ver VoicePanel.tsx) —
// conecta ao LiveKit com um token *subscriber-only*. `autoSubscribe:
// false` (v1.3.0, a pedido do usuário) — assistir uma transmissão agora é
// uma escolha explícita (watchStream/stopWatchingStream), não automático:
// só entrar no canal não baixa vídeo/áudio de ninguém, só fica sabendo
// (via TrackPublished) o que está disponível. "Ir ao vivo" troca pra um
// token *publisher*: o token de assistir não tem permissão de publicar,
// então vira desconectar+reconectar com o token novo (não existe upgrade
// de permissão numa conexão já aberta na API do LiveKit) — feito no mesmo
// objeto `Room`, não precisa recriar. `autoSubscribe: false` precisa ser
// passado de novo nesse reconnect, senão volta pro padrão (true).
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
  // Quem a pessoa escolheu assistir de verdade (setSubscribed(true) já
  // aplicado) — diferente de `participants.filter(p => p.live)`, que é só
  // quem ESTÁ transmitindo, watchable ou não.
  watchingUserIds: Set<string>
  // Volume (0–2) por transmissão, ajustado pelo menu de botão direito em
  // VoicePanel.tsx — sem entrada pra um id = 100%. Não é limpo em
  // stopWatchingStream de propósito (preferência da sessão, não algo que
  // deveria voltar ao padrão só por sair e entrar de novo na mesma
  // transmissão), só em leave().
  remoteVolumes: Record<string, number>
  error: string | null
  join: (channelId: string) => Promise<void>
  leave: () => void
  startGoLive: (sourceId: string, includeSystemAudio: boolean) => Promise<void>
  stopGoLive: () => void
  watchStream: (peerId: string) => void
  stopWatchingStream: (peerId: string) => void
  setRemoteVolume: (peerId: string, volume: number) => void
}

let phoenixChannel: Channel | null = null
let room: Room | null = null
// Track publicada de verdade quando transmite com som do PC — nunca a
// crua (ver limitAudioTrack em webrtc/audioLimiter.ts, v1.7.0: áudio
// "estourando" reportado por um usuário). Guardada à parte de
// `localStream` (que continua sendo a captura crua, usada só pro preview
// local) porque o unpublish/stop precisa da REFERÊNCIA exata da track
// que foi publicada, e essa não é a mesma que `stream.getAudioTracks()[0]`.
let publishedAudioTrack: MediaStreamTrack | null = null
let audioLimiterCleanup: (() => void) | null = null

function cleanupAudioLimiter(): void {
  audioLimiterCleanup?.()
  audioLimiterCleanup = null
  publishedAudioTrack?.stop()
  publishedAudioTrack = null
}

export const useGoLiveStore = create<GoLiveState>((set, get) => ({
  status: 'idle',
  channelId: null,
  participants: [],
  isLive: false,
  localStream: null,
  remoteStreams: {},
  watchingUserIds: new Set(),
  remoteVolumes: {},
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

    // Uma track (vídeo OU áudio) por evento — junta as duas no mesmo
    // MediaStream por participante (por identity), pra um único <video>
    // tocar as duas juntas sem precisar de elemento de áudio separado.
    liveRoom.on(
      RoomEvent.TrackSubscribed,
      (track: RemoteTrack, _pub: RemoteTrackPublication, participant: RemoteParticipant) => {
        set((state) => {
          const stream = state.remoteStreams[participant.identity] ?? new MediaStream()
          if (!stream.getTracks().some((t) => t.id === track.mediaStreamTrack.id)) {
            stream.addTrack(track.mediaStreamTrack)
          }
          return { remoteStreams: { ...state.remoteStreams, [participant.identity]: stream } }
        })
      }
    )
    liveRoom.on(
      RoomEvent.TrackUnsubscribed,
      (track: RemoteTrack, _pub: RemoteTrackPublication, participant: RemoteParticipant) => {
        set((state) => {
          const stream = state.remoteStreams[participant.identity]
          if (!stream) return state
          stream.removeTrack(track.mediaStreamTrack)
          if (stream.getTracks().length > 0) {
            return { remoteStreams: { ...state.remoteStreams, [participant.identity]: stream } }
          }
          const rest = { ...state.remoteStreams }
          delete rest[participant.identity]
          return { remoteStreams: rest }
        })
      }
    )
    // Reconexão (alguém que eu já assistia foi ao vivo de novo, ou o
    // startGoLive abaixo reconectou o Room) reanuncia as tracks — se eu já
    // tinha escolhido assistir essa pessoa, reinscreve sozinho, sem exigir
    // clicar "Entrar" de novo.
    liveRoom.on(
      RoomEvent.TrackPublished,
      (publication: RemoteTrackPublication, participant: RemoteParticipant) => {
        if (get().watchingUserIds.has(participant.identity)) publication.setSubscribed(true)
      }
    )

    // Presence precisa estar registrada ANTES do channel.join() (mesmo
    // padrão de voiceStore.ts) — bug real reportado, achado só agora que o
    // Go Live foi testado de verdade com 2 pessoas (nunca dava pra verificar
    // isso neste ambiente sem Docker/LiveKit real, ver CLAUDE.md). O backend
    // manda o "presence_state" logo depois do reply de join
    // (go_live_channel.ex, handle_info(:after_join, ...)) — se a `Presence`
    // só é criada DEPOIS do `await liveRoom.connect(...)` (uma operação de
    // rede de verdade contra o LiveKit, não instantânea), esse push chega e
    // é descartado em silêncio (nenhum listener ainda vinculado pra
    // "presence_state"). Resultado: quem já estava ao vivo ANTES dessa
    // pessoa entrar no canal nunca aparece como "ao vivo" pra ela — nem o
    // botão do roster nem o card do GoLiveStreams, já que os dois dependem
    // do mesmo `participants`/`live` — até essa outra pessoa parar e
    // começar a transmitir de novo (o que gera um presence_diff incremental,
    // esse sim capturado). Corrigido registrando a Presence antes até do
    // `channel.join()`, não só antes do `liveRoom.connect()`.
    const presence = new Presence(channel)
    presence.onSync(() => {
      const list = presence.list<GoLiveParticipant>((userId, pres) => ({
        userId,
        ...(pres.metas[0] as PresenceMeta)
      }))

      // Som de identificação (v1.5.0, a pedido do usuário) — toca pra
      // QUALQUER transição real de "ao vivo" nessa sala, incluindo a
      // própria (funciona como confirmação de "sua transmissão começou",
      // igual ao som de entrar na call). Comparado ANTES do set() abaixo
      // (que substitui `participants` pela lista nova) — senão não teria
      // mais o "antes" pra comparar.
      const previouslyLive = new Set(get().participants.filter((p) => p.live).map((p) => p.userId))
      const nowLive = new Set(list.filter((p) => p.live).map((p) => p.userId))
      for (const userId of nowLive) {
        if (!previouslyLive.has(userId)) playLiveStartSound()
      }
      for (const userId of previouslyLive) {
        if (!nowLive.has(userId)) playLiveStopSound()
      }

      set((state) => {
        // Quem parou de transmitir sai de "assistindo" também — senão, se
        // essa pessoa for ao vivo de novo mais tarde, o watchStream
        // original nunca disparou o reinscreve-sozinho do TrackPublished
        // acima (o estado diz "assistindo" mas nunca foi resubscrito de
        // verdade pra essa transmissão nova).
        const stillLive = new Set(list.filter((p) => p.live).map((p) => p.userId))
        const watchingUserIds = new Set(
          [...state.watchingUserIds].filter((id) => stillLive.has(id))
        )
        return { participants: list, watchingUserIds }
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
      await liveRoom.connect(url, token, { autoSubscribe: false })
    } catch (err) {
      channel.leave()
      set({
        status: 'idle',
        channelId: null,
        error: err instanceof Error ? `Go Live: ${err.message}` : 'não foi possível conectar ao LiveKit'
      })
      return
    }

    phoenixChannel = channel
    room = liveRoom
    set({ status: 'connected', channelId, participants: [], error: null })
  },

  leave: () => {
    const stream = get().localStream
    stream?.getTracks().forEach((track) => track.stop())
    cleanupAudioLimiter()
    room?.disconnect()
    room = null
    phoenixChannel?.leave()
    phoenixChannel = null
    // Defensivo — se saiu do canal ainda transmitindo, sem isso a pessoa
    // ficaria com a própria voz dos outros mudo pra sempre (ver
    // localPlaybackMuted/activeSystemAudioSources em voiceStore.ts).
    useVoiceStore.getState().removeSystemAudioSource('golive')
    set({
      status: 'idle',
      channelId: null,
      participants: [],
      isLive: false,
      localStream: null,
      remoteStreams: {},
      watchingUserIds: new Set(),
      remoteVolumes: {},
      error: null
    })
  },

  // Escolher assistir uma transmissão específica — setSubscribed(true) em
  // cada track publicada por essa pessoa (vídeo e, se tiver, áudio). Sem
  // isso ligado, o LiveKit nem manda os bytes (autoSubscribe: false acima)
  // — clicar "Entrar" é o que liga o download de verdade, não só a UI.
  watchStream: (peerId) => {
    const participant = room?.remoteParticipants.get(peerId)
    participant?.trackPublications.forEach((pub) => pub.setSubscribed(true))
    set((state) => ({ watchingUserIds: new Set(state.watchingUserIds).add(peerId) }))
  },

  // "Sair" da transmissão de alguém — desinscreve de verdade (para de
  // baixar vídeo/áudio, não só esconde na UI) e já limpa o stream local
  // na hora, sem esperar o TrackUnsubscribed assíncrono voltar do servidor.
  stopWatchingStream: (peerId) => {
    const participant = room?.remoteParticipants.get(peerId)
    participant?.trackPublications.forEach((pub) => pub.setSubscribed(false))
    set((state) => {
      const watchingUserIds = new Set(state.watchingUserIds)
      watchingUserIds.delete(peerId)
      const remoteStreams = { ...state.remoteStreams }
      delete remoteStreams[peerId]
      return { watchingUserIds, remoteStreams }
    })
  },

  startGoLive: async (sourceId, includeSystemAudio) => {
    const channel = phoenixChannel
    if (!channel || !room) return
    set({ error: null })

    await window.api.screenShare.selectSource(sourceId, includeSystemAudio)

    let stream: MediaStream
    let audioCaptureFailed = false
    try {
      // `audio: 'loopback'` (main/index.ts) só é pedido quando includeSystemAudio
      // é true — precisa desse `audio: true` aqui também pro Electron de
      // fato anexar a track capturada ao MediaStream devolvido.
      stream = await navigator.mediaDevices.getDisplayMedia({
        video: true,
        audio: includeSystemAudio
      })
    } catch (err) {
      if (!includeSystemAudio) {
        set({ error: err instanceof Error ? `Go Live: ${err.message}` : 'falha ao capturar a tela' })
        return
      }
      // Testado ao vivo: loopback de áudio do Windows falha
      // (NotReadableError) em algumas placas/dispositivos de áudio (USB/sem
      // fio, confirmado numa máquina real) — limitação de driver, não algo
      // que dê pra corrigir daqui. Em vez de travar a transmissão inteira
      // por causa só do áudio, tenta de novo sem pedir som.
      await window.api.screenShare.selectSource(sourceId, false)
      try {
        stream = await navigator.mediaDevices.getDisplayMedia({ video: true })
        audioCaptureFailed = true
      } catch (videoErr) {
        set({
          error:
            videoErr instanceof Error ? `Go Live: ${videoErr.message}` : 'falha ao capturar a tela'
        })
        return
      }
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
      await room.connect(reply.url, reply.token, { autoSubscribe: false })
      await room.localParticipant.publishTrack(stream.getVideoTracks()[0])
      const rawAudioTrack = stream.getAudioTracks()[0]
      if (rawAudioTrack) {
        const limited = limitAudioTrack(rawAudioTrack)
        publishedAudioTrack = limited.track
        audioLimiterCleanup = limited.cleanup
        await room.localParticipant.publishTrack(limited.track)
      }
    } catch (err) {
      stream.getTracks().forEach((track) => track.stop())
      cleanupAudioLimiter()
      phoenixChannel?.push('golive:stop', {})
      set({ error: err instanceof Error ? `Go Live: ${err.message}` : 'falha ao transmitir' })
      return
    }

    const videoTrack = stream.getVideoTracks()[0]
    if (videoTrack) videoTrack.onended = () => get().stopGoLive()

    // Reconectar (acima) invalida as inscrições anteriores — limpa streams
    // antigos; quem eu ainda quiser assistir volta sozinho via
    // TrackPublished + watchingUserIds já preservado.
    const audioIncluded = includeSystemAudio && !audioCaptureFailed
    if (audioIncluded) useVoiceStore.getState().addSystemAudioSource('golive')
    set({
      isLive: true,
      localStream: stream,
      remoteStreams: {},
      error: audioCaptureFailed
        ? 'não foi possível capturar o som do PC nesse dispositivo de áudio — transmitindo só a tela'
        : null
    })
  },

  stopGoLive: () => {
    const stream = get().localStream
    if (room) {
      const videoTrack = stream?.getVideoTracks()[0]
      if (videoTrack) room.localParticipant.unpublishTrack(videoTrack)
      if (publishedAudioTrack) room.localParticipant.unpublishTrack(publishedAudioTrack)
    }
    stream?.getTracks().forEach((t) => t.stop())
    cleanupAudioLimiter()
    phoenixChannel?.push('golive:stop', {})
    useVoiceStore.getState().removeSystemAudioSource('golive')
    set({ isLive: false, localStream: null })
  },

  // Botão direito numa transmissão (VoicePanel.tsx) — só reprodução local,
  // mesmo princípio do setRemoteMicVolume/setRemoteScreenVolume em
  // voiceStore.ts.
  setRemoteVolume: (peerId, volume) => {
    set((state) => ({ remoteVolumes: { ...state.remoteVolumes, [peerId]: volume } }))
  }
}))
