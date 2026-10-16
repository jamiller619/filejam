import type { FileScanner } from '@files/server/scanner'
import { ipcMain, type WebContents } from 'electron'
import { authorizeRenderer, withIpcMiddleware } from '../ipc/middleware.js'

/** Register after creating the window. Only its main frame can access the scanner. */
export function registerScannerIpc(
  scanner: FileScanner,
  renderer: WebContents,
) {
  const methods = ['start', 'status', 'results', 'cancel'] as const
  for (const method of methods) {
    ipcMain.handle(
      `scanner:${method}`,
      withIpcMiddleware((_event, root: unknown) => {
        if (method === 'start') {
          if (typeof root !== 'string' || !root.trim())
            throw new Error('A scan root is required')
          return scanner.start(root)
        }
        return scanner[method]()
      }, authorizeRenderer(renderer)),
    )
  }
  return () => {
    for (const method of methods) ipcMain.removeHandler(`scanner:${method}`)
  }
}
