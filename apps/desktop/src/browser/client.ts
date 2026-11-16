import type { ChildProcessWithoutNullStreams } from 'node:child_process'
import { spawn as nodeSpawn } from 'node:child_process'
import { JsonLineReader } from './lines.js'
import type { ClientEvent, ServiceEvent, ViewOptions } from './protocol.js'

type ListingState = {
  id: string
  callback: (event: ClientEvent) => void
  listingSeen: boolean
  total: number | null
  received: number
  pullPending: boolean
}

type Dependencies = {
  now?: () => number
  spawn?: typeof nodeSpawn
  readyTimeoutMs?: number
  closeTimeoutMs?: number
}

export class BrowserClient {
  readonly #now: () => number
  #measurement: {
    id: string
    startedAt: number
    listingMs: number | null
    firstBatchMs: number | null
    doneMs: number | null
    service: { enumerationMs: number; filterSortMs: number } | null
  } | null = null
  readonly #spawnProcess: typeof nodeSpawn
  readonly #readyTimeoutMs: number
  readonly #closeTimeoutMs: number
  #child: ChildProcessWithoutNullStreams | null = null
  #startPromise: Promise<void> | null = null
  #closePromise: Promise<void> | null = null
  #readyTimer: ReturnType<typeof setTimeout> | null = null
  #closeTimer: ReturnType<typeof setTimeout> | null = null
  #reader = new JsonLineReader()
  #stderrTail = Buffer.alloc(0)
  #unavailable = false
  #shuttingDown = false
  #readySeen = false
  #resolveStart: (() => void) | null = null
  #rejectStart: ((error: Error) => void) | null = null
  #resolveClose: (() => void) | null = null
  readonly #writeQueue: string[] = []
  #writeBlocked = false
  #drainListening = false
  #nextRequestNumber = 1
  #activeListing: ListingState | null = null

  readonly #onDrain = (): void => {
    this.#writeBlocked = false
    this.#flushWrites()
  }

  readonly #executablePath: string

  constructor(executablePath: string, dependencies: Dependencies = {}) {
    this.#executablePath = executablePath
    this.#now = dependencies.now ?? (() => performance.now())
    this.#spawnProcess = dependencies.spawn ?? nodeSpawn
    this.#readyTimeoutMs = dependencies.readyTimeoutMs ?? 5000
    this.#closeTimeoutMs = dependencies.closeTimeoutMs ?? 2000
  }

  get pid(): number | undefined {
    return this.#child?.pid
  }

  get lastMeasurement() {
    return this.#measurement ? structuredClone(this.#measurement) : null
  }

  start(): Promise<void> {
    if (this.#unavailable || this.#shuttingDown) {
      return Promise.reject(new Error('Browser service is unavailable'))
    }

    if (this.#startPromise) {
      return this.#startPromise
    }

    this.#startPromise = new Promise<void>((resolve, reject) => {
      this.#resolveStart = resolve
      this.#rejectStart = reject

      try {
        this.#child = this.#spawnProcess(this.#executablePath, [], {
          shell: false,
          windowsHide: true,
          stdio: ['pipe', 'pipe', 'pipe'],
        }) as ChildProcessWithoutNullStreams
      } catch (error) {
        const spawnError = this.#asError(error)
        this.#fail(
          (spawnError as NodeJS.ErrnoException).code === 'ENOENT'
            ? new Error(
                'Browser service executable missing; run pnpm poc:service:build',
              )
            : spawnError,
        )
        return
      }

      this.#child.stdout.on('data', this.#onStdout)
      this.#child.stderr.on('data', this.#onStderr)
      this.#child.stdin.on('error', this.#onChildError)
      this.#child.stdout.on('error', this.#onChildError)
      this.#child.stderr.on('error', this.#onChildError)
      this.#child.stdout.once('end', this.#onStdoutEnd)
      this.#child.once('error', this.#onChildError)
      this.#child.once('exit', this.#onExit)
      this.#readyTimer = setTimeout(
        () => this.#fail(new Error('Browser service did not become ready')),
        this.#readyTimeoutMs,
      )
    })

    return this.#startPromise
  }

  close(): Promise<void> {
    if (this.#closePromise) {
      return this.#closePromise
    }

    this.#shuttingDown = true
    this.#rejectStart?.(new Error('Browser service closed before ready'))
    this.#resolveStart = null
    this.#rejectStart = null
    this.#clearReadyTimer()
    this.#closePromise = new Promise<void>((resolve) => {
      this.#resolveClose = resolve
    })

    const child = this.#child

    if (
      !child ||
      this.#unavailable ||
      child.exitCode != null ||
      child.signalCode != null
    ) {
      this.#cleanup()
      return this.#closePromise
    }

    // Arm the deadline before writing: a child may exit synchronously in tests.
    this.#closeTimer = setTimeout(() => {
      try {
        child.kill('SIGKILL')
      } finally {
        this.#cleanup()
      }
    }, this.#closeTimeoutMs)

    this.#enqueue(`${JSON.stringify({ v: 1, type: 'shutdown' })}\n`)

    return this.#closePromise
  }

  list(
    path: string,
    options: ViewOptions,
    onEvent: (event: ClientEvent) => void,
  ): string {
    if (!this.#readySeen || this.#unavailable || this.#shuttingDown) {
      throw new Error('Browser service is not ready')
    }

    if (
      typeof path !== 'string' ||
      path.length === 0 ||
      !options ||
      typeof onEvent !== 'function'
    ) {
      throw new TypeError('Invalid browser listing arguments')
    }

    const id = `r-${this.#nextRequestNumber++}`
    this.#measurement = {
      id,
      startedAt: this.#now(),
      listingMs: null,
      firstBatchMs: null,
      doneMs: null,
      service: null,
    }
    this.#activeListing = {
      id,
      callback: onEvent,
      listingSeen: false,
      total: null,
      received: 0,
      pullPending: false,
    }
    this.#enqueue(
      `${JSON.stringify({ v: 1, type: 'list', id, path, options })}\n`,
    )
    return id
  }

  next(id: string): void {
    const listing = this.#activeListing
    if (
      !listing ||
      listing.id !== id ||
      !listing.listingSeen ||
      listing.pullPending ||
      listing.total === null ||
      listing.received >= listing.total
    ) {
      return
    }

    listing.pullPending = true
    this.#enqueue(`${JSON.stringify({ v: 1, type: 'next', id })}\n`)
  }

  cancel(id: string): void {
    if (!this.#activeListing || this.#activeListing.id !== id) {
      return
    }

    this.#activeListing = null
    this.#enqueue(`${JSON.stringify({ v: 1, type: 'cancel', id })}\n`)
  }

  readonly #onStdout = (chunk: Buffer): void => {
    if (this.#unavailable) {
      return
    }

    try {
      for (const event of this.#reader.push(chunk)) {
        this.#route(event)
      }

      // Validate the entire received batch before declaring startup successful.
      if (this.#readySeen && this.#resolveStart) {
        this.#clearReadyTimer()
        this.#resolveStart()
        this.#resolveStart = null
        this.#rejectStart = null
      }
    } catch (error) {
      this.#fail(this.#asError(error))
    }
  }

  readonly #onStderr = (chunk: Buffer): void => {
    const tail = chunk.subarray(-8192)
    this.#stderrTail = Buffer.concat([
      this.#stderrTail.subarray(
        Math.max(0, this.#stderrTail.length + tail.length - 8192),
      ),
      tail,
    ])
  }

  readonly #onStdoutEnd = (): void => {
    try {
      this.#reader.end()

      if (!this.#shuttingDown) {
        this.#fail(new Error('Browser service output ended'))
      }
    } catch (error) {
      this.#fail(this.#asError(error))
    }
  }

  readonly #onChildError = (error: Error): void => {
    const missing = (error as NodeJS.ErrnoException).code === 'ENOENT'
    this.#fail(
      new Error(
        missing
          ? 'Browser service executable missing; run pnpm poc:service:build'
          : error.message,
      ),
    )
  }

  readonly #onExit = (code: number | null): void => {
    if (this.#shuttingDown) {
      this.#cleanup()
      return
    }
    this.#fail(new Error(`Browser service exited (${code ?? 'signal'})`), false)
  }

  #route(event: ServiceEvent): void {
    if (event.type === 'ready') {
      if (this.#readySeen || (!this.#resolveStart && !this.#shuttingDown)) {
        throw new TypeError('Unexpected service ready event')
      }
      if (!this.#shuttingDown) {
        this.#readySeen = true
      }
      return
    }

    if (this.#shuttingDown) {
      return
    }

    const listing = this.#activeListing
    if (!listing || listing.id !== event.id) {
      return
    }

    if (event.type === 'listing') {
      if (listing.listingSeen) {
        throw new TypeError('Duplicate listing event')
      }
      listing.listingSeen = true
      listing.total = event.total
    } else if (event.type === 'batch') {
      if (
        !listing.listingSeen ||
        !listing.pullPending ||
        event.offset !== listing.received ||
        event.entries.length === 0 ||
        listing.total === null ||
        listing.received + event.entries.length > listing.total
      ) {
        throw new TypeError('Invalid listing batch state')
      }
      listing.pullPending = false
      listing.received += event.entries.length
    } else if (event.type === 'done') {
      if (
        !listing.listingSeen ||
        listing.total !== event.total ||
        listing.received !== event.total
      ) {
        throw new TypeError('Invalid listing completion state')
      }
      this.#activeListing = null
    } else {
      this.#activeListing = null
    }

    const measurement = this.#measurement
    if (measurement?.id === event.id) {
      const elapsed = this.#now() - measurement.startedAt
      if (event.type === 'listing') {
        measurement.listingMs = elapsed
        measurement.service = { ...event.metrics }
      } else if (event.type === 'batch' && measurement.firstBatchMs === null) {
        measurement.firstBatchMs = elapsed
      } else if (event.type === 'done') {
        measurement.doneMs = elapsed
      }
    }

    listing.callback(event)
  }

  #fail(error: Error, terminate = true): void {
    if (this.#unavailable) {
      return
    }

    this.#unavailable = true
    const activeListing = this.#activeListing
    this.#activeListing = null
    this.#writeQueue.length = 0
    this.#writeBlocked = false
    this.#child?.stdin.removeListener('drain', this.#onDrain)
    this.#drainListening = false
    this.#clearReadyTimer()
    this.#rejectStart?.(error)
    this.#resolveStart = null
    this.#rejectStart = null
    try {
      if (activeListing) {
        activeListing.callback({
          v: 1,
          type: 'error',
          id: activeListing.id,
          code: 'SERVICE_UNAVAILABLE',
          message: error.message,
        })
      }
      if (terminate) {
        this.#child?.kill('SIGKILL')
      }
    } finally {
      this.#cleanup()
    }
  }

  #enqueue(command: string): void {
    if (this.#unavailable) {
      return
    }

    if (this.#writeQueue.length >= 32) {
      this.#fail(new Error('Browser service command queue overflow'))
      return
    }

    this.#writeQueue.push(command)
    this.#flushWrites()
  }

  #flushWrites(): void {
    const child = this.#child

    if (!child || this.#unavailable || this.#writeBlocked) {
      return
    }

    while (this.#writeQueue.length > 0) {
      const command = this.#writeQueue.shift()

      if (command === undefined) {
        return
      }

      try {
        if (!child.stdin.write(command)) {
          this.#writeBlocked = true

          if (!this.#drainListening) {
            child.stdin.on('drain', this.#onDrain)
            this.#drainListening = true
          }

          return
        }
      } catch (error) {
        this.#fail(this.#asError(error))
        return
      }
    }
  }

  #cleanup(): void {
    this.#clearReadyTimer()
    if (this.#closeTimer) {
      clearTimeout(this.#closeTimer)
    }

    this.#closeTimer = null
    this.#writeQueue.length = 0
    this.#child?.stdin.removeListener('drain', this.#onDrain)
    this.#drainListening = false
    this.#cleanupListeners()
    this.#resolveClose?.()
    this.#resolveClose = null
    this.#child = null
  }

  #cleanupListeners(): void {
    this.#child?.stdin.removeListener('drain', this.#onDrain)
    this.#child?.stdout.removeListener('data', this.#onStdout)
    this.#child?.stderr.removeListener('data', this.#onStderr)
    this.#child?.stdin.removeListener('error', this.#onChildError)
    this.#child?.stdout.removeListener('error', this.#onChildError)
    this.#child?.stderr.removeListener('error', this.#onChildError)
    this.#child?.stdout.removeListener('end', this.#onStdoutEnd)
    this.#child?.removeListener('error', this.#onChildError)
    this.#child?.removeListener('exit', this.#onExit)
  }

  #clearReadyTimer(): void {
    if (this.#readyTimer) {
      clearTimeout(this.#readyTimer)
    }

    this.#readyTimer = null
  }

  #asError(error: unknown): Error {
    return error instanceof Error ? error : new Error(String(error))
  }
}
