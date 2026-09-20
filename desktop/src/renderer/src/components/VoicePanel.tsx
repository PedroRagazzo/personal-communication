import { useEffect, useRef, useState } from 'react'
import type { ChannelSummary, ServerMember } from '../services/api'
import { useVoiceStore } from '../stores/voiceStore'
import { useGoLiveStore } from '../stores/goLiveStore'
import { ScreenSharePicker } from './ScreenSharePicker'

// Voz (FASE 11, fatia 4) + compartilhamento de tela (fatia 5) + câmera
// (fatia 6) + Go Live (fatia 10): conectar entra no mesh WebRTC de
// verdade (mic real) E no Go Live (LiveKit, subscriber-only até alguém
// apertar "Ir ao vivo") ao mesmo tempo — são duas conexões
// completamente separadas (mesh P2P vs SFU), só compartilham o botão
// Conectar/Sair por conveniência de UX. Tela e câmera adicionam tracks
// de vídeo às mesmas peer connections do mesh (não são meshes
// separados, e podem estar ativas ao mesmo tempo); Go Live nunca passa
// pelo mesh, vai direto pro LiveKit. As conexões vivem nas stores, não
// neste componente — trocar de canal só esconde os controles, não
// desconecta (mesmo comportamento do Discord: sair da visão do canal
// de voz não te tira da chamada). Falta pra uma próxima fatia: uma
// barra persistente mostrando "conectado em #x" visível de qualquer
// lugar do app.
export function VoicePanel({
  channel,
  currentUserId,
  members
}: {
  channel: ChannelSummary
  currentUserId: string
  members: ServerMember[]
}) {
  const status = useVoiceStore((s) => s.status)
  const activeChannelId = useVoiceStore((s) => s.channelId)
  const participants = useVoiceStore((s) => s.participants)
  const localMuted = useVoiceStore((s) => s.localMuted)
  const localDeafened = useVoiceStore((s) => s.localDeafened)
  const remoteAudioStreams = useVoiceStore((s) => s.remoteAudioStreams)
  const screenSharing = useVoiceStore((s) => s.screenSharing)
  const localScreenStream = useVoiceStore((s) => s.localScreenStream)
  const remoteScreenStreams = useVoiceStore((s) => s.remoteScreenStreams)
  const videoEnabled = useVoiceStore((s) => s.videoEnabled)
  const localCameraStream = useVoiceStore((s) => s.localCameraStream)
  const remoteCameraStreams = useVoiceStore((s) => s.remoteCameraStreams)
  const error = useVoiceStore((s) => s.error)
  const join = useVoiceStore((s) => s.join)
  const leave = useVoiceStore((s) => s.leave)
  const toggleMute = useVoiceStore((s) => s.toggleMute)
  const toggleDeafen = useVoiceStore((s) => s.toggleDeafen)
  const startScreenShare = useVoiceStore((s) => s.startScreenShare)
  const stopScreenShare = useVoiceStore((s) => s.stopScreenShare)
  const toggleVideo = useVoiceStore((s) => s.toggleVideo)

  const goLiveStatus = useGoLiveStore((s) => s.status)
  const goLiveParticipants = useGoLiveStore((s) => s.participants)
  const isLive = useGoLiveStore((s) => s.isLive)
  const localLiveStream = useGoLiveStore((s) => s.localStream)
  const remoteLiveStreams = useGoLiveStore((s) => s.remoteStreams)
  const goLiveError = useGoLiveStore((s) => s.error)
  const joinGoLive = useGoLiveStore((s) => s.join)
  const leaveGoLive = useGoLiveStore((s) => s.leave)
  const startGoLive = useGoLiveStore((s) => s.startGoLive)
  const stopGoLive = useGoLiveStore((s) => s.stopGoLive)

  const [pickerTarget, setPickerTarget] = useState<'screen' | 'golive' | null>(null)

  const connectedHere = status === 'connected' && activeChannelId === channel.id
  const connectingHere = status === 'connecting' && activeChannelId === channel.id
  // Só um hint de UI (evita ligar a câmera à toa pra ser rejeitado) — o
  // servidor sempre reaplica o limite de verdade, nunca confia só nisso.
  const videoCapReached = !videoEnabled && participants.filter((p) => p.video).length >= 4

  function participantName(userId: string): string {
    if (userId === currentUserId) return 'Você'
    const member = members.find((m) => m.user.id === userId)
    return member ? `${member.user.username}#${member.user.discriminator}` : 'desconhecido'
  }

  function isParticipantLive(userId: string): boolean {
    if (userId === currentUserId) return isLive
    return goLiveParticipants.some((p) => p.userId === userId && p.live)
  }

  function handleConnect(): void {
    join(channel.id, currentUserId)
    joinGoLive(channel.id)
  }

  function handleLeave(): void {
    leave()
    leaveGoLive()
  }

  return (
    <div className="flex flex-1 flex-col items-center gap-4 overflow-y-auto p-6 text-neutral-100">
      <h2 className="text-lg font-semibold">🔊 {channel.name}</h2>

      {error && <p className="rounded bg-red-950 px-3 py-2 text-sm text-red-400">{error}</p>}
      {goLiveError && <p className="rounded bg-red-950 px-3 py-2 text-sm text-red-400">{goLiveError}</p>}

      {!connectedHere && (
        <button
          onClick={handleConnect}
          disabled={connectingHere}
          className="rounded bg-indigo-600 px-4 py-2 text-sm font-medium text-white transition hover:bg-indigo-500 disabled:opacity-50"
        >
          {connectingHere ? 'Conectando…' : 'Conectar'}
        </button>
      )}

      {connectedHere && (
        <>
          <ul className="w-full max-w-xs space-y-1">
            {participants.map((p) => (
              <li
                key={p.userId}
                className="flex items-center justify-between rounded bg-neutral-800 px-3 py-2 text-sm"
              >
                <span>{participantName(p.userId)}</span>
                <span className="flex items-center gap-1 text-neutral-500">
                  {isParticipantLive(p.userId) && <span title="Ao vivo (Go Live)">🔴</span>}
                  {p.screen_sharing && <span title="Compartilhando tela">🖥️</span>}
                  {(p.userId === currentUserId ? videoEnabled : p.video) && <span title="Câmera ligada">🎥</span>}
                  {(p.userId === currentUserId ? localDeafened : p.deafened) && <span title="Ensurdecido">🙉</span>}
                  {(p.userId === currentUserId ? localMuted : p.muted) ? '🔇' : '🎙️'}
                </span>
              </li>
            ))}
          </ul>

          <div className="flex flex-wrap justify-center gap-2">
            <button
              onClick={toggleMute}
              className="rounded bg-neutral-800 px-4 py-2 text-sm transition hover:bg-neutral-700"
            >
              {localMuted ? 'Ativar microfone' : 'Mutar'}
            </button>
            <button
              onClick={toggleDeafen}
              className={`rounded px-4 py-2 text-sm transition ${
                localDeafened ? 'bg-red-900 hover:bg-red-800' : 'bg-neutral-800 hover:bg-neutral-700'
              }`}
            >
              {localDeafened ? 'Parar de ensurdecer' : 'Ensurdecer'}
            </button>
            <button
              onClick={() => toggleVideo()}
              disabled={videoCapReached}
              title={videoCapReached ? 'Limite de 4 participantes com vídeo atingido nessa sala' : undefined}
              className={`rounded px-4 py-2 text-sm transition disabled:opacity-40 ${
                videoEnabled ? 'bg-red-900 hover:bg-red-800' : 'bg-neutral-800 hover:bg-neutral-700'
              }`}
            >
              {videoEnabled ? 'Desligar câmera' : 'Ligar câmera'}
            </button>
            <button
              onClick={() => (screenSharing ? stopScreenShare() : setPickerTarget('screen'))}
              className={`rounded px-4 py-2 text-sm transition ${
                screenSharing ? 'bg-red-900 hover:bg-red-800' : 'bg-neutral-800 hover:bg-neutral-700'
              }`}
            >
              {screenSharing ? 'Parar compartilhamento' : 'Compartilhar tela'}
            </button>
            <button
              onClick={() => (isLive ? stopGoLive() : setPickerTarget('golive'))}
              disabled={goLiveStatus !== 'connected' && !isLive}
              title={goLiveStatus !== 'connected' ? 'Conectando ao Go Live…' : undefined}
              className={`rounded px-4 py-2 text-sm transition disabled:opacity-40 ${
                isLive ? 'bg-red-900 hover:bg-red-800' : 'bg-neutral-800 hover:bg-neutral-700'
              }`}
            >
              {isLive ? 'Parar transmissão' : 'Ir ao vivo'}
            </button>
            <button onClick={handleLeave} className="rounded bg-red-900 px-4 py-2 text-sm transition hover:bg-red-800">
              Sair
            </button>
          </div>

          {localCameraStream && <RemoteVideo stream={localCameraStream} label="Sua câmera" muted />}
          {Object.entries(remoteCameraStreams).map(([peerId, stream]) => (
            <RemoteVideo key={peerId} stream={stream} label={participantName(peerId)} />
          ))}

          {localScreenStream && (
            <RemoteVideo stream={localScreenStream} label="Você está compartilhando a tela" muted />
          )}
          {Object.entries(remoteScreenStreams).map(([peerId, stream]) => (
            <RemoteVideo
              key={peerId}
              stream={stream}
              label={`${participantName(peerId)} está compartilhando a tela`}
            />
          ))}

          {localLiveStream && <RemoteVideo stream={localLiveStream} label="🔴 Você está ao vivo" muted />}
          {Object.entries(remoteLiveStreams).map(([peerId, stream]) => (
            <RemoteVideo key={peerId} stream={stream} label={`🔴 ${participantName(peerId)} está ao vivo`} />
          ))}

          {Object.entries(remoteAudioStreams).map(([peerId, stream]) => (
            <RemoteAudio key={peerId} stream={stream} muted={localDeafened} />
          ))}
        </>
      )}

      {pickerTarget && (
        <ScreenSharePicker
          onSelect={(sourceId) => {
            const target = pickerTarget
            setPickerTarget(null)
            if (target === 'screen') startScreenShare(sourceId)
            else startGoLive(sourceId)
          }}
          onCancel={() => setPickerTarget(null)}
        />
      )}
    </div>
  )
}

function RemoteAudio({ stream, muted }: { stream: MediaStream; muted?: boolean }) {
  const ref = useRef<HTMLAudioElement>(null)

  useEffect(() => {
    if (ref.current) ref.current.srcObject = stream
  }, [stream])

  return <audio ref={ref} autoPlay muted={muted} />
}

function RemoteVideo({ stream, label, muted }: { stream: MediaStream; label: string; muted?: boolean }) {
  const ref = useRef<HTMLVideoElement>(null)

  useEffect(() => {
    if (ref.current) ref.current.srcObject = stream
  }, [stream])

  return (
    <div className="w-full max-w-2xl">
      <p className="mb-1 text-xs text-neutral-500">{label}</p>
      <video ref={ref} autoPlay muted={muted} className="w-full rounded border border-neutral-700 bg-black" />
    </div>
  )
}
