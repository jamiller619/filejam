import { isAbsolute, join, relative, sep } from 'node:path'
import { app, ipcMain, type WebContents } from 'electron'
import { authorizeRenderer, withIpcMiddleware } from '../ipc/middleware.js'
import type { SettingsApi } from '../settings/index.js'
import { OperationService } from './service.js'
import type { OperationRequest } from './types.js'

let service: OperationService | undefined

export function registerOperationsIpc(
  renderer: WebContents,
  settings: SettingsApi,
) {
  if (!service) {
    service = new OperationService(
      join(app.getPath('userData'), 'operations'),
      async (mappings) => {
        const favorites = await settings.get('user.favoriteFolders')
        const updated = favorites.map((favorite) => {
          for (const mapping of mappings) {
            const child = relative(mapping.source, favorite)

            if (
              !isAbsolute(child) &&
              child !== '..' &&
              !child.startsWith(`..${sep}`)
            ) {
              return join(mapping.target, child)
            }
          }

          return favorite
        })

        if (updated.some((path, index) => path !== favorites[index])) {
          await settings.set('user.favoriteFolders', updated)
        }
      },
    )
    let shuttingDown = false

    app.on('before-quit', (event) => {
      if (!shuttingDown) {
        event.preventDefault()
        shuttingDown = true
        void service
          ?.close()
          .catch((error) =>
            console.error('Unable to close file operations', error),
          )
          .finally(() => app.quit())
      }
    })
  }
  const operations = service
  const channels: string[] = []
  const register = <T>(
    channel: string,
    handler: (input: T) => Promise<unknown>,
  ) => {
    channels.push(channel)
    ipcMain.handle(
      channel,
      withIpcMiddleware(
        (_event, input: T) => handler(input),
        authorizeRenderer(renderer),
      ),
    )
  }

  register('operations:start', (request: OperationRequest) =>
    operations.start(request),
  )
  register('operations:trash', (paths: string[]) => operations.trash(paths))
  register('operations:rename', (input: { paths: string[]; name: string }) =>
    operations.rename(input.paths, input.name),
  )
  register('operations:list', () => operations.list(true))
  register('operations:items', (input: { id: string; offset: number }) =>
    operations.items(input.id, input.offset),
  )
  register('operations:cancel', (id: string) => operations.cancel(id))
  register('operations:undo', (id?: string) => operations.undo(id))
  register('operations:redo', () => operations.redo())
  register('operations:recover', (id: string) => operations.recover(id))
  register('operations:retry', (id: string) => operations.retry(id))

  return () => {
    for (const channel of channels) {
      ipcMain.removeHandler(channel)
    }
  }
}
