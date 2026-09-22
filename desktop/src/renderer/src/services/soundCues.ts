// Sons curtos de identificação (v1.5.0, a pedido do usuário): entrar/sair
// do chat de voz, mutar/desmutar o mic, alguém começar/parar uma
// transmissão (Go Live). Sintetizados na hora via Web Audio API (osciladores
// + envelope de volume) em vez de arquivos de áudio — evita adicionar
// binários novos ao repositório só pra alguns bips curtos, e o app já usa
// a mesma API (AudioContext) em vários outros lugares (SpeakingDetector,
// medidor de volume do SettingsModal).
//
// Um único AudioContext reaproveitado entre chamadas — criar um novo por
// som tocado seria desperdício, e o navegador não precisa de interação do
// usuário pra continuar usando um contexto já em execução (só pra CRIAR
// o primeiro, que sempre acontece depois de login/clique real).

let audioContext: AudioContext | null = null
let enabled = true

function getContext(): AudioContext {
  if (!audioContext) audioContext = new AudioContext()
  return audioContext
}

// Chamado pelo settingsStore ao carregar a preferência da pessoa e a cada
// mudança no toggle "Sons de notificação" (SettingsModal.tsx) — módulo
// simples, sem Zustand: só isso já precisa, nada mais lê esse estado.
export function setSoundCuesEnabled(value: boolean): void {
  enabled = value
}

interface Note {
  frequency: number
  at: number
  duration: number
  gain?: number
}

// Uma nota com ataque rápido e decaimento exponencial suave — sem o
// envelope, ligar/desligar o oscilador direto produz um "clique" audível
// (descontinuidade na onda).
function playNote(context: AudioContext, note: Note): void {
  const oscillator = context.createOscillator()
  const gainNode = context.createGain()
  const startTime = context.currentTime + note.at
  const peakGain = note.gain ?? 0.15

  oscillator.type = 'sine'
  oscillator.frequency.value = note.frequency

  gainNode.gain.setValueAtTime(0, startTime)
  gainNode.gain.linearRampToValueAtTime(peakGain, startTime + 0.01)
  gainNode.gain.exponentialRampToValueAtTime(0.0001, startTime + note.duration)

  oscillator.connect(gainNode)
  gainNode.connect(context.destination)
  oscillator.start(startTime)
  oscillator.stop(startTime + note.duration + 0.02)
}

function playSequence(notes: Note[]): void {
  if (!enabled) return
  // Falha silenciosa de propósito — um som de identificação nunca deveria
  // derrubar a ação real (entrar na call, mutar) por causa de autoplay
  // policy ou qualquer outra restrição do navegador/SO em torno de áudio.
  try {
    const context = getContext()
    for (const note of notes) playNote(context, note)
  } catch {
    // ignora
  }
}

export function playJoinVoiceSound(): void {
  playSequence([
    { frequency: 493.88, at: 0, duration: 0.09 },
    { frequency: 659.25, at: 0.08, duration: 0.16 }
  ])
}

export function playLeaveVoiceSound(): void {
  playSequence([
    { frequency: 659.25, at: 0, duration: 0.09 },
    { frequency: 440.0, at: 0.08, duration: 0.18 }
  ])
}

export function playMuteSound(): void {
  playSequence([{ frequency: 349.23, at: 0, duration: 0.1, gain: 0.12 }])
}

export function playUnmuteSound(): void {
  playSequence([{ frequency: 523.25, at: 0, duration: 0.1, gain: 0.12 }])
}

export function playLiveStartSound(): void {
  playSequence([
    { frequency: 523.25, at: 0, duration: 0.08 },
    { frequency: 659.25, at: 0.07, duration: 0.08 },
    { frequency: 783.99, at: 0.14, duration: 0.2 }
  ])
}

export function playLiveStopSound(): void {
  playSequence([
    { frequency: 783.99, at: 0, duration: 0.08 },
    { frequency: 659.25, at: 0.07, duration: 0.08 },
    { frequency: 523.25, at: 0.14, duration: 0.2 }
  ])
}
