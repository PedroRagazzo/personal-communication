import { contextBridge, ipcRenderer } from 'electron'

// Única superfície que o renderer enxerga do mundo Node/Electron — tudo
// contextIsolation, nada de nodeIntegration. Ver docs/security.md.
const api = {
  secureStorage: {
    get: (key: string): Promise<string | null> => ipcRenderer.invoke('secure-storage:get', key),
    set: (key: string, value: string): Promise<void> =>
      ipcRenderer.invoke('secure-storage:set', key, value),
    delete: (key: string): Promise<void> => ipcRenderer.invoke('secure-storage:delete', key)
  }
}

contextBridge.exposeInMainWorld('api', api)

export type Api = typeof api
