import type { ServerApi } from '@files/server'
import { ipcMain, type WebContents } from 'electron'
import { authorizeRenderer, withIpcMiddleware } from '../ipc/middleware.js'

/** Only the owning window's main frame may call the server API. */
export function registerApiIpc(api: ServerApi, renderer: WebContents) {
  ipcMain.handle(
    'config:get',
    withIpcMiddleware(
      (_event, key: Parameters<ServerApi['config']['get']>[0]) =>
        api.config.get(key),
      authorizeRenderer(renderer),
    ),
  )
  ipcMain.handle(
    'config:set',
    withIpcMiddleware(
      (
        _event,
        key: Parameters<ServerApi['config']['set']>[0],
        value: Parameters<ServerApi['config']['set']>[1],
      ) => api.config.set(key, value),
      authorizeRenderer(renderer),
    ),
  )

  ipcMain.handle(
    'libraries:list',
    withIpcMiddleware(() => api.libraries.list(), authorizeRenderer(renderer)),
  )

  ipcMain.handle(
    'entries:listChildren',
    withIpcMiddleware(
      (_event, folder: Parameters<ServerApi['entries']['listChildren']>[0]) =>
        api.entries.listChildren(folder),
      authorizeRenderer(renderer),
    ),
  )

  ipcMain.handle(
    'entries:setAppTags',
    withIpcMiddleware(
      (_event, id: number, tags: string[]) => api.entries.setAppTags(id, tags),
      authorizeRenderer(renderer),
    ),
  )

  ipcMain.handle(
    'collections:list',
    withIpcMiddleware(
      (_event) => api.collections.list(),
      authorizeRenderer(renderer),
    ),
  )
  ipcMain.handle(
    'collections:create',
    withIpcMiddleware(
      (_event, name: string) => api.collections.create(name),
      authorizeRenderer(renderer),
    ),
  )
  ipcMain.handle(
    'collections:listEntries',
    withIpcMiddleware(
      (_event, id: string) => api.collections.listEntries(id),
      authorizeRenderer(renderer),
    ),
  )
  ipcMain.handle(
    'collections:forEntry',
    withIpcMiddleware(
      (_event, id: number) => api.collections.forEntry(id),
      authorizeRenderer(renderer),
    ),
  )
  ipcMain.handle(
    'collections:setMembership',
    withIpcMiddleware(
      (_event, id: string, entryId: number, included: boolean) =>
        api.collections.setMembership(id, entryId, included),
      authorizeRenderer(renderer),
    ),
  )
  ipcMain.handle(
    'collections:recordView',
    withIpcMiddleware(
      (_event, id: number) => api.collections.recordView(id),
      authorizeRenderer(renderer),
    ),
  )
  return () => {
    ipcMain.removeHandler('config:get')
    ipcMain.removeHandler('config:set')

    ipcMain.removeHandler('collections:list')
    ipcMain.removeHandler('collections:create')
    ipcMain.removeHandler('collections:listEntries')
    ipcMain.removeHandler('collections:forEntry')
    ipcMain.removeHandler('collections:setMembership')
    ipcMain.removeHandler('collections:recordView')

    ipcMain.removeHandler('entries:setAppTags')
    ipcMain.removeHandler('libraries:list')
    ipcMain.removeHandler('entries:listChildren')
  }
}
