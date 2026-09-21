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
    <nav className="flex w-[76px] shrink-0 flex-col items-center gap-2.5 overflow-y-auto border-r border-line-soft bg-void py-4">
      {servers.map((server) => {
        const active = server.id === selectedServerId
        return (
          <button
            key={server.id}
            onClick={() => onSelect(server.id)}
            title={server.name}
            className="group relative flex h-12 w-12 shrink-0 items-center justify-center"
          >
            <span
              className={`absolute left-[-10px] w-1 rounded-r-sm bg-volt transition-all ${
                active ? 'h-7' : 'h-0 group-hover:h-3.5'
              }`}
            />
            <span
              className={`bevel-sm flex h-12 w-12 items-center justify-center border font-display text-sm font-bold transition ${
                active
                  ? 'border-volt bg-panel-3 text-volt'
                  : 'border-line bg-panel text-mist-dim group-hover:border-mist-dim group-hover:text-mist'
              }`}
            >
              {initials(server.name)}
            </span>
          </button>
        )
      })}
      {servers.length === 0 && (
        <p className="px-2 text-center font-mono text-[9px] leading-tight tracking-wide text-mist-faint">
          SEM SERVIDORES
        </p>
      )}

      <button
        onClick={() => setJoining(true)}
        title="Entrar em servidor com convite"
        className="bevel-sm flex h-12 w-12 shrink-0 items-center justify-center border border-dashed border-line text-lg text-mist-dim transition hover:border-volt hover:text-volt"
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
