import assert from 'node:assert/strict'
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import test from 'node:test'
import { setTimeout } from 'node:timers/promises'
import { initDatabase } from '../dist/db/index.js'
import { entries } from '../dist/db/schemas/entry.js'
import { FileScanner } from '../dist/scanner/index.js'

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
