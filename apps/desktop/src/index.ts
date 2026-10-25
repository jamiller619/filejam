import { fileURLToPath } from 'node:url'
import { boot } from '@filejam/server'
import { app, BrowserWindow, dialog, net, protocol, screen } from 'electron'
import { registerApiIpc } from './api/main.js'
import { resolveDefaultFolder } from './defaultFolders.js'
import { registerImageViewerIpc } from './ipc/image-viewer.js'
import { registerWindowIpc } from './ipc/window.js'
import { createPreviewService } from './preview/create-service.js'
import { createFileIconProvider } from './preview/file-icons.js'
import { createPreviewHandler } from './preview/handler.js'
import type { PreviewService } from './preview/service.js'
import { registerScannerIpc } from './scanner/main.js'
import {
  createSettingsApi,
  initSettings,
  type SettingsApi,
  type SettingsStore,
} from './settings/index.js'
import { settingsKeys } from './settings/settings.js'
import { getOsTrashRoots } from './trash/roots.js'
import { readWindowState, trackWindowState } from './window-state.js'

protocol.registerSchemesAsPrivileged([
  {
    scheme: 'filejam-preview',
    privileges: { standard: true, secure: true, stream: true },
  },
])

if (!app.isPackaged && process.env.FILEJAM_RENDERER_URL) {
  process.on('message', (message) => {
    if (message === 'filejam:dev:quit') {
      app.quit()
    }
  })
}

let server: Awaited<ReturnType<typeof boot>> | undefined
let window: BrowserWindow | undefined
let removeScannerIpc: (() => void) | undefined
let removeApiIpc: (() => void) | undefined
let removeImageViewerIpc: (() => Promise<void>) | undefined
let startup: Promise<void> | undefined
let quitting = false
let shutdownComplete = false
let previews: PreviewService | undefined
let saveMainWindowState: (() => Promise<void>) | undefined
let settings: SettingsStore | undefined
let settingsApi: SettingsApi | undefined

async function createWindow() {
  if (!server || quitting) {
    return
  }

  if (!settings || !settingsApi) {
    return
  }

  const settingsStore = settings
  const currentSettingsApi = settingsApi
  const area = screen.getPrimaryDisplay().workArea
  const state = readWindowState(
    settingsStore.get('window.main'),
    {
      x: area.x + Math.floor((area.width - 1100) / 2),
      y: area.y + Math.floor((area.height - 760) / 2),
      width: 1100,
      height: 760,
    },
    screen.getAllDisplays().map((display) => display.workArea),
  )
  const current = new BrowserWindow({
    title: 'Filejam',
    ...state.bounds,
    minWidth: 600,
    minHeight: 400,
    show: false,
    frame: false,
    // Windows needs a non-layered window for native rounded corners and Mica.
    transparent: process.platform !== 'win32',
    titleBarStyle: 'hidden',
    titleBarOverlay: {
      color: '#00000000',
      height: 36,
    },
    backgroundMaterial: 'acrylic',
    vibrancy: 'window',
    visualEffectState: 'followWindow',
    roundedCorners: true,
    webPreferences: {
      preload: fileURLToPath(new URL('./scanner/preload.cjs', import.meta.url)),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  })

  window = current
  saveMainWindowState = trackWindowState(current, state, (value) =>
    settingsStore.set('window.main', value),
  )

  const removeWindowIpc = registerWindowIpc(current)

  removeImageViewerIpc = registerImageViewerIpc(
    current,
    server.api.libraries,
    previews?.registry,
    currentSettingsApi,
  )

  removeScannerIpc = registerScannerIpc(server.scanner, current.webContents)

  const scanner = server.scanner

  removeApiIpc = registerApiIpc(
    server.api,
    current.webContents,
    currentSettingsApi,
    (root) => scanner.start(root),
  )

  // The scanner bridge is privileged: this window only hosts local app content.
  current.webContents.setWindowOpenHandler(() => ({ action: 'deny' }))

  current.webContents.on('will-navigate', (event) => {
    // Vite's full-reload fallback reloads the current page from the renderer.
    if (event.url !== current.webContents.getURL()) {
      event.preventDefault()
    }
  })

  current.once('closed', () => {
    removeWindowIpc()
    void removeImageViewerIpc?.()
    removeImageViewerIpc = undefined
    removeApiIpc?.()
    removeApiIpc = undefined
    removeScannerIpc?.()
    removeScannerIpc = undefined
    window = undefined
  })

  const rendererUrl = process.env.FILEJAM_RENDERER_URL

  if (!app.isPackaged && rendererUrl) {
    const url = new URL(rendererUrl)

    if (url.protocol !== 'http:' || url.hostname !== '127.0.0.1') {
      throw new Error('Development renderer must use a local HTTP server')
    }

    await current.loadURL(url.href)
  } else {
    await current.loadFile(
      fileURLToPath(new URL('./renderer/index.html', import.meta.url)),
    )
  }

  if (!quitting && !current.isDestroyed()) {
    current.show()

    if (!app.isPackaged && rendererUrl) {
      current.webContents.openDevTools({ mode: 'detach' })
    }
  }
}

function reportFailure(error: unknown) {
  console.error('Desktop startup failed', error)

  dialog.showErrorBox(
    'Filejam could not start',
    error instanceof Error ? error.message : String(error),
  )

  process.exitCode = 1
  app.quit()
}

// A second process must not compete for the same scanner cache and database.
if (!app.requestSingleInstanceLock()) {
  app.quit()
} else {
  app.on('second-instance', () => {
    if (window?.isMinimized()) {
      window.restore()
    }

    window?.focus()
  })

  app.on('before-quit', (event) => {
    if (shutdownComplete) {
      return
    }

    event.preventDefault()

    if (quitting) {
      return
    }

    quitting = true

    // Quit may arrive while boot is in flight. Wait for it before closing the
    // worker, database, and log stream; then let the second quit proceed.
    void (async () => {
      try {
        // Startup may fail after boot succeeded (for example, loading the page).
        // Still close any server instance that was already created.
        await startup?.catch(() => undefined)
        removeScannerIpc?.()
        removeScannerIpc = undefined
        removeApiIpc?.()
        removeApiIpc = undefined
        await removeImageViewerIpc?.()
        removeImageViewerIpc = undefined
        await saveMainWindowState?.()
        await settings?.write()
        await previews?.close()
        await server?.close()
      } catch (error) {
        console.error('Desktop shutdown failed', error)
        process.exitCode = 1
      } finally {
        shutdownComplete = true
        app.quit()
      }
    })()
  })

  app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') {
      app.quit()
    }
  })

  app.on('activate', () => {
    if (server && !window && !quitting) {
      void createWindow().catch(reportFailure)
    }
  })

  startup = app.whenReady().then(async () => {
    if (quitting) {
      return
    }

    server = await boot({
      resolveDefaultFolder: (folder) =>
        resolveDefaultFolder(folder, (name) => app.getPath(name)),
      trashRoots: await getOsTrashRoots(),
    })

    const legacyConfig = server.config.getStore() as unknown as Record<
      string,
      unknown
    >
    const initializedSettings = await initSettings(
      app.getPath('userData'),
      legacyConfig,
    )

    settings = initializedSettings.store
    settingsApi = createSettingsApi(settings)

    if (initializedSettings.legacyKeys.length) {
      const runtimeConfig = { ...legacyConfig }

      for (const key of settingsKeys) {
        delete runtimeConfig[key]
      }

      await server.config.replaceStore(
        runtimeConfig as unknown as ReturnType<typeof server.config.getStore>,
      )
    }

    if (
      initializedSettings.created &&
      initializedSettings.migratedKeys.length === 0 &&
      settings.get('user.favoriteFolders').length === 0
    ) {
      const favorites = (await server.api.libraries.list())
        .filter((library) =>
          ['desktop', 'downloads'].includes(library.name.toLowerCase()),
        )
        .map((library) => library.rootPath)

      await settings.set('user.favoriteFolders', favorites)
    }

    previews = await createPreviewService(app.getPath('userData'))
    const fileIcons = createFileIconProvider(async (file, size) => {
      const icon = await app.getFileIcon(file, { size })
      const bytes = icon.toPNG()

      return bytes.length ? Uint8Array.from(bytes) : null
    })

    protocol.handle(
      'filejam-preview',
      createPreviewHandler(
        server.api.libraries,
        (url, init) => net.fetch(url, init),
        previews,
        fileIcons,
      ),
    )

    await createWindow()
  })

  void startup.catch(reportFailure)
}
