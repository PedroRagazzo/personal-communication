import { useEffect, useState } from 'react'
import type { ScreenSource } from '../../../preload'

// Sem picker nativo no Windows (useSystemPicker do Electron só existe no
// macOS 15+), então essa tela substitui isso — lista o que o
// desktopCapturer do processo main encontrou (ver main/index.ts).
export function ScreenSharePicker({
  onSelect,
  onCancel
}: {
  onSelect: (sourceId: string) => void
  onCancel: () => void
}) {
  const [sources, setSources] = useState<ScreenSource[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    window.api.screenShare.listSources().then((list) => {
      setSources(list)
      setLoading(false)
    })
  }, [])

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-void/80" onClick={onCancel}>
      <div
        className="bevel max-h-[80vh] w-[600px] overflow-y-auto border border-line bg-panel p-5 shadow-2xl shadow-black/50"
        onClick={(e) => e.stopPropagation()}
      >
        <p className="font-mono text-[10px] tracking-[0.25em] text-volt">CAPTURA</p>
        <h3 className="mb-3 mt-1 font-display text-lg font-bold text-mist">Escolha o que compartilhar</h3>

        {loading && <p className="text-sm text-mist-dim">Carregando…</p>}
        {!loading && sources.length === 0 && (
          <p className="text-sm text-mist-dim">Nenhuma tela ou janela encontrada.</p>
        )}

        <div className="grid grid-cols-2 gap-3">
          {sources.map((source) => (
            <button
              key={source.id}
              onClick={() => onSelect(source.id)}
              className="bevel-sm overflow-hidden border border-line text-left transition hover:border-volt"
            >
              <img
                src={source.thumbnailDataUrl}
                alt={source.name}
                className="h-24 w-full bg-black object-contain"
              />
              <p className="truncate bg-panel-2 px-2 py-1 text-xs text-mist-dim">{source.name}</p>
            </button>
          ))}
        </div>

        <button
          onClick={onCancel}
          className="mt-4 font-mono text-xs tracking-wide text-mist-dim transition hover:text-mist"
        >
          CANCELAR
        </button>
      </div>
    </div>
  )
}
