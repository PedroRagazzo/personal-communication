import { create } from 'zustand'
import { SPEAKING_THRESHOLD } from '../webrtc/SpeakingDetector'
import { setSoundCuesEnabled as applySoundCuesToggle } from '../services/soundCues'

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

// v1.5.0 — sons de identificação ligados por padrão (entrar/sair da call,
// mutar/desmutar, alguém ao vivo). Ver services/soundCues.ts.
const DEFAULT_SOUND_CUES_ENABLED = true

interface PersistedSettings {
  mic: MicSettings
  soundCuesEnabled: boolean
}

interface SettingsState {
  userId: string | null
  mic: MicSettings
  soundCuesEnabled: boolean
  loadForUser: (userId: string) => void
  setEchoCancellation: (value: boolean) => void
  setNoiseSuppression: (value: boolean) => void
  setMicSensitivity: (value: number) => void
  setSoundCuesEnabled: (value: boolean) => void
}

// Configuração de microfone é sobre o dispositivo/ambiente físico da
// pessoa, não algo que devesse sincronizar entre aparelhos diferentes via
// backend — por isso local (localStorage), não a conta. "Por usuário"
// aqui significa por conta logada NESSE aparelho, não sincronizado entre
// aparelhos: chave inclui o id do usuário pra não misturar configurações
// se mais de uma conta já logou no mesmo Electron (window.api.secureStorage
// existe, mas é pra segredo — chave/valor simples não-sensível não precisa
// do round-trip por IPC). Mesma chave usada desde antes de `soundCuesEnabled`
// existir (v1.5.0) — o nome ficou "mic-settings" por herança, mas guarda
// tudo isso agora; não vale a pena migrar pra uma chave nova só por causa
// do nome.
function storageKey(userId: string): string {
  return `tora-mic-settings:${userId}`
}

function loadFromStorage(userId: string): PersistedSettings {
  try {
    const raw = localStorage.getItem(storageKey(userId))
    if (!raw) return { mic: DEFAULT_MIC_SETTINGS, soundCuesEnabled: DEFAULT_SOUND_CUES_ENABLED }
    const parsed = JSON.parse(raw) as Partial<MicSettings> & { soundCuesEnabled?: boolean }
    return {
      mic: {
        echoCancellation: parsed.echoCancellation ?? DEFAULT_MIC_SETTINGS.echoCancellation,
        noiseSuppression: parsed.noiseSuppression ?? DEFAULT_MIC_SETTINGS.noiseSuppression,
        micSensitivity: parsed.micSensitivity ?? DEFAULT_MIC_SETTINGS.micSensitivity
      },
      soundCuesEnabled: parsed.soundCuesEnabled ?? DEFAULT_SOUND_CUES_ENABLED
    }
  } catch {
    return { mic: DEFAULT_MIC_SETTINGS, soundCuesEnabled: DEFAULT_SOUND_CUES_ENABLED }
  }
}

function saveToStorage(userId: string, settings: PersistedSettings): void {
  try {
    localStorage.setItem(
      storageKey(userId),
      JSON.stringify({ ...settings.mic, soundCuesEnabled: settings.soundCuesEnabled })
    )
  } catch {
    // localStorage indisponível (ex. modo privado) — configuração só dura a sessão atual, não é crítico
  }
}

export const useSettingsStore = create<SettingsState>((set, get) => ({
  userId: null,
  mic: DEFAULT_MIC_SETTINGS,
  soundCuesEnabled: DEFAULT_SOUND_CUES_ENABLED,

  loadForUser: (userId) => {
    if (get().userId === userId) return
    const loaded = loadFromStorage(userId)
    set({ userId, mic: loaded.mic, soundCuesEnabled: loaded.soundCuesEnabled })
    applySoundCuesToggle(loaded.soundCuesEnabled)
  },

  setEchoCancellation: (echoCancellation) => {
    const mic = { ...get().mic, echoCancellation }
    set({ mic })
    if (get().userId) saveToStorage(get().userId as string, { mic, soundCuesEnabled: get().soundCuesEnabled })
  },

  setNoiseSuppression: (noiseSuppression) => {
    const mic = { ...get().mic, noiseSuppression }
    set({ mic })
    if (get().userId) saveToStorage(get().userId as string, { mic, soundCuesEnabled: get().soundCuesEnabled })
  },

  setMicSensitivity: (micSensitivity) => {
    const mic = { ...get().mic, micSensitivity }
    set({ mic })
    if (get().userId) saveToStorage(get().userId as string, { mic, soundCuesEnabled: get().soundCuesEnabled })
  },

  setSoundCuesEnabled: (soundCuesEnabled) => {
    set({ soundCuesEnabled })
    applySoundCuesToggle(soundCuesEnabled)
    if (get().userId) saveToStorage(get().userId as string, { mic: get().mic, soundCuesEnabled })
  }
}))
