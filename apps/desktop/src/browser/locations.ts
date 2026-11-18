import { access } from 'node:fs/promises'
import { app, type BrowserWindow, dialog, ipcMain } from 'electron'
import { authorizeRenderer, withIpcMiddleware } from '../ipc/middleware.js'

export type Location = { name: string; path: string }
export type Locations = {
  home: string
  places: Location[]
  favorites: Location[]
}

export async function registerLocations(window: BrowserWindow) {
  const home = app.getPath('home')
  const places: Location[] = [{ name: 'Home', path: home }]
  for (const key of [
    'desktop',
    'documents',
    'downloads',
    'pictures',
    'music',
    'videos',
  ] as const) {
    const path = app.getPath(key)
    try {
      await access(path)
      if (!places.some((place) => place.path === path)) {
        places.push({ name: key.charAt(0).toUpperCase() + key.slice(1), path })
      }
    } catch {
      /* Missing optional standard folder. */
    }
  }
  const roots =
    process.platform === 'win32'
      ? Array.from(
          { length: 26 },
          (_, index) => `${String.fromCharCode(65 + index)}:\\`,
        )
      : ['/']
  const available = await Promise.all(
    roots.map(async (path) => {
      try {
        await access(path)
        return path
      } catch {
        return null
      }
    }),
  )
  for (const path of available) {
    if (path) {
      places.push({ name: path, path })
    }
  }
  const snapshot = (): Locations => ({
    home,
    places,
    favorites: [],
  })
  const authorize = authorizeRenderer(window.webContents)
  ipcMain.handle(
    'browser:choose-folder',
    withIpcMiddleware(async () => {
      const result = await dialog.showOpenDialog(window, {
        properties: ['openDirectory'],
      })
      return result.canceled ? null : (result.filePaths[0] ?? null)
    }, authorize),
  )
  ipcMain.handle(
    'browser:locations',
    withIpcMiddleware(() => snapshot(), authorize),
  )
  return () => {
    ipcMain.removeHandler('browser:choose-folder')
    ipcMain.removeHandler('browser:locations')
  }
}
