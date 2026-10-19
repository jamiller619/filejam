import { basename } from 'node:path'
import { fileURLToPath } from 'node:url'
import type { ServerApi } from '@files/server'
import { app, BrowserWindow, ipcMain, screen } from 'electron'
import { createPreviewHandler } from '../preview/handler.js'
import { authorizeRenderer, withIpcMiddleware } from './middleware.js'

export function registerImageViewerIpc(
  owner: BrowserWindow,
  libraries: Pick<ServerApi['libraries'], 'list'>,
) {
  const viewers = new Set<BrowserWindow>()
  // Reuse the protocol's realpath, library boundary and image checks without
  // reading image bytes just to validate an open request.
  const validate = createPreviewHandler(
    libraries,
    async () => new Response(null),
  )
  ipcMain.handle(
    'window:openImage',
    withIpcMiddleware(async (_event, libraryId: unknown, path: unknown) => {
      if (!Number.isSafeInteger(libraryId) || typeof path !== 'string') {
        throw new Error('Invalid image request')
      }
      const params = new URLSearchParams({
        libraryId: String(libraryId),
        path,
        original: '1',
      })
      const response = await validate(
        new Request(`files-preview://preview-image?${params}`),
      )
      if (!response.ok)
        throw new Error('This image is unavailable or unsupported.')
      if (owner.isDestroyed()) return
      const area = screen.getDisplayMatching(owner.getBounds()).workArea
      const width = Math.min(1000, area.width)
      const height = Math.min(800, area.height)
      const viewer = new BrowserWindow({
        title: basename(path),
        width,
        height,
        x: area.x + Math.floor((area.width - width) / 2),
        y: area.y + Math.floor((area.height - height) / 2),
        show: false,
        backgroundColor: '#202020',
        autoHideMenuBar: true,
        webPreferences: {
          contextIsolation: true,
          nodeIntegration: false,
          sandbox: true,
        },
      })
      viewers.add(viewer)
      viewer.once('closed', () => viewers.delete(viewer))
      viewer.webContents.setWindowOpenHandler(() => ({ action: 'deny' }))
      viewer.webContents.on('will-navigate', (event) => event.preventDefault())
      viewer.webContents.on('before-input-event', (event, input) => {
        if (input.type === 'keyDown' && input.key === 'Escape') {
          event.preventDefault()
          viewer.close()
        }
      })
      params.set('name', basename(path))
      try {
        const rendererUrl = process.env.FILES_RENDERER_URL
        if (!app.isPackaged && rendererUrl) {
          const url = new URL('image-viewer.html', rendererUrl)
          if (url.protocol !== 'http:' || url.hostname !== '127.0.0.1')
            throw new Error('Invalid renderer URL')
          url.search = params.toString()
          await viewer.loadURL(url.href)
        } else {
          await viewer.loadFile(
            fileURLToPath(
              new URL('../renderer/image-viewer.html', import.meta.url),
            ),
            { query: Object.fromEntries(params) },
          )
        }
        if (!viewer.isDestroyed()) viewer.show()
      } catch (error) {
        if (!viewer.isDestroyed()) viewer.destroy()
        throw error
      }
    }, authorizeRenderer(owner.webContents)),
  )
  return () => {
    ipcMain.removeHandler('window:openImage')
    for (const viewer of viewers) viewer.destroy()
    viewers.clear()
  }
}
