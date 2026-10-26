import type { Stats } from 'node:fs'
import { opendir, realpath, stat } from 'node:fs/promises'
import { basename, isAbsolute, relative, resolve, sep } from 'node:path'
import { setImmediate } from 'node:timers/promises'
import { parentPort, workerData } from 'node:worker_threads'
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

const collectChangePaths = workerData.collectChangePaths === true
const excludedPaths =
  (workerData.excludedPaths as string[] | undefined)?.map((path) =>
    resolve(path),
  ) ?? []

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

type PendingEntry = {
  path: string
  metadata: Stats
  change: 'added' | 'changed' | 'unchanged'
  save: boolean
}

// SQLite is both the browsable tree and the change-detection baseline. Traversal
// stays parent-first and streams bounded batches instead of retaining every path.
async function scan(input: string, requestedScanPath = input) {
  let database: Awaited<ReturnType<typeof openScanDatabase>> | undefined
  let finalState: 'completed' | 'cancelled' | 'failed' = 'completed'
  const startedAt = performance.now()
  const next: ScanResults = { added: [], changed: [], removed: [] }
  let addedCount = 0
  let changedCount = 0
  let removedCount = 0
  let lastProgressAt = -Infinity

  const reportProgress = (force = false) => {
    const now = performance.now()

    if (!force && now - lastProgressAt < 250) {
      return
    }

    lastProgressAt = now
    const elapsedMs = Math.round(performance.now() - startedAt)

    port?.postMessage({
      type: 'progress',
      status,
      elapsedMs,
      entriesPerSecond:
        elapsedMs > 0 ? Math.round((status.processed * 1000) / elapsedMs) : 0,
      changes: {
        added: addedCount,
        changed: changedCount,
        removed: removedCount,
      },
    } satisfies ScanProgress)
  }

  reportProgress(true)

  const progressTimer = setInterval(reportProgress, 250)

  try {
    // Canonicalize aliases so the same directory shares a volume and cache key.
    const root = await realpath(input)
    const rootMetadata = await stat(root)

    if (!rootMetadata.isDirectory()) {
      throw new Error('Scan root must be a directory')
    }

    const scanPath = resolve(requestedScanPath)

    if (!isInside(root, scanPath)) {
      throw new Error('Scan path is outside its root')
    }

    const scanMetadata = scanPath === root ? rootMetadata : await stat(scanPath)

    if (!scanMetadata.isDirectory()) {
      throw new Error('Scan path must be a directory')
    }

    status.root = root

    const databasePath = resolve(workerData.databasePath as string)

    database = await openScanDatabase(
      databasePath,
      root,
      workerData.databaseInitialized !== true,
      scanPath,
    )
    const scanDatabase = database
    const directoryStack = [scanPath]
    const visitedDirectories = new Set([directoryIdentity(scanMetadata)])
    let traversalComplete = true
    let operations = 0

    const shouldExclude = (path: string) => {
      const resolvedPath = resolve(path)

      if (
        [
          databasePath,
          `${databasePath}-wal`,
          `${databasePath}-shm`,
          `${databasePath}-journal`,
        ].includes(resolvedPath)
      ) {
        return true
      }

      return excludedPaths.some(
        (excludedPath) =>
          excludedPath !== root &&
          isInside(root, excludedPath) &&
          isInside(excludedPath, resolvedPath),
      )
    }

    const describe = (path: string, metadata: Stats): PendingEntry => {
      const { change, save } = scanDatabase.inspect(path, metadata)

      return { path, metadata, change, save }
    }

    const save = async (batch: PendingEntry[]) => {
      if (!batch.length || cancelled) {
        return
      }

      const metadataByPath = new Map(
        batch.map((entry) => [entry.path, entry.metadata]),
      )
      const changes = new Map(batch.map((entry) => [entry.path, entry.change]))
      const savePaths: string[] = []

      for (const entry of batch) {
        if (!entry.save) {
          status.processed++
        } else {
          savePaths.push(entry.path)
        }
      }

      const saved = await database?.saveBatch(
        savePaths,
        metadataByPath,
        () => cancelled,
      )

      for (const { path, kind } of saved ?? []) {
        if (kind === 'file') {
          const key = relative(root, path)
          const change = changes.get(path)

          if (change === 'added') {
            addedCount++

            if (collectChangePaths) {
              next.added.push(key)
            }
          } else if (change === 'changed') {
            changedCount++

            if (collectChangePaths) {
              next.changed.push(key)
            }
          }
        }

        status.processed++
      }
    }

    status.total = 1
    await save([describe(scanPath, scanMetadata)])

    while (directoryStack.length && !cancelled) {
      const directory = directoryStack.pop()

      if (!directory) {
        break
      }

      const batch: PendingEntry[] = []
      const completedAliases: string[] = []
      let directoryReadable = true

      try {
        const handle = await opendir(directory)

        for await (const child of handle) {
          if (cancelled) {
            break
          }

          if (++operations % 100 === 0) {
            await setImmediate()
          }

          const path = resolve(directory, child.name)

          if (
            isIgnoredScanPath(child.name) ||
            isTrashMetadata(root, path) ||
            shouldExclude(path)
          ) {
            continue
          }

          let metadata: Stats

          try {
            metadata = await stat(path)
          } catch (error) {
            // Entries may disappear or become inaccessible between enumeration
            // and metadata lookup. A later watcher pass will revisit the parent.
            if (!isMissingPath(error)) {
              traversalComplete = false
            }

            continue
          }

          status.total++
          batch.push(describe(path, metadata))

          if (metadata.isDirectory()) {
            const identity = directoryIdentity(metadata)

            if (!visitedDirectories.has(identity)) {
              visitedDirectories.add(identity)
              directoryStack.push(path)
            } else {
              // Persist aliases but do not follow a directory identity twice.
              // This prevents junction and symlink cycles from growing forever.
              completedAliases.push(path)
            }
          }

          if (batch.length === 64) {
            await save(batch.splice(0))
          }
        }
      } catch (error) {
        directoryReadable = false

        if (!isMissingPath(error)) {
          traversalComplete = false
        }
      }

      await save(batch)

      for (const path of completedAliases) {
        scanDatabase.directoryScanned(path)
      }

      if (directoryReadable && !cancelled) {
        scanDatabase.directoryScanned(directory)
      }

      reportProgress()
    }

    if (!cancelled) {
      status.phase = 'checking'
      reportProgress(true)
    }

    if (cancelled) {
      // Keep incremental DB updates, but do not prune unseen entries or advance
      // the cache baseline after an incomplete pass.
      finalState = 'cancelled'
    } else {
      // Only a complete traversal can establish that an unseen entry was removed.
      const removed = await scanDatabase.complete(
        traversalComplete,
        collectChangePaths,
      )

      removedCount = removed.removedCount
      next.removed = removed.removedPaths
      results = collectChangePaths
        ? next
        : { added: [], changed: [], removed: [] }
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
    reportProgress(true)
  }
}

function directoryIdentity(metadata: Stats) {
  return `${metadata.dev}:${metadata.ino}`
}

function isInside(parent: string, child: string) {
  const path = relative(parent, child)

  return (
    path === '' ||
    (path !== '..' && !path.startsWith(`..${sep}`) && !isAbsolute(path))
  )
}

function isMissingPath(error: unknown) {
  return (
    error instanceof Error &&
    'code' in error &&
    (error.code === 'ENOENT' || error.code === 'ENOTDIR')
  )
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
        activeScan = scan(request.root, request.scanPath)
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
