import { useEffect, useRef, useState, type FormEvent, type KeyboardEvent } from 'react'
import type { ChannelSummary, ChatMessage, ServerMember } from '../services/api'
import { useChatStore } from '../stores/chatStore'

// Emojis fixos pra reação rápida — sem picker/dependência nova (FASE 11,
// fatia 8). Clicar num já reagido por mim remove; clicar num não reagido
// adiciona. O servidor sempre revalida (idempotente nos dois sentidos),
// aqui é só a UI que decide qual dos dois eventos mandar.
const QUICK_REACTIONS = ['👍', '❤️', '😂', '🎉', '😮', '😢']

export function ChatView({
  channel,
  accessToken,
  currentUserId,
  members
}: {
  channel: ChannelSummary
  accessToken: string
  currentUserId: string
  members: ServerMember[]
}) {
  const messages = useChatStore((s) => s.messages)
  const loading = useChatStore((s) => s.loading)
  const error = useChatStore((s) => s.error)
  const joinChannel = useChatStore((s) => s.joinChannel)
  const leaveChannel = useChatStore((s) => s.leaveChannel)
  const sendMessage = useChatStore((s) => s.sendMessage)
  const editMessage = useChatStore((s) => s.editMessage)
  const deleteMessage = useChatStore((s) => s.deleteMessage)
  const addReaction = useChatStore((s) => s.addReaction)
  const removeReaction = useChatStore((s) => s.removeReaction)
  const [draft, setDraft] = useState('')
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editDraft, setEditDraft] = useState('')
  const [reactingTo, setReactingTo] = useState<string | null>(null)
  const bottomRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    joinChannel(accessToken, channel.id)
    return () => leaveChannel()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [channel.id, accessToken])

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ block: 'end' })
  }, [messages.length])

  function authorParts(authorId: string): { username: string; discriminator: string } {
    const member = members.find((m) => m.user.id === authorId)
    return member
      ? { username: member.user.username, discriminator: member.user.discriminator }
      : { username: 'desconhecido', discriminator: '' }
  }

  function authorName(authorId: string): string {
    const { username, discriminator } = authorParts(authorId)
    return discriminator ? `${username}#${discriminator}` : username
  }

  function handleSubmit(e: FormEvent): void {
    e.preventDefault()
    if (!draft.trim()) return
    sendMessage(draft)
    setDraft('')
  }

  function startEdit(message: ChatMessage): void {
    setEditingId(message.id)
    setEditDraft(message.content)
  }

  function submitEdit(id: string): void {
    if (editDraft.trim()) editMessage(id, editDraft)
    setEditingId(null)
  }

  function handleEditKeyDown(e: KeyboardEvent<HTMLInputElement>, id: string): void {
    if (e.key === 'Enter') submitEdit(id)
    if (e.key === 'Escape') setEditingId(null)
  }

  function handleDelete(id: string): void {
    if (window.confirm('Apagar esta mensagem?')) deleteMessage(id)
  }

  function toggleReaction(message: ChatMessage, emoji: string): void {
    const reaction = message.reactions.find((r) => r.emoji === emoji)
    if (reaction?.user_ids.includes(currentUserId)) {
      removeReaction(message.id, emoji)
    } else {
      addReaction(message.id, emoji)
    }
    setReactingTo(null)
  }

  return (
    <div className="flex flex-1 flex-col overflow-hidden bg-void">
      <div className="flex-1 overflow-y-auto px-5 py-4">
        {loading && <p className="text-sm text-mist-faint">Carregando mensagens…</p>}
        {error && (
          <p className="mb-2 border-l-2 border-plasma bg-plasma/10 px-3 py-2 text-sm text-plasma">
            {error}
          </p>
        )}
        {!loading && messages.length === 0 && (
          <p className="text-sm text-mist-faint">Nenhuma mensagem ainda — seja o primeiro a escrever.</p>
        )}
        {messages.map((message) => {
          const isMine = message.author_id === currentUserId
          const isEditing = editingId === message.id
          const author = authorParts(message.author_id)

          return (
            <div key={message.id} className="group mb-2.5 rounded px-1.5 py-1 hover:bg-panel/60">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0 flex-1">
                  <span className="text-sm font-bold text-mist">{author.username}</span>
                  {author.discriminator && (
                    <span className="font-mono text-[11px] text-mist-faint">#{author.discriminator}</span>
                  )}{' '}
                  <span className="font-mono text-[11px] text-mist-faint">
                    {new Date(message.inserted_at).toLocaleTimeString('pt-BR', {
                      hour: '2-digit',
                      minute: '2-digit'
                    })}
                  </span>
                  {message.edited_at && (
                    <span className="ml-1 font-mono text-[11px] text-mist-faint">(editado)</span>
                  )}

                  {isEditing ? (
                    <input
                      autoFocus
                      value={editDraft}
                      onChange={(e) => setEditDraft(e.target.value)}
                      onKeyDown={(e) => handleEditKeyDown(e, message.id)}
                      onBlur={() => submitEdit(message.id)}
                      className="mt-1 block w-full border border-volt bg-panel-2 px-2 py-1 text-sm text-mist outline-none"
                    />
                  ) : (
                    <p className="text-sm break-words text-mist-dim">{message.content}</p>
                  )}
                </div>

                <div className="hidden shrink-0 items-center gap-1 text-xs text-mist-faint group-hover:flex">
                  <button
                    onClick={() => setReactingTo(reactingTo === message.id ? null : message.id)}
                    title="Reagir"
                    className="rounded px-1.5 py-0.5 hover:bg-panel-3"
                  >
                    😊
                  </button>
                  {isMine && !isEditing && (
                    <>
                      <button
                        onClick={() => startEdit(message)}
                        title="Editar"
                        className="rounded px-1.5 py-0.5 hover:bg-panel-3"
                      >
                        ✏️
                      </button>
                      <button
                        onClick={() => handleDelete(message.id)}
                        title="Apagar"
                        className="rounded px-1.5 py-0.5 hover:bg-panel-3"
                      >
                        🗑️
                      </button>
                    </>
                  )}
                </div>
              </div>

              {reactingTo === message.id && (
                <div className="mt-1 flex gap-1">
                  {QUICK_REACTIONS.map((emoji) => (
                    <button
                      key={emoji}
                      onClick={() => toggleReaction(message, emoji)}
                      aria-label={`Reagir com ${emoji}`}
                      className="rounded bg-panel-2 px-1.5 py-0.5 text-sm transition hover:bg-panel-3"
                    >
                      {emoji}
                    </button>
                  ))}
                </div>
              )}

              {message.reactions.length > 0 && (
                <div className="mt-1 flex flex-wrap gap-1">
                  {message.reactions.map((reaction) => {
                    const mine = reaction.user_ids.includes(currentUserId)
                    return (
                      <button
                        key={reaction.emoji}
                        onClick={() => toggleReaction(message, reaction.emoji)}
                        title={reaction.user_ids.map(authorName).join(', ')}
                        aria-label={`Reação ${reaction.emoji}, ${reaction.count} ${reaction.count === 1 ? 'pessoa' : 'pessoas'}`}
                        className={`rounded-full px-2 py-0.5 text-xs transition ${
                          mine
                            ? 'bg-volt/15 text-volt ring-1 ring-volt/50'
                            : 'bg-panel-2 text-mist-dim hover:bg-panel-3'
                        }`}
                      >
                        {reaction.emoji} {reaction.count}
                      </button>
                    )
                  })}
                </div>
              )}
            </div>
          )
        })}
        <div ref={bottomRef} />
      </div>
      <form onSubmit={handleSubmit} className="flex items-center gap-2 border-t border-line-soft bg-panel p-3">
        <input
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          placeholder={`Conversar em #${channel.name}`}
          className="flex-1 border border-line bg-panel-2 px-3 py-2 text-sm text-mist outline-none transition focus:border-volt"
        />
        <button
          type="submit"
          disabled={!draft.trim()}
          className="bevel-sm bg-volt px-4 py-2 font-display text-xs font-bold tracking-wide text-void transition hover:bg-volt-soft disabled:opacity-40"
        >
          ENVIAR
        </button>
      </form>
    </div>
  )
}
