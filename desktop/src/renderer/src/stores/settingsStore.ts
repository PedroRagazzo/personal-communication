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

export interface ShortcutSettings {
  mute: string | null
  deafen: string | null
}

// v1.7.0 — atalhos globais (funcionam mesmo com a janela sem foco/
// minimizada, ver main/index.ts) pra mutar/ensurdecer sem precisar
// alternar pro app. Combinação improvável de já estar em uso por outro
// programa comum; se `window.api.shortcuts.set` falhar (globalShortcut.
// register nega — já reservada por outra coisa no SO), a pessoa vê isso
// na hora em Configurações e escolhe outra.
const DEFAULT_SHORTCUTS: ShortcutSettings = {
  mute: 'Control+Shift+M',
  deafen: 'Control+Shift+D'
}

interface PersistedSettings {
  mic: MicSettings
  soundCuesEnabled: boolean
  shortcuts: ShortcutSettings
}

interface SettingsState {
  userId: string | null
  mic: MicSettings
  soundCuesEnabled: boolean
  shortcuts: ShortcutSettings
  loadForUser: (userId: string) => void
  setEchoCancellation: (value: boolean) => void
  setNoiseSuppression: (value: boolean) => void
  setMicSensitivity: (value: number) => void
  setSoundCuesEnabled: (value: boolean) => void
  setShortcut: (action: keyof ShortcutSettings, accelerator: string | null) => Promise<boolean>
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
    if (!raw) {
      return { mic: DEFAULT_MIC_SETTINGS, soundCuesEnabled: DEFAULT_SOUND_CUES_ENABLED, shortcuts: DEFAULT_SHORTCUTS }
    }
    const parsed = JSON.parse(raw) as Partial<MicSettings> & {
      soundCuesEnabled?: boolean
      shortcuts?: Partial<ShortcutSettings>
    }
    return {
      mic: {
        echoCancellation: parsed.echoCancellation ?? DEFAULT_MIC_SETTINGS.echoCancellation,
        noiseSuppression: parsed.noiseSuppression ?? DEFAULT_MIC_SETTINGS.noiseSuppression,
        micSensitivity: parsed.micSensitivity ?? DEFAULT_MIC_SETTINGS.micSensitivity
      },
      soundCuesEnabled: parsed.soundCuesEnabled ?? DEFAULT_SOUND_CUES_ENABLED,
      shortcuts: {
        mute: parsed.shortcuts?.mute ?? DEFAULT_SHORTCUTS.mute,
        deafen: parsed.shortcuts?.deafen ?? DEFAULT_SHORTCUTS.deafen
      }
    }
  } catch {
    return { mic: DEFAULT_MIC_SETTINGS, soundCuesEnabled: DEFAULT_SOUND_CUES_ENABLED, shortcuts: DEFAULT_SHORTCUTS }
  }
}

function saveToStorage(userId: string, settings: PersistedSettings): void {
  try {
    localStorage.setItem(
      storageKey(userId),
      JSON.stringify({
        ...settings.mic,
        soundCuesEnabled: settings.soundCuesEnabled,
        shortcuts: settings.shortcuts
      })
    )
  } catch {
    // localStorage indisponível (ex. modo privado) — configuração só dura a sessão atual, não é crítico
  }
}

export const useSettingsStore = create<SettingsState>((set, get) => ({
  userId: null,
  mic: DEFAULT_MIC_SETTINGS,
  soundCuesEnabled: DEFAULT_SOUND_CUES_ENABLED,
  shortcuts: DEFAULT_SHORTCUTS,

  loadForUser: (userId) => {
    if (get().userId === userId) return
    const loaded = loadFromStorage(userId)
    set({ userId, mic: loaded.mic, soundCuesEnabled: loaded.soundCuesEnabled, shortcuts: loaded.shortcuts })
    applySoundCuesToggle(loaded.soundCuesEnabled)
    window.api.shortcuts.set('mute', loaded.shortcuts.mute)
    window.api.shortcuts.set('deafen', loaded.shortcuts.deafen)
  },

  setEchoCancellation: (echoCancellation) => {
    const mic = { ...get().mic, echoCancellation }
    set({ mic })
    if (get().userId) {
      saveToStorage(get().userId as string, { mic, soundCuesEnabled: get().soundCuesEnabled, shortcuts: get().shortcuts })
    }
  },

  setNoiseSuppression: (noiseSuppression) => {
    const mic = { ...get().mic, noiseSuppression }
    set({ mic })
    if (get().userId) {
      saveToStorage(get().userId as string, { mic, soundCuesEnabled: get().soundCuesEnabled, shortcuts: get().shortcuts })
    }
  },

  setMicSensitivity: (micSensitivity) => {
    const mic = { ...get().mic, micSensitivity }
    set({ mic })
    if (get().userId) {
      saveToStorage(get().userId as string, { mic, soundCuesEnabled: get().soundCuesEnabled, shortcuts: get().shortcuts })
    }
  },

  setSoundCuesEnabled: (soundCuesEnabled) => {
    set({ soundCuesEnabled })
    applySoundCuesToggle(soundCuesEnabled)
    if (get().userId) {
      saveToStorage(get().userId as string, { mic: get().mic, soundCuesEnabled, shortcuts: get().shortcuts })
    }
  },

  // Registra de verdade no processo main ANTES de salvar/confirmar — se o
  // SO recusar (já reservado por outro programa), não atualiza o estado
  // nem persiste, e quem chamou (SettingsModal.tsx) sabe pelo `false` que
  // volta que precisa pedir outra tecla, em vez de salvar uma preferência
  // que nunca funcionou de verdade.
  setShortcut: async (action, accelerator) => {
    const { ok } = await window.api.shortcuts.set(action, accelerator)
    if (!ok) return false

    const shortcuts = { ...get().shortcuts, [action]: accelerator }
    set({ shortcuts })
    if (get().userId) {
      saveToStorage(get().userId as string, { mic: get().mic, soundCuesEnabled: get().soundCuesEnabled, shortcuts })
    }
    return true
  }
}))
