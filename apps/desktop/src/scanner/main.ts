import type { FileScanner } from '@files/server/scanner'
import { ipcMain, type WebContents } from 'electron'
import { authorizeRenderer, withIpcMiddleware } from '../ipc/middleware.js'

/** Register after creating the window. Only its main frame can access the scanner. */
export function registerScannerIpc(
  scanner: FileScanner,
  renderer: WebContents,
) {
  const unsubscribe = scanner.onUpdated(() => {
    if (!renderer.isDestroyed()) {
      renderer.send('scanner:updated')
    }
  })

  const methods = ['start', 'status', 'results', 'cancel'] as const

  for (const method of methods) {
    ipcMain.handle(
      `scanner:${method}`,
      withIpcMiddleware((_event, root: unknown) => {
        if (method === 'start') {
          if (typeof root !== 'string' || !root.trim()) {
            throw new Error('A scan root is required')
          }

          return scanner.start(root)
        }

        if (method === 'results') {
          if (
            root !== undefined &&
            (typeof root !== 'string' || !root.trim())
          ) {
            throw new Error('A scan root is required')
          }

          return scanner.results(root as string | undefined)
        }

        return scanner[method]()
      }, authorizeRenderer(renderer)),
    )
  }

  return () => {
    unsubscribe()

    for (const method of methods) {
      ipcMain.removeHandler(`scanner:${method}`)
    }
  }
}
