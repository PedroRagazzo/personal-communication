import { useSettingsStore } from '../stores/settingsStore'

// Captura do microfone com as preferências atuais (dispositivo + eco/ruído,
// ver settingsStore.ts) — um lugar só pra call (voiceStore) e pra prévia das
// Configurações capturarem igual. `exact` no deviceId pra de fato usar o
// escolhido; se ele sumiu (headset desconectado), cai pro padrão do Windows
// em vez de impedir a pessoa de entrar na call.
export async function captureMicrophone(): Promise<MediaStream> {
  const { mic, devices } = useSettingsStore.getState()
  const base = { echoCancellation: mic.echoCancellation, noiseSuppression: mic.noiseSuppression }

  if (devices.inputId) {
    try {
      return await navigator.mediaDevices.getUserMedia({
        audio: { ...base, deviceId: { exact: devices.inputId } }
      })
    } catch (err) {
      const missing = err instanceof Error && (err.name === 'OverconstrainedError' || err.name === 'NotFoundError')
      if (!missing) throw err
    }
  }

  return navigator.mediaDevices.getUserMedia({ audio: base })
}
