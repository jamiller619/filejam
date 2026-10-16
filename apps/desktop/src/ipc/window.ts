import { type BrowserWindow, ipcMain } from 'electron'
import { authorizeRenderer, withIpcMiddleware } from './middleware.js'

export function registerWindowIpc(window: BrowserWindow) {
  ipcMain.handle(
    'window:setControlsColor',
    withIpcMiddleware((_event, color: unknown) => {
      if (typeof color !== 'string' || !/^#[\da-f]{6}$/i.test(color)) {
        throw new Error('Invalid window controls color')
      }
      if (process.platform !== 'darwin') {
        window.setTitleBarOverlay({ symbolColor: color })
      }
    }, authorizeRenderer(window.webContents)),
  )
  return () => ipcMain.removeHandler('window:setControlsColor')
}
