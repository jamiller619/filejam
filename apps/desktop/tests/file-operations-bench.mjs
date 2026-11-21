import assert from 'node:assert/strict'
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { monitorEventLoopDelay } from 'node:perf_hooks'
import { setTimeout as delay } from 'node:timers/promises'
import { fileURLToPath } from 'node:url'
import { BrowserClient } from '../dist/browser/client.js'
import { OperationService } from '../dist/operations/service.js'

const count = Number(process.env.FILEJAM_OPERATION_BENCH_ENTRIES ?? 10000)
assert.ok(Number.isSafeInteger(count) && count > 0 && count <= 100000)
const root = await mkdtemp(join(tmpdir(), 'filejam-operation-bench-'))
const source = join(root, 'source')
const destination = join(root, 'destination')
const service = new OperationService(join(root, 'journal'))
const browser = new BrowserClient(
  fileURLToPath(
    new URL(
      `../../../packages/fs-service/target/release/filejam-fs-service${process.platform === 'win32' ? '.exe' : ''}`,
      import.meta.url,
    ),
  ),
)
const loop = monitorEventLoopDelay({ resolution: 10 })

async function listing() {
  const started = performance.now()

  await new Promise((resolve, reject) => {
    const id = browser.list(
      source,
      { kind: 'all', nameContains: '', sortDirection: 'asc' },
      (event) => {
        if (event.type === 'listing' || event.type === 'batch') {
          browser.next(id)
        } else if (event.type === 'done') {
          resolve()
        } else if (event.type === 'error') {
          reject(new Error(JSON.stringify(event)))
        }
      },
    )
  })

  return performance.now() - started
}

try {
  await mkdir(source)
  await mkdir(destination)

  for (let offset = 0; offset < count; offset += 32) {
    await Promise.all(
      Array.from({ length: Math.min(32, count - offset) }, (_, index) =>
        writeFile(join(source, `file-${offset + index}.txt`), 'benchmark'),
      ),
    )
  }

  await browser.start()
  const baselineMs = await listing()
  loop.enable()
  const started = performance.now()
  await service.start({ kind: 'copy', paths: [source], destination })
  let finished = false
  const copying = service.pending.finally(() => {
    finished = true
  })
  const browsing = []

  while (!finished) {
    browsing.push(await listing())
    await delay(100)
  }

  await copying
  const copyMs = performance.now() - started
  assert.equal((await service.list())[0].status, 'completed')
  const moveStarted = performance.now()
  await service.start({
    kind: 'rename',
    paths: [join(destination, 'source')],
    name: 'renamed',
  })
  await service.pending
  const renameMs = performance.now() - moveStarted
  const selectionTarget = join(root, 'selection')
  await mkdir(selectionTarget)
  const selectionStarted = performance.now()
  const selectionCount = Math.min(count, 1000)
  await service.start({
    kind: 'copy',
    paths: Array.from({ length: selectionCount }, (_, index) =>
      join(source, `file-${index}.txt`),
    ),
    destination: selectionTarget,
  })
  await service.pending
  assert.equal((await service.list())[0].status, 'completed')
  browsing.sort((a, b) => a - b)
  console.log(
    JSON.stringify(
      {
        count,
        copyMs: Math.round(copyMs),
        renameMs: Math.round(renameMs),
        selectionCount,
        selectionMs: Math.round(performance.now() - selectionStarted),
        baselineListingMs: Math.round(baselineMs),
        concurrentListingSamples: browsing.length,
        concurrentListingP95Ms: Math.round(
          browsing[Math.floor(browsing.length * 0.95)] ?? 0,
        ),
        maxEventLoopDelayMs: Math.round(loop.max / 1e6),
        rssMB: Math.round(process.memoryUsage().rss / 1024 / 1024),
      },
      null,
      2,
    ),
  )
} finally {
  loop.disable()
  await service.close()
  await browser.close()
  await rm(root, { recursive: true, force: true })
}
