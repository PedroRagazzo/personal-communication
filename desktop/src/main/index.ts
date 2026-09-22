import {
  app,
  BrowserWindow,
  desktopCapturer,
  globalShortcut,
  ipcMain,
  Menu,
  nativeImage,
  safeStorage,
  session,
  shell,
  Tray
} from 'electron'
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
// Som do PC no Go Live (v1.3.0, a pedido do usuário): `audio: 'loopback'`
// é a única forma documentada do Electron de capturar áudio do sistema
// nesse fluxo de fonte customizada (não tem o checkbox nativo "compartilhar
// áudio" do picker do Chrome, porque esse app nunca usa o picker nativo).
// Só Windows — mesma limitação documentada em toda a API. É captura de
// TODO o áudio do sistema, não só da fonte de vídeo escolhida (o Windows
// não tem como isolar áudio por janela nesse mecanismo).
//
// Testado ao vivo (v1.3.0) e achado um limite real de hardware, não do
// código: nessa máquina de teste (headset USB sem fio Logitech como saída
// padrão), a captura de loopback falha com `NotReadableError: Could not
// start audio source` — reproduzido também com `'loopbackWithMute'`, e
// combina exatamente com vários issues abertos no repositório do próprio
// Electron ao longo dos anos sobre loopback falhar com dispositivos de
// áudio USB específicos no Windows (não é algo que o código desse app
// possa contornar — é o WASAPI do driver do dispositivo). Por isso
// `goLiveStore.ts` sempre tenta de novo só com vídeo se a captura com
// áudio falhar, em vez de travar a transmissão inteira por causa do som.
let pendingScreenAudio = false

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

  ipcMain.handle(
    'screen-share:select-source',
    (_event, sourceId: string, includeAudio: boolean = false) => {
      pendingScreenSourceId = sourceId
      pendingScreenAudio = includeAudio
    }
  )

  session.defaultSession.setDisplayMediaRequestHandler((_request, callback) => {
    const sourceId = pendingScreenSourceId
    const includeAudio = pendingScreenAudio
    pendingScreenSourceId = null
    pendingScreenAudio = false

    if (!sourceId) {
      callback({})
      return
    }

    desktopCapturer.getSources({ types: ['screen', 'window'] }).then((sources) => {
      const match = sources.find((source) => source.id === sourceId)
      if (!match) {
        callback({})
        return
      }
      callback(includeAudio ? { video: match, audio: 'loopback' } : { video: match })
    })
  })
}

// Atalhos globais pra mutar/ensurdecer (v1.7.0, a pedido do usuário) —
// `globalShortcut`, não um `keydown` no renderer, de propósito: precisam
// funcionar mesmo com a janela minimizada/na bandeja ou sem foco (o cenário
// mais comum de usar isso de verdade — jogando, com o app em segundo
// plano). Registrados a partir do que a pessoa configurou em
// Configurações (settingsStore.ts, localStorage) — o processo main não
// tem acesso a isso diretamente, então o renderer manda o acelerador via
// IPC assim que carrega a preferência (e de novo a cada mudança).
const registeredAccelerators: Record<'mute' | 'deafen', string | null> = {
  mute: null,
  deafen: null
}

function registerShortcutHandlers(): void {
  ipcMain.handle(
    'shortcuts:set',
    (_event, action: 'mute' | 'deafen', accelerator: string | null): { ok: boolean } => {
      const current = registeredAccelerators[action]
      if (current) globalShortcut.unregister(current)
      registeredAccelerators[action] = null

      if (!accelerator) return { ok: true }

      const ok = globalShortcut.register(accelerator, () => {
        mainWindow?.webContents.send('shortcuts:triggered', action)
      })
      if (ok) registeredAccelerators[action] = accelerator
      return { ok }
    }
  )
}

// Sistema de update (v1.7.0, a pedido do usuário: "não precisar ficar
// rebaixando toda hora") — checagem simples contra a API pública do
// GitHub (releases/latest), não `electron-updater`: o app não teria como
// autodownload/instalar silenciosamente sem assinatura de código (o
// instalador já é sem assinatura, SmartScreen já avisa "editor
// desconhecido" na instalação manual — automatizar isso silenciosamente
// levantaria o mesmo aviso de um jeito mais confuso de explicar pra quem
// tá só tentando continuar numa chamada). Em vez disso: verifica a
// versão mais nova periodicamente, avisa a renderer via IPC, e um clique
// no ícone baixa o instalador de verdade (URL pública do GitHub Release,
// repositório é público) pra pasta de downloads do usuário e oferece
// abrir — a pessoa só precisa confirmar a instalação do NSIS que já
// conhece, não precisa mais ir procurar a versão nova manualmente.
const GITHUB_REPO = 'PedroRagazzo/personal-communication'
const UPDATE_CHECK_INTERVAL_MS = 4 * 60 * 60 * 1000

interface GitHubReleaseAsset {
  name: string
  browser_download_url: string
}

interface GitHubRelease {
  tag_name: string
  html_url: string
  assets: GitHubReleaseAsset[]
}

function compareVersions(a: string, b: string): number {
  const partsA = a.split('.').map(Number)
  const partsB = b.split('.').map(Number)
  for (let i = 0; i < Math.max(partsA.length, partsB.length); i++) {
    const diff = (partsA[i] ?? 0) - (partsB[i] ?? 0)
    if (diff !== 0) return diff
  }
  return 0
}

async function fetchLatestRelease(): Promise<GitHubRelease | null> {
  try {
    const res = await fetch(`https://api.github.com/repos/${GITHUB_REPO}/releases/latest`)
    if (!res.ok) return null
    return (await res.json()) as GitHubRelease
  } catch {
    return null
  }
}

async function checkForUpdate(): Promise<void> {
  const release = await fetchLatestRelease()
  if (!release || !mainWindow) return

  const latestVersion = release.tag_name.replace(/^v/, '')
  if (compareVersions(latestVersion, app.getVersion()) <= 0) return

  const asset = release.assets.find((a) => a.name.endsWith('-setup.exe'))
  if (!asset) return

  mainWindow.webContents.send('updates:available', {
    version: latestVersion,
    releaseUrl: release.html_url,
    downloadUrl: asset.browser_download_url,
    fileName: asset.name
  })
}

function registerUpdateHandlers(): void {
  ipcMain.handle('updates:check', () => checkForUpdate())

  // Baixa de verdade pra pasta de Downloads do usuário (não só abre o
  // navegador) — direto, sem diálogo de "Salvar como" (setSavePath, não
  // setSaveDialogOptions), já que o objetivo é reduzir o trabalho manual
  // de sempre ter que ir buscar a versão nova. Progresso já aparece
  // sozinho na barra de tarefas do Windows (comportamento padrão do
  // Electron pra um DownloadItem).
  ipcMain.handle('updates:download', async (_event, downloadUrl: string, fileName: string) => {
    if (!mainWindow) return { ok: false }

    return new Promise<{ ok: boolean; path?: string }>((resolve) => {
      session.defaultSession.once('will-download', (_event, item) => {
        const savePath = join(app.getPath('downloads'), fileName)
        item.setSavePath(savePath)
        item.once('done', (_e, state) => {
          resolve(state === 'completed' ? { ok: true, path: savePath } : { ok: false })
        })
      })
      mainWindow?.webContents.downloadURL(downloadUrl)
    })
  })

  ipcMain.handle('updates:open-path', (_event, path: string) => {
    return shell.openPath(path)
  })

  ipcMain.handle('updates:open-release-page', (_event, url: string) => {
    shell.openExternal(url)
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
  registerShortcutHandlers()
  registerUpdateHandlers()
  createWindow()
  createTray()

  // Primeira checagem logo depois de abrir (dá um tempo pra janela/
  // renderer estarem prontos pra receber o IPC) e depois periodicamente —
  // o app pode ficar dias aberto na bandeja (v1.2.0), então só checar no
  // boot deixaria passar reto por qualquer versão lançada nesse meio tempo.
  setTimeout(checkForUpdate, 5000)
  setInterval(checkForUpdate, UPDATE_CHECK_INTERVAL_MS)

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
    else showMainWindow()
  })
})

// Atalhos globais (globalShortcut) continuam reservados no SO até serem
// explicitamente liberados — sem isso, a tecla ficaria "presa" pra outros
// programas mesmo depois do processo do Electron encerrar de vez, até o
// SO eventualmente perceber que o dono sumiu.
app.on('will-quit', () => {
  globalShortcut.unregisterAll()
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
