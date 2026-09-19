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
    <aside className="flex w-56 shrink-0 flex-col border-r border-neutral-800 bg-neutral-900">
      <div className="flex items-center justify-between border-b border-neutral-800 px-4 py-3">
        <span className="truncate font-semibold text-neutral-100">
          {server ? server.name : 'TORA DOS BURRO'}
        </span>
        {server && (
          <button
            onClick={() => setCreating((c) => !c)}
            title="Criar canal"
            className="shrink-0 rounded px-1.5 text-neutral-400 hover:bg-neutral-800 hover:text-neutral-200"
          >
            {creating ? '×' : '+'}
          </button>
        )}
      </div>

      {creating && (
        <form onSubmit={handleSubmit} className="space-y-2 border-b border-neutral-800 px-3 py-2">
          <input
            autoFocus
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="nome-do-canal"
            className="w-full rounded bg-neutral-800 px-2 py-1 text-sm text-neutral-100 outline-none focus:ring-2 focus:ring-indigo-500"
          />
          <div className="flex gap-1 text-xs">
            <button
              type="button"
              onClick={() => setType('guild_text')}
              className={`flex-1 rounded px-2 py-1 transition ${
                type === 'guild_text' ? 'bg-indigo-600 text-white' : 'bg-neutral-800 text-neutral-400'
              }`}
            >
              # Texto
            </button>
            <button
              type="button"
              onClick={() => setType('guild_voice')}
              className={`flex-1 rounded px-2 py-1 transition ${
                type === 'guild_voice' ? 'bg-indigo-600 text-white' : 'bg-neutral-800 text-neutral-400'
              }`}
            >
              🔊 Voz
            </button>
          </div>
          {error && <p className="text-xs text-red-400">{error}</p>}
          <button
            type="submit"
            disabled={!name.trim()}
            className="w-full rounded bg-indigo-600 px-2 py-1 text-xs font-medium text-white transition hover:bg-indigo-500 disabled:opacity-40"
          >
            Criar canal
          </button>
        </form>
      )}

      <div className="flex-1 overflow-y-auto px-2 py-2">
        {!server && <p className="px-2 text-sm text-neutral-600">Selecione um servidor</p>}
        {server && channels.length === 0 && (
          <p className="px-2 text-sm text-neutral-600">Nenhum canal ainda</p>
        )}
        {channels.map((channel) => (
          <button
            key={channel.id}
            onClick={() => onSelect(channel.id)}
            className={`flex w-full items-center gap-2 rounded px-2 py-1.5 text-left text-sm transition ${
              channel.id === selectedChannelId
                ? 'bg-neutral-800 text-white'
                : 'text-neutral-400 hover:bg-neutral-800/60 hover:text-neutral-200'
            }`}
          >
            <span className="text-neutral-500">{channel.type === 'guild_voice' ? '🔊' : '#'}</span>
            <span className="truncate">{channel.name}</span>
          </button>
        ))}
      </div>
    </aside>
  )
}
