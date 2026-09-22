import { useEffect, useState } from 'react'
import type { ScreenSource } from '../../../preload'
import type { ScreenShareQuality } from '../stores/voiceStore'

export const RESOLUTIONS: { label: string; width: number; height: number }[] = [
  { label: '720p', width: 1280, height: 720 },
  { label: '1080p', width: 1920, height: 1080 },
  { label: '1440p', width: 2560, height: 1440 }
]
export const FRAME_RATES = [30, 60]

const DEFAULT_QUALITY: ScreenShareQuality = { width: 1920, height: 1080, frameRate: 30 }

// Sem picker nativo no Windows (useSystemPicker do Electron só existe no
// macOS 15+), então essa tela substitui isso — lista o que o
// desktopCapturer do processo main encontrou (ver main/index.ts).
export function ScreenSharePicker({
  onSelect,
  onCancel,
  showQuality = false
}: {
  onSelect: (sourceId: string, quality: ScreenShareQuality) => void
  onCancel: () => void
  showQuality?: boolean
}) {
  const [sources, setSources] = useState<ScreenSource[]>([])
  const [loading, setLoading] = useState(true)
  const [quality, setQuality] = useState<ScreenShareQuality>(DEFAULT_QUALITY)

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

        {showQuality && (
          <div className="mb-4 space-y-2 border border-line-soft bg-panel-2 p-3">
            <div>
              <p className="mb-1 font-mono text-[10px] tracking-[0.2em] text-mist-dim">RESOLUÇÃO</p>
              <div className="flex gap-1">
                {RESOLUTIONS.map((res) => (
                  <button
                    key={res.label}
                    onClick={() => setQuality((q) => ({ ...q, width: res.width, height: res.height }))}
                    className={`flex-1 border px-2 py-1 font-mono text-xs transition ${
                      quality.width === res.width
                        ? 'border-volt bg-volt/10 text-volt'
                        : 'border-line text-mist-dim hover:text-mist'
                    }`}
                  >
                    {res.label}
                  </button>
                ))}
              </div>
            </div>
            <div>
              <p className="mb-1 font-mono text-[10px] tracking-[0.2em] text-mist-dim">TAXA DE QUADROS</p>
              <div className="flex gap-1">
                {FRAME_RATES.map((fps) => (
                  <button
                    key={fps}
                    onClick={() => setQuality((q) => ({ ...q, frameRate: fps }))}
                    className={`flex-1 border px-2 py-1 font-mono text-xs transition ${
                      quality.frameRate === fps
                        ? 'border-volt bg-volt/10 text-volt'
                        : 'border-line text-mist-dim hover:text-mist'
                    }`}
                  >
                    {fps} FPS
                  </button>
                ))}
              </div>
            </div>
          </div>
        )}

        {loading && <p className="text-sm text-mist-dim">Carregando…</p>}
        {!loading && sources.length === 0 && (
          <p className="text-sm text-mist-dim">Nenhuma tela ou janela encontrada.</p>
        )}

        <div className="grid grid-cols-2 gap-3">
          {sources.map((source) => (
            <button
              key={source.id}
              onClick={() => onSelect(source.id, quality)}
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
