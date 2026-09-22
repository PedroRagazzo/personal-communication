// Limiter pro áudio de sistema capturado via loopback (Go Live e
// compartilhamento de tela com som, v1.3.0/v1.4.0) — v1.7.0, bug real
// reportado: o áudio da transmissão "estourava" (clipping). O mixer do
// Windows soma várias fontes (jogo, música, e desde a v1.6.0 a própria
// voz da call, que passou a ficar audível de novo enquanto transmite) —
// nada nesse caminho impedia a soma de passar de 0dBFS antes daquela
// correção; a captura crua ia direto pro publish, sem nenhum controle de
// nível.
//
// `DynamicsCompressorNode` com ratio alto e ataque rápido funciona como
// limiter de transmissão (não compressão suave) — pega picos antes que
// cheguem a cortar (clipping de verdade, digital, é sempre pior do que
// simplesmente segurar o pico um pouco mais baixo).
const LIMITER_THRESHOLD_DB = -18
const LIMITER_KNEE_DB = 6
const LIMITER_RATIO = 16
const LIMITER_ATTACK_SECONDS = 0.003
const LIMITER_RELEASE_SECONDS = 0.15

export interface LimitedAudioTrack {
  track: MediaStreamTrack
  cleanup: () => void
}

// `track` continua vivo (não é parado aqui) mesmo que fique fora do
// MediaStream original que o chamador estava usando — ele precisa
// continuar produzindo dados pra alimentar o grafo do Web Audio. Quem
// chama é responsável por parar `track` de verdade (junto de chamar
// `cleanup()`) quando a transmissão acabar.
export function limitAudioTrack(track: MediaStreamTrack): LimitedAudioTrack {
  const context = new AudioContext()
  const source = context.createMediaStreamSource(new MediaStream([track]))
  const compressor = context.createDynamicsCompressor()
  compressor.threshold.value = LIMITER_THRESHOLD_DB
  compressor.knee.value = LIMITER_KNEE_DB
  compressor.ratio.value = LIMITER_RATIO
  compressor.attack.value = LIMITER_ATTACK_SECONDS
  compressor.release.value = LIMITER_RELEASE_SECONDS
  const destination = context.createMediaStreamDestination()
  source.connect(compressor)
  compressor.connect(destination)

  return {
    track: destination.stream.getAudioTracks()[0],
    cleanup: () => {
      source.disconnect()
      compressor.disconnect()
      context.close().catch(() => {})
    }
  }
}
