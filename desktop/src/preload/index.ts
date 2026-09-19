import { contextBridge, ipcRenderer } from 'electron'

export interface ScreenSource {
  id: string
  name: string
  thumbnailDataUrl: string
}

// Única superfície que o renderer enxerga do mundo Node/Electron — tudo
// contextIsolation, nada de nodeIntegration. Ver docs/security.md.
const api = {
  secureStorage: {
    get: (key: string): Promise<string | null> => ipcRenderer.invoke('secure-storage:get', key),
    set: (key: string, value: string): Promise<void> =>
      ipcRenderer.invoke('secure-storage:set', key, value),
    delete: (key: string): Promise<void> => ipcRenderer.invoke('secure-storage:delete', key)
  },
  screenShare: {
    listSources: (): Promise<ScreenSource[]> => ipcRenderer.invoke('screen-share:list-sources'),
    selectSource: (sourceId: string): Promise<void> =>
      ipcRenderer.invoke('screen-share:select-source', sourceId)
  }
}

contextBridge.exposeInMainWorld('api', api)

export type Api = typeof api
