import type { ChannelSummary } from '../services/api'
import { useVoiceStore } from '../stores/voiceStore'
import { useGoLiveStore } from '../stores/goLiveStore'

// Barra fixa no rodapé da lista de canais (v1.8.0) — enquanto houver call,
// mostra em qual canal você está e os controles básicos, de qualquer tela.
// Sem isso, abrir um canal de texto no meio da call escondia mutar/sair
// (os controles só existiam dentro do VoicePanel).
export function VoiceStatusBar({
  channels,
  onOpenChannel
}: {
  channels: ChannelSummary[]
  onOpenChannel: (channelId: string) => void
}) {
  const status = useVoiceStore((s) => s.status)
  const channelId = useVoiceStore((s) => s.channelId)
  const localMuted = useVoiceStore((s) => s.localMuted)
  const localDeafened = useVoiceStore((s) => s.localDeafened)
  const screenSharing = useVoiceStore((s) => s.screenSharing)
  const toggleMute = useVoiceStore((s) => s.toggleMute)
  const toggleDeafen = useVoiceStore((s) => s.toggleDeafen)
  const leaveVoice = useVoiceStore((s) => s.leave)
  const isLive = useGoLiveStore((s) => s.isLive)
  const leaveGoLive = useGoLiveStore((s) => s.leave)

  if (status === 'idle' || !channelId) return null

  const connected = status === 'connected'
  const channelName = channels.find((c) => c.id === channelId)?.name ?? 'canal de voz'

  return (
    <div className="border-t border-line-soft bg-panel-2 px-3 py-2.5">
      <button
        onClick={() => onOpenChannel(channelId)}
        title="Abrir o canal de voz"
        className="group block w-full min-w-0 text-left"
      >
        <span className="flex items-center gap-2">
          <span
            className={`font-mono text-[10px] font-bold tracking-[0.15em] ${connected ? 'text-volt' : 'text-mist-dim'}`}
          >
            {connected ? '● VOZ CONECTADA' : 'CONECTANDO…'}
          </span>
          {isLive && <span className="font-mono text-[10px] font-bold tracking-wide text-plasma">AO VIVO</span>}
          {screenSharing && (
            <span title="Compartilhando tela" className="text-[10px]">
              🖥️
            </span>
          )}
        </span>
        <span className="block truncate text-xs text-mist-dim transition group-hover:text-mist">
          🔊 {channelName}
        </span>
      </button>

      <div className="mt-2 flex gap-1.5">
        <BarButton
          onClick={toggleMute}
          active={localMuted}
          disabled={!connected}
          title={localMuted ? 'Ativar microfone' : 'Mutar microfone'}
          icon={localMuted ? '🔇' : '🎙️'}
        />
        <BarButton
          onClick={toggleDeafen}
          active={localDeafened}
          disabled={!connected}
          title={localDeafened ? 'Reativar áudio' : 'Ensurdecer'}
          icon={localDeafened ? '🙉' : '🎧'}
        />
        <button
          onClick={() => {
            leaveVoice()
            leaveGoLive()
          }}
          title="Desconectar da chamada"
          className="flex-1 border border-plasma/60 bg-plasma/10 py-1 font-mono text-[10px] font-bold tracking-wide text-plasma transition hover:bg-plasma/20"
        >
          SAIR
        </button>
      </div>
    </div>
  )
}

function BarButton({
  onClick,
  active,
  disabled,
  title,
  icon
}: {
  onClick: () => void
  active: boolean
  disabled: boolean
  title: string
  icon: string
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      title={title}
      className={`flex-1 border py-1 text-sm transition disabled:opacity-40 ${
        active ? 'border-plasma/60 bg-plasma/10' : 'border-line bg-panel hover:border-mist-dim'
      }`}
    >
      {icon}
    </button>
  )
}
