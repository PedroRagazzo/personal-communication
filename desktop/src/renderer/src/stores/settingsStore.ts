import { create } from 'zustand'
import { SPEAKING_THRESHOLD } from '../webrtc/SpeakingDetector'
import {
  setSoundCuesEnabled as applySoundCuesToggle,
  setOutputDevice as applySoundCuesOutput
} from '../services/soundCues'

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

// v1.9.0 — `deviceId`s de `enumerateDevices()`; `null` = padrão do Windows.
export interface AudioDeviceSettings {
  inputId: string | null
  outputId: string | null
}

const DEFAULT_DEVICES: AudioDeviceSettings = { inputId: null, outputId: null }

interface PersistedSettings {
  mic: MicSettings
  soundCuesEnabled: boolean
  shortcuts: ShortcutSettings
  devices: AudioDeviceSettings
}

interface SettingsState extends PersistedSettings {
  userId: string | null
  loadForUser: (userId: string) => void
  setEchoCancellation: (value: boolean) => void
  setNoiseSuppression: (value: boolean) => void
  setMicSensitivity: (value: number) => void
  setSoundCuesEnabled: (value: boolean) => void
  setShortcut: (action: keyof ShortcutSettings, accelerator: string | null) => Promise<boolean>
  setInputDevice: (deviceId: string | null) => void
  setOutputDevice: (deviceId: string | null) => void
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

const DEFAULT_SETTINGS: PersistedSettings = {
  mic: DEFAULT_MIC_SETTINGS,
  soundCuesEnabled: DEFAULT_SOUND_CUES_ENABLED,
  shortcuts: DEFAULT_SHORTCUTS,
  devices: DEFAULT_DEVICES
}

function loadFromStorage(userId: string): PersistedSettings {
  try {
    const raw = localStorage.getItem(storageKey(userId))
    if (!raw) return DEFAULT_SETTINGS
    const parsed = JSON.parse(raw) as Partial<MicSettings> & {
      soundCuesEnabled?: boolean
      shortcuts?: Partial<ShortcutSettings>
      devices?: Partial<AudioDeviceSettings>
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
      },
      devices: {
        inputId: parsed.devices?.inputId ?? null,
        outputId: parsed.devices?.outputId ?? null
      }
    }
  } catch {
    return DEFAULT_SETTINGS
  }
}

function saveToStorage(userId: string, settings: PersistedSettings): void {
  try {
    localStorage.setItem(
      storageKey(userId),
      JSON.stringify({
        ...settings.mic,
        soundCuesEnabled: settings.soundCuesEnabled,
        shortcuts: settings.shortcuts,
        devices: settings.devices
      })
    )
  } catch {
    // localStorage indisponível (ex. modo privado) — configuração só dura a sessão atual, não é crítico
  }
}

export const useSettingsStore = create<SettingsState>((set, get) => {
  function persist(): void {
    const { userId, mic, soundCuesEnabled, shortcuts, devices } = get()
    if (userId) saveToStorage(userId, { mic, soundCuesEnabled, shortcuts, devices })
  }

  return {
    userId: null,
    ...DEFAULT_SETTINGS,

    loadForUser: (userId) => {
      if (get().userId === userId) return
      const loaded = loadFromStorage(userId)
      set({ userId, ...loaded })
      applySoundCuesToggle(loaded.soundCuesEnabled)
      applySoundCuesOutput(loaded.devices.outputId)
      window.api.shortcuts.set('mute', loaded.shortcuts.mute)
      window.api.shortcuts.set('deafen', loaded.shortcuts.deafen)
    },

    setEchoCancellation: (echoCancellation) => {
      set({ mic: { ...get().mic, echoCancellation } })
      persist()
    },

    setNoiseSuppression: (noiseSuppression) => {
      set({ mic: { ...get().mic, noiseSuppression } })
      persist()
    },

    setMicSensitivity: (micSensitivity) => {
      set({ mic: { ...get().mic, micSensitivity } })
      persist()
    },

    setSoundCuesEnabled: (soundCuesEnabled) => {
      set({ soundCuesEnabled })
      applySoundCuesToggle(soundCuesEnabled)
      persist()
    },

    // Só guarda a preferência — trocar o mic de uma call em andamento é com
    // voiceStore.applyInputDevice() (settingsStore nunca importa voiceStore).
    setInputDevice: (inputId) => {
      set({ devices: { ...get().devices, inputId } })
      persist()
    },

    // Os elementos de áudio/vídeo leem isso direto (useAudioOutput, em
    // CallAudio.tsx); os sons de identificação têm um AudioContext próprio.
    setOutputDevice: (outputId) => {
      set({ devices: { ...get().devices, outputId } })
      applySoundCuesOutput(outputId)
      persist()
    },

    // Registra de verdade no processo main ANTES de salvar/confirmar — se o
    // SO recusar (já reservado por outro programa), não atualiza o estado
    // nem persiste, e quem chamou (SettingsModal.tsx) sabe pelo `false` que
    // volta que precisa pedir outra tecla, em vez de salvar uma preferência
    // que nunca funcionou de verdade.
    setShortcut: async (action, accelerator) => {
      const { ok } = await window.api.shortcuts.set(action, accelerator)
      if (!ok) return false

      set({ shortcuts: { ...get().shortcuts, [action]: accelerator } })
      persist()
      return true
    }
  }
})
