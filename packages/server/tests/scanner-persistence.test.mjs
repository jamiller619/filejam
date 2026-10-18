import assert from 'node:assert/strict'
import { mkdir, mkdtemp, rm, stat, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import test from 'node:test'
import { setTimeout } from 'node:timers/promises'
import { Worker } from 'node:worker_threads'
import { initDatabase } from '../dist/db/index.js'
import { entries } from '../dist/db/schemas/entry.js'
import { FileScanner } from '../dist/scanner/index.js'

test('reads each entry metadata once on initial, unchanged, and changed scans', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'scanner-metadata-'))
  const root = join(dir, 'root')
  const nested = join(root, 'nested')
  const file = join(nested, 'file.txt')
  await mkdir(nested, { recursive: true })
  await writeFile(file, 'hello')
  // Instrument real filesystem calls inside the scanner worker, including the
  // synchronous stat used by file-entry-cache, rather than mocking scan logic.
  const worker = new Worker(
    new URL(
      `data:text/javascript,${encodeURIComponent(`
    import fs from 'node:fs'
    import promises from 'node:fs/promises'
    import { syncBuiltinESMExports } from 'node:module'
    import { parentPort, workerData } from 'node:worker_threads'
    const counts = Object.fromEntries(workerData.paths.map(path => [path, 0]))
    const count = path => { if (Object.hasOwn(counts, path)) counts[path]++ }
    const lstat = promises.lstat
    promises.lstat = (path, ...args) => { count(path); return lstat(path, ...args) }
    const stat = fs.statSync
    fs.statSync = (path, ...args) => { count(path); return stat(path, ...args) }
    syncBuiltinESMExports()
    const post = parentPort.postMessage.bind(parentPort)
    parentPort.postMessage = message => post({ ...message, counts: { ...counts } })
    await import(${JSON.stringify(new URL('../dist/scanner/worker.js', import.meta.url).href)})
  `)}`,
    ),
    {
      workerData: {
        cacheDirectory: join(dir, 'cache'),
        databasePath: join(dir, 'files.sqlite'),
        paths: [root, nested, file],
      },
    },
  )
  try {
    for (let pass = 1; pass <= 3; pass++) {
      if (pass === 3) await writeFile(file, 'changed contents')
      const completed = new Promise((resolve, reject) => {
        const onMessage = (message) => {
          if (
            message.type !== 'progress' ||
            message.status.state === 'scanning'
          )
            return
          worker.off('message', onMessage)
          worker.off('error', reject)
          resolve(message)
        }
        worker.on('message', onMessage)
        worker.once('error', reject)
      })
      worker.postMessage({ id: pass, method: 'start', root })
      const result = await completed
      assert.equal(result.status.state, 'completed', result.status.error ?? '')
      assert.deepEqual(result.counts, {
        [root]: pass,
        [nested]: pass,
        [file]: pass,
      })
      assert.equal(result.changes.added, pass === 1 ? 1 : 0)
      assert.equal(result.changes.changed, pass === 3 ? 1 : 0)
    }
  } finally {
    await worker.terminate()
    await rm(dir, { recursive: true, force: true })
  }
})

async function finish(scanner) {
  for (let i = 0; i < 1000; i++) {
    const status = await scanner.status()
    if (status.state !== 'scanning') {
      assert.equal(status.state, 'completed', status.error ?? '')
      return
    }
    await setTimeout(10)
  }
  throw new Error('Scan timed out')
}

test('persists parents and metadata incrementally, repairs cache hits, and removes stale rows', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'scanner-db-'))
  const root = join(dir, 'root')
  const databasePath = join(dir, 'files.sqlite')
  await mkdir(join(root, 'nested'), { recursive: true })
  await mkdir(join(root, 'empty'))
  await Promise.all(
    Array.from({ length: 300 }, (_, i) =>
      writeFile(join(root, 'nested', `${i}.txt`), 'hello'),
    ),
  )
  const connection = await initDatabase(databasePath)
  const scanner = new FileScanner(join(dir, 'cache'), databasePath)
  try {
    await scanner.start(root)
    let observedPartial = false
    for (let i = 0; i < 1000; i++) {
      const status = await scanner.status()
      if (status.state !== 'scanning') break
      const rows = await connection.db.select().from(entries)
      if (rows.length > 0 && rows.length < 303) observedPartial = true
      await setTimeout(5)
    }
    await finish(scanner)
    assert.equal(observedPartial, true)
    let rows = await connection.db.select().from(entries)
    assert.equal(rows.length, 303)
    const parent = rows.find((row) => row.relativePath === 'nested')
    const file = rows.find((row) => row.relativePath === 'nested/0.txt')
    assert.equal(file.parentId, parent.id)
    assert.equal(file.size, 5)
    const metadata = await stat(join(root, 'nested', '0.txt'))
    assert.equal(file.modifiedAt.getTime(), metadata.mtime.getTime())
    assert.equal(parent.childrenDirty, false)
    assert.ok(parent.childrenScannedAt)
    await connection.db.delete(entries)
    await scanner.start(root)
    await finish(scanner)
    assert.equal((await connection.db.select().from(entries)).length, 303)
    assert.deepEqual(await scanner.results(), {
      added: [],
      changed: [],
      removed: [],
    })
    await rm(join(root, 'nested'), { recursive: true })
    await scanner.start(root)
    await finish(scanner)
    rows = await connection.db.select().from(entries)
    assert.deepEqual(rows.map((row) => row.relativePath).sort(), ['', 'empty'])
  } finally {
    await scanner.close()
    connection.close()
    await rm(dir, { recursive: true, force: true })
  }
})
