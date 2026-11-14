import { type FSWatcher, watch } from 'node:fs'
import { isAbsolute, relative, resolve, sep } from 'node:path'
import type { Database } from '../db/index.js'
import { hasIndexedPathChanged } from './changes.js'
import { isIgnoredScanPath } from './ignore.js'
import type { FileScanner } from './index.js'
import { addPendingPath } from './pendingPaths.js'

/** Watch before the initial scan so edits during indexing receive another pass. */
export function watchRoots(
  roots: string[],
  scanner: FileScanner,
  excludedPaths: string[],
  warn: (message: string, error: unknown) => void,
  db: Database,
) {
  const watchers: FSWatcher[] = []
  const timers = new Map<string, ReturnType<typeof setTimeout>>()
  const dirtyPaths = new Map<string, Set<string>>()
  const excluded = excludedPaths.map((path) => resolve(path))
  const pending = new Map<string, Set<string | null>>()
  let closed = false

  for (const root of new Set(roots)) {
    try {
      const watcher = watch(root, { recursive: true }, (event, filename) => {
        if (filename) {
          if (filename.split(/[\\/]/).some(isIgnoredScanPath)) {
            return
          }

          const path = resolve(root, filename)

          if (
            rootExclusions.some((excludedPath) => isInside(excludedPath, path))
          ) {
            return
          }

          // Refresh the changed entry itself. A file at the drive root must
          // never turn ordinary writes into repeated whole-volume scans.
          scanPath = path
        }

        const paths = pending.get(root) ?? new Set<string | null>()

        // Renames include creation and deletion, which always need reconciliation.
        paths.add(event === 'rename' || !filename ? null : filename)
        pending.set(root, paths)

        // Bound the delay even while a writer produces a continuous event stream.
        if (timers.has(root)) {
          return
        }

        timers.set(
          root,
          setTimeout(() => {
            timers.delete(root)
            pending.delete(root)

            void (async () => {
              let changed = paths.has(null)

              try {
                for (const path of paths) {
                  if (changed || closed) {
                    break
                  }

                  if (path !== null) {
                    changed = await hasIndexedPathChanged(db, root, path)
                  }
                }
              } catch {
                // A disappearing or unreadable path still needs reconciliation.
                changed = true
              }

              if (changed && !closed) {
                scanner.enqueue(root)
              }
            })()
          }, 100),
        )
      })

      watcher.on('error', (error) =>
        warn(`Filesystem watcher failed: ${root}`, error),
      )

      watchers.push(watcher)
    } catch (error) {
      warn(`Unable to watch filesystem root: ${root}`, error)
    }
  }

  return () => {
    closed = true

    for (const watcher of watchers) {
      watcher.close()
    }

    for (const timer of timers.values()) {
      clearTimeout(timer)
    }

    timers.clear()
    pending.clear()
  }
}

function isInside(parent: string, child: string) {
  const path = relative(parent, child)

  return (
    path === '' ||
    (path !== '..' && !path.startsWith(`..${sep}`) && !isAbsolute(path))
  )
}
