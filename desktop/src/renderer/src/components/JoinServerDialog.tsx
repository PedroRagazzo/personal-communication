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
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-void/80" onClick={onCancel}>
      <div
        className="bevel w-[360px] border border-line bg-panel p-5 shadow-2xl shadow-black/50"
        onClick={(e) => e.stopPropagation()}
      >
        <p className="font-mono text-[10px] tracking-[0.25em] text-volt">CONVITE</p>
        <h3 className="mb-3 mt-1 font-display text-lg font-bold text-mist">Entrar em um servidor</h3>

        <form onSubmit={handleSubmit} className="space-y-3">
          <input
            autoFocus
            value={code}
            onChange={(e) => setCode(e.target.value)}
            placeholder="código do convite"
            className="w-full border border-line bg-panel-2 px-2.5 py-2 text-sm text-mist outline-none transition focus:border-volt"
          />
          {error && <p className="text-xs text-plasma">{error}</p>}
          <div className="flex gap-2 pt-1">
            <button
              type="button"
              onClick={onCancel}
              className="flex-1 border border-line px-2 py-1.5 font-display text-xs font-bold tracking-wide text-mist-dim transition hover:border-mist-dim hover:text-mist"
            >
              CANCELAR
            </button>
            <button
              type="submit"
              disabled={!code.trim() || submitting}
              className="bevel-sm flex-1 bg-volt px-2 py-1.5 font-display text-xs font-bold tracking-wide text-void transition hover:bg-volt-soft disabled:opacity-40"
            >
              {submitting ? 'ENTRANDO…' : 'ENTRAR'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
