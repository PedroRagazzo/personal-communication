import { useState, type FormEvent, type ReactNode } from 'react'
import type { ChannelSummary, ServerMember, ServerSummary } from '../services/api'
import type { VoiceParticipant } from '../stores/voiceStore'

export function ChannelList({
  server,
  channels,
  selectedChannelId,
  error,
  onSelect,
  onCreate,
  members,
  currentUserId,
  voiceChannelId,
  voiceStatus,
  voiceParticipants,
  speakingUserIds,
  voiceOccupancy,
  footer
}: {
  server: ServerSummary | null
  channels: ChannelSummary[]
  selectedChannelId: string | null
  error: string | null
  onSelect: (id: string) => void
  onCreate: (name: string, type: 'guild_text' | 'guild_voice') => Promise<boolean>
  members: ServerMember[]
  currentUserId: string
  voiceChannelId: string | null
  voiceStatus: 'idle' | 'connecting' | 'connected'
  voiceParticipants: VoiceParticipant[]
  speakingUserIds: Set<string>
  voiceOccupancy: Record<string, string[]>
  footer?: ReactNode
}) {
  const [creating, setCreating] = useState(false)
  const [name, setName] = useState('')
  const [type, setType] = useState<'guild_text' | 'guild_voice'>('guild_text')

  async function handleSubmit(e: FormEvent): Promise<void> {
    e.preventDefault()
    if (!name.trim()) return
    const ok = await onCreate(name.trim(), type)
    if (ok) {
      setCreating(false)
      setName('')
      setType('guild_text')
    }
  }

  function participantLabel(userId: string): string {
    if (userId === currentUserId) return 'Você'
    return members.find((m) => m.user.id === userId)?.user.username ?? 'desconhecido'
  }

  return (
    <aside className="flex w-60 shrink-0 flex-col border-r border-line-soft bg-panel">
      <div className="flex items-center justify-between border-b border-line-soft px-4 py-3.5">
        <span className="truncate font-display text-sm font-bold tracking-wide text-mist">
          {server ? server.name : 'TORA DOS BURRO'}
        </span>
        {server && (
          <button
            onClick={() => setCreating((c) => !c)}
            title="Criar canal"
            className="shrink-0 px-1.5 text-mist-dim transition hover:text-volt"
          >
            {creating ? '×' : '+'}
          </button>
        )}
      </div>

      {creating && (
        <form onSubmit={handleSubmit} className="space-y-2 border-b border-line-soft bg-panel-2 px-3 py-3">
          <input
            autoFocus
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="nome-do-canal"
            className="w-full border border-line bg-void px-2 py-1.5 text-sm text-mist outline-none transition focus:border-volt"
          />
          <div className="flex gap-1 font-mono text-[11px] tracking-wide">
            <button
              type="button"
              onClick={() => setType('guild_text')}
              className={`flex-1 border px-2 py-1 transition ${
                type === 'guild_text'
                  ? 'border-volt bg-volt/10 text-volt'
                  : 'border-line text-mist-dim hover:text-mist'
              }`}
            >
              # TEXTO
            </button>
            <button
              type="button"
              onClick={() => setType('guild_voice')}
              className={`flex-1 border px-2 py-1 transition ${
                type === 'guild_voice'
                  ? 'border-volt bg-volt/10 text-volt'
                  : 'border-line text-mist-dim hover:text-mist'
              }`}
            >
              🔊 VOZ
            </button>
          </div>
          {error && <p className="text-xs text-plasma">{error}</p>}
          <button
            type="submit"
            disabled={!name.trim()}
            className="bevel-sm w-full bg-volt px-2 py-1.5 font-display text-xs font-bold tracking-wide text-void transition hover:bg-volt-soft disabled:opacity-40"
          >
            CRIAR CANAL
          </button>
        </form>
      )}

      <div className="flex-1 overflow-y-auto px-2.5 py-3">
        {!server && <p className="px-2 text-sm text-mist-faint">Selecione um servidor</p>}
        {server && channels.length === 0 && (
          <p className="px-2 text-sm text-mist-faint">Nenhum canal ainda</p>
        )}
        {channels.map((channel) => {
          const active = channel.id === selectedChannelId
          // Clicar num canal de voz já entra direto (igual Discord) — ver
          // HomePage.tsx, que decide isso no próprio onSelect. No canal em
          // que você está de verdade, a lista vem do voiceStore (tem quem
          // está falando/mutado); nos outros, da presença do servidor
          // (v1.8.0, só quem está lá — sem mute/fala, ver voice_channel.ex).
          const connectedToThis = channel.type === 'guild_voice' && channel.id === voiceChannelId && voiceStatus === 'connected'
          const occupants = channel.type === 'guild_voice' && !connectedToThis ? (voiceOccupancy[channel.id] ?? []) : []

          return (
            <div key={channel.id} className="mb-0.5">
              <button
                onClick={() => onSelect(channel.id)}
                className={`relative flex w-full items-center gap-2 py-1.5 pl-3 pr-2 text-left text-sm transition ${
                  active ? 'bg-panel-3 text-mist' : 'text-mist-dim hover:bg-panel-3/50 hover:text-mist'
                }`}
              >
                {active && <span className="absolute left-0 top-1/2 h-3.5 w-0.5 -translate-y-1/2 bg-volt" />}
                <span className={active ? 'text-volt' : 'text-mist-faint'}>
                  {channel.type === 'guild_voice' ? '🔊' : '#'}
                </span>
                <span className="truncate">{channel.name}</span>
              </button>

              {connectedToThis && (
                <ul className="ml-4 mt-0.5 space-y-0.5 border-l border-line-soft pl-2.5">
                  {voiceParticipants.map((p) => {
                    const speaking = !p.muted && speakingUserIds.has(p.userId)
                    return (
                      <li key={p.userId} className="flex items-center gap-1.5 py-0.5">
                        <span
                          className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-panel-3 font-mono text-[9px] font-bold ${
                            speaking ? 'text-volt ring-2 ring-volt' : 'text-mist-dim'
                          }`}
                        >
                          {initials(participantLabel(p.userId))}
                        </span>
                        <span className={`truncate text-xs ${speaking ? 'text-mist' : 'text-mist-dim'}`}>
                          {participantLabel(p.userId)}
                        </span>
                        {p.muted && (
                          <span title="Mutado" className="shrink-0 text-[10px] text-plasma">
                            🔇
                          </span>
                        )}
                      </li>
                    )
                  })}
                </ul>
              )}

              {occupants.length > 0 && (
                <ul className="ml-4 mt-0.5 space-y-0.5 border-l border-line-soft pl-2.5">
                  {occupants.map((userId) => (
                    <li key={userId} className="flex items-center gap-1.5 py-0.5">
                      <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-panel-3 font-mono text-[9px] font-bold text-mist-dim">
                        {initials(participantLabel(userId))}
                      </span>
                      <span className="truncate text-xs text-mist-dim">{participantLabel(userId)}</span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )
        })}
      </div>

      {footer}
    </aside>
  )
}

function initials(name: string): string {
  return name.trim().slice(0, 2).toUpperCase()
}
