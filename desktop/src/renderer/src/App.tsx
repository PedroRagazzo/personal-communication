import { useEffect, useState } from 'react'
import { useAuthStore } from './stores/authStore'
import { LoginPage } from './pages/LoginPage'
import { RegisterPage } from './pages/RegisterPage'
import { HomePage } from './pages/HomePage'

export default function App() {
  const status = useAuthStore((s) => s.status)
  const bootstrap = useAuthStore((s) => s.bootstrap)
  const [screen, setScreen] = useState<'login' | 'register'>('login')

  useEffect(() => {
    bootstrap()
  }, [bootstrap])

  if (status === 'loading') {
    return (
      <div className="flex h-screen items-center justify-center bg-neutral-900 text-neutral-400">
        Carregando…
      </div>
    )
  }

  if (status === 'authenticated') {
    return <HomePage />
  }

  return screen === 'login' ? (
    <LoginPage onSwitchToRegister={() => setScreen('register')} />
  ) : (
    <RegisterPage onSwitchToLogin={() => setScreen('login')} />
  )
}
