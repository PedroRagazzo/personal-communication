import { app, BrowserWindow, desktopCapturer, ipcMain, safeStorage, session } from 'electron'
import { join } from 'node:path'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'

// Armazenamento seguro de tokens: só o processo main toca `safeStorage`
// (backend do keychain do SO — DPAPI no Windows). O preload nunca chama isso
// direto, só troca mensagens IPC — ver docs/security.md ("Cliente Electron
// guarda tokens via keychain do SO, não em localStorage puro").
const STORE_PATH = join(app.getPath('userData'), 'secure-store.json')

function readStore(): Record<string, string> {
  if (!existsSync(STORE_PATH)) return {}
  return JSON.parse(readFileSync(STORE_PATH, 'utf-8'))
}

function writeStore(store: Record<string, string>): void {
  mkdirSync(app.getPath('userData'), { recursive: true })
  writeFileSync(STORE_PATH, JSON.stringify(store), 'utf-8')
}

function ensureEncryptionAvailable(): void {
  if (!safeStorage.isEncryptionAvailable()) {
    throw new Error('criptografia do keychain do SO não está disponível nesta máquina')
  }
}

function registerSecureStorageHandlers(): void {
  ipcMain.handle('secure-storage:set', (_event, key: string, value: string) => {
    ensureEncryptionAvailable()
    const store = readStore()
    store[key] = safeStorage.encryptString(value).toString('base64')
    writeStore(store)
  })

  ipcMain.handle('secure-storage:get', (_event, key: string): string | null => {
    const store = readStore()
    const encoded = store[key]
    if (!encoded) return null
    ensureEncryptionAvailable()
    return safeStorage.decryptString(Buffer.from(encoded, 'base64'))
  })

  ipcMain.handle('secure-storage:delete', (_event, key: string) => {
    const store = readStore()
    delete store[key]
    writeStore(store)
  })
}

// Electron nega toda permissão por padrão sem um handler explícito — sem
// isso, getUserMedia (microfone, FASE 11 voz) trava/falha silenciosamente.
// Só libera 'media' (mic/câmera); tudo mais fica negado por padrão. Os dois
// handlers juntos são necessários (o check roda antes do request, ver docs
// do Electron).
function registerPermissionHandlers(): void {
  session.defaultSession.setPermissionCheckHandler((_webContents, permission) => {
    return permission === 'media' || permission === 'display-capture'
  })

  session.defaultSession.setPermissionRequestHandler((_webContents, permission, callback) => {
    callback(permission === 'media' || permission === 'display-capture')
  })
}

// Compartilhamento de tela (FASE 11, fatia 5): desktopCapturer só roda no
// main (sandbox bloqueia no renderer). Sem picker nativo no Windows
// (useSystemPicker é experimental e só existe no macOS 15+), então o
// renderer mostra a própria tela de escolha (ScreenSharePicker.tsx) — o
// fluxo é: renderer pede a lista de fontes, usuário escolhe, renderer avisa
// qual foi escolhida (`select-source`) e só então chama
// getDisplayMedia(), que dispara o handler abaixo já sabendo o que liberar.
let pendingScreenSourceId: string | null = null

function registerScreenShareHandlers(): void {
  ipcMain.handle('screen-share:list-sources', async () => {
    const sources = await desktopCapturer.getSources({
      types: ['screen', 'window'],
      thumbnailSize: { width: 300, height: 200 }
    })
    return sources.map((source) => ({
      id: source.id,
      name: source.name,
      thumbnailDataUrl: source.thumbnail.toDataURL()
    }))
  })

  ipcMain.handle('screen-share:select-source', (_event, sourceId: string) => {
    pendingScreenSourceId = sourceId
  })

  session.defaultSession.setDisplayMediaRequestHandler((_request, callback) => {
    const sourceId = pendingScreenSourceId
    pendingScreenSourceId = null

    if (!sourceId) {
      callback({})
      return
    }

    desktopCapturer.getSources({ types: ['screen', 'window'] }).then((sources) => {
      const match = sources.find((source) => source.id === sourceId)
      callback(match ? { video: match } : {})
    })
  })
}

function createWindow(): void {
  const win = new BrowserWindow({
    width: 1280,
    height: 800,
    show: false,
    webPreferences: {
      // CommonJS (.cjs), não ESM — sandbox: true não suporta preload em
      // ESM (Electron recusa carregar com "Cannot use import statement
      // outside a module"). Forçado via output.format: 'cjs' no preload
      // do electron.vite.config.ts; nome confirmado inspecionando
      // out/preload/ após o build, não assumido.
      preload: join(__dirname, '../preload/index.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true
    }
  })

  win.once('ready-to-show', () => win.show())

  if (process.env['ELECTRON_RENDERER_URL']) {
    win.loadURL(process.env['ELECTRON_RENDERER_URL'])
  } else {
    win.loadFile(join(__dirname, '../renderer/index.html'))
  }
}

app.whenReady().then(() => {
  registerSecureStorageHandlers()
  registerPermissionHandlers()
  registerScreenShareHandlers()
  createWindow()

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})
