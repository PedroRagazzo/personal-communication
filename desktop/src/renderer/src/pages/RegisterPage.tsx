import { useState, type FormEvent } from 'react'
import { useAuthStore } from '../stores/authStore'

export function RegisterPage({ onSwitchToLogin }: { onSwitchToLogin: () => void }) {
  const register = useAuthStore((s) => s.register)
  const error = useAuthStore((s) => s.error)
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [submitting, setSubmitting] = useState(false)

  async function handleSubmit(e: FormEvent): Promise<void> {
    e.preventDefault()
    setSubmitting(true)
    try {
      await register(username, password)
    } catch {
      // erro já fica em `error`, exibido abaixo
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="rig-grid flex h-screen items-center justify-center bg-void">
      <div className="w-[380px]">
        <div className="mb-6 flex items-center gap-3">
          <div className="bevel-sm flex h-11 w-11 shrink-0 items-center justify-center bg-volt text-void">
            <span className="font-display text-xl font-bold">T</span>
          </div>
          <div className="leading-none">
            <p className="font-display text-xl font-bold tracking-wide text-mist">TORA</p>
            <p className="font-mono text-[11px] tracking-[0.3em] text-mist-dim">DOS BURRO</p>
          </div>
        </div>

        <form
          onSubmit={handleSubmit}
          className="bevel space-y-5 border border-line bg-panel p-7 shadow-2xl shadow-black/40"
        >
          <div>
            <p className="font-mono text-[11px] tracking-[0.25em] text-volt">NOVO ACESSO</p>
            <h1 className="mt-1 font-display text-2xl font-semibold text-mist">Criar conta</h1>
            <p className="mt-2 text-xs leading-relaxed text-mist-dim">
              Sua sessão fica salva neste dispositivo — você não vai precisar entrar de novo. Se um
              dia precisar entrar manualmente (outro dispositivo, por exemplo), é só o nome de
              usuário e a senha.
            </p>
          </div>

          {error && (
            <p className="border-l-2 border-plasma bg-plasma/10 px-3 py-2 text-sm text-plasma">
              {error}
            </p>
          )}

          <label className="block space-y-1.5">
            <span className="font-mono text-[10px] tracking-[0.2em] text-mist-dim">
              NOME DE USUÁRIO
            </span>
            <input
              type="text"
              required
              autoFocus
              minLength={3}
              maxLength={32}
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              className="w-full border border-line bg-panel-2 px-3 py-2.5 text-sm text-mist outline-none transition focus:border-volt"
            />
          </label>

          <label className="block space-y-1.5">
            <span className="font-mono text-[10px] tracking-[0.2em] text-mist-dim">SENHA</span>
            <input
              type="password"
              required
              minLength={8}
              maxLength={128}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full border border-line bg-panel-2 px-3 py-2.5 text-sm text-mist outline-none transition focus:border-volt"
            />
          </label>

          <button
            type="submit"
            disabled={submitting}
            className="bevel-sm w-full bg-volt py-2.5 font-display text-sm font-bold tracking-[0.15em] text-void transition hover:bg-volt-soft disabled:opacity-50"
          >
            {submitting ? 'CRIANDO…' : 'CRIAR CONTA'}
          </button>

          <button
            type="button"
            onClick={onSwitchToLogin}
            className="w-full text-center text-xs text-mist-dim transition hover:text-mist"
          >
            Já tem conta e perdeu a sessão? <span className="text-volt">Entrar</span>
          </button>
        </form>
      </div>
    </div>
  )
}
