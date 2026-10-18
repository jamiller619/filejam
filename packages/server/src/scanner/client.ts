import { Worker } from 'node:worker_threads'
import type {
  ScannerRequest,
  ScannerResponse,
  ScanProgress,
  ScanResults,
  ScanStatus,
  WorkerApi,
} from './types.js'

export type { ScanResults, ScanStatus, WorkerApi } from './types.js'

/**
 * Promise-based facade for a dedicated scanner worker. Filesystem traversal and
 * indexing run there; this thread only sends commands and receives snapshots.
 * One active scan per instance; the pool prevents concurrent access to a root cache.
 */
export class ScannerWorker implements WorkerApi {
  readonly #onFailure: (error: Error) => void
  readonly #worker: Worker
  #sequence = 0
  readonly #listeners = new Set<(progress: ScanProgress) => void>()
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

  constructor(
    cacheDirectory: string,
    databasePath: string,
    onFailure: (error: Error) => void,
  ) {
    this.#onFailure = onFailure
    this.#worker = new Worker(new URL('./worker.js', import.meta.url), {
      // The pool initializes migrations once before dispatching any scans.
      workerData: { cacheDirectory, databasePath, databaseInitialized: true },
    })
    this.#worker.on('message', (message: ScannerResponse | ScanProgress) => {
      if ('type' in message) {
        for (const listener of this.#listeners) listener(message)
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
    if (!this.#failure) this.#onFailure(error)
    // A dead or closed worker cannot answer any outstanding or future requests.
    this.#failure ??= error
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

  onUpdated(listener: (progress: ScanProgress) => void) {
    this.#listeners.add(listener)
    return () => {
      this.#listeners.delete(listener)
    }
  }

  initialize() {
    return this.#request<ScanStatus>('initialize')
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
    return this.#request<ScanStatus>('cancel')
  }

  /** Cancel pending work and release the worker's database before termination. */
  close(): Promise<void> {
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
