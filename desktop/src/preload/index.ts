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
    selectSource: (sourceId: string, includeAudio?: boolean): Promise<void> =>
      ipcRenderer.invoke('screen-share:select-source', sourceId, includeAudio ?? false)
  },
  // Janela sem moldura nativa (TitleBar.tsx desenha tudo) — o renderer não
  // tem como se minimizar/maximizar/fechar sozinho, só o processo main pode.
  windowControls: {
    minimize: (): void => ipcRenderer.send('window:minimize'),
    toggleMaximize: (): void => ipcRenderer.send('window:toggle-maximize'),
    close: (): void => ipcRenderer.send('window:close'),
    isMaximized: (): Promise<boolean> => ipcRenderer.invoke('window:is-maximized'),
    onMaximizeChanged: (callback: (isMaximized: boolean) => void): (() => void) => {
      const listener = (_event: Electron.IpcRendererEvent, isMaximized: boolean): void =>
        callback(isMaximized)
      ipcRenderer.on('window:maximize-changed', listener)
      return () => ipcRenderer.removeListener('window:maximize-changed', listener)
    }
  },
  // Atalhos globais de mutar/ensurdecer (v1.7.0) — só `globalShortcut` vive
  // no main; o renderer manda o acelerador (formato Electron, ex.
  // "Control+Shift+M") calculado a partir da tecla capturada em
  // SettingsModal.tsx, e escuta quando um deles dispara de verdade.
  shortcuts: {
    set: (action: 'mute' | 'deafen', accelerator: string | null): Promise<{ ok: boolean }> =>
      ipcRenderer.invoke('shortcuts:set', action, accelerator),
    onTriggered: (callback: (action: 'mute' | 'deafen') => void): (() => void) => {
      const listener = (_event: Electron.IpcRendererEvent, action: 'mute' | 'deafen'): void =>
        callback(action)
      ipcRenderer.on('shortcuts:triggered', listener)
      return () => ipcRenderer.removeListener('shortcuts:triggered', listener)
    }
  },
  // Sistema de update (v1.7.0) — checagem/download vivem no main (acesso
  // de rede/disco); o renderer só escuta "tem versão nova" e pede pra
  // baixar/abrir quando a pessoa clicar no ícone.
  updates: {
    check: (): Promise<void> => ipcRenderer.invoke('updates:check'),
    download: (
      downloadUrl: string,
      fileName: string
    ): Promise<{ ok: boolean; path?: string }> =>
      ipcRenderer.invoke('updates:download', downloadUrl, fileName),
    openPath: (path: string): Promise<string> => ipcRenderer.invoke('updates:open-path', path),
    openReleasePage: (url: string): Promise<void> => ipcRenderer.invoke('updates:open-release-page', url),
    onAvailable: (callback: (info: UpdateInfo) => void): (() => void) => {
      const listener = (_event: Electron.IpcRendererEvent, info: UpdateInfo): void => callback(info)
      ipcRenderer.on('updates:available', listener)
      return () => ipcRenderer.removeListener('updates:available', listener)
    }
  }
}

export interface UpdateInfo {
  version: string
  releaseUrl: string
  downloadUrl: string
  fileName: string
}

contextBridge.exposeInMainWorld('api', api)

export type Api = typeof api
