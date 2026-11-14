import { execFile } from 'node:child_process'
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import test from 'node:test'
import { promisify } from 'node:util'

const exec = promisify(execFile)
const moduleUrl = (path) => JSON.stringify(new URL(path, import.meta.url).href)

async function inDatabaseProcess(directory, source) {
  // A separate process releases native SQLite handles before Windows cleanup.
  await exec(
    process.execPath,
    [
      '--input-type=module',
      '-e',
      `
        import assert from 'node:assert/strict'
        import { join } from 'node:path'
        import { lstat, rm } from 'node:fs/promises'
        import { createApi } from ${moduleUrl('../dist/api/index.js')}
        import { initDatabase } from ${moduleUrl('../dist/db/index.js')}
        import { entries } from ${moduleUrl('../dist/db/schemas/entry.js')}
        import { openScanDatabase } from ${moduleUrl('../dist/scanner/persistence.js')}
        const directory = ${JSON.stringify(directory)}
        const root = join(directory, 'root')
        const databasePath = join(directory, 'filejam.sqlite')
        const entryPath = entry =>
          entry.parentId === null && entry.kind === 'directory'
            ? ''
            : entry.parentPath
              ? entry.parentPath + '/' + entry.name
              : entry.name
        ${source}
      `,
    ],
    { timeout: 30000, windowsHide: true },
  )
}

test('watchers ignore preview reads and access metadata but detect file edits', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'scanner-watch-'))
  const root = join(directory, 'root')

  await mkdir(root)
  await writeFile(join(root, 'preview.txt'), 'preview')

  try {
    await inDatabaseProcess(
      directory,
      `
      const { readFile, utimes, writeFile } = await import('node:fs/promises')
      const { setTimeout: delay } = await import('node:timers/promises')
      const { hasIndexedPathChanged } = await import(${moduleUrl('../dist/scanner/changes.js')})
      const { watchLibraries } = await import(${moduleUrl('../dist/scanner/watch.js')})
      const scan = await openScanDatabase(databasePath, root)
      const connection = await initDatabase(databasePath)
      const file = join(root, 'preview.txt')
      const enqueued = []
      let stopWatching

      try {
        await scan.saveBatch([root, file])
        assert.equal(await hasIndexedPathChanged(connection.db, root, 'preview.txt'), false)
        stopWatching = watchLibraries(
          [root],
          { enqueue: (root) => enqueued.push(root) },
          [],
          (message, error) => { throw error },
          connection.db,
        )

        const metadata = await lstat(file)
        await readFile(file)
        await utimes(file, new Date(), metadata.mtime)
        assert.equal(await hasIndexedPathChanged(connection.db, root, 'preview.txt'), false)
        await delay(350)
        assert.deepEqual(enqueued, [])

        await writeFile(file, 'edited preview contents')
        assert.equal(await hasIndexedPathChanged(connection.db, root, 'preview.txt'), true)

        for (let attempt = 0; attempt < 100 && !enqueued.length; attempt++) {
          await delay(10)
        }

        assert.deepEqual(enqueued, [root])
        assert.equal(await hasIndexedPathChanged(connection.db, root, 'new.txt'), true)
      } finally {
        stopWatching?.()
        connection.close()
        scan.close()
      }
      `,
    )
  } finally {
    await rm(directory, {
      recursive: true,
      force: true,
      maxRetries: 10,
      retryDelay: 100,
    })
  }
})

test('scan batches roll back parents and bookkeeping, preserve IDs, and respect cancellation', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'scanner-batch-'))
  const root = join(directory, 'root')

  await mkdir(join(root, 'nested'), { recursive: true })
  await mkdir(join(root, 'missing'))
  await writeFile(join(root, 'nested', 'file.txt'), 'hello')
  await writeFile(join(root, 'missing', 'orphan.txt'), 'hello')

  try {
    await inDatabaseProcess(
      directory,
      `
      const scan = await openScanDatabase(databasePath, root)
      const connection = await initDatabase(databasePath)
      try {
        const nested = join(root, 'nested')
        const file = join(nested, 'file.txt')
        const orphan = join(root, 'missing', 'orphan.txt')
        await assert.rejects(scan.saveBatch([root, nested, orphan]), /Missing parent directory/)
        assert.deepEqual(await connection.db.select().from(entries), [])
        // A rolled-back parent must not leak into the next batch's ID map.
        await assert.rejects(scan.saveBatch([nested]), /Missing parent directory/)
        assert.equal(scan.skipUnchanged(file, await lstat(file)), false)

        let checks = 0
        assert.deepEqual(await scan.saveBatch([root], undefined, () => ++checks === 2), [])
        assert.deepEqual(await connection.db.select().from(entries), [])

        const saved = await scan.saveBatch([root, nested, file])
        assert.deepEqual(saved.map(entry => entry.kind), ['directory', 'directory', 'file'])
        let rows = await connection.db.select().from(entries)
        const rootRow = rows.find(row => entryPath(row) === '')
        const parent = rows.find(row => entryPath(row) === 'nested')
        const original = rows.find(row => entryPath(row) === 'nested/file.txt')
        assert.equal(parent.parentId, rootRow.id)
        assert.equal(original.parentId, parent.id)
        await scan.saveBatch([file])
        rows = await connection.db.select().from(entries)
        const updated = rows.find(row => entryPath(row) === 'nested/file.txt')
        assert.equal(updated.id, original.id)
        await scan.complete()
        rows = await connection.db.select().from(entries)
        assert.equal(rows.find(row => row.id === parent.id).childrenDirty, false)
      } finally {
        await scan.close()
        connection.close()
      }
    `,
    )
  } finally {
    await rm(directory, { recursive: true, force: true })
  }
})

test('deletion batches handle multiple chunks and stay within the selected volume', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'scanner-delete-batch-'))

  try {
    await inDatabaseProcess(
      directory,
      `
      const connection = await initDatabase(databasePath)
      try {
        const api = createApi(connection.db)
        const volume = await api.volumes.ensure(root)
        const other = await api.volumes.ensure(join(directory, 'other'))
        const values = Array.from({ length: 1101 }, (_, index) => ({
          volumeId: index === 1100 ? other.id : volume.id,
          parentPath: '',
          name: String(index),
          kind: 'file',
          indexedAt: new Date(),
          createdAt: new Date(),
        }))
        for (let index = 0; index < values.length; index += 100)
          await connection.db.insert(entries).values(values.slice(index, index + 100))
        const rows = await connection.db.select().from(entries)
        function* ids() { for (const row of rows) yield row.id }
        await api.entries.completeScan(volume.id, ids())
        const remaining = await connection.db.select().from(entries)
        assert.equal(remaining.length, 1)
        assert.equal(remaining[0].volumeId, other.id)
        await api.entries.completeScan(other.id, [])
        assert.equal((await connection.db.select().from(entries)).length, 1)
      } finally {
        connection.close()
      }
    `,
    )
  } finally {
    await rm(directory, { recursive: true, force: true })
  }
})

test('large saves commit bounded batches and retain earlier batches after a later rollback', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'scanner-bounded-batch-'))
  const root = join(directory, 'root')

  await mkdir(join(root, 'missing'), { recursive: true })

  await Promise.all(
    Array.from({ length: 70 }, (_, index) =>
      writeFile(join(root, `${index}.txt`), 'hello'),
    ),
  )

  await writeFile(join(root, 'missing', 'orphan.txt'), 'hello')

  try {
    await inDatabaseProcess(
      directory,
      `
      const scan = await openScanDatabase(databasePath, root)
      const connection = await initDatabase(databasePath)
      try {
        const paths = [root, ...Array.from({ length: 70 }, (_, index) => join(root, index + '.txt'))]
        const orphan = join(root, 'missing', 'orphan.txt')
        await assert.rejects(scan.saveBatch([...paths, orphan]), /Missing parent directory/)
        // The first 64 entries committed; the second transaction rolled back.
        let rows = await connection.db.select().from(entries)
        assert.equal(rows.length, 64)
        assert.equal(scan.skipUnchanged(paths[64], await lstat(paths[64])), false)
        await scan.saveBatch(paths.slice(64))
        rows = await connection.db.select().from(entries)
        assert.equal(rows.length, 71)
        const rootRow = rows.find(row => entryPath(row) === '')
        assert.ok(rows.filter(row => row.kind === 'file').every(row => row.parentId === rootRow.id))
      } finally {
        await scan.close()
        connection.close()
      }
    `,
    )
  } finally {
    await rm(directory, { recursive: true, force: true })
  }
})

test('incremental deletion removes only journal-reported paths', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'scanner-incremental-'))
  const root = join(directory, 'root')
  const first = join(root, 'first.txt')
  const second = join(root, 'second.txt')

  await mkdir(root, { recursive: true })
  await writeFile(first, 'first')
  await writeFile(second, 'second')

  try {
    await inDatabaseProcess(
      directory,
      `
      let scan = await openScanDatabase(databasePath, root)
      await scan.saveBatch([root, ${JSON.stringify(first)}, ${JSON.stringify(second)}])
      await scan.complete()
      await scan.close()

      await rm(${JSON.stringify(first)})
      scan = await openScanDatabase(databasePath, root)
      const removed = await scan.removePaths([${JSON.stringify(first)}], true)
      assert.equal(removed.removedCount, 1)
      assert.deepEqual(removed.removedPaths, ['first.txt'])

      const connection = await initDatabase(databasePath)
      try {
        const rows = await connection.db.select().from(entries)
        assert.equal(rows.some(row => entryPath(row) === 'first.txt'), false)
        assert.equal(rows.some(row => entryPath(row) === 'second.txt'), true)
      } finally {
        connection.close()
        await scan.close()
      }
    `,
    )
  } finally {
    await rm(directory, { recursive: true, force: true })
  }
})
