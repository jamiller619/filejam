import { realpath } from 'node:fs/promises'
import { resolve } from 'node:path'
import { createLogger } from '../logger.js'
import { ScannerWorker } from './client.js'
import { ScanProgressReporter } from './progress.js'
import type {
  ScannerApi,
  ScannerStatus,
  ScanResults,
  ScanStatus,
} from './types.js'

export type {
  ScannerApi,
  ScannerStatus,
  ScanResults,
  ScanStatus,
} from './types.js'

const emptyResults = (): ScanResults => ({
  added: [],
  changed: [],
  removed: [],
})
const idle = (): ScanStatus => ({
  state: 'idle',
  root: null,
  phase: 'idle',
  total: 0,
  processed: 0,
  error: null,
})
type Slot = { worker: ScannerWorker; root: string | undefined }

/** Bounded pool. A canonical root has at most one active scan and one queued refresh. */
export class FileScanner implements ScannerApi {
  readonly #progress = new ScanProgressReporter()
  readonly #slots: Slot[] = []
  readonly #states = new Map<string, ScanStatus>()
  readonly #results = new Map<string, ScanResults>()
  readonly #listeners = new Set<() => void>()
  readonly #queue = new Set<string>()
  readonly #ready: Promise<void>
  #tail: Promise<unknown> = Promise.resolve()
  #closing: Promise<void> | undefined
  #closed = false
  #lastRoot: string | undefined

  constructor(
    readonly cacheDirectory: string,
    readonly databasePath: string,
    readonly concurrency = 2,
  ) {
    if (!Number.isSafeInteger(concurrency) || concurrency < 1)
      throw new Error('Concurrency must be a positive integer')
    this.#ready = this.#makeSlot()
      .worker.initialize()
      .then(() => {})
    // Keep initialization failures observable through public methods without an unhandled rejection.
    void this.#ready.catch(() => {})
  }

  #run<T>(action: () => Promise<T>): Promise<T> {
    const next = this.#tail.then(async () => {
      await this.#ready
      return action()
    })
    this.#tail = next.catch(() => {})
    return next
  }

  #checkOpen() {
    if (this.#closed) throw new Error('Scanner is closed')
  }
  async #canonical(root: string) {
    if (typeof root !== 'string' || !root.trim())
      throw new Error('A scan root is required')
    // Missing roots still become failed jobs rather than rejecting a whole startup batch.
    return realpath(root).catch(() => resolve(root))
  }
  #notify() {
    this.#progress.report(this.#snapshot())
    for (const listener of this.#listeners) listener()
  }
  #background(action: () => Promise<void>) {
    void this.#run(action).catch((error: unknown) =>
      createLogger('scanner').error('Scanner scheduling failed', error),
    )
  }
  #makeSlot(): Slot {
    const slot = {} as Slot
    slot.root = undefined
    slot.worker = new ScannerWorker(
      this.cacheDirectory,
      this.databasePath,
      (error) => {
        this.#background(async () => {
          if (this.#closed) return
          if (slot.root)
            this.#states.set(slot.root, {
              ...(this.#states.get(slot.root) ?? {
                ...idle(),
                root: slot.root,
              }),
              state: 'failed',
              phase: 'idle',
              error: error.message,
            })
          if (slot.root)
            this.#progress.failed(
              slot.root,
              this.#states.get(slot.root) ?? idle(),
            )
          const index = this.#slots.indexOf(slot)
          if (index >= 0) this.#slots.splice(index, 1)
          await slot.worker.close()
          await this.#pump()
          this.#notify()
        })
      },
    )
    slot.worker.onUpdated((progress) => {
      const { status } = progress
      this.#background(async () => {
        const root = slot.root
        if (!root || this.#closed) return
        this.#states.set(root, status)
        this.#progress.update(root, progress)
        if (status.state !== 'scanning') {
          this.#results.set(root, await slot.worker.results())
          slot.root = undefined
          await this.#pump()
        }
        this.#notify()
      })
    })
    this.#slots.push(slot)
    return slot
  }
  async #pump() {
    if (this.#closed) return
    const starting: Promise<void>[] = []
    for (const root of this.#queue) {
      if (this.#slots.some((slot) => slot.root === root)) continue
      const slot =
        this.#slots.find((slot) => !slot.root) ??
        (this.#slots.length < this.concurrency ? this.#makeSlot() : undefined)
      if (!slot) break
      this.#queue.delete(root)
      slot.root = root
      this.#results.set(root, emptyResults())
      this.#states.set(root, {
        ...idle(),
        state: 'scanning',
        root,
        phase: 'crawling',
      })
      starting.push(
        slot.worker
          .start(root)
          .then((status) => {
            this.#states.set(root, status)
          })
          .catch((error: unknown) => {
            this.#states.set(root, {
              ...idle(),
              root,
              state: 'failed',
              error: String(error),
            })
            // The failure callback releases and replaces a dead worker.
          }),
      )
    }
    await Promise.all(starting)
  }

  startAll(roots: string[]): Promise<void> {
    return this.#run(async () => {
      this.#checkOpen()
      if (this.#queue.size || this.#slots.some((slot) => slot.root))
        throw new Error('A scan is already running')
      const canonicalRoots = await Promise.all(
        roots.map((root) => this.#canonical(root)),
      )
      this.#checkOpen()
      this.#progress.begin()
      this.#states.clear()
      this.#results.clear()
      for (const root of canonicalRoots) {
        this.#queue.add(root)
        this.#states.set(root, { ...idle(), root, state: 'queued' })
      }
      this.#lastRoot = [...this.#queue].at(-1)
      await this.#pump()
      this.#notify()
    })
  }
  enqueue(root: string) {
    this.#background(async () => {
      if (this.#closed) return
      const canonical = await this.#canonical(root)
      if (!this.#queue.size && !this.#slots.some((slot) => slot.root)) {
        this.#progress.begin()
        this.#states.clear()
      }
      this.#queue.add(canonical)
      if (!this.#slots.some((slot) => slot.root === canonical))
        this.#states.set(canonical, {
          ...idle(),
          root: canonical,
          state: 'queued',
        })
      await this.#pump()
      this.#notify()
    })
  }
  start(root: string): Promise<ScanStatus> {
    return this.#run(async () => {
      this.#checkOpen()
      const canonical = await this.#canonical(root)
      if (
        this.#queue.has(canonical) ||
        this.#slots.some((slot) => slot.root === canonical)
      )
        throw new Error('A scan is already running for this library')
      if (!this.#queue.size && !this.#slots.some((slot) => slot.root)) {
        this.#progress.begin()
        this.#states.clear()
        this.#results.clear()
      }
      this.#lastRoot = canonical
      this.#queue.add(canonical)
      this.#states.set(canonical, {
        ...idle(),
        root: canonical,
        state: 'queued',
      })
      await this.#pump()
      this.#notify()
      return structuredClone(
        this.#states.get(canonical) ?? { ...idle(), root: canonical },
      )
    })
  }
  status(): Promise<ScannerStatus> {
    return this.#run(async () => {
      this.#checkOpen()
      return this.#snapshot()
    })
  }
  #snapshot(): ScannerStatus {
    const libraries = structuredClone([...this.#states.values()])
    const active = this.#slots.flatMap((slot) => (slot.root ? [slot.root] : []))
    const queued = [...this.#queue]
    const state =
      active.length || queued.length
        ? 'scanning'
        : libraries.some((s) => s.state === 'cancelled')
          ? 'cancelled'
          : libraries.some((s) => s.state === 'failed')
            ? 'failed'
            : libraries.length
              ? 'completed'
              : 'idle'
    return {
      state,
      root: libraries.length === 1 ? (libraries[0]?.root ?? null) : null,
      phase: active.length
        ? libraries.some(
            (s) => s.state === 'scanning' && s.phase === 'checking',
          )
          ? 'checking'
          : 'crawling'
        : 'idle',
      total: libraries.reduce((n, s) => n + s.total, 0),
      processed: libraries.reduce((n, s) => n + s.processed, 0),
      error: libraries.find((s) => s.error)?.error ?? null,
      libraries,
      active,
      queued,
    }
  }

  /** Without a root, retain the single-scan API's most recently requested result. */
  results(root?: string): Promise<ScanResults> {
    return this.#run(async () => {
      this.#checkOpen()
      const key =
        root === undefined ? this.#lastRoot : await this.#canonical(root)
      return structuredClone(
        key ? (this.#results.get(key) ?? emptyResults()) : emptyResults(),
      )
    })
  }
  async cancel(): Promise<ScannerStatus> {
    await this.#run(async () => {
      this.#checkOpen()
      for (const root of this.#queue) {
        if (!this.#slots.some((slot) => slot.root === root))
          this.#states.set(root, { ...idle(), root, state: 'cancelled' })
      }
      this.#queue.clear()
      await Promise.all(
        this.#slots
          .filter((slot) => slot.root)
          .map((slot) => slot.worker.cancel()),
      )
      this.#notify()
    })
    return this.status()
  }
  onUpdated(listener: () => void) {
    this.#listeners.add(listener)
    return () => {
      this.#listeners.delete(listener)
    }
  }
  close(): Promise<void> {
    this.#closed = true
    this.#queue.clear()
    this.#closing ??= this.#tail.then(async () => {
      await this.#ready.catch(() => {})
      const settled = await Promise.allSettled(
        this.#slots.map((slot) => slot.worker.close()),
      )
      this.#listeners.clear()
      const failed = settled.find((result) => result.status === 'rejected')
      if (failed?.status === 'rejected') throw failed.reason
    })
    return this.#closing
  }
}
