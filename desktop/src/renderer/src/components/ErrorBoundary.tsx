import { Component, type ErrorInfo, type ReactNode } from 'react'

// Sem isso, qualquer erro durante render/efeito desmontava a árvore React
// inteira e deixava a janela em branco, sem nem um botão (aconteceu de
// verdade com o volume acima de 100%, v1.6.0). Error boundary ainda precisa
// ser componente de classe — não existe equivalente em hook.
//
// Fica abaixo da TitleBar no App.tsx, então minimizar/fechar continuam
// funcionando. Recarregar a janela (em vez de só limpar o erro e renderizar
// de novo) é deliberado: o mesmo estado que quebrou o render quebraria de
// novo; recarregar recomeça do zero e a sessão volta sozinha (tokens salvos).
interface Props {
  children: ReactNode
}

interface State {
  error: Error | null
}

export class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null }

  static getDerivedStateFromError(error: Error): State {
    return { error }
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    console.error('erro na interface', error, info.componentStack)
  }

  render(): ReactNode {
    const { error } = this.state
    if (!error) return this.props.children

    return (
      <div className="rig-grid flex h-full items-center justify-center bg-void p-6">
        <div className="bevel w-[440px] border border-plasma/50 bg-panel p-6">
          <h2 className="font-display text-lg font-bold tracking-wide text-plasma">
            ALGO DEU ERRADO
          </h2>
          <p className="mt-2 text-sm text-mist-dim">
            Uma parte da tela travou. Recarregar volta pro app — você continua logado, só precisa
            entrar de novo na call se estava em uma.
          </p>
          <p className="mt-3 break-words border-l-2 border-line pl-3 font-mono text-xs text-mist-faint">
            {error.message}
          </p>
          <button
            onClick={() => window.location.reload()}
            className="bevel-sm mt-5 border border-volt/60 bg-volt/10 px-4 py-2 font-display text-xs font-bold tracking-wide text-volt transition hover:bg-volt/20"
          >
            RECARREGAR
          </button>
        </div>
      </div>
    )
  }
}
