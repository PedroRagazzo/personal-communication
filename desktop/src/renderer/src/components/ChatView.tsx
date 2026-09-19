import { useEffect, useRef, useState, type FormEvent } from 'react'
import type { ChannelSummary, ServerMember } from '../services/api'
import { useChatStore } from '../stores/chatStore'

export function ChatView({
  channel,
  accessToken,
  members
}: {
  channel: ChannelSummary
  accessToken: string
  members: ServerMember[]
}) {
  const messages = useChatStore((s) => s.messages)
  const loading = useChatStore((s) => s.loading)
  const error = useChatStore((s) => s.error)
  const joinChannel = useChatStore((s) => s.joinChannel)
  const leaveChannel = useChatStore((s) => s.leaveChannel)
  const sendMessage = useChatStore((s) => s.sendMessage)
  const [draft, setDraft] = useState('')
  const bottomRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    joinChannel(accessToken, channel.id)
    return () => leaveChannel()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [channel.id, accessToken])

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ block: 'end' })
  }, [messages.length])

  function authorName(authorId: string): string {
    const member = members.find((m) => m.user.id === authorId)
    return member ? `${member.user.username}#${member.user.discriminator}` : 'desconhecido'
  }

  function handleSubmit(e: FormEvent): void {
    e.preventDefault()
    if (!draft.trim()) return
    sendMessage(draft)
    setDraft('')
  }

  return (
    <div className="flex flex-1 flex-col overflow-hidden">
      <div className="flex-1 overflow-y-auto px-4 py-3">
        {loading && <p className="text-sm text-neutral-600">Carregando mensagens…</p>}
        {error && <p className="mb-2 rounded bg-red-950 px-3 py-2 text-sm text-red-400">{error}</p>}
        {!loading && messages.length === 0 && (
          <p className="text-sm text-neutral-600">Nenhuma mensagem ainda — seja o primeiro a escrever.</p>
        )}
        {messages.map((message) => (
          <div key={message.id} className="mb-2">
            <span className="text-sm font-semibold text-neutral-200">{authorName(message.author_id)}</span>{' '}
            <span className="text-xs text-neutral-600">
              {new Date(message.inserted_at).toLocaleTimeString('pt-BR', {
                hour: '2-digit',
                minute: '2-digit'
              })}
            </span>
            <p className="text-sm break-words text-neutral-300">{message.content}</p>
          </div>
        ))}
        <div ref={bottomRef} />
      </div>
      <form onSubmit={handleSubmit} className="flex items-center gap-2 border-t border-neutral-800 p-3">
        <input
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          placeholder={`Conversar em #${channel.name}`}
          className="flex-1 rounded bg-neutral-800 px-3 py-2 text-sm text-neutral-100 outline-none focus:ring-2 focus:ring-indigo-500"
        />
        <button
          type="submit"
          disabled={!draft.trim()}
          className="rounded bg-indigo-600 px-3 py-2 text-sm font-medium text-white transition hover:bg-indigo-500 disabled:opacity-40"
        >
          Enviar
        </button>
      </form>
    </div>
  )
}
