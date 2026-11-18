import { access } from 'node:fs/promises'
import { userInfo } from 'node:os'
import { app, type BrowserWindow, dialog, ipcMain } from 'electron'
import { authorizeRenderer, withIpcMiddleware } from '../ipc/middleware.js'
import { getWindowsVolumeLabels } from './windowsVolumes.js'

export type Location = { name: string; path: string }
export type Locations = {
  home: string
  places: Location[]
  drives: Location[]
  favorites: Location[]
}

export async function registerLocations(window: BrowserWindow) {
  const volumeLabels =
    process.platform === 'win32'
      ? getWindowsVolumeLabels()
      : Promise.resolve(new Map<string, string>())
  const home = app.getPath('home')
  const places: Location[] = [{ name: userInfo().username, path: home }]
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
  const labels = await volumeLabels
  const drives: Location[] = []

  for (const path of available) {
    if (path) {
      const label = labels.get(path.toUpperCase())

      drives.push({
        name: label ? `${label} (${path.slice(0, 2)})` : path,
        path,
      })
    }
  }
  const snapshot = (): Locations => ({
    home,
    places,
    drives,
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
