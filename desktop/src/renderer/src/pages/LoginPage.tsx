import { useState, type FormEvent } from 'react'
import { useAuthStore } from '../stores/authStore'

export function LoginPage({ onSwitchToRegister }: { onSwitchToRegister: () => void }) {
  const login = useAuthStore((s) => s.login)
  const error = useAuthStore((s) => s.error)
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [submitting, setSubmitting] = useState(false)

  async function handleSubmit(e: FormEvent): Promise<void> {
    e.preventDefault()
    setSubmitting(true)
    try {
      await login(email, password)
    } catch {
      // erro já fica em `error`, exibido abaixo
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="flex h-screen items-center justify-center bg-neutral-900">
      <form onSubmit={handleSubmit} className="w-80 space-y-4 rounded-lg bg-neutral-800 p-6 shadow-xl">
        <h1 className="text-lg font-semibold text-neutral-100">Entrar — TORA DOS BURRO</h1>

        {error && <p className="rounded bg-red-950 px-3 py-2 text-sm text-red-400">{error}</p>}

        <div className="space-y-1">
          <label className="text-xs text-neutral-400" htmlFor="login-email">
            Email
          </label>
          <input
            id="login-email"
            type="email"
            required
            autoFocus
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="w-full rounded bg-neutral-700 px-3 py-2 text-neutral-100 outline-none focus:ring-2 focus:ring-indigo-500"
          />
        </div>

        <div className="space-y-1">
          <label className="text-xs text-neutral-400" htmlFor="login-password">
            Senha
          </label>
          <input
            id="login-password"
            type="password"
            required
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="w-full rounded bg-neutral-700 px-3 py-2 text-neutral-100 outline-none focus:ring-2 focus:ring-indigo-500"
          />
        </div>

        <button
          type="submit"
          disabled={submitting}
          className="w-full rounded bg-indigo-600 py-2 font-medium text-white transition hover:bg-indigo-500 disabled:opacity-50"
        >
          {submitting ? 'Entrando…' : 'Entrar'}
        </button>

        <button
          type="button"
          onClick={onSwitchToRegister}
          className="w-full text-center text-xs text-neutral-400 hover:text-neutral-200"
        >
          Não tem conta? Cadastre-se
        </button>
      </form>
    </div>
  )
}
