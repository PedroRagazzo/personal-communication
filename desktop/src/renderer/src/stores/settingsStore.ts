import { create } from 'zustand'
import { SPEAKING_THRESHOLD } from '../webrtc/SpeakingDetector'

export interface MicSettings {
  echoCancellation: boolean
  noiseSuppression: boolean
  micSensitivity: number
}

export const MIC_SENSITIVITY_MIN = 1
export const MIC_SENSITIVITY_MAX = 40

const DEFAULT_MIC_SETTINGS: MicSettings = {
  echoCancellation: true,
  noiseSuppression: true,
  micSensitivity: SPEAKING_THRESHOLD
}

interface SettingsState {
  userId: string | null
  mic: MicSettings
  loadForUser: (userId: string) => void
  setEchoCancellation: (value: boolean) => void
  setNoiseSuppression: (value: boolean) => void
  setMicSensitivity: (value: number) => void
}

// Configuração de microfone é sobre o dispositivo/ambiente físico da
// pessoa, não algo que devesse sincronizar entre aparelhos diferentes via
// backend — por isso local (localStorage), não a conta. "Por usuário"
// aqui significa por conta logada NESSE aparelho, não sincronizado entre
// aparelhos: chave inclui o id do usuário pra não misturar configurações
// se mais de uma conta já logou no mesmo Electron (window.api.secureStorage
// existe, mas é pra segredo — chave/valor simples não-sensível não precisa
// do round-trip por IPC).
function storageKey(userId: string): string {
  return `tora-mic-settings:${userId}`
}

function loadFromStorage(userId: string): MicSettings {
  try {
    const raw = localStorage.getItem(storageKey(userId))
    if (!raw) return DEFAULT_MIC_SETTINGS
    const parsed = JSON.parse(raw) as Partial<MicSettings>
    return {
      echoCancellation: parsed.echoCancellation ?? DEFAULT_MIC_SETTINGS.echoCancellation,
      noiseSuppression: parsed.noiseSuppression ?? DEFAULT_MIC_SETTINGS.noiseSuppression,
      micSensitivity: parsed.micSensitivity ?? DEFAULT_MIC_SETTINGS.micSensitivity
    }
  } catch {
    return DEFAULT_MIC_SETTINGS
  }
}

function saveToStorage(userId: string, mic: MicSettings): void {
  try {
    localStorage.setItem(storageKey(userId), JSON.stringify(mic))
  } catch {
    // localStorage indisponível (ex. modo privado) — configuração só dura a sessão atual, não é crítico
  }
}

export const useSettingsStore = create<SettingsState>((set, get) => ({
  userId: null,
  mic: DEFAULT_MIC_SETTINGS,

  loadForUser: (userId) => {
    if (get().userId === userId) return
    set({ userId, mic: loadFromStorage(userId) })
  },

  setEchoCancellation: (echoCancellation) => {
    const mic = { ...get().mic, echoCancellation }
    set({ mic })
    if (get().userId) saveToStorage(get().userId as string, mic)
  },

  setNoiseSuppression: (noiseSuppression) => {
    const mic = { ...get().mic, noiseSuppression }
    set({ mic })
    if (get().userId) saveToStorage(get().userId as string, mic)
  },

  setMicSensitivity: (micSensitivity) => {
    const mic = { ...get().mic, micSensitivity }
    set({ mic })
    if (get().userId) saveToStorage(get().userId as string, mic)
  }
}))
