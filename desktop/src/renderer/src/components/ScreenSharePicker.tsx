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
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60"
      onClick={onCancel}
    >
      <div
        className="max-h-[80vh] w-[600px] overflow-y-auto rounded-lg bg-neutral-800 p-4 shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <h3 className="mb-3 text-sm font-semibold text-neutral-100">Escolha o que compartilhar</h3>

        {loading && <p className="text-sm text-neutral-500">Carregando…</p>}
        {!loading && sources.length === 0 && (
          <p className="text-sm text-neutral-500">Nenhuma tela ou janela encontrada.</p>
        )}

        <div className="grid grid-cols-2 gap-3">
          {sources.map((source) => (
            <button
              key={source.id}
              onClick={() => onSelect(source.id)}
              className="overflow-hidden rounded border border-neutral-700 text-left transition hover:border-indigo-500"
            >
              <img
                src={source.thumbnailDataUrl}
                alt={source.name}
                className="h-24 w-full bg-black object-contain"
              />
              <p className="truncate px-2 py-1 text-xs text-neutral-300">{source.name}</p>
            </button>
          ))}
        </div>

        <button onClick={onCancel} className="mt-3 text-xs text-neutral-500 hover:text-neutral-300">
          Cancelar
        </button>
      </div>
    </div>
  )
}
