import { useEffect, useState } from 'react'

// Janela sem moldura nativa ("borda infinita", a pedido do usuário) —
// título e botões de minimizar/maximizar/fechar são 100% desenhados aqui,
// no mesmo sistema visual do resto do app (main/index.ts tem `frame: false`
// e os handlers de IPC que esses botões chamam via `window.api.windowControls`).
export function TitleBar() {
  const [isMaximized, setIsMaximized] = useState(false)

  useEffect(() => {
    window.api.windowControls.isMaximized().then(setIsMaximized)
    return window.api.windowControls.onMaximizeChanged(setIsMaximized)
  }, [])

  return (
    <div
      className="app-drag flex h-9 shrink-0 select-none items-center justify-between bg-panel"
      onDoubleClick={() => window.api.windowControls.toggleMaximize()}
    >
      <div className="flex items-center gap-2 pl-3">
        <span className="bevel-sm flex h-4 w-4 items-center justify-center bg-volt font-display text-[9px] font-bold text-void">
          T
        </span>
        <span className="font-display text-[11px] font-bold tracking-[0.25em] text-mist-dim">
          TORA DOS BURRO
        </span>
      </div>

      <div className="app-no-drag flex h-full">
        <TitleBarButton label="Minimizar" onClick={() => window.api.windowControls.minimize()}>
          <svg viewBox="0 0 10 10" width="10" height="10">
            <line x1="1" y1="5" x2="9" y2="5" stroke="currentColor" strokeWidth="1.1" />
          </svg>
        </TitleBarButton>

        <TitleBarButton
          label={isMaximized ? 'Restaurar' : 'Maximizar'}
          onClick={() => window.api.windowControls.toggleMaximize()}
        >
          {isMaximized ? (
            <svg viewBox="0 0 10 10" width="10" height="10">
              <rect x="1" y="3" width="6" height="6" fill="none" stroke="currentColor" strokeWidth="1" />
              <path d="M3 3V1H9V7H7" fill="none" stroke="currentColor" strokeWidth="1" />
            </svg>
          ) : (
            <svg viewBox="0 0 10 10" width="10" height="10">
              <rect x="1" y="1" width="8" height="8" fill="none" stroke="currentColor" strokeWidth="1.1" />
            </svg>
          )}
        </TitleBarButton>

        <TitleBarButton
          label="Fechar"
          danger
          onClick={() => window.api.windowControls.close()}
        >
          <svg viewBox="0 0 10 10" width="10" height="10">
            <line x1="1" y1="1" x2="9" y2="9" stroke="currentColor" strokeWidth="1.1" />
            <line x1="9" y1="1" x2="1" y2="9" stroke="currentColor" strokeWidth="1.1" />
          </svg>
        </TitleBarButton>
      </div>
    </div>
  )
}

function TitleBarButton({
  label,
  onClick,
  danger,
  children
}: {
  label: string
  onClick: () => void
  danger?: boolean
  children: React.ReactNode
}) {
  return (
    <button
      onClick={onClick}
      aria-label={label}
      title={label}
      className={`flex h-full w-11 items-center justify-center text-mist-dim transition-colors ${
        danger ? 'hover:bg-plasma hover:text-void' : 'hover:bg-panel-3 hover:text-mist'
      }`}
    >
      {children}
    </button>
  )
}
