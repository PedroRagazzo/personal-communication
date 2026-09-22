import { useEffect, useState } from 'react'
import { useUpdatesStore } from '../stores/updatesStore'

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

  // Sistema de update (v1.7.0) — inicializado aqui porque o TitleBar é a
  // única coisa que sempre está montada, mesmo antes de logar (App.tsx),
  // então avisa de uma versão nova mesmo na tela de login.
  const initUpdates = useUpdatesStore((s) => s.init)
  useEffect(() => {
    initUpdates()
  }, [initUpdates])

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

      <div className="app-no-drag flex h-full items-center">
        <UpdateIndicator />
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

// Ícone de update (v1.7.0, a pedido do usuário: "não precisar ficar
// rebaixando toda hora") — só aparece quando tem versão nova de verdade
// (updatesStore.available). Três estados clicáveis: ainda não baixou (pede
// pra baixar), baixando (só avisa, desabilitado), baixado (pede pra abrir
// o instalador — que é o mesmo NSIS sem assinatura de sempre, a pessoa só
// confirma o que já conhece). Erro de download cai num link "abrir no
// navegador" — sempre tem um jeito de conseguir a versão nova mesmo se o
// download direto falhar por algum motivo de rede.
function UpdateIndicator() {
  const available = useUpdatesStore((s) => s.available)
  const status = useUpdatesStore((s) => s.status)
  const download = useUpdatesStore((s) => s.download)
  const openInstaller = useUpdatesStore((s) => s.openInstaller)
  const openReleasePage = useUpdatesStore((s) => s.openReleasePage)

  if (!available) return null

  if (status === 'error') {
    return (
      <button
        onClick={openReleasePage}
        title="Não foi possível baixar automaticamente — abrir a página da versão nova"
        className="bevel-sm mr-2 border border-plasma/60 bg-plasma/10 px-2.5 py-1 font-mono text-[10px] font-bold tracking-wide text-plasma transition hover:bg-plasma/20"
      >
        ABRIR NO NAVEGADOR
      </button>
    )
  }

  if (status === 'downloaded') {
    return (
      <button
        onClick={openInstaller}
        title={`Versão ${available.version} baixada — clique pra instalar`}
        className="bevel-sm mr-2 animate-pulse-live border border-volt/60 bg-volt/10 px-2.5 py-1 font-mono text-[10px] font-bold tracking-wide text-volt transition hover:bg-volt/20"
      >
        INSTALAR v{available.version}
      </button>
    )
  }

  if (status === 'downloading') {
    return (
      <span className="mr-2 border border-line px-2.5 py-1 font-mono text-[10px] tracking-wide text-mist-dim">
        BAIXANDO…
      </span>
    )
  }

  return (
    <button
      onClick={download}
      title={`Versão ${available.version} disponível — clique pra baixar`}
      className="bevel-sm mr-2 border border-volt/60 bg-volt/10 px-2.5 py-1 font-mono text-[10px] font-bold tracking-wide text-volt transition hover:bg-volt/20"
    >
      ⬆ v{available.version}
    </button>
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
