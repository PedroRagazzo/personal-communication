import { useEffect, useState } from 'react'
import { useAuthStore } from './stores/authStore'
import { LoginPage } from './pages/LoginPage'
import { RegisterPage } from './pages/RegisterPage'
import { HomePage } from './pages/HomePage'
import { TitleBar } from './components/TitleBar'
import { ErrorBoundary } from './components/ErrorBoundary'

export default function App() {
  const status = useAuthStore((s) => s.status)
  const bootstrap = useAuthStore((s) => s.bootstrap)
  const authError = useAuthStore((s) => s.error)
  const [screen, setScreen] = useState<'login' | 'register'>('login')

  useEffect(() => {
    bootstrap()
  }, [bootstrap])

  return (
    <div className="flex h-screen flex-col">
      <TitleBar />
      <div className="min-h-0 flex-1">
        <ErrorBoundary>
          {status === 'loading' && (
            <div className="flex h-full flex-col items-center justify-center gap-2 bg-void font-mono text-sm text-mist-dim">
              CARREGANDO…
              {authError && <span className="text-xs text-plasma">{authError}</span>}
            </div>
          )}
          {status === 'authenticated' && <HomePage />}
          {status === 'unauthenticated' &&
            (screen === 'login' ? (
              <LoginPage onSwitchToRegister={() => setScreen('register')} />
            ) : (
              <RegisterPage onSwitchToLogin={() => setScreen('login')} />
            ))}
        </ErrorBoundary>
      </div>
    </div>
  )
}
