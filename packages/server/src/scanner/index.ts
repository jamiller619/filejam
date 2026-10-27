import { realpath } from 'node:fs/promises'
import { dirname, isAbsolute, relative, resolve, sep } from 'node:path'
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
  totalKnown: false,
  processed: 0,
  error: null,
})

type Slot = { worker: ScannerWorker; root: string | undefined }

export type FileScannerOptions = {
  maxConcurrentScans?: number
  excludedPaths?: string[]
  /** Windows helper for full NTFS scans. Other scans use directory traversal. */
  mftHelperPath?: string
  /** Retain per-file change paths for tests or diagnostics. Disabled by default. */
  collectChangePaths?: boolean
}

/** Bounded pool. A canonical root has at most one active scan and one queued refresh. */
export class FileScanner implements ScannerApi {
  readonly #progress = new ScanProgressReporter()
  readonly #slots: Slot[] = []
  readonly #states = new Map<string, ScanStatus>()
  readonly #results = new Map<string, ScanResults>()
  readonly #listeners = new Set<(status: ScannerStatus) => void>()
  readonly #queue = new Map<string, string>()
  readonly #ready: Promise<void>
  readonly #excludedPaths: string[]
  readonly #collectChangePaths: boolean
  readonly #mftHelperPath: string | undefined
  readonly maxConcurrentScans: number
  #tail: Promise<unknown> = Promise.resolve()
  #closing: Promise<void> | undefined
  #closed = false
  #lastRoot: string | undefined

  constructor(
    readonly cacheDirectory: string,
    readonly databasePath: string,
    options: FileScannerOptions = {},
  ) {
    const {
      maxConcurrentScans = 1,
      excludedPaths = [],
      mftHelperPath,
      collectChangePaths = false,
    } = options

    if (!Number.isSafeInteger(maxConcurrentScans) || maxConcurrentScans < 1) {
      throw new Error('Maximum concurrent scans must be a positive integer')
    }

    this.maxConcurrentScans = maxConcurrentScans
    this.#collectChangePaths = collectChangePaths
    this.#mftHelperPath = mftHelperPath
    this.#excludedPaths = [cacheDirectory, ...excludedPaths].map((path) =>
      resolve(path),
    )
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
    if (this.#closed) {
      throw new Error('Scanner is closed')
    }
  }

  async #canonical(root: string) {
    if (typeof root !== 'string' || !root.trim()) {
      throw new Error('A scan root is required')
    }

    // Missing roots still become failed jobs rather than rejecting a whole startup batch.
    return realpath(root).catch(() => resolve(root))
  }

  #notify() {
    const status = this.#snapshot()

    this.#progress.report(status)

    for (const listener of this.#listeners) {
      listener(status)
    }
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
          if (this.#closed) {
            return
          }

          if (slot.root) {
            this.#states.set(slot.root, {
              ...(this.#states.get(slot.root) ?? {
                ...idle(),
                root: slot.root,
              }),
              state: 'failed',
              phase: 'idle',
              error: error.message,
            })
          }

          if (slot.root) {
            this.#progress.failed(
              slot.root,
              this.#states.get(slot.root) ?? idle(),
            )
          }

          const index = this.#slots.indexOf(slot)

          if (index >= 0) {
            this.#slots.splice(index, 1)
          }

          await slot.worker.close()
          await this.#pump()
          this.#notify()
        })
      },
      this.#excludedPaths,
      this.#collectChangePaths,
      this.#mftHelperPath,
    )

    slot.worker.onUpdated((progress) => {
      const { status } = progress

      this.#background(async () => {
        const root = slot.root

        if (!root || this.#closed) {
          return
        }

        this.#states.set(root, status)
        this.#progress.update(root, progress)

        if (status.state !== 'scanning') {
          if (this.#collectChangePaths) {
            this.#results.set(root, await slot.worker.results())
          } else {
            this.#results.delete(root)
          }

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
    if (this.#closed) {
      return
    }

    const starting: Promise<void>[] = []

    for (const [root, scanPath] of this.#queue) {
      if (this.#slots.some((slot) => slot.root === root)) {
        continue
      }

      const slot =
        this.#slots.find((slot) => !slot.root) ??
        (this.#slots.length < this.maxConcurrentScans
          ? this.#makeSlot()
          : undefined)

      if (!slot) {
        break
      }

      this.#queue.delete(root)
      slot.root = root

      if (this.#collectChangePaths) {
        this.#results.set(root, emptyResults())
      }

      this.#states.set(root, {
        ...idle(),
        state: 'scanning',
        root,
        phase: 'crawling',
        totalKnown: false,
      })

      starting.push(
        slot.worker
          .start(root, scanPath)
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

      if (this.#queue.size || this.#slots.some((slot) => slot.root)) {
        throw new Error('A scan is already running')
      }

      const canonicalRoots = await Promise.all(
        roots.map((root) => this.#canonical(root)),
      )

      this.#checkOpen()
      this.#progress.begin()
      this.#states.clear()
      this.#results.clear()

      for (const root of canonicalRoots) {
        this.#queue.set(root, root)
        this.#states.set(root, { ...idle(), root, state: 'queued' })
      }

      this.#lastRoot = [...this.#queue.keys()].at(-1)
      await this.#pump()
      this.#notify()
    })
  }

  enqueue(root: string, scanPath?: string) {
    this.#background(async () => {
      if (this.#closed) {
        return
      }

      const canonical = await this.#canonical(root)
      const requestedPath = resolve(scanPath ?? canonical)

      if (!isInside(canonical, requestedPath)) {
        throw new Error('Scan path is outside its root')
      }

      if (!this.#queue.size && !this.#slots.some((slot) => slot.root)) {
        this.#progress.begin()
        this.#states.clear()
      }

      const queuedPath = this.#queue.get(canonical)

      this.#queue.set(
        canonical,
        queuedPath
          ? commonAncestor(canonical, queuedPath, requestedPath)
          : requestedPath,
      )

      if (!this.#slots.some((slot) => slot.root === canonical)) {
        this.#states.set(canonical, {
          ...idle(),
          root: canonical,
          state: 'queued',
        })
      }

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
      ) {
        throw new Error('A scan is already running for this root')
      }

      if (!this.#queue.size && !this.#slots.some((slot) => slot.root)) {
        this.#progress.begin()
        this.#states.clear()
        this.#results.clear()
      }

      this.#lastRoot = canonical
      this.#queue.set(canonical, canonical)

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
    const roots = structuredClone([...this.#states.values()])
    const active = this.#slots.flatMap((slot) => (slot.root ? [slot.root] : []))
    const queued = [...this.#queue.keys()]

    const state =
      active.length || queued.length
        ? 'scanning'
        : roots.some((s) => s.state === 'cancelled')
          ? 'cancelled'
          : roots.some((s) => s.state === 'failed')
            ? 'failed'
            : roots.length
              ? 'completed'
              : 'idle'

    return {
      state,
      root: roots.length === 1 ? (roots[0]?.root ?? null) : null,
      phase: active.length
        ? roots.some((s) => s.state === 'scanning' && s.phase === 'checking')
          ? 'checking'
          : 'crawling'
        : 'idle',
      total: roots.reduce((n, s) => n + s.total, 0),
      totalKnown:
        active.length > 0 &&
        queued.length === 0 &&
        roots
          .filter((root) => root.state === 'scanning')
          .every((root) => root.totalKnown),
      processed: roots.reduce((n, s) => n + s.processed, 0),
      error: roots.find((s) => s.error)?.error ?? null,
      roots,
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

      for (const root of this.#queue.keys()) {
        if (!this.#slots.some((slot) => slot.root === root)) {
          this.#states.set(root, { ...idle(), root, state: 'cancelled' })
        }
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

  onUpdated(listener: (status: ScannerStatus) => void) {
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

      if (failed?.status === 'rejected') {
        throw failed.reason
      }
    })

    return this.#closing
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
