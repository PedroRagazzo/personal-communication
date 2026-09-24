import { useState, type FormEvent } from 'react'
import { useAuthStore } from '../stores/authStore'
import * as api from '../services/api'

// Tela inicial pra quem não está logado. Pede só usuário+senha; o
// discriminator só aparece se o backend responder "ambiguous_username" (duas
// contas com o mesmo nome).
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
    <div className="rig-grid flex h-full items-center justify-center bg-void">
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
            <p className="font-mono text-[11px] tracking-[0.25em] text-volt">ACESSO</p>
            <h1 className="mt-1 font-display text-2xl font-semibold text-mist">Entrar</h1>
            <p className="mt-2 text-xs leading-relaxed text-mist-dim">
              Depois de entrar, a sessão fica salva neste dispositivo.
            </p>
          </div>

          {error && !needsDiscriminator && (
            <p className="border-l-2 border-plasma bg-plasma/10 px-3 py-2 text-sm text-plasma">
              {error}
            </p>
          )}
          {needsDiscriminator && (
            <p className="border-l-2 border-volt bg-volt/10 px-3 py-2 text-xs leading-relaxed text-volt">
              Existe mais de uma conta com esse nome de usuário — digite também o código de 4
              dígitos (ex.: 0001) pra saber qual é a sua.
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
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              className="w-full border border-line bg-panel-2 px-3 py-2.5 text-sm text-mist outline-none transition focus:border-volt"
            />
          </label>

          {needsDiscriminator && (
            <label className="block space-y-1.5">
              <span className="font-mono text-[10px] tracking-[0.2em] text-volt">
                CÓDIGO (4 DÍGITOS)
              </span>
              <input
                type="text"
                required
                placeholder="0001"
                minLength={4}
                maxLength={4}
                value={discriminator}
                onChange={(e) => setDiscriminator(e.target.value)}
                className="w-full border border-volt/50 bg-panel-2 px-3 py-2.5 font-mono text-sm text-mist outline-none transition focus:border-volt"
              />
            </label>
          )}

          <label className="block space-y-1.5">
            <span className="font-mono text-[10px] tracking-[0.2em] text-mist-dim">SENHA</span>
            <input
              type="password"
              required
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
            {submitting ? 'ENTRANDO…' : 'ENTRAR'}
          </button>

          <button
            type="button"
            onClick={onSwitchToRegister}
            className="w-full text-center text-xs text-mist-dim transition hover:text-mist"
          >
            Não tem conta? <span className="text-volt">Cadastre-se</span>
          </button>
        </form>
      </div>
    </div>
  )
}
