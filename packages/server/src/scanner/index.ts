import { Worker } from 'node:worker_threads'
import type {
  ScannerApi,
  ScannerRequest,
  ScannerResponse,
  ScanResults,
  ScanStatus,
} from './types.js'

export type { ScannerApi, ScanResults, ScanStatus } from './types.js'

/**
 * Promise-based facade for a dedicated scanner worker. Filesystem traversal and
 * indexing run there; this thread only sends commands and receives snapshots.
 * One active scan per instance. Give each instance its own cache directory.
 */
export class FileScanner implements ScannerApi {
  readonly #worker: Worker
  #sequence = 0
  #failure: Error | undefined
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
    this.#worker.on('message', (message: ScannerResponse) => {
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
    for (const pending of this.#pending.values()) pending.reject(error)
    this.#pending.clear()
  }

  #request<T extends ScanStatus | ScanResults>(
    method: keyof ScannerApi,
    root?: string,
  ): Promise<T> {
    if (this.#failure) return Promise.reject(this.#failure)
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

  /** Immediately terminate the worker, rather than waiting for cooperative cancellation. */
  async close(): Promise<void> {
    this.#fail(new Error('Scanner is closed'))
    await this.#worker.terminate()
  }
}
