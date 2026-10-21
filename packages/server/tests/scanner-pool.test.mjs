import { execFile } from 'node:child_process'
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import test from 'node:test'
import { promisify } from 'node:util'

const exec = promisify(execFile)
const scannerUrl = new URL('../dist/scanner/index.js', import.meta.url).href
const clientUrl = new URL('../dist/scanner/client.js', import.meta.url).href

// Run native SQLite work in a child so Windows releases all handles before cleanup.
async function child(source, flags = []) {
  const directory = await mkdtemp(join(tmpdir(), 'files-pool-child-'))
  const script = join(directory, 'test.mjs')

  try {
    await writeFile(script, source)

    return await exec(process.execPath, [...flags, script], {
      timeout: 60000,
      maxBuffer: 1024 * 1024,
    })
  } finally {
    await rm(directory, { recursive: true, force: true })
  }
}

test('pool schedules bounded concurrent jobs, coalesces aliases and refreshes, replaces crashed workers, and closes all workers', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'files-pool-scheduler-'))

  try {
    const roots = await Promise.all(
      ['a', 'b', 'c'].map(async (name) => {
        const root = join(directory, name)

        await mkdir(root)

        return root
      }),
    )

    await child(
      `
      import assert from 'node:assert/strict'
      import { mock } from 'node:test'
      import { realpath } from 'node:fs/promises'
      import { join } from 'node:path'
      const roots = await Promise.all(${JSON.stringify(roots)}.map(root => realpath(root)))
      const workers = []
      const starts = []
      let failInitialize = false
      class FakeWorker {
        closed = false
        listeners = []
        constructor(_cache, _db, onFailure) { this.onFailure = onFailure; workers.push(this) }
        async initialize() { if (failInitialize) throw new Error('initialization failed') }
        onUpdated(listener) { this.listeners.push(listener) }
        async start(root) {
          assert.ok(!workers.some(worker => worker !== this && worker.status?.root === root && worker.status.state === 'scanning'))
          this.status = { state: 'scanning', root, phase: 'checking', processed: 0, total: 1, error: null }
          starts.push(root)
          this.emit()
          return this.status
        }
        emit() { for (const listener of this.listeners) listener({ type: 'progress', status: this.status, elapsedMs: 0, entriesPerSecond: 0, changes: { added: 0, changed: 0, removed: 0 } }) }
        finish(state = 'completed') { this.status = { ...this.status, state, phase: 'idle', processed: 1 }; this.emit() }
        async results() { return { added: ['file.txt'], changed: [], removed: [] } }
        async cancel() { this.finish('cancelled'); return this.status }
        async close() { this.closed = true }
        crash() { this.onFailure(new Error('test crash')) }
      }
      mock.module(${JSON.stringify(clientUrl)}, { namedExports: { ScannerWorker: FakeWorker } })
      const { FileScanner } = await import(${JSON.stringify(scannerUrl)})
      assert.throws(() => new FileScanner('cache', 'db', { maxConcurrentScans: 0 }), /positive integer/)
      const defaultScanner = new FileScanner('cache', 'db')
      assert.equal(defaultScanner.maxConcurrentScans, 1)
      await defaultScanner.close()
      const scanner = new FileScanner('cache', 'db', { maxConcurrentScans: 2 })
      await assert.rejects(scanner.startAll([roots[0], '']), /root is required/)
      assert.equal((await scanner.status()).state, 'idle')
      await scanner.startAll([...roots, join(roots[0], '..', 'a')])
      let status = await scanner.status()
      assert.equal(status.active.length, 2)
      assert.equal(status.queued.length, 1)
      assert.equal(status.libraries.length, 3)
      assert.equal(starts.length, 2)
      await assert.rejects(scanner.start(join(roots[0], '..', 'a')), /already running/)
      scanner.enqueue(roots[0]); scanner.enqueue(join(roots[0], '..', 'a'))
      status = await scanner.status()
      assert.equal(status.queued.filter(root => root === roots[0]).length, 1)
      workers[0].finish()
      status = await scanner.status()
      assert.equal(status.state, 'scanning')
      assert.equal(status.active.length, 2)
      assert.equal(starts[2], roots[2]) // FIFO: c precedes a's refresh.
      workers[1].finish()
      status = await scanner.status()
      assert.equal(starts[3], roots[0])
      assert.equal(starts.filter(root => root === roots[0]).length, 2)
      workers[0].crash()
      status = await scanner.status()
      assert.equal(status.libraries.find(s => s.root === roots[2]).state, 'failed')
      assert.equal(workers[0].closed, true)
      scanner.enqueue(roots[2])
      status = await scanner.status()
      assert.equal(workers.length, 3)
      assert.equal(status.active.length, 2)
      scanner.enqueue(roots[1])
      await scanner.status()
      await scanner.cancel()
      status = await scanner.status()
      assert.equal(status.state, 'cancelled')
      assert.equal(status.active.length, 0)
      assert.equal(status.queued.length, 0)
      const count = starts.length
      await Promise.all([scanner.close(), scanner.close()])
      scanner.enqueue(roots[0])
      assert.equal(starts.length, count)
      assert.ok(workers.every(worker => worker.closed))
      await assert.rejects(scanner.status(), /closed/)
      const activeClose = new FileScanner('cache', 'db')
      await activeClose.startAll(roots)
      await activeClose.close()
      assert.ok(workers.every(worker => worker.closed))
      failInitialize = true
      const failed = new FileScanner('cache', 'db')
      await assert.rejects(failed.status(), /initialization failed/)
      await failed.close()
      assert.ok(workers.every(worker => worker.closed))
    `,
      ['--experimental-test-module-mocks'],
    )
  } finally {
    await rm(directory, { recursive: true, force: true })
  }
})

test('real workers index and reconcile concurrent libraries with isolated caches and results', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'files-pool-persistence-'))

  try {
    const roots = [
      join(directory, 'a'),
      join(directory, 'b'),
      join(directory, 'c'),
    ]

    for (const root of roots) {
      await mkdir(root)

      await Promise.all(
        Array.from({ length: 130 }, (_, i) =>
          writeFile(join(root, `${i}.txt`), root),
        ),
      )
    }

    await child(`
      import assert from 'node:assert/strict'
      import { setTimeout } from 'node:timers/promises'
      import { realpath, readFile, rm, writeFile } from 'node:fs/promises'
      import { join } from 'node:path'
      import { FileScanner } from ${JSON.stringify(scannerUrl)}
      import { initDatabase } from ${JSON.stringify(new URL('../dist/db/index.js', import.meta.url).href)}
      import { createApi } from ${JSON.stringify(new URL('../dist/api/index.js', import.meta.url).href)}
      const directory = ${JSON.stringify(directory)}
      const roots = await Promise.all(${JSON.stringify(roots)}.map(root => realpath(root)))
      const { initLogger, closeLogger } = await import(${JSON.stringify(new URL('../dist/logger.js', import.meta.url).href)})
      await initLogger({ get: key => ({ 'appdata.logsPath': join(directory, 'logs'), 'log.level': 'info', 'log.retentionDays': 1 })[key] })
      const databasePath = join(directory, 'files.sqlite')
      const scanner = new FileScanner(join(directory, 'cache'), databasePath, { maxConcurrentScans: 2 })
      let overlap = false
      scanner.onUpdated(() => { void scanner.status().then(s => { if (s.active.length === 2) overlap = true }).catch(() => {}) })
      async function finish() {
        for (let i = 0; i < 2000; i++) {
          const status = await scanner.status()
          assert.ok(status.active.length <= 2)
          if (status.state !== 'scanning') return status
          await setTimeout(10)
        }
        throw new Error('Pool timed out')
      }
      try {
        await scanner.startAll(roots)
        assert.equal((await finish()).state, 'completed')
        assert.ok(overlap)
        for (const root of roots) assert.equal((await scanner.results(root)).added.length, 130)
        await rm(join(roots[0], '0.txt'))
        await writeFile(join(roots[1], '0.txt'), 'changed file size')
        await scanner.startAll([join(directory, 'missing'), ...roots])
        const status = await finish()
        assert.equal(status.state, 'failed')
        assert.equal(status.libraries.filter(s => s.state === 'completed').length, 3)
        assert.deepEqual((await scanner.results(roots[0])).removed, ['0.txt'])
        assert.deepEqual((await scanner.results(roots[1])).changed, ['0.txt'])
        assert.deepEqual(await scanner.results(roots[2]), { added: [], changed: [], removed: [] })
        const connection = await initDatabase(databasePath)
        try {
          const api = createApi(connection.db)
          for (const library of await api.libraries.list()) {
            const listing = await api.entries.listChildren({ libraryId: library.id, relativePath: '' })
            assert.equal(listing.entries.length, library.rootPath === roots[0] ? 129 : 130)
            assert.equal(listing.scanned, true)
          }
        } finally { connection.close() }
      } finally { await scanner.close(); await closeLogger() }
      const logs = (await readFile(join(directory, 'logs', 'current.jsonl'), 'utf8')).trim().split('\\n').map(line => JSON.parse(line)).filter(log => log.component === 'scanner')
      const completed = logs.filter(log => log.msg === 'Scan completed')
      assert.equal(completed.length, 1)
      assert.equal(completed[0].processed, 393)
      assert.equal(completed[0].total, 393)
      assert.equal(completed[0].added, 390)
      assert.equal(completed[0].completedLibraries, 3)
      assert.equal(completed[0].activeLibraries, 0)
      assert.ok(logs.every(log => !('root' in log)))
      const failed = logs.find(log => log.msg === 'Scan failed')
      assert.equal(failed.completedLibraries, 3)
      assert.equal(failed.failedLibraries, 1)
      assert.equal(failed.errors.length, 1)
    `)
  } finally {
    await rm(directory, { recursive: true, force: true })
  }
})
