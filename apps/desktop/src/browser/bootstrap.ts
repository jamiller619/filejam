import { createRequire } from 'node:module'
import { dirname, resolve } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import type { BrowserWindow } from 'electron'
import { BrowserClient } from './client.js'
import { registerBrowserIpc } from './ipc.js'

type ProofSession = { window: BrowserWindow; client: BrowserClient }
type ProofPaths = { executable: string; preload: string; renderer: string }
type CleanupSession = {
  client: Pick<BrowserClient, 'close'>
  disposeIpc: () => void
  closeWindow: () => void
}

let session: ProofSession | null = null
let cleanupPromise: Promise<void> | null = null
let cleanupComplete = false
let quitPending = false
let proofClient: BrowserClient | null = null
let disposeProofIpc: (() => void) | null = null
let windowClosed = false
const require = createRequire(import.meta.url)

export function resolveProofPaths(
  moduleUrl: string,
  platform = process.platform,
): ProofPaths {
  const moduleDirectory = dirname(fileURLToPath(moduleUrl))
  const executableName =
    platform === 'win32' ? 'filejam-fs-service.exe' : 'filejam-fs-service'

  return {
    executable: resolve(
      moduleDirectory,
      '../../../../packages/fs-service/target/release',
      executableName,
    ),
    preload: resolve(moduleDirectory, './preload.cjs'),
    renderer: resolve(moduleDirectory, '../renderer/index.html'),
  }
}

export function proofWindowOptions(preload: string) {
  return {
    width: 1100,
    height: 800,
    webPreferences: {
      preload,
      sandbox: true,
      contextIsolation: true,
      nodeIntegration: false,
    },
  }
}

export function createProofCleanup(session: CleanupSession) {
  let cleanupPromise: Promise<void> | null = null

  return () => {
    if (!cleanupPromise) {
      session.disposeIpc()
      session.closeWindow()
      cleanupPromise = session.client.close()
    }

    return cleanupPromise
  }
}

export function getProofSession(): ProofSession | null {
  return session
}

async function cleanup(): Promise<void> {
  if (cleanupPromise) {
    return cleanupPromise
  }

  const currentClient = proofClient
  session = null
  proofClient = null
  disposeProofIpc?.()
  disposeProofIpc = null

  cleanupPromise = currentClient?.close() ?? Promise.resolve()
  await cleanupPromise
}

export async function startProof(): Promise<void> {
  const { app, BrowserWindow } =
    require('electron') as typeof import('electron')

  try {
    const isolatedUserData = process.env.FILEJAM_TEST_USER_DATA
    app.setPath(
      'userData',
      isolatedUserData || `${app.getPath('userData')}-live-poc`,
    )
    await app.whenReady()

    const paths = resolveProofPaths(import.meta.url)
    const client = new BrowserClient(paths.executable)
    proofClient = client
    const startPromise = client.start()
    if (windowClosed || quitPending) {
      await cleanup()
      await startPromise.catch(() => {})
      return
    }
    await startPromise

    if (windowClosed || quitPending) {
      await cleanup()
      return
    }

    const window = new BrowserWindow(proofWindowOptions(paths.preload))
    session = { window, client }
    disposeProofIpc = registerBrowserIpc(window, client)
    const rendererUrl = pathToFileURL(paths.renderer).href
    window.webContents.setWindowOpenHandler(() => ({ action: 'deny' }))
    window.webContents.on('will-navigate', (event, destination) => {
      if (destination !== rendererUrl) {
        event.preventDefault()
      }
    })
    window.once('closed', () => {
      windowClosed = true
      disposeProofIpc?.()
      disposeProofIpc = null
      if (session?.window === window) {
        void cleanup()
      }
    })
    app.on('before-quit', (event) => {
      if (cleanupComplete) {
        return
      }

      event.preventDefault()
      disposeProofIpc?.()
      disposeProofIpc = null
      if (quitPending) {
        return
      }

      quitPending = true
      void cleanup().finally(() => {
        cleanupComplete = true
        app.quit()
      })
    })
    app.on('window-all-closed', () => app.quit())

    await window.loadFile(paths.renderer)
  } catch (error) {
    console.error('Browser proof startup failed', error)
    await cleanup()
    app.exit(1)
  }
}
