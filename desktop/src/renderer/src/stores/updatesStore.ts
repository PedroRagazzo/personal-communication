import { create } from 'zustand'
import type { UpdateInfo } from '../../../preload'

// Sistema de update (v1.7.0, a pedido do usuário) — checagem/download de
// verdade vivem no processo main (main/index.ts, acesso de rede/disco);
// essa store só reflete o que chega via IPC e dispara as ações que a
// pessoa pede clicando no ícone (TitleBar.tsx). Ver main/index.ts pro
// porquê de não ser `electron-updater` (instalador sem assinatura).
interface UpdatesState {
  available: UpdateInfo | null
  status: 'idle' | 'downloading' | 'downloaded' | 'error'
  downloadedPath: string | null
  error: string | null
  init: () => void
  download: () => Promise<void>
  openInstaller: () => Promise<void>
  openReleasePage: () => void
}

// `init()` é chamado do `useEffect` do TitleBar.tsx, que remonta em
// qualquer fast refresh/re-render — a store em si é o singleton real
// (Zustand só cria uma vez), então essa flag evita registrar o listener
// `onAvailable` mais de uma vez e disparar `check()` repetido à toa.
let initialized = false

export const useUpdatesStore = create<UpdatesState>((set, get) => ({
  available: null,
  status: 'idle',
  downloadedPath: null,
  error: null,

  init: () => {
    if (initialized) return
    initialized = true
    window.api.updates.onAvailable((info) => {
      set({ available: info })
    })
    window.api.updates.check()
  },

  download: async () => {
    const info = get().available
    if (!info || get().status === 'downloading') return
    set({ status: 'downloading', error: null })
    try {
      const result = await window.api.updates.download(info.downloadUrl, info.fileName)
      if (result.ok && result.path) {
        set({ status: 'downloaded', downloadedPath: result.path })
      } else {
        set({ status: 'error', error: 'não foi possível baixar a atualização' })
      }
    } catch {
      set({ status: 'error', error: 'não foi possível baixar a atualização' })
    }
  },

  openInstaller: async () => {
    const path = get().downloadedPath
    if (!path) return
    await window.api.updates.openPath(path)
  },

  openReleasePage: () => {
    const info = get().available
    if (info) window.api.updates.openReleasePage(info.releaseUrl)
  }
}))
