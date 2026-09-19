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
    <div className="flex h-screen items-center justify-center bg-neutral-900">
      <form onSubmit={handleSubmit} className="w-80 space-y-4 rounded-lg bg-neutral-800 p-6 shadow-xl">
        <div>
          <h1 className="text-lg font-semibold text-neutral-100">Criar conta</h1>
          <p className="text-xs text-neutral-500">
            Sua sessão fica salva neste dispositivo — você não vai precisar entrar de novo. O
            discriminator (<span className="font-mono">#0001</span>) é atribuído automaticamente;
            guarde o nome completo (ex.: <span className="font-mono">voce#0001</span>) caso precise
            entrar de novo manualmente algum dia.
          </p>
        </div>

        {error && <p className="rounded bg-red-950 px-3 py-2 text-sm text-red-400">{error}</p>}

        <div className="space-y-1">
          <label className="text-xs text-neutral-400" htmlFor="register-username">
            Nome de usuário
          </label>
          <input
            id="register-username"
            type="text"
            required
            autoFocus
            minLength={3}
            maxLength={32}
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            className="w-full rounded bg-neutral-700 px-3 py-2 text-neutral-100 outline-none focus:ring-2 focus:ring-indigo-500"
          />
        </div>

        <div className="space-y-1">
          <label className="text-xs text-neutral-400" htmlFor="register-password">
            Senha
          </label>
          <input
            id="register-password"
            type="password"
            required
            minLength={8}
            maxLength={128}
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
          {submitting ? 'Criando…' : 'Criar conta'}
        </button>

        <button
          type="button"
          onClick={onSwitchToLogin}
          className="w-full text-center text-xs text-neutral-400 hover:text-neutral-200"
        >
          Já tem conta e perdeu a sessão? Entrar
        </button>
      </form>
    </div>
  )
}
