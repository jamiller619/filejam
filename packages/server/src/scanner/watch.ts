import { type FSWatcher, watch } from 'node:fs'
import { isAbsolute, relative, resolve, sep } from 'node:path'
import { isIgnoredScanPath } from './ignore.js'
import type { FileScanner } from './index.js'

/** Watch before the initial scan so edits during indexing receive another pass. */
export function watchLibraries(
  roots: string[],
  scanner: FileScanner,
  excludedPaths: string[],
  warn: (message: string, error: unknown) => void,
) {
  const watchers: FSWatcher[] = []
  const timers = new Map<string, ReturnType<typeof setTimeout>>()
  const excluded = excludedPaths.map((path) => resolve(path))

  const inside = (parent: string, child: string) => {
    const path = relative(parent, child)

    return (
      path === '' ||
      (path !== '..' && !path.startsWith(`..${sep}`) && !isAbsolute(path))
    )
  }

  for (const root of new Set(roots)) {
    try {
      const watcher = watch(root, { recursive: true }, (_event, filename) => {
        if (filename) {
          if (filename.split(/[\\/]/).some(isIgnoredScanPath)) {
            return
          }

          const path = resolve(root, filename)

          if (excluded.some((excludedPath) => inside(excludedPath, path))) {
            return
          }
        }

        // Bound the delay even while a writer produces a continuous event stream.
        if (timers.has(root)) {
          return
        }

        timers.set(
          root,
          setTimeout(() => {
            timers.delete(root)
            scanner.enqueue(root)
          }, 100),
        )
      })

      watcher.on('error', (error) =>
        warn(`Library watcher failed: ${root}`, error),
      )

      watchers.push(watcher)
    } catch (error) {
      warn(`Unable to watch library: ${root}`, error)
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
  }
}
