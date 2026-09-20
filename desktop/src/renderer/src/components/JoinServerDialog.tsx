import { useState, type FormEvent } from 'react'

export function JoinServerDialog({
  error,
  onJoin,
  onCancel
}: {
  error: string | null
  onJoin: (code: string) => Promise<boolean>
  onCancel: () => void
}) {
  const [code, setCode] = useState('')
  const [submitting, setSubmitting] = useState(false)

  async function handleSubmit(e: FormEvent): Promise<void> {
    e.preventDefault()
    if (!code.trim()) return
    setSubmitting(true)
    const ok = await onJoin(code.trim())
    setSubmitting(false)
    if (ok) onCancel()
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60" onClick={onCancel}>
      <div
        className="w-[360px] rounded-lg bg-neutral-800 p-4 shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <h3 className="mb-3 text-sm font-semibold text-neutral-100">Entrar em um servidor</h3>

        <form onSubmit={handleSubmit} className="space-y-2">
          <input
            autoFocus
            value={code}
            onChange={(e) => setCode(e.target.value)}
            placeholder="código do convite"
            className="w-full rounded bg-neutral-900 px-2 py-1.5 text-sm text-neutral-100 outline-none focus:ring-2 focus:ring-indigo-500"
          />
          {error && <p className="text-xs text-red-400">{error}</p>}
          <div className="flex gap-2 pt-1">
            <button
              type="button"
              onClick={onCancel}
              className="flex-1 rounded bg-neutral-700 px-2 py-1.5 text-xs text-neutral-300 transition hover:bg-neutral-600"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={!code.trim() || submitting}
              className="flex-1 rounded bg-indigo-600 px-2 py-1.5 text-xs font-medium text-white transition hover:bg-indigo-500 disabled:opacity-40"
            >
              {submitting ? 'Entrando…' : 'Entrar'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
