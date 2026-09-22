import { app, BrowserWindow, desktopCapturer, ipcMain, Menu, nativeImage, safeStorage, session, Tray } from 'electron'
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

// Sem moldura nativa nenhuma ("borda infinita", a pedido do usuário) — o
// título e os botões de minimizar/maximizar/fechar são desenhados pelo
// próprio renderer (components/TitleBar.tsx), no mesmo sistema visual do
// resto do app, e agem via os handlers de IPC abaixo (janela não tem como
// se minimizar/fechar sozinha a partir do renderer, isso é sempre uma
// operação do processo main). Redimensionar pelas bordas continua
// funcionando sozinho no Windows mesmo sem frame — não precisa de código
// extra pra isso.
function registerWindowControlHandlers(): void {
  ipcMain.on('window:minimize', (event) => {
    BrowserWindow.fromWebContents(event.sender)?.minimize()
  })

  ipcMain.on('window:toggle-maximize', (event) => {
    const win = BrowserWindow.fromWebContents(event.sender)
    if (!win) return
    if (win.isMaximized()) win.unmaximize()
    else win.maximize()
  })

  ipcMain.on('window:close', (event) => {
    BrowserWindow.fromWebContents(event.sender)?.close()
  })

  ipcMain.handle('window:is-maximized', (event) => {
    return BrowserWindow.fromWebContents(event.sender)?.isMaximized() ?? false
  })
}

// Bandeja do Windows, a pedido do usuário — fechar a janela (✕ do
// TitleBar, ou Alt+F4) minimiza pra bandeja em vez de encerrar o processo
// de verdade, pra continuar numa chamada de voz mesmo com a janela
// fechada (Chromium não suspende WebRTC/getUserMedia de uma janela oculta,
// só invisível). Só "Sair" no menu da bandeja — ou qualquer outro caminho
// real de saída do Electron, coberto por `before-quit` abaixo, não só o
// item do menu — encerra de verdade.
let tray: Tray | null = null
let mainWindow: BrowserWindow | null = null
let isQuitting = false

function trayIconPath(): string {
  // Empacotado: `build/` não vai pro pacote por padrão (só alimenta o
  // ícone do .exe/instalador), por isso precisou de extraResources em
  // electron-builder.yml pra existir em disco em runtime.
  return app.isPackaged
    ? join(process.resourcesPath, 'icon.ico')
    : join(__dirname, '../../build/icon.ico')
}

function showMainWindow(): void {
  if (!mainWindow) return
  if (mainWindow.isMinimized()) mainWindow.restore()
  mainWindow.show()
  mainWindow.focus()
}

function quitApp(): void {
  isQuitting = true
  app.quit()
}

function createTray(): void {
  tray = new Tray(nativeImage.createFromPath(trayIconPath()))
  tray.setToolTip('TORA DOS BURRO')
  tray.setContextMenu(
    Menu.buildFromTemplate([
      { label: 'Abrir TORA DOS BURRO', click: showMainWindow },
      { type: 'separator' },
      { label: 'Sair', click: quitApp }
    ])
  )
  // Clique único (não duplo) já restaura — convenção do Windows pra ícone
  // de bandeja, diferente do macOS.
  tray.on('click', showMainWindow)
}

function createWindow(): void {
  const win = new BrowserWindow({
    width: 1280,
    height: 800,
    show: false,
    frame: false,
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

  mainWindow = win

  win.once('ready-to-show', () => win.show())

  // O botão de maximizar/restaurar do TitleBar precisa saber o estado atual
  // mesmo quando ele muda por outro caminho (duplo clique na área de
  // arrastar, Aero Snap do Windows, atalho de teclado) — não só pelo
  // próprio clique nele.
  win.on('maximize', () => win.webContents.send('window:maximize-changed', true))
  win.on('unmaximize', () => win.webContents.send('window:maximize-changed', false))

  // Fechar vai pra bandeja em vez de encerrar (ver createTray acima) — o
  // próprio botão ✕ do TitleBar chama window:close, que chama win.close()
  // normalmente; é aqui que isso vira "esconder" em vez de "fechar de
  // verdade", exceto quando `isQuitting` (Sair da bandeja, ou qualquer
  // outro caminho real de saída).
  win.on('close', (event) => {
    if (isQuitting) return
    event.preventDefault()
    win.hide()
  })

  if (process.env['ELECTRON_RENDERER_URL']) {
    win.loadURL(process.env['ELECTRON_RENDERER_URL'])
  } else {
    win.loadFile(join(__dirname, '../renderer/index.html'))
  }
}

app.whenReady().then(() => {
  // Sem isso, o Electron gera sozinho a barra padrão (File/Edit/View/
  // Window) — não faz sentido pra um app final sem essas ações (não abre
  // arquivo, não tem múltiplas janelas de verdade). Título/minimizar/
  // maximizar/fechar continuam (isso é o frame nativo da janela, não o
  // menu) — só o menu em si some.
  Menu.setApplicationMenu(null)

  registerSecureStorageHandlers()
  registerPermissionHandlers()
  registerScreenShareHandlers()
  registerWindowControlHandlers()
  createWindow()
  createTray()

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
    else showMainWindow()
  })
})

// Cobre qualquer caminho real de saída do processo (não só o "Sair" da
// bandeja) — sem isso, um app.quit() disparado de outro jeito ainda cairia
// no win.on('close') acima e só esconderia a janela, nunca encerrando de
// verdade.
app.on('before-quit', () => {
  isQuitting = true
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})
