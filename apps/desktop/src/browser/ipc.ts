import { createRequire } from 'node:module'
import type { BrowserWindow, IpcMain, OpenDialogOptions } from 'electron'
import { authorizeRenderer, withIpcMiddleware } from '../ipc/middleware.js'
import type { BrowserClient } from './client.js'
import type { BridgeEvent } from './protocol.js'
import { validateRequestId, validateStartInput } from './validate.js'

const channels = {
  chooseFolder: 'browser:choose-folder',
  start: 'browser:start',
  next: 'browser:next',
  cancel: 'browser:cancel',
  event: 'browser:event',
} as const

const require = createRequire(import.meta.url)

type IpcRegistry = Pick<IpcMain, 'handle' | 'removeHandler'>
type DialogRegistry = {
  showOpenDialog: (
    window: BrowserWindow,
    options: OpenDialogOptions,
  ) => Promise<{ canceled: boolean; filePaths: string[] }>
}

type Client = Pick<BrowserClient, 'list' | 'next' | 'cancel'>

/** Register the proof-only IPC surface for one owning window. */
export function registerBrowserIpc(
  window: BrowserWindow,
  client: Client,
  main?: IpcRegistry,
  folderDialog?: DialogRegistry,
): () => void {
  const ipc = main ?? (require('electron') as { ipcMain: IpcRegistry }).ipcMain
  const picker =
    folderDialog ?? (require('electron') as { dialog: DialogRegistry }).dialog
  let disposed = false
  let highestGeneration = 0
  const activeIds = new Set<string>()
  const authorize = authorizeRenderer(window.webContents)

  ipc.handle(
    channels.chooseFolder,
    withIpcMiddleware(async () => {
      const result = await picker.showOpenDialog(window, {
        properties: ['openDirectory'],
      })

      return result.canceled ? null : (result.filePaths[0] ?? null)
    }, authorize),
  )

  ipc.handle(
    channels.start,
    withIpcMiddleware((_event, input: unknown) => {
      const request = validateStartInput(input)
      if (request.generation === 0 || request.generation <= highestGeneration) {
        throw new TypeError('Invalid start generation')
      }

      highestGeneration = request.generation
      const generation = request.generation
      activeIds.clear()
      const id = client.list(request.path, request.options, (event) => {
        if (
          event.type === 'done' ||
          event.type === 'cancelled' ||
          event.type === 'error'
        ) {
          activeIds.delete(event.id)
        }

        if (!disposed && !window.isDestroyed()) {
          window.webContents.send(channels.event, {
            ...event,
            generation,
          } satisfies BridgeEvent)
        }
      })
      activeIds.add(id)

      return { id }
    }, authorize),
  )

  for (const [channel, action] of [
    [channels.next, client.next.bind(client)],
    [channels.cancel, client.cancel.bind(client)],
  ] as const) {
    ipc.handle(
      channel,
      withIpcMiddleware((_event, value: unknown) => {
        const id = validateRequestId(value)
        if (!activeIds.has(id)) {
          return
        }

        if (channel === channels.cancel) {
          activeIds.delete(id)
        }
        action(id)
      }, authorize),
    )
  }

  return () => {
    if (disposed) {
      return
    }

    disposed = true
    for (const channel of Object.values(channels)) {
      if (channel !== channels.event) {
        ipc.removeHandler(channel)
      }
    }
    activeIds.clear()
  }
}
