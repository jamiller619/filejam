import { fileURLToPath } from 'node:url'
import { boot } from '@files/server'
import { app, BrowserWindow, dialog } from 'electron'
import { registerScannerIpc } from './scanner/main.js'

if (!app.isPackaged && process.env.FILES_RENDERER_URL) {
  process.on('message', (message) => {
    if (message === 'files:dev:quit') app.quit()
  })
}

let server: Awaited<ReturnType<typeof boot>> | undefined
let window: BrowserWindow | undefined
let removeScannerIpc: (() => void) | undefined
let startup: Promise<void> | undefined
let quitting = false
let shutdownComplete = false

async function createWindow() {
  if (!server || quitting) return

  const current = new BrowserWindow({
    title: 'Files',
    width: 1100,
    height: 760,
    minWidth: 600,
    minHeight: 400,
    show: false,
    webPreferences: {
      preload: fileURLToPath(new URL('./scanner/preload.cjs', import.meta.url)),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  })
  window = current
  removeScannerIpc = registerScannerIpc(server.scanner, current.webContents)

  // The scanner bridge is privileged: this window only hosts local app content.
  current.webContents.setWindowOpenHandler(() => ({ action: 'deny' }))
  current.webContents.on('will-navigate', (event) => event.preventDefault())
  current.once('closed', () => {
    removeScannerIpc?.()
    removeScannerIpc = undefined
    window = undefined
  })
  const rendererUrl = process.env.FILES_RENDERER_URL
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
  if (!quitting && !current.isDestroyed()) current.show()
}

function reportFailure(error: unknown) {
  console.error('Desktop startup failed', error)
  dialog.showErrorBox(
    'Files could not start',
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
    if (window?.isMinimized()) window.restore()
    window?.focus()
  })

  app.on('before-quit', (event) => {
    if (shutdownComplete) return
    event.preventDefault()
    if (quitting) return
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
    if (process.platform !== 'darwin') app.quit()
  })
  app.on('activate', () => {
    if (server && !window && !quitting) void createWindow().catch(reportFailure)
  })

  startup = app.whenReady().then(async () => {
    if (quitting) return
    server = await boot()
    await createWindow()
  })
  void startup.catch(reportFailure)
}
