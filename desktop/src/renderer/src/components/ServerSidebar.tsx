import { useState } from 'react'
import type { ServerSummary } from '../services/api'
import { JoinServerDialog } from './JoinServerDialog'

export function ServerSidebar({
  servers,
  selectedServerId,
  error,
  onSelect,
  onJoin
}: {
  servers: ServerSummary[]
  selectedServerId: string | null
  error: string | null
  onSelect: (id: string) => void
  onJoin: (code: string) => Promise<boolean>
}) {
  const [joining, setJoining] = useState(false)

  return (
    <nav className="flex w-[72px] shrink-0 flex-col items-center gap-2 overflow-y-auto bg-neutral-950 py-3">
      {servers.map((server) => (
        <button
          key={server.id}
          onClick={() => onSelect(server.id)}
          title={server.name}
          className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl text-sm font-semibold transition hover:rounded-xl ${
            server.id === selectedServerId
              ? 'rounded-xl bg-indigo-600 text-white'
              : 'bg-neutral-800 text-neutral-300 hover:bg-indigo-600 hover:text-white'
          }`}
        >
          {initials(server.name)}
        </button>
      ))}
      {servers.length === 0 && (
        <p className="px-2 text-center text-[10px] leading-tight text-neutral-600">sem servidores</p>
      )}

      <button
        onClick={() => setJoining(true)}
        title="Entrar em servidor com convite"
        className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-neutral-800 text-xl text-green-400 transition hover:rounded-xl hover:bg-green-600 hover:text-white"
      >
        +
      </button>

      {joining && <JoinServerDialog error={error} onJoin={onJoin} onCancel={() => setJoining(false)} />}
    </nav>
  )
}

function initials(name: string): string {
  return name
    .trim()
    .split(/\s+/)
    .map((word) => word[0])
    .join('')
    .slice(0, 2)
    .toUpperCase()
}
