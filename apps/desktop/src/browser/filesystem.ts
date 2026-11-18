import { lstat } from 'node:fs/promises'
import { basename, isAbsolute } from 'node:path'
import { fileURLToPath } from 'node:url'
import { type BrowserWindow, ipcMain, shell } from 'electron'
import mime from 'mime'
import type { EntryRegistry } from '../entries/registry.js'
import type {
  PresentedEntry,
  PresentedFolderListing,
} from '../entries/types.js'
import { authorizeRenderer, withIpcMiddleware } from '../ipc/middleware.js'
import { BrowserClient } from './client.js'
import type { Entry } from './protocol.js'
import { validateStartInput } from './validate.js'

export type FilesystemRequest = {
  showHidden?: boolean
  showSystem?: boolean
  path: string
  search: string
  recursive: boolean
  pane: 'primary' | 'secondary'
}

/** Each pane owns a Rust snapshot. A newer navigation cancels its older work. */
export function registerFilesystemIpc(
  window: BrowserWindow,
  registry?: EntryRegistry,
) {
  const executable = fileURLToPath(
    new URL(
      `../../../../packages/fs-service/target/release/filejam-fs-service${process.platform === 'win32' ? '.exe' : ''}`,
      import.meta.url,
    ),
  )
  const panes = new Map<
    string,
    {
      client: BrowserClient
      generation: number
      nextRowId: number
      rowIds: Map<string, number>
      reject?: (error: Error) => void
    }
  >()
  const authorize = authorizeRenderer(window.webContents)
  let closed = false
  let closing: Promise<void> | undefined

  ipcMain.handle(
    'filesystem:list',
    withIpcMiddleware(
      async (
        _event,
        input: FilesystemRequest,
      ): Promise<PresentedFolderListing> => {
        if (
          !input ||
          !['primary', 'secondary'].includes(input.pane) ||
          typeof input.recursive !== 'boolean' ||
          (input.showHidden !== undefined &&
            typeof input.showHidden !== 'boolean') ||
          (input.showSystem !== undefined &&
            typeof input.showSystem !== 'boolean')
        ) {
          throw new TypeError('Invalid folder request')
        }
        validateStartInput({
          generation: 1,
          path: input.path,
          options: {
            nameContains: input.search,
            kind: 'all',
            sortDirection: 'asc',
          },
        })
        if (closed) {
          throw new Error('Browser is closed')
        }
        let pane = panes.get(input.pane)
        if (!pane) {
          pane = {
            client: new BrowserClient(executable),
            generation: 0,
            nextRowId: -1,
            rowIds: new Map(),
          }
          panes.set(input.pane, pane)
        }
        pane.reject?.(new Error('Navigation superseded'))
        const generation = ++pane.generation
        const current = pane
        const check = () => {
          if (closed || current.generation !== generation) {
            throw new Error('Navigation superseded')
          }
        }
        await current.client.start()
        check()

        const entries: PresentedEntry[] = []
        const directories = [input.path]
        let visited = 0
        while (directories.length) {
          check()
          const path = directories.pop() as string
          const children = await new Promise<Entry[]>((resolve, reject) => {
            current.reject = reject
            const batch: Entry[] = []
            current.client.list(
              path,
              {
                nameContains: input.recursive ? '' : input.search,
                kind: 'all',
                sortDirection: 'asc',
              },
              (event) => {
                if (event.type === 'batch') {
                  batch.push(...event.entries)
                  current.client.next(event.id)
                } else if (event.type === 'listing') {
                  current.client.next(event.id)
                } else if (event.type === 'done') {
                  resolve(batch)
                } else if (
                  event.type === 'error' ||
                  event.type === 'cancelled'
                ) {
                  reject(
                    new Error(
                      event.type === 'error'
                        ? event.message
                        : 'Navigation cancelled',
                    ),
                  )
                }
              },
            )
          })
          check()
          visited += children.length
          if (visited > 250_000) {
            throw new Error(
              'Folder view exceeds 250,000 entries. Open a narrower location.',
            )
          }
          const visible = children.filter((entry) => {
            // System takes precedence: showing hidden files never reveals protected items.
            if (
              entry.system
                ? !input.showSystem
                : entry.hidden && !input.showHidden
            ) {
              return false
            }

            if (input.recursive && entry.kind === 'directory') {
              directories.push(entry.path)
              return false
            }
            return entry.name.toLowerCase().includes(input.search.toLowerCase())
          })
          // Metadata and provider resolution are bounded, and never repeat enumeration.
          let index = 0
          const enriched = new Array<PresentedEntry | null>(visible.length)
          await Promise.all(
            Array.from({ length: Math.min(16, visible.length) }, async () => {
              while (index < visible.length) {
                check()
                const position = index++
                const entry = visible[position] as Entry
                enriched[position] = await presentEntry(
                  entry,
                  current.rowIds.get(entry.path) ?? current.nextRowId--,
                  registry,
                )
              }
            }),
          )
          for (const entry of enriched) {
            if (entry) {
              entries.push(entry)
            }
          }
        }
        const folder = await presentEntry(
          {
            path: input.path,
            name: basename(input.path) || input.path,
            kind: 'directory',
          },
          0,
          registry,
        )
        check()
        current.rowIds = new Map(
          entries.map((entry) => [entry.absolutePath as string, entry.id]),
        )
        delete current.reject
        return { folder, entries, scanned: true }
      },
      authorize,
    ),
  )

  ipcMain.handle(
    'filesystem:open',
    withIpcMiddleware(async (_event, path: unknown) => {
      if (
        typeof path !== 'string' ||
        !isAbsolute(path) ||
        path.includes('\0')
      ) {
        throw new TypeError('Invalid file path')
      }
      const error = await shell.openPath(path)
      if (error) {
        throw new Error(error)
      }
    }, authorize),
  )

  return () => {
    if (closing) {
      return closing
    }
    closed = true
    ipcMain.removeHandler('filesystem:list')
    ipcMain.removeHandler('filesystem:open')
    for (const pane of panes.values()) {
      pane.reject?.(new Error('Browser closed'))
    }
    closing = Promise.all(
      [...panes.values()].map((pane) => pane.client.close()),
    ).then(() => undefined)
    return closing
  }
}

async function presentEntry(
  entry: Entry,
  id: number,
  registry?: EntryRegistry,
): Promise<PresentedEntry | null> {
  const info = await lstat(entry.path).catch(() => null)

  if (!info) {
    return null
  }

  const kind = entry.kind === 'other' ? 'file' : entry.kind

  return {
    id,
    libraryId: 0,
    parentId: null,
    absolutePath: entry.path,
    relativePath: entry.path,
    name: entry.name,
    kind,
    size: info.isFile() ? info.size : null,
    mimeType: info.isFile() ? mime.getType(entry.name) : null,
    modifiedAt: info.mtime,
    createdAt: info.birthtimeMs ? info.birthtime : null,
    indexedAt: null,
    childrenScannedAt: null,
    childrenDirty: false,
    presentation:
      (await registry?.resolve({ path: entry.path, name: entry.name, kind })) ??
      null,
  }
}
