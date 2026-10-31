import { type FSWatcher, watch } from 'node:fs'
import { isAbsolute, relative, resolve, sep } from 'node:path'
import { isIgnoredScanPath } from './ignore.js'
import type { FileScanner } from './index.js'
import { addPendingPath } from './pendingPaths.js'

/** Watch before the initial scan so edits during indexing receive another pass. */
export function watchRoots(
  roots: string[],
  scanner: FileScanner,
  excludedPaths: string[],
  warn: (message: string, error: unknown) => void,
) {
  const watchers: FSWatcher[] = []
  const timers = new Map<string, ReturnType<typeof setTimeout>>()
  const dirtyPaths = new Map<string, Set<string>>()
  const excluded = excludedPaths.map((path) => resolve(path))

  for (const root of new Set(roots)) {
    try {
      const resolvedRoot = resolve(root)
      const rootExclusions = excluded.filter(
        (excludedPath) =>
          excludedPath !== resolvedRoot && isInside(resolvedRoot, excludedPath),
      )
      const watcher = watch(root, { recursive: true }, (_event, filename) => {
        let scanPath = resolvedRoot

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

        const pending = dirtyPaths.get(root) ?? new Set<string>()

        addPendingPath(pending, resolvedRoot, scanPath)
        dirtyPaths.set(root, pending)

        // Bound the delay even while a writer produces a continuous event stream.
        if (timers.has(root)) {
          return
        }

        timers.set(
          root,
          setTimeout(() => {
            timers.delete(root)
            for (const path of dirtyPaths.get(root) ?? []) {
              scanner.enqueue(root, path)
            }

            dirtyPaths.delete(root)
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
    for (const watcher of watchers) {
      watcher.close()
    }

    for (const timer of timers.values()) {
      clearTimeout(timer)
    }

    timers.clear()
    dirtyPaths.clear()
  }
}

function isInside(parent: string, child: string) {
  const path = relative(parent, child)

  return (
    path === '' ||
    (path !== '..' && !path.startsWith(`..${sep}`) && !isAbsolute(path))
  )
}
