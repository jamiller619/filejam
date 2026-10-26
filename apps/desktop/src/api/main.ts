import { isAbsolute, relative, resolve, sep } from 'node:path'
import type { ServerApi } from '@filejam/server'
import { ipcMain, type WebContents } from 'electron'
import type { EntryRegistry } from '../entries/registry.js'
import type {
  PresentedEntry,
  PresentedFolderListing,
  PresentedVolume,
} from '../entries/types.js'
import { authorizeRenderer, withIpcMiddleware } from '../ipc/middleware.js'
import { resolveLocations } from '../locations.js'
import type { SettingsApi } from '../settings/index.js'
import { getOsTrashRoots } from '../trash/roots.js'
import { discoverVolumes } from '../volumes/discover.js'
import { createFavoriteFoldersHandler } from './favoriteFolders.js'
import { createMoveFoldersHandler } from './moveFolders.js'

/** Only the owning window's main frame may call the server API. */
export function registerApiIpc(
  api: ServerApi,
  renderer: WebContents,
  settings: SettingsApi,
  scanRoot?: (root: string) => Promise<unknown>,
  entryRegistry?: EntryRegistry,
  openPath?: (path: string) => Promise<string>,
) {
  const addFavoriteFolders = createFavoriteFoldersHandler(api, settings)
  const moveFolders = createMoveFoldersHandler(api, settings, scanRoot)
  let volumesRefreshedAt = 0
  let volumeRefresh: ReturnType<typeof api.volumes.list> | undefined

  const refreshVolumes = () => {
    if (volumeRefresh) {
      return volumeRefresh
    }

    if (Date.now() - volumesRefreshedAt < 4_000) {
      return api.volumes.list()
    }

    volumeRefresh = Promise.all([discoverVolumes(), getOsTrashRoots()])
      .then(async ([volumes, trashRoots]) => {
        await api.volumes.sync(volumes)
        await api.volumes.ensureTrashRoots(trashRoots)
        volumesRefreshedAt = Date.now()

        return api.volumes.list()
      })
      .finally(() => {
        volumeRefresh = undefined
      })

    return volumeRefresh
  }

  ipcMain.handle(
    'favorites:addFolders',
    withIpcMiddleware(
      (_event, paths: unknown) => addFavoriteFolders(paths),
      authorizeRenderer(renderer),
    ),
  )

  ipcMain.handle(
    'settings:get',
    withIpcMiddleware(
      (_event, key: Parameters<SettingsApi['get']>[0]) => settings.get(key),
      authorizeRenderer(renderer),
    ),
  )

  ipcMain.handle(
    'settings:set',
    withIpcMiddleware(
      (
        _event,
        key: Parameters<SettingsApi['set']>[0],
        value: Parameters<SettingsApi['set']>[1],
      ) => settings.set(key, value),
      authorizeRenderer(renderer),
    ),
  )

  ipcMain.handle(
    'volumes:list',
    withIpcMiddleware(async (): Promise<PresentedVolume[]> => {
      const volumes = await refreshVolumes()

      return volumes.map((volume) => ({
        ...volume,
        folderView: entryRegistry?.folderView(volume.typeId) ?? null,
      }))
    }, authorizeRenderer(renderer)),
  )

  ipcMain.handle(
    'locations:list',
    withIpcMiddleware(async () => {
      const volumes = await refreshVolumes()

      return resolveLocations(volumes)
    }, authorizeRenderer(renderer)),
  )

  ipcMain.handle(
    'entries:listChildren',
    withIpcMiddleware(
      async (
        _event,
        folder: Parameters<ServerApi['entries']['listChildren']>[0],
      ): Promise<PresentedFolderListing> => {
        const volumes = await api.volumes.list()
        const volume = volumes.find((item) => item.id === folder?.volumeId)
        const folderView =
          folder?.relativePath === ''
            ? entryRegistry?.folderView(volume?.typeId)
            : null
        const listing = await api.entries.listChildren({
          ...folder,
          ...(folderView?.recursive || folder.recursive
            ? { recursive: true }
            : {}),
        })

        const entries = await Promise.all(
          listing.entries.map(
            async (entry): Promise<PresentedEntry> => ({
              ...entry,
              presentation:
                volume && entryRegistry
                  ? await entryRegistry.resolve({
                      path: resolve(volume.rootPath, entry.relativePath),
                      name: entry.name,
                      kind: entry.kind,
                    })
                  : null,
            }),
          ),
        )

        return {
          ...listing,
          entries:
            folderView && !folderView.showDirectories
              ? entries.filter((entry) => entry.kind !== 'directory')
              : entries,
        }
      },
      authorizeRenderer(renderer),
    ),
  )

  ipcMain.handle(
    'entries:activate',
    withIpcMiddleware(async (_event, id: number) => {
      if (!Number.isSafeInteger(id) || id <= 0) {
        throw new Error('Invalid entry reference')
      }

      const source = await api.entries.getEntrySource(id)

      if (!source || !entryRegistry || !openPath) {
        throw new Error('Entry cannot be activated')
      }

      const candidate = resolve(source.rootPath, source.relativePath)
      const relation = relative(source.rootPath, candidate)

      if (
        isAbsolute(source.relativePath) ||
        relation === '..' ||
        relation.startsWith(`..${sep}`)
      ) {
        throw new Error('Entry path is outside its volume')
      }

      const presentation = await entryRegistry.resolve({
        path: candidate,
        name: source.name,
        kind: source.kind,
      })

      if (presentation?.activation?.type !== 'open-path') {
        throw new Error('Entry cannot be activated')
      }

      const error = await openPath(presentation.activation.path)

      if (error) {
        throw new Error(error)
      }
    }, authorizeRenderer(renderer)),
  )

  ipcMain.handle(
    'entries:moveFolders',
    withIpcMiddleware(
      (_event, paths: unknown, destination: unknown) =>
        moveFolders(paths, destination),
      authorizeRenderer(renderer),
    ),
  )

  ipcMain.handle(
    'moveHistory:list',
    withIpcMiddleware(
      () => api.moveHistory.list(),
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
      (_event, input: Parameters<typeof api.collections.create>[0]) =>
        api.collections.create(input),
      authorizeRenderer(renderer),
    ),
  )

  ipcMain.handle(
    'collections:update',
    withIpcMiddleware(
      (
        _event,
        id: string,
        input: Parameters<typeof api.collections.update>[1],
      ) => api.collections.update(id, input),
      authorizeRenderer(renderer),
    ),
  )

  ipcMain.handle(
    'collections:delete',
    withIpcMiddleware(
      (_event, id: string) => api.collections.delete(id),
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
    'collections:getEntryState',
    withIpcMiddleware(
      (_event, entryId: number) => api.collections.getEntryState(entryId),
      authorizeRenderer(renderer),
    ),
  )

  ipcMain.handle(
    'collections:setFavorite',
    withIpcMiddleware(
      (_event, entryId: number, included: boolean) =>
        api.collections.setFavorite(entryId, included),
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
    ipcMain.removeHandler('favorites:addFolders')
    ipcMain.removeHandler('settings:get')
    ipcMain.removeHandler('settings:set')

    ipcMain.removeHandler('collections:list')
    ipcMain.removeHandler('collections:create')
    ipcMain.removeHandler('collections:update')
    ipcMain.removeHandler('collections:delete')
    ipcMain.removeHandler('collections:listEntries')
    ipcMain.removeHandler('collections:forEntry')
    ipcMain.removeHandler('collections:getEntryState')
    ipcMain.removeHandler('collections:setFavorite')
    ipcMain.removeHandler('collections:recordView')

    ipcMain.removeHandler('volumes:list')
    ipcMain.removeHandler('locations:list')
    ipcMain.removeHandler('entries:listChildren')
    ipcMain.removeHandler('entries:activate')
    ipcMain.removeHandler('entries:moveFolders')
    ipcMain.removeHandler('moveHistory:list')
  }
}
