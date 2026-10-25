import { basename } from 'node:path'
import { fileURLToPath } from 'node:url'
import type { Config, ConfigKey, ServerApi } from '@filejam/server'
import { app, BrowserWindow, ipcMain, screen } from 'electron'
import { authorizePreview } from '../preview/authorize.js'
import { previewMimeType } from '../preview/formats.js'
import type { PreviewRegistry } from '../preview/registry.js'
import { readWindowState, trackWindowState } from '../window-state.js'
import { authorizeRenderer, withIpcMiddleware } from './middleware.js'

export function registerImageViewerIpc(
  owner: BrowserWindow,
  libraries: Pick<ServerApi['libraries'], 'list'>,
  registry?: PreviewRegistry,
  config?: {
    get<K extends ConfigKey>(key: K): Config[K]
    set<K extends ConfigKey>(key: K, value: Config[K]): Promise<void>
  },
) {
  const viewers = new Set<BrowserWindow>()
  const saveViewerStates = new Set<() => Promise<void>>()

  ipcMain.handle(
    'preview:capabilities',
    withIpcMiddleware(async (_event, libraryId: unknown, path: unknown) => {
      if (!Number.isSafeInteger(libraryId) || typeof path !== 'string') {
        throw new Error('Invalid preview request')
      }

      const { file, info } = await authorizePreview(
        libraries,
        libraryId as number,
        path,
      )

      return {
        original:
          info.isFile() &&
          Boolean(previewMimeType(file)) &&
          (registry?.capabilities(file).original ?? true),
      }
    }, authorizeRenderer(owner.webContents)),
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

      const authorized = await authorizePreview(
        libraries,
        libraryId as number,
        path,
      )

      if (!authorized.info.isFile() || !previewMimeType(authorized.file)) {
        throw new Error('This image is unavailable or unsupported.')
      }

      if (owner.isDestroyed()) {
        return
      }

      const area = screen.getDisplayMatching(owner.getBounds()).workArea
      const width = Math.min(1000, area.width)
      const height = Math.min(800, area.height)
      const state = readWindowState(
        config?.get('window.imageViewer') ?? {},
        {
          width,
          height,
          x: area.x + Math.floor((area.width - width) / 2),
          y: area.y + Math.floor((area.height - height) / 2),
        },
        screen.getAllDisplays().map((display) => display.workArea),
      )

      const viewer = new BrowserWindow({
        title: basename(path),
        ...state.bounds,
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
      const saveState = trackWindowState(
        viewer,
        state,
        (value) =>
          config?.set('window.imageViewer', value) ?? Promise.resolve(),
      )
      saveViewerStates.add(saveState)
      viewer.once('closed', () => {
        viewers.delete(viewer)
        saveViewerStates.delete(saveState)
      })
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
        const rendererUrl = process.env.FILEJAM_RENDERER_URL

        if (!app.isPackaged && rendererUrl) {
          const url = new URL('image-viewer.html', rendererUrl)

          if (url.protocol !== 'http:' || url.hostname !== '127.0.0.1') {
            throw new Error('Invalid renderer URL')
          }

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

        if (!viewer.isDestroyed()) {
          viewer.show()
        }
      } catch (error) {
        if (!viewer.isDestroyed()) {
          viewer.destroy()
        }

        throw error
      }
    }, authorizeRenderer(owner.webContents)),
  )

  return async () => {
    ipcMain.removeHandler('window:openImage')
    ipcMain.removeHandler('preview:capabilities')

    await Promise.all([...saveViewerStates].map((save) => save()))

    for (const viewer of viewers) {
      viewer.destroy()
    }

    viewers.clear()
  }
}
