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
  const soundCuesEnabled = useSettingsStore((s) => s.soundCuesEnabled)
  const shortcuts = useSettingsStore((s) => s.shortcuts)
  const setEchoCancellation = useSettingsStore((s) => s.setEchoCancellation)
  const setNoiseSuppression = useSettingsStore((s) => s.setNoiseSuppression)
  const setMicSensitivity = useSettingsStore((s) => s.setMicSensitivity)
  const setSoundCuesEnabled = useSettingsStore((s) => s.setSoundCuesEnabled)
  const setShortcut = useSettingsStore((s) => s.setShortcut)
  const [shortcutError, setShortcutError] = useState<string | null>(null)
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

  async function handleShortcutChange(action: 'mute' | 'deafen', accelerator: string): Promise<void> {
    setShortcutError(null)
    const ok = await setShortcut(action, accelerator)
    if (!ok) {
      setShortcutError(`"${accelerator}" já está em uso por outro programa — tente outra combinação.`)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-void/80" onClick={onClose}>
      <div
        className="bevel max-h-[80vh] w-[440px] overflow-y-auto border border-line bg-panel p-5 shadow-2xl shadow-black/50"
        onClick={(e) => e.stopPropagation()}
      >
        <p className="font-mono text-[10px] tracking-[0.25em] text-volt">PREFERÊNCIAS</p>
        <h3 className="mb-4 mt-1 font-display text-lg font-bold text-mist">Configurações</h3>

        <section className="mb-5 space-y-2 border-b border-line-soft pb-5">
          <h4 className="font-mono text-[10px] tracking-[0.2em] text-mist-dim">GERAL</h4>
          <Toggle
            label="Sons de identificação"
            checked={soundCuesEnabled}
            onChange={setSoundCuesEnabled}
          />
          <p className="text-xs leading-relaxed text-mist-dim">
            Um bip curto ao entrar/sair de uma call, mutar/desmutar, e quando alguém começa ou para uma
            transmissão.
          </p>
        </section>

        <section className="mb-5 space-y-3 border-b border-line-soft pb-5">
          <h4 className="font-mono text-[10px] tracking-[0.2em] text-mist-dim">ATALHOS</h4>
          <p className="text-xs leading-relaxed text-mist-dim">
            Funcionam em qualquer lugar, mesmo com o app minimizado ou sem foco — precisam de pelo menos
            uma tecla modificadora (Ctrl/Alt/Shift) pra não travar uma tecla normal em outros programas.
          </p>
          {shortcutError && (
            <p className="border-l-2 border-plasma bg-plasma/10 px-3 py-2 text-xs text-plasma">
              {shortcutError}
            </p>
          )}
          <ShortcutRecorder
            label="Mutar microfone"
            value={shortcuts.mute}
            onChange={(accelerator) => handleShortcutChange('mute', accelerator)}
          />
          <ShortcutRecorder
            label="Ensurdecer (áudio completo)"
            value={shortcuts.deafen}
            onChange={(accelerator) => handleShortcutChange('deafen', accelerator)}
          />
        </section>

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

// Captura a próxima tecla pressionada e vira um botão de "Alterar" —
// converte pro formato de Accelerator do Electron (ex. "Control+Shift+M",
// ver main/index.ts, globalShortcut.register). `capture: true` no listener
// pra pegar o evento antes de qualquer outro handler de teclado da página.
function ShortcutRecorder({
  label,
  value,
  onChange
}: {
  label: string
  value: string | null
  onChange: (accelerator: string) => void
}) {
  const [recording, setRecording] = useState(false)

  useEffect(() => {
    if (!recording) return

    function handleKeyDown(e: KeyboardEvent): void {
      e.preventDefault()
      e.stopPropagation()
      if (e.key === 'Escape') {
        setRecording(false)
        return
      }
      const accelerator = eventToAccelerator(e)
      if (!accelerator) return // só modificador solto ainda — espera a tecla de verdade
      onChange(accelerator)
      setRecording(false)
    }

    window.addEventListener('keydown', handleKeyDown, true)
    return () => window.removeEventListener('keydown', handleKeyDown, true)
  }, [recording, onChange])

  return (
    <div className="flex items-center justify-between gap-3">
      <span className="text-sm text-mist">{label}</span>
      <button
        onClick={() => setRecording(true)}
        className={`bevel-sm min-w-[140px] border px-3 py-1.5 text-center font-mono text-xs tracking-wide transition ${
          recording
            ? 'border-volt bg-volt/10 text-volt'
            : 'border-line text-mist-dim hover:border-mist-dim hover:text-mist'
        }`}
      >
        {recording ? 'Pressione a tecla… (Esc cancela)' : (value ?? 'Nenhum')}
      </button>
    </div>
  )
}

const SHORTCUT_KEY_NAMES: Record<string, string> = {
  ' ': 'Space',
  ArrowUp: 'Up',
  ArrowDown: 'Down',
  ArrowLeft: 'Left',
  ArrowRight: 'Right',
  Delete: 'Delete',
  Backspace: 'Backspace',
  Tab: 'Tab',
  Enter: 'Return'
}

function mainKeyName(e: KeyboardEvent): string | null {
  if (e.key === 'Control' || e.key === 'Alt' || e.key === 'Shift' || e.key === 'Meta') return null
  if (SHORTCUT_KEY_NAMES[e.key]) return SHORTCUT_KEY_NAMES[e.key]
  if (/^F([1-9]|1[0-9]|2[0-4])$/.test(e.key)) return e.key
  if (e.key.length === 1) return e.key.toUpperCase()
  return null
}

// Exige pelo menos um modificador de propósito — um atalho GLOBAL
// (globalShortcut do Electron) sem modificador sequestraria essa tecla do
// sistema inteiro enquanto o app estiver aberto, tornando-a inutilizável
// em qualquer outro programa (ex.: nunca mais conseguir digitar a letra
// escolhida). Retorna `null` até isso valer (tecla real + 1+ modificador).
function eventToAccelerator(e: KeyboardEvent): string | null {
  const parts: string[] = []
  if (e.ctrlKey) parts.push('Control')
  if (e.altKey) parts.push('Alt')
  if (e.shiftKey) parts.push('Shift')
  if (e.metaKey) parts.push('Super')
  if (parts.length === 0) return null

  const key = mainKeyName(e)
  if (!key) return null

  parts.push(key)
  return parts.join('+')
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
