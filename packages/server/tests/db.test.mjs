import assert from 'node:assert/strict'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import test from 'node:test'
import { entries } from '../dist/db/schemas/entry.js'
import { libraries } from '../dist/db/schemas/library.js'
import { initDatabase } from '../dist/db/index.js'

test('creates a database, preserves data on reopen, and enforces constraints', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'files-db-'))
  const path = join(directory, 'nested', 'files #1.sqlite')
  let connection

  try {
    connection = await initDatabase(path)
    const { db } = connection
    await db
      .insert(libraries)
      .values({ id: 1, name: 'Files', rootPath: '/files' })
    const entry = {
      libraryId: 1,
      name: 'example.txt',
      relativePath: 'example.txt',
      kind: 'file',
      indexedAt: new Date(),
    }
    await db.insert(entries).values(entry)
    await assert.rejects(db.insert(entries).values(entry).run())
    await assert.rejects(
      db
        .insert(entries)
        .values({ ...entry, libraryId: 999 })
        .run(),
    )
    connection.close()

    connection = await initDatabase(path)
    assert.equal((await connection.db.select().from(libraries)).length, 1)
    assert.equal((await connection.db.select().from(entries)).length, 1)
    const migrations = await connection.db.all(
      'SELECT * FROM __drizzle_migrations',
    )
    assert.equal(migrations.length, 1)
    await connection.db.delete(libraries)
    assert.deepEqual(await connection.db.select().from(entries), [])
  } finally {
    connection?.close()
    await rm(directory, { recursive: true, force: true })
  }
})

test('rejects an empty database path', async () => {
  await assert.rejects(initDatabase('  '), /database file path is required/)
})
