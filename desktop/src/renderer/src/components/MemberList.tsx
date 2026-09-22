import type { ServerMember, ServerSummary } from '../services/api'

// Painel da direita, estilo Discord — quem está online no app (não só numa
// chamada de voz específica, isso já existe embaixo do canal em
// ChannelList.tsx). Presença vem de presenceStore.ts (topic server:{id}).
export function MemberList({
  server,
  members,
  onlineUserIds,
  currentUserId
}: {
  server: ServerSummary | null
  members: ServerMember[]
  onlineUserIds: Set<string>
  currentUserId: string
}) {
  if (!server) return null

  const online = members.filter((m) => onlineUserIds.has(m.user.id))
  const offline = members.filter((m) => !onlineUserIds.has(m.user.id))

  return (
    <aside className="flex w-60 shrink-0 flex-col overflow-y-auto border-l border-line-soft bg-panel px-3 py-4">
      <MemberGroup label={`ONLINE — ${online.length}`} members={online} currentUserId={currentUserId} online />
      <MemberGroup
        label={`OFFLINE — ${offline.length}`}
        members={offline}
        currentUserId={currentUserId}
        online={false}
      />
    </aside>
  )
}

function MemberGroup({
  label,
  members,
  currentUserId,
  online
}: {
  label: string
  members: ServerMember[]
  currentUserId: string
  online: boolean
}) {
  if (members.length === 0) return null

  return (
    <div className="mb-4">
      <p className="mb-2 px-1.5 font-mono text-[10px] tracking-[0.2em] text-mist-dim">{label}</p>
      <ul className="space-y-0.5">
        {members.map((m) => (
          <li
            key={m.user.id}
            className="flex items-center gap-2 px-1.5 py-1 transition hover:bg-panel-3/50"
          >
            <span className="relative flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-panel-3 font-mono text-[10px] font-bold text-mist-dim">
              {initials(m.user.username)}
              <span
                className={`absolute -bottom-0.5 -right-0.5 h-2.5 w-2.5 rounded-full border-2 border-panel ${
                  online ? 'bg-volt' : 'bg-mist-faint'
                }`}
              />
            </span>
            <span className={`truncate text-sm ${online ? 'text-mist' : 'text-mist-faint'}`}>
              {m.user.id === currentUserId ? 'Você' : m.user.username}
              <span className="font-mono text-[10px] text-mist-faint">#{m.user.discriminator}</span>
            </span>
          </li>
        ))}
      </ul>
    </div>
  )
}

function initials(name: string): string {
  return name.trim().slice(0, 2).toUpperCase()
}
