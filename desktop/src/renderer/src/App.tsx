import { useEffect, useState } from 'react'
import { useAuthStore } from './stores/authStore'
import { LoginPage } from './pages/LoginPage'
import { RegisterPage } from './pages/RegisterPage'
import { HomePage } from './pages/HomePage'
import { TitleBar } from './components/TitleBar'

export default function App() {
  const status = useAuthStore((s) => s.status)
  const bootstrap = useAuthStore((s) => s.bootstrap)
  // Cadastro é o fluxo padrão agora — login (username#discriminator) só é
  // necessário se a sessão salva se perder (ver docs/security.md).
  const [screen, setScreen] = useState<'login' | 'register'>('register')

  useEffect(() => {
    bootstrap()
  }, [bootstrap])

  return (
    <div className="flex h-screen flex-col">
      <TitleBar />
      <div className="min-h-0 flex-1">
        {status === 'loading' && (
          <div className="flex h-full items-center justify-center bg-void font-mono text-sm text-mist-dim">
            CARREGANDO…
          </div>
        )}
        {status === 'authenticated' && <HomePage />}
        {status === 'unauthenticated' &&
          (screen === 'login' ? (
            <LoginPage onSwitchToRegister={() => setScreen('register')} />
          ) : (
            <RegisterPage onSwitchToLogin={() => setScreen('login')} />
          ))}
      </div>
    </div>
  )
}
