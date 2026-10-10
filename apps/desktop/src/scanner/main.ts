import type { FileScanner } from '@files/server/scanner'
import { ipcMain, type WebContents } from 'electron'

/** Register after creating the window. Only its main frame can access the scanner. */
export function registerScannerIpc(
  scanner: FileScanner,
  renderer: WebContents,
) {
  const methods = ['start', 'status', 'results', 'cancel'] as const
  for (const method of methods) {
    ipcMain.handle(`scanner:${method}`, (event, root: unknown) => {
      if (
        event.sender !== renderer ||
        event.senderFrame !== renderer.mainFrame
      ) {
        throw new Error('Unauthorized scanner request')
      }
      if (method === 'start') {
        if (typeof root !== 'string' || !root.trim())
          throw new Error('A scan root is required')
        return scanner.start(root)
      }
      return scanner[method]()
    })
  }
  return () => {
    for (const method of methods) ipcMain.removeHandler(`scanner:${method}`)
  }
}
