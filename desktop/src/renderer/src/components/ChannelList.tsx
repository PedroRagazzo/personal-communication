import { useState, type FormEvent } from 'react'
import type { ChannelSummary, ServerSummary } from '../services/api'

export function ChannelList({
  server,
  channels,
  selectedChannelId,
  error,
  onSelect,
  onCreate
}: {
  server: ServerSummary | null
  channels: ChannelSummary[]
  selectedChannelId: string | null
  error: string | null
  onSelect: (id: string) => void
  onCreate: (name: string, type: 'guild_text' | 'guild_voice') => Promise<boolean>
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
          return (
            <button
              key={channel.id}
              onClick={() => onSelect(channel.id)}
              className={`relative mb-0.5 flex w-full items-center gap-2 py-1.5 pl-3 pr-2 text-left text-sm transition ${
                active ? 'bg-panel-3 text-mist' : 'text-mist-dim hover:bg-panel-3/50 hover:text-mist'
              }`}
            >
              {active && <span className="absolute left-0 top-1/2 h-3.5 w-0.5 -translate-y-1/2 bg-volt" />}
              <span className={active ? 'text-volt' : 'text-mist-faint'}>
                {channel.type === 'guild_voice' ? '🔊' : '#'}
              </span>
              <span className="truncate">{channel.name}</span>
            </button>
          )
        })}
      </div>
    </aside>
  )
}
