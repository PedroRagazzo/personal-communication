import { useAuthStore } from '../stores/authStore'

// Tela mínima só pra provar a autenticação de ponta a ponta (FASE 11,
// fatia 1). Lista de servidores, canais, chat e socket chegam nas próximas
// fatias.
export function HomePage() {
  const user = useAuthStore((s) => s.user)
  const logout = useAuthStore((s) => s.logout)

  if (!user) return null

  return (
    <div className="flex h-screen flex-col items-center justify-center gap-4 bg-neutral-900 text-neutral-100">
      <div className="text-center">
        <p className="text-xl font-semibold">
          {user.username}
          <span className="text-neutral-500">#{user.discriminator}</span>
        </p>
        <p className="text-sm text-neutral-400">{user.email}</p>
      </div>
      <button
        onClick={() => logout()}
        className="rounded bg-neutral-800 px-4 py-2 text-sm transition hover:bg-neutral-700"
      >
        Sair
      </button>
    </div>
  )
}
