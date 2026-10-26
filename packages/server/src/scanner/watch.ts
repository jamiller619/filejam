import { type FSWatcher, watch } from 'node:fs'
import { dirname, isAbsolute, relative, resolve, sep } from 'node:path'
import { isIgnoredScanPath } from './ignore.js'
import type { FileScanner } from './index.js'

/** Watch before the initial scan so edits during indexing receive another pass. */
export function watchRoots(
  roots: string[],
  scanner: FileScanner,
  excludedPaths: string[],
  warn: (message: string, error: unknown) => void,
) {
  const watchers: FSWatcher[] = []
  const timers = new Map<string, ReturnType<typeof setTimeout>>()
  const dirtyPaths = new Map<string, string>()
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

          scanPath = dirname(path)
        }

        const previous = dirtyPaths.get(root)

        dirtyPaths.set(
          root,
          previous
            ? commonAncestor(resolvedRoot, previous, scanPath)
            : scanPath,
        )

        // Bound the delay even while a writer produces a continuous event stream.
        if (timers.has(root)) {
          return
        }

        timers.set(
          root,
          setTimeout(() => {
            timers.delete(root)
            scanner.enqueue(root, dirtyPaths.get(root))
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

function commonAncestor(root: string, left: string, right: string) {
  let candidate = left

  while (!isInside(candidate, right) && candidate !== root) {
    candidate = dirname(candidate)
  }

  return isInside(root, candidate) ? candidate : root
}

function isInside(parent: string, child: string) {
  const path = relative(parent, child)

  return (
    path === '' ||
    (path !== '..' && !path.startsWith(`..${sep}`) && !isAbsolute(path))
  )
}
