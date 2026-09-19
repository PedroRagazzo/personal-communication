// Mesh WebRTC (FASE 6/8 no backend, FASE 11 fatias 4/5 aqui): uma
// RTCPeerConnection por participante da sala, sinalização relayada via
// Phoenix Channel (voice:{channel_id} — ver stores/voiceStore.ts), mídia
// nunca passa pelo WebSocket. Nunca chamar isso fora de uma sala de voz
// pequena (~8 participantes só-áudio) — é exatamente o limite que
// docs/media.md documenta para o mesh. Tela (fatia 5) reaproveita as
// mesmas conexões — não é um mesh separado.
//
// Perfect negotiation (papel polite/impolite por comparação de user_id,
// como docs/media.md especifica) evita que duas ofertas simultâneas
// (glare) corrompam o estado de sinalização quando dois peers entram quase
// ao mesmo tempo. Padrão de referência: https://developer.mozilla.org/docs/Web/API/WebRTC_API/Perfect_negotiation

export type SignalEvent = 'sdp:offer' | 'sdp:answer' | 'ice:candidate'
export type SignalSender = (toUserId: string, event: SignalEvent, payload: Record<string, unknown>) => void

export interface MeshCallbacks {
  onRemoteTrack: (peerId: string, track: MediaStreamTrack, stream: MediaStream) => void
  onRemoteTrackEnded: (peerId: string, kind: 'audio' | 'video') => void
  onPeerRemoved: (peerId: string) => void
}

const ICE_SERVERS: RTCIceServer[] = [{ urls: 'stun:stun.l.google.com:19302' }]

interface PeerEntry {
  connection: RTCPeerConnection
  polite: boolean
  makingOffer: boolean
  ignoreOffer: boolean
  pendingCandidates: RTCIceCandidateInit[]
}

export class MeshManager {
  private peers = new Map<string, PeerEntry>()
  private localStream: MediaStream | null = null
  private screenStream: MediaStream | null = null
  private screenSenders = new Map<string, RTCRtpSender>()

  constructor(
    private readonly localUserId: string,
    private readonly send: SignalSender,
    private readonly callbacks: MeshCallbacks
  ) {}

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

  // Tela (FASE 11, fatia 5): mesma peer connection da voz, não uma nova —
  // adicionar/remover a track renegocia sozinho via perfect negotiation
  // (onnegotiationneeded), igual docs/media.md especifica. `stream: null`
  // para parar de compartilhar.
  setScreenTrack(stream: MediaStream | null): void {
    for (const [peerId, sender] of this.screenSenders) {
      this.peers.get(peerId)?.connection.removeTrack(sender)
    }
    this.screenSenders.clear()
    this.screenStream?.getTracks().forEach((track) => track.stop())
    this.screenStream = stream

    const track = stream?.getVideoTracks()[0]
    if (!stream || !track) return

    for (const [peerId, entry] of this.peers) {
      this.screenSenders.set(peerId, entry.connection.addTrack(track, stream))
    }
  }

  addPeer(peerId: string): void {
    if (this.peers.has(peerId) || peerId === this.localUserId) return

    const connection = new RTCPeerConnection({ iceServers: ICE_SERVERS })
    // Papel determinístico: os dois lados calculam a mesma coisa (com os
    // operandos trocados), então sempre concordam sobre quem é polite.
    const polite = this.localUserId < peerId
    const entry: PeerEntry = {
      connection,
      polite,
      makingOffer: false,
      ignoreOffer: false,
      pendingCandidates: []
    }
    this.peers.set(peerId, entry)

    connection.onnegotiationneeded = async () => {
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
        this.callbacks.onRemoteTrackEnded(peerId, event.track.kind as 'audio' | 'video')
      })
    }

    connection.onconnectionstatechange = () => {
      if (connection.connectionState === 'failed' || connection.connectionState === 'closed') {
        this.removePeer(peerId)
      }
    }

    this.attachLocalTracks(connection)

    if (this.screenStream) {
      const screenTrack = this.screenStream.getVideoTracks()[0]
      if (screenTrack) this.screenSenders.set(peerId, connection.addTrack(screenTrack, this.screenStream))
    }
  }

  removePeer(peerId: string): void {
    const entry = this.peers.get(peerId)
    if (!entry) return
    entry.connection.close()
    this.peers.delete(peerId)
    this.screenSenders.delete(peerId)
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
    this.screenStream?.getTracks().forEach((track) => track.stop())
    this.screenStream = null
    this.screenSenders.clear()
  }

  private attachLocalTracks(connection: RTCPeerConnection): void {
    if (!this.localStream) return
    const existingTracks = new Set(connection.getSenders().map((sender) => sender.track))
    for (const track of this.localStream.getTracks()) {
      if (!existingTracks.has(track)) connection.addTrack(track, this.localStream)
    }
  }
}
