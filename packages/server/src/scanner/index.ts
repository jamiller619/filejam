import { Worker } from 'node:worker_threads'
import { createLogger } from '../logger.js'
import type {
  ScannerApi,
  ScannerRequest,
  ScannerResponse,
  ScanProgress,
  ScanResults,
  ScanStatus,
} from './types.js'

const logger = createLogger('scanner')

export type { ScannerApi, ScanResults, ScanStatus } from './types.js'

/**
 * Promise-based facade for a dedicated scanner worker. Filesystem traversal and
 * indexing run there; this thread only sends commands and receives snapshots.
 * One active scan per instance. Give each instance its own cache directory.
 */
export class FileScanner implements ScannerApi {
  readonly #worker: Worker
  #sequence = 0
  #queuedRoots: string[] = []
  #failure: Error | undefined
  #closing: Promise<void> | undefined
  // Match responses to callers by ID; several status/result requests may be in flight.
  readonly #pending = new Map<
    number,
    {
      resolve(value: ScanStatus | ScanResults): void
      reject(error: Error): void
    }
  >()

  constructor(cacheDirectory: string, databasePath: string) {
    this.#worker = new Worker(new URL('./worker.js', import.meta.url), {
      workerData: { cacheDirectory, databasePath },
    })
    this.#worker.on('message', (message: ScannerResponse | ScanProgress) => {
      if ('type' in message) {
        const { status, elapsedMs, entriesPerSecond, changes } = message
        const level = status.state === 'failed' ? 'error' : 'info'
        logger[level](
          status.state === 'scanning'
            ? 'Scan progress'
            : `Scan ${status.state}`,
          { ...status, elapsedMs, entriesPerSecond, ...changes },
        )
        if (status.state !== 'scanning') void this.#startNext()
        return
      }
      const pending = this.#pending.get(message.id)
      if (!pending) return
      this.#pending.delete(message.id)
      if ('error' in message) pending.reject(new Error(message.error))
      else pending.resolve(message.result)
    })
    this.#worker.on('error', (error) =>
      this.#fail(error instanceof Error ? error : new Error(String(error))),
    )
    this.#worker.on('exit', (code) =>
      this.#fail(new Error(`Scanner worker exited (${code})`)),
    )
  }

  #fail(error: Error) {
    // A dead or closed worker cannot answer any outstanding or future requests.
    this.#failure ??= error
    this.#queuedRoots = []
    for (const pending of this.#pending.values()) pending.reject(error)
    this.#pending.clear()
  }

  #request<T extends ScanStatus | ScanResults>(
    method: ScannerRequest['method'],
    root?: string,
  ): Promise<T> {
    if (this.#failure) return Promise.reject(this.#failure)
    if (this.#closing && method !== 'shutdown')
      return Promise.reject(new Error('Scanner is closed'))
    const id = ++this.#sequence
    return new Promise<T>((resolve, reject) => {
      this.#pending.set(id, { resolve: (value) => resolve(value as T), reject })
      try {
        this.#worker.postMessage({
          id,
          method,
          ...(root === undefined ? {} : { root }),
        } satisfies ScannerRequest)
      } catch (error) {
        this.#pending.delete(id)
        reject(error)
      }
    })
  }

  /** Start a batch in the background, one root at a time. Call while idle. */
  async startAll(roots: string[]): Promise<void> {
    if (this.#failure) throw this.#failure
    if (this.#queuedRoots.length || (await this.status()).state === 'scanning')
      throw new Error('A scan is already running')
    this.#queuedRoots = [...new Set(roots)]
    await this.#startNext()
  }

  async #startNext(): Promise<void> {
    const root = this.#queuedRoots.shift()
    if (root === undefined || this.#failure) return
    try {
      await this.start(root)
    } catch (error) {
      if (this.#failure) return
      logger.error('Unable to start queued scan', { root }, error)
      await this.#startNext()
    }
  }

  start(root: string) {
    return this.#request<ScanStatus>('start', root)
  }
  status() {
    return this.#request<ScanStatus>('status')
  }
  results() {
    return this.#request<ScanResults>('results')
  }
  cancel() {
    this.#queuedRoots = []
    return this.#request<ScanStatus>('cancel')
  }

  /** Cancel pending work and release the worker's database before termination. */
  close(): Promise<void> {
    this.#queuedRoots = []
    this.#closing ??= (async () => {
      try {
        if (!this.#failure) await this.#request<ScanStatus>('shutdown')
      } finally {
        this.#fail(new Error('Scanner is closed'))
        await this.#worker.terminate()
      }
    })()
    return this.#closing
  }
}
