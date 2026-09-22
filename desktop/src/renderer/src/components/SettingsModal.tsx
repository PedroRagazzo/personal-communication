import { useEffect, useState } from 'react'
import { useSettingsStore, MIC_SENSITIVITY_MIN, MIC_SENSITIVITY_MAX } from '../stores/settingsStore'
import { useVoiceStore } from '../stores/voiceStore'
import { Toggle } from './Toggle'

const METER_SAMPLE_MS = 100
const METER_MAX = 100

// Configurações básicas do app — só Microfone por enquanto (o pedido
// concreto até agora). Modal no mesmo padrão visual de ScreenSharePicker.tsx
// / JoinServerDialog.tsx (overlay fixo, clique fora fecha).
export function SettingsModal({ onClose }: { onClose: () => void }) {
  const mic = useSettingsStore((s) => s.mic)
  const setEchoCancellation = useSettingsStore((s) => s.setEchoCancellation)
  const setNoiseSuppression = useSettingsStore((s) => s.setNoiseSuppression)
  const setMicSensitivity = useSettingsStore((s) => s.setMicSensitivity)
  const applyMicSensitivity = useVoiceStore((s) => s.setMicSensitivity)
  const activeCallStream = useVoiceStore((s) => s.localAudioStream)

  const [previewStream, setPreviewStream] = useState<MediaStream | null>(null)
  const [micError, setMicError] = useState<string | null>(null)

  // Se já está numa chamada, reaproveita o mic real dela pro medidor (não
  // abre uma segunda captura à toa) — só pede uma captura própria, só pra
  // essa prévia, quando não há chamada ativa. Fechada ao desmontar.
  useEffect(() => {
    if (activeCallStream) {
      setPreviewStream(null)
      return
    }

    let cancelled = false
    let stream: MediaStream | null = null

    navigator.mediaDevices
      .getUserMedia({
        audio: { echoCancellation: mic.echoCancellation, noiseSuppression: mic.noiseSuppression }
      })
      .then((s) => {
        if (cancelled) {
          s.getTracks().forEach((t) => t.stop())
          return
        }
        stream = s
        setPreviewStream(s)
      })
      .catch((err) => {
        setMicError(err instanceof Error ? `microfone: ${err.message}` : 'falha ao acessar o microfone')
      })

    return () => {
      cancelled = true
      stream?.getTracks().forEach((t) => t.stop())
    }
    // Só refaz a captura se a chamada ativa aparecer/sumir — trocar eco/ruído
    // não precisa recapturar, aplica direto na track existente (handlers abaixo).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeCallStream])

  const meterStream = activeCallStream ?? previewStream

  function applyLiveConstraint(patch: MediaTrackConstraints): void {
    meterStream?.getAudioTracks()[0]?.applyConstraints(patch).catch(() => {})
  }

  function handleEchoCancellationChange(value: boolean): void {
    setEchoCancellation(value)
    applyLiveConstraint({ echoCancellation: value })
  }

  function handleNoiseSuppressionChange(value: boolean): void {
    setNoiseSuppression(value)
    applyLiveConstraint({ noiseSuppression: value })
  }

  function handleSensitivityChange(value: number): void {
    setMicSensitivity(value)
    applyMicSensitivity(value)
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-void/80" onClick={onClose}>
      <div
        className="bevel max-h-[80vh] w-[440px] overflow-y-auto border border-line bg-panel p-5 shadow-2xl shadow-black/50"
        onClick={(e) => e.stopPropagation()}
      >
        <p className="font-mono text-[10px] tracking-[0.25em] text-volt">PREFERÊNCIAS</p>
        <h3 className="mb-4 mt-1 font-display text-lg font-bold text-mist">Configurações</h3>

        <section className="space-y-4">
          <h4 className="font-mono text-[10px] tracking-[0.2em] text-mist-dim">MICROFONE</h4>

          {micError && (
            <p className="border-l-2 border-plasma bg-plasma/10 px-3 py-2 text-xs text-plasma">{micError}</p>
          )}

          <Toggle
            label="Cancelamento de eco"
            checked={mic.echoCancellation}
            onChange={handleEchoCancellationChange}
          />
          <Toggle
            label="Supressão de ruído"
            checked={mic.noiseSuppression}
            onChange={handleNoiseSuppressionChange}
          />

          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-sm text-mist">Sensibilidade do microfone</span>
              <span className="font-mono text-[11px] text-mist-dim">{mic.micSensitivity}</span>
            </div>

            <MicMeter stream={meterStream} threshold={mic.micSensitivity} />

            <input
              type="range"
              min={MIC_SENSITIVITY_MIN}
              max={MIC_SENSITIVITY_MAX}
              value={mic.micSensitivity}
              onChange={(e) => handleSensitivityChange(Number(e.target.value))}
              className="w-full"
            />
            <div className="flex justify-between font-mono text-[10px] tracking-wide text-mist-faint">
              <span>MAIS SENSÍVEL</span>
              <span>MENOS SENSÍVEL</span>
            </div>
            <p className="text-xs leading-relaxed text-mist-dim">
              A barra verde é o volume captado agora; a marca rosa é o limiar atual. Fale perto do microfone
              e ajuste até o indicador de "falando" acender no momento certo.
            </p>
          </div>
        </section>

        <button
          onClick={onClose}
          className="mt-5 font-mono text-xs tracking-wide text-mist-dim transition hover:text-mist"
        >
          FECHAR
        </button>
      </div>
    </div>
  )
}

// Nível de entrada em tempo real (mesma técnica RMS de
// webrtc/SpeakingDetector.ts, mas dedicada a UM stream só e sem o
// hold-time/mapa de vários peers, que aqui não fazem sentido — só o medidor
// visual da prévia de configurações).
function MicMeter({ stream, threshold }: { stream: MediaStream | null; threshold: number }) {
  const [level, setLevel] = useState(0)

  useEffect(() => {
    if (!stream || stream.getAudioTracks().length === 0) {
      setLevel(0)
      return
    }

    const audioContext = new AudioContext()
    const source = audioContext.createMediaStreamSource(stream)
    const analyser = audioContext.createAnalyser()
    analyser.fftSize = 512
    const buffer = new Uint8Array(analyser.fftSize)
    source.connect(analyser)

    const timer = setInterval(() => {
      analyser.getByteTimeDomainData(buffer)
      let sumSquares = 0
      for (const value of buffer) {
        const centered = value - 128
        sumSquares += centered * centered
      }
      setLevel(Math.sqrt(sumSquares / buffer.length))
    }, METER_SAMPLE_MS)

    return () => {
      clearInterval(timer)
      source.disconnect()
      audioContext.close().catch(() => {})
    }
  }, [stream])

  const levelPct = Math.min(100, (level / METER_MAX) * 100)
  const thresholdPct = Math.min(100, (threshold / METER_MAX) * 100)
  const speaking = level > threshold

  return (
    <div className="relative h-2.5 w-full overflow-hidden border border-line bg-panel-2">
      <div
        className={`h-full transition-[width] duration-75 ${speaking ? 'bg-volt' : 'bg-mist-faint'}`}
        style={{ width: `${levelPct}%` }}
      />
      <div className="absolute top-0 h-full w-0.5 bg-plasma" style={{ left: `${thresholdPct}%` }} />
    </div>
  )
}
