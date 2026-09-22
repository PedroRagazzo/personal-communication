// Mesh WebRTC (FASE 6/7/8 no backend, FASE 11 fatias 4/5/6 aqui): uma
// RTCPeerConnection por participante da sala, sinalização relayada via
// Phoenix Channel (voice:{channel_id} — ver stores/voiceStore.ts), mídia
// nunca passa pelo WebSocket. Nunca chamar isso fora de uma sala de voz
// pequena (~8 participantes só-áudio) — é exatamente o limite que
// docs/media.md documenta para o mesh. Tela (fatia 5) e câmera (fatia 6)
// reaproveitam as mesmas conexões — não são meshes separados, e as duas
// podem estar ativas ao mesmo tempo pra uma mesma pessoa.
//
// Perfect negotiation (papel polite/impolite por comparação de user_id,
// como docs/media.md especifica) evita que duas ofertas simultâneas
// (glare) corrompam o estado de sinalização quando dois peers entram quase
// ao mesmo tempo. Padrão de referência: https://developer.mozilla.org/docs/Web/API/WebRTC_API/Perfect_negotiation
//
// Câmera/tela usam criação PREGUIÇOSA de sender (só na primeira vez que
// ligam de verdade) e depois só replaceTrack — nunca removeTrack. Testado
// e descartado: pré-criar os dois transceivers de vídeo logo no addPeer
// (antes de qualquer negociação) parecia mais "limpo", mas quebra de um
// jeito sutil quando há glare na negociação inicial (dois peers entrando
// quase ao mesmo tempo) — o lado que perde o glare faz rollback da própria
// oferta, e os transceivers pré-criados por ELE ficam órfãos (nunca
// chegam a ser negociados), e a renegociação seguinte (ligar câmera/tela)
// tenta reaproveitar esses transceivers órfãos junto com os que vieram da
// oferta do outro lado — resultando numa oferta com m-lines fora de ordem
// ("the order of m-lines... doesn't match"). Criar o sender só quando a
// câmera/tela realmente liga (bem depois da negociação inicial já estar
// estável, na prática) evita esse cenário de glare por completo pra esses
// slots. Sem transceiver fixo por slot, a track de vídeo recebida não diz
// sozinha se é câmera ou tela — por isso stores/voiceStore.ts desambigua
// usando o que o Presence já informa.

export type SignalEvent = 'sdp:offer' | 'sdp:answer' | 'ice:candidate'
export type SignalSender = (toUserId: string, event: SignalEvent, payload: Record<string, unknown>) => void

export interface MeshCallbacks {
  onRemoteTrack: (peerId: string, track: MediaStreamTrack, stream: MediaStream) => void
  // trackId identifica QUAL track específica terminou (um peer pode ter
  // duas tracks de vídeo ao mesmo tempo — câmera e tela).
  onRemoteTrackEnded: (peerId: string, kind: 'audio' | 'video', trackId: string) => void
  onPeerRemoved: (peerId: string) => void
}

const DEFAULT_ICE_SERVERS: RTCIceServer[] = [{ urls: 'stun:stun.l.google.com:19302' }]

interface PeerEntry {
  connection: RTCPeerConnection
  polite: boolean
  makingOffer: boolean
  ignoreOffer: boolean
  pendingCandidates: RTCIceCandidateInit[]
  cameraSender: RTCRtpSender | null
  screenSender: RTCRtpSender | null
  screenAudioSender: RTCRtpSender | null
}

export class MeshManager {
  private peers = new Map<string, PeerEntry>()
  private localStream: MediaStream | null = null
  private cameraStream: MediaStream | null = null
  private screenStream: MediaStream | null = null
  private screenAudioStream: MediaStream | null = null
  // STUN público sozinho falha atrás de NAT simétrico/restritivo — TURN
  // (docker/coturn) entra como fallback assim que o backend devolve
  // credenciais efêmeras no join de voice:{id} (ver voiceStore.ts). Peers
  // adicionados antes disso (não deveria acontecer, mas por segurança)
  // ainda usam só STUN.
  private iceServers: RTCIceServer[] = DEFAULT_ICE_SERVERS

  constructor(
    private readonly localUserId: string,
    private readonly send: SignalSender,
    private readonly callbacks: MeshCallbacks
  ) {}

  addIceServer(server: RTCIceServer): void {
    this.iceServers = [...this.iceServers, server]
  }

  setLocalStream(stream: MediaStream): void {
    this.localStream = stream
    for (const { connection } of this.peers.values()) {
      this.attachLocalTracks(connection)
    }
  }

  setMuted(muted: boolean): void {
    this.localStream?.getAudioTracks().forEach((track) => {
      track.enabled = !muted
    })
  }

  setCameraTrack(stream: MediaStream | null): void {
    this.cameraStream?.getTracks().forEach((track) => track.stop())
    this.cameraStream = stream
    this.applyTrackSlot('cameraSender', stream, stream?.getVideoTracks()[0] ?? null)
  }

  setScreenTrack(stream: MediaStream | null): void {
    this.screenStream?.getTracks().forEach((track) => track.stop())
    this.screenStream = stream
    this.applyTrackSlot('screenSender', stream, stream?.getVideoTracks()[0] ?? null)
  }

  // Som do PC junto da tela (v1.4.0, a pedido do usuário) — mesmo padrão de
  // sender preguiçoso das outras duas tracks de vídeo (ver comentário no
  // topo do arquivo), só que pra áudio. `stream` aqui é o MESMO objeto
  // passado pra setScreenTrack (a captura inteira de getDisplayMedia, vídeo
  // + áudio juntos) — de propósito: assim os dois `addTrack` do lado de
  // quem envia usam o mesmo MediaStream local, o que faz o WebRTC agrupar
  // as duas tracks sob o mesmo msid, e do lado de quem recebe os dois
  // `ontrack` chegam com o MESMO `event.streams[0]` — um único <video>
  // (RemoteVideo) já toca as duas juntas, sem precisar de um <audio>
  // separado nem de juntar tracks manualmente (voiceStore.ts só desambigua
  // QUAL dicionário usar, não precisa remontar o MediaStream).
  setScreenAudioTrack(stream: MediaStream | null): void {
    this.screenAudioStream?.getTracks().forEach((track) => track.stop())
    this.screenAudioStream = stream
    this.applyTrackSlot('screenAudioSender', stream, stream?.getAudioTracks()[0] ?? null)
  }

  private applyTrackSlot(
    slot: 'cameraSender' | 'screenSender' | 'screenAudioSender',
    stream: MediaStream | null,
    track: MediaStreamTrack | null
  ): void {
    for (const entry of this.peers.values()) {
      const sender = entry[slot]
      if (sender) {
        // Já existe (negociado antes) — trocar não renegocia.
        sender.replaceTrack(track)
      } else if (track) {
        // Primeira vez que essa pessoa liga câmera/tela/som-da-tela nessa
        // chamada — única vez que isso renegocia de verdade.
        entry[slot] = entry.connection.addTrack(track, stream as MediaStream)
      }
    }
  }

  addPeer(peerId: string): void {
    if (this.peers.has(peerId) || peerId === this.localUserId) return

    const connection = new RTCPeerConnection({ iceServers: this.iceServers })
    // Papel determinístico: os dois lados calculam a mesma coisa (com os
    // operandos trocados), então sempre concordam sobre quem é polite.
    const polite = this.localUserId < peerId
    const entry: PeerEntry = {
      connection,
      polite,
      makingOffer: false,
      ignoreOffer: false,
      pendingCandidates: [],
      cameraSender: null,
      screenSender: null,
      screenAudioSender: null
    }
    this.peers.set(peerId, entry)

    connection.onnegotiationneeded = async () => {
      // Evita chamar setLocalDescription() de novo enquanto uma
      // negociação anterior ainda não voltou pra "stable" — sem isso, duas
      // renegociações próximas (ex.: ligar câmera logo depois de entrar)
      // podiam corromper a ordem das m-lines na oferta seguinte.
      if (connection.signalingState !== 'stable') return

      try {
        entry.makingOffer = true
        await connection.setLocalDescription()
        this.send(peerId, 'sdp:offer', { sdp: connection.localDescription })
      } catch (err) {
        console.error(`falha ao negociar oferta com ${peerId}`, err)
      } finally {
        entry.makingOffer = false
      }
    }

    connection.onicecandidate = ({ candidate }) => {
      if (candidate) this.send(peerId, 'ice:candidate', { candidate: candidate.toJSON() })
    }

    connection.ontrack = (event) => {
      const stream = event.streams[0] ?? new MediaStream([event.track])
      this.callbacks.onRemoteTrack(peerId, event.track, stream)
      event.track.addEventListener('ended', () => {
        this.callbacks.onRemoteTrackEnded(peerId, event.track.kind as 'audio' | 'video', event.track.id)
      })
    }

    connection.onconnectionstatechange = () => {
      if (connection.connectionState === 'failed' || connection.connectionState === 'closed') {
        this.removePeer(peerId)
      }
    }

    this.attachLocalTracks(connection)

    // Se eu já estiver com câmera/tela ligadas quando essa pessoa entrar
    // na sala, ela precisa receber isso desde já.
    if (this.cameraStream) {
      entry.cameraSender = connection.addTrack(this.cameraStream.getVideoTracks()[0], this.cameraStream)
    }
    if (this.screenStream) {
      entry.screenSender = connection.addTrack(this.screenStream.getVideoTracks()[0], this.screenStream)
    }
    if (this.screenAudioStream) {
      entry.screenAudioSender = connection.addTrack(
        this.screenAudioStream.getAudioTracks()[0],
        this.screenAudioStream
      )
    }
  }

  removePeer(peerId: string): void {
    const entry = this.peers.get(peerId)
    if (!entry) return
    entry.connection.close()
    this.peers.delete(peerId)
    this.callbacks.onPeerRemoved(peerId)
  }

  async handleSignal(fromUserId: string, event: SignalEvent, payload: Record<string, unknown>): Promise<void> {
    if (!this.peers.has(fromUserId)) this.addPeer(fromUserId)
    const entry = this.peers.get(fromUserId)
    if (!entry) return

    const { connection } = entry

    try {
      if (event === 'sdp:offer' || event === 'sdp:answer') {
        const description = payload.sdp as RTCSessionDescriptionInit
        const isOffer = description.type === 'offer'
        const collision = isOffer && (entry.makingOffer || connection.signalingState !== 'stable')
        entry.ignoreOffer = !entry.polite && collision
        if (entry.ignoreOffer) return

        await connection.setRemoteDescription(description)

        const pending = entry.pendingCandidates.splice(0)
        for (const candidate of pending) {
          await connection.addIceCandidate(candidate)
        }

        if (isOffer) {
          await connection.setLocalDescription()
          this.send(fromUserId, 'sdp:answer', { sdp: connection.localDescription })
        }
      } else if (event === 'ice:candidate') {
        const candidate = payload.candidate as RTCIceCandidateInit
        // ICE pode chegar antes do setRemoteDescription (corrida normal de
        // rede) — fila em vez de descartar.
        if (!connection.remoteDescription) {
          entry.pendingCandidates.push(candidate)
          return
        }
        await connection.addIceCandidate(candidate)
      }
    } catch (err) {
      if (!entry.ignoreOffer) console.error(`falha ao processar sinal de ${fromUserId}`, err)
    }
  }

  destroy(): void {
    for (const peerId of [...this.peers.keys()]) this.removePeer(peerId)
    this.localStream?.getTracks().forEach((track) => track.stop())
    this.localStream = null
    this.cameraStream?.getTracks().forEach((track) => track.stop())
    this.cameraStream = null
    this.screenStream?.getTracks().forEach((track) => track.stop())
    this.screenStream = null
    this.screenAudioStream?.getTracks().forEach((track) => track.stop())
    this.screenAudioStream = null
  }

  private attachLocalTracks(connection: RTCPeerConnection): void {
    if (!this.localStream) return
    const existingTracks = new Set(connection.getSenders().map((sender) => sender.track))
    for (const track of this.localStream.getTracks()) {
      if (!existingTracks.has(track)) connection.addTrack(track, this.localStream)
    }
  }
}
