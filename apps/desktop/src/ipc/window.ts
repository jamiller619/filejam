import { app, type BrowserWindow, ipcMain, Menu } from 'electron'
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

  const development =
    !app.isPackaged && Boolean(process.env.FILEJAM_RENDERER_URL)

  ipcMain.handle(
    'window:canInspect',
    withIpcMiddleware(() => development, authorizeRenderer(window.webContents)),
  )
  ipcMain.handle(
    'window:inspectElement',
    withIpcMiddleware((_event, x: unknown, y: unknown) => {
      if (!development) {
        throw new Error('Inspect Element is only available in development')
      }

      if (
        typeof x !== 'number' ||
        typeof y !== 'number' ||
        !Number.isFinite(x) ||
        !Number.isFinite(y)
      ) {
        throw new Error('Invalid inspect coordinates')
      }

      window.webContents.inspectElement(Math.round(x), Math.round(y))
    }, authorizeRenderer(window.webContents)),
  )

  if (development) {
    window.webContents.on('context-menu', (_event, params) => {
      Menu.buildFromTemplate([
        {
          label: 'Inspect Element',
          click: () => window.webContents.inspectElement(params.x, params.y),
        },
      ]).popup({ window })
    })
  }

  return () => {
    ipcMain.removeHandler('window:setControlsColor')
    ipcMain.removeHandler('window:canInspect')
    ipcMain.removeHandler('window:inspectElement')
  }
}
