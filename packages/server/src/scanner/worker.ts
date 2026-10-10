import { createHash } from 'node:crypto'
import { realpath, stat } from 'node:fs/promises'
import { isAbsolute, relative, resolve, sep } from 'node:path'
import { setImmediate } from 'node:timers/promises'
import { parentPort, workerData } from 'node:worker_threads'
import { fdir } from 'fdir'
import { create } from 'file-entry-cache'
import { openScanDatabase } from './persistence.js'
import type {
  ScannerRequest,
  ScannerResponse,
  ScanResults,
  ScanStatus,
} from './types.js'

const port = parentPort
if (!port) throw new Error('Scanner must run in a worker thread')
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

// SQLite stores the browsable tree; file-entry-cache tracks file changes across
// scans. Each entry is saved immediately, but results and the cache baseline are
// published only after a complete pass.
async function scan(input: string) {
  let database: Awaited<ReturnType<typeof openScanDatabase>> | undefined
  try {
    // Canonicalize aliases so the same directory shares a library and cache key.
    const root = await realpath(input)
    if (!(await stat(root)).isDirectory())
      throw new Error('Scan root must be a directory')
    status.root = root
    const databasePath = resolve(workerData.databasePath as string)
    database = await openScanDatabase(databasePath, root)
    const cache = create(
      createHash('sha256').update(root).digest('hex'),
      cacheDirectory,
      { cwd: root },
    )
    const previous = new Set(cache.cache.keys())
    const paths = await new fdir()
      .withFullPaths()
      .withErrors()
      .withDirs()
      // Exclude our own changing database files and cache directory when they
      // live under the scan root.
      .filter(
        (path) =>
          ![
            databasePath,
            `${databasePath}-wal`,
            `${databasePath}-shm`,
            `${databasePath}-journal`,
          ].includes(resolve(path)),
      )
      .exclude((_name, path) => {
        const rel = relative(cacheDirectory, resolve(path))
        return (
          rel === '' ||
          (!rel.startsWith(`..${sep}`) && rel !== '..' && !isAbsolute(rel))
        )
      })
      .crawl(root)
      .withPromise()
    // Persistence needs a parent ID before it can insert a child. Sorting by
    // depth guarantees parents come first, including empty directories.
    const orderedPaths = [...new Set(paths.map((path) => resolve(path)))]
      .filter((path) => path !== root)
      .sort(
        (a, b) =>
          relative(root, a).split(sep).length -
            relative(root, b).split(sep).length || a.localeCompare(b),
      )
    orderedPaths.unshift(root)
    status.total = orderedPaths.length
    status.phase = 'checking'
    const next: ScanResults = { added: [], changed: [], removed: [] }
    for (const [index, path] of orderedPaths.entries()) {
      // Give incoming status/cancel messages a chance to run during checking.
      if (index % 100 === 0) await setImmediate()
      if (cancelled) break
      // Save even cache hits: the database may need rebuilding independently
      // of the file-change cache.
      const kind = await database.save(path)
      status.processed++
      if (kind !== 'file') continue
      const key = relative(root, path)
      const descriptor = cache.getFileDescriptor(key)
      if (descriptor.err) throw descriptor.err
      if (descriptor.notFound)
        throw new Error(`File disappeared during scan: ${path}`)
      if (!previous.has(key)) next.added.push(key)
      else if (descriptor.changed) next.changed.push(key)
      previous.delete(key)
    }
    if (cancelled) {
      // Keep incremental DB updates, but do not prune unseen entries or advance
      // the cache baseline after an incomplete pass.
      status.state = 'cancelled'
    } else {
      // Only a full traversal can establish that an unseen entry was removed.
      // DB reconciliation and cache writing are separate, not one transaction.
      await database.complete()
      next.removed = [...previous]
      for (const key of previous) cache.removeEntry(key)
      cache.reconcile()
      results = next
      status.state = 'completed'
    }
  } catch (error) {
    status.state = cancelled ? 'cancelled' : 'failed'
    status.error = error instanceof Error ? error.message : String(error)
  } finally {
    database?.close()
    status.phase = 'idle'
  }
}

port.on('message', (request: ScannerRequest) => {
  try {
    let result: ScanStatus | ScanResults
    switch (request.method) {
      case 'start':
        if (status.state === 'scanning')
          throw new Error('A scan is already running')
        if (typeof request.root !== 'string' || !request.root.trim())
          throw new Error('A scan root is required')
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
        void scan(request.root)
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
