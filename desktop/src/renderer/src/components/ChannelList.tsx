import type { ChannelSummary, ServerSummary } from '../services/api'

export function ChannelList({
  server,
  channels,
  selectedChannelId,
  onSelect
}: {
  server: ServerSummary | null
  channels: ChannelSummary[]
  selectedChannelId: string | null
  onSelect: (id: string) => void
}) {
  return (
    <aside className="flex w-56 shrink-0 flex-col border-r border-neutral-800 bg-neutral-900">
      <div className="truncate border-b border-neutral-800 px-4 py-3 font-semibold text-neutral-100">
        {server ? server.name : 'TORA DOS BURRO'}
      </div>
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
