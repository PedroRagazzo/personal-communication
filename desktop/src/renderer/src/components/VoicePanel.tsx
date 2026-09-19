import { useEffect, useRef } from 'react'
import type { ChannelSummary, ServerMember } from '../services/api'
import { useVoiceStore } from '../stores/voiceStore'

// Voz (FASE 11, fatia 4): conectar entra no mesh WebRTC de verdade (mic
// real). A conexão vive em `voiceStore`, não neste componente — trocar de
// canal só esconde os controles, não desconecta (mesmo comportamento do
// Discord: sair da visão do canal de voz não te tira da chamada). Falta
// pra uma próxima fatia: uma barra persistente mostrando "conectado em
// #x" visível de qualquer lugar do app, já que hoje só dá pra ver/mutar/
// sair enquanto o canal de voz está selecionado.
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
  const remoteStreams = useVoiceStore((s) => s.remoteStreams)
  const error = useVoiceStore((s) => s.error)
  const join = useVoiceStore((s) => s.join)
  const leave = useVoiceStore((s) => s.leave)
  const toggleMute = useVoiceStore((s) => s.toggleMute)

  const connectedHere = status === 'connected' && activeChannelId === channel.id
  const connectingHere = status === 'connecting' && activeChannelId === channel.id

  function participantName(userId: string): string {
    if (userId === currentUserId) return 'Você'
    const member = members.find((m) => m.user.id === userId)
    return member ? `${member.user.username}#${member.user.discriminator}` : 'desconhecido'
  }

  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-4 p-6 text-neutral-100">
      <h2 className="text-lg font-semibold">🔊 {channel.name}</h2>

      {error && <p className="rounded bg-red-950 px-3 py-2 text-sm text-red-400">{error}</p>}

      {!connectedHere && (
        <button
          onClick={() => join(channel.id, currentUserId)}
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
                <span className="text-neutral-500">
                  {(p.userId === currentUserId ? localMuted : p.muted) ? '🔇' : '🎙️'}
                </span>
              </li>
            ))}
          </ul>
          <div className="flex gap-2">
            <button
              onClick={toggleMute}
              className="rounded bg-neutral-800 px-4 py-2 text-sm transition hover:bg-neutral-700"
            >
              {localMuted ? 'Ativar microfone' : 'Mutar'}
            </button>
            <button onClick={leave} className="rounded bg-red-900 px-4 py-2 text-sm transition hover:bg-red-800">
              Sair
            </button>
          </div>
          {Object.entries(remoteStreams).map(([peerId, stream]) => (
            <RemoteAudio key={peerId} stream={stream} />
          ))}
        </>
      )}
    </div>
  )
}

function RemoteAudio({ stream }: { stream: MediaStream }) {
  const ref = useRef<HTMLAudioElement>(null)

  useEffect(() => {
    if (ref.current) ref.current.srcObject = stream
  }, [stream])

  return <audio ref={ref} autoPlay />
}
