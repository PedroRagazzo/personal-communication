import { useState, type FormEvent } from 'react'
import { useAuthStore } from '../stores/authStore'
import * as api from '../services/api'

// Caminho raro de recuperação — o normal é a sessão persistir sozinha (ver
// RegisterPage). Login pede só usuário+senha; o discriminator só aparece se
// o backend responder "ambiguous_username" (duas contas com o mesmo nome),
// caso raro nesse deploy de grupo pequeno e conhecido.
export function LoginPage({ onSwitchToRegister }: { onSwitchToRegister: () => void }) {
  const login = useAuthStore((s) => s.login)
  const error = useAuthStore((s) => s.error)
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [discriminator, setDiscriminator] = useState('')
  const [needsDiscriminator, setNeedsDiscriminator] = useState(false)
  const [submitting, setSubmitting] = useState(false)

  async function handleSubmit(e: FormEvent): Promise<void> {
    e.preventDefault()
    setSubmitting(true)
    try {
      await login(username.trim(), password, needsDiscriminator ? discriminator.trim() : undefined)
    } catch (err) {
      if (err instanceof api.ApiError && err.message === 'ambiguous_username') {
        setNeedsDiscriminator(true)
      }
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="flex h-screen items-center justify-center bg-neutral-900">
      <form onSubmit={handleSubmit} className="w-80 space-y-4 rounded-lg bg-neutral-800 p-6 shadow-xl">
        <div>
          <h1 className="text-lg font-semibold text-neutral-100">Entrar — TORA DOS BURRO</h1>
          <p className="text-xs text-neutral-500">
            Só precisa disso se a sessão salva se perdeu (dados limpos, outro dispositivo).
          </p>
        </div>

        {error && !needsDiscriminator && (
          <p className="rounded bg-red-950 px-3 py-2 text-sm text-red-400">{error}</p>
        )}
        {needsDiscriminator && (
          <p className="rounded bg-amber-950 px-3 py-2 text-sm text-amber-400">
            Existe mais de uma conta com esse nome de usuário — digite também o código de 4 dígitos
            (ex.: 0001) pra saber qual é a sua.
          </p>
        )}

        <div className="space-y-1">
          <label className="text-xs text-neutral-400" htmlFor="login-username">
            Nome de usuário
          </label>
          <input
            id="login-username"
            type="text"
            required
            autoFocus
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            className="w-full rounded bg-neutral-700 px-3 py-2 text-neutral-100 outline-none focus:ring-2 focus:ring-indigo-500"
          />
        </div>

        {needsDiscriminator && (
          <div className="space-y-1">
            <label className="text-xs text-neutral-400" htmlFor="login-discriminator">
              Código (4 dígitos)
            </label>
            <input
              id="login-discriminator"
              type="text"
              required
              placeholder="0001"
              minLength={4}
              maxLength={4}
              value={discriminator}
              onChange={(e) => setDiscriminator(e.target.value)}
              className="w-full rounded bg-neutral-700 px-3 py-2 text-neutral-100 outline-none focus:ring-2 focus:ring-indigo-500"
            />
          </div>
        )}

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
