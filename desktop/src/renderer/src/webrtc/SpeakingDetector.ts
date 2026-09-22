// Indicador de fala de verdade (nível de áudio), não só "não mutado" — um
// AnalyserNode (Web Audio API) por stream (mic local + cada peer remoto),
// amostrado a cada 100ms. `holdMs` mantém o indicador aceso por um
// instante depois de cair abaixo do limiar, pra não piscar entre sílabas.
//
// RMS no domínio do TEMPO (getByteTimeDomainData), não média no domínio da
// FREQUÊNCIA (getByteFrequencyData) — testado ao vivo com um tom sintético
// puro (oscillator) e a média por frequência ficava bem abaixo do limiar
// mesmo com o tom bem alto, porque um tom puro concentra toda a energia em
// só 2-3 bins de frequência (a média inclui os outros ~250 bins, quase
// todos zero, e afoga o sinal). RMS no domínio do tempo mede volume de
// verdade (o quanto a onda se afasta do centro) independente de quantas
// frequências o som ocupa — funciona igual pra um tom puro ou pra voz real
// (que tem energia espalhada por muitos harmônicos).
// Exportado: valor padrão de sensibilidade usado tanto aqui quanto no
// settingsStore.ts (configurável por usuário, ver components/SettingsModal.tsx)
// — um só lugar de verdade pro "6" original, em vez de duplicar o número.
export const SPEAKING_THRESHOLD = 6
const SAMPLE_INTERVAL_MS = 100
const HOLD_MS = 400

interface WatchEntry {
  source: MediaStreamAudioSourceNode
  analyser: AnalyserNode
  buffer: Uint8Array<ArrayBuffer>
  lastAboveAt: number
}

export class SpeakingDetector {
  private audioContext: AudioContext
  private entries = new Map<string, WatchEntry>()
  private timer: ReturnType<typeof setInterval> | null = null
  private threshold: number

  constructor(
    private readonly onChange: (speakingIds: Set<string>) => void,
    initialThreshold: number = SPEAKING_THRESHOLD
  ) {
    this.audioContext = new AudioContext()
    this.threshold = initialThreshold
  }

  // Ajuste ao vivo (configurações → sensibilidade do microfone) — não
  // precisa recriar o detector nem reconectar nada, o próximo sample() já
  // usa o valor novo.
  setThreshold(value: number): void {
    this.threshold = value
  }

  watch(id: string, stream: MediaStream): void {
    if (this.entries.has(id) || stream.getAudioTracks().length === 0) return

    const source = this.audioContext.createMediaStreamSource(stream)
    const analyser = this.audioContext.createAnalyser()
    analyser.fftSize = 512
    analyser.smoothingTimeConstant = 0.4
    source.connect(analyser)

    this.entries.set(id, {
      source,
      analyser,
      // getByteTimeDomainData espera um buffer do tamanho de `fftSize`,
      // não `frequencyBinCount` (que é fftSize/2, usado só pra dados de
      // frequência) — confirmado na doc oficial do AnalyserNode.
      buffer: new Uint8Array(analyser.fftSize),
      lastAboveAt: 0
    })

    if (!this.timer) {
      this.timer = setInterval(() => this.sample(), SAMPLE_INTERVAL_MS)
    }
  }

  unwatch(id: string): void {
    const entry = this.entries.get(id)
    if (!entry) return
    entry.source.disconnect()
    this.entries.delete(id)
  }

  private sample(): void {
    const now = Date.now()
    const speaking = new Set<string>()

    for (const [id, entry] of this.entries) {
      entry.analyser.getByteTimeDomainData(entry.buffer)

      let sumSquares = 0
      for (const value of entry.buffer) {
        const centered = value - 128
        sumSquares += centered * centered
      }
      const rms = Math.sqrt(sumSquares / entry.buffer.length)

      if (rms > this.threshold) entry.lastAboveAt = now
      if (now - entry.lastAboveAt < HOLD_MS) speaking.add(id)
    }

    this.onChange(speaking)
  }

  destroy(): void {
    if (this.timer) clearInterval(this.timer)
    this.timer = null
    for (const id of [...this.entries.keys()]) this.unwatch(id)
    this.audioContext.close()
  }
}
