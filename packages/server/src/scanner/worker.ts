import { createHash } from 'node:crypto'
import type { Stats } from 'node:fs'
import { realpath, stat } from 'node:fs/promises'
import { basename, isAbsolute, relative, resolve, sep } from 'node:path'
import { setImmediate } from 'node:timers/promises'
import { parentPort, workerData } from 'node:worker_threads'
import { fdir } from 'fdir'
import { create, type FileDescriptorMeta } from 'file-entry-cache'
import { initDatabase } from '../db/index.js'
import { isIgnoredScanPath } from './ignore.js'
import { openScanDatabase } from './persistence.js'
import type {
  ScannerRequest,
  ScannerResponse,
  ScanProgress,
  ScanResults,
  ScanStatus,
} from './types.js'

const port = parentPort

if (!port) {
  throw new Error('Scanner must run in a worker thread')
}

const cacheDirectory = resolve(workerData.cacheDirectory as string)

let status: ScanStatus = {
  state: 'idle',
  root: null,
  phase: 'idle',
  total: 0,
  processed: 0,
  error: null,
}

let results: ScanResults = { added: [], changed: [], removed: [] }
let cancelled = false
let activeScan: Promise<void> | undefined

// SQLite stores the browsable tree; file-entry-cache tracks file changes across
// scans. Entries are saved in short batches, but results and the cache baseline are
// published only after a complete pass.
async function scan(input: string) {
  let database: Awaited<ReturnType<typeof openScanDatabase>> | undefined
  let finalState: 'completed' | 'cancelled' | 'failed' = 'completed'
  const startedAt = performance.now()
  const next: ScanResults = { added: [], changed: [], removed: [] }

  const reportProgress = () => {
    const elapsedMs = Math.round(performance.now() - startedAt)

    port?.postMessage({
      type: 'progress',
      status,
      elapsedMs,
      entriesPerSecond:
        elapsedMs > 0 ? Math.round((status.processed * 1000) / elapsedMs) : 0,
      changes: {
        added: next.added.length,
        changed: next.changed.length,
        removed: next.removed.length,
      },
    } satisfies ScanProgress)
  }

  reportProgress()

  const progressTimer = setInterval(reportProgress, 1000)

  try {
    // Canonicalize aliases so the same directory shares a library and cache key.
    const root = await realpath(input)
    const rootMetadata = await stat(root)

    if (!rootMetadata.isDirectory()) {
      throw new Error('Scan root must be a directory')
    }

    status.root = root

    const databasePath = resolve(workerData.databasePath as string)

    database = await openScanDatabase(
      databasePath,
      root,
      workerData.databaseInitialized !== true,
    )

    const cache = create(
      createHash('sha256').update(root).digest('hex'),
      cacheDirectory,
      { cwd: root },
    )

    const previous = new Set(cache.cache.keys())

    const createCrawler = () =>
      new fdir()
        .withFullPaths()
        .withErrors()
        .withDirs()
        // Exclude our own changing database files and cache directory when they
        // live under the scan root.
        .filter(
          (path) =>
            !isIgnoredScanPath(path) &&
            !isTrashMetadata(root, path) &&
            ![
              databasePath,
              `${databasePath}-wal`,
              `${databasePath}-shm`,
              `${databasePath}-journal`,
            ].includes(resolve(path)),
        )
        .exclude((name, path) => {
          const rel = relative(cacheDirectory, resolve(path))

          return (
            isIgnoredScanPath(name) ||
            isTrashMetadata(root, path) ||
            rel === '' ||
            (!rel.startsWith(`..${sep}`) && rel !== '..' && !isAbsolute(rel))
          )
        })

    const [paths, directPaths] = await Promise.all([
      createCrawler()
        .withSymlinks({ resolvePaths: false })
        .crawl(root)
        .withPromise(),
      // fdir follows a linked directory's children but omits the link itself.
      // Keep the direct listing so linked and empty directories are persisted.
      createCrawler().crawl(root).withPromise(),
    ])

    // Persistence needs a parent ID before it can insert a child. Sorting by
    // depth guarantees parents come first, including empty directories.
    const orderedPaths = [
      ...new Set([...paths, ...directPaths].map((path) => resolve(path))),
    ]
      .filter((path) => path !== root)
      .sort(
        (a, b) =>
          relative(root, a).split(sep).length -
            relative(root, b).split(sep).length || a.localeCompare(b),
      )

    orderedPaths.unshift(root)
    status.total = orderedPaths.length
    status.phase = 'checking'
    reportProgress()

    for (let index = 0; index < orderedPaths.length; index += 64) {
      // Give incoming status/cancel messages a chance to run during checking.
      if (index % 100 === 0) {
        await setImmediate()
      }

      if (cancelled) {
        break
      }

      const batch = orderedPaths.slice(index, index + 64)
      const metadataByPath = new Map<string, Stats>()
      const savePaths: string[] = []
      const changes = new Map<string, 'added' | 'changed' | 'unchanged'>()

      for (const path of batch) {
        if (cancelled) {
          break
        }

        const metadata = path === root ? rootMetadata : await stat(path)

        metadataByPath.set(path, metadata)

        const key = relative(root, path)
        // Reuse the stat snapshot instead of getFileDescriptor(), which would
        // repeat the lookup. stat intentionally follows symbolic links so they
        // are indexed and change-tracked like their targets.
        const baseline = cache.cache.getKey<FileDescriptorMeta>(key)

        if (metadata.isFile()) {
          cache.cache.setKey(key, {
            size: metadata.size,
            mtime: metadata.mtime.getTime(),
          })
        } else if (previous.has(key)) {
          cache.removeEntry(key)
        }

        if (!previous.has(key)) {
          savePaths.push(path)
          changes.set(path, 'added')
          continue
        }

        if (
          !metadata.isFile() ||
          baseline?.size !== metadata.size ||
          baseline?.mtime !== metadata.mtime.getTime()
        ) {
          savePaths.push(path)
          changes.set(path, 'changed')
          continue
        }

        // A cache hit is safe to skip only when its database row still exists.
        // This also repairs the database if it was cleared independently.
        if (database.skipUnchanged(path, metadata)) {
          previous.delete(key)
          changes.set(path, 'unchanged')
          status.processed++
        } else {
          savePaths.push(path)
          changes.set(path, 'unchanged')
        }
      }

      if (cancelled) {
        break
      }

      await database.prepareTags(savePaths, metadataByPath)

      const saved = await database.saveBatch(
        savePaths,
        metadataByPath,
        () => cancelled,
      )

      for (const { path, kind } of saved) {
        if (kind === 'file') {
          const key = relative(root, path)
          const change = changes.get(path)

          if (change === 'added') {
            next.added.push(key)
          } else if (change === 'changed') {
            next.changed.push(key)
          }

          previous.delete(key)
        }

        status.processed++
      }
    }

    if (cancelled) {
      // Keep incremental DB updates, but do not prune unseen entries or advance
      // the cache baseline after an incomplete pass.
      finalState = 'cancelled'
    } else {
      // Only a full traversal can establish that an unseen entry was removed.
      // DB reconciliation and cache writing are separate, not one transaction.
      await database.complete()
      next.removed = [...previous]

      for (const key of previous) {
        cache.removeEntry(key)
      }

      // Traversal already identified missing entries; reconcile() would stat
      // every cached file again. Publish only this successful pass's snapshot.
      cache.cache.save()
      results = next
      finalState = 'completed'
    }
  } catch (error) {
    finalState = cancelled ? 'cancelled' : 'failed'
    status.error = error instanceof Error ? error.message : String(error)
  } finally {
    clearInterval(progressTimer)

    try {
      await database?.close()
    } catch (error) {
      finalState = 'failed'
      status.error = error instanceof Error ? error.message : String(error)
    }

    status.state = finalState
    status.phase = 'idle'
    reportProgress()
  }
}

function isTrashMetadata(root: string, path: string) {
  if (
    process.platform !== 'win32' ||
    basename(resolve(root, '..')).toLowerCase() !== '$recycle.bin'
  ) {
    return false
  }

  const relativePath = relative(root, path)

  return !relativePath.includes(sep) && basename(path).startsWith('$I')
}

port.on('message', async (request: ScannerRequest) => {
  try {
    let result: ScanStatus | ScanResults

    switch (request.method) {
      case 'initialize': {
        const database = await initDatabase(workerData.databasePath as string)

        database.close()
        result = status
        break
      }
      case 'start':
        if (status.state === 'scanning') {
          throw new Error('A scan is already running')
        }

        if (typeof request.root !== 'string' || !request.root.trim()) {
          throw new Error('A scan root is required')
        }

        cancelled = false
        results = { added: [], changed: [], removed: [] }

        status = {
          state: 'scanning',
          root: request.root,
          phase: 'crawling',
          total: 0,
          processed: 0,
          error: null,
        }

        // Reply immediately; awaiting the full scan would make start() a wait
        // for completion instead of an acknowledgement.
        activeScan = scan(request.root)
        result = status
        break
      case 'shutdown':
        cancelled = true
        await activeScan
        result = status
        break
      case 'status':
        result = status
        break
      case 'results':
        result = results
        break
      case 'cancel':
        // Cooperative cancellation is checked between entries after crawling;
        // it does not interrupt an in-flight filesystem or database operation.
        cancelled = true
        result = status
        break
      default:
        throw new Error('Unknown scanner method')
    }

    port.postMessage({ id: request.id, result } satisfies ScannerResponse)
  } catch (error) {
    port.postMessage({
      id: request.id,
      error: error instanceof Error ? error.message : String(error),
    } satisfies ScannerResponse)
  }
})
