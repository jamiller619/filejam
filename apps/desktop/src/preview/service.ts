import { createHash, randomUUID } from 'node:crypto'
import {
  mkdir,
  readdir,
  readFile,
  rename,
  stat,
  unlink,
  writeFile,
} from 'node:fs/promises'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import type { PreviewRequest, PreviewResult } from '@files/preview-api'
import { utilityProcess } from 'electron'
import type { PreviewRegistry, RegisteredProvider } from './registry.js'

type Success = Extract<PreviewResult, { status: 'success' }>

const maxBytes = 32 * 1024 * 1024

const mimeTypes = new Set([
  'image/png',
  'image/jpeg',
  'image/webp',
  'image/gif',
  'image/avif',
  'image/bmp',
  'image/x-icon',
  'image/svg+xml',
])

export class PreviewService {
  private jobs = new Map<
    string,
    {
      promise: Promise<Success | null>
      controller: AbortController
      users: number
    }
  >()
  private failures = new Map<string, number>()
  private queue: { run: () => void; reject: () => void; priority: number }[] =
    []
  private active = 0
  private closed = false
  private cacheWrites: Promise<void> = Promise.resolve()

  constructor(
    readonly registry: PreviewRegistry,
    private cache: string,
  ) {}

  async generate(
    request: PreviewRequest,
    signal: AbortSignal,
  ): Promise<Success | null> {
    if (this.closed || signal.aborted) {
      return null
    }

    for (const provider of this.registry.candidates(request.source.path)) {
      if (signal.aborted) {
        return null
      }

      const key = createHash('sha256')
        .update(
          JSON.stringify([
            1,
            request,
            provider.manifest.id,
            provider.manifest.version,
          ]),
        )
        .digest('hex')

      if ((this.failures.get(key) ?? 0) > Date.now()) {
        continue
      }

      let job = this.jobs.get(key)

      if (!job) {
        const controller = new AbortController()

        const promise = this.schedule(
          async () => {
            const cached = await this.readCache(key)

            if (cached && (await this.unchanged(request))) {
              return cached
            }

            const result = await this.execute(
              provider,
              request,
              controller.signal,
            )

            if (controller.signal.aborted || !(await this.unchanged(request))) {
              return null
            }

            if (result.status !== 'success') {
              if (this.failures.size >= 1000) {
                this.failures.clear()
              }

              this.failures.set(key, Date.now() + 15000)

              return null
            }

            await this.writeCache(key, result)

            return result
          },
          request.purpose === 'detail' ? 1 : 0,
          controller.signal,
        )
          .catch(() => null)
          .finally(() => this.jobs.delete(key))

        job = { promise, controller, users: 0 }
        this.jobs.set(key, job)
      }

      job.users++

      const current = job

      const result = await new Promise<Success | null>((resolve) => {
        let done = false

        const finish = (value: Success | null) => {
          if (done) {
            return
          }

          done = true
          signal.removeEventListener('abort', abort)

          if (--current.users === 0) {
            current.controller.abort()
          }

          resolve(value)
        }

        const abort = () => finish(null)

        signal.addEventListener('abort', abort, { once: true })

        if (signal.aborted) {
          abort()
        }

        void current.promise.then(finish)
      })

      if (result) {
        return result
      }
    }

    return null
  }

  private async unchanged(request: PreviewRequest) {
    const info = await stat(request.source.path).catch(() => null)

    return (
      info?.isFile() &&
      info.size === request.source.size &&
      info.mtimeMs === request.source.modifiedAt
    )
  }

  private schedule<T>(
    work: () => Promise<T>,
    priority: number,
    signal: AbortSignal,
  ): Promise<T> {
    return new Promise((resolve, reject) => {
      const item = {
        priority,
        reject: () => {
          signal.removeEventListener('abort', abort)
          reject(new Error('Preview cancelled'))
        },
        run: () => {
          signal.removeEventListener('abort', abort)
          this.active++

          void work()
            .then(resolve, reject)
            .finally(() => {
              this.active--
              this.drain()
            })
        },
      }

      const abort = () => {
        const index = this.queue.indexOf(item)

        if (index >= 0) {
          this.queue.splice(index, 1)
        }

        item.reject()
      }

      if (this.closed || signal.aborted || this.queue.length >= 256) {
        item.reject()

        return
      }

      signal.addEventListener('abort', abort, { once: true })
      this.queue.push(item)
      this.queue.sort((a, b) => b.priority - a.priority)
      this.drain()
    })
  }

  private drain() {
    while (!this.closed && this.active < 2 && this.queue.length) {
      this.queue.shift()?.run()
    }
  }

  private execute(
    provider: RegisteredProvider,
    request: PreviewRequest,
    signal: AbortSignal,
  ): Promise<PreviewResult> {
    if (signal.aborted) {
      return Promise.resolve({ status: 'error', message: 'Cancelled' })
    }

    return new Promise((resolve) => {
      const child = utilityProcess.fork(
        fileURLToPath(new URL('./worker.js', import.meta.url)),
        [],
        { stdio: 'ignore', serviceName: `Preview: ${provider.manifest.id}` },
      )

      let settled = false
      let outcome: PreviewResult | undefined
      let killTimer: ReturnType<typeof setTimeout> | undefined

      const finish = (result: PreviewResult, grace = false) => {
        if (settled) {
          return
        }

        settled = true
        outcome = result
        clearTimeout(timer)
        signal.removeEventListener('abort', abort)

        // Give cooperative providers time to terminate their decoder subprocesses.
        if (grace) {
          child.postMessage({ type: 'cancel' })
          killTimer = setTimeout(() => child.kill(), 1000)
        } else {
          child.kill()
        }
      }

      const abort = () =>
        finish({ status: 'error', message: 'Cancelled' }, true)

      const timer = setTimeout(
        () => finish({ status: 'error', message: 'Preview timed out' }, true),
        25000,
      )

      signal.addEventListener('abort', abort, { once: true })

      child.on('exit', () => {
        clearTimeout(killTimer)
        clearTimeout(timer)
        signal.removeEventListener('abort', abort)
        settled = true
        resolve(outcome ?? { status: 'error', message: 'Provider exited' })
      })

      child.on('message', (result: PreviewResult) => {
        if (
          !result ||
          !['success', 'error', 'unsupported'].includes(result.status)
        ) {
          finish({ status: 'error', message: 'Invalid provider response' })

          return
        }

        if (
          result.status === 'success' &&
          (!(result.bytes instanceof Uint8Array) ||
            !result.bytes.length ||
            result.bytes.length > maxBytes ||
            !mimeTypes.has(result.mimeType))
        ) {
          finish({ status: 'error', message: 'Invalid preview image' })

          return
        }

        finish(result)
      })

      child.once('spawn', () => {
        if (!settled) {
          child.postMessage({
            type: 'generate',
            entry: provider.entry,
            request,
          })
        }
      })
    })
  }

  private async readCache(key: string): Promise<Success | null> {
    try {
      const path = join(this.cache, `${key}.json`)

      if ((await stat(path)).size > maxBytes * 1.4) {
        return null
      }

      const data = JSON.parse(await readFile(path, 'utf8'))

      if (!mimeTypes.has(data.mimeType) || typeof data.bytes !== 'string') {
        return null
      }

      const bytes = Buffer.from(data.bytes, 'base64')

      return bytes.length && bytes.length <= maxBytes
        ? { status: 'success', bytes, mimeType: data.mimeType }
        : null
    } catch {
      return null
    }
  }

  private writeCache(key: string, result: Success) {
    this.cacheWrites = this.cacheWrites
      .then(async () => {
        await mkdir(this.cache, { recursive: true })

        const temporary = join(this.cache, `${key}.${randomUUID()}.tmp`)

        try {
          await writeFile(
            temporary,
            JSON.stringify({
              mimeType: result.mimeType,
              bytes: Buffer.from(result.bytes).toString('base64'),
            }),
          )

          await rename(temporary, join(this.cache, `${key}.json`))

          const entries = await Promise.all(
            (await readdir(this.cache))
              .filter((name) => /^[a-f0-9]{64}\.json$/.test(name))
              .map(async (name) => {
                const path = join(this.cache, name)
                const info = await stat(path)

                return { path, size: info.size, time: info.mtimeMs }
              }),
          )

          let total = entries.reduce((sum, item) => sum + item.size, 0)

          for (const item of entries.sort((a, b) => a.time - b.time)) {
            if (total <= 256 * 1024 * 1024) {
              break
            }

            await unlink(item.path)
            total -= item.size
          }
        } finally {
          await unlink(temporary).catch(() => undefined)
        }
      })
      .catch(() => undefined) // Cache availability must not prevent previews.

    return this.cacheWrites
  }

  async close() {
    this.closed = true

    for (const item of this.queue.splice(0)) {
      item.reject()
    }

    for (const job of this.jobs.values()) {
      job.controller.abort()
    }

    await Promise.allSettled([...this.jobs.values()].map((job) => job.promise))
    await this.cacheWrites
  }
}
